#!/usr/bin/env python3

import argparse
import struct
from pathlib import Path


RT_ICON = 3
RT_GROUP_ICON = 14
LANG_NEUTRAL = 0


def u16(data, offset):
    return struct.unpack_from("<H", data, offset)[0]


def u32(data, offset):
    return struct.unpack_from("<I", data, offset)[0]


def rva_to_offset(data, rva):
    pe_offset = u32(data, 0x3C)
    section_count = u16(data, pe_offset + 6)
    optional_header_offset = pe_offset + 24
    optional_header_size = u16(data, pe_offset + 20)
    section_offset = optional_header_offset + optional_header_size

    for index in range(section_count):
        offset = section_offset + index * 40
        virtual_size = u32(data, offset + 8)
        virtual_address = u32(data, offset + 12)
        raw_size = u32(data, offset + 16)
        raw_offset = u32(data, offset + 20)
        if virtual_address <= rva < virtual_address + max(virtual_size, raw_size):
            return raw_offset + rva - virtual_address

    raise ValueError(f"RVA 0x{rva:x} is not in a PE section")


def resource_entries(data, directory_offset):
    count = u16(data, directory_offset + 12) + u16(data, directory_offset + 14)
    return [
        (u32(data, directory_offset + 16 + index * 8), u32(data, directory_offset + 20 + index * 8))
        for index in range(count)
    ]


def child_resource_offset(data, resource_offset, directory_offset, resource_id):
    for entry_id, entry_offset in resource_entries(data, directory_offset):
        if entry_id == resource_id:
            if not entry_offset & 0x80000000:
                raise ValueError(f"resource {resource_id} is not a directory")
            return resource_offset + (entry_offset & 0x7FFFFFFF)
    raise ValueError(f"resource {resource_id} was not found")


def resource_leaf(data, resource_offset, resource_type, resource_id):
    type_directory = child_resource_offset(data, resource_offset, resource_offset, resource_type)
    id_directory = child_resource_offset(data, resource_offset, type_directory, resource_id)
    entries = resource_entries(data, id_directory)
    if not entries:
        raise ValueError(f"resource {resource_type}/{resource_id} has no language entries")

    _, entry_offset = next(
        (entry for entry in entries if entry[0] == LANG_NEUTRAL), entries[0]
    )
    if entry_offset & 0x80000000:
        raise ValueError(f"resource {resource_type}/{resource_id} has no data entry")

    data_entry_offset = resource_offset + entry_offset
    data_rva = u32(data, data_entry_offset)
    return data_entry_offset, rva_to_offset(data, data_rva)


def resource_section(data):
    pe_offset = u32(data, 0x3C)
    optional_header_offset = pe_offset + 24
    magic = u16(data, optional_header_offset)
    data_directory_offset = optional_header_offset + (96 if magic == 0x10B else 112)
    resource_rva = u32(data, data_directory_offset + 8 * 2)
    if not resource_rva:
        raise ValueError("PE file has no resource section")
    return resource_rva, rva_to_offset(data, resource_rva)


def read_ico(path):
    data = Path(path).read_bytes()
    if len(data) < 6 or u16(data, 0) != 0 or u16(data, 2) != 1:
        raise ValueError(f"{path} is not an icon file")

    count = u16(data, 4)
    if count != 4:
        raise ValueError(f"{path} must contain exactly 16, 32, 48, and 256 pixel icons")

    images = []
    for index in range(count):
        offset = 6 + index * 16
        width, height, colors, reserved, planes, bits, size, image_offset = struct.unpack_from(
            "<BBBBHHII", data, offset
        )
        image = data[image_offset : image_offset + size]
        if len(image) != size:
            raise ValueError(f"{path} contains a truncated icon image")
        images.append((width, height, colors, reserved, planes, bits, image))

    sizes = {width or 256 for width, *_ in images}
    if sizes != {16, 32, 48, 256}:
        raise ValueError(f"{path} must contain 16, 32, 48, and 256 pixel icons")
    return images


def replace_icon(input_path, output_path, icon_path):
    icon_images = read_ico(icon_path)
    source = bytearray(Path(input_path).read_bytes())
    _, resource_offset = resource_section(source)
    group_entry_offset, group_offset = resource_leaf(
        source, resource_offset, RT_GROUP_ICON, 1
    )
    group_size = u32(source, group_entry_offset + 4)
    group = source[group_offset : group_offset + group_size]
    if len(group) < 6 or u16(group, 0) != 0 or u16(group, 2) != 1:
        raise ValueError("SFX executable does not contain a valid primary icon group")

    group_count = u16(group, 4)
    if group_count != len(icon_images):
        raise ValueError("SFX executable and replacement icon have different image counts")

    replacement_by_size = {image[0] or 256: image for image in icon_images}
    replacement_group = bytearray(struct.pack("<HHH", 0, 1, group_count))

    for index in range(group_count):
        entry_offset = 6 + index * 14
        icon_id = u16(group, entry_offset + 12)
        width = group[entry_offset] or 256
        image = replacement_by_size.get(width)
        if image is None:
            raise ValueError(f"replacement icon has no {width}px image")

        image_entry_offset, image_offset = resource_leaf(
            source, resource_offset, RT_ICON, icon_id
        )
        image_data = image[6]
        original_size = u32(source, image_entry_offset + 4)
        if len(image_data) > original_size:
            raise ValueError(
                f"replacement {width}px image ({len(image_data)} bytes) exceeds "
                f"the SFX resource capacity ({original_size} bytes)"
            )

        source[image_offset : image_offset + original_size] = b"\0" * original_size
        source[image_offset : image_offset + len(image_data)] = image_data
        struct.pack_into("<I", source, image_entry_offset + 4, len(image_data))
        replacement_group.extend(
            struct.pack(
                "<BBBBHHIH",
                image[0],
                image[1],
                image[2],
                image[3],
                image[4],
                image[5],
                len(image_data),
                icon_id,
            )
        )

    if len(replacement_group) != group_size:
        raise ValueError("replacement icon group has an unexpected size")
    source[group_offset : group_offset + group_size] = replacement_group
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_bytes(source)


def main():
    parser = argparse.ArgumentParser(
        description="Replace the primary icon in a Firefox 7z SFX executable."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--icon", required=True, type=Path)
    args = parser.parse_args()
    replace_icon(args.input, args.output, args.icon)


if __name__ == "__main__":
    main()

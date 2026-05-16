/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Parses Chrome CRX2 / CRX3 packages and exposes the inner ZIP payload.
 *
 * CRX layout:
 *   [magic "Cr24"] [version u32 LE] [variable header...] [zip payload]
 *
 *   CRX2 header (legacy):
 *     [public_key_len u32 LE] [signature_len u32 LE] [pubkey] [sig]
 *
 *   CRX3 header:
 *     [header_len u32 LE] [protobuf-encoded CrxFileHeader]
 *
 * We deliberately do not verify the embedded signature — the add-on
 * confirmation prompt is the user's trust boundary.
 */

const MAGIC = [0x43, 0x72, 0x32, 0x34]; // "Cr24"

/**
 * @param {Uint8Array} bytes Raw CRX file contents.
 * @returns {{ version: number, zip: Uint8Array }}
 *   The inner ZIP payload (an .xpi-compatible archive).
 */
export function parseCRX(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("parseCRX expects a Uint8Array");
  }
  if (bytes.length < 16) {
    throw new Error("CRX too short");
  }
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error("Not a CRX file (missing Cr24 magic)");
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, /* littleEndian */ true);

  let zipOffset;
  if (version === 2) {
    const pubkeyLen = view.getUint32(8, true);
    const sigLen = view.getUint32(12, true);
    zipOffset = 16 + pubkeyLen + sigLen;
  } else if (version === 3) {
    const headerLen = view.getUint32(8, true);
    zipOffset = 12 + headerLen;
  } else {
    throw new Error(`Unsupported CRX version ${version}`);
  }

  if (zipOffset >= bytes.length) {
    throw new Error("CRX zip offset out of bounds");
  }

  return {
    version,
    zip: bytes.subarray(zipOffset),
  };
}

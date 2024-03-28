import { ObjMetadata } from "../defines.js";
import * as fs from "fs/promises";
import path from "path";

export async function processImport2TSFromFile(
	src: string,
	fileName: string,
	objMetadata: ObjMetadata,
): Promise<{ [x: string]: string[] }> {
	const unresolved_types = src
		.split("\n")
		.filter((v) => {
			return v.includes("///UNRESOLVED_TYPES");
		})
		.map((v) => {
			return JSON.parse(v.replace("///UNRESOLVED_TYPES ", ""));
		})[0] as string[];

	const resolved_types: string[] = [];

	const imports = objMetadata.get(fileName)!.imports;

	const ret_import: { [x: string]: string[] } = {};
	for (const i of imports) {
		const _interface = objMetadata.get(i)!.interface;
		const _type = objMetadata.get(i)!.type;
		const _resolved = unresolved_types.filter((v) => {
			return _interface.includes(v) || _type.includes(v);
		});
		ret_import[i] = _resolved;
		resolved_types.push(..._resolved);
	}
	if (unresolved_types.length !== resolved_types.length) {
		const _unresolved = unresolved_types.filter((v) => {
			return !resolved_types.includes(v);
		});
		for (const [idx, elem] of objMetadata.entries()) {
			if (unresolved_types.length === resolved_types.length) {
				break;
			}
			const _resolve = _unresolved.filter((v) => {
				return elem.interface.includes(v) || elem.type.includes(v);
			});
			if (_resolve.length !== 0) {
				ret_import[idx] = _resolve;
			}
		}
	}

	return ret_import;
}

export async function processImport2TSFromObjMetadata(
	objMetadata: ObjMetadata,
) {
	for (const [idx, meta] of objMetadata.entries()) {
		const src = (await fs.readFile(meta.filePath)).toString();
		const imports = await processImport2TSFromFile(src, idx, objMetadata);
		const idx_include = src.indexOf("///INCLUDE");
		const src_no_include = src.replaceAll(/\/\/\/INCLUDE.*\n/g, "");
		let ret_imports = "";
		for (const [idx_import, [..._import]] of Object.entries(imports)) {
			if (_import.length !== 0) {
				ret_imports += `import type {${_import.join(",")}} from "${`./${path
					.relative(
						meta.filePath.replace("\\", "/").split("/").slice(0, -1).join("/"),
						objMetadata.get(idx_import)!.filePath,
					)
					.replace(/\\/g, "/")}`}"\n`;
			}
		}
		await fs.writeFile(
			meta.filePath,
			src_no_include.slice(0, idx_include) +
				ret_imports +
				src_no_include.slice(idx_include),
		);
	}
}

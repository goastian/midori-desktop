import fg from "fast-glob";
import * as fs from "fs/promises";
import { AUTO_GENERATED_COMMENT } from "./defines.js";
import { processLine } from "./funcs.js";
import { resetUnresolvedTypes, getUnresolvedTypes } from "./idltype.js";
import { isEmpty } from "./post-processing/clean_empty_dts.js";
import {
	resetConstants,
	getConstants,
} from "./post-processing/constants2list.js";
import { addConstantsWithMetadata } from "./post-processing/constants2metadata.js";
import { getExportFromDir } from "./post-processing/export2metadata.js";
import { writeComponents } from "./post-processing/gen_components.js";
import { parseIncludeFromDir } from "./post-processing/include2metadata.js";
import { processImport2TSFromObjMetadata } from "./post-processing/metadata2import_dts.js";
import { preprocess } from "./preprocess.js";

export function process(src: string): string {
	resetUnresolvedTypes();
	resetConstants();
	let buf = "";
	let index = 0;
	const obj_export_ident = { type: [], interface: [] };
	while (index < src.length) {
		//* MULTICOMMENT
		if (src.startsWith("/*", index)) {
			const idx_end_multicomment = src.indexOf("*/\n", index);
			if (idx_end_multicomment === -1) {
				buf += src.slice(index);
				break;
			}
			buf += src.slice(index, idx_end_multicomment + 3);
			index = idx_end_multicomment + 3;
		}
		//* SINGLECOMMENT
		else if (src.startsWith("//", index)) {
			const idx_next_newline = src.indexOf("\n", index);
			if (idx_next_newline === -1) {
				buf += src.slice(index);
				break;
			}
			buf += src.slice(index, idx_next_newline + 1);
			index = idx_next_newline + 1;
		}
		//* NORMAL
		else {
			//console.log("NORMAL");
			const idx_next_newline = src.indexOf("\n", index);
			if (idx_next_newline === -1) {
				buf += processLine(src.slice(index), obj_export_ident);
				break;
			}
			buf += processLine(
				src.slice(index, idx_next_newline + 1),
				obj_export_ident,
			);
			index = idx_next_newline + 1;
		}
	}

	buf += `\n///EXPORT ${JSON.stringify(obj_export_ident)}`;
	buf += `\n///UNRESOLVED_TYPES ${JSON.stringify(getUnresolvedTypes())}`;
	buf += `\n///CONSTANTS ${JSON.stringify(getConstants())}`;

	return buf;
}

/**
 * it named because not reads moz.build files
 * but this function is used as not test
 * because this is enough to use
 * @param root firefox root
 * @param dirs dirs to read
 */
export async function processAll4Test(
	root: string,
	dirs: string[],
	dist: string,
) {
	console.log("processing");

	try {
		await fs.access(dist);
		await fs.rmdir(dist, { recursive: true });
	} catch {}

	const files = await fg(
		dirs.map((v) => {
			return `${root}/${v}/**/*.idl`;
		}),
		{ dot: true },
	);

	for (const _file of files) {
		console.log(_file);
		if (_file.includes("cld.idl")) {
			//this is not XPIDL files
			continue;
		}
		if (!_file.includes("node_modules") && !_file.includes("other-licenses")) {
			//console.log(_file);
			//console.log(_file.name);

			const fileName = _file.replace("\\", "/").split("/").slice(-1)[0];
			const realPath = `${_file
				.replace("\\", "/")
				.split("/")
				.slice(0, -1)
				.join("/")}/`;
			const path = realPath.replace(`${root}/`, "");
			console.log(_file);
			const src = (await fs.readFile(_file)).toString();
			const preprocessed = preprocess(src);
			// await fs.mkdir(`dist/pp/${path.replace("../", "")}`, {
			// 	recursive: true,
			// });

			// fs.writeFile(
			// 	`dist/pp/${path}/${fileName.replace(".idl", ".d.ts")}`,
			// 	`${AUTO_GENERATED_COMMENT}\n${preprocessed}`,
			// );
			const processed = process(preprocessed);

			//console.log(path);
			if (!isEmpty(processed)) {
				await fs.mkdir(`${dist}/p/${path.replace("../", "")}`, {
					recursive: true,
				});
				await fs.writeFile(
					`${dist}/p/${path}/${fileName.replace(".idl", ".d.ts")}`,
					`${AUTO_GENERATED_COMMENT}\n${processed}`,
				);
			}
		}
	}
	let objMetadata = await getExportFromDir(`${dist}/p`);
	// await fs.writeFile(
	// 	"./metadata1.json",
	// 	JSON.stringify(Array.from(objMetadata.entries())),
	// );

	objMetadata = await parseIncludeFromDir(`${dist}/p`, objMetadata);
	// await fs.writeFile(
	// 	"./metadata2.json",
	// 	JSON.stringify(Array.from(objMetadata.entries())),
	// );

	objMetadata = await addConstantsWithMetadata(objMetadata);
	// await fs.writeFile(
	// 	"./metadata3.json",
	// 	JSON.stringify(Array.from(objMetadata.entries())),
	// );
	await processImport2TSFromObjMetadata(objMetadata);
	await writeComponents(`${dist}/p/index.d.ts`, objMetadata);
}

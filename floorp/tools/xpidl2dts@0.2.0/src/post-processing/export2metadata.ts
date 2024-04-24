import fg from "fast-glob";
import * as fs from "fs/promises";
import { Metadata, ObjMetadata } from "../defines.js";

export function getExportJSON(src: string): Metadata | undefined {
	if (
		src
			.split("\n")
			.filter((v) => {
				return v.includes("///EXPORT");
			})
			.join("")
			.replace("///EXPORT", "")
			.trim() !== ""
	) {
		return JSON.parse(
			src
				.split("\n")
				.filter((v) => {
					return v.includes("///EXPORT");
				})
				.join("")
				.replace("///EXPORT", "")
				.trim(),
		);
	}
}

export async function getExportFromDir(dir: string): Promise<ObjMetadata> {
	const obj = new Map<string, Metadata>();
	const files = await fg([`${dir}/**/*.d.ts`], { dot: true });
	for (const file of files) {
		const fileName = file.replace("\\", "/").split("/").pop();
		const src = (await fs.readFile(file)).toString();
		const json = getExportJSON(src);
		if (json && fileName) {
			json.filePath = file;
			json.imports = [];

			obj.set(fileName, json);
		}
	}
	return obj;
}

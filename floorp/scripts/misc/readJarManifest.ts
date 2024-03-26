import { ChromeType } from "./objdir.js";
import { parseJarManifest } from "./parser.js";
import * as fs from "fs/promises";

export async function readJarManifests(
	root: string,
	paths: string[],
	isBrowser: boolean,
): Promise<ChromeType[]> {
	const ret = [];
	for (const path of paths) {
		const rpath = `${root}/${path}`;
		//console.log(rpath);
		const file = await fs.readFile(rpath);
		ret.push(
			...parseJarManifest(
				file.toString(),
				path.replace("/jar.mn", ""),
				isBrowser ? "browser/chrome" : "chrome",
			),
		);
	}
	return ret;
}

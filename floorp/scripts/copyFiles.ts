
import { getObjDirs } from "./misc/objdir.js";

import fs from "fs/promises";
import { readJarManifests } from "./misc/readJarManifest.js";

process.chdir(import.meta.dirname);

const root = "../.."

const dirs = await getObjDirs(root);

//* remove profile to force reload
try {
	await fs.access(`${dirs[0]}/tmp`);
	fs.rm(`${dirs[0]}/tmp`, { recursive: true });
} catch {}

// const db = [
// 	...(await readJarManifests(root, ["browser/base/jar.mn"], true)),
// 	...(await readJarManifests(root, ["mixin/jar.mn"], false)),
// ];

const db_local = await readJarManifests(
	root,
	[
		"floorp/browser/base/jar.mn",
		"floorp/browser/themes/jar.mn",
		"floorp/browser/components/jar.mn",
		"floorp/browser/components/about/aboutcontributors/jar.mn",
		"floorp/browser/components/about/aboutdino/jar.mn",
		"floorp/browser/components/calendar/jar.mn"
	],
	true,
);

for (const chrome of db_local) {
	for (const elem of chrome.list) {
		if (!elem.preprocess) {
			const file_path = `${chrome.realDir}/${elem.rpath}`;
			//console.log(file_path);
			const jar_path = `${chrome.jarDir}/${chrome.jar_name}/${elem.vpath}`;
			//console.log(jar_path);
			await fs.cp(`${root}/${file_path}`, `${dirs[0]}/dist/bin/${jar_path}`);
		}
	}
}

//console.log(await getJarPath(db, "mixin/browser/browser.overlay.js"));

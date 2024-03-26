import fg from "fast-glob";

process.chdir(import.meta.dirname);

/**
 *
 * @param root gecko-dev path
 * @returns obj* paths
 */
export async function getObjDirs(root: string): Promise<string[]> {
	return await fg(`${root}/obj*/`, { onlyDirectories: true });
}

export interface IChromeType {
	jar_name: string;
	chrome: {
		type: "content" | "skin" | "resource";
		name: string;
		base_path: string;
	};
	list: {
		vpath: string;
		rpath: string;
		preprocess: boolean;
	}[];
	jarDir: "browser/chrome" | "chrome";
	realDir: string;
	overrides: {
		from: string;
		to: string;
	}[];
}

export class ChromeType implements IChromeType {
	jar_name: string;
	chrome: { type: "content" | "skin" | "resource"; name: string; base_path: string };
	list: { vpath: string; rpath: string; preprocess: boolean; }[];
	jarDir: "browser/chrome" | "chrome";
	realDir: string;
	overrides: { from: string; to: string }[];
	constructor(realDir: string, jarDir: "browser/chrome" | "chrome") {
		this.jar_name = "";
		this.chrome = {
			type: "content",
			name: "",
			base_path: "",
		};
		this.list = [];
		this.jarDir = jarDir;
		this.realDir = realDir;
		this.overrides = [];
	}
}

export async function getChromeRPath(
	database: ChromeType[],
	chrome: `chrome://${string}`,
): Promise<string> {
	//console.log(JSON.stringify(database));
	const _chrome = chrome.replace("chrome://", "");
	for (const chromeType of database) {
		for (const elem of chromeType.list) {
			if (
				_chrome ===
				elem.vpath.replace(
					chromeType.chrome.base_path.replace("%", ""),
					`${chromeType.chrome.name}/${chromeType.chrome.type}/`,
				)
			) {
				return `${chromeType.jarDir}/${chromeType.jar_name}/${elem.vpath}`;
			}
		}
	}
}

export async function getJarPath(
	database: ChromeType[],
	path: string,
): Promise<string> {
	for (const chromeType of database) {
		for (const elem of chromeType.list) {
			//console.log(`${chromeType.realDir}/${elem.rpath}`);
			if (path === `${chromeType.realDir}/${elem.rpath}`) {
				return `${chromeType.jarDir}/${chromeType.jar_name}/${elem.vpath}`;
			}
		}
	}
}

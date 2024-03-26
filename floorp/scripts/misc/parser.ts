import { ChromeType } from "./objdir.js";

export function parseJarManifest(
	src: string,
	path: string,
	jarDir: "browser/chrome" | "chrome",
): ChromeType[] {
	const ret = [];
	const _src = src.replaceAll(/#.*[\s]/g, "").replaceAll(/[ ]+/g, " ");
	const lines = _src.split("\n").map((v) => {
		return v.trim();
	});
	let tmp = new ChromeType(path, jarDir);
	for (const line of lines) {
		//jarname
		if (line.endsWith(":")) {
			if (tmp.jar_name !== "") {
				ret.push(tmp);
				tmp = new ChromeType(path, jarDir);
			}
			tmp.jar_name = line.replace(".jar:", "");
			continue;
		}
		//chrome
		if (line.startsWith("%")) {
			const list = line.replace("% ", "").split(" ");
			switch (list[0]) {
				case "content": {
					if (tmp.chrome.name !== "") {
						ret.push(tmp);
						const jar_name = tmp.jar_name;
						tmp = new ChromeType(path, jarDir);
						tmp.jar_name = jar_name;
					}
					tmp.chrome.type = "content";
					tmp.chrome.name = list[1];
					tmp.chrome.base_path = list[2];
					break;
				}
				case "skin": {
					if (tmp.chrome.name !== "") {
						ret.push(tmp);
						const jar_name = tmp.jar_name;
						tmp = new ChromeType(path, jarDir);
						tmp.jar_name = jar_name;
					}
					tmp.chrome.type = "skin";
					tmp.chrome.name = list[1];
					// process skinname?
					tmp.chrome.base_path = list[3];
					break;
				}
				case "resource": {
					if (tmp.chrome.name !== "") {
						ret.push(tmp);
						const jar_name = tmp.jar_name;
						tmp = new ChromeType(path, jarDir);
						tmp.jar_name = jar_name;
					}
					tmp.chrome.type = "resource";
					tmp.chrome.name = list[1];
					// process skinname?
					tmp.chrome.base_path = list[3];
					break;
				}
				case "override": {
					tmp.overrides.push({
						from: list[1],
						to: list[2],
					});
					break;
				}

				case "overlay": {
					break;
				}
				default: {
					console.log(list);
					throw Error(`it's not content or skin`);
				}
			}
			continue;
		}
		if (line === "") {
			continue;
		}
		//resource
		{
			let _line = line.trim();
			let preprocess = false;
			if (_line.startsWith("*")) {
				_line = _line.replace("* ", "");
				preprocess = true;
			}
			const list = _line.split(" ");
			if (list.length === 1) {
				list[1] = list[0].split("/").at(-1)
			}
			//console.log(list);
			tmp.list.push({
				vpath: list[0],
				rpath: list[1].replaceAll(/[\(\)]/g, ""),
				preprocess: preprocess,
			});
		}
	}
	ret.push(tmp);
	return ret;
}

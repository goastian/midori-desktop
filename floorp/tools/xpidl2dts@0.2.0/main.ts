import { processAll4Test } from "./src/index.js";

function main() {
	processAll4Test(
		"../nyanrus_Floorp",
		[
			"xpcom",
			"netwerk",
			"dom",
			"uriloader",
			"services",
			"widget",
			"image",
			"layout",
			"js",
			"toolkit",
			"caps",
			"intl",
			"storage",
			"xpfe",
			"docshell",
			"modules/libpref",
			"tools/profiler/gecko",
		],
		"./dist",
	);
}

main();

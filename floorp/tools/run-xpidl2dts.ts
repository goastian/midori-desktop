import * as fs from "fs/promises";
import { processAll4Test } from "xpidl2dts";

const main = async () => {
  await processAll4Test(
    "../..",
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
    "./xpidl2dts@0.2.0/dist"
  );

  try {
    await fs.access("../@types/firefox");
    await fs.rm("../@types/firefox", { recursive: true });
  } catch {}

  await fs.cp("./xpidl2dts@0.2.0/dist/p", "../@types/firefox", {
    recursive: true,
  });
  fs.rm("./xpidl2dts@0.2.0/dist", { recursive: true });
};

main();

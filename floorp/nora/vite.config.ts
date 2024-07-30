/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import solidPlugin from "vite-plugin-solid";
import { $ } from "execa";
import { promises as fs } from "node:fs";

import * as path from "node:path";
import { generateJarManifest } from "./scripts/gen_jarmn";
import puppeteer from "puppeteer-core";
import { Browser } from "puppeteer-core";

const r = (dir: string) => {
  return path.resolve(import.meta.dirname, dir);
};

function binPath(platform: "windows-x64"): string {
  switch (platform) {
    case "windows-x64": {
      return "obj-x86_64-pc-windows-msvc/dist/bin/floorp.exe";
    }
  }
}

export default defineConfig({
  publicDir: r("public"),
  build: {
    sourcemap: true,
    reportCompressedSize: false,
    minify: false,
    rollupOptions: {
      input: {
        csk: "./src/preferences/index.ts",
        content: "./src/content/index.ts",
      },
      output: {
        esModule: true,
        entryFileNames: "[name].js",
        assetFileNames: (chunk) => {
          return "assets/" + (chunk.name ?? "");
        },
        chunkFileNames: (chunk) => {
          return "assets/" + chunk.name + ".js";
        },
      },
    },
  },
  plugins: [
    tsconfigPaths(),
    solidPlugin({
      solid: {
        generate: "universal",
        moduleName: r("./src/solid-xul/solid-xul.ts"),
      },
    }),
    {
      name: "gen_jarmn",
      enforce: "post",
      async generateBundle(options, bundle, isWrite) {
        this.emitFile({
          type: "asset",
          fileName: "jar.mn",
          needsCodeReference: false,
          source: await generateJarManifest(bundle),
        });
      },
    },
    (() => {
      let browser: Browser;
      let intended_close = false;
      return {
        name: "run_browser",
        enforce: "post",
        buildEnd(error) {
          (async () => {
            if (this.meta.watchMode) {
              if (browser) {
                console.log("Browser Restarting...");
                intended_close = true;
                await browser.close();
                intended_close = false;
              }
              const _cwd = process.cwd();
              process.chdir("../..");
              await $({ stdio: "inherit" })`./mach build`;
              process.chdir(_cwd);

              //https://github.com/puppeteer/puppeteer/blob/c229fc8f9750a4c87d0ed3c7b541c31c8da5eaab/packages/puppeteer-core/src/node/FirefoxLauncher.ts#L123
              await fs.mkdir("./dist/profile/test", { recursive: true });
              browser = await puppeteer.launch({
                headless: false,
                protocol: "cdp",
                dumpio: true,
                product: "firefox",
                executablePath: path.join("../..", binPath("windows-x64")),
                userDataDir: "./dist/profile/test",
                extraPrefsFirefox: { "browser.newtabpage.enabled": true },
                defaultViewport: { height: 0, width: 0 },
              });
              (await browser.pages())[0].setViewport({ width: 0, height: 0 });
              //(await browser.pages())[0].goto("about:newtab");
              browser.on("disconnected", () => {
                if (!intended_close) process.exit(1);
              });
            }
          })();
        },
      };
    })(),
  ],
  resolve: {
    alias: {
      "@private": r("../Floorp-private-components/nora"),
    },
  },
  css :{
    transformer: 'lightningcss',
  },
});

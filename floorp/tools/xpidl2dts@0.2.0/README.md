# XPIDL2DTS

Firefox's XPCOM has no type auto-complete in js!  
So, I made a tool to convert XPIDL(XPCOM's IDL files) to d.ts!

this tool's purpose is to make better firefox's js development esp. [Floorp-Projects/Floorp](https://github.com/Floorp-Projects/Floorp)

## How to run

```bash
pnpm i
```
to install libraries and

enter FIREFOX_ROOT to main.ts like
```ts
function main() {
  processAll4Test("[[FIREFOX_ROOT]]", [
    "xpcom",
    "netwerk/mime",
    "layout",
    "js",
  ]);
}
```

and run!

```bash
pnpm tsx main.ts
```

and you will get `dist` folder that includes `pp` (preprocessed) and `p`(processed)  
then you can use the `p`(processed) folder's contents!

If you want to format to these dts,
You can type

```bash
pnpm biome format --write ./dist/p
```

or you can use prettier and/or eslint if you install  
and use like

```bash
pnpm prettier --write 'dist/p/**/*.d.ts' --ignore-path ""
```

(you should include `--ignore-path ""` because prettier ignores files that git ignores)  
or

```bash
pnpm eslint --fix ./dist/p/**/*.d.ts
```

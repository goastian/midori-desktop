#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const ameliaPath = resolve(root, 'amelia.json');

const args = process.argv.slice(2);
const getArgValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
};

const displayVersion = getArgValue('--display-version');
if (!displayVersion) {
  console.error('Missing required argument: --display-version <version>');
  process.exit(1);
}

const buildTypeEnv = process.env.MIDORI_RELEASE_BRANCH;
const buildType = buildTypeEnv === 'dawn' ? 'dawn' : 'release';

const raw = readFileSync(ameliaPath, 'utf8');
const config = JSON.parse(raw);

if (!config.brands?.[buildType]?.release) {
  console.error(`Unable to resolve amelia.json brands.${buildType}.release`);
  process.exit(1);
}

config.brands[buildType].release.displayVersion = displayVersion;

writeFileSync(ameliaPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

console.log(`CI config applied: buildType=${buildType}, displayVersion=${displayVersion}`);

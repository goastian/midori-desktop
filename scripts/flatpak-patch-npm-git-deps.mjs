#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const lockPath = resolve(root, 'package-lock.json');
const gitDependencyPath = 'flatpak-node/git/is-apple-silicon';
const gitDependencyPackage = resolve(root, gitDependencyPath, 'package.json');

if (!existsSync(lockPath)) {
  console.error('package-lock.json not found');
  process.exit(1);
}

if (!existsSync(gitDependencyPackage)) {
  console.error(`Flatpak git dependency source not found: ${gitDependencyPackage}`);
  process.exit(1);
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

const ameliaPackage = lock.packages?.['node_modules/@goastian/amelia'];
if (ameliaPackage?.dependencies?.['is-apple-silicon']) {
  ameliaPackage.dependencies['is-apple-silicon'] = `file:${gitDependencyPath}`;
}

lock.packages['node_modules/is-apple-silicon'] = {
  version: '1.0.1',
  resolved: `file:${gitDependencyPath}`,
  license: 'MIT',
};

writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
console.log('Patched package-lock.json git dependencies for Flatpak offline build');

#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const lockPath = resolve(root, 'package-lock.json');
const gitDependencyPath = 'flatpak-node/git/is-apple-silicon';
const gitDependencyPackage = resolve(root, gitDependencyPath, 'package.json');

function ensureLocalGitDependency() {
  if (existsSync(gitDependencyPackage)) {
    return;
  }

  const dependencyDir = resolve(root, gitDependencyPath);
  mkdirSync(dependencyDir, { recursive: true });

  // Minimal local replacement for the Git dependency used by amelia.
  const pkg = {
    name: 'is-apple-silicon',
    version: '1.0.1',
    description: 'Detect if host machine is Apple Silicon',
    main: 'index.js',
    license: 'MIT',
  };

  writeFileSync(resolve(dependencyDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  writeFileSync(
    resolve(dependencyDir, 'index.js'),
    "module.exports = function isAppleSilicon() {\n" +
      "  return process.platform === 'darwin' && process.arch === 'arm64';\n" +
      "};\n",
    'utf8',
  );
}

if (!existsSync(lockPath)) {
  console.error('package-lock.json not found');
  process.exit(1);
}

ensureLocalGitDependency();

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

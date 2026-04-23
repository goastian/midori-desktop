#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const packageJsonPath = resolve(root, 'package.json');
const ameliaJsonPath = resolve(root, 'amelia.json');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const ameliaJson = JSON.parse(readFileSync(ameliaJsonPath, 'utf8'));

const expectedLicense = 'MPL-2.0';

const packageLicense = packageJson.license;
const ameliaLicense = ameliaJson?.license?.licenseType;

if (packageLicense !== expectedLicense) {
  console.error(`package.json license must be ${expectedLicense}, got: ${packageLicense ?? 'undefined'}`);
  process.exit(1);
}

if (ameliaLicense !== expectedLicense) {
  console.error(`amelia.json license.licenseType must be ${expectedLicense}, got: ${ameliaLicense ?? 'undefined'}`);
  process.exit(1);
}

console.log(`License check passed: ${expectedLicense}`);

#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

const BUILD_VERSION_PATH = path.join(__dirname, '..', '.build-version.json');
const APP_CONFIG_JS_PATH = path.join(__dirname, '..', 'app.config.js');

interface BuildVersion {
  buildNumber: number;
}

function readBuildVersion(): BuildVersion {
  if (!fs.existsSync(BUILD_VERSION_PATH)) {
    const initial = { buildNumber: 1 };
    fs.writeFileSync(BUILD_VERSION_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  const content = fs.readFileSync(BUILD_VERSION_PATH, 'utf-8');
  return JSON.parse(content);
}

function writeBuildVersion(buildVersion: BuildVersion): void {
  const content = JSON.stringify(buildVersion, null, 2);
  fs.writeFileSync(BUILD_VERSION_PATH, content, 'utf-8');
}

function updateAppConfigJs(buildNumber: number): void {
  if (!fs.existsSync(APP_CONFIG_JS_PATH)) {
    throw new Error(`${APP_CONFIG_JS_PATH} not found`);
  }

  const content = fs.readFileSync(APP_CONFIG_JS_PATH, 'utf-8');
  const buildNumberStr = String(buildNumber);

  let updated = content.replace(/(buildNumber:\s*)'[^']*'/, `$1'${buildNumberStr}'`);

  updated = updated.replace(/(versionCode:\s*)\d+/, `$1${buildNumber}`);

  fs.writeFileSync(APP_CONFIG_JS_PATH, updated, 'utf-8');
}

function incrementBuildNumbers(): { buildNumber: number } {
  const buildVersion = readBuildVersion();
  const newBuildNumber = buildVersion.buildNumber + 1;

  buildVersion.buildNumber = newBuildNumber;
  writeBuildVersion(buildVersion);
  updateAppConfigJs(newBuildNumber);

  return { buildNumber: newBuildNumber };
}

function getBuildNumbers(): { buildNumber: number } {
  const buildVersion = readBuildVersion();
  return { buildNumber: buildVersion.buildNumber };
}

const command = process.argv[2];

switch (command) {
  case 'increment-build': {
    const { buildNumber } = incrementBuildNumbers();
    console.log(`✅ Incremented build number: ${buildNumber}`);
    console.log(`   Updated app.config.js with new build number`);
    process.exit(0);
    break;
  }
  case 'get-build': {
    const { buildNumber } = getBuildNumbers();
    console.log(`Current build number: ${buildNumber}`);
    process.exit(0);
    break;
  }
  default:
    console.error('Usage: tsx scripts/update-version.ts [increment-build|get-build]');
    process.exit(1);
}

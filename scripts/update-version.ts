#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

const APP_CONFIG_JS_PATH = path.join(__dirname, '..', 'app.config.js');

function readAppConfig(): any {
  // Delete require cache to ensure fresh read
  delete require.cache[require.resolve(APP_CONFIG_JS_PATH)];
  return require(APP_CONFIG_JS_PATH);
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
  const config = readAppConfig();
  const currentBuildNumber = parseInt(config.ios?.buildNumber || '1', 10);
  const newBuildNumber = currentBuildNumber + 1;

  updateAppConfigJs(newBuildNumber);

  return { buildNumber: newBuildNumber };
}

function getBuildNumbers(): { buildNumber: number } {
  const config = readAppConfig();
  const buildNumber = parseInt(config.ios?.buildNumber || '1', 10);
  return { buildNumber };
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

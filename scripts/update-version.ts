#!/usr/bin/env node

/**
 * Script to manage native build numbers in app.json
 *
 * Usage:
 *   tsx scripts/update-version.ts increment-build   # Increment Android versionCode and iOS buildNumber
 *   tsx scripts/update-version.ts get-build   # Get current build numbers
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_JSON_PATH = path.join(__dirname, '..', 'app.json');

interface AppJson {
  expo: {
    ios?: {
      buildNumber?: string;
      [key: string]: unknown;
    };
    android?: {
      versionCode?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

function readAppJson(): AppJson {
  const content = fs.readFileSync(APP_JSON_PATH, 'utf-8');
  return JSON.parse(content);
}

function writeAppJson(appJson: AppJson): void {
  const content = JSON.stringify(appJson, null, 2);
  fs.writeFileSync(APP_JSON_PATH, content, 'utf-8');
}

function incrementBuildNumbers(): { versionCode: number; buildNumber: string } {
  const appJson = readAppJson();

  // Get current values or default to 0
  const currentVersionCode = (appJson.expo.android?.versionCode as number) || 0;
  const newVersionCode = currentVersionCode + 1;
  const newBuildNumber = String(newVersionCode);

  // Ensure ios and android objects exist
  if (!appJson.expo.ios) {
    appJson.expo.ios = {};
  }
  if (!appJson.expo.android) {
    appJson.expo.android = {};
  }

  // Update values
  appJson.expo.android.versionCode = newVersionCode;
  appJson.expo.ios.buildNumber = newBuildNumber;

  writeAppJson(appJson);

  return {
    versionCode: newVersionCode,
    buildNumber: newBuildNumber,
  };
}

function getBuildNumbers(): { versionCode: number | undefined; buildNumber: string | undefined } {
  const appJson = readAppJson();
  return {
    versionCode: appJson.expo.android?.versionCode as number | undefined,
    buildNumber: appJson.expo.ios?.buildNumber as string | undefined,
  };
}

// Main
const command = process.argv[2];

switch (command) {
  case 'increment-build': {
    const { versionCode, buildNumber } = incrementBuildNumbers();
    console.log(`✅ Incremented build numbers:`);
    console.log(`   Android versionCode: ${versionCode}`);
    console.log(`   iOS buildNumber: ${buildNumber}`);
    process.exit(0);
    break;
  }
  case 'get-build': {
    const { versionCode, buildNumber } = getBuildNumbers();
    if (versionCode !== undefined && buildNumber !== undefined) {
      console.log(`Android versionCode: ${versionCode}`);
      console.log(`iOS buildNumber: ${buildNumber}`);
      process.exit(0);
    } else {
      console.error('❌ Build numbers not found in app.json');
      console.error('   Run "increment-build" to initialize them');
      process.exit(1);
    }
    break;
  }
  default:
    console.error('Usage: tsx scripts/update-version.ts [increment-build|get-build]');
    process.exit(1);
}

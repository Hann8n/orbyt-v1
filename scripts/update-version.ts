#!/usr/bin/env node

/**
 * Script to automatically manage updateVersion and build numbers in app.json
 *
 * Usage:
 *   tsx scripts/update-version.ts increment   # Increment updateVersion for OTA update
 *   tsx scripts/update-version.ts reset       # Reset updateVersion for new build (to today.1)
 *   tsx scripts/update-version.ts get         # Get current updateVersion
 *   tsx scripts/update-version.ts increment-build   # Increment Android versionCode and iOS buildNumber
 *   tsx scripts/update-version.ts get-build   # Get current build numbers
 */

import * as fs from 'fs';
import * as path from 'path';

const APP_JSON_PATH = path.join(__dirname, '..', 'app.json');

interface AppJson {
  expo: {
    extra?: {
      updateVersion?: string;
      [key: string]: unknown;
    };
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

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function parseUpdateVersion(
  version: string | undefined
): { date: string; increment: number } | null {
  if (!version) return null;

  const match = version.match(/^(\d{4}\.\d{2}\.\d{2})\.(\d+)$/);
  if (!match) return null;

  return {
    date: match[1],
    increment: parseInt(match[2], 10),
  };
}

function formatUpdateVersion(date: string, increment: number): string {
  return `${date}.${increment}`;
}

function incrementUpdateVersion(): string {
  const appJson = readAppJson();
  const today = getTodayDateString();
  const current = appJson.expo.extra?.updateVersion;
  const parsed = parseUpdateVersion(current);

  let newVersion: string;

  if (!parsed || parsed.date !== today) {
    // New day or no version exists - start at .1
    newVersion = formatUpdateVersion(today, 1);
  } else {
    // Same day - increment
    newVersion = formatUpdateVersion(today, parsed.increment + 1);
  }

  // Ensure extra object exists
  if (!appJson.expo.extra) {
    appJson.expo.extra = {};
  }

  appJson.expo.extra.updateVersion = newVersion;
  writeAppJson(appJson);

  return newVersion;
}

function resetUpdateVersion(): string {
  const appJson = readAppJson();
  const today = getTodayDateString();
  const newVersion = formatUpdateVersion(today, 1);

  // Ensure extra object exists
  if (!appJson.expo.extra) {
    appJson.expo.extra = {};
  }

  appJson.expo.extra.updateVersion = newVersion;
  writeAppJson(appJson);

  return newVersion;
}

function getUpdateVersion(): string | undefined {
  const appJson = readAppJson();
  return appJson.expo.extra?.updateVersion;
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
  case 'increment': {
    const newVersion = incrementUpdateVersion();
    console.log(`✅ Incremented updateVersion to: ${newVersion}`);
    process.exit(0);
    break;
  }
  case 'reset': {
    const newVersion = resetUpdateVersion();
    console.log(`✅ Reset updateVersion to: ${newVersion}`);
    process.exit(0);
    break;
  }
  case 'get': {
    const version = getUpdateVersion();
    if (version) {
      console.log(version);
      process.exit(0);
    } else {
      console.error('❌ No updateVersion found in app.json');
      process.exit(1);
    }
    break;
  }
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
    console.error(
      'Usage: tsx scripts/update-version.ts [increment|reset|get|increment-build|get-build]'
    );
    process.exit(1);
}

#!/usr/bin/env node

/**
 * CI Guard Script: Check Version Bump for Native Changes
 *
 * This script ensures that when native-affecting files are modified,
 * the app.json version is also bumped. This prevents accidentally
 * publishing OTA updates to builds with incompatible native code.
 *
 * Usage: node scripts/check-version-bump.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Files that affect native code and require a version bump
const NATIVE_AFFECTING_FILES = [
  'package.json',
  'ffmpeg-kit-plugin.js',
  'app.json',
  'eas.json',
  'babel.config.js',
  'metro.config.js',
  'app.json', // Explicitly check for plugins/config changes
];

// Fields in app.json that affect native code
const NATIVE_AFFECTING_APP_JSON_PATHS = [
  'expo.plugins',
  'expo.android',
  'expo.ios',
  'expo.buildProperties',
];

function getGitDiffFiles() {
  try {
    // Get files changed in the current PR/branch compared to base branch
    const baseBranch = process.env.GITHUB_BASE_REF || 'main';
    const currentBranch = process.env.GITHUB_HEAD_REF || execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    
    // For PRs, compare against base. For local, compare against main
    const diffCommand = `git diff --name-only origin/${baseBranch}...HEAD 2>/dev/null || git diff --name-only main...HEAD 2>/dev/null || git diff --name-only HEAD~1 HEAD`;
    const changedFiles = execSync(diffCommand, { encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean)
      .map(f => f.trim());
    
    return changedFiles;
  } catch (error) {
    // If git commands fail (e.g., in CI without proper setup), check staged files
    try {
      const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' })
        .split('\n')
        .filter(Boolean)
        .map(f => f.trim());
      return stagedFiles;
    } catch {
      return [];
    }
  }
}

function getAppJsonVersion() {
  try {
    const appJsonPath = path.join(process.cwd(), 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    return appJson.expo?.version || null;
  } catch (error) {
    console.error('Error reading app.json:', error.message);
    return null;
  }
}

function getPreviousAppJsonVersion() {
  try {
    // Try to get version from git history
    const baseBranch = process.env.GITHUB_BASE_REF || 'main';
    const diffCommand = `git diff origin/${baseBranch}...HEAD app.json 2>/dev/null || git diff main...HEAD app.json 2>/dev/null || git diff HEAD~1 HEAD app.json`;
    
    const diff = execSync(diffCommand, { encoding: 'utf-8' });
    
    // Extract old version from diff
    const oldVersionMatch = diff.match(/-.*"version":\s*"([^"]+)"/);
    if (oldVersionMatch) {
      return oldVersionMatch[1];
    }
    
    // Fallback: get version from base branch
    try {
      const baseVersion = execSync(`git show origin/${baseBranch}:app.json 2>/dev/null || git show main:app.json`, { encoding: 'utf-8' });
      const baseAppJson = JSON.parse(baseVersion);
      return baseAppJson.expo?.version || null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function checkAppJsonNativeChanges(changedFiles) {
  if (!changedFiles.includes('app.json')) {
    return false;
  }
  
  try {
    const appJsonPath = path.join(process.cwd(), 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    
    // Check if any native-affecting paths were modified
    // We'll check the diff to see what actually changed
    try {
      const baseBranch = process.env.GITHUB_BASE_REF || 'main';
      const diffCommand = `git diff origin/${baseBranch}...HEAD app.json 2>/dev/null || git diff main...HEAD app.json 2>/dev/null || git diff HEAD~1 HEAD app.json`;
      const diff = execSync(diffCommand, { encoding: 'utf-8' });
      
      // Check if any native-affecting paths appear in the diff
      for (const path of NATIVE_AFFECTING_APP_JSON_PATHS) {
        const pathParts = path.split('.');
        const lastPart = pathParts[pathParts.length - 1];
        if (diff.includes(`"${lastPart}"`) || diff.includes(`'${lastPart}'`)) {
          return true;
        }
      }
      
      // Check if plugins array was modified
      if (diff.includes('plugins') && (diff.includes('+') || diff.includes('-'))) {
        return true;
      }
    } catch {
      // If we can't check diff, assume it might have changed
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

function main() {
  console.log('🔍 Checking for native changes without version bump...\n');
  
  const changedFiles = getGitDiffFiles();
  
  if (changedFiles.length === 0) {
    console.log('✅ No files changed. Skipping version check.');
    process.exit(0);
  }
  
  // Check if any native-affecting files were modified
  const nativeFilesChanged = changedFiles.some(file => {
    const fileName = path.basename(file);
    return NATIVE_AFFECTING_FILES.some(nativeFile => 
      file.includes(nativeFile) || fileName === nativeFile
    );
  });
  
  // Also check if app.json had native-affecting changes
  const appJsonNativeChanged = checkAppJsonNativeChanges(changedFiles);
  
  if (!nativeFilesChanged && !appJsonNativeChanged) {
    console.log('✅ No native-affecting files changed. Version check passed.');
    process.exit(0);
  }
  
  // Native files changed - check if version was bumped
  const currentVersion = getAppJsonVersion();
  const previousVersion = getPreviousAppJsonVersion();
  
  if (!currentVersion) {
    console.error('❌ Error: Could not read current version from app.json');
    process.exit(1);
  }
  
  if (previousVersion && currentVersion === previousVersion) {
    console.error('\n❌ ERROR: Native-affecting files were modified but app.json version was not bumped!\n');
    console.error('Modified files:');
    changedFiles
      .filter(file => {
        const fileName = path.basename(file);
        return NATIVE_AFFECTING_FILES.some(nativeFile => 
          file.includes(nativeFile) || fileName === nativeFile
        ) || file === 'app.json';
      })
      .forEach(file => console.error(`  - ${file}`));
    console.error('\n⚠️  When you modify native code, you MUST:');
    console.error('  1. Bump the version in app.json (e.g., "1.0.8" → "1.0.9")');
    console.error('  2. Create a new build with: eas build --profile production');
    console.error('  3. Submit the new build to app stores');
    console.error('  4. Then publish OTA updates for the new version\n');
    console.error(`Current version: ${currentVersion}`);
    console.error(`Previous version: ${previousVersion}`);
    console.error('\nThis prevents OTA updates from being sent to builds with incompatible native code.\n');
    process.exit(1);
  }
  
  if (previousVersion && currentVersion !== previousVersion) {
    console.log(`✅ Version bumped correctly: ${previousVersion} → ${currentVersion}`);
    console.log('✅ Native changes are safe. Remember to create a new build!\n');
    process.exit(0);
  }
  
  // If we can't determine previous version, warn but don't fail
  // (this might happen in some CI scenarios)
  if (!previousVersion) {
    console.warn('⚠️  Warning: Could not determine previous version from git history.');
    console.warn('⚠️  Native files were changed. Please ensure version was bumped if needed.');
    console.warn(`   Current version: ${currentVersion}\n`);
    // Don't fail in this case - allow manual verification
    process.exit(0);
  }
}

// Run the check
main();

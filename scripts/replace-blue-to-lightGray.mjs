#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(process.cwd());
const srcDir = path.join(projectRoot, 'src');

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'ios-local-artifacts', 'android', 'build', 'dist', '.expo', '.git'].includes(entry.name)) continue;
      results.push(...listFiles(fullPath));
    } else if (/\.(tsx?|jsx?)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  let updated = original;

  // Replace Colors.blue -> Colors.lightGray (exact reference)
  updated = updated.replace(/\bColors\.blue\b/g, 'Colors.lightGray');

  // Replace color.blue -> Colors.lightGray (case-insensitive, just in case)
  updated = updated.replace(/\bcolor\.blue\b/gi, 'Colors.lightGray');

  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log(`Updated: ${path.relative(projectRoot, filePath)}`);
    return true;
  }
  return false;
}

function main() {
  if (!fs.existsSync(srcDir)) {
    console.error('src directory not found:', srcDir);
    process.exit(1);
  }

  const files = listFiles(srcDir);
  let changedFiles = 0;
  for (const f of files) {
    const changed = processFile(f);
    if (changed) changedFiles++;
  }
  console.log(`\nCompleted replacement. Files changed: ${changedFiles}`);
}

main();



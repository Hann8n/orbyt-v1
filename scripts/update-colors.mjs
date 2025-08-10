#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(process.cwd());
const srcDir = path.join(projectRoot, 'src');

// Mapping from legacy aliases to new color keys
const replacements = [
  // BACKGROUND
  [/Colors\.BACKGROUND\.PRIMARY\b/g, 'Colors.black'],
  [/Colors\.BACKGROUND\.SECONDARY\b/g, 'Colors.darkGray'],
  [/Colors\.BACKGROUND\.TERTIARY\b/g, 'Colors.mediumGray'],
  [/Colors\.BACKGROUND\.ITEM\b/g, 'Colors.darkGray'],
  [/Colors\.BACKGROUND\.CARD\b/g, 'Colors.darkGray'],
  [/Colors\.BACKGROUND\.MODAL\b/g, 'Colors.darkGray'],
  [/UI\.Colors\.BACKGROUND\.PRIMARY\b/g, 'Colors.black'],
  [/UI\.Colors\.BACKGROUND\.SECONDARY\b/g, 'Colors.darkGray'],
  [/UI\.Colors\.BACKGROUND\.TERTIARY\b/g, 'Colors.mediumGray'],
  [/UI\.Colors\.BACKGROUND\.ITEM\b/g, 'Colors.darkGray'],
  [/UI\.Colors\.BACKGROUND\.CARD\b/g, 'Colors.darkGray'],
  [/UI\.Colors\.BACKGROUND\.MODAL\b/g, 'Colors.darkGray'],

  // TEXT
  [/Colors\.TEXT\.PRIMARY\b/g, 'Colors.white'],
  [/Colors\.TEXT\.SECONDARY\b/g, 'Colors.blue'],
  [/Colors\.TEXT\.TERTIARY\b/g, 'Colors.gray'],
  [/Colors\.TEXT\.PLACEHOLDER\b/g, 'Colors.lightGray'],
  [/Colors\.TEXT\.LIGHT_GREY\b/g, 'Colors.lightGray'],
  [/Colors\.TEXT\.MEDIUM_GREY\b/g, 'Colors.gray'],
  [/Colors\.TEXT\.DARK_GREY\b/g, 'Colors.gray'],
  [/UI\.Colors\.TEXT\.PRIMARY\b/g, 'Colors.white'],
  [/UI\.Colors\.TEXT\.SECONDARY\b/g, 'Colors.blue'],
  [/UI\.Colors\.TEXT\.TERTIARY\b/g, 'Colors.gray'],
  [/UI\.Colors\.TEXT\.PLACEHOLDER\b/g, 'Colors.lightGray'],
  [/UI\.Colors\.TEXT\.LIGHT_GREY\b/g, 'Colors.lightGray'],
  [/UI\.Colors\.TEXT\.MEDIUM_GREY\b/g, 'Colors.gray'],
  [/UI\.Colors\.TEXT\.DARK_GREY\b/g, 'Colors.gray'],

  // BORDER
  [/Colors\.BORDER\.PRIMARY\b/g, 'Colors.gray'],
  [/Colors\.BORDER\.LIGHT\b/g, 'Colors.lightGray'],
  [/UI\.Colors\.BORDER\.PRIMARY\b/g, 'Colors.gray'],
  [/UI\.Colors\.BORDER\.LIGHT\b/g, 'Colors.lightGray'],
];

/** Recursively list files under a directory */
function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip common non-source folders
      if (['node_modules', 'ios-local-artifacts', 'android', 'build', 'dist', '.expo', '.git'].includes(entry.name)) {
        continue;
      }
      results.push(...listFiles(fullPath));
    } else {
      // Only process code files
      if (/(\.(ts|tsx|js|jsx))$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  let updated = original;
  let changed = false;

  for (const [pattern, replacement] of replacements) {
    const next = updated.replace(pattern, replacement);
    if (next !== updated) {
      changed = true;
      updated = next;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, updated, 'utf8');
  }
  return changed;
}

function main() {
  if (!fs.existsSync(srcDir)) {
    console.error('src directory not found:', srcDir);
    process.exit(1);
  }

  const files = listFiles(srcDir);
  let changedCount = 0;
  let fileChanged = 0;

  for (const f of files) {
    const before = fs.readFileSync(f, 'utf8');
    const didChange = processFile(f);
    if (didChange) {
      fileChanged += 1;
      const after = fs.readFileSync(f, 'utf8');
      // Rough count of replacements by difference in occurrences
      let delta = 0;
      for (const [pattern] of replacements) {
        const count = (str, re) => (str.match(re) || []).length;
        delta += count(before, pattern) - count(after, pattern);
      }
      changedCount += Math.max(1, delta);
      console.log(`Updated: ${path.relative(projectRoot, f)}`);
    }
  }

  console.log(`\nCompleted. Files changed: ${fileChanged}, total replacements (approx): ${changedCount}`);
}

main();



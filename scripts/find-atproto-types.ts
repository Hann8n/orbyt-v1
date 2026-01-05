#!/usr/bin/env ts-node
/**
 * Helper script to find ATProto types in node_modules
 * Usage: npx ts-node scripts/find-atproto-types.ts <search-term>
 * 
 * Example: npx ts-node scripts/find-atproto-types.ts MessageView
 */

import * as fs from 'fs';
import * as path from 'path';

const searchTerm = process.argv[2];

if (!searchTerm) {
  console.log('Usage: npx ts-node scripts/find-atproto-types.ts <search-term>');
  console.log('Example: npx ts-node scripts/find-atproto-types.ts MessageView');
  process.exit(1);
}

const atprotoPath = path.join(process.cwd(), 'node_modules', '@atproto', 'api', 'dist', 'client', 'types');

if (!fs.existsSync(atprotoPath)) {
  console.error('@atproto/api not found. Make sure dependencies are installed.');
  process.exit(1);
}

function searchInFile(filePath: string, searchTerm: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches: string[] = [];
  
  lines.forEach((line, index) => {
    if (line.includes(searchTerm)) {
      matches.push(`${filePath}:${index + 1}: ${line.trim()}`);
    }
  });
  
  return matches;
}

function walkDir(dir: string, searchTerm: string, results: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath, searchTerm, results);
    } else if (file.endsWith('.ts') || file.endsWith('.d.ts')) {
      const matches = searchInFile(filePath, searchTerm);
      results.push(...matches);
    }
  }
  
  return results;
}

console.log(`Searching for "${searchTerm}" in @atproto/api types...\n`);
const results = walkDir(atprotoPath, searchTerm);

if (results.length === 0) {
  console.log(`No matches found for "${searchTerm}"`);
  console.log('\nTry searching for related terms:');
  console.log('  - For messages: MessageView, Message, ConvoView');
  console.log('  - For embeds: Embed, VideoView, ImagesView, ExternalView');
  console.log('  - For profiles: ProfileView, ProfileViewBasic');
  console.log('  - For feeds: FeedViewPost, PostView');
} else {
  console.log(`Found ${results.length} match(es):\n`);
  results.slice(0, 20).forEach((match, i) => {
    console.log(`${i + 1}. ${match}`);
  });
  
  if (results.length > 20) {
    console.log(`\n... and ${results.length - 20} more matches`);
  }
  
  console.log('\nTo import, use:');
  const firstMatch = results[0];
  if (firstMatch) {
    const filePath = firstMatch.split(':')[0];
    const relativePath = path.relative(atprotoPath, filePath);
    const importPath = relativePath.replace(/\.(ts|d\.ts)$/, '');
    console.log(`import type { ${searchTerm} } from '@atproto/api/dist/client/types/${importPath}';`);
  }
}

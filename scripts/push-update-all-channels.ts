#!/usr/bin/env node

/**
 * Script to push OTA updates to all channels (development, preview, production)
 *
 * Usage:
 *   tsx scripts/push-update-all-channels.ts [message]
 *
 * Example:
 *   tsx scripts/push-update-all-channels.ts "Bug fixes and improvements"
 */

import { execSync } from 'child_process';

const CHANNELS = ['development', 'preview', 'production'] as const;

function incrementVersion(): void {
  console.log('📦 Incrementing update version...');
  try {
    execSync('yarn version:increment', { stdio: 'inherit' });
    console.log('✅ Version incremented successfully\n');
  } catch (_error) {
    console.error('❌ Failed to increment version');
    process.exit(1);
  }
}

function pushUpdateToChannel(channel: string, message?: string): void {
  console.log(`🚀 Pushing update to ${channel} channel...`);
  try {
    // Use modern 'eas' command (fallback to 'npx eas-cli' if not available)
    // Use default message if none provided
    const updateMessage = message || `OTA update to ${channel} channel`;
    const command = `eas update --channel ${channel} --message "${updateMessage}"`;
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ Successfully pushed to ${channel} channel\n`);
  } catch (error) {
    console.error(`❌ Failed to push to ${channel} channel`);
    throw error;
  }
}

function main(): void {
  const message = process.argv[2];

  console.log('🔄 Starting OTA update push to all channels...\n');

  // Increment version once for all channels
  incrementVersion();

  // Push to each channel
  const errors: string[] = [];
  for (const channel of CHANNELS) {
    try {
      pushUpdateToChannel(channel, message);
    } catch (_error) {
      errors.push(channel);
      console.error(`⚠️  Continuing with remaining channels...\n`);
    }
  }

  // Summary
  console.log('\n📊 Update Summary:');
  const successCount = CHANNELS.length - errors.length;
  console.log(`   ✅ Success: ${successCount}/${CHANNELS.length} channels`);

  if (errors.length > 0) {
    console.log(`   ❌ Failed: ${errors.length} channel(s) - ${errors.join(', ')}`);
    process.exit(1);
  } else {
    console.log('   🎉 All updates pushed successfully!');
    process.exit(0);
  }
}

main();

const fs = require('fs');
const path = require('path');

// Get the app config from environment variable, default to production
const appConfig = process.env.EXPO_PUBLIC_APP_CONFIG || 'app.prod.json';

// Copy the appropriate config file to app.json
const sourceConfig = path.join(__dirname, appConfig);
const targetConfig = path.join(__dirname, 'app.json');

try {
  fs.copyFileSync(sourceConfig, targetConfig);
  console.log(`✅ Copied ${appConfig} to app.json for build`);
} catch (error) {
  console.error(`❌ Error copying ${appConfig} to app.json:`, error);
  process.exit(1);
} 
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const inputDir = path.join(__dirname, 'src/assets/tab-icons');
const outputDir = path.join(__dirname, 'src/assets/tab-icons/png');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Icon names and their base sizes - standard iOS tab bar icon size is 25x25 points
const icons = [
  { name: 'home_5_fill', baseSize: 25 },
  { name: 'search_2_fill', baseSize: 25 },
  { name: 'flash_fill', baseSize: 25 },
  { name: 'user_3_fill', baseSize: 25 },
  { name: 'world_2_fill', baseSize: 25 },
];

// Resolution multipliers for high-DPI displays
const scales = [
  { scale: 1, suffix: '' },
  { scale: 2, suffix: '@2x' },
  { scale: 3, suffix: '@3x' },
];

async function convertSvgToPng(iconName, baseSize) {
  const svgPath = path.join(inputDir, `${iconName}.svg`);

  if (!fs.existsSync(svgPath)) {
    console.error(`SVG file not found: ${svgPath}`);
    return;
  }

  const svgContent = fs.readFileSync(svgPath, 'utf8');

  for (const { scale, suffix } of scales) {
    const size = baseSize * scale;
    const outputPath = path.join(outputDir, `${iconName}${suffix}.png`);

    try {
      // Read SVG and convert to PNG at high resolution
      await sharp(Buffer.from(svgContent))
        .resize(size, size, {
          kernel: sharp.kernel.lanczos3,
        })
        .png({
          quality: 100,
          compressionLevel: 9,
        })
        .toFile(outputPath);

      console.log(`✓ Created ${iconName}${suffix}.png (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Failed to create ${iconName}${suffix}.png:`, error.message);
    }
  }
}

async function main() {
  console.log('Converting SVG icons to high-resolution PNGs at standard tab bar size...\n');

  for (const icon of icons) {
    await convertSvgToPng(icon.name, icon.baseSize);
  }

  console.log('\n✓ Conversion complete!');
  console.log(`PNG files saved to: ${outputDir}`);
}

main().catch(console.error);

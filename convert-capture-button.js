const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const inputFile = path.join(__dirname, 'src/assets/capture-button.svg');
const outputDir = path.join(__dirname, 'src/assets');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Base size is 90x90 (matching the create screen)
const baseSize = 90;

// Resolution multipliers for high-DPI displays
const scales = [
  { scale: 1, suffix: '' },
  { scale: 2, suffix: '@2x' },
  { scale: 3, suffix: '@3x' },
];

async function convertSvgToPng() {
  if (!fs.existsSync(inputFile)) {
    console.error(`SVG file not found: ${inputFile}`);
    return;
  }

  const svgContent = fs.readFileSync(inputFile, 'utf8');
  
  for (const { scale, suffix } of scales) {
    const size = baseSize * scale;
    const outputPath = path.join(outputDir, `CaptureButton_Normal${suffix}.png`);
    
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
      
      console.log(`✓ Created CaptureButton_Normal${suffix}.png (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Failed to create CaptureButton_Normal${suffix}.png:`, error.message);
    }
  }
}

async function main() {
  console.log('Converting capture button SVG to high-resolution PNGs...\n');
  
  await convertSvgToPng();
  
  console.log('\n✓ Conversion complete!');
  console.log(`PNG files saved to: ${outputDir}`);
}

main().catch(console.error);

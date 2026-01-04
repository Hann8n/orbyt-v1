const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const inputFile = path.join(__dirname, 'src/assets/capture-button.svg');
const outputDir = path.join(__dirname, 'src/assets/tab-icons/png');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const baseSize = 36;
const scales = [
  { scale: 1, suffix: '' },
  { scale: 2, suffix: '@2x' },
  { scale: 3, suffix: '@3x' },
];

async function convertSvgToPng() {
  const svgContent = fs.readFileSync(inputFile, 'utf8');
  const svgWithWhite = svgContent.replace(/currentColor/g, '#FFFFFF');
  
  for (const { scale, suffix } of scales) {
    const size = baseSize * scale;
    const outputPath = path.join(outputDir, `capture_button${suffix}.png`);
    
    await sharp(Buffer.from(svgWithWhite))
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(outputPath);
    
    console.log(`✓ Created capture_button${suffix}.png (${size}x${size})`);
  }
}

convertSvgToPng().catch(console.error);

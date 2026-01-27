import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

const FRAMES_DIR = path.join(__dirname, '../src/assets/tv-static-no-signal');
const OUTPUT_PATH = path.join(__dirname, '../src/assets/tv-static-sprite-sheet.png');
const FRAMES_PER_ROW = 5;
const TOTAL_FRAMES = 25;

async function createSpriteSheet() {
  try {
    console.log('Creating sprite sheet from individual frames...');

    // Read all frame files
    const frameFiles: string[] = [];
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const frameNum = i.toString().padStart(3, '0');

      // Find the actual file (since the hash part varies)
      const files = fs
        .readdirSync(FRAMES_DIR)
        .filter(f => f.startsWith(`frame_${frameNum}_no_bg_`) && f.endsWith('.png'));

      if (files.length === 0) {
        throw new Error(`Frame ${frameNum} not found`);
      }

      frameFiles.push(path.join(FRAMES_DIR, files[0]));
    }

    console.log(`Found ${frameFiles.length} frames`);

    // Get dimensions of first frame (assuming all frames are same size)
    const firstFrame = sharp(frameFiles[0]);
    const metadata = await firstFrame.metadata();
    const frameWidth = metadata.width!;
    const frameHeight = metadata.height!;

    console.log(`Frame dimensions: ${frameWidth}x${frameHeight}`);

    // Create sprite sheet dimensions
    const sheetWidth = frameWidth * FRAMES_PER_ROW;
    const sheetHeight = frameHeight * FRAMES_PER_ROW;

    console.log(`Sprite sheet dimensions: ${sheetWidth}x${sheetHeight}`);

    // Create composite operations for each frame
    const composites = frameFiles.map((framePath, index) => {
      const col = index % FRAMES_PER_ROW;
      const row = Math.floor(index / FRAMES_PER_ROW);
      const x = col * frameWidth;
      const y = row * frameHeight;

      return {
        input: framePath,
        left: x,
        top: y,
      };
    });

    // Create the sprite sheet
    await sharp({
      create: {
        width: sheetWidth,
        height: sheetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
      },
    })
      .composite(composites)
      .png()
      .toFile(OUTPUT_PATH);

    console.log(`✅ Sprite sheet created successfully at: ${OUTPUT_PATH}`);
    console.log(`   Size: ${sheetWidth}x${sheetHeight}px`);
    console.log(`   Grid: ${FRAMES_PER_ROW}x${FRAMES_PER_ROW} (${TOTAL_FRAMES} frames)`);
  } catch (error) {
    console.error('❌ Error creating sprite sheet:', error);
    process.exit(1);
  }
}

createSpriteSheet();

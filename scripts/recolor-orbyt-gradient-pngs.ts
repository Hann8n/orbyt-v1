/**
 * Recolors alpha-mask gradient PNGs from pure black to the app canonical dark
 * (see `src/theme/colors.ts` — `Colors.black` / `neutral[975]`).
 *
 * Assets are RGBA: the alpha channel defines the fade; RGB was historically
 * #000. This script sets RGB to the target tint while preserving alpha exactly.
 *
 * Usage:
 *   yarn assets:recolor-gradients
 *   ORBYT_BLACK=0a0c10 npx tsx scripts/recolor-orbyt-gradient-pngs.ts
 *   npx tsx scripts/recolor-orbyt-gradient-pngs.ts 0a0c10
 */

import path from 'path';
import sharp from 'sharp';

const GRADIENT_FILES = ['embed-video-gradient-shim.png', 'corner-gradient.png'] as const;

function parseHexRgb(input: string): { r: number; g: number; b: number } {
  const hex = input.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Expected 6-digit hex, got: ${input}`);
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

async function main(): Promise<void> {
  const fromArg = process.argv[2];
  const fromEnv = process.env.ORBYT_BLACK;
  const hex = (fromArg || fromEnv || '05070a').replace(/^#/, '');
  const rgb = parseHexRgb(hex);

  const assetsDir = path.join(__dirname, '..', 'src', 'assets');

  for (const file of GRADIENT_FILES) {
    const filePath = path.join(assetsDir, file);
    const { data, info } = await sharp(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = 4;
    for (let i = 0; i < data.length; i += ch) {
      data[i] = rgb.r;
      data[i + 1] = rgb.g;
      data[i + 2] = rgb.b;
    }
    await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toFile(filePath);
    console.log(`Updated ${path.relative(process.cwd(), filePath)} → #${hex}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

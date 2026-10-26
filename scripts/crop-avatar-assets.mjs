// Deterministic asset preparation: crop the original pixels, never scale or redraw.
// Run from any directory with: node scripts/crop-avatar-assets.mjs
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('src/data/avatar-crops.json', root), 'utf8'));
const output = new URL('src/assets/avatar/cropped/', root);
await mkdir(output, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
try {
  const page = await browser.newPage();
  for (const {id, source, rect, clip} of manifest) {
    const sourceBytes = await readFile(new URL(`src/assets/avatar/${source}`, root));
    const png = await page.evaluate(async ({sourceData, rect, clip}) => {
      const image = new Image();
      image.src = sourceData;
      await image.decode();
      const [x, y, width, height] = rect;
      if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > image.naturalWidth || y + height > image.naturalHeight) {
        throw new Error(`Crop outside image: ${rect}`);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');
      // Some sheets put a neighboring item's shadow in the crop's empty margin.
      // A polygon crop excludes that margin while preserving the full subject.
      if (clip) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.beginPath();
        clip.forEach(([px, py], index) => index === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
        ctx.closePath();
        ctx.clip();
      }
      ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    }, {sourceData: `data:image/png;base64,${sourceBytes.toString('base64')}`, rect, clip});
    await writeFile(new URL(`${id}.png`, output), Buffer.from(png, 'base64'));
  }
  console.log(`Cropped ${manifest.length} avatar references into ${fileURLToPath(output)}`);
} finally {
  await browser.close();
}

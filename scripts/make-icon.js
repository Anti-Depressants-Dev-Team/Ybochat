const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('node:fs');
const path = require('node:path');

const input = path.join(__dirname, '..', 'chat.png');
const buildDir = path.join(__dirname, '..', 'build');
const iconDir = path.join(buildDir, 'icons');

async function main() {
  if (!fs.existsSync(input)) {
    console.error('chat.png not found');
    process.exit(1);
  }

  fs.mkdirSync(iconDir, { recursive: true });

  // Windows .ico
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map(s => sharp(input).resize(s, s).png().toBuffer()));
  const ico = await toIco(pngs);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  console.log(`Created build/icon.ico`);

  // Linux icons (electron-builder expects PNGs in build/icons/)
  const linuxSizes = [16, 32, 48, 64, 128, 256, 512];
  for (const s of linuxSizes) {
    await sharp(input).resize(s, s).png().toFile(path.join(iconDir, `${s}x${s}.png`));
  }
  console.log(`Created build/icons/ (${linuxSizes.join(', ')}px)`);
}

main().catch(e => { console.error(e); process.exit(1); });

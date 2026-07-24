const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('node:fs');
const path = require('node:path');

const input = path.join(__dirname, '..', 'chat.png');
const outDir = path.join(__dirname, '..', 'build');
const outFile = path.join(outDir, 'icon.ico');

async function main() {
  if (!fs.existsSync(input)) {
    console.error('chat.png not found');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const sizes = [16, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(
    sizes.map(size =>
      sharp(input).resize(size, size).png().toBuffer()
    )
  );

  const ico = await toIco(pngs);
  fs.writeFileSync(outFile, ico);
  console.log(`Created ${outFile} (${sizes.join(', ')}px)`);
}

main().catch(e => { console.error(e); process.exit(1); });

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const cacheDir = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');

// Delete all corrupted directories
if (fs.existsSync(cacheDir)) {
  console.log('Cleaning corrupted cache...');
  fs.rmSync(cacheDir, { recursive: true, force: true });
  console.log('Deleted', cacheDir);
}

// Download and extract fresh
const url = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z';
const tmpFile = path.join(os.tmpdir(), 'winCodeSign.7z');
const extractDir = path.join(cacheDir, 'winCodeSign-2.6.0');

console.log('Downloading winCodeSign...');
execSync(`powershell -Command "Invoke-WebRequest '${url}' -OutFile '${tmpFile}'"`, { stdio: 'inherit', timeout: 30000 });

fs.mkdirSync(extractDir, { recursive: true });
console.log('Extracting without symlinks...');

const sevenZip = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
execSync(`"${sevenZip}" x "${tmpFile}" -o"${extractDir}" -snld- -y`, { stdio: 'inherit', timeout: 30000 });

// Clean up temp
fs.unlinkSync(tmpFile);
console.log('Cache fixed!');

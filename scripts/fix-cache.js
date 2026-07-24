// Pre-extracts the winCodeSign archive so electron-builder doesn't fail on symlinks.
// electron-builder's 7-Zip extraction uses -snld which errors on Windows without admin.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const cacheDir = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');
const sevenZip = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
const url = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z';
const archiveName = 'winCodeSign-2.6.0.7z';
const extractDirName = 'winCodeSign-2.6.0';

// Create cache dir
fs.mkdirSync(cacheDir, { recursive: true });

const archivePath = path.join(cacheDir, archiveName);
const extractPath = path.join(cacheDir, extractDirName);

// Clean corrupted extraction
if (fs.existsSync(extractPath)) {
  // Check if the darwin symlinks exist (they cause the error)
  const symlinkTest = path.join(extractPath, 'darwin', '10.12', 'lib', 'libcrypto.dylib');
  try {
    fs.accessSync(symlinkTest);
    console.log('Existing extraction looks ok');
  } catch {
    console.log('Removing corrupted extraction...');
    fs.rmSync(extractPath, { recursive: true, force: true });
  }
}

// Download archive if needed
if (!fs.existsSync(archivePath)) {
  console.log('Downloading winCodeSign archive...');
  execSync(
    `powershell -NoProfile -Command "Invoke-WebRequest '${url}' -OutFile '${archivePath}'"`,
    { stdio: 'inherit', timeout: 30000 }
  );
}

// Extract without symlinks
if (!fs.existsSync(extractPath)) {
  console.log('Extracting (symlink-free)...');
  fs.mkdirSync(extractPath, { recursive: true });
  execSync(
    `"${sevenZip}" x "${archivePath}" -o"${extractPath}" -snld- -y`,
    { stdio: 'inherit', timeout: 30000 }
  );
  console.log('Cache ready.');
} else {
  console.log('Cache already valid.');
}

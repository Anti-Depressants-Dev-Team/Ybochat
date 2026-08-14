const { app, net, session } = require('electron');
const { unzipSync } = require('fflate');
const {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} = require('node:fs/promises');
const path = require('node:path');

const VENCORD_EXTENSION_ID = 'cbghhgpcnddeihccjmnadmkaejncjndb';
const VENCORD_PARTITION = 'persist:vencord';
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 100 * 1024 * 1024;

let extensionPromise = null;

function crxToZip(crx) {
  if (crx.subarray(0, 4).toString('ascii') !== 'Cr24') {
    throw new Error('The Chrome Web Store returned an invalid extension package.');
  }

  const version = crx.readUInt32LE(4);
  let zipOffset;

  if (version === 2) {
    zipOffset = 16 + crx.readUInt32LE(8) + crx.readUInt32LE(12);
  } else if (version === 3) {
    zipOffset = 12 + crx.readUInt32LE(8);
  } else {
    throw new Error(`Unsupported CRX version: ${version}`);
  }

  if (zipOffset >= crx.length) throw new Error('The extension package is truncated.');
  return crx.subarray(zipOffset);
}

function safeArchivePath(root, archivePath) {
  const normalized = archivePath.replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);

  if (
    normalized.startsWith('/') ||
    normalized.includes('\0') ||
    parts.some(part => part === '..' || part.includes(':'))
  ) {
    throw new Error(`Unsafe path in extension package: ${archivePath}`);
  }

  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, ...parts);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Path escapes extension directory: ${archivePath}`);
  }
  return resolvedPath;
}

async function isUsableExtension(extensionDir) {
  try {
    const manifest = JSON.parse(await readFile(path.join(extensionDir, 'manifest.json'), 'utf-8'));
    return manifest.name === 'Vencord Web' && typeof manifest.version === 'string';
  } catch (error) {
    return false;
  }
}

async function readCache(cacheRoot) {
  try {
    const cache = JSON.parse(await readFile(path.join(cacheRoot, 'current.json'), 'utf-8'));
    if (!/^[0-9.]{1,64}$/.test(cache.version)) return null;

    const extensionDir = path.join(cacheRoot, 'versions', cache.version);
    if (!(await isUsableExtension(extensionDir))) return null;
    return { ...cache, extensionDir };
  } catch (error) {
    return null;
  }
}

async function downloadExtension() {
  const updateUrl = new URL('https://clients2.google.com/service/update2/crx');
  updateUrl.searchParams.set('response', 'redirect');
  updateUrl.searchParams.set('acceptformat', 'crx2,crx3');
  updateUrl.searchParams.set('x', `id=${VENCORD_EXTENSION_ID}&uc`);
  updateUrl.searchParams.set('prodversion', process.versions.chrome);

  const response = await net.fetch(updateUrl.toString(), {
    headers: {
      'User-Agent': `Ybochat/${app.getVersion()} Electron/${process.versions.electron}`
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) throw new Error(`Chrome Web Store returned HTTP ${response.status}.`);

  const declaredSize = Number(response.headers.get('content-length'));
  if (declaredSize > MAX_DOWNLOAD_BYTES) throw new Error('The extension download is unexpectedly large.');

  const crx = Buffer.from(await response.arrayBuffer());
  if (crx.length > MAX_DOWNLOAD_BYTES) throw new Error('The extension download is unexpectedly large.');
  return unzipSync(crxToZip(crx));
}

async function installDownloadedExtension(cacheRoot, files) {
  const manifestData = files['manifest.json'];
  if (!manifestData) throw new Error('The extension package has no manifest.');

  const manifest = JSON.parse(Buffer.from(manifestData).toString('utf-8'));
  if (manifest.name !== 'Vencord Web' || !/^[0-9.]{1,64}$/.test(manifest.version)) {
    throw new Error('The downloaded package is not Vencord Web.');
  }

  const versionsRoot = path.join(cacheRoot, 'versions');
  const extensionDir = path.join(versionsRoot, manifest.version);
  if (await isUsableExtension(extensionDir)) return { extensionDir, version: manifest.version };

  let extractedBytes = 0;
  for (const data of Object.values(files)) extractedBytes += data.byteLength;
  if (extractedBytes > MAX_EXTRACTED_BYTES) throw new Error('The unpacked extension is unexpectedly large.');

  await mkdir(versionsRoot, { recursive: true });
  const temporaryDir = await mkdtemp(path.join(versionsRoot, '.install-'));

  try {
    for (const [archivePath, data] of Object.entries(files)) {
      // Chromium reserves this Chrome Web Store metadata directory.
      if (archivePath === '_metadata/' || archivePath.startsWith('_metadata/')) continue;

      const outputPath = safeArchivePath(temporaryDir, archivePath);
      if (archivePath.endsWith('/')) {
        await mkdir(outputPath, { recursive: true });
        continue;
      }

      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, data);
    }

    try {
      await rename(temporaryDir, extensionDir);
    } catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
    }
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }

  return { extensionDir, version: manifest.version };
}

async function writeCache(cacheRoot, version) {
  await mkdir(cacheRoot, { recursive: true });
  await writeFile(
    path.join(cacheRoot, 'current.json'),
    JSON.stringify({ version, checkedAt: Date.now() }, null, 2),
    'utf-8'
  );
}

async function resolveExtensionDirectory() {
  const cacheRoot = path.join(app.getPath('userData'), 'extensions', 'vencord-web');
  const cached = await readCache(cacheRoot);
  if (cached && Date.now() - cached.checkedAt < UPDATE_INTERVAL_MS) return cached.extensionDir;

  try {
    const files = await downloadExtension();
    const installed = await installDownloadedExtension(cacheRoot, files);
    await writeCache(cacheRoot, installed.version);
    return installed.extensionDir;
  } catch (error) {
    if (!cached) throw error;
    await writeCache(cacheRoot, cached.version);
    console.warn('Could not refresh Vencord Web; using the cached extension:', error.message);
    return cached.extensionDir;
  }
}

async function loadVencordExtension() {
  const vencordSession = session.fromPartition(VENCORD_PARTITION);
  const existing = vencordSession.extensions.getAllExtensions()
    .find(extension => extension.name === 'Vencord Web');
  if (existing) return existing;

  const extensionDir = await resolveExtensionDirectory();
  return vencordSession.extensions.loadExtension(extensionDir);
}

function ensureVencordExtension() {
  if (!extensionPromise) {
    extensionPromise = loadVencordExtension().catch(error => {
      extensionPromise = null;
      throw error;
    });
  }
  return extensionPromise;
}

module.exports = {
  VENCORD_PARTITION,
  ensureVencordExtension
};

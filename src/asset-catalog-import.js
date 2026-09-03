const { unzipSync } = typeof process === 'object' && process.versions?.node
  ? await import('fflate')
  : await import('../node_modules/fflate/esm/browser.js');
import { validatePixelMapAssets } from './pixel-map-assets-format.js';

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 500;
const textDecoder = new TextDecoder();

const isSelfContainedSource = (source) => source.startsWith('data:image/') || /^https:\/\//i.test(source);
const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

function importError(message, issues = null) {
  const error = new Error(message);
  if (issues) error.issues = issues;
  return error;
}

function validateCatalog(catalog) {
  const validation = validatePixelMapAssets(catalog);
  if (!validation.valid) throw importError('Le catalogue Pixel Map Assets est invalide.', validation.issues);
  return validation;
}

function safeArchivePath(path) {
  if (!path || path.startsWith('/') || path.includes('\\')) throw importError(`Chemin interdit dans le paquet : ${path || '(vide)'}.`);
  const result = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!result.length) throw importError(`Le chemin sort du paquet : ${path}.`);
      result.pop();
    } else result.push(part);
  }
  return result.join('/');
}

function resolvePackagePath(catalogPath, source) {
  const base = safeArchivePath(catalogPath).split('/');
  base.pop();
  return safeArchivePath([...base, ...source.split('/')].join('/'));
}

function findCatalog(files) {
  const candidates = [];
  for (const [path, bytes] of files) {
    if (!/\.json$/i.test(path)) continue;
    try {
      const value = JSON.parse(textDecoder.decode(bytes));
      if (value?.format === 'pixel-map-assets') candidates.push({ path, catalog: value });
    } catch {
      // Les autres fichiers JSON du paquet ne font pas partie du contrat public.
    }
  }
  if (candidates.length !== 1) throw importError(candidates.length ? 'Le paquet contient plusieurs catalogues Pixel Map Assets.' : 'Le paquet ne contient aucun catalogue Pixel Map Assets.');
  return candidates[0];
}

function registerPackagedCatalog(registry, catalog, catalogPath, files, { createObjectURL, revokeObjectURL }) {
  validateCatalog(catalog);
  const objectUrls = new Map();
  try {
    for (const resource of catalog.resources) {
      if (isSelfContainedSource(resource.source)) continue;
      const assetPath = resolvePackagePath(catalogPath, resource.source);
      const bytes = files.get(assetPath);
      if (!bytes) throw importError(`Image absente du paquet : ${resource.source}.`);
      const extension = assetPath.split('.').pop().toLowerCase();
      const url = createObjectURL(new Blob([bytes], { type: mimeTypes[extension] || 'application/octet-stream' }));
      objectUrls.set(resource.source, url);
    }
    const library = registry.addLibrary(catalog, {
      sourceResolver: (source) => objectUrls.get(source) || source,
      dispose: () => objectUrls.forEach((url) => revokeObjectURL(url)),
    });
    return { mode: 'package', library, objectUrls: new Map(objectUrls) };
  } catch (error) {
    objectUrls.forEach((url) => revokeObjectURL(url));
    throw error;
  }
}

export async function importAssetCatalogFromUrl(url, registry, { fetchImpl = fetch } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { throw importError('L’URL du catalogue est invalide.'); }
  if (parsed.protocol !== 'https:') throw importError('Le catalogue distant doit utiliser HTTPS.');
  const response = await fetchImpl(parsed.href);
  if (!response.ok) throw importError(`Impossible de télécharger le catalogue (${response.status}).`);
  const catalog = await response.json();
  validateCatalog(catalog);
  const library = registry.addLibrary(catalog, { baseUrl: response.url || parsed.href });
  return { mode: 'url', library };
}

export async function importAssetCatalogFile(file, registry) {
  const catalog = JSON.parse(await file.text());
  validateCatalog(catalog);
  const relative = catalog.resources.find((resource) => !isSelfContainedSource(resource.source));
  if (relative) throw importError(`La source relative ${relative.source} nécessite un paquet ZIP, un dossier ou un catalogue chargé par URL HTTPS.`);
  return { mode: 'file', library: registry.addLibrary(catalog) };
}

export async function importAssetCatalogPackage(file, registry, {
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
} = {}) {
  if (file.size > MAX_ARCHIVE_BYTES) throw importError('Le paquet dépasse la limite de 25 Mio.');
  const archive = new Uint8Array(await file.arrayBuffer());
  let count = 0;
  let expandedBytes = 0;
  let unpacked;
  try {
    unpacked = unzipSync(archive, { filter: (entry) => {
      count += 1; expandedBytes += entry.originalSize;
      if (count > MAX_FILES) throw importError(`Le paquet dépasse la limite de ${MAX_FILES} fichiers.`);
      if (expandedBytes > MAX_EXPANDED_BYTES) throw importError('Le paquet décompressé dépasse la limite de 100 Mio.');
      return !entry.name.endsWith('/');
    } });
  } catch (error) {
    if (error.issues || /limite/.test(error.message)) throw error;
    throw importError(`Paquet ZIP invalide : ${error.message}`);
  }
  const files = new Map(Object.entries(unpacked).map(([path, bytes]) => [safeArchivePath(path), bytes]));
  const { path, catalog } = findCatalog(files);
  return registerPackagedCatalog(registry, catalog, path, files, { createObjectURL, revokeObjectURL });
}

async function collectDirectoryFiles(directory, prefix = '', files = new Map(), limits = { count: 0, bytes: 0 }) {
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') await collectDirectoryFiles(handle, path, files, limits);
    else {
      const file = await handle.getFile();
      limits.count += 1; limits.bytes += file.size;
      if (limits.count > MAX_FILES) throw importError(`Le dossier dépasse la limite de ${MAX_FILES} fichiers.`);
      if (limits.bytes > MAX_EXPANDED_BYTES) throw importError('Le dossier dépasse la limite de 100 Mio.');
      files.set(safeArchivePath(path), new Uint8Array(await file.arrayBuffer()));
    }
  }
  return files;
}

export async function importAssetCatalogDirectory(registry, {
  pickDirectory = globalThis.showDirectoryPicker?.bind(globalThis),
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
} = {}) {
  if (typeof pickDirectory !== 'function') throw importError('L’ouverture de dossier n’est pas prise en charge par ce navigateur.');
  const directory = await pickDirectory();
  const files = await collectDirectoryFiles(directory);
  const { path, catalog } = findCatalog(files);
  const result = registerPackagedCatalog(registry, catalog, path, files, { createObjectURL, revokeObjectURL });
  return { ...result, mode: 'directory' };
}

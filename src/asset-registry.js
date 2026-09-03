import { qualifyAssetReference } from './asset-reference.js';
import { validatePixelMapAssets } from './pixel-map-assets-format.js';

function resolveAssetSource(source, baseUrl) {
  if (!baseUrl || source.startsWith('data:image/') || /^https:\/\//i.test(source)) return source;
  return new URL(source, baseUrl).href;
}

function portableAssetSource(source, baseUrl) {
  if (!baseUrl || source.startsWith('data:image/') || /^https:\/\//i.test(source)) return source;
  const resolved = new URL(source, baseUrl);
  return resolved.protocol === 'https:' ? resolved.href : source;
}

export class AssetRegistry {
  constructor() {
    this.libraries = new Map();
    this.assets = new Map();
  }

  addLibrary(library, { baseUrl = null, draw = null, sourceResolver = null, dispose = null } = {}) {
    const validation = validatePixelMapAssets(library);
    if (!validation.valid) {
      const error = new Error(`Catalogue ${library?.id || 'inconnu'} invalide.`);
      error.issues = validation.issues;
      throw error;
    }
    if (this.libraries.has(library.id)) throw new Error(`Bibliothèque déjà chargée : ${library.id}.`);

    const normalized = library.resources.map((resource) => {
      const ref = qualifyAssetReference(library.id, resource.id);
      return Object.freeze({
        ref,
        libraryId: library.id,
        id: resource.id,
        name: resource.name,
        type: resource.type,
        source: resource.source,
        resolvedSource: sourceResolver ? sourceResolver(resource.source, resource) : resolveAssetSource(resource.source, baseUrl),
        portableSource: portableAssetSource(resource.source, baseUrl),
        width: resource.size.width,
        height: resource.size.height,
        anchor: Object.freeze({ ...resource.anchor }),
        category: resource.category,
        tags: Object.freeze([...resource.tags]),
        properties: Object.freeze(structuredClone(resource.properties)),
      });
    });

    const record = Object.freeze({
      id: library.id,
      name: library.name,
      baseUrl,
      draw,
      dispose,
      catalog: structuredClone(library),
      assets: Object.freeze(normalized),
    });
    this.libraries.set(library.id, record);
    normalized.forEach((asset) => this.assets.set(asset.ref, asset));
    return record;
  }

  removeLibrary(libraryId) {
    const library = this.libraries.get(libraryId);
    if (!library) return false;
    library.assets.forEach((asset) => this.assets.delete(asset.ref));
    this.libraries.delete(libraryId);
    library.dispose?.();
    return true;
  }

  get(resourceRef) {
    return this.assets.get(resourceRef) ?? null;
  }

  search(query = '', category = 'all') {
    const needle = query.trim().toLocaleLowerCase();
    return [...this.assets.values()].filter((asset) => {
      if (category !== 'all' && asset.category !== category) return false;
      if (!needle) return true;
      return [asset.name, asset.id, asset.ref, ...asset.tags]
        .some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }

  resolveSource(resourceRef) {
    return this.get(resourceRef)?.resolvedSource ?? null;
  }

  draw(context, resourceRef, x, y, scale = 1, rotation = 0) {
    const asset = this.get(resourceRef);
    const renderer = asset && this.libraries.get(asset.libraryId)?.draw;
    if (!renderer) return false;
    renderer(context, asset, x, y, scale, rotation);
    return true;
  }
}

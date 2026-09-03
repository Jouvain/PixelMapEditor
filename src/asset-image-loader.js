export const ASSET_IMAGE_LOADING = 'loading';
export const ASSET_IMAGE_READY = 'ready';
export const ASSET_IMAGE_ERROR = 'error';

export class AssetImageLoader {
  constructor({ createImage = () => new Image() } = {}) {
    this.createImage = createImage;
    this.records = new Map();
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(source, record) {
    this.listeners.forEach((listener) => listener(source, record));
  }

  load(source) {
    const existing = this.records.get(source);
    if (existing?.status === ASSET_IMAGE_READY) return Promise.resolve(existing.image);
    if (existing?.status === ASSET_IMAGE_LOADING) return existing.promise;
    if (existing?.status === ASSET_IMAGE_ERROR) return Promise.reject(existing.error);
    if (typeof source !== 'string' || source.length === 0) return Promise.reject(new TypeError('Une source d’image est obligatoire.'));

    let image;
    try {
      image = this.createImage();
    } catch (error) {
      const record = { status: ASSET_IMAGE_ERROR, image: null, error, promise: Promise.reject(error) };
      this.records.set(source, record);
      this.notify(source, record);
      return record.promise;
    }

    const record = { status: ASSET_IMAGE_LOADING, image, error: null, promise: null };
    const promise = new Promise((resolve, reject) => {
      image.onload = () => {
        record.status = ASSET_IMAGE_READY; record.error = null;
        this.notify(source, record); resolve(image);
      };
      image.onerror = () => {
        const error = new Error(`Impossible de charger l’image : ${source}`);
        record.status = ASSET_IMAGE_ERROR; record.image = null; record.error = error;
        this.notify(source, record); reject(error);
      };
      if (/^https:\/\//i.test(source)) image.crossOrigin = 'anonymous';
      image.src = source;
    });
    record.promise = promise;
    this.records.set(source, record);
    return promise;
  }

  request(source) {
    if (!this.records.has(source)) this.load(source).catch(() => {});
    return this.records.get(source) ?? null;
  }

  get(source) { return this.records.get(source) ?? null; }

  retry(source) {
    this.records.delete(source);
    return this.load(source);
  }

  clear(source = null) {
    if (source === null) this.records.clear();
    else this.records.delete(source);
  }
}

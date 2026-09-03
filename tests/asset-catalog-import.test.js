import test from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { AssetRegistry } from '../src/asset-registry.js';
import { importAssetCatalogFile, importAssetCatalogFromUrl, importAssetCatalogPackage } from '../src/asset-catalog-import.js';

function catalog(source = 'images/desk.svg') {
  return {
    format: 'pixel-map-assets', version: '1.0', id: 'office', name: 'Bureau', properties: {},
    resources: [{ id: 'desk', name: 'Bureau', type: 'image', source,
      size: { width: 32, height: 24 }, anchor: { x: 0.5, y: 1 },
      category: 'furniture', tags: [], properties: {} }],
  };
}

function jsonFile(value) {
  const contents = JSON.stringify(value);
  return { size: contents.length, text: async () => contents };
}

test('importe un catalogue HTTPS et rend ses chemins relatifs portables', async () => {
  const registry = new AssetRegistry();
  const fetchImpl = async () => ({ ok: true, status: 200,
    url: 'https://cdn.example/assets/catalog.json', json: async () => catalog() });
  await importAssetCatalogFromUrl('https://cdn.example/assets/catalog.json', registry, { fetchImpl });
  const asset = registry.get('office:desk');
  assert.equal(asset.resolvedSource, 'https://cdn.example/assets/images/desk.svg');
  assert.equal(asset.portableSource, 'https://cdn.example/assets/images/desk.svg');
  await assert.rejects(() => importAssetCatalogFromUrl('http://example.test/catalog.json', new AssetRegistry()), /HTTPS/);
});

test('un JSON autonome accepte data: mais refuse une source relative', async () => {
  const registry = new AssetRegistry();
  await importAssetCatalogFile(jsonFile(catalog('data:image/svg+xml,%3Csvg/%3E')), registry);
  assert.match(registry.resolveSource('office:desk'), /^data:image/);
  await assert.rejects(() => importAssetCatalogFile(jsonFile(catalog()), new AssetRegistry()), /paquet ZIP/);
});

test('un ZIP crée des blob temporaires puis les révoque sans les rendre portables', async () => {
  const bytes = zipSync({ 'catalog.json': strToU8(JSON.stringify(catalog())),
    'images/desk.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  const file = { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const revoked = [];
  const registry = new AssetRegistry();
  const result = await importAssetCatalogPackage(file, registry, {
    createObjectURL: () => 'blob:test-desk', revokeObjectURL: (url) => revoked.push(url),
  });
  assert.equal(result.mode, 'package');
  assert.equal(registry.get('office:desk').resolvedSource, 'blob:test-desk');
  assert.equal(registry.get('office:desk').portableSource, 'images/desk.svg');
  registry.removeLibrary('office');
  assert.deepEqual(revoked, ['blob:test-desk']);
});

test('un paquet incomplet est refusé et nettoie les URL déjà créées', async () => {
  const value = catalog();
  value.resources.push({ ...value.resources[0], id: 'chair', source: 'images/missing.svg' });
  const bytes = zipSync({ 'catalog.json': strToU8(JSON.stringify(value)),
    'images/desk.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  const file = { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const revoked = [];
  await assert.rejects(() => importAssetCatalogPackage(file, new AssetRegistry(), {
    createObjectURL: () => 'blob:test-desk', revokeObjectURL: (url) => revoked.push(url),
  }), /Image absente/);
  assert.deepEqual(revoked, ['blob:test-desk']);
});

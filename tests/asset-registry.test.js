import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetRegistry } from '../src/asset-registry.js';
import { createPixelMapAssets } from '../src/pixel-map-assets-format.js';

function library(id = 'office') {
  return createPixelMapAssets({
    id,
    name: 'Mobilier de bureau',
    resources: [{
      id: 'desk.standard', name: 'Bureau standard', type: 'image', source: './previews/desk.png',
      size: { width: 64, height: 48 }, anchor: { x: 0.5, y: 1 },
      category: 'furniture', tags: ['desk', 'work'], properties: { fixture: true },
    }],
  });
}

test('normalise une bibliothèque et résout ses sources relativement au catalogue', () => {
  const registry = new AssetRegistry();
  registry.addLibrary(library(), { baseUrl: 'https://example.test/assets/office.pmap-assets.json' });
  assert.deepEqual(registry.get('office:desk.standard'), {
    ref: 'office:desk.standard', libraryId: 'office', id: 'desk.standard', name: 'Bureau standard',
    type: 'image', source: './previews/desk.png', resolvedSource: 'https://example.test/assets/previews/desk.png',
    width: 64, height: 48, anchor: { x: 0.5, y: 1 }, category: 'furniture',
    tags: ['desk', 'work'], properties: { fixture: true },
  });
  assert.equal(registry.resolveSource('office:desk.standard'), 'https://example.test/assets/previews/desk.png');
});

test('recherche par nom, identifiant, tag et catégorie', () => {
  const registry = new AssetRegistry();
  registry.addLibrary(library());
  assert.deepEqual(registry.search('bureau').map((asset) => asset.ref), ['office:desk.standard']);
  assert.deepEqual(registry.search('work').map((asset) => asset.ref), ['office:desk.standard']);
  assert.deepEqual(registry.search('', 'furniture').map((asset) => asset.ref), ['office:desk.standard']);
  assert.deepEqual(registry.search('', 'nature'), []);
});

test('refuse une bibliothèque invalide ou déjà chargée et sait la retirer', () => {
  const registry = new AssetRegistry();
  assert.throws(() => registry.addLibrary({ id: 'invalid' }), (error) => error.issues.length > 0);
  registry.addLibrary(library());
  assert.throws(() => registry.addLibrary(library()), /déjà chargée/);
  assert.equal(registry.removeLibrary('office'), true);
  assert.equal(registry.get('office:desk.standard'), null);
  assert.equal(registry.removeLibrary('office'), false);
});

test('délègue le dessin au renderer de la bibliothèque', () => {
  const calls = [];
  const registry = new AssetRegistry();
  registry.addLibrary(library(), { draw: (...args) => calls.push(args) });
  const context = {};
  assert.equal(registry.draw(context, 'office:desk.standard', 10, 20, 0.5, 2), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], context);
  assert.equal(calls[0][1].ref, 'office:desk.standard');
  assert.equal(registry.draw(context, 'missing:asset', 0, 0), false);
});

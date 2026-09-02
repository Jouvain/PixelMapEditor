import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createPixelMapAssets, PIXEL_MAP_ASSETS_FORMAT, PIXEL_MAP_ASSETS_VERSION, validatePixelMapAssets,
} from '../src/pixel-map-assets-format.js';

function image(overrides = {}) {
  return {
    id: 'desk.standard', name: 'Bureau standard', type: 'image',
    source: './previews/desk.png', size: { width: 64, height: 48 },
    anchor: { x: 0.5, y: 1 }, category: 'furniture', tags: ['desk', 'office'], properties: {},
    ...overrides,
  };
}

function catalog(resources = [image()]) {
  return createPixelMapAssets({ id: 'office', name: 'Mobilier de bureau', resources });
}

test('crée un catalogue Pixel Map Assets v1 valide et ses références qualifiées', () => {
  const document = catalog();
  const validation = validatePixelMapAssets(document);
  assert.equal(document.format, PIXEL_MAP_ASSETS_FORMAT);
  assert.equal(document.version, PIXEL_MAP_ASSETS_VERSION);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues));
  assert.deepEqual(validation.references, ['office:desk.standard']);
});

test('détecte les formats et versions inconnus', () => {
  const document = catalog();
  document.format = 'other-assets';
  document.version = '2.0';
  const validation = validatePixelMapAssets(document);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((item) => item.code === 'unknown-format'));
  assert.ok(validation.issues.some((item) => item.code === 'unsupported-version'));
});

test('détecte les identifiants dupliqués et les identifiants déjà qualifiés', () => {
  const duplicate = validatePixelMapAssets(catalog([image(), image({ name: 'Copie' })]));
  assert.ok(duplicate.issues.some((item) => item.code === 'duplicate-id'));

  const ambiguous = validatePixelMapAssets(catalog([image({ id: 'office:desk.standard' })]));
  assert.ok(ambiguous.issues.some((item) => item.code === 'ambiguous-resource-id'));
  assert.deepEqual(ambiguous.references, []);
});

test('détecte les sources absentes, non portables ou propres à un moteur', () => {
  for (const source of ['', 'http://example.com/desk.png', 'res://desk.png', 'C:\\game\\desk.png', '/game/desk.png', 'blob:preview']) {
    const validation = validatePixelMapAssets(catalog([image({ source })]));
    assert.equal(validation.valid, false, source);
    assert.ok(validation.issues.some((item) => ['missing-source', 'invalid-source'].includes(item.code)), source);
  }
  for (const source of ['./desk.png', '../images/desk.webp', 'https://example.com/desk.svg', 'data:image/png;base64,AA==']) {
    const validation = validatePixelMapAssets(catalog([image({ source })]));
    assert.equal(validation.valid, true, `${source}: ${JSON.stringify(validation.issues)}`);
  }
});

test('détecte les dimensions incorrectes', () => {
  for (const size of [{ width: 0, height: 48 }, { width: 64.5, height: 48 }, { width: 64, height: -1 }, null]) {
    const validation = validatePixelMapAssets(catalog([image({ size })]));
    assert.equal(validation.valid, false, JSON.stringify(size));
    assert.ok(validation.issues.some((item) => ['invalid-size', 'invalid-dimension'].includes(item.code)));
  }
});

test('détecte les ancres hors de l’intervalle normalisé', () => {
  for (const anchor of [{ x: -0.1, y: 1 }, { x: 0.5, y: 1.1 }, { x: NaN, y: 0 }, null]) {
    const validation = validatePixelMapAssets(catalog([image({ anchor })]));
    assert.equal(validation.valid, false, JSON.stringify(anchor));
    assert.ok(validation.issues.some((item) => item.code === 'invalid-anchor'));
  }
});

test('limite la v1 aux images et valide tags, catégorie et propriétés JSON', () => {
  const document = catalog([image({
    type: 'atlas', category: '', tags: ['office', 'office'],
  })]);
  document.resources[0].properties.invalid = () => true;
  const validation = validatePixelMapAssets(document);
  assert.equal(validation.valid, false);
  for (const code of ['invalid-resource-type', 'invalid-category', 'duplicate-tag', 'non-json-properties'])
    assert.ok(validation.issues.some((item) => item.code === code), code);
});

test('la fixture office est valide et toutes ses previews relatives existent', async () => {
  const catalogUrl = new URL('./fixtures/pixel-map-assets/office.pmap-assets.json', import.meta.url);
  const document = JSON.parse(await readFile(catalogUrl, 'utf8'));
  const validation = validatePixelMapAssets(document);

  assert.equal(validation.valid, true, JSON.stringify(validation.issues));
  assert.deepEqual(validation.references, [
    'office:desk.standard',
    'office:chair.task',
    'office:plant.potted',
  ]);

  await Promise.all(document.resources.map(async (resource) => {
    const previewUrl = new URL(resource.source, catalogUrl);
    await access(fileURLToPath(previewUrl));
  }));
});

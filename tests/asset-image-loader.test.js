import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_IMAGE_ERROR, ASSET_IMAGE_LOADING, ASSET_IMAGE_READY, AssetImageLoader,
} from '../src/asset-image-loader.js';

function fakeImageFactory() {
  const images = [];
  return {
    images,
    createImage: () => {
      const image = { onload: null, onerror: null, crossOrigin: null, src: null };
      images.push(image);
      return image;
    },
  };
}

test('charge une image une seule fois et expose les états loading puis ready', async () => {
  const factory = fakeImageFactory();
  const loader = new AssetImageLoader(factory);
  const changes = [];
  loader.subscribe((source, record) => changes.push([source, record.status]));

  const first = loader.load('https://example.test/desk.png');
  const second = loader.load('https://example.test/desk.png');
  assert.equal(first, second);
  assert.equal(loader.get('https://example.test/desk.png').status, ASSET_IMAGE_LOADING);
  assert.equal(factory.images[0].crossOrigin, 'anonymous');

  factory.images[0].onload();
  assert.equal(await first, factory.images[0]);
  assert.equal(loader.get('https://example.test/desk.png').status, ASSET_IMAGE_READY);
  assert.deepEqual(changes, [['https://example.test/desk.png', ASSET_IMAGE_READY]]);
});

test('conserve une erreur de chargement et permet une nouvelle tentative explicite', async () => {
  const factory = fakeImageFactory();
  const loader = new AssetImageLoader(factory);
  const first = loader.load('./missing.png');
  factory.images[0].onerror();
  await assert.rejects(first, /Impossible de charger/);
  assert.equal(loader.get('./missing.png').status, ASSET_IMAGE_ERROR);

  const retry = loader.retry('./missing.png');
  assert.equal(factory.images.length, 2);
  factory.images[1].onload();
  await retry;
  assert.equal(loader.get('./missing.png').status, ASSET_IMAGE_READY);
});

test('request déclenche le chargement sans produire de rejet non géré', () => {
  const factory = fakeImageFactory();
  const loader = new AssetImageLoader(factory);
  assert.equal(loader.request('./desk.png').status, ASSET_IMAGE_LOADING);
  factory.images[0].onerror();
  assert.equal(loader.get('./desk.png').status, ASSET_IMAGE_ERROR);
});

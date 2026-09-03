import test from 'node:test';
import assert from 'node:assert/strict';
import { assetDrawBox, MapRenderer } from '../src/map-renderer.js';

function contextRecorder() {
  const calls = [];
  return {
    calls,
    save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
    translate(...args) { calls.push(['translate', ...args]); }, rotate(...args) { calls.push(['rotate', ...args]); },
    drawImage(...args) { calls.push(['drawImage', ...args]); },
    fillRect(...args) { calls.push(['fillRect', ...args]); }, strokeRect(...args) { calls.push(['strokeRect', ...args]); },
    fillText(...args) { calls.push(['fillText', ...args]); },
  };
}

const asset = {
  ref: 'office:desk.standard', resolvedSource: './desk.png', width: 64, height: 48,
  anchor: { x: 0.5, y: 1 },
};

function rendererWith(record, registeredAsset = asset) {
  const renderer = Object.create(MapRenderer.prototype);
  renderer.assetRegistry = { draw: () => false, get: () => registeredAsset };
  renderer.assetImageLoader = { request: () => record };
  return renderer;
}

test('calcule la boîte de dessin depuis la position de l’ancre', () => {
  assert.deepEqual(assetDrawBox(asset, 128, 96), { x: 96, y: 48, width: 64, height: 48 });
  assert.deepEqual(assetDrawBox(asset, 128, 96, 0.5), { x: 112, y: 72, width: 32, height: 24 });
});

test('dessine une image prête relativement à son ancre et sa rotation', () => {
  const image = {};
  const context = contextRecorder();
  const status = rendererWith({ status: 'ready', image }).drawAsset(context, asset.ref, 128, 96, { rotation: 1 });
  assert.equal(status, 'ready');
  assert.ok(context.calls.some((call) => call[0] === 'translate' && call[1] === 128 && call[2] === 96));
  assert.ok(context.calls.some((call) => call[0] === 'rotate' && call[1] === Math.PI / 2));
  assert.ok(context.calls.some((call) => call[0] === 'drawImage' && call[2] === -32 && call[3] === -48 && call[4] === 64 && call[5] === 48));
});

test('distingue les placeholders loading, error et missing avec la référence', () => {
  for (const [record, registeredAsset, expectedStatus, expectedLabel] of [
    [{ status: 'loading' }, asset, 'loading', 'Chargement…'],
    [{ status: 'error' }, asset, 'error', 'Image invalide'],
    [null, null, 'missing', 'Asset manquant'],
  ]) {
    const context = contextRecorder();
    const status = rendererWith(record, registeredAsset).drawAsset(context, asset.ref, 20, 30);
    assert.equal(status, expectedStatus);
    assert.ok(context.calls.some((call) => call[0] === 'fillText' && call[1] === expectedLabel));
    assert.ok(context.calls.some((call) => call[0] === 'fillText' && call[1] === asset.ref));
  }
});

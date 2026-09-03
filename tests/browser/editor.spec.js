import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'pixel-map-project-v1';

async function openEmptyEditor(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#empty')).toBeVisible();
}

async function logicalPoint(page, x, y) {
  return page.locator('#map').evaluate((canvas, point) => {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: bounds.left + point.x * bounds.width / canvas.width,
      y: bounds.top + point.y * bounds.height / canvas.height,
    };
  }, { x, y });
}

async function clickLogical(page, x, y) {
  const point = await logicalPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
}

async function dragLogical(page, from, to) {
  const start = await logicalPoint(page, from.x, from.y);
  const end = await logicalPoint(page, to.x, to.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

async function downloadedJson(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

test.beforeEach(async ({ page }) => openEmptyEditor(page));

test('clic-glissement, zoom et redimensionnement réel du canvas', async ({ page }) => {
  await dragLogical(page, { x: 68, y: 68 }, { x: 156, y: 124 });
  await expect(page.locator('#cells')).toHaveText('6');
  await expect(page.locator('#saved')).toHaveText('Modifié');

  await expect(page.locator('#zoom')).toHaveText('100%');
  await page.locator('#plus').click();
  await expect(page.locator('#zoom')).toHaveText('110%');
  await expect.poll(() => page.locator('#map').evaluate((canvas) => canvas.style.transform)).toContain('1.1');

  await page.locator('#gridColumns').fill('20');
  await page.locator('#gridRows').fill('12');
  await page.locator('#cellWidth').fill('24');
  await page.locator('#cellHeight').fill('20');
  await page.locator('#applyDimensions').click();
  await expect(page.locator('#mapResolution')).toContainText('480');
  await expect(page.locator('#mapResolution')).toContainText('240');
  await expect.poll(() => page.locator('#map').evaluate((canvas) => ({ width: canvas.width, height: canvas.height })))
    .toEqual({ width: 480, height: 240 });
});

test('la palette builtin place et exporte une référence qualifiée', async ({ page }) => {
  await dragLogical(page, { x: 68, y: 68 }, { x: 92, y: 92 });
  await page.locator('#next').click();

  await expect(page.locator('#assets button')).toHaveCount(8);
  const desk = page.locator('#assets button').filter({ hasText: 'Bureau' });
  await desk.click();
  await clickLogical(page, 80, 80);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportJson').click();
  const document = await downloadedJson(await downloadPromise);
  expect(document.objects).toHaveLength(1);
  expect(document.objects[0].resource).toBe('builtin:desk');
  expect(document.resources.find((resource) => resource.id === 'builtin:desk')).toMatchObject({
    type: 'image',
    properties: { library: 'builtin', assetId: 'desk' },
  });
});

test('charge, affiche, place et exporte une image de catalogue externe', async ({ page }) => {
  await dragLogical(page, { x: 68, y: 68 }, { x: 92, y: 92 });
  await page.locator('#next').click();
  await page.evaluate(async () => {
    const { assetRegistry } = await import('/src/assets.js');
    assetRegistry.addLibrary({
      format: 'pixel-map-assets', version: '1.0', id: 'external', name: 'Catalogue externe',
      resources: [{
        id: 'marker.green', name: 'Marqueur externe', type: 'image',
        source: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="%2300ff00"/%3E%3C/svg%3E',
        size: { width: 32, height: 32 }, anchor: { x: 0.5, y: 1 },
        category: 'other', tags: ['external', 'marker'], properties: {},
      }], properties: {},
    });
  });
  await page.locator('#search').fill('external');
  const externalAsset = page.locator('#assets button').filter({ hasText: 'Marqueur externe' });
  await expect(externalAsset).toBeVisible();
  await expect.poll(() => externalAsset.locator('canvas').evaluate((canvas) => {
    const pixel = canvas.getContext('2d').getImageData(48, 30, 1, 1).data;
    return pixel[1];
  })).toBeGreaterThan(200);

  await externalAsset.click();
  await clickLogical(page, 80, 80);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportJson').click();
  const document = await downloadedJson(await downloadPromise);
  expect(document.objects[0].resource).toBe('external:marker.green');
  expect(document.resources.find((resource) => resource.id === 'external:marker.green').source)
    .toMatch(/^data:image\/svg\+xml/);
});

test('création d’un polygone, déplacement d’un sommet et téléchargement JSON', async ({ page }) => {
  await page.locator('#next').click();
  await page.locator('[data-entity-tool="zone"]').click();
  await page.locator('[data-zone-shape="polygon"]').click();

  await clickLogical(page, 112, 112);
  await clickLogical(page, 240, 112);
  await clickLogical(page, 240, 240);
  await clickLogical(page, 112, 240);
  await page.locator('#finishPolygon').click();
  await page.locator('[data-entity-tool="select"]').click();
  await dragLogical(page, { x: 112, y: 112 }, { x: 80, y: 144 });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportJson').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pmap\.json$/);
  const document = await downloadedJson(download);
  expect(document.format).toBe('pixel-map');
  expect(document.zones).toHaveLength(1);
  expect(document.zones[0].shape.type).toBe('polygon');
  expect(document.zones[0].shape.points[0].x).toBeCloseTo(80, 3);
  expect(document.zones[0].shape.points[0].y).toBeCloseTo(144, 3);
});

test('import via fichier puis sauvegarde et restauration depuis localStorage', async ({ page }) => {
  const importedProject = {
    format: 'pixel-map-project', version: '1.0',
    document: {
      format: 'pixel-map', version: '1.0', id: 'import-browser', name: 'Import navigateur',
      map: { width: 200, height: 120, background: '#f8f7f2' },
      grid: { columns: 10, rows: 6, cellWidth: 20, cellHeight: 20 },
      resources: [], layers: [],
      collision: { encoding: 'sparse', defaultBlocked: true, cells: [], properties: {} },
      objects: [], zones: [], properties: {},
    },
    editor: {
      activeStep: 'blueprint', activeTool: 'room', selectedLayer: 'floor', selectedAsset: null,
      zoom: 1, showGrid: true, properties: {},
    },
  };

  await page.locator('#projectFile').setInputFiles({
    name: 'import-browser.pmap-project.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedProject)),
  });
  await expect(page.locator('#name')).toHaveValue('Import navigateur');
  await expect.poll(() => page.locator('#map').evaluate((canvas) => ({ width: canvas.width, height: canvas.height })))
    .toEqual({ width: 200, height: 120 });
  await expect(page.locator('#saved')).toHaveText('Modifié');

  await dragLogical(page, { x: 22, y: 22 }, { x: 58, y: 38 });
  await page.locator('#save').click();
  await expect(page.locator('#saved')).toHaveText('Sauvegardé');
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(stored.format).toBe('pixel-map-project');
  expect(stored.document.name).toBe('Import navigateur');
  expect(stored.document.layers.find((layer) => layer.id === 'floor').tiles).toHaveLength(2);

  await page.reload();
  await expect(page.locator('#name')).toHaveValue('Import navigateur');
  await expect(page.locator('#cells')).toHaveText('2');
  await expect(page.locator('#saved')).toHaveText('Sauvegardé');
});

test('l’export PNG masque les overlays puis restaure l’affichage de l’éditeur', async ({ page }) => {
  const cellCenter = { x: 176, y: 176 };
  await dragLogical(page, cellCenter, cellCenter);
  await page.locator('[data-tool="select"]').click();
  await dragLogical(page, cellCenter, cellCenter);

  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('#map');
    const original = canvas.toDataURL.bind(canvas);
    window.__pngExportPixel = null;
    canvas.toDataURL = (...args) => {
      window.__pngExportPixel = [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
      return original(...args);
    };
  }, cellCenter);
  const onscreenBefore = await page.locator('#map').evaluate((canvas, { x, y }) =>
    [...canvas.getContext('2d').getImageData(x, y, 1, 1).data], cellCenter);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  expect(await download.failure()).toBeNull();

  const capturedForPng = await page.evaluate(() => window.__pngExportPixel);
  const onscreenAfter = await page.locator('#map').evaluate((canvas, { x, y }) =>
    [...canvas.getContext('2d').getImageData(x, y, 1, 1).data], cellCenter);
  expect(capturedForPng).not.toEqual(onscreenBefore);
  expect(onscreenAfter).toEqual(onscreenBefore);
});

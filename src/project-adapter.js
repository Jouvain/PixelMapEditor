import { applySerializable, normalizeGrid } from './map-state.js';
import { ASSETS } from './assets.js';
import { createPixelMapDocument, createPixelMapProject } from './pixel-map-format.js';
import { migrateLegacyAssetSource, portableAssetSource } from './portable-assets.js';

const slug = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled-map';
const clone = (value) => structuredClone(value);
const keyOf = ({ x, y }) => `${x},${y}`;

function replaceById(items, id, replacement) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) items.push(replacement);
  else items[index] = replacement;
}

function mergeResource(existing, generated) {
  if (!existing) return generated;
  const source = migrateLegacyAssetSource(existing.source) || existing.source || generated.source;
  return { ...existing, ...generated, source, properties: clone(existing.properties ?? generated.properties) };
}

export function stateToDocument(state) {
  const { columns, rows, cellWidth, cellHeight } = state.grid;
  const blank = createPixelMapDocument({
    id: slug(state.projectName), name: state.projectName,
    width: columns * cellWidth, height: rows * cellHeight,
    columns, rows, cellWidth, cellHeight,
  });
  const document = state.sourceDocument ? clone(state.sourceDocument) : blank;
  const originalObjects = clone(document.objects || []);
  document.format = 'pixel-map';
  document.version = '1.0';
  document.id ||= slug(state.projectName);
  document.name = state.projectName;
  document.map = { ...blank.map, ...(document.map || {}), width: columns * cellWidth, height: rows * cellHeight };
  document.grid = { ...(document.grid || {}), columns, rows, cellWidth, cellHeight };
  document.resources = clone(document.resources || []);
  document.layers = clone(document.layers || []);

  const knownAssetIds = new Set(ASSETS.map((item) => item.id));
  const assetFor = (object) => object.assetId || (knownAssetIds.has(object.type) ? object.type : null);
  const usedAssets = new Set(state.objects.map(assetFor).filter(Boolean));
  const floorResource = { id: `floor.${state.floor}`, type: 'image', source: portableAssetSource('floors', state.floor), width: cellWidth, height: cellHeight, properties: { embedded: true, mediaType: 'image/svg+xml' } };
  replaceById(document.resources, floorResource.id, mergeResource(document.resources.find((item) => item.id === floorResource.id), floorResource));
  ASSETS.filter((item) => usedAssets.has(item.id)).forEach((item) => {
    const generated = { id: `asset.${item.id}`, type: 'image', source: portableAssetSource('objects', item.id), width: 96, height: 96, properties: { embedded: true, mediaType: 'image/svg+xml' } };
    replaceById(document.resources, generated.id, mergeResource(document.resources.find((resource) => resource.id === generated.id), generated));
  });

  const existingFloor = document.layers.find((layer) => layer.id === 'floor');
  const existingFloorTiles = new Map((existingFloor?.tiles || []).map((tile) => [keyOf(tile), tile]));
  replaceById(document.layers, 'floor', {
    id: 'floor', name: 'Sol', type: 'tile', visible: true, opacity: 1, offset: { x: 0, y: 0 }, properties: {},
    ...(existingFloor || {}),
    tiles: [...state.cells].map((key) => {
      const [x, y] = key.split(',').map(Number);
      const existing = existingFloorTiles.get(key);
      return existing
        ? { ...clone(existing), resource: floorResource.id }
        : { x, y, resource: floorResource.id, rotation: 0, flipX: false, flipY: false, properties: {} };
    }),
  });
  if (!document.layers.some((layer) => layer.id === 'decoration')) {
    document.layers.push({ id: 'decoration', name: 'Décoration', type: 'sprite', visible: true, opacity: 1, offset: { x: 0, y: 0 }, sprites: [], properties: {} });
  }

  const originalCollision = document.collision || blank.collision;
  const originalCollisionCells = new Map((originalCollision.cells || []).map((cell) => [keyOf(cell), cell]));
  const collisionCells = [];
  originalCollisionCells.forEach((cell, key) => {
    const [x, y] = key.split(',').map(Number);
    if (x < 0 || y < 0 || x >= columns || y >= rows) return;
    collisionCells.push({ ...clone(cell), blocked: !state.collisionCells.has(key) });
  });
  state.collisionCells.forEach((key) => {
    if (originalCollisionCells.has(key)) return;
    const [x, y] = key.split(',').map(Number);
    collisionCells.push({ x, y, blocked: false, type: 'walkable', properties: {} });
  });
  document.collision = { ...clone(originalCollision), defaultBlocked: true, cells: collisionCells };

  const sourceObjects = new Map(originalObjects.map((object) => [object.id, object]));
  const exportedObjects = state.objects.map((object, index) => {
    const id = object.id || `object-${String(index + 1).padStart(4, '0')}`;
    const existing = clone(sourceObjects.get(id) || {});
    const assetId = assetFor(object);
    const exported = {
      ...existing, id,
      type: object.type.startsWith('furniture.') || !assetId ? object.type : `furniture.${object.type}`,
      position: { x: object.pixelX ?? (object.x + 0.5) * cellWidth, y: object.pixelY ?? (object.y + 0.5) * cellHeight },
      size: existing.size || { width: cellWidth, height: cellHeight }, rotation: (object.rotation || 0) * 90,
      layer: existing.layer || 'decoration', properties: clone(object.properties || {}),
    };
    if (object.name) exported.name = object.name;
    else delete exported.name;
    if (assetId) exported.resource = `asset.${assetId}`;
    return exported;
  });
  const exportedDoors = state.doors.map((door, index) => {
    const id = door.id || `door-${String(index + 1).padStart(4, '0')}`;
    const existing = clone(sourceObjects.get(id) || {});
    return {
      ...existing, id, type: 'architecture.door',
      position: { x: (door.x + 0.5) * cellWidth, y: (door.y + 0.5) * cellHeight },
      rotation: ['top', 'right', 'bottom', 'left'].indexOf(door.side) * 90,
      properties: { ...(existing.properties || {}), ...(door.properties || {}), gridX: door.x, gridY: door.y, side: door.side },
    };
  });
  document.objects = [...exportedObjects, ...exportedDoors];
  document.zones = (state.zones || []).map(clone);
  document.properties = { ...(document.properties || {}), wall: { ...(document.properties?.wall || {}), color: state.wallColor, width: state.wallWidth } };
  return document;
}

export function stateToProject(state, zoom = 1) {
  const generated = createPixelMapProject(stateToDocument(state), {
    activeStep: state.step === 1 ? 'blueprint' : 'decoration', activeTool: state.activeTool,
    selectedLayer: state.step === 1 ? 'floor' : 'decoration', selectedAsset: state.selectedAsset,
    zoom, showGrid: state.showGrid,
    properties: { collisionBrush: state.collisionBrush, entityTool: state.entityTool, zoneShape: state.zoneShape, objectSnapToGrid: state.objectSnapToGrid },
  });
  if (!state.sourceProject) return generated;
  const source = clone(state.sourceProject);
  return {
    ...source, ...generated, document: generated.document,
    editor: { ...(source.editor || {}), ...generated.editor, properties: { ...(source.editor?.properties || {}), ...(generated.editor.properties || {}) } },
  };
}

export function projectToState(project, state) {
  const { document, editor } = project;
  const grid = normalizeGrid(document.grid);
  const floorLayer = document.layers.find((layer) => layer.id === 'floor');
  const cells = (floorLayer?.tiles || []).map((tile) => `${tile.x},${tile.y}`);
  const collisionCells = new Set();
  if (!document.collision.defaultBlocked) {
    for (let y = 0; y < grid.rows; y += 1) for (let x = 0; x < grid.columns; x += 1) collisionCells.add(`${x},${y}`);
  }
  document.collision.cells.forEach((cell) => cell.blocked ? collisionCells.delete(keyOf(cell)) : collisionCells.add(keyOf(cell)));
  const doors = document.objects.filter((object) => object.type === 'architecture.door').map((object) => ({
    id: object.id,
    x: object.properties.gridX ?? Math.floor(object.position.x / grid.cellWidth),
    y: object.properties.gridY ?? Math.floor(object.position.y / grid.cellHeight),
    side: object.properties.side ?? ['top', 'right', 'bottom', 'left'][Math.round((object.rotation || 0) / 90) % 4],
    properties: clone(object.properties || {}),
  }));
  const objects = document.objects.filter((object) => object.type !== 'architecture.door').map((object) => ({
    id: object.id, type: object.type, name: object.name || '',
    assetId: object.resource?.startsWith('asset.') ? object.resource.slice('asset.'.length) : null,
    properties: clone(object.properties || {}),
    x: Math.floor(object.position.x / grid.cellWidth), y: Math.floor(object.position.y / grid.cellHeight),
    pixelX: object.position.x, pixelY: object.position.y,
    rotation: Math.round((object.rotation || 0) / 90) % 4,
  }));
  const floorResource = floorLayer?.tiles?.[0]?.resource || 'floor.blue';
  applySerializable(state, {
    projectName: document.name, grid, step: editor.activeStep === 'blueprint' ? 1 : 2,
    activeTool: editor.activeTool, collisionBrush: editor.properties?.collisionBrush,
    entityTool: editor.properties?.entityTool, zoneShape: editor.properties?.zoneShape,
    objectSnapToGrid: editor.properties?.objectSnapToGrid,
    selectedAsset: editor.selectedAsset, cells, collisionCells: [...collisionCells], doors, objects,
    zones: clone(document.zones), floor: floorResource.replace('floor.', ''),
    wallColor: document.properties?.wall?.color, wallWidth: document.properties?.wall?.width,
    showGrid: editor.showGrid, sourceDocument: clone(document), sourceProject: clone(project),
  });
  return editor.zoom ?? 1;
}

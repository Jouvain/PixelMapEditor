import { applySerializable, normalizeGrid } from './map-state.js';
import { ASSETS } from './assets.js';
import { createPixelMapDocument, createPixelMapProject } from './pixel-map-format.js';

const slug = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled-map';

export function stateToDocument(state) {
  const { columns, rows, cellWidth, cellHeight } = state.grid;
  const document = createPixelMapDocument({
    id: slug(state.projectName), name: state.projectName,
    width: columns * cellWidth, height: rows * cellHeight,
    columns, rows, cellWidth, cellHeight,
  });
  const knownAssetIds = new Set(ASSETS.map((item) => item.id));
  const assetFor = (object) => object.assetId || (knownAssetIds.has(object.type) ? object.type : null);
  const usedAssets = new Set(state.objects.map(assetFor).filter(Boolean));
  document.resources.push({ id: `floor.${state.floor}`, type: 'image', source: `asset://floors/${state.floor}`, width: cellWidth, height: cellHeight, properties: {} });
  ASSETS.filter((item) => usedAssets.has(item.id)).forEach((item) => document.resources.push({
    id: `asset.${item.id}`, type: 'image', source: `asset://objects/${item.id}`, width: cellWidth, height: cellHeight, properties: {},
  }));
  document.layers.push({
    id: 'floor', name: 'Sol', type: 'tile', visible: true, opacity: 1, offset: { x: 0, y: 0 },
    tiles: [...state.cells].map((key) => { const [x, y] = key.split(',').map(Number); return { x, y, resource: `floor.${state.floor}`, rotation: 0, flipX: false, flipY: false, properties: {} }; }), properties: {},
  });
  document.layers.push({ id: 'decoration', name: 'Décoration', type: 'sprite', visible: true, opacity: 1, offset: { x: 0, y: 0 }, sprites: [], properties: {} });
  document.collision.cells = [...state.collisionCells].map((key) => { const [x, y] = key.split(',').map(Number); return { x, y, blocked: false, type: 'walkable', properties: {} }; });
  state.objects.forEach((object, index) => {
    const id = object.id || `object-${String(index + 1).padStart(4, '0')}`;
    const assetId = assetFor(object);
    const exported = {
      id, type: object.type.startsWith('furniture.') || !assetId ? object.type : `furniture.${object.type}`,
      position: { x: (object.x + 0.5) * cellWidth, y: (object.y + 0.5) * cellHeight },
      size: { width: cellWidth, height: cellHeight }, rotation: (object.rotation || 0) * 90,
      layer: 'decoration', properties: structuredClone(object.properties || {}),
    };
    if (object.name) exported.name = object.name;
    if (assetId) exported.resource = `asset.${assetId}`;
    document.objects.push(exported);
  });
  state.doors.forEach((door, index) => document.objects.push({ id: `door-${String(index + 1).padStart(4, '0')}`, type: 'architecture.door', position: { x: (door.x + 0.5) * cellWidth, y: (door.y + 0.5) * cellHeight }, rotation: ['top', 'right', 'bottom', 'left'].indexOf(door.side) * 90, properties: { gridX: door.x, gridY: door.y, side: door.side } }));
  document.zones = (state.zones || []).map((zone) => structuredClone(zone));
  document.properties = { wall: { color: state.wallColor, width: state.wallWidth } };
  return document;
}

export function stateToProject(state, zoom = 1) {
  return createPixelMapProject(stateToDocument(state), { activeStep: state.step === 1 ? 'blueprint' : 'decoration', activeTool: state.activeTool, selectedLayer: state.step === 1 ? 'floor' : 'decoration', selectedAsset: state.selectedAsset, zoom, showGrid: state.showGrid, properties: { collisionBrush: state.collisionBrush, entityTool: state.entityTool, zoneShape: state.zoneShape } });
}

export function projectToState(project, state) {
  const { document, editor } = project;
  const grid = normalizeGrid(document.grid);
  const floorLayer = document.layers.find((layer) => layer.id === 'floor');
  const cells = (floorLayer?.tiles || []).map((tile) => `${tile.x},${tile.y}`);
  const collisionCells = document.collision.cells.filter((cell) => !cell.blocked).map((cell) => `${cell.x},${cell.y}`);
  const doors = document.objects.filter((object) => object.type === 'architecture.door').map((object) => ({ x: object.properties.gridX, y: object.properties.gridY, side: object.properties.side }));
  const objects = document.objects.filter((object) => object.type !== 'architecture.door').map((object) => ({
    id: object.id, type: object.type, name: object.name || '',
    assetId: object.resource?.startsWith('asset.') ? object.resource.slice('asset.'.length) : null,
    properties: structuredClone(object.properties || {}),
    x: Math.floor(object.position.x / grid.cellWidth), y: Math.floor(object.position.y / grid.cellHeight),
    rotation: Math.round((object.rotation || 0) / 90) % 4,
  }));
  const floorResource = floorLayer?.tiles?.[0]?.resource || 'floor.blue';
  applySerializable(state, { projectName: document.name, grid, step: editor.activeStep === 'blueprint' ? 1 : 2, activeTool: editor.activeTool, collisionBrush: editor.properties?.collisionBrush, entityTool: editor.properties?.entityTool, zoneShape: editor.properties?.zoneShape, selectedAsset: editor.selectedAsset, cells, collisionCells, doors, objects, zones: document.zones, floor: floorResource.replace('floor.', ''), wallColor: document.properties?.wall?.color, wallWidth: document.properties?.wall?.width, showGrid: editor.showGrid });
  return editor.zoom ?? 1;
}

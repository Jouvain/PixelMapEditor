import { polygonSelfIntersects } from './geometry.js';
export { polygonSelfIntersects } from './geometry.js';

export const DEFAULT_GRID = Object.freeze({ columns: 36, rows: 24, cellWidth: 32, cellHeight: 32 });
export const GRID_LIMITS = Object.freeze({ maxColumns: 512, maxRows: 512, maxCellSize: 256, maxCanvasSize: 8192 });

const cellKey = (x, y) => `${x},${y}`;

function createInitialCells(grid) {
  const cells = new Set();
  const fill = (x1, y1, x2, y2) => {
    for (let y = y1; y < y2; y += 1) {
      for (let x = x1; x < x2; x += 1) cells.add(cellKey(x, y));
    }
  };
  const safeFill = (x1, y1, x2, y2) => fill(
    Math.min(x1, grid.columns), Math.min(y1, grid.rows),
    Math.min(x2, grid.columns), Math.min(y2, grid.rows),
  );
  safeFill(3, 3, 20, 21);
  safeFill(20, 6, 29, 14);
  safeFill(20, 14, 26, 20);
  return cells;
}

export function createMapState(grid = DEFAULT_GRID, { template = 'demo', projectName = null } = {}) {
  const normalizedGrid = normalizeGrid(grid);
  const initialCells = template === 'demo' ? createInitialCells(normalizedGrid) : new Set();
  return {
    projectName: projectName || (template === 'demo' ? 'Bureau — Étage 01' : 'Nouvelle carte'),
    step: 1,
    activeTool: 'room',
    blueprintSelection: new Set(),
    blueprintClipboard: null,
    collisionBrush: 'walkable',
    entityTool: 'asset',
    objectSnapToGrid: true,
    zoneShape: 'rectangle',
    selectedEntity: null,
    selectedZoneVertex: null,
    selectedAsset: 'desk',
    grid: normalizedGrid,
    cells: initialCells,
    collisionCells: new Set(initialCells),
    doors: template === 'demo' ? [{ x: 3, y: 10, side: 'left' }, { x: 19, y: 8, side: 'right' }]
      .filter((door) => door.x < normalizedGrid.columns && door.y < normalizedGrid.rows) : [],
    objects: [],
    zones: [],
    floor: 'blue',
    wallColor: '#deddd5',
    wallWidth: 8,
    showGrid: true,
    sourceDocument: null,
    sourceProject: null,
  };
}

export function normalizeGrid(grid = {}) {
  const normalized = {
    columns: Number(grid.columns ?? DEFAULT_GRID.columns),
    rows: Number(grid.rows ?? DEFAULT_GRID.rows),
    cellWidth: Number(grid.cellWidth ?? grid.tileSize ?? DEFAULT_GRID.cellWidth),
    cellHeight: Number(grid.cellHeight ?? grid.tileSize ?? DEFAULT_GRID.cellHeight),
  };
  const values = Object.values(normalized);
  if (!values.every((value) => Number.isInteger(value) && value > 0)) throw new Error('Les dimensions de grille doivent être des entiers strictement positifs.');
  if (normalized.columns > GRID_LIMITS.maxColumns || normalized.rows > GRID_LIMITS.maxRows) throw new Error(`La grille est limitée à ${GRID_LIMITS.maxColumns} × ${GRID_LIMITS.maxRows} cases.`);
  if (normalized.cellWidth > GRID_LIMITS.maxCellSize || normalized.cellHeight > GRID_LIMITS.maxCellSize) throw new Error(`Une case est limitée à ${GRID_LIMITS.maxCellSize} unités.`);
  if (normalized.columns * normalized.cellWidth > GRID_LIMITS.maxCanvasSize || normalized.rows * normalized.cellHeight > GRID_LIMITS.maxCanvasSize) throw new Error(`Le canvas est limité à ${GRID_LIMITS.maxCanvasSize} × ${GRID_LIMITS.maxCanvasSize} unités.`);
  return normalized;
}

export function analyzeGridResize(state, grid) {
  const next = normalizeGrid(grid);
  const outsideCell = (x, y) => x >= next.columns || y >= next.rows;
  const cells = [...state.cells].filter((key) => { const [x, y] = key.split(',').map(Number); return outsideCell(x, y); }).length;
  const collisions = [...state.collisionCells].filter((key) => { const [x, y] = key.split(',').map(Number); return outsideCell(x, y); }).length;
  const doors = state.doors.filter((door) => outsideCell(door.x, door.y)).length;
  const objects = state.objects.filter((object) => outsideCell(object.x, object.y)).length;
  const width = next.columns * next.cellWidth, height = next.rows * next.cellHeight;
  const zones = state.zones.filter((zone) => {
    const shape = zone.shape || {};
    if (shape.type === 'rectangle') return shape.x < 0 || shape.y < 0 || shape.x + shape.width > width || shape.y + shape.height > height;
    return shape.type === 'polygon' && shape.points?.some((point) => point.x < 0 || point.y < 0 || point.x > width || point.y > height);
  }).length;
  return { grid: next, losses: { cells, collisions, doors, objects, zones }, totalLosses: cells + collisions + doors + objects + zones };
}

export function resizeGrid(state, grid, allowCrop = false) {
  const analysis = analyzeGridResize(state, grid);
  if (analysis.totalLosses && !allowCrop) return { resized: false, ...analysis };
  const outsideCell = (x, y) => x >= analysis.grid.columns || y >= analysis.grid.rows;
  state.cells = new Set([...state.cells].filter((key) => { const [x, y] = key.split(',').map(Number); return !outsideCell(x, y); }));
  state.collisionCells = new Set([...state.collisionCells].filter((key) => { const [x, y] = key.split(',').map(Number); return !outsideCell(x, y); }));
  state.blueprintSelection = new Set([...state.blueprintSelection].filter((key) => { const [x, y] = key.split(',').map(Number); return !outsideCell(x, y); }));
  state.doors = state.doors.filter((door) => !outsideCell(door.x, door.y));
  state.objects = state.objects.filter((object) => !outsideCell(object.x, object.y));
  if (analysis.losses.zones) {
    const newWidth = analysis.grid.columns * analysis.grid.cellWidth, newHeight = analysis.grid.rows * analysis.grid.cellHeight;
    state.zones = state.zones.filter((zone) => {
      const shape = zone.shape || {};
      if (shape.type === 'rectangle') return shape.x >= 0 && shape.y >= 0 && shape.x + shape.width <= newWidth && shape.y + shape.height <= newHeight;
      return shape.type !== 'polygon' || shape.points?.every((point) => point.x >= 0 && point.y >= 0 && point.x <= newWidth && point.y <= newHeight);
    });
  }
  state.grid = analysis.grid;
  return { resized: true, ...analysis };
}

export function hasCell(state, x, y) {
  return state.cells.has(cellKey(x, y));
}

export function paintRectangle(state, start, end, erase = false) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      erase ? state.cells.delete(cellKey(x, y)) : state.cells.add(cellKey(x, y));
    }
  }
  state.doors = state.doors.filter((door) => hasCell(state, door.x, door.y));
}

export function paintCollisionRectangle(state, start, end, blocked = false) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      blocked ? state.collisionCells.delete(cellKey(x, y)) : state.collisionCells.add(cellKey(x, y));
    }
  }
}

export function selectBlueprintRectangle(state, start, end) {
  const left = Math.min(start.x, end.x), right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
  state.blueprintSelection = new Set([...state.cells].filter((key) => {
    const [x, y] = key.split(',').map(Number);
    return x >= left && x <= right && y >= top && y <= bottom;
  }));
  return state.blueprintSelection.size;
}

function blueprintSelectionBounds(state) {
  if (!state.blueprintSelection.size) return null;
  const points = [...state.blueprintSelection].map((key) => key.split(',').map(Number));
  return {
    left: Math.min(...points.map(([x]) => x)), right: Math.max(...points.map(([x]) => x)),
    top: Math.min(...points.map(([, y]) => y)), bottom: Math.max(...points.map(([, y]) => y)),
  };
}

export function moveBlueprintSelection(state, delta, duplicate = false) {
  const bounds = blueprintSelectionBounds(state);
  if (!bounds) return false;
  const dx = Math.max(-bounds.left, Math.min(state.grid.columns - 1 - bounds.right, Math.round(delta.x)));
  const dy = Math.max(-bounds.top, Math.min(state.grid.rows - 1 - bounds.bottom, Math.round(delta.y)));
  if (!dx && !dy && !duplicate) return false;
  const selected = new Set(state.blueprintSelection);
  const moved = new Set([...selected].map((key) => {
    const [x, y] = key.split(',').map(Number);
    return cellKey(x + dx, y + dy);
  }));
  if (!duplicate) selected.forEach((key) => state.cells.delete(key));
  moved.forEach((key) => state.cells.add(key));
  const selectedDoors = state.doors.filter((door) => selected.has(cellKey(door.x, door.y)));
  if (!duplicate) state.doors = state.doors.filter((door) => !selected.has(cellKey(door.x, door.y)));
  state.doors.push(...selectedDoors.map((door) => ({ ...structuredClone(door), id: duplicate ? crypto.randomUUID() : door.id, x: door.x + dx, y: door.y + dy })));
  state.blueprintSelection = moved;
  return true;
}

export function deleteBlueprintSelection(state) {
  if (!state.blueprintSelection.size) return false;
  state.blueprintSelection.forEach((key) => state.cells.delete(key));
  state.doors = state.doors.filter((door) => !state.blueprintSelection.has(cellKey(door.x, door.y)));
  state.blueprintSelection.clear();
  return true;
}

export function copyBlueprintSelection(state) {
  const bounds = blueprintSelectionBounds(state);
  if (!bounds) return false;
  const selected = state.blueprintSelection;
  state.blueprintClipboard = {
    width: bounds.right - bounds.left + 1, height: bounds.bottom - bounds.top + 1,
    cells: [...selected].map((key) => { const [x, y] = key.split(',').map(Number); return { x: x - bounds.left, y: y - bounds.top }; }),
    doors: state.doors.filter((door) => selected.has(cellKey(door.x, door.y))).map((door) => ({ ...structuredClone(door), id: undefined, x: door.x - bounds.left, y: door.y - bounds.top })),
  };
  return true;
}

export function pasteBlueprintSelection(state, anchor = null) {
  const clipboard = state.blueprintClipboard;
  if (!clipboard?.cells.length) return false;
  const bounds = blueprintSelectionBounds(state);
  const desired = anchor || { x: (bounds?.left ?? -1) + 1, y: (bounds?.top ?? -1) + 1 };
  const origin = {
    x: Math.max(0, Math.min(state.grid.columns - clipboard.width, desired.x)),
    y: Math.max(0, Math.min(state.grid.rows - clipboard.height, desired.y)),
  };
  const pasted = new Set(clipboard.cells.map((point) => cellKey(origin.x + point.x, origin.y + point.y)));
  pasted.forEach((key) => state.cells.add(key));
  state.doors.push(...clipboard.doors.map((door) => ({ ...structuredClone(door), id: crypto.randomUUID(), x: origin.x + door.x, y: origin.y + door.y })));
  state.blueprintSelection = pasted;
  return true;
}

export function duplicateBlueprintSelection(state) {
  return copyBlueprintSelection(state) && pasteBlueprintSelection(state);
}

export function toggleDoor(state, position) {
  if (!hasCell(state, position.x, position.y)) return 'outside';
  const sides = [];
  if (!hasCell(state, position.x - 1, position.y)) sides.push('left');
  if (!hasCell(state, position.x + 1, position.y)) sides.push('right');
  if (!hasCell(state, position.x, position.y - 1)) sides.push('top');
  if (!hasCell(state, position.x, position.y + 1)) sides.push('bottom');
  if (!sides.length) return 'not-on-edge';

  const index = state.doors.findIndex((door) => door.x === position.x && door.y === position.y);
  if (index >= 0) state.doors.splice(index, 1);
  else state.doors.push({ ...position, side: sides[0] });
  return 'ok';
}

export function placeOrRotateObject(state, position) {
  if (!hasCell(state, position.x, position.y)) return false;
  const object = state.objects.find((item) =>
    Math.abs(item.x - position.x) < 2 && Math.abs(item.y - position.y) < 2);
  if (object) object.rotation = ((object.rotation || 0) + 1) % 4;
  else state.objects.push({ id: crypto.randomUUID(), type: `furniture.${state.selectedAsset}`, assetId: state.selectedAsset, name: '', properties: {}, ...position, pixelX: (position.x + 0.5) * state.grid.cellWidth, pixelY: (position.y + 0.5) * state.grid.cellHeight, rotation: 0 });
  const selected = object || state.objects.at(-1);
  state.selectedEntity = { kind: 'object', id: selected.id };
  return true;
}

export function placeGenericObject(state, position) {
  const object = { id: crypto.randomUUID(), type: 'object.generic', assetId: null, name: 'Nouvel objet', properties: {}, ...position, pixelX: (position.x + 0.5) * state.grid.cellWidth, pixelY: (position.y + 0.5) * state.grid.cellHeight, rotation: 0 };
  state.objects.push(object);
  state.selectedEntity = { kind: 'object', id: object.id };
  return object;
}

export function createRectangleZone(state, start, end) {
  const { cellWidth, cellHeight } = state.grid;
  const left = Math.min(start.x, end.x), top = Math.min(start.y, end.y);
  const zone = {
    id: crypto.randomUUID(), type: 'zone.generic', name: 'Nouvelle zone', properties: {},
    shape: {
      type: 'rectangle', x: left * cellWidth, y: top * cellHeight,
      width: (Math.abs(start.x - end.x) + 1) * cellWidth,
      height: (Math.abs(start.y - end.y) + 1) * cellHeight,
    },
  };
  state.zones.push(zone);
  state.selectedEntity = { kind: 'zone', id: zone.id };
  return zone;
}

export function createPolygonZone(state, gridPoints) {
  if (gridPoints.length < 3) throw new Error('Un polygone nécessite au moins trois sommets.');
  const { cellWidth, cellHeight } = state.grid;
  const points = gridPoints.map((point) => ({ x: (point.x + 0.5) * cellWidth, y: (point.y + 0.5) * cellHeight }));
  if (polygonSelfIntersects(points)) throw new Error('Le polygone ne peut pas s’auto-intersecter.');
  const zone = {
    id: crypto.randomUUID(), type: 'zone.generic', name: 'Nouvelle zone', properties: {},
    shape: {
      type: 'polygon',
      points,
    },
  };
  state.zones.push(zone);
  state.selectedEntity = { kind: 'zone', id: zone.id };
  return zone;
}

export function translateZone(state, zone, delta, sourceShape = zone.shape) {
  const width = state.grid.columns * state.grid.cellWidth, height = state.grid.rows * state.grid.cellHeight;
  const points = sourceShape.type === 'rectangle'
    ? [{ x: sourceShape.x, y: sourceShape.y }, { x: sourceShape.x + sourceShape.width, y: sourceShape.y + sourceShape.height }]
    : sourceShape.points;
  const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y)), maxY = Math.max(...points.map((point) => point.y));
  const dx = Math.max(-minX, Math.min(width - maxX, delta.x));
  const dy = Math.max(-minY, Math.min(height - maxY, delta.y));
  zone.shape = sourceShape.type === 'rectangle'
    ? { ...structuredClone(sourceShape), x: sourceShape.x + dx, y: sourceShape.y + dy }
    : { ...structuredClone(sourceShape), points: sourceShape.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  return zone;
}

export function resizeRectangleZone(state, zone, handle, position) {
  if (zone.shape.type !== 'rectangle') return false;
  const maximumX = state.grid.columns * state.grid.cellWidth, maximumY = state.grid.rows * state.grid.cellHeight;
  const left = zone.shape.x, top = zone.shape.y, right = left + zone.shape.width, bottom = top + zone.shape.height;
  const x = Math.max(0, Math.min(maximumX, position.x)), y = Math.max(0, Math.min(maximumY, position.y));
  const nextLeft = handle.includes('w') ? Math.min(x, right - 1) : left;
  const nextRight = handle.includes('e') ? Math.max(x, left + 1) : right;
  const nextTop = handle.includes('n') ? Math.min(y, bottom - 1) : top;
  const nextBottom = handle.includes('s') ? Math.max(y, top + 1) : bottom;
  Object.assign(zone.shape, { x: nextLeft, y: nextTop, width: nextRight - nextLeft, height: nextBottom - nextTop });
  return true;
}

export function addPolygonVertex(zone, afterIndex = null) {
  if (zone.shape.type !== 'polygon') return -1;
  const points = zone.shape.points;
  let index = afterIndex;
  if (!Number.isInteger(index) || index < 0 || index >= points.length) {
    let longest = -1;
    points.forEach((point, candidate) => {
      const next = points[(candidate + 1) % points.length];
      const length = (next.x - point.x) ** 2 + (next.y - point.y) ** 2;
      if (length > longest) { longest = length; index = candidate; }
    });
  }
  const a = points[index], b = points[(index + 1) % points.length];
  points.splice(index + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return index + 1;
}

export function deletePolygonVertex(zone, index) {
  if (zone.shape.type !== 'polygon' || zone.shape.points.length <= 3 || !Number.isInteger(index)) return false;
  const [removed] = zone.shape.points.splice(index, 1);
  if (polygonSelfIntersects(zone.shape.points)) {
    zone.shape.points.splice(index, 0, removed);
    return false;
  }
  return true;
}

export function pointInPolygon(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i], b = points[j];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function getSelectedEntity(state) {
  if (!state.selectedEntity) return null;
  const collection = state.selectedEntity.kind === 'zone' ? state.zones : state.objects;
  return collection.find((item) => item.id === state.selectedEntity.id) || null;
}

export function objectPosition(state, object) {
  return {
    x: object.pixelX ?? (object.x + 0.5) * state.grid.cellWidth,
    y: object.pixelY ?? (object.y + 0.5) * state.grid.cellHeight,
  };
}

export function moveObject(state, object, position, snapToGrid = state.objectSnapToGrid) {
  const { cellWidth, cellHeight, columns, rows } = state.grid;
  const maximumX = columns * cellWidth, maximumY = rows * cellHeight;
  let x = Math.max(0, Math.min(maximumX, position.x));
  let y = Math.max(0, Math.min(maximumY, position.y));
  if (snapToGrid) {
    x = (Math.max(0, Math.min(columns - 1, Math.floor(x / cellWidth))) + 0.5) * cellWidth;
    y = (Math.max(0, Math.min(rows - 1, Math.floor(y / cellHeight))) + 0.5) * cellHeight;
  }
  object.pixelX = x; object.pixelY = y;
  object.x = Math.max(0, Math.min(columns - 1, Math.floor(x / cellWidth)));
  object.y = Math.max(0, Math.min(rows - 1, Math.floor(y / cellHeight)));
  return object;
}

export function changeObjectOrder(state, object, direction) {
  const index = state.objects.indexOf(object);
  if (index < 0) return false;
  const target = direction === 'front' ? state.objects.length - 1 : 0;
  if (index === target) return false;
  state.objects.splice(index, 1);
  state.objects.splice(target, 0, object);
  return true;
}

export function selectEntityAt(state, position, logicalPosition = null) {
  const logical = logicalPosition || { x: (position.x + 0.5) * state.grid.cellWidth, y: (position.y + 0.5) * state.grid.cellHeight };
  const halfWidth = state.grid.cellWidth / 2, halfHeight = state.grid.cellHeight / 2;
  const hits = [...state.objects].reverse().filter((item) => {
    const center = objectPosition(state, item);
    return Math.abs(center.x - logical.x) <= halfWidth && Math.abs(center.y - logical.y) <= halfHeight;
  });
  if (hits.length) {
    const selectedIndex = hits.findIndex((item) => state.selectedEntity?.kind === 'object' && state.selectedEntity.id === item.id);
    const object = hits[(selectedIndex + 1) % hits.length];
    return (state.selectedEntity = { kind: 'object', id: object.id });
  }
  const logicalX = logical.x;
  const logicalY = logical.y;
  const zone = [...state.zones].reverse().find((item) => {
    const shape = item.shape;
    if (shape.type === 'rectangle') return logicalX >= shape.x && logicalX <= shape.x + shape.width && logicalY >= shape.y && logicalY <= shape.y + shape.height;
    if (shape.type === 'polygon') return pointInPolygon({ x: logicalX, y: logicalY }, shape.points);
    return false;
  });
  state.selectedEntity = zone ? { kind: 'zone', id: zone.id } : null;
  return state.selectedEntity;
}

export function deleteSelectedEntity(state) {
  if (!state.selectedEntity) return false;
  const collection = state.selectedEntity.kind === 'zone' ? state.zones : state.objects;
  const index = collection.findIndex((item) => item.id === state.selectedEntity.id);
  if (index < 0) return false;
  collection.splice(index, 1);
  state.selectedEntity = null;
  return true;
}

export function toSerializable(state) {
  return { ...state, cells: [...state.cells], collisionCells: [...state.collisionCells], blueprintSelection: [...state.blueprintSelection] };
}

export function applySerializable(state, data) {
  const normalized = {
    ...data,
    projectName: data.projectName ?? data.name ?? state.projectName,
    activeTool: data.activeTool ?? state.activeTool,
    collisionBrush: data.collisionBrush ?? state.collisionBrush,
    entityTool: data.entityTool ?? state.entityTool,
    objectSnapToGrid: data.objectSnapToGrid ?? state.objectSnapToGrid,
    zoneShape: data.zoneShape ?? state.zoneShape,
    selectedEntity: data.selectedEntity ?? null,
    selectedZoneVertex: data.selectedZoneVertex ?? null,
    selectedAsset: data.selectedAsset ?? state.selectedAsset,
    wallColor: data.wallColor ?? data.wall ?? state.wallColor,
    wallWidth: data.wallWidth ?? data.width ?? state.wallWidth,
    showGrid: data.showGrid ?? (typeof data.grid === 'boolean' ? data.grid : state.showGrid),
    grid: normalizeGrid(typeof data.grid === 'object' ? data.grid : state.grid),
  };
  Object.assign(state, normalized, {
    cells: new Set(data.cells || []),
    collisionCells: new Set(data.collisionCells || data.cells || []),
    blueprintSelection: new Set(data.blueprintSelection || []),
    doors: data.doors || [],
    objects: data.objects || [],
    zones: data.zones || [],
  });
  // Compatibilité avec les sauvegardes de la première version.
  state.doors.forEach((door) => { door.side ||= door.s; });
  state.objects.forEach((object) => {
    object.type ||= object.t;
    if (object.assetId === undefined) object.assetId = object.type;
    object.name ??= '';
    object.properties ??= {};
    object.rotation ??= object.r || 0;
    object.pixelX ??= (object.x + 0.5) * state.grid.cellWidth;
    object.pixelY ??= (object.y + 0.5) * state.grid.cellHeight;
  });
}

export function createHistory(state, limit = 40) {
  const entries = [];
  return {
    checkpoint() {
      entries.push(JSON.stringify(toSerializable(state)));
      if (entries.length > limit) entries.shift();
    },
    undo() {
      const previous = entries.pop();
      if (!previous) return false;
      applySerializable(state, JSON.parse(previous));
      return true;
    },
    clear() { entries.length = 0; },
  };
}

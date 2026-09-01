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

export function createMapState(grid = DEFAULT_GRID) {
  const normalizedGrid = normalizeGrid(grid);
  const initialCells = createInitialCells(normalizedGrid);
  return {
    projectName: 'Bureau — Étage 01',
    step: 1,
    activeTool: 'room',
    collisionBrush: 'walkable',
    entityTool: 'asset',
    zoneShape: 'rectangle',
    selectedEntity: null,
    selectedAsset: 'desk',
    grid: normalizedGrid,
    cells: initialCells,
    collisionCells: new Set(initialCells),
    doors: [{ x: 3, y: 10, side: 'left' }, { x: 19, y: 8, side: 'right' }]
      .filter((door) => door.x < normalizedGrid.columns && door.y < normalizedGrid.rows),
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
  else state.objects.push({ id: crypto.randomUUID(), type: `furniture.${state.selectedAsset}`, assetId: state.selectedAsset, name: '', properties: {}, ...position, rotation: 0 });
  const selected = object || state.objects.at(-1);
  state.selectedEntity = { kind: 'object', id: selected.id };
  return true;
}

export function placeGenericObject(state, position) {
  const object = { id: crypto.randomUUID(), type: 'object.generic', assetId: null, name: 'Nouvel objet', properties: {}, ...position, rotation: 0 };
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
  const zone = {
    id: crypto.randomUUID(), type: 'zone.generic', name: 'Nouvelle zone', properties: {},
    shape: {
      type: 'polygon',
      points: gridPoints.map((point) => ({ x: (point.x + 0.5) * cellWidth, y: (point.y + 0.5) * cellHeight })),
    },
  };
  state.zones.push(zone);
  state.selectedEntity = { kind: 'zone', id: zone.id };
  return zone;
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

export function selectEntityAt(state, position) {
  const object = [...state.objects].reverse().find((item) => item.x === position.x && item.y === position.y);
  if (object) return (state.selectedEntity = { kind: 'object', id: object.id });
  const logicalX = (position.x + 0.5) * state.grid.cellWidth;
  const logicalY = (position.y + 0.5) * state.grid.cellHeight;
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
  return { ...state, cells: [...state.cells], collisionCells: [...state.collisionCells] };
}

export function applySerializable(state, data) {
  const normalized = {
    ...data,
    projectName: data.projectName ?? data.name ?? state.projectName,
    activeTool: data.activeTool ?? state.activeTool,
    collisionBrush: data.collisionBrush ?? state.collisionBrush,
    entityTool: data.entityTool ?? state.entityTool,
    zoneShape: data.zoneShape ?? state.zoneShape,
    selectedEntity: data.selectedEntity ?? null,
    selectedAsset: data.selectedAsset ?? state.selectedAsset,
    wallColor: data.wallColor ?? data.wall ?? state.wallColor,
    wallWidth: data.wallWidth ?? data.width ?? state.wallWidth,
    showGrid: data.showGrid ?? (typeof data.grid === 'boolean' ? data.grid : state.showGrid),
    grid: normalizeGrid(typeof data.grid === 'object' ? data.grid : state.grid),
  };
  Object.assign(state, normalized, {
    cells: new Set(data.cells || []),
    collisionCells: new Set(data.collisionCells || data.cells || []),
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
  };
}

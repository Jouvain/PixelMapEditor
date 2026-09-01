export const GRID = Object.freeze({ columns: 36, rows: 24, tileSize: 32 });

const cellKey = (x, y) => `${x},${y}`;

function createInitialCells() {
  const cells = new Set();
  const fill = (x1, y1, x2, y2) => {
    for (let y = y1; y < y2; y += 1) {
      for (let x = x1; x < x2; x += 1) cells.add(cellKey(x, y));
    }
  };
  fill(3, 3, 20, 21);
  fill(20, 6, 29, 14);
  fill(20, 14, 26, 20);
  return cells;
}

export function createMapState() {
  return {
    projectName: 'Bureau — Étage 01',
    step: 1,
    activeTool: 'room',
    selectedAsset: 'desk',
    cells: createInitialCells(),
    doors: [{ x: 3, y: 10, side: 'left' }, { x: 19, y: 8, side: 'right' }],
    objects: [],
    floor: 'blue',
    wallColor: '#deddd5',
    wallWidth: 8,
    showGrid: true,
  };
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
  else state.objects.push({ type: state.selectedAsset, ...position, rotation: 0 });
  return true;
}

export function toSerializable(state) {
  return { ...state, cells: [...state.cells] };
}

export function applySerializable(state, data) {
  const normalized = {
    ...data,
    projectName: data.projectName ?? data.name ?? state.projectName,
    activeTool: data.activeTool ?? state.activeTool,
    selectedAsset: data.selectedAsset ?? state.selectedAsset,
    wallColor: data.wallColor ?? data.wall ?? state.wallColor,
    wallWidth: data.wallWidth ?? data.width ?? state.wallWidth,
    showGrid: data.showGrid ?? data.grid ?? state.showGrid,
  };
  Object.assign(state, normalized, {
    cells: new Set(data.cells || []),
    doors: data.doors || [],
    objects: data.objects || [],
  });
  // Compatibilité avec les sauvegardes de la première version.
  state.doors.forEach((door) => { door.side ||= door.s; });
  state.objects.forEach((object) => {
    object.type ||= object.t;
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

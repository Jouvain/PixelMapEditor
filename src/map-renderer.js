import { GRID, hasCell } from './map-state.js';
import { drawSprite } from './assets.js';

export class MapRenderer {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.state = state;
    this.preview = null;
  }

  setPreview(preview) { this.preview = preview; this.draw(); }
  clearPreview() { this.preview = null; }

  draw() {
    const { context, canvas, state } = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8f7f2';
    context.fillRect(0, 0, canvas.width, canvas.height);
    state.cells.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      this.drawFloorTile(x, y);
    });
    if (state.showGrid) this.drawGrid();
    this.drawWalls();
    this.drawDoors();
    if (state.step === 2) this.drawObjects();
    if (this.preview) this.drawPreview();
  }

  drawFloorTile(x, y) {
    const { context, state } = this;
    const colors = { blue: '#176f87', wood: '#9f6038', stone: '#b9b8b0' };
    context.fillStyle = colors[state.floor];
    context.fillRect(x * GRID.tileSize, y * GRID.tileSize, GRID.tileSize, GRID.tileSize);
    context.fillStyle = state.floor === 'blue' ? '#0c5a7066' : '#54351d44';
    if (state.floor === 'blue') {
      for (let px = 5; px < GRID.tileSize; px += 8) {
        for (let py = 5; py < GRID.tileSize; py += 8) context.fillRect(x * GRID.tileSize + px, y * GRID.tileSize + py, 2, 2);
      }
    } else {
      context.fillRect(x * GRID.tileSize, (y + 1) * GRID.tileSize - 2, GRID.tileSize, 2);
      context.fillRect(x * GRID.tileSize + (y % 2 ? 10 : 24), y * GRID.tileSize, 2, GRID.tileSize);
    }
  }

  drawGrid() {
    const { context, canvas } = this;
    context.strokeStyle = '#58606020'; context.lineWidth = 1;
    for (let x = 0; x <= GRID.columns; x += 1) {
      context.beginPath(); context.moveTo(x * GRID.tileSize, 0); context.lineTo(x * GRID.tileSize, canvas.height); context.stroke();
    }
    for (let y = 0; y <= GRID.rows; y += 1) {
      context.beginPath(); context.moveTo(0, y * GRID.tileSize); context.lineTo(canvas.width, y * GRID.tileSize); context.stroke();
    }
  }

  drawWall(x1, y1, x2, y2) {
    const { context, state } = this;
    context.lineCap = 'square'; context.strokeStyle = '#353b3e'; context.lineWidth = state.wallWidth + 5;
    context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
    context.strokeStyle = state.wallColor; context.lineWidth = state.wallWidth; context.stroke();
    context.strokeStyle = '#ffffff66'; context.lineWidth = 2;
    context.beginPath(); context.moveTo(x1, y1 - 2); context.lineTo(x2, y2 - 2); context.stroke();
  }

  drawWalls() {
    this.state.cells.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      const left = x * GRID.tileSize, top = y * GRID.tileSize;
      const right = left + GRID.tileSize, bottom = top + GRID.tileSize;
      if (!hasCell(this.state, x, y - 1)) this.drawWall(left, top, right, top);
      if (!hasCell(this.state, x + 1, y)) this.drawWall(right, top, right, bottom);
      if (!hasCell(this.state, x, y + 1)) this.drawWall(left, bottom, right, bottom);
      if (!hasCell(this.state, x - 1, y)) this.drawWall(left, top, left, bottom);
    });
  }

  drawDoors() {
    const { context } = this;
    this.state.doors.forEach(({ x, y, side }) => {
      const left = x * GRID.tileSize, top = y * GRID.tileSize;
      context.strokeStyle = '#77421f'; context.lineWidth = 7; context.beginPath();
      if (side === 'left' || side === 'right') {
        const position = left + (side === 'right' ? GRID.tileSize : 0);
        context.moveTo(position, top + 8); context.lineTo(position, top + GRID.tileSize - 8);
      } else {
        const position = top + (side === 'bottom' ? GRID.tileSize : 0);
        context.moveTo(left + 8, position); context.lineTo(left + GRID.tileSize - 8, position);
      }
      context.stroke();
    });
  }

  drawObjects() {
    this.state.objects.forEach((object) => drawSprite(this.context, object.type,
      (object.x + 0.5) * GRID.tileSize, (object.y + 0.5) * GRID.tileSize, 0.58, object.rotation));
  }

  drawPreview() {
    const { start, end, erase } = this.preview;
    const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
    const width = Math.abs(start.x - end.x) + 1, height = Math.abs(start.y - end.y) + 1;
    this.context.fillStyle = erase ? '#bd392a44' : '#d66a3244';
    this.context.fillRect(x * GRID.tileSize, y * GRID.tileSize, width * GRID.tileSize, height * GRID.tileSize);
    this.context.strokeStyle = '#d66a32'; this.context.lineWidth = 2;
    this.context.strokeRect(x * GRID.tileSize, y * GRID.tileSize, width * GRID.tileSize, height * GRID.tileSize);
  }
}

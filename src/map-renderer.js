import { hasCell } from './map-state.js';
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

  draw({ editorOverlays = true } = {}) {
    const { context, canvas, state } = this;
    this.resizeCanvas();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8f7f2';
    context.fillRect(0, 0, canvas.width, canvas.height);
    state.cells.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      this.drawFloorTile(x, y);
    });
    if (editorOverlays && state.step === 1 && state.activeTool === 'collision') this.drawCollisionOverlay();
    if (state.showGrid) this.drawGrid();
    this.drawWalls();
    this.drawDoors();
    if (state.step === 2) {
      if (editorOverlays) this.drawZones();
      this.drawObjects(editorOverlays);
    }
    if (editorOverlays && this.preview) this.drawPreview();
  }

  drawCollisionOverlay() {
    const { context, canvas, state } = this;
    const { cellWidth, cellHeight } = state.grid;
    context.fillStyle = 'rgba(184, 54, 45, 0.2)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(54, 184, 92, 0.48)';
    state.collisionCells.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      context.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    });
  }

  resizeCanvas() {
    const width = this.state.grid.columns * this.state.grid.cellWidth;
    const height = this.state.grid.rows * this.state.grid.cellHeight;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  drawFloorTile(x, y) {
    const { context, state } = this;
    const { cellWidth, cellHeight } = state.grid;
    const colors = { blue: '#176f87', wood: '#9f6038', stone: '#b9b8b0' };
    context.fillStyle = colors[state.floor];
    context.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    context.fillStyle = state.floor === 'blue' ? '#0c5a7066' : '#54351d44';
    if (state.floor === 'blue') {
      for (let px = Math.min(5, cellWidth / 2); px < cellWidth; px += 8) {
        for (let py = Math.min(5, cellHeight / 2); py < cellHeight; py += 8) context.fillRect(x * cellWidth + px, y * cellHeight + py, 2, 2);
      }
    } else {
      context.fillRect(x * cellWidth, (y + 1) * cellHeight - 2, cellWidth, 2);
      context.fillRect(x * cellWidth + Math.min(y % 2 ? 10 : 24, cellWidth - 2), y * cellHeight, 2, cellHeight);
    }
  }

  drawGrid() {
    const { context, canvas, state } = this;
    context.strokeStyle = '#58606020'; context.lineWidth = 1;
    for (let x = 0; x <= state.grid.columns; x += 1) {
      context.beginPath(); context.moveTo(x * state.grid.cellWidth, 0); context.lineTo(x * state.grid.cellWidth, canvas.height); context.stroke();
    }
    for (let y = 0; y <= state.grid.rows; y += 1) {
      context.beginPath(); context.moveTo(0, y * state.grid.cellHeight); context.lineTo(canvas.width, y * state.grid.cellHeight); context.stroke();
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
    const { cellWidth, cellHeight } = this.state.grid;
    this.state.cells.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      const left = x * cellWidth, top = y * cellHeight;
      const right = left + cellWidth, bottom = top + cellHeight;
      if (!hasCell(this.state, x, y - 1)) this.drawWall(left, top, right, top);
      if (!hasCell(this.state, x + 1, y)) this.drawWall(right, top, right, bottom);
      if (!hasCell(this.state, x, y + 1)) this.drawWall(left, bottom, right, bottom);
      if (!hasCell(this.state, x - 1, y)) this.drawWall(left, top, left, bottom);
    });
  }

  drawDoors() {
    const { context } = this;
    const { cellWidth, cellHeight } = this.state.grid;
    this.state.doors.forEach(({ x, y, side }) => {
      const left = x * cellWidth, top = y * cellHeight;
      context.strokeStyle = '#77421f'; context.lineWidth = 7; context.beginPath();
      if (side === 'left' || side === 'right') {
        const position = left + (side === 'right' ? cellWidth : 0);
        const inset = Math.min(8, cellHeight / 4);
        context.moveTo(position, top + inset); context.lineTo(position, top + cellHeight - inset);
      } else {
        const position = top + (side === 'bottom' ? cellHeight : 0);
        const inset = Math.min(8, cellWidth / 4);
        context.moveTo(left + inset, position); context.lineTo(left + cellWidth - inset, position);
      }
      context.stroke();
    });
  }

  drawObjects(editorOverlays = true) {
    const { cellWidth, cellHeight } = this.state.grid;
    const scale = 0.58 * Math.min(cellWidth, cellHeight) / 32;
    this.state.objects.forEach((object) => {
      const centerX = (object.x + 0.5) * cellWidth, centerY = (object.y + 0.5) * cellHeight;
      if (object.assetId) drawSprite(this.context, object.assetId, centerX, centerY, scale, object.rotation);
      else if (editorOverlays) {
        this.context.fillStyle = '#7248a8'; this.context.strokeStyle = '#fff'; this.context.lineWidth = 2;
        this.context.beginPath(); this.context.arc(centerX, centerY, Math.max(5, Math.min(cellWidth, cellHeight) * 0.24), 0, Math.PI * 2); this.context.fill(); this.context.stroke();
      }
      if (editorOverlays && this.state.selectedEntity?.kind === 'object' && this.state.selectedEntity.id === object.id) {
        this.context.strokeStyle = '#ffb35f'; this.context.lineWidth = 3;
        this.context.strokeRect(object.x * cellWidth + 2, object.y * cellHeight + 2, cellWidth - 4, cellHeight - 4);
      }
    });
  }

  drawZones() {
    this.state.zones.forEach((zone) => {
      const shape = zone.shape;
      const selected = this.state.selectedEntity?.kind === 'zone' && this.state.selectedEntity.id === zone.id;
      this.context.fillStyle = selected ? 'rgba(232, 142, 47, 0.28)' : 'rgba(91, 84, 196, 0.18)';
      this.context.strokeStyle = selected ? '#e88e2f' : '#5b54c4';
      this.context.lineWidth = selected ? 3 : 2;
      this.context.setLineDash([6, 4]);
      if (shape.type === 'rectangle') {
        this.context.fillRect(shape.x, shape.y, shape.width, shape.height);
        this.context.strokeRect(shape.x, shape.y, shape.width, shape.height);
      } else if (shape.type === 'polygon' && shape.points.length) {
        this.context.beginPath();
        this.context.moveTo(shape.points[0].x, shape.points[0].y);
        shape.points.slice(1).forEach((point) => this.context.lineTo(point.x, point.y));
        this.context.closePath(); this.context.fill(); this.context.stroke();
      }
      this.context.setLineDash([]);
      this.context.fillStyle = selected ? '#8b4b13' : '#3e398b';
      this.context.font = '10px sans-serif';
      const labelPoint = shape.type === 'rectangle' ? shape : shape.points[0];
      this.context.fillText(zone.name || zone.type, labelPoint.x + 5, labelPoint.y + 14);
      if (selected && shape.type === 'polygon') {
        shape.points.forEach((point) => {
          this.context.fillStyle = '#fff'; this.context.strokeStyle = '#e88e2f'; this.context.lineWidth = 2;
          this.context.beginPath(); this.context.arc(point.x, point.y, 5, 0, Math.PI * 2); this.context.fill(); this.context.stroke();
        });
      }
    });
  }

  drawPreview() {
    const { start, end, erase, collision, blocked, zone } = this.preview;
    const { cellWidth, cellHeight } = this.state.grid;
    if (this.preview.polygon) {
      const points = [...this.preview.polygonPoints, this.preview.end];
      if (!points.length) return;
      this.context.fillStyle = 'rgba(91, 84, 196, 0.2)'; this.context.strokeStyle = '#5b54c4'; this.context.lineWidth = 2;
      this.context.beginPath();
      points.forEach((point, index) => {
        const x = (point.x + 0.5) * cellWidth, y = (point.y + 0.5) * cellHeight;
        if (index === 0) this.context.moveTo(x, y); else this.context.lineTo(x, y);
      });
      if (this.preview.polygonPoints.length >= 3) { this.context.closePath(); this.context.fill(); }
      this.context.stroke();
      this.preview.polygonPoints.forEach((point) => {
        this.context.fillStyle = '#fff'; this.context.beginPath();
        this.context.arc((point.x + 0.5) * cellWidth, (point.y + 0.5) * cellHeight, 4, 0, Math.PI * 2);
        this.context.fill(); this.context.stroke();
      });
      return;
    }
    const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
    const width = Math.abs(start.x - end.x) + 1, height = Math.abs(start.y - end.y) + 1;
    this.context.fillStyle = zone ? 'rgba(91, 84, 196, 0.28)' : (collision ? (blocked ? 'rgba(180, 38, 32, 0.7)' : 'rgba(40, 190, 85, 0.7)') : (erase ? '#bd392a44' : '#d66a3244'));
    this.context.fillRect(x * cellWidth, y * cellHeight, width * cellWidth, height * cellHeight);
    this.context.strokeStyle = zone ? '#5b54c4' : (collision ? (blocked ? '#8f1f1b' : '#18743a') : '#d66a32'); this.context.lineWidth = 2;
    this.context.strokeRect(x * cellWidth, y * cellHeight, width * cellWidth, height * cellHeight);
  }
}

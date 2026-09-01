import {
  createPolygonZone, createRectangleZone, getSelectedEntity, paintCollisionRectangle, paintRectangle, placeGenericObject,
  placeOrRotateObject, selectEntityAt, toggleDoor,
} from './map-state.js';

export class ToolController {
  constructor({ canvas, state, renderer, history, onChange, onPosition, onSelection, notify }) {
    Object.assign(this, { canvas, state, renderer, history, onChange, onPosition, onSelection, notify });
    this.dragging = false;
    this.start = null;
    this.polygonPoints = [];
    this.vertexDrag = null;
    canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
    canvas.addEventListener('pointerleave', () => onPosition(null));
    canvas.addEventListener('dblclick', (event) => {
      if (this.state.step === 2 && this.state.entityTool === 'zone' && this.state.zoneShape === 'polygon') {
        event.preventDefault(); this.finishPolygon();
      }
    });
  }

  logicalCenter(position) {
    return { x: (position.x + 0.5) * this.state.grid.cellWidth, y: (position.y + 0.5) * this.state.grid.cellHeight };
  }

  selectedPolygonVertex(position) {
    const entity = getSelectedEntity(this.state);
    if (this.state.selectedEntity?.kind !== 'zone' || entity?.shape.type !== 'polygon') return null;
    const logical = this.logicalCenter(position);
    const index = entity.shape.points.findIndex((point) =>
      Math.abs(point.x - logical.x) <= this.state.grid.cellWidth / 2
      && Math.abs(point.y - logical.y) <= this.state.grid.cellHeight / 2);
    return index < 0 ? null : { zone: entity, index };
  }

  positionFromEvent(event) {
    const bounds = this.canvas.getBoundingClientRect();
    const { columns, rows, cellWidth, cellHeight } = this.state.grid;
    return {
      x: Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - bounds.left) * this.canvas.width / bounds.width / cellWidth))),
      y: Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - bounds.top) * this.canvas.height / bounds.height / cellHeight))),
    };
  }

  pointerDown(event) {
    const position = this.positionFromEvent(event);
    this.history.checkpoint();
    if (this.state.step === 2) {
      if (this.state.entityTool === 'asset') {
        if (!placeOrRotateObject(this.state, position)) this.notify('Placez l’objet dans le plan');
        else { this.changed(); this.onSelection(); }
      } else if (this.state.entityTool === 'object') {
        placeGenericObject(this.state, position); this.changed(); this.onSelection();
      } else if (this.state.entityTool === 'select') {
        const vertex = this.selectedPolygonVertex(position);
        if (vertex) {
          this.vertexDrag = vertex; this.dragging = true;
          this.canvas.setPointerCapture(event.pointerId);
        } else { selectEntityAt(this.state, position); this.renderer.draw(); this.onSelection(); }
      } else if (this.state.entityTool === 'zone') {
        if (this.state.zoneShape === 'polygon') {
          const previous = this.polygonPoints.at(-1);
          if (!previous || previous.x !== position.x || previous.y !== position.y) this.polygonPoints.push(position);
          this.renderer.setPreview({ polygon: true, polygonPoints: this.polygonPoints, end: position });
        } else {
          this.dragging = true; this.start = position;
          this.canvas.setPointerCapture(event.pointerId);
          this.renderer.setPreview({ start: position, end: position, zone: true });
        }
      }
      return;
    }
    if (this.state.activeTool === 'door') {
      const result = toggleDoor(this.state, position);
      if (result === 'outside') this.notify('Placez la porte sur une surface');
      else if (result === 'not-on-edge') this.notify('Choisissez une cellule en bordure');
      else this.changed();
      return;
    }
    if (this.state.activeTool === 'select') return;
    this.dragging = true; this.start = position;
    this.canvas.setPointerCapture(event.pointerId);
    this.renderer.setPreview({
      start: position, end: position,
      erase: this.state.activeTool === 'erase',
      collision: this.state.activeTool === 'collision',
      blocked: this.state.collisionBrush === 'blocked',
    });
  }

  pointerMove(event) {
    const position = this.positionFromEvent(event);
    this.onPosition(position);
    if (this.vertexDrag) {
      this.vertexDrag.zone.shape.points[this.vertexDrag.index] = this.logicalCenter(position);
      this.renderer.draw();
    } else if (this.state.step === 2 && this.state.entityTool === 'zone' && this.state.zoneShape === 'polygon' && this.polygonPoints.length) {
      this.renderer.setPreview({ polygon: true, polygonPoints: this.polygonPoints, end: position });
    } else if (this.dragging && this.state.step === 2) this.renderer.setPreview({ start: this.start, end: position, zone: true });
    else if (this.dragging) this.renderer.setPreview({
      start: this.start, end: position,
      erase: this.state.activeTool === 'erase',
      collision: this.state.activeTool === 'collision',
      blocked: this.state.collisionBrush === 'blocked',
    });
  }

  pointerUp(event) {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.vertexDrag) {
      this.vertexDrag.zone.shape.points[this.vertexDrag.index] = this.logicalCenter(this.positionFromEvent(event));
      this.vertexDrag = null; this.changed(); this.onSelection(); return;
    }
    const end = this.positionFromEvent(event);
    if (this.state.step === 2 && this.state.entityTool === 'zone') {
      createRectangleZone(this.state, this.start, end); this.onSelection();
    } else if (this.state.activeTool === 'collision') paintCollisionRectangle(this.state, this.start, end, this.state.collisionBrush === 'blocked');
    else paintRectangle(this.state, this.start, end, this.state.activeTool === 'erase');
    this.renderer.clearPreview();
    this.changed();
  }

  finishPolygon() {
    if (this.polygonPoints.length < 3) { this.notify('Ajoutez au moins trois sommets.'); return false; }
    createPolygonZone(this.state, this.polygonPoints);
    this.polygonPoints = [];
    this.renderer.clearPreview(); this.changed(); this.onSelection();
    return true;
  }

  cancelPolygon() {
    this.polygonPoints = [];
    this.renderer.clearPreview(); this.renderer.draw();
  }

  changed() { this.onChange(); this.renderer.draw(); }
}

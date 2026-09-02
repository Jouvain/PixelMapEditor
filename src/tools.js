import {
  createPolygonZone, createRectangleZone, getSelectedEntity, moveBlueprintSelection, moveDoor, moveObject, objectPosition, paintCollisionRectangle, paintRectangle,
  placeGenericObject, placeOrRotateObject, polygonSelfIntersects, resizeRectangleZone, selectEntityAt, toggleDoor, translateZone,
  selectBlueprintRectangle,
} from './map-state.js';

export class ToolController {
  constructor({ canvas, state, renderer, history, onChange, onPosition, onSelection, notify }) {
    Object.assign(this, { canvas, state, renderer, history, onChange, onPosition, onSelection, notify });
    this.dragging = false;
    this.start = null;
    this.polygonPoints = [];
    this.vertexDrag = null;
    this.objectDrag = null;
    this.zoneDrag = null;
    this.rectangleDrag = null;
    this.blueprintDrag = null;
    this.doorDrag = null;
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

  selectedPolygonVertex(logical) {
    const entity = getSelectedEntity(this.state);
    if (this.state.selectedEntity?.kind !== 'zone' || entity?.shape.type !== 'polygon') return null;
    const tolerance = Math.max(6, Math.min(this.state.grid.cellWidth, this.state.grid.cellHeight) / 3);
    const index = entity.shape.points.findIndex((point) =>
      Math.abs(point.x - logical.x) <= tolerance && Math.abs(point.y - logical.y) <= tolerance);
    return index < 0 ? null : { zone: entity, index };
  }

  selectedRectangleHandle(logical) {
    const zone = getSelectedEntity(this.state);
    if (this.state.selectedEntity?.kind !== 'zone' || zone?.shape.type !== 'rectangle') return null;
    const { x, y, width, height } = zone.shape;
    const tolerance = Math.max(7, Math.min(this.state.grid.cellWidth, this.state.grid.cellHeight) / 3);
    const handles = { nw: { x, y }, ne: { x: x + width, y }, se: { x: x + width, y: y + height }, sw: { x, y: y + height } };
    const handle = Object.entries(handles).find(([, point]) => Math.abs(point.x - logical.x) <= tolerance && Math.abs(point.y - logical.y) <= tolerance);
    return handle ? { zone, handle: handle[0] } : null;
  }

  positionFromEvent(event) {
    const logical = this.logicalPositionFromEvent(event);
    const { columns, rows, cellWidth, cellHeight } = this.state.grid;
    return {
      x: Math.max(0, Math.min(columns - 1, Math.floor(logical.x / cellWidth))),
      y: Math.max(0, Math.min(rows - 1, Math.floor(logical.y / cellHeight))),
    };
  }

  logicalPositionFromEvent(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.canvas.width, (event.clientX - bounds.left) * this.canvas.width / bounds.width)),
      y: Math.max(0, Math.min(this.canvas.height, (event.clientY - bounds.top) * this.canvas.height / bounds.height)),
    };
  }

  pointerDown(event) {
    const position = this.positionFromEvent(event);
    const logical = this.logicalPositionFromEvent(event);
    this.history.checkpoint();
    if (this.state.step === 2) {
      if (this.state.entityTool === 'asset') {
        if (!placeOrRotateObject(this.state, position)) this.notify('Placez l’objet dans le plan');
        else { this.changed(); this.onSelection(); }
      } else if (this.state.entityTool === 'object') {
        placeGenericObject(this.state, position); this.changed(); this.onSelection();
      } else if (this.state.entityTool === 'select') {
        const vertex = this.selectedPolygonVertex(logical);
        const rectangle = this.selectedRectangleHandle(logical);
        if (vertex) {
          this.state.selectedZoneVertex = vertex.index;
          this.vertexDrag = { ...vertex, originalPoint: structuredClone(vertex.zone.shape.points[vertex.index]), moved: false }; this.dragging = true;
          this.canvas.setPointerCapture(event.pointerId);
          this.renderer.draw(); this.onSelection();
        } else if (rectangle) {
          this.rectangleDrag = { ...rectangle, moved: false }; this.dragging = true;
          this.canvas.setPointerCapture(event.pointerId);
        } else {
          selectEntityAt(this.state, position, logical);
          const entity = getSelectedEntity(this.state);
          if (this.state.selectedEntity?.kind === 'object' && entity) {
            const center = objectPosition(this.state, entity);
            this.objectDrag = { object: entity, offsetX: center.x - logical.x, offsetY: center.y - logical.y, moved: false };
            this.dragging = true; this.canvas.setPointerCapture(event.pointerId);
          } else if (this.state.selectedEntity?.kind === 'zone' && entity) {
            this.state.selectedZoneVertex = null;
            this.zoneDrag = { zone: entity, start: logical, sourceShape: structuredClone(entity.shape), moved: false };
            this.dragging = true; this.canvas.setPointerCapture(event.pointerId);
          }
          this.renderer.draw(); this.onSelection();
        }
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
      const door = this.state.doors.find((item) => item.x === position.x && item.y === position.y);
      if (door) {
        this.state.selectedDoorId = door.id;
        this.doorDrag = { door, moved: false }; this.dragging = true;
        this.canvas.setPointerCapture(event.pointerId); this.renderer.draw(); this.onSelection(); return;
      }
      const result = toggleDoor(this.state, position);
      if (result === 'outside') this.notify('Placez la porte sur une surface');
      else if (result === 'not-on-edge') this.notify('Choisissez une cellule en bordure');
      else { this.changed(); this.onSelection(); }
      return;
    }
    if (this.state.activeTool === 'select') {
      this.dragging = true; this.start = position;
      this.blueprintDrag = { mode: this.state.blueprintSelection.has(`${position.x},${position.y}`) ? 'move' : 'select' };
      this.canvas.setPointerCapture(event.pointerId);
      this.renderer.setPreview({ start: position, end: position, blueprintSelection: this.blueprintDrag.mode === 'select', blueprintMove: this.blueprintDrag.mode === 'move' });
      return;
    }
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
      this.vertexDrag.zone.shape.points[this.vertexDrag.index] = this.logicalPositionFromEvent(event);
      this.vertexDrag.moved = true; this.renderer.draw(); this.onSelection();
    } else if (this.doorDrag) {
      const before = `${this.doorDrag.door.x},${this.doorDrag.door.y},${this.doorDrag.door.side}`;
      moveDoor(this.state, this.doorDrag.door, position);
      this.doorDrag.moved ||= before !== `${this.doorDrag.door.x},${this.doorDrag.door.y},${this.doorDrag.door.side}`;
      this.renderer.draw(); this.onSelection();
    } else if (this.rectangleDrag) {
      resizeRectangleZone(this.state, this.rectangleDrag.zone, this.rectangleDrag.handle, this.logicalPositionFromEvent(event));
      this.rectangleDrag.moved = true; this.renderer.draw(); this.onSelection();
    } else if (this.zoneDrag) {
      const logical = this.logicalPositionFromEvent(event);
      translateZone(this.state, this.zoneDrag.zone, { x: logical.x - this.zoneDrag.start.x, y: logical.y - this.zoneDrag.start.y }, this.zoneDrag.sourceShape);
      this.zoneDrag.moved = true; this.renderer.draw(); this.onSelection();
    } else if (this.objectDrag) {
      const logical = this.logicalPositionFromEvent(event);
      moveObject(this.state, this.objectDrag.object, { x: logical.x + this.objectDrag.offsetX, y: logical.y + this.objectDrag.offsetY });
      this.objectDrag.moved = true; this.renderer.draw(); this.onSelection();
    } else if (this.state.step === 2 && this.state.entityTool === 'zone' && this.state.zoneShape === 'polygon' && this.polygonPoints.length) {
      this.renderer.setPreview({ polygon: true, polygonPoints: this.polygonPoints, end: position });
    } else if (this.dragging && this.state.step === 2) this.renderer.setPreview({ start: this.start, end: position, zone: true });
    else if (this.dragging && this.blueprintDrag) this.renderer.setPreview({ start: this.start, end: position, blueprintSelection: this.blueprintDrag.mode === 'select', blueprintMove: this.blueprintDrag.mode === 'move' });
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
    if (this.doorDrag) {
      const moved = this.doorDrag.moved; this.doorDrag = null;
      if (moved) this.changed(); this.onSelection(); return;
    }
    if (this.rectangleDrag) {
      const moved = this.rectangleDrag.moved; this.rectangleDrag = null;
      if (moved) this.changed(); this.onSelection(); return;
    }
    if (this.zoneDrag) {
      const moved = this.zoneDrag.moved; this.zoneDrag = null;
      if (moved) this.changed(); this.onSelection(); return;
    }
    if (this.objectDrag) {
      const moved = this.objectDrag.moved;
      this.objectDrag = null;
      if (moved) this.changed();
      this.onSelection(); return;
    }
    if (this.vertexDrag) {
      const drag = this.vertexDrag;
      drag.zone.shape.points[drag.index] = this.logicalPositionFromEvent(event);
      if (polygonSelfIntersects(drag.zone.shape.points)) {
        drag.zone.shape.points[drag.index] = drag.originalPoint;
        this.notify('Déplacement refusé : le polygone s’auto-intersecterait.');
      } else if (drag.moved) this.changed();
      this.vertexDrag = null; this.renderer.draw(); this.onSelection(); return;
    }
    const end = this.positionFromEvent(event);
    if (this.blueprintDrag) {
      if (this.blueprintDrag.mode === 'move') moveBlueprintSelection(this.state, { x: end.x - this.start.x, y: end.y - this.start.y });
      else selectBlueprintRectangle(this.state, this.start, end);
      this.blueprintDrag = null;
    } else if (this.state.step === 2 && this.state.entityTool === 'zone') {
      createRectangleZone(this.state, this.start, end); this.onSelection();
    } else if (this.state.activeTool === 'collision') paintCollisionRectangle(this.state, this.start, end, this.state.collisionBrush === 'blocked');
    else paintRectangle(this.state, this.start, end, this.state.activeTool === 'erase');
    this.renderer.clearPreview();
    this.changed();
  }

  finishPolygon() {
    if (this.polygonPoints.length < 3) { this.notify('Ajoutez au moins trois sommets.'); return false; }
    try { createPolygonZone(this.state, this.polygonPoints); }
    catch (error) { this.notify(error.message); return false; }
    this.polygonPoints = [];
    this.renderer.clearPreview(); this.changed(); this.onSelection();
    return true;
  }

  cancelPolygon() {
    this.polygonPoints = [];
    this.renderer.clearPreview(); this.renderer.draw();
  }

  undoPolygonPoint() {
    if (!this.polygonPoints.length) return false;
    this.polygonPoints.pop();
    if (this.polygonPoints.length) this.renderer.setPreview({ polygon: true, polygonPoints: this.polygonPoints, end: this.polygonPoints.at(-1) });
    else { this.renderer.clearPreview(); this.renderer.draw(); }
    return true;
  }

  changed() { this.onChange(); this.renderer.draw(); }
}

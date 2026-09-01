import { GRID, paintRectangle, placeOrRotateObject, toggleDoor } from './map-state.js';

export class ToolController {
  constructor({ canvas, state, renderer, history, onChange, onPosition, notify }) {
    Object.assign(this, { canvas, state, renderer, history, onChange, onPosition, notify });
    this.dragging = false;
    this.start = null;
    canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
    canvas.addEventListener('pointerleave', () => onPosition(null));
  }

  positionFromEvent(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(GRID.columns - 1, Math.floor((event.clientX - bounds.left) * this.canvas.width / bounds.width / GRID.tileSize))),
      y: Math.max(0, Math.min(GRID.rows - 1, Math.floor((event.clientY - bounds.top) * this.canvas.height / bounds.height / GRID.tileSize))),
    };
  }

  pointerDown(event) {
    const position = this.positionFromEvent(event);
    this.history.checkpoint();
    if (this.state.step === 2) {
      if (!placeOrRotateObject(this.state, position)) this.notify('Placez l’objet dans le plan');
      else this.changed();
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
    this.renderer.setPreview({ start: position, end: position, erase: this.state.activeTool === 'erase' });
  }

  pointerMove(event) {
    const position = this.positionFromEvent(event);
    this.onPosition(position);
    if (this.dragging) this.renderer.setPreview({ start: this.start, end: position, erase: this.state.activeTool === 'erase' });
  }

  pointerUp(event) {
    if (!this.dragging) return;
    this.dragging = false;
    paintRectangle(this.state, this.start, this.positionFromEvent(event), this.state.activeTool === 'erase');
    this.renderer.clearPreview();
    this.changed();
  }

  changed() { this.onChange(); this.renderer.draw(); }
}

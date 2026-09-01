import { applySerializable, toSerializable } from './map-state.js';

const STORAGE_KEY = 'pixel-map';

export function saveProject(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSerializable(state)));
}

export function loadProject(state) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  try { applySerializable(state, JSON.parse(stored)); return true; }
  catch (error) { console.warn('Sauvegarde illisible', error); return false; }
}

export function exportPng(canvas, projectName) {
  const link = document.createElement('a');
  link.download = `${projectName.trim().replace(/\s+/g, '-').toLowerCase() || 'pixel-map'}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

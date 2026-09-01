import { applySerializable } from './map-state.js';
import { projectToState, stateToDocument, stateToProject } from './project-adapter.js';
import { createPixelMapProject, PIXEL_MAP_FORMAT, PIXEL_MAP_PROJECT_FORMAT, validatePixelMap, validatePixelMapProject } from './pixel-map-format.js';

const STORAGE_KEY = 'pixel-map-project-v1';
const LEGACY_STORAGE_KEY = 'pixel-map';
const filename = (name, suffix) => `${name.trim().replace(/\s+/g, '-').toLowerCase() || 'pixel-map'}${suffix}`;

function downloadJson(data, name) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = name; link.href = url; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function saveProject(state, zoom = 1) {
  const project = stateToProject(state, zoom);
  const validation = validatePixelMapProject(project);
  if (validation.valid) localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  return validation;
}

export function loadProject(state) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const project = JSON.parse(stored);
      const validation = validatePixelMapProject(project);
      if (!validation.valid) return { loaded: false, validation };
      return { loaded: true, zoom: projectToState(project, state), validation };
    } catch (error) { return { loaded: false, error }; }
  }
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return { loaded: false };
  try { applySerializable(state, JSON.parse(legacy)); return { loaded: true, migrated: true, zoom: 1 }; }
  catch (error) { return { loaded: false, error }; }
}

export function exportPixelMap(state) {
  const document = stateToDocument(state);
  const validation = validatePixelMap(document);
  if (validation.valid) downloadJson(document, filename(state.projectName, '.pmap.json'));
  return validation;
}

export function exportProject(state, zoom = 1) {
  const project = stateToProject(state, zoom);
  const validation = validatePixelMapProject(project);
  if (validation.valid) downloadJson(project, filename(state.projectName, '.pmap-project.json'));
  return validation;
}

export async function importProjectFile(file, state) {
  const data = JSON.parse(await file.text());
  const project = data.format === PIXEL_MAP_FORMAT ? createPixelMapProject(data) : data;
  if (project.format !== PIXEL_MAP_PROJECT_FORMAT) throw new Error('Format attendu : pixel-map ou pixel-map-project.');
  const validation = validatePixelMapProject(project);
  if (!validation.valid) return { imported: false, validation };
  return { imported: true, validation, zoom: projectToState(project, state) };
}

export function exportPng(canvas, projectName) {
  const link = document.createElement('a');
  link.download = filename(projectName, '.png');
  link.href = canvas.toDataURL('image/png'); link.click();
}

export function firstValidationMessage(validation) {
  const errors = validation.issues.filter((item) => item.severity === 'error');
  return errors.length ? `${errors.length} erreur(s) : ${errors[0].path} — ${errors[0].message}` : null;
}

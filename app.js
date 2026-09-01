import { ASSETS, drawSprite } from './src/assets.js';
import { analyzeGridResize, createHistory, createMapState, resizeGrid } from './src/map-state.js';
import { MapRenderer } from './src/map-renderer.js';
import { ToolController } from './src/tools.js';
import {
  exportPixelMap, exportPng, exportProject, firstValidationMessage,
  importProjectFile, loadProject, saveProject,
} from './src/export.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const canvas = $('#map');
const state = createMapState();
const loadedProject = loadProject(state);
const history = createHistory(state);
const renderer = new MapRenderer(canvas, state);
let zoom = loadedProject.zoom || 1;

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('on');
  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => toast.classList.remove('on'), 1500);
}

function markDirty() { $('#saved').textContent = 'Modifié'; }

function updateStats() {
  const count = state.cells.size;
  $('#cells').textContent = count;
  $('#area').textContent = `${Math.round(count * 1.2)} m²`;
  $('#doors').textContent = state.doors.length;
  $('#empty').hidden = count > 0;
  $('#rooms').textContent = count ? '1 pièce' : '0 pièce';
}

function updateStep() {
  const blueprint = state.step === 1;
  $$('.step').forEach((button) => button.classList.toggle('on', Number(button.dataset.step) === state.step));
  $('#build').hidden = !blueprint;
  $('#dress').hidden = blueprint;
  $('#summary').hidden = !blueprint;
  $('#library').hidden = blueprint;
  $('#mode').textContent = blueprint ? 'MODE BLUEPRINT' : 'MODE HABILLAGE';
  $('#help').textContent = blueprint ? 'Dessinez les surfaces, puis ajoutez des portes sur leurs contours.' : 'Choisissez un sol et placez du mobilier sur votre plan.';
  $('#next').textContent = blueprint ? 'Continuer vers l’habillage →' : '← Retour au blueprint';
}

function syncControls() {
  $$('.tool').forEach((button) => button.classList.toggle('on', button.dataset.tool === state.activeTool));
  $$('.swatch').forEach((button) => button.classList.toggle('on', button.dataset.color === state.wallColor));
  $$('.floor').forEach((button) => button.classList.toggle('on', button.dataset.floor === state.floor));
  $('#width').value = state.wallWidth;
  $('#widthOut').textContent = `${state.wallWidth} px`;
  $('#grid').checked = state.showGrid;
  $('#gridColumns').value = state.grid.columns;
  $('#gridRows').value = state.grid.rows;
  $('#cellWidth').value = state.grid.cellWidth;
  $('#cellHeight').value = state.grid.cellHeight;
  $('#mapResolution').textContent = `${state.grid.columns * state.grid.cellWidth} × ${state.grid.rows * state.grid.cellHeight}`;
}

function refresh() { updateStep(); updateStats(); syncControls(); renderer.draw(); }

function renderAssetLibrary() {
  const category = $('.cats .on').dataset.cat;
  const query = $('#search').value.toLowerCase();
  $('#assets').replaceChildren();
  ASSETS.filter((item) => (category === 'all' || item.category === category) && item.name.toLowerCase().includes(query))
    .forEach((item) => {
      const button = document.createElement('button');
      const preview = document.createElement('canvas');
      preview.width = 96; preview.height = 70;
      drawSprite(preview.getContext('2d'), item.id, 48, 35, 0.75);
      button.classList.toggle('on', state.selectedAsset === item.id);
      button.append(preview);
      button.insertAdjacentHTML('beforeend', `<b>${item.name}</b>`);
      button.addEventListener('click', () => { state.selectedAsset = item.id; renderAssetLibrary(); });
      $('#assets').append(button);
    });
}

new ToolController({
  canvas, state, renderer, history,
  onChange: () => { markDirty(); updateStats(); },
  onPosition: (position) => { $('#coords').innerHTML = position ? `X: ${position.x} &nbsp; Y: ${position.y}` : 'X: — &nbsp; Y: —'; },
  notify,
});

$$('.tool').forEach((button) => button.addEventListener('click', () => {
  $$('.tool').forEach((item) => item.classList.remove('on'));
  button.classList.add('on');
  state.activeTool = button.dataset.tool;
}));
$$('.step').forEach((button) => button.addEventListener('click', () => { state.step = Number(button.dataset.step); refresh(); }));
$$('.swatch').forEach((button) => button.addEventListener('click', () => {
  state.wallColor = button.dataset.color;
  $$('.swatch').forEach((item) => item.classList.remove('on'));
  button.classList.add('on'); markDirty(); renderer.draw();
}));
$$('.floor').forEach((button) => button.addEventListener('click', () => {
  state.floor = button.dataset.floor;
  $$('.floor').forEach((item) => item.classList.remove('on'));
  button.classList.add('on'); markDirty(); renderer.draw();
}));
$$('.cats button').forEach((button) => button.addEventListener('click', () => {
  $$('.cats button').forEach((item) => item.classList.remove('on'));
  button.classList.add('on'); renderAssetLibrary();
}));

$('#search').addEventListener('input', renderAssetLibrary);
$('#width').addEventListener('input', (event) => {
  state.wallWidth = Number(event.target.value);
  $('#widthOut').textContent = `${state.wallWidth} px`;
  markDirty(); renderer.draw();
});
$('#grid').addEventListener('change', (event) => { state.showGrid = event.target.checked; renderer.draw(); });
$('#applyDimensions').addEventListener('click', () => {
  try {
    const nextGrid = {
      columns: Number($('#gridColumns').value), rows: Number($('#gridRows').value),
      cellWidth: Number($('#cellWidth').value), cellHeight: Number($('#cellHeight').value),
    };
    const analysis = analyzeGridResize(state, nextGrid);
    if (analysis.totalLosses) {
      const { cells, doors, objects, zones } = analysis.losses;
      if (!window.confirm(`Réduire la carte supprimera ${cells} case(s), ${doors} porte(s), ${objects} objet(s) et ${zones} zone(s). Continuer ?`)) { syncControls(); return; }
    }
    history.checkpoint();
    resizeGrid(state, nextGrid, true);
    markDirty(); refresh();
    notify(`Grille ${state.grid.columns} × ${state.grid.rows}, cases ${state.grid.cellWidth} × ${state.grid.cellHeight}`);
  } catch (error) { notify(error.message); syncControls(); }
});
$('#next').addEventListener('click', () => { state.step = state.step === 1 ? 2 : 1; refresh(); });
$('#undo').addEventListener('click', () => { if (history.undo()) { markDirty(); refresh(); } });
$('#save').addEventListener('click', () => {
  state.projectName = $('#name').value;
  const validation = saveProject(state, zoom);
  const error = firstValidationMessage(validation);
  if (error) notify(error);
  else { $('#saved').textContent = 'Sauvegardé'; notify('Projet Pixel Map v1 sauvegardé'); }
});
$('#export').addEventListener('click', () => { exportPng(canvas, $('#name').value); notify('Export PNG généré'); });
$('#exportJson').addEventListener('click', () => {
  state.projectName = $('#name').value;
  const error = firstValidationMessage(exportPixelMap(state));
  notify(error || 'Export Pixel Map v1 généré');
});
$('#exportProject').addEventListener('click', () => {
  state.projectName = $('#name').value;
  const error = firstValidationMessage(exportProject(state, zoom));
  notify(error || 'Fichier projet généré');
});
$('#importProject').addEventListener('click', () => $('#projectFile').click());
$('#projectFile').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const result = await importProjectFile(file, state);
    const error = firstValidationMessage(result.validation);
    if (error) notify(error);
    else {
      zoom = result.zoom; setZoom(0); $('#name').value = state.projectName;
      renderAssetLibrary(); refresh(); markDirty(); notify('Projet Pixel Map v1 importé');
    }
  } catch (error) { notify(error.message); }
  event.target.value = '';
});
$('#name').addEventListener('input', (event) => { state.projectName = event.target.value; markDirty(); });

function setZoom(change) {
  zoom = Math.max(0.6, Math.min(1.5, zoom + change));
  canvas.style.transform = `scale(${zoom})`;
  $('#zoom').textContent = `${Math.round(zoom * 100)}%`;
}
$('#plus').addEventListener('click', () => setZoom(0.1));
$('#minus').addEventListener('click', () => setZoom(-0.1));
$('#fit').addEventListener('click', () => { zoom = 1; setZoom(0); });
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'z') $('#undo').click();
  const shortcuts = { r: 'room', e: 'erase', d: 'door', v: 'select' };
  if (shortcuts[event.key.toLowerCase()] && !/input/i.test(event.target.tagName)) $(`[data-tool=${shortcuts[event.key.toLowerCase()]}]`).click();
});

$('#name').value = state.projectName;
$('#width').value = state.wallWidth;
$('#grid').checked = state.showGrid;
renderAssetLibrary();
setZoom(0);
refresh();

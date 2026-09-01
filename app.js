import { ASSETS, drawSprite } from './src/assets.js';
import {
  addPolygonVertex, analyzeGridResize, changeObjectOrder, copyBlueprintSelection, createHistory, createMapState,
  deleteBlueprintSelection, deletePolygonVertex, deleteSelectedEntity, duplicateBlueprintSelection, getSelectedEntity,
  moveObject, objectPosition, pasteBlueprintSelection, polygonSelfIntersects, resizeGrid, applySerializable, toSerializable,
} from './src/map-state.js';
import { MapRenderer } from './src/map-renderer.js';
import { ToolController } from './src/tools.js';
import {
  exportPixelMap, exportPng, exportProject, firstValidationMessage,
  importProjectFile, loadProject, saveProject,
} from './src/export.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const canvas = $('#map');
const state = createMapState(undefined, { template: 'empty' });
const loadedProject = loadProject(state);
const history = createHistory(state);
const renderer = new MapRenderer(canvas, state);
let zoom = loadedProject.zoom || 1;
let dirty = false;
if (!loadedProject.loaded) $('#saved').textContent = 'Nouveau';

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('on');
  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => toast.classList.remove('on'), 1500);
}

function markDirty() { dirty = true; $('#saved').textContent = 'Modifié'; }

function updateStats() {
  const count = state.cells.size;
  $('#cells').textContent = count;
  $('#collisionCells').textContent = state.collisionCells.size;
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
  $('#collisionSettings').hidden = state.activeTool !== 'collision';
  $('#blueprintSelectionSettings').hidden = state.activeTool !== 'select';
  $$('[data-collision]').forEach((button) => button.classList.toggle('on', button.dataset.collision === state.collisionBrush));
  $$('[data-entity-tool]').forEach((button) => button.classList.toggle('on', button.dataset.entityTool === state.entityTool));
  const help = {
    asset: 'Choisissez un asset puis cliquez sur la carte.',
    object: 'Cliquez pour créer un objet générique.',
    zone: 'Cliquez-glissez pour dessiner une zone rectangulaire.',
    select: 'Cliquez sur un objet ou une zone pour l’inspecter.',
  };
  $('#entityHelp').textContent = help[state.entityTool];
  $('#assetLibrary').hidden = state.entityTool !== 'asset';
  $('#zoneShapeSettings').hidden = state.entityTool !== 'zone';
  $('#polygonActions').hidden = state.zoneShape !== 'polygon';
  $$('[data-zone-shape]').forEach((button) => button.classList.toggle('on', button.dataset.zoneShape === state.zoneShape));
  $('#width').value = state.wallWidth;
  $('#widthOut').textContent = `${state.wallWidth} px`;
  $('#grid').checked = state.showGrid;
  $('#gridColumns').value = state.grid.columns;
  $('#gridRows').value = state.grid.rows;
  $('#cellWidth').value = state.grid.cellWidth;
  $('#cellHeight').value = state.grid.cellHeight;
  $('#mapResolution').textContent = `${state.grid.columns * state.grid.cellWidth} × ${state.grid.rows * state.grid.cellHeight}`;
}

function refresh() { updateStep(); updateStats(); syncControls(); renderer.draw(); renderInspector(); }

function renderInspector() {
  const entity = getSelectedEntity(state);
  $('#entityInspector').hidden = !entity;
  if (!entity) return;
  $('#entityKind').textContent = state.selectedEntity.kind === 'zone' ? `Zone · ${entity.id}` : `Objet · ${entity.id}`;
  $('#entityType').value = entity.type;
  $('#entityName').value = entity.name || '';
  $('#entityProperties').value = JSON.stringify(entity.properties || {}, null, 2);
  const isObject = state.selectedEntity.kind === 'object';
  $('#objectPosition').hidden = !isObject;
  const isPolygon = state.selectedEntity.kind === 'zone' && entity.shape.type === 'polygon';
  $('#zoneGeometry').hidden = state.selectedEntity.kind !== 'zone';
  $('#addZoneVertex').hidden = !isPolygon;
  $('#deleteZoneVertex').hidden = !isPolygon;
  if (isObject) {
    const position = objectPosition(state, entity);
    $('#entityX').value = Number(position.x.toFixed(3));
    $('#entityY').value = Number(position.y.toFixed(3));
    $('#objectSnap').checked = state.objectSnapToGrid;
  }
}

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

const toolController = new ToolController({
  canvas, state, renderer, history,
  onChange: () => { markDirty(); updateStats(); },
  onPosition: (position) => { $('#coords').innerHTML = position ? `X: ${position.x} &nbsp; Y: ${position.y}` : 'X: — &nbsp; Y: —'; },
  onSelection: renderInspector,
  notify,
});

$$('.tool').forEach((button) => button.addEventListener('click', () => {
  $$('.tool').forEach((item) => item.classList.remove('on'));
  button.classList.add('on');
  state.activeTool = button.dataset.tool;
  syncControls(); renderer.draw();
}));
$$('[data-collision]').forEach((button) => button.addEventListener('click', () => {
  state.collisionBrush = button.dataset.collision;
  syncControls(); renderer.draw();
}));
function changeBlueprintSelection(action, message) {
  history.checkpoint();
  if (!action()) { notify('Aucune surface sélectionnée.'); return false; }
  markDirty(); updateStats(); renderer.draw(); notify(message); return true;
}
$('#duplicateBlueprint').addEventListener('click', () => changeBlueprintSelection(() => duplicateBlueprintSelection(state), 'Sélection dupliquée'));
$('#deleteBlueprint').addEventListener('click', () => changeBlueprintSelection(() => deleteBlueprintSelection(state), 'Sélection supprimée'));
$('#copyBlueprint').addEventListener('click', () => {
  if (copyBlueprintSelection(state)) notify('Sélection copiée'); else notify('Aucune surface sélectionnée.');
});
$('#pasteBlueprint').addEventListener('click', () => changeBlueprintSelection(() => pasteBlueprintSelection(state), 'Sélection collée'));
$$('[data-entity-tool]').forEach((button) => button.addEventListener('click', () => {
  if (state.entityTool === 'zone' && button.dataset.entityTool !== 'zone') toolController.cancelPolygon();
  state.entityTool = button.dataset.entityTool;
  syncControls(); renderer.draw(); renderInspector();
}));
$$('[data-zone-shape]').forEach((button) => button.addEventListener('click', () => {
  toolController.cancelPolygon(); state.zoneShape = button.dataset.zoneShape;
  syncControls(); renderer.draw();
}));
$('#finishPolygon').addEventListener('click', () => toolController.finishPolygon());
$('#undoPolygonPoint').addEventListener('click', () => toolController.undoPolygonPoint());
$('#cancelPolygon').addEventListener('click', () => toolController.cancelPolygon());
$('#addZoneVertex').addEventListener('click', () => {
  const zone = getSelectedEntity(state);
  if (!zone || zone.shape.type !== 'polygon') return;
  history.checkpoint();
  state.selectedZoneVertex = addPolygonVertex(zone, state.selectedZoneVertex);
  markDirty(); renderer.draw(); renderInspector();
});
$('#deleteZoneVertex').addEventListener('click', () => {
  const zone = getSelectedEntity(state);
  if (!zone || zone.shape.type !== 'polygon') return;
  history.checkpoint();
  if (!deletePolygonVertex(zone, state.selectedZoneVertex)) { notify('Sélectionnez un sommet ; trois sommets minimum.'); return; }
  state.selectedZoneVertex = null;
  markDirty(); renderer.draw(); renderInspector();
});
$('#applyEntity').addEventListener('click', () => {
  const entity = getSelectedEntity(state);
  if (!entity) return;
  try {
    const type = $('#entityType').value.trim();
    if (!type) throw new Error('Le type est obligatoire.');
    const properties = JSON.parse($('#entityProperties').value || '{}');
    if (!properties || Array.isArray(properties) || typeof properties !== 'object') throw new Error('Les propriétés doivent être un objet JSON.');
    history.checkpoint();
    entity.type = type; entity.name = $('#entityName').value.trim(); entity.properties = properties;
    if (state.selectedEntity.kind === 'object') {
      const x = Number($('#entityX').value), y = Number($('#entityY').value);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('La position doit contenir deux nombres.');
      moveObject(state, entity, { x, y }, false);
    }
    if (state.selectedEntity.kind === 'zone' && entity.shape.type === 'polygon' && polygonSelfIntersects(entity.shape.points)) throw new Error('Le polygone s’auto-intersecte.');
    markDirty(); renderer.draw(); renderInspector(); notify('Entité mise à jour');
  } catch (error) { notify(`Propriétés invalides : ${error.message}`); }
});
$('#objectSnap').addEventListener('change', (event) => { state.objectSnapToGrid = event.target.checked; markDirty(); });
function reorderSelectedObject(direction) {
  const entity = getSelectedEntity(state);
  if (!entity || state.selectedEntity.kind !== 'object') return;
  history.checkpoint();
  if (changeObjectOrder(state, entity, direction)) { markDirty(); renderer.draw(); notify(direction === 'front' ? 'Objet placé au premier plan' : 'Objet placé à l’arrière-plan'); }
}
$('#bringForward').addEventListener('click', () => reorderSelectedObject('front'));
$('#sendBackward').addEventListener('click', () => reorderSelectedObject('back'));
$('#deleteEntity').addEventListener('click', () => {
  if (!getSelectedEntity(state)) return;
  history.checkpoint(); deleteSelectedEntity(state);
  markDirty(); renderer.draw(); renderInspector(); notify('Entité supprimée');
});
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
      const { cells, collisions, doors, objects, zones } = analysis.losses;
      if (!window.confirm(`Réduire la carte supprimera ${cells} case(s) graphiques, ${collisions} collision(s), ${doors} porte(s), ${objects} objet(s) et ${zones} zone(s). Continuer ?`)) { syncControls(); return; }
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
  else { dirty = false; $('#saved').textContent = 'Sauvegardé'; notify('Projet Pixel Map v1 sauvegardé'); }
});
$('#export').addEventListener('click', () => {
  renderer.draw({ editorOverlays: false });
  exportPng(canvas, $('#name').value);
  renderer.draw();
  notify('Export PNG généré');
});
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
      renderAssetLibrary(); refresh(); renderInspector(); markDirty(); notify('Projet Pixel Map v1 importé');
    }
  } catch (error) { notify(error.message); }
  event.target.value = '';
});
$('#name').addEventListener('input', (event) => { state.projectName = event.target.value; markDirty(); });

const newProjectDialog = $('#newProjectDialog');
$('#newProject').addEventListener('click', () => {
  if (dirty && !window.confirm('Les modifications non sauvegardées seront abandonnées. Continuer ?')) return;
  $('#newProjectName').value = 'Nouvelle carte';
  $('#newColumns').value = state.grid.columns;
  $('#newRows').value = state.grid.rows;
  $('#newCellWidth').value = state.grid.cellWidth;
  $('#newCellHeight').value = state.grid.cellHeight;
  $('#newTemplate').value = 'empty';
  newProjectDialog.showModal();
  $('#newProjectName').focus();
});
$('#cancelNewProject').addEventListener('click', () => newProjectDialog.close());
$('#newProjectForm').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const name = $('#newProjectName').value.trim();
    if (!name) throw new Error('Le nom du projet est obligatoire.');
    const next = createMapState({
      columns: Number($('#newColumns').value), rows: Number($('#newRows').value),
      cellWidth: Number($('#newCellWidth').value), cellHeight: Number($('#newCellHeight').value),
    }, { template: $('#newTemplate').value, projectName: name });
    applySerializable(state, toSerializable(next));
    history.clear(); toolController.cancelPolygon();
    zoom = 1; setZoom(0); $('#name').value = state.projectName;
    dirty = true; $('#saved').textContent = 'Nouveau';
    newProjectDialog.close(); renderAssetLibrary(); refresh();
    notify(`Projet « ${state.projectName} » créé`);
  } catch (error) { notify(error.message); }
});
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault(); event.returnValue = '';
});

function setZoom(change) {
  zoom = Math.max(0.6, Math.min(1.5, zoom + change));
  canvas.style.transform = `scale(${zoom})`;
  $('#zoom').textContent = `${Math.round(zoom * 100)}%`;
}
$('#plus').addEventListener('click', () => setZoom(0.1));
$('#minus').addEventListener('click', () => setZoom(-0.1));
$('#fit').addEventListener('click', () => { zoom = 1; setZoom(0); });
document.addEventListener('keydown', (event) => {
  if (state.step === 2 && state.entityTool === 'zone' && state.zoneShape === 'polygon') {
    if (event.key === 'Enter') { event.preventDefault(); toolController.finishPolygon(); return; }
    if (event.key === 'Escape') { event.preventDefault(); toolController.cancelPolygon(); return; }
    if (event.key === 'Backspace' && !/input|textarea/i.test(event.target.tagName)) { event.preventDefault(); toolController.undoPolygonPoint(); return; }
  }
  const editingField = /input|textarea/i.test(event.target.tagName);
  if (state.step === 1 && state.activeTool === 'select' && !editingField) {
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); $('#deleteBlueprint').click(); return; }
    if (event.ctrlKey && event.key.toLowerCase() === 'c') { event.preventDefault(); $('#copyBlueprint').click(); return; }
    if (event.ctrlKey && event.key.toLowerCase() === 'v') { event.preventDefault(); $('#pasteBlueprint').click(); return; }
    if (event.ctrlKey && event.key.toLowerCase() === 'd') { event.preventDefault(); $('#duplicateBlueprint').click(); return; }
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'z') $('#undo').click();
  const shortcuts = { r: 'room', e: 'erase', d: 'door', v: 'select', c: 'collision' };
  if (shortcuts[event.key.toLowerCase()] && !/input/i.test(event.target.tagName)) $(`[data-tool=${shortcuts[event.key.toLowerCase()]}]`).click();
});

$('#name').value = state.projectName;
$('#width').value = state.wallWidth;
$('#grid').checked = state.showGrid;
renderAssetLibrary();
setZoom(0);
refresh();
renderInspector();

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeGridResize, createMapState, createPolygonZone, createRectangleZone, deleteSelectedEntity,
  normalizeGrid, paintCollisionRectangle, paintRectangle, placeGenericObject, resizeGrid, selectEntityAt,
} from '../src/map-state.js';
import { projectToState, stateToDocument, stateToProject } from '../src/project-adapter.js';
import { validatePixelMap, validatePixelMapProject } from '../src/pixel-map-format.js';

test('l’état actuel produit un document Pixel Map v1 valide', () => {
  const document = stateToDocument(createMapState());
  const validation = validatePixelMap(document);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues));
  assert.equal(document.format, 'pixel-map');
  assert.equal(document.version, '1.0');
  assert.equal(document.map.width, document.grid.columns * document.grid.cellWidth);
  assert.equal(document.collision.defaultBlocked, true);
});

test('le projet sépare les données portables de l’état de l’éditeur', () => {
  const project = stateToProject(createMapState(), 1.2);
  assert.equal(validatePixelMapProject(project).valid, true);
  assert.equal(project.format, 'pixel-map-project');
  assert.equal(project.document.editor, undefined);
  assert.equal(project.editor.zoom, 1.2);
});

test('une dimension incohérente interdit l’export', () => {
  const document = stateToDocument(createMapState());
  document.map.width += 1;
  const validation = validatePixelMap(document);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((item) => item.code === 'grid-width-mismatch'));
});

test('une référence de ressource inconnue interdit l’export', () => {
  const document = stateToDocument(createMapState());
  document.layers[0].tiles[0].resource = 'missing';
  const validation = validatePixelMap(document);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((item) => item.code === 'unknown-resource'));
});

test('un projet exporté peut reconstruire l’état de l’éditeur', () => {
  const source = createMapState();
  source.floor = 'wood';
  source.objects.push({ id: 'desk-1', type: 'desk', x: 5, y: 6, rotation: 1 });
  const project = stateToProject(source, 0.8);
  const destination = createMapState();
  const zoom = projectToState(project, destination);
  assert.equal(destination.floor, 'wood');
  assert.equal(destination.objects[0].id, 'desk-1');
  assert.equal(destination.objects[0].rotation, 1);
  assert.equal(zoom, 0.8);
});

test('une propriété non JSON interdit l’export', () => {
  const document = stateToDocument(createMapState());
  document.properties.invalid = () => 'code exécutable';
  const validation = validatePixelMap(document);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((item) => item.code === 'non-json-properties'));
});

test('une grille dynamique avec cases rectangulaires fait un aller-retour', () => {
  const source = createMapState({ columns: 10, rows: 8, cellWidth: 16, cellHeight: 24 });
  const document = stateToDocument(source);
  assert.equal(validatePixelMap(document).valid, true);
  assert.deepEqual(document.grid, { columns: 10, rows: 8, cellWidth: 16, cellHeight: 24 });
  assert.deepEqual(document.map, { width: 160, height: 192, background: '#f8f7f2' });
  const destination = createMapState();
  projectToState(stateToProject(source), destination);
  assert.deepEqual(destination.grid, source.grid);
});

test('agrandir une grille conserve son contenu', () => {
  const state = createMapState({ columns: 10, rows: 8, cellWidth: 16, cellHeight: 16 });
  const before = state.cells.size;
  const result = resizeGrid(state, { columns: 20, rows: 12, cellWidth: 16, cellHeight: 16 });
  assert.equal(result.resized, true);
  assert.equal(state.cells.size, before);
});

test('réduire une grille annonce les pertes avant de rogner', () => {
  const state = createMapState();
  state.objects.push({ id: 'outside', type: 'desk', x: 30, y: 20, rotation: 0 });
  const next = { columns: 10, rows: 8, cellWidth: 32, cellHeight: 32 };
  const analysis = analyzeGridResize(state, next);
  assert.ok(analysis.totalLosses > 0);
  assert.equal(resizeGrid(state, next).resized, false);
  assert.equal(state.grid.columns, 36);
  assert.equal(resizeGrid(state, next, true).resized, true);
  assert.equal(state.grid.columns, 10);
  assert.equal(state.objects.some((object) => object.id === 'outside'), false);
});

test('les dimensions dépassant la capacité du canvas sont refusées', () => {
  assert.throws(() => normalizeGrid({ columns: 512, rows: 10, cellWidth: 32, cellHeight: 32 }), /canvas est limité/);
});

test('effacer le blueprint ne modifie pas la collision', () => {
  const state = createMapState();
  assert.equal(state.cells.has('3,3'), true);
  assert.equal(state.collisionCells.has('3,3'), true);
  paintRectangle(state, { x: 3, y: 3 }, { x: 3, y: 3 }, true);
  assert.equal(state.cells.has('3,3'), false);
  assert.equal(state.collisionCells.has('3,3'), true);
});

test('peindre une collision ne modifie pas le blueprint', () => {
  const state = createMapState();
  paintCollisionRectangle(state, { x: 3, y: 3 }, { x: 3, y: 3 }, true);
  assert.equal(state.collisionCells.has('3,3'), false);
  assert.equal(state.cells.has('3,3'), true);
  paintCollisionRectangle(state, { x: 0, y: 0 }, { x: 0, y: 0 }, false);
  assert.equal(state.collisionCells.has('0,0'), true);
  assert.equal(state.cells.has('0,0'), false);
});

test('l’export et l’import conservent les collisions indépendantes', () => {
  const source = createMapState();
  paintCollisionRectangle(source, { x: 3, y: 3 }, { x: 3, y: 3 }, true);
  paintCollisionRectangle(source, { x: 0, y: 0 }, { x: 0, y: 0 }, false);
  const project = stateToProject(source);
  const destination = createMapState();
  projectToState(project, destination);
  assert.equal(destination.cells.has('3,3'), true);
  assert.equal(destination.collisionCells.has('3,3'), false);
  assert.equal(destination.cells.has('0,0'), false);
  assert.equal(destination.collisionCells.has('0,0'), true);
});

test('un objet générique conserve son type, son nom et ses propriétés', () => {
  const source = createMapState();
  const object = placeGenericObject(source, { x: 2, y: 4 });
  object.type = 'spawn.player';
  object.name = 'Départ principal';
  object.properties = { facing: 'south', team: 1 };
  const document = stateToDocument(source);
  assert.equal(validatePixelMap(document).valid, true);
  const exported = document.objects.find((item) => item.id === object.id);
  assert.equal(exported.type, 'spawn.player');
  assert.deepEqual(exported.properties, { facing: 'south', team: 1 });
  assert.equal(exported.resource, undefined);
  const destination = createMapState();
  projectToState(stateToProject(source), destination);
  assert.equal(destination.objects.find((item) => item.id === object.id).name, 'Départ principal');
});

test('une zone générique fait un aller-retour et peut être supprimée', () => {
  const source = createMapState({ columns: 10, rows: 10, cellWidth: 16, cellHeight: 24 });
  const zone = createRectangleZone(source, { x: 1, y: 2 }, { x: 3, y: 4 });
  zone.type = 'room.meeting';
  zone.properties = { capacity: 8 };
  assert.deepEqual(zone.shape, { type: 'rectangle', x: 16, y: 48, width: 48, height: 72 });
  const project = stateToProject(source);
  assert.equal(validatePixelMapProject(project).valid, true);
  const destination = createMapState();
  projectToState(project, destination);
  assert.equal(destination.zones[0].type, 'room.meeting');
  assert.deepEqual(destination.zones[0].properties, { capacity: 8 });
  destination.selectedEntity = { kind: 'zone', id: destination.zones[0].id };
  assert.equal(deleteSelectedEntity(destination), true);
  assert.equal(destination.zones.length, 0);
});

test('une zone polygonale peut être créée, sélectionnée et réimportée', () => {
  const source = createMapState({ columns: 10, rows: 10, cellWidth: 20, cellHeight: 20 });
  const zone = createPolygonZone(source, [{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 4, y: 6 }]);
  zone.type = 'trigger.area';
  zone.properties = { event: 'enter' };
  assert.deepEqual(zone.shape.points[0], { x: 30, y: 30 });
  source.selectedEntity = null;
  assert.deepEqual(selectEntityAt(source, { x: 4, y: 3 }), { kind: 'zone', id: zone.id });
  source.selectedEntity = null;
  assert.equal(selectEntityAt(source, { x: 9, y: 9 }), null);
  const project = stateToProject(source);
  assert.equal(validatePixelMapProject(project).valid, true);
  const destination = createMapState();
  projectToState(project, destination);
  assert.equal(destination.zones[0].shape.type, 'polygon');
  assert.deepEqual(destination.zones[0].shape.points, zone.shape.points);
  assert.deepEqual(destination.zones[0].properties, { event: 'enter' });
});

test('un polygone refuse moins de trois sommets', () => {
  const state = createMapState();
  assert.throws(() => createPolygonZone(state, [{ x: 1, y: 1 }, { x: 2, y: 2 }]), /au moins trois sommets/);
});

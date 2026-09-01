import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPolygonVertex, analyzeGridResize, applySerializable, changeObjectOrder, copyBlueprintSelection, createHistory, createMapState, createPolygonZone,
  createRectangleZone, deleteBlueprintSelection, deletePolygonVertex, deleteSelectedEntity, duplicateBlueprintSelection,
  moveBlueprintSelection, moveObject, normalizeGrid, objectPosition, paintCollisionRectangle, paintRectangle,
  pasteBlueprintSelection, placeGenericObject, polygonSelfIntersects, resizeGrid, resizeRectangleZone,
  selectBlueprintRectangle, selectEntityAt, translateZone,
} from '../src/map-state.js';
import { projectToState, stateToDocument, stateToProject } from '../src/project-adapter.js';
import { validatePixelMap, validatePixelMapProject } from '../src/pixel-map-format.js';
import { migrateLegacyAssetSources } from '../src/portable-assets.js';
import { importProjectFile } from '../src/export.js';

test('l’état actuel produit un document Pixel Map v1 valide', () => {
  const document = stateToDocument(createMapState());
  const validation = validatePixelMap(document);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues));
  assert.equal(document.format, 'pixel-map');
  assert.equal(document.version, '1.0');
  assert.equal(document.map.width, document.grid.columns * document.grid.cellWidth);
  assert.equal(document.collision.defaultBlocked, true);
  assert.ok(document.resources.every((resource) => resource.source.startsWith('data:image/svg+xml')));
  assert.ok(document.resources.every((resource) => !resource.source.startsWith('asset://')));
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

test('une URI asset inconnue est refusée car elle dépendrait d’un catalogue implicite', () => {
  const document = stateToDocument(createMapState());
  document.resources[0].source = 'asset://custom/secret';
  const validation = validatePixelMap(document);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((item) => item.code === 'non-portable-resource'));
});

test('les anciennes URI internes sont migrées vers des images embarquées', () => {
  const document = stateToDocument(createMapState());
  document.resources[0].source = 'asset://floors/blue';
  document.resources.push({ id: 'asset.desk', type: 'image', source: 'asset://objects/desk', width: 32, height: 32, properties: {} });
  assert.equal(migrateLegacyAssetSources(document), 2);
  assert.ok(document.resources.every((resource) => resource.source.startsWith('data:image/svg+xml')));
  assert.equal(validatePixelMap(document).valid, true);
});

test('l’import de projet migre les anciennes URI avant validation', async () => {
  const project = stateToProject(createMapState());
  project.document.resources[0].source = 'asset://floors/blue';
  const state = createMapState();
  const result = await importProjectFile({ text: async () => JSON.stringify(project) }, state);
  assert.equal(result.imported, true);
  assert.ok(state.sourceDocument.resources[0].source.startsWith('data:image/svg+xml'));
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

test('un import puis export conserve les données que l’éditeur ne sait pas modifier', () => {
  const source = stateToProject(createMapState(), 0.75);
  source.document.resources.push({
    id: 'external.sign', type: 'image', source: 'https://example.test/sign.png',
    width: 48, height: 72, properties: { licence: 'custom' },
  });
  source.document.layers.push({
    id: 'external-overlay', name: 'Overlay externe', type: 'sprite', visible: false,
    opacity: 0.4, offset: { x: 7, y: 9 }, sprites: [{
      id: 'external-sprite', resource: 'external.sign', position: { x: 64, y: 96 },
      rotation: 15, scale: { x: 2, y: 3 }, properties: { imported: true },
    }], properties: { lockedByAdapter: true },
  });
  source.document.objects.push({
    id: 'external-object', type: 'npc.vendor', name: 'Marchand', resource: 'external.sign',
    position: { x: 80, y: 112 }, size: { width: 48, height: 72 }, rotation: 0,
    layer: 'external-overlay', properties: { dialogue: 'welcome', stock: [1, 2] },
  });
  source.document.properties.adapter = { namespace: 'demo', enabled: true };
  source.document.layers.find((item) => item.id === 'floor').tiles[0].properties = { biome: 'office' };
  source.document.layers.find((item) => item.id === 'floor').tiles[0].rotation = 90;
  source.document.collision.properties = { algorithm: 'nav-grid' };
  source.document.collision.cells[0].properties = { movementCost: 3 };
  source.editor.properties.adapterPanel = { tab: 'advanced' };

  const state = createMapState();
  projectToState(source, state);
  state.projectName = 'Projet réenregistré';
  const exported = stateToProject(state, 1.25);

  assert.deepEqual(exported.document.resources.find((item) => item.id === 'external.sign'), source.document.resources.at(-1));
  assert.deepEqual(exported.document.layers.find((item) => item.id === 'external-overlay'), source.document.layers.at(-1));
  const object = exported.document.objects.find((item) => item.id === 'external-object');
  assert.deepEqual(object.size, { width: 48, height: 72 });
  assert.equal(object.layer, 'external-overlay');
  assert.equal(object.resource, 'external.sign');
  assert.deepEqual(object.properties, { dialogue: 'welcome', stock: [1, 2] });
  assert.deepEqual(exported.document.properties.adapter, { namespace: 'demo', enabled: true });
  assert.deepEqual(exported.document.layers.find((item) => item.id === 'floor').tiles[0].properties, { biome: 'office' });
  assert.equal(exported.document.layers.find((item) => item.id === 'floor').tiles[0].rotation, 90);
  assert.deepEqual(exported.document.collision.properties, { algorithm: 'nav-grid' });
  assert.deepEqual(exported.document.collision.cells[0].properties, { movementCost: 3 });
  assert.deepEqual(exported.editor.properties.adapterPanel, { tab: 'advanced' });
  assert.equal(exported.document.name, 'Projet réenregistré');
  assert.equal(exported.editor.zoom, 1.25);
  assert.equal(validatePixelMapProject(exported).valid, true);
});

test('une collision defaultBlocked false conserve sa sémantique après aller-retour', () => {
  const source = stateToProject(createMapState({ columns: 4, rows: 3, cellWidth: 16, cellHeight: 16 }));
  source.document.collision.defaultBlocked = false;
  source.document.collision.cells = [{ x: 1, y: 1, blocked: true, type: 'wall', properties: { material: 'stone' } }];
  const state = createMapState();
  projectToState(source, state);
  assert.equal(state.collisionCells.size, 11);
  assert.equal(state.collisionCells.has('1,1'), false);

  const exported = stateToProject(state);
  assert.equal(exported.document.collision.defaultBlocked, true);
  assert.equal(exported.document.collision.cells.find((cell) => cell.x === 1 && cell.y === 1).blocked, true);
  assert.deepEqual(exported.document.collision.cells.find((cell) => cell.x === 1 && cell.y === 1).properties, { material: 'stone' });
  assert.equal(exported.document.collision.cells.filter((cell) => !cell.blocked).length, 11);
  assert.equal(validatePixelMapProject(exported).valid, true);
});

test('un objet se déplace librement ou avec alignement sur la grille', () => {
  const state = createMapState({ columns: 10, rows: 8, cellWidth: 32, cellHeight: 24 });
  const object = placeGenericObject(state, { x: 2, y: 3 });
  moveObject(state, object, { x: 77.5, y: 51.25 }, false);
  assert.deepEqual(objectPosition(state, object), { x: 77.5, y: 51.25 });
  moveObject(state, object, { x: 77.5, y: 51.25 }, true);
  assert.deepEqual(objectPosition(state, object), { x: 80, y: 60 });
});

test('la position libre précise fait un aller-retour Pixel Map', () => {
  const source = createMapState();
  const object = placeGenericObject(source, { x: 2, y: 3 });
  moveObject(source, object, { x: 91.25, y: 117.75 }, false);
  const project = stateToProject(source);
  assert.deepEqual(project.document.objects.find((item) => item.id === object.id).position, { x: 91.25, y: 117.75 });
  const destination = createMapState();
  projectToState(project, destination);
  assert.deepEqual(objectPosition(destination, destination.objects.find((item) => item.id === object.id)), { x: 91.25, y: 117.75 });
});

test('les objets superposés sont parcourus et leur ordre peut changer', () => {
  const state = createMapState();
  const back = placeGenericObject(state, { x: 4, y: 4 });
  const front = placeGenericObject(state, { x: 4, y: 4 });
  state.selectedEntity = null;
  assert.equal(selectEntityAt(state, { x: 4, y: 4 }).id, front.id);
  assert.equal(selectEntityAt(state, { x: 4, y: 4 }).id, back.id);
  assert.equal(changeObjectOrder(state, back, 'front'), true);
  state.selectedEntity = null;
  assert.equal(selectEntityAt(state, { x: 4, y: 4 }).id, back.id);
});

test('une zone entière peut être déplacée sans sortir de la carte', () => {
  const state = createMapState({ columns: 10, rows: 10, cellWidth: 20, cellHeight: 20 });
  const rectangle = createRectangleZone(state, { x: 1, y: 1 }, { x: 2, y: 2 });
  translateZone(state, rectangle, { x: 30, y: 40 });
  assert.deepEqual(rectangle.shape, { type: 'rectangle', x: 50, y: 60, width: 40, height: 40 });
  translateZone(state, rectangle, { x: 999, y: 999 });
  assert.equal(rectangle.shape.x + rectangle.shape.width, 200);
  assert.equal(rectangle.shape.y + rectangle.shape.height, 200);
});

test('un rectangle se redimensionne depuis ses quatre coins', () => {
  const state = createMapState({ columns: 10, rows: 10, cellWidth: 20, cellHeight: 20 });
  const zone = createRectangleZone(state, { x: 2, y: 2 }, { x: 4, y: 4 });
  resizeRectangleZone(state, zone, 'nw', { x: 20, y: 30 });
  assert.deepEqual(zone.shape, { type: 'rectangle', x: 20, y: 30, width: 80, height: 70 });
  resizeRectangleZone(state, zone, 'se', { x: 150, y: 160 });
  assert.deepEqual(zone.shape, { type: 'rectangle', x: 20, y: 30, width: 130, height: 130 });
});

test('un sommet polygonal peut être ajouté puis supprimé sans passer sous trois sommets', () => {
  const state = createMapState();
  const zone = createPolygonZone(state, [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 3, y: 5 }]);
  const index = addPolygonVertex(zone, 0);
  assert.equal(zone.shape.points.length, 4);
  assert.deepEqual(zone.shape.points[index], { x: 112, y: 48 });
  assert.equal(deletePolygonVertex(zone, index), true);
  assert.equal(zone.shape.points.length, 3);
  assert.equal(deletePolygonVertex(zone, 0), false);
});

test('les polygones auto-intersectés sont détectés à la création et à la validation', () => {
  const crossing = [{ x: 10, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }, { x: 90, y: 10 }];
  assert.equal(polygonSelfIntersects(crossing), true);
  const state = createMapState({ columns: 10, rows: 10, cellWidth: 20, cellHeight: 20 });
  assert.throws(() => createPolygonZone(state, [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 }]), /auto-intersecter/);
  const document = stateToDocument(state);
  document.zones.push({ id: 'crossing', type: 'zone.test', shape: { type: 'polygon', points: crossing }, properties: {} });
  const validation = validatePixelMap(document);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((item) => item.code === 'self-intersecting-polygon'));
});

test('la sélection Blueprint ne retient que les cellules graphiques du rectangle', () => {
  const state = createMapState({ columns: 8, rows: 8, cellWidth: 16, cellHeight: 16 });
  state.cells = new Set(['1,1', '2,1', '5,5']);
  assert.equal(selectBlueprintRectangle(state, { x: 0, y: 0 }, { x: 3, y: 3 }), 2);
  assert.deepEqual([...state.blueprintSelection].sort(), ['1,1', '2,1']);
});

test('déplacer une sélection déplace ses portes mais pas ses collisions', () => {
  const state = createMapState({ columns: 8, rows: 8, cellWidth: 16, cellHeight: 16 });
  state.cells = new Set(['1,1', '2,1']);
  state.collisionCells = new Set(['1,1', '2,1']);
  state.doors = [{ id: 'door-a', x: 1, y: 1, side: 'top' }];
  selectBlueprintRectangle(state, { x: 1, y: 1 }, { x: 2, y: 1 });
  assert.equal(moveBlueprintSelection(state, { x: 2, y: 3 }), true);
  assert.deepEqual([...state.cells].sort(), ['3,4', '4,4']);
  assert.deepEqual([...state.collisionCells].sort(), ['1,1', '2,1']);
  assert.deepEqual({ x: state.doors[0].x, y: state.doors[0].y }, { x: 3, y: 4 });
});

test('une sélection Blueprint peut être dupliquée, copiée, collée et supprimée', () => {
  const state = createMapState({ columns: 8, rows: 8, cellWidth: 16, cellHeight: 16 });
  state.cells = new Set(['1,1', '2,1']);
  selectBlueprintRectangle(state, { x: 1, y: 1 }, { x: 2, y: 1 });
  assert.equal(duplicateBlueprintSelection(state), true);
  assert.ok(state.cells.has('2,2'));
  assert.ok(state.cells.has('3,2'));
  assert.equal(copyBlueprintSelection(state), true);
  assert.equal(pasteBlueprintSelection(state, { x: 5, y: 5 }), true);
  assert.ok(state.cells.has('5,5'));
  assert.ok(state.cells.has('6,5'));
  assert.equal(deleteBlueprintSelection(state), true);
  assert.equal(state.cells.has('5,5'), false);
  assert.equal(state.cells.has('1,1'), true);
});

test('un nouveau projet vide respecte son nom et ses dimensions', () => {
  const state = createMapState({ columns: 12, rows: 9, cellWidth: 20, cellHeight: 24 }, { template: 'empty', projectName: 'Carte test' });
  assert.equal(state.projectName, 'Carte test');
  assert.deepEqual(state.grid, { columns: 12, rows: 9, cellWidth: 20, cellHeight: 24 });
  assert.equal(state.cells.size, 0);
  assert.equal(state.collisionCells.size, 0);
  assert.equal(state.doors.length, 0);
});

test('le modèle de démonstration reste disponible explicitement', () => {
  const state = createMapState(undefined, { template: 'demo', projectName: 'Démo' });
  assert.equal(state.projectName, 'Démo');
  assert.ok(state.cells.size > 0);
  assert.ok(state.doors.length > 0);
});

test('réinitialiser un projet permet de vider son historique', () => {
  const state = createMapState();
  const history = createHistory(state);
  history.checkpoint();
  applySerializable(state, { ...state, projectName: 'Vide', cells: [], collisionCells: [], doors: [], objects: [], zones: [] });
  history.clear();
  assert.equal(history.undo(), false);
  assert.equal(state.projectName, 'Vide');
});

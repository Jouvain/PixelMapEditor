import { isPortableImageSource } from './portable-assets.js';

export const PIXEL_MAP_FORMAT = 'pixel-map';
export const PIXEL_MAP_PROJECT_FORMAT = 'pixel-map-project';
export const PIXEL_MAP_VERSION = '1.0';

const issue = (severity, path, code, message) => ({ severity, path, code, message });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const inBounds = (value, maximum) => Number.isFinite(value) && value >= 0 && value <= maximum;

function isJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function validateProperties(value, path, issues) {
  if (!isObject(value)) issues.push(issue('error', path, 'invalid-properties', 'Les propriétés doivent être un objet JSON.'));
  else if (!isJsonValue(value)) issues.push(issue('error', path, 'non-json-properties', 'Les propriétés contiennent une valeur non JSON.'));
}

function validateIdentifiers(items, path, issues) {
  const identifiers = new Set();
  items.forEach((item, index) => {
    if (!item?.id || typeof item.id !== 'string') issues.push(issue('error', `${path}[${index}].id`, 'missing-id', 'Un identifiant est obligatoire.'));
    else if (identifiers.has(item.id)) issues.push(issue('error', `${path}[${index}].id`, 'duplicate-id', `Identifiant dupliqué : ${item.id}.`));
    else identifiers.add(item.id);
  });
  return identifiers;
}

export function createPixelMapDocument({ id, name, width, height, columns, rows, cellWidth, cellHeight }) {
  return {
    format: PIXEL_MAP_FORMAT,
    version: PIXEL_MAP_VERSION,
    id,
    name,
    map: { width, height, background: '#f8f7f2' },
    grid: { columns, rows, cellWidth, cellHeight },
    resources: [],
    layers: [],
    collision: { encoding: 'sparse', defaultBlocked: true, cells: [], properties: {} },
    objects: [],
    zones: [],
    properties: {},
  };
}

export function createPixelMapProject(document, editor = {}) {
  return {
    format: PIXEL_MAP_PROJECT_FORMAT,
    version: PIXEL_MAP_VERSION,
    document,
    editor: {
      activeStep: editor.activeStep || 'blueprint',
      activeTool: editor.activeTool || 'room',
      selectedLayer: editor.selectedLayer || 'floor',
      selectedAsset: editor.selectedAsset || null,
      zoom: editor.zoom ?? 1,
      showGrid: editor.showGrid ?? true,
      properties: editor.properties || {},
    },
  };
}

export function validatePixelMap(document) {
  const issues = [];
  if (!isObject(document)) return { valid: false, issues: [issue('error', '$', 'invalid-document', 'Le document doit être un objet JSON.')] };
  if (document.format !== PIXEL_MAP_FORMAT) issues.push(issue('error', 'format', 'unknown-format', `Format attendu : ${PIXEL_MAP_FORMAT}.`));
  if (document.version !== PIXEL_MAP_VERSION) issues.push(issue('error', 'version', 'unsupported-version', `Version attendue : ${PIXEL_MAP_VERSION}.`));
  if (!document.id || typeof document.id !== 'string') issues.push(issue('error', 'id', 'missing-id', 'La carte doit posséder un identifiant.'));

  const map = document.map || {};
  const grid = document.grid || {};
  for (const [path, value] of [['map.width', map.width], ['map.height', map.height], ['grid.columns', grid.columns], ['grid.rows', grid.rows], ['grid.cellWidth', grid.cellWidth], ['grid.cellHeight', grid.cellHeight]]) {
    if (!isPositiveInteger(value)) issues.push(issue('error', path, 'invalid-dimension', 'La valeur doit être un entier strictement positif.'));
  }
  if (isPositiveInteger(map.width) && isPositiveInteger(grid.columns) && isPositiveInteger(grid.cellWidth) && map.width !== grid.columns * grid.cellWidth)
    issues.push(issue('error', 'map.width', 'grid-width-mismatch', 'La largeur doit être égale à columns × cellWidth.'));
  if (isPositiveInteger(map.height) && isPositiveInteger(grid.rows) && isPositiveInteger(grid.cellHeight) && map.height !== grid.rows * grid.cellHeight)
    issues.push(issue('error', 'map.height', 'grid-height-mismatch', 'La hauteur doit être égale à rows × cellHeight.'));

  const resources = Array.isArray(document.resources) ? document.resources : [];
  const layers = Array.isArray(document.layers) ? document.layers : [];
  const objects = Array.isArray(document.objects) ? document.objects : [];
  const zones = Array.isArray(document.zones) ? document.zones : [];
  if (!Array.isArray(document.resources)) issues.push(issue('error', 'resources', 'invalid-list', 'resources doit être un tableau.'));
  if (!Array.isArray(document.layers)) issues.push(issue('error', 'layers', 'invalid-list', 'layers doit être un tableau.'));
  if (!Array.isArray(document.objects)) issues.push(issue('error', 'objects', 'invalid-list', 'objects doit être un tableau.'));
  if (!Array.isArray(document.zones)) issues.push(issue('error', 'zones', 'invalid-list', 'zones doit être un tableau.'));
  const resourceIds = validateIdentifiers(resources, 'resources', issues);
  const layerIds = validateIdentifiers(layers, 'layers', issues);
  validateIdentifiers(objects, 'objects', issues);
  validateIdentifiers(zones, 'zones', issues);

  resources.forEach((resource, index) => {
    if (!['image', 'atlas'].includes(resource.type)) issues.push(issue('error', `resources[${index}].type`, 'invalid-resource-type', 'Type de ressource inconnu.'));
    if (!resource.source || typeof resource.source !== 'string') issues.push(issue('error', `resources[${index}].source`, 'missing-source', 'Une source est obligatoire.'));
    else if (!isPortableImageSource(resource.source)) issues.push(issue('error', `resources[${index}].source`, 'non-portable-resource', 'La source doit être une image embarquée, une URL HTTPS ou un chemin relatif.'));
    validateProperties(resource.properties ?? {}, `resources[${index}].properties`, issues);
  });

  layers.forEach((layer, index) => {
    const base = `layers[${index}]`;
    if (!['tile', 'sprite', 'image'].includes(layer.type)) issues.push(issue('error', `${base}.type`, 'invalid-layer-type', 'Type de couche inconnu.'));
    if (layer.opacity != null && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) issues.push(issue('error', `${base}.opacity`, 'invalid-opacity', 'L’opacité doit être comprise entre 0 et 1.'));
    if (layer.type === 'tile') (layer.tiles || []).forEach((tile, tileIndex) => {
      const tilePath = `${base}.tiles[${tileIndex}]`;
      if (!Number.isInteger(tile.x) || tile.x < 0 || tile.x >= grid.columns || !Number.isInteger(tile.y) || tile.y < 0 || tile.y >= grid.rows) issues.push(issue('error', tilePath, 'tile-out-of-bounds', 'La tuile est hors de la grille.'));
      if (!resourceIds.has(tile.resource)) issues.push(issue('error', `${tilePath}.resource`, 'unknown-resource', 'La ressource référencée n’existe pas.'));
      if (![0, 90, 180, 270].includes(tile.rotation ?? 0)) issues.push(issue('error', `${tilePath}.rotation`, 'invalid-tile-rotation', 'Rotation autorisée : 0, 90, 180 ou 270.'));
    });
    if (layer.type === 'sprite') (layer.sprites || []).forEach((sprite, spriteIndex) => {
      if (!resourceIds.has(sprite.resource)) issues.push(issue('error', `${base}.sprites[${spriteIndex}].resource`, 'unknown-resource', 'La ressource référencée n’existe pas.'));
    });
    if (layer.type === 'image' && !resourceIds.has(layer.resource)) issues.push(issue('error', `${base}.resource`, 'unknown-resource', 'La ressource référencée n’existe pas.'));
    validateProperties(layer.properties ?? {}, `${base}.properties`, issues);
  });

  const collision = document.collision;
  if (!isObject(collision) || collision.encoding !== 'sparse' || !Array.isArray(collision.cells)) issues.push(issue('error', 'collision', 'invalid-collision', 'Une collision sparse contenant cells est obligatoire.'));
  else collision.cells.forEach((cell, index) => {
    if (!Number.isInteger(cell.x) || cell.x < 0 || cell.x >= grid.columns || !Number.isInteger(cell.y) || cell.y < 0 || cell.y >= grid.rows) issues.push(issue('error', `collision.cells[${index}]`, 'collision-out-of-bounds', 'La case de collision est hors de la grille.'));
    if (typeof cell.blocked !== 'boolean') issues.push(issue('error', `collision.cells[${index}].blocked`, 'invalid-blocked', 'blocked doit être un booléen.'));
  });

  objects.forEach((object, index) => {
    const base = `objects[${index}]`;
    if (!object.type || typeof object.type !== 'string') issues.push(issue('error', `${base}.type`, 'missing-type', 'Un type d’objet est obligatoire.'));
    if (!isObject(object.position) || !inBounds(object.position.x, map.width) || !inBounds(object.position.y, map.height)) issues.push(issue('warning', `${base}.position`, 'object-out-of-bounds', 'L’objet est hors de la carte.'));
    if (object.resource && !resourceIds.has(object.resource)) issues.push(issue('error', `${base}.resource`, 'unknown-resource', 'La ressource référencée n’existe pas.'));
    if (object.layer && !layerIds.has(object.layer)) issues.push(issue('error', `${base}.layer`, 'unknown-layer', 'La couche référencée n’existe pas.'));
    validateProperties(object.properties ?? {}, `${base}.properties`, issues);
  });

  zones.forEach((zone, index) => {
    const base = `zones[${index}]`;
    if (!zone.type || typeof zone.type !== 'string') issues.push(issue('error', `${base}.type`, 'missing-type', 'Un type de zone est obligatoire.'));
    if (!isObject(zone.shape) || !['rectangle', 'polygon'].includes(zone.shape.type)) issues.push(issue('error', `${base}.shape`, 'invalid-shape', 'Forme de zone inconnue.'));
    else if (zone.shape.type === 'polygon' && (!Array.isArray(zone.shape.points) || zone.shape.points.length < 3)) issues.push(issue('error', `${base}.shape.points`, 'invalid-polygon', 'Un polygone doit posséder au moins trois points.'));
    else if (zone.shape.type === 'rectangle' && (!inBounds(zone.shape.x, map.width) || !inBounds(zone.shape.y, map.height) || zone.shape.width <= 0 || zone.shape.height <= 0 || zone.shape.x + zone.shape.width > map.width || zone.shape.y + zone.shape.height > map.height)) issues.push(issue('warning', `${base}.shape`, 'zone-out-of-bounds', 'La zone dépasse les limites de la carte.'));
    else if (zone.shape.type === 'polygon' && zone.shape.points.some((point) => !inBounds(point.x, map.width) || !inBounds(point.y, map.height))) issues.push(issue('warning', `${base}.shape.points`, 'zone-out-of-bounds', 'La zone dépasse les limites de la carte.'));
    validateProperties(zone.properties ?? {}, `${base}.properties`, issues);
  });
  validateProperties(document.properties ?? {}, 'properties', issues);
  return { valid: !issues.some((item) => item.severity === 'error'), issues };
}

export function validatePixelMapProject(project) {
  const issues = [];
  if (!isObject(project) || project.format !== PIXEL_MAP_PROJECT_FORMAT) issues.push(issue('error', 'format', 'unknown-project-format', `Format attendu : ${PIXEL_MAP_PROJECT_FORMAT}.`));
  if (project?.version !== PIXEL_MAP_VERSION) issues.push(issue('error', 'version', 'unsupported-version', `Version attendue : ${PIXEL_MAP_VERSION}.`));
  if (!isObject(project?.editor)) issues.push(issue('error', 'editor', 'invalid-editor-state', 'L’état de l’éditeur est obligatoire.'));
  const documentResult = validatePixelMap(project?.document);
  issues.push(...documentResult.issues.map((item) => ({ ...item, path: `document.${item.path}` })));
  return { valid: !issues.some((item) => item.severity === 'error'), issues };
}

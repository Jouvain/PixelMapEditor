import { isLibraryId, isResourceId, qualifyAssetReference } from './asset-reference.js';
import { isPortableImageSource } from './portable-assets.js';

export const PIXEL_MAP_ASSETS_FORMAT = 'pixel-map-assets';
export const PIXEL_MAP_ASSETS_VERSION = '1.0';

const issue = (severity, path, code, message) => ({ severity, path, code, message });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isNormalizedNumber = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const isCatalogImageSource = (value) => isPortableImageSource(value) && (
  value.startsWith('data:image/')
  || /^https:\/\//i.test(value)
  || /^(?![/\\])(?!.+:)[^\\]+\.(png|jpe?g|gif|webp|svg)([?#].*)?$/i.test(value)
);

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

export function createPixelMapAssets({ id, name, resources = [], properties = {} }) {
  return {
    format: PIXEL_MAP_ASSETS_FORMAT,
    version: PIXEL_MAP_ASSETS_VERSION,
    id,
    name,
    resources: structuredClone(resources),
    properties: structuredClone(properties),
  };
}

export function validatePixelMapAssets(catalog) {
  const issues = [];
  if (!isObject(catalog)) return { valid: false, issues: [issue('error', '$', 'invalid-document', 'Le catalogue doit être un objet JSON.')] };

  if (catalog.format !== PIXEL_MAP_ASSETS_FORMAT) issues.push(issue('error', 'format', 'unknown-format', `Format attendu : ${PIXEL_MAP_ASSETS_FORMAT}.`));
  if (catalog.version !== PIXEL_MAP_ASSETS_VERSION) issues.push(issue('error', 'version', 'unsupported-version', `Version attendue : ${PIXEL_MAP_ASSETS_VERSION}.`));
  if (!isLibraryId(catalog.id)) issues.push(issue('error', 'id', 'invalid-library-id', 'L’identifiant du catalogue doit respecter le contrat libraryId.'));
  if (typeof catalog.name !== 'string' || catalog.name.length === 0) issues.push(issue('error', 'name', 'missing-name', 'Le catalogue doit posséder un nom.'));

  const resources = Array.isArray(catalog.resources) ? catalog.resources : [];
  if (!Array.isArray(catalog.resources)) issues.push(issue('error', 'resources', 'invalid-list', 'resources doit être un tableau.'));

  const identifiers = new Set();
  resources.forEach((resource, index) => {
    const base = `resources[${index}]`;
    if (!isObject(resource)) {
      issues.push(issue('error', base, 'invalid-resource', 'La ressource doit être un objet JSON.'));
      return;
    }

    if (typeof resource.id === 'string' && resource.id.includes(':'))
      issues.push(issue('error', `${base}.id`, 'ambiguous-resource-id', 'resource.id doit être local au catalogue et ne doit pas contenir de référence qualifiée.'));
    else if (!isResourceId(resource.id))
      issues.push(issue('error', `${base}.id`, 'invalid-resource-id', 'L’identifiant doit respecter le contrat resourceId.'));
    else if (identifiers.has(resource.id))
      issues.push(issue('error', `${base}.id`, 'duplicate-id', `Identifiant dupliqué : ${resource.id}.`));
    else identifiers.add(resource.id);

    if (typeof resource.name !== 'string' || resource.name.length === 0) issues.push(issue('error', `${base}.name`, 'missing-name', 'La ressource doit posséder un nom.'));
    if (resource.type !== 'image') issues.push(issue('error', `${base}.type`, 'invalid-resource-type', 'Pixel Map Assets v1 accepte uniquement le type image.'));
    if (typeof resource.source !== 'string' || resource.source.length === 0) issues.push(issue('error', `${base}.source`, 'missing-source', 'Une source est obligatoire.'));
    else if (!isCatalogImageSource(resource.source)) issues.push(issue('error', `${base}.source`, 'invalid-source', 'La source doit être une image embarquée, une URL HTTPS ou un chemin d’image relatif au catalogue.'));

    if (!isObject(resource.size)) issues.push(issue('error', `${base}.size`, 'invalid-size', 'Les dimensions width et height sont obligatoires.'));
    else {
      if (!isPositiveInteger(resource.size.width)) issues.push(issue('error', `${base}.size.width`, 'invalid-dimension', 'La largeur doit être un entier strictement positif.'));
      if (!isPositiveInteger(resource.size.height)) issues.push(issue('error', `${base}.size.height`, 'invalid-dimension', 'La hauteur doit être un entier strictement positif.'));
    }

    if (!isObject(resource.anchor)) issues.push(issue('error', `${base}.anchor`, 'invalid-anchor', 'L’ancre normalisée x et y est obligatoire.'));
    else {
      if (!isNormalizedNumber(resource.anchor.x)) issues.push(issue('error', `${base}.anchor.x`, 'invalid-anchor', 'anchor.x doit être compris entre 0 et 1.'));
      if (!isNormalizedNumber(resource.anchor.y)) issues.push(issue('error', `${base}.anchor.y`, 'invalid-anchor', 'anchor.y doit être compris entre 0 et 1.'));
    }

    if (typeof resource.category !== 'string' || resource.category.length === 0) issues.push(issue('error', `${base}.category`, 'invalid-category', 'La catégorie doit être une chaîne non vide.'));
    if (!Array.isArray(resource.tags) || resource.tags.some((tag) => typeof tag !== 'string' || tag.length === 0)) issues.push(issue('error', `${base}.tags`, 'invalid-tags', 'Les tags doivent être des chaînes non vides.'));
    else if (new Set(resource.tags).size !== resource.tags.length) issues.push(issue('error', `${base}.tags`, 'duplicate-tag', 'Les tags doivent être uniques dans une ressource.'));
    validateProperties(resource.properties, `${base}.properties`, issues);
  });

  validateProperties(catalog.properties, 'properties', issues);
  return {
    valid: !issues.some((item) => item.severity === 'error'),
    issues,
    references: isLibraryId(catalog.id)
      ? resources.filter((resource) => isResourceId(resource?.id)).map((resource) => qualifyAssetReference(catalog.id, resource.id))
      : [],
  };
}

const IDENTIFIER_SEGMENT = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';

export const LIBRARY_ID_PATTERN = new RegExp(`^${IDENTIFIER_SEGMENT}$`);
export const RESOURCE_ID_PATTERN = new RegExp(`^${IDENTIFIER_SEGMENT}(?:\\.${IDENTIFIER_SEGMENT})*$`);

export function isLibraryId(value) {
  return typeof value === 'string' && LIBRARY_ID_PATTERN.test(value);
}

export function isResourceId(value) {
  return typeof value === 'string' && RESOURCE_ID_PATTERN.test(value);
}

export function qualifyAssetReference(libraryId, resourceId) {
  if (!isLibraryId(libraryId)) throw new TypeError(`Identifiant de bibliothèque invalide : ${String(libraryId)}`);
  if (!isResourceId(resourceId)) throw new TypeError(`Identifiant de ressource invalide : ${String(resourceId)}`);
  return `${libraryId}:${resourceId}`;
}

export function parseAssetReference(reference) {
  if (typeof reference !== 'string') return null;
  const separator = reference.indexOf(':');
  if (separator <= 0 || separator !== reference.lastIndexOf(':')) return null;

  const libraryId = reference.slice(0, separator);
  const resourceId = reference.slice(separator + 1);
  if (!isLibraryId(libraryId) || !isResourceId(resourceId)) return null;

  return { libraryId, resourceId, reference };
}

export function isAssetReference(value) {
  return parseAssetReference(value) !== null;
}

export function duplicateLibraryIds(libraries) {
  const seen = new Set();
  const duplicates = new Set();
  for (const library of libraries ?? []) {
    const id = typeof library === 'string' ? library : library?.id;
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
  }
  return [...duplicates];
}

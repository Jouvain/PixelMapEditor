import test from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicateLibraryIds, isAssetReference, isLibraryId, isResourceId,
  parseAssetReference, qualifyAssetReference,
} from '../src/asset-reference.js';

test('construit et décompose une référence qualifiée', () => {
  const reference = qualifyAssetReference('office', 'desk.standard');
  assert.equal(reference, 'office:desk.standard');
  assert.deepEqual(parseAssetReference(reference), {
    libraryId: 'office', resourceId: 'desk.standard', reference,
  });
});

test('autorise des identifiants lisibles mais indépendants des chemins', () => {
  assert.equal(isLibraryId('office-furniture'), true);
  assert.equal(isResourceId('furniture.desk-standard'), true);
  assert.equal(isAssetReference('office-furniture:furniture.desk-standard'), true);
});

test('refuse les chemins, espaces, majuscules et références ambiguës', () => {
  for (const value of ['Office', 'office furniture', './office', 'office/library', 'office:extra']) {
    assert.equal(isLibraryId(value), false, value);
  }
  for (const value of ['Desk', 'desk standard', './desk', 'desk/standard', 'desk..standard']) {
    assert.equal(isResourceId(value), false, value);
  }
  for (const value of ['desk.standard', 'office:', ':desk.standard', 'office:desk:standard']) {
    assert.equal(isAssetReference(value), false, value);
    assert.equal(parseAssetReference(value), null, value);
  }
});

test('signale les identifiants de bibliothèques dupliqués', () => {
  assert.deepEqual(duplicateLibraryIds([
    { id: 'office' }, { id: 'outdoor' }, { id: 'office' }, { id: 'office' },
  ]), ['office']);
});

test('la qualification échoue explicitement sur un identifiant invalide', () => {
  assert.throws(() => qualifyAssetReference('Office', 'desk.standard'), TypeError);
  assert.throws(() => qualifyAssetReference('office', 'desk/standard'), TypeError);
});

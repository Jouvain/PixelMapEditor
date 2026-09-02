import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeValidation, validationIssueTarget } from '../src/validation-report.js';

const document = {
  objects: [{ id: 'object-1', type: 'spawn.player' }, { id: 'door-1', type: 'architecture.door' }],
  zones: [{ id: 'zone-1', type: 'trigger.area' }],
  collision: { cells: [{ x: 3, y: 4 }] },
  layers: [{ tiles: [{ x: 7, y: 8 }] }],
};

test('le rapport compte tous les niveaux de validation', () => {
  const summary = summarizeValidation({ issues: [
    { severity: 'error' }, { severity: 'error' },
    { severity: 'warning' }, { severity: 'information' }, { severity: 'info' },
  ] });
  assert.deepEqual(summary, { error: 2, warning: 1, info: 2 });
});

test('un chemin de validation retrouve un objet ou une zone', () => {
  assert.deepEqual(validationIssueTarget({ path: 'document.objects[0].position' }, document), { kind: 'object', id: 'object-1' });
  assert.deepEqual(validationIssueTarget({ path: 'zones[0].shape' }, document), { kind: 'zone', id: 'zone-1' });
  assert.deepEqual(validationIssueTarget({ path: 'objects[1].position' }, document), { kind: 'door', id: 'door-1' });
});

test('un chemin de validation retrouve une case de collision ou du Blueprint', () => {
  assert.deepEqual(validationIssueTarget({ path: 'collision.cells[0].blocked' }, document), { kind: 'collision', x: 3, y: 4 });
  assert.deepEqual(validationIssueTarget({ path: 'layers[0].tiles[0].resource' }, document), { kind: 'blueprint', x: 7, y: 8 });
  assert.equal(validationIssueTarget({ path: 'resources[0].source' }, document), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnsavedChangesTracker, DISCARD_CHANGES_MESSAGE } from '../src/unsaved-changes.js';

test('un état propre ne demande aucune confirmation', () => {
  const tracker = createUnsavedChangesTracker();
  let confirmations = 0;
  assert.equal(tracker.confirmDiscard(() => { confirmations += 1; return false; }), true);
  assert.equal(confirmations, 0);
});

test('un état modifié protège son remplacement jusqu’à confirmation', () => {
  const statuses = [];
  const tracker = createUnsavedChangesTracker({ onStatus: (status) => statuses.push(status) });
  tracker.markModified();
  assert.equal(tracker.dirty, true);
  assert.equal(tracker.confirmDiscard((message) => message === DISCARD_CHANGES_MESSAGE && false), false);
  assert.equal(tracker.confirmDiscard(() => true), true);
  assert.deepEqual(statuses, ['Modifié']);
});

test('une sauvegarde désactive la protection beforeunload', () => {
  const tracker = createUnsavedChangesTracker();
  const event = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
  tracker.markModified();
  assert.equal(tracker.handleBeforeUnload(event), true);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, '');
  tracker.markClean();
  assert.equal(tracker.dirty, false);
  assert.equal(tracker.handleBeforeUnload({ preventDefault() { throw new Error('ne doit pas être appelé'); } }), false);
});

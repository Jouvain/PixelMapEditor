export const DISCARD_CHANGES_MESSAGE = 'Les modifications non sauvegardées seront abandonnées. Continuer ?';

export function createUnsavedChangesTracker({ onStatus = () => {} } = {}) {
  let dirty = false;
  return {
    get dirty() { return dirty; },
    markModified(status = 'Modifié') {
      dirty = true;
      onStatus(status);
    },
    markClean(status = 'Sauvegardé') {
      dirty = false;
      onStatus(status);
    },
    confirmDiscard(confirmFunction, message = DISCARD_CHANGES_MESSAGE) {
      return !dirty || confirmFunction(message);
    },
    handleBeforeUnload(event) {
      if (!dirty) return false;
      event.preventDefault();
      event.returnValue = '';
      return true;
    },
  };
}

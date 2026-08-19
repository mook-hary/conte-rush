const HISTORY_LIMIT = 50;

export function createHistory() {
  const undoStack = [];
  const redoStack = [];

  function push(action) {
    if (!action || typeof action.undo !== "function" || typeof action.redo !== "function") {
      return;
    }
    undoStack.push(action);
    if (undoStack.length > HISTORY_LIMIT) {
      undoStack.shift();
    }
    redoStack.length = 0;
  }

  function undo() {
    const action = undoStack.pop();
    if (!action) {
      return null;
    }
    action.undo();
    redoStack.push(action);
    return action;
  }

  function redo() {
    const action = redoStack.pop();
    if (!action) {
      return null;
    }
    action.redo();
    undoStack.push(action);
    return action;
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function peekUndo() {
    return undoStack.at(-1) ?? null;
  }

  function peekRedo() {
    return redoStack.at(-1) ?? null;
  }

  function clear() {
    undoStack.length = 0;
    redoStack.length = 0;
  }

  return {
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    peekUndo,
    peekRedo,
    clear,
  };
}

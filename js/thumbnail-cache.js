export function createThumbnailCache() {
  const items = new Map();

  function revoke(entry) {
    if (entry?.url) {
      URL.revokeObjectURL(entry.url);
    }
  }

  function get(panelId) {
    return items.get(panelId) ?? null;
  }

  function has(panelId) {
    return items.has(panelId);
  }

  function set(panelId, value) {
    const previous = items.get(panelId);
    if (previous && previous !== value) {
      revoke(previous);
    }
    items.set(panelId, value);
  }

  function remove(panelId) {
    const previous = items.get(panelId);
    revoke(previous);
    items.delete(panelId);
  }

  function clear() {
    for (const entry of items.values()) {
      revoke(entry);
    }
    items.clear();
  }

  return {
    get,
    has,
    set,
    delete: remove,
    clear,
  };
}

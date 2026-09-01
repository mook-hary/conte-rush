function cloneMedia(media) {
  if (!media?.blob) {
    return null;
  }
  return {
    kind: media.kind,
    blob: media.blob,
    mimeType: media.mimeType ?? media.blob.type ?? "",
    width: Number(media.width) || 0,
    height: Number(media.height) || 0,
  };
}

export function createPanelMediaStore() {
  const items = new Map();

  function get(panelId) {
    return cloneMedia(items.get(panelId));
  }

  function has(panelId) {
    return items.has(panelId);
  }

  function set(panelId, media) {
    const copy = cloneMedia(media);
    if (!panelId || !copy) {
      return null;
    }
    items.set(panelId, copy);
    return cloneMedia(copy);
  }

  function remove(panelId) {
    return items.delete(panelId);
  }

  function clear() {
    items.clear();
  }

  function listEntries() {
    return [...items.entries()].map(([panelId, media]) => ({
      panelId,
      media: cloneMedia(media),
    }));
  }

  return {
    get,
    set,
    has,
    delete: remove,
    clear,
    listEntries,
  };
}

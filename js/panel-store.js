export const PANEL_SOURCE_MANUAL = "manual";
export const PANEL_SOURCE_DRAWING = "drawing";
export const PANEL_SOURCE_UPLOAD = "upload";

export function isPdfPanel(panel) {
  return panel?.source === PANEL_SOURCE_MANUAL || panel?.source === "auto";
}

export function isMediaPanel(panel) {
  return panel?.source === PANEL_SOURCE_DRAWING || panel?.source === PANEL_SOURCE_UPLOAD;
}

export function clonePanel(panel) {
  if (!panel?.id) {
    return null;
  }
  const source = panel.source ?? PANEL_SOURCE_MANUAL;
  if (source === PANEL_SOURCE_DRAWING || source === PANEL_SOURCE_UPLOAD) {
    return {
      id: panel.id,
      source,
    };
  }
  return {
    id: panel.id,
    pageNumber: panel.pageNumber,
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
    source,
  };
}

export function panelSourceLabel(panel) {
  if (!panel) {
    return "";
  }
  if (panel.source === PANEL_SOURCE_DRAWING) {
    return "手描き";
  }
  if (panel.source === PANEL_SOURCE_UPLOAD) {
    return "画像";
  }
  if (Number.isFinite(panel.pageNumber)) {
    return `ページ ${panel.pageNumber}`;
  }
  return "Panel";
}

export function panelShortLabel(panel, fallbackId = "") {
  if (!panel) {
    return fallbackId;
  }
  if (panel.source === PANEL_SOURCE_DRAWING) {
    return "手描き";
  }
  if (panel.source === PANEL_SOURCE_UPLOAD) {
    return "画像";
  }
  if (Number.isFinite(panel.pageNumber)) {
    return `p.${panel.pageNumber}`;
  }
  return fallbackId || panel.id;
}

function pageSortKey(panel) {
  if (isPdfPanel(panel) && Number.isFinite(panel.pageNumber)) {
    return panel.pageNumber;
  }
  return Number.POSITIVE_INFINITY;
}

function createPanelId(serial) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `panel-${serial}`;
}

export function createPanelStore() {
  const panels = [];
  let nextSerial = 1;

  function add({ pageNumber, x, y, width, height }) {
    const panel = {
      id: createPanelId(nextSerial),
      pageNumber,
      x,
      y,
      width,
      height,
      source: PANEL_SOURCE_MANUAL,
    };
    nextSerial += 1;
    panels.push(panel);
    return clonePanel(panel);
  }

  function addMedia(source) {
    if (source !== PANEL_SOURCE_DRAWING && source !== PANEL_SOURCE_UPLOAD) {
      throw new Error(`未対応のPanel source: ${source}`);
    }
    const panel = {
      id: createPanelId(nextSerial),
      source,
    };
    nextSerial += 1;
    panels.push(panel);
    return clonePanel(panel);
  }

  function indexOf(id) {
    return panels.findIndex((panel) => panel.id === id);
  }

  function restore(panel, index) {
    if (!panel?.id) {
      return null;
    }
    const existing = getById(panel.id);
    if (existing) {
      return existing;
    }
    const copy = clonePanel(panel);
    if (!copy) {
      return null;
    }
    const at =
      Number.isInteger(index) && index >= 0 && index <= panels.length
        ? index
        : panels.length;
    panels.splice(at, 0, copy);
    return clonePanel(copy);
  }

  function remove(id) {
    const index = panels.findIndex((panel) => panel.id === id);
    if (index === -1) {
      return false;
    }
    panels.splice(index, 1);
    return true;
  }

  function clear() {
    panels.length = 0;
  }

  function listAll() {
    return panels
      .map((panel, index) => ({ panel, index }))
      .sort((a, b) => {
        const pageA = pageSortKey(a.panel);
        const pageB = pageSortKey(b.panel);
        if (pageA !== pageB) {
          return pageA - pageB;
        }
        return a.index - b.index;
      })
      .map(({ panel }) => clonePanel(panel));
  }

  function listInRegistrationOrder() {
    return panels.map(clonePanel);
  }

  function listByPage(pageNumber) {
    return panels
      .filter((panel) => isPdfPanel(panel) && panel.pageNumber === pageNumber)
      .map(clonePanel);
  }

  function getById(id) {
    const panel = panels.find((item) => item.id === id);
    return panel ? clonePanel(panel) : null;
  }

  function count() {
    return panels.length;
  }

  function countByPage(pageNumber) {
    return panels.filter(
      (panel) => isPdfPanel(panel) && panel.pageNumber === pageNumber,
    ).length;
  }

  return {
    add,
    addMedia,
    restore,
    indexOf,
    remove,
    clear,
    listAll,
    listInRegistrationOrder,
    listByPage,
    count,
    countByPage,
    getById,
  };
}

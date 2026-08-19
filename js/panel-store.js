function createPanelId(serial) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `panel-${serial}`;
}

function clonePanel(panel) {
  return {
    id: panel.id,
    pageNumber: panel.pageNumber,
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
    source: panel.source,
  };
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
      source: "manual",
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
        if (a.panel.pageNumber !== b.panel.pageNumber) {
          return a.panel.pageNumber - b.panel.pageNumber;
        }
        return a.index - b.index;
      })
      .map(({ panel }) => clonePanel(panel));
  }

  function listByPage(pageNumber) {
    return panels
      .filter((panel) => panel.pageNumber === pageNumber)
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
    return panels.filter((panel) => panel.pageNumber === pageNumber).length;
  }

  return {
    add,
    restore,
    indexOf,
    remove,
    clear,
    listAll,
    listByPage,
    count,
    countByPage,
    getById,
  };
}

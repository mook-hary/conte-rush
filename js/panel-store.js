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
      source: "manual",
    };
    nextSerial += 1;
    panels.push(panel);
    return panel;
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
      .map(({ panel }) => panel);
  }

  function listByPage(pageNumber) {
    return panels.filter((panel) => panel.pageNumber === pageNumber);
  }

  function getById(id) {
    return panels.find((panel) => panel.id === id) ?? null;
  }

  function count() {
    return panels.length;
  }

  function countByPage(pageNumber) {
    return listByPage(pageNumber).length;
  }

  return {
    add,
    remove,
    clear,
    listAll,
    listByPage,
    count,
    countByPage,
    getById,
  };
}

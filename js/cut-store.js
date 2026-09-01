function createCutId(serial) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cut-${serial}`;
}

function cloneCut(cut) {
  return {
    id: cut.id,
    cutNumber: cut.cutNumber,
    durationFrames: cut.durationFrames,
    panelIds: [...cut.panelIds],
  };
}

export function createCutStore() {
  const cuts = [];
  let nextSerial = 1;

  function add({ cutNumber, durationFrames, panelIds }) {
    const cut = {
      id: createCutId(nextSerial),
      cutNumber,
      durationFrames,
      panelIds: [...panelIds],
    };
    nextSerial += 1;
    cuts.push(cut);
    return cloneCut(cut);
  }

  function restore(cut) {
    if (!cut?.id) {
      return null;
    }
    if (cuts.some((item) => item.id === cut.id)) {
      return cloneCut(cuts.find((item) => item.id === cut.id));
    }
    const copy = cloneCut(cut);
    cuts.push(copy);
    return cloneCut(copy);
  }

  function update(id, patch) {
    const cut = cuts.find((item) => item.id === id);
    if (!cut) {
      return null;
    }
    if (patch.cutNumber !== undefined) {
      cut.cutNumber = patch.cutNumber;
    }
    if (patch.durationFrames !== undefined) {
      cut.durationFrames = patch.durationFrames;
    }
    if (patch.panelIds !== undefined) {
      cut.panelIds = [...patch.panelIds];
    }
    return cloneCut(cut);
  }

  function remove(id) {
    const index = cuts.findIndex((item) => item.id === id);
    if (index === -1) {
      return false;
    }
    cuts.splice(index, 1);
    return true;
  }

  function clear() {
    cuts.length = 0;
  }

  function listAll() {
    return cuts.map(cloneCut);
  }

  function getById(id) {
    const cut = cuts.find((item) => item.id === id);
    return cut ? cloneCut(cut) : null;
  }

  function hasCutNumber(cutNumber, exceptId = null) {
    return cuts.some(
      (cut) => cut.cutNumber === cutNumber && cut.id !== exceptId,
    );
  }

  function findCutIdByPanelId(panelId) {
    const cut = cuts.find((item) => item.panelIds.includes(panelId));
    return cut ? cut.id : null;
  }

  function removePanelFromAll(panelId) {
    for (const cut of cuts) {
      cut.panelIds = cut.panelIds.filter((id) => id !== panelId);
    }
  }

  function appendPanel(cutId, panelId) {
    const cut = cuts.find((item) => item.id === cutId);
    if (!cut) {
      return false;
    }
    if (cut.panelIds.includes(panelId)) {
      return true;
    }
    cut.panelIds.push(panelId);
    return true;
  }

  function removePanel(cutId, panelId) {
    const cut = cuts.find((item) => item.id === cutId);
    if (!cut) {
      return false;
    }
    cut.panelIds = cut.panelIds.filter((id) => id !== panelId);
    return true;
  }

  return {
    add,
    restore,
    update,
    remove,
    clear,
    listAll,
    getById,
    hasCutNumber,
    findCutIdByPanelId,
    removePanelFromAll,
    appendPanel,
    removePanel,
  };
}

export function compareCutNumbers(left, right) {
  const a = String(left ?? "").trim();
  const b = String(right ?? "").trim();
  const aDigits = /^\d+$/.test(a);
  const bDigits = /^\d+$/.test(b);
  if (aDigits && bDigits) {
    const delta = Number(a) - Number(b);
    if (delta !== 0) {
      return delta;
    }
  } else if (aDigits !== bDigits) {
    return aDigits ? -1 : 1;
  }
  return a.localeCompare(b, "en", { numeric: true });
}

export function orderCutsForPlayback(cuts) {
  return [...(cuts ?? [])].sort((left, right) => {
    const byNumber = compareCutNumbers(left?.cutNumber, right?.cutNumber);
    if (byNumber !== 0) {
      return byNumber;
    }
    return String(left?.id ?? "").localeCompare(String(right?.id ?? ""));
  });
}

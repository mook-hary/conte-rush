export function isSamePdfReconnect(session, file) {
  if (!session || !file) {
    return false;
  }
  const sessionName = String(session.fileName ?? "");
  const fileName = String(file.name ?? "");
  if (!sessionName || sessionName !== fileName) {
    return false;
  }
  const sessionSize = Number(session.fileSize);
  const fileSize = Number(file.size);
  if (!Number.isFinite(sessionSize) || !Number.isFinite(fileSize)) {
    return false;
  }
  return sessionSize === fileSize;
}

export function shouldClearEditingDataOnPdfLoad(session, file) {
  return !isSamePdfReconnect(session, file);
}

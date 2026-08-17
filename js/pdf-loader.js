import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

const PDFJS_VERSION = "4.10.38";
const WORKER_SRC = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;

function isPdfFile(file) {
  if (file.type === "application/pdf") {
    return true;
  }
  return file.name.toLowerCase().endsWith(".pdf");
}

export async function loadPdfFromFile(file) {
  if (!file) {
    throw new Error("ファイルが選択されていません。");
  }
  if (!isPdfFile(file)) {
    throw new Error("PDFファイルを選択してください。");
  }

  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const document = await loadingTask.promise;

  return {
    document,
    pageCount: document.numPages,
  };
}

export async function destroyPdfDocument(pdfDocument) {
  if (!pdfDocument) {
    return;
  }
  try {
    await pdfDocument.destroy();
  } catch (error) {
    console.warn("PDFドキュメントの破棄に失敗しました。", error);
  }
}

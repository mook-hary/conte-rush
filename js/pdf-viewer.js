export function createPdfViewer(canvas, container) {
  let renderTask = null;
  let renderToken = 0;

  function cancelRender() {
    if (!renderTask) {
      return;
    }
    renderTask.cancel();
    renderTask = null;
  }

  function clearCanvas() {
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.width = "";
    canvas.style.height = "";
  }

  function fitViewport(page) {
    const baseViewport = page.getViewport({ scale: 1 });
    const styles = window.getComputedStyle(container);
    const padX =
      Number.parseFloat(styles.paddingLeft) +
      Number.parseFloat(styles.paddingRight);
    const padY =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom);
    const maxWidth = Math.max(container.clientWidth - padX, 1);
    const maxHeight = Math.max(container.clientHeight - padY, 1);
    const scale = Math.min(
      maxWidth / baseViewport.width,
      maxHeight / baseViewport.height,
    );
    return page.getViewport({ scale });
  }

  async function renderPage(pdfDocument, pageNumber) {
    const token = ++renderToken;
    cancelRender();

    const page = await pdfDocument.getPage(pageNumber);
    if (token !== renderToken) {
      return;
    }

    const viewport = fitViewport(page);
    const outputScale = window.devicePixelRatio || 1;
    const context = canvas.getContext("2d");

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const transform =
      outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];

    const task = page.render({
      canvasContext: context,
      viewport,
      transform,
    });
    renderTask = task;

    try {
      await task.promise;
    } catch (error) {
      if (error?.name === "RenderingCancelledException") {
        return;
      }
      throw error;
    } finally {
      if (renderTask === task) {
        renderTask = null;
      }
    }
  }

  function clear() {
    renderToken += 1;
    cancelRender();
    clearCanvas();
  }

  return {
    renderPage,
    clear,
  };
}

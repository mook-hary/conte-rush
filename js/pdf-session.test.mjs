import assert from "node:assert/strict";
import test from "node:test";
import {
  isSamePdfReconnect,
  shouldClearEditingDataOnPdfLoad,
} from "./pdf-session.js";

test("same fileName and fileSize reconnects instead of starting a new project", () => {
  const session = { fileName: "board.pdf", fileSize: 2048 };
  const file = { name: "board.pdf", size: 2048 };
  assert.equal(isSamePdfReconnect(session, file), true);
  assert.equal(shouldClearEditingDataOnPdfLoad(session, file), false);
});

test("a different file is a new PDF load", () => {
  const session = { fileName: "board.pdf", fileSize: 2048 };
  assert.equal(
    shouldClearEditingDataOnPdfLoad(session, { name: "other.pdf", size: 2048 }),
    true,
  );
  assert.equal(
    shouldClearEditingDataOnPdfLoad(session, { name: "board.pdf", size: 99 }),
    true,
  );
});

test("missing session or size does not reconnect", () => {
  const file = { name: "board.pdf", size: 2048 };
  assert.equal(isSamePdfReconnect(null, file), false);
  assert.equal(
    isSamePdfReconnect({ fileName: "board.pdf" }, file),
    false,
  );
  assert.equal(
    isSamePdfReconnect({ fileName: "", fileSize: 2048 }, file),
    false,
  );
});

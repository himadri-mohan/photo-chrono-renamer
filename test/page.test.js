"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

test("the page exposes every element the browser script uses", async () => {
  const html = await readFile(path.join(__dirname, "..", "index.html"), "utf8");
  for (const id of [
    "select-folder",
    "apply-renames",
    "download-plan",
    "plan-body",
    "table-wrap",
    "empty-state",
    "empty-copy",
    "plan-title",
    "support-note",
    "row-template",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /src="lib\/exif-date\.js"/);
  assert.match(html, /src="lib\/plan\.js"/);
  assert.match(html, /src="app\.js"/);
  assert.doesNotMatch(html, /type="module"/);
});

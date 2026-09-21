"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRenamePlan, fileTime, formatStamp, withCollisionSuffix } = require("../lib/plan.js");

const parts = { y: 2020, mo: 1, d: 2, h: 3, mi: 4, s: 5, ms: 0 };

test("names a single photo by its capture time and keeps the extension", () => {
  const plan = buildRenamePlan([{ name: "Photo.JPEG", parts, source: "exif" }]);
  assert.deepEqual(
    plan.map((item) => item.newName),
    ["2020-01-02_03-04-05.JPEG"],
  );
  assert.equal(plan[0].changed, true);
});

test("uses _2 and _3 for collisions and keeps an already correct name", () => {
  const plan = buildRenamePlan([
    { name: "aaa.jpg", parts, source: "exif" },
    { name: "2020-01-02_03-04-05.jpg", parts, source: "exif" },
    { name: "zzz.jpg", parts, source: "exif" },
  ]);
  const byName = Object.fromEntries(plan.map((item) => [item.name, item.newName]));
  assert.equal(byName["2020-01-02_03-04-05.jpg"], "2020-01-02_03-04-05.jpg");
  assert.equal(byName["aaa.jpg"], "2020-01-02_03-04-05_2.jpg");
  assert.equal(byName["zzz.jpg"], "2020-01-02_03-04-05_3.jpg");
  assert.deepEqual(
    plan.map((item) => item.name),
    ["2020-01-02_03-04-05.jpg", "aaa.jpg", "zzz.jpg"],
  );
});

test("sorts by capture time and does not treat different extensions as collisions", () => {
  const later = { y: 2020, mo: 1, d: 2, h: 3, mi: 4, s: 6, ms: 0 };
  const plan = buildRenamePlan([
    { name: "b.png", parts: later, source: "mtime" },
    { name: "a.jpg", parts, source: "exif" },
  ]);
  assert.deepEqual(
    plan.map((item) => item.newName),
    ["2020-01-02_03-04-05.jpg", "2020-01-02_03-04-06.png"],
  );
});

test("treats names as case-insensitive and avoids reserved names", () => {
  const plan = buildRenamePlan(
    [
      { name: "one.JPG", parts, source: "exif" },
      { name: "two.jpg", parts, source: "exif" },
    ],
    ["2020-01-02_03-04-05.jpg"],
  );
  assert.deepEqual(plan.map((item) => item.newName).sort(), [
    "2020-01-02_03-04-05_2.JPG",
    "2020-01-02_03-04-05_3.jpg",
  ]);
});

test("orders same-second photos by milliseconds then name", () => {
  const plan = buildRenamePlan([
    { name: "b.jpg", parts: { ...parts, ms: 20 }, source: "mtime" },
    { name: "a.jpg", parts: { ...parts, ms: 5 }, source: "mtime" },
  ]);
  assert.deepEqual(
    plan.map((item) => item.name),
    ["a.jpg", "b.jpg"],
  );
  assert.equal(plan[1].newName, "2020-01-02_03-04-05_2.jpg");
});

test("file time prefers birth time and falls back to mtime", () => {
  const birth = new Date(2022, 3, 5, 6, 7, 8, 9);
  const modified = new Date(2019, 0, 1, 2, 3, 4, 5);
  assert.equal(fileTime({ birthtime: birth, mtime: modified }).source, "birthtime");
  assert.equal(formatStamp(fileTime({ birthtime: birth, mtime: modified }).parts), "2022-04-05_06-07-08");

  const missing = fileTime({ birthtime: new Date(0), mtime: modified });
  assert.equal(missing.source, "mtime");
  assert.equal(formatStamp(missing.parts), "2019-01-01_02-03-04");
  assert.equal(withCollisionSuffix("2020-01-02_03-04-05.JPG", 2), "2020-01-02_03-04-05_2.JPG");
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { main } = require("../cli.js");
const { fileTime, formatDisplay, formatStamp } = require("../lib/plan.js");
const { buildJpeg, buildTiff, buildPng } = require("./fixtures.js");

function captureIo() {
  const out = [];
  const err = [];
  return {
    out,
    err,
    io: {
      log: (...args) => out.push(args.join(" ")),
      error: (...args) => err.push(args.join(" ")),
    },
  };
}

async function makeFolder() {
  return mkdtemp(path.join(tmpdir(), "photo-chrono-"));
}

test("dry run prints the mapping and does not rename", async () => {
  const dir = await makeFolder();
  try {
    const early = buildJpeg(buildTiff({ dateTimeOriginal: "2020:01:02 03:04:05", dateTime: "2010:01:01 01:01:01" }));
    const later = buildJpeg(buildTiff({ dateTimeOriginal: "2020:01:02 03:04:05" }));
    const png = buildPng(buildTiff({}));
    await writeFile(path.join(dir, "later.jpg"), later);
    await writeFile(path.join(dir, "early.JPG"), early);
    await writeFile(path.join(dir, "plain.png"), png);
    await writeFile(path.join(dir, "notes.txt"), "keep me");
    await mkdir(path.join(dir, "album"));
    await writeFile(path.join(dir, "album", "nested.jpg"), early);
    await mkdir(path.join(dir, "2020-01-02_03-04-05.jpg"));

    const captured = captureIo();
    const code = await main([dir], captured.io);
    assert.equal(code, 0);
    const text = captured.out.join("\n");
    assert.match(text, /Dry run only/);
    assert.match(text, /Skipped 2 subfolders/);
    assert.match(text, /early\.JPG -> 2020-01-02_03-04-05_2\.JPG  \[exif 2020-01-02 03:04:05\]/);
    assert.match(text, /later\.jpg -> 2020-01-02_03-04-05_3\.jpg  \[exif 2020-01-02 03:04:05\]/);
    const pngStat = await stat(path.join(dir, "plain.png"));
    const fallback = fileTime(pngStat);
    assert.match(
      text,
      new RegExp(`plain\\.png -> ${formatStamp(fallback.parts)}\\.png  \\[${fallback.source} ${formatDisplay(fallback.parts)}\\]`),
    );
    assert.match(text, /3 to rename, 0 already named correctly/);
    assert.deepEqual((await readdir(dir)).sort(), ["2020-01-02_03-04-05.jpg", "album", "early.JPG", "later.jpg", "notes.txt", "plain.png"]);
    assert.deepEqual(await readdir(path.join(dir, "album")), ["nested.jpg"]);
    assert.equal(await readFile(path.join(dir, "notes.txt"), "utf8"), "keep me");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("apply renames without overwriting and preserves bytes", async () => {
  const dir = await makeFolder();
  try {
    const taken = buildJpeg(buildTiff({ dateTimeOriginal: "2021:05:06 07:08:09" }));
    const wantsTaken = buildJpeg(buildTiff({ dateTimeOriginal: "2020:01:02 03:04:05" }));
    await writeFile(path.join(dir, "2020-01-02_03-04-05.jpg"), taken);
    await writeFile(path.join(dir, "IMG.jpg"), wantsTaken);

    const captured = captureIo();
    const code = await main([dir, "--apply"], captured.io);
    assert.equal(code, 0);
    assert.match(captured.out.join("\n"), /Renamed 2 files/);
    assert.deepEqual((await readdir(dir)).sort(), ["2020-01-02_03-04-05.jpg", "2021-05-06_07-08-09.jpg"]);
    assert.deepEqual(await readFile(path.join(dir, "2020-01-02_03-04-05.jpg")), wantsTaken);
    assert.deepEqual(await readFile(path.join(dir, "2021-05-06_07-08-09.jpg")), taken);
    assert.equal((await readdir(dir)).some((name) => name.startsWith("chrono-tmp-")), false);

    const again = captureIo();
    assert.equal(await main([dir], again.io), 0);
    assert.match(again.out.join("\n"), /0 to rename, 2 already named correctly/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("falls back to filesystem time and reports usage errors", async () => {
  const dir = await makeFolder();
  try {
    await writeFile(path.join(dir, "scan.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const when = new Date(2019, 0, 1, 2, 3, 4);
    await utimes(path.join(dir, "scan.png"), when, when);
    const info = await stat(path.join(dir, "scan.png"));
    const fallback = fileTime(info);
    const captured = captureIo();
    assert.equal(await main([dir], captured.io), 0);
    assert.match(captured.out.join("\n"), new RegExp(`${formatStamp(fallback.parts)}\\.png`));
    assert.match(captured.out.join("\n"), new RegExp(`\\[${fallback.source} `));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const missing = captureIo();
  assert.equal(await main([path.join(tmpdir(), "photo-chrono-missing")], missing.io), 1);
  assert.match(missing.err.join("\n"), /Could not read folder/);

  const help = captureIo();
  assert.equal(await main(["--help"], help.io), 0);
  assert.match(help.out.join("\n"), /--apply/);

  const unknown = captureIo();
  assert.equal(await main(["--nope"], unknown.io), 1);
  assert.match(unknown.err.join("\n"), /Unknown option/);
});

test("the cli executable dry-run demo exits 0", async () => {
  const dir = await makeFolder();
  try {
    await writeFile(
      path.join(dir, "IMG_0001.jpg"),
      buildJpeg(buildTiff({ dateTimeOriginal: "2004:11:12 13:14:15" })),
    );
    const { stdout, code } = await new Promise((resolve, reject) => {
      execFile(process.execPath, [path.join(__dirname, "..", "cli.js"), dir], (error, stdout, stderr) => {
        if (error && error.code == null) reject(error);
        else resolve({ stdout, stderr, code: error ? error.code : 0 });
      });
    });
    assert.equal(code, 0);
    assert.match(stdout, /IMG_0001\.jpg -> 2004-11-12_13-14-15\.jpg  \[exif 2004-11-12 13:14:15\]/);
    assert.match(stdout, /Dry run only/);
    assert.equal((await readdir(dir)).includes("IMG_0001.jpg"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

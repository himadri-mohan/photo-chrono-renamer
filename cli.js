#!/usr/bin/env node
"use strict";

const { open, readdir, rename, stat } = require("node:fs/promises");
const path = require("node:path");
const { parseEmbeddedCapture } = require("./lib/exif-date.js");
const { buildRenamePlan, fileTime, formatDisplay, isImageName } = require("./lib/plan.js");

const MAX_BYTES = 48 * 1024 * 1024;

const help = `Usage: node cli.js <folder> [--apply]

Sort images in a folder by capture time and rename them.

  YYYY-MM-DD_HH-MM-SS.ext
  YYYY-MM-DD_HH-MM-SS_2.ext   when that name is already used

Time is taken from EXIF DateTimeOriginal when present (then similar EXIF/XMP
dates). Otherwise the file birth time is used, then the modification time.

By default this prints the rename plan and does not change files.
  --apply    Rename files in place
  -h, --help Show this help

Supported types: jpg, jpeg, png, heic, heif, webp, tif, tiff.
Only files directly inside the folder are included.
`;

async function main(argv = process.argv.slice(2), io = console) {
  const args = parseArgs(argv);
  if (args.help || (!args.folder && !args.error)) {
    io.log(help.trim());
    return args.help ? 0 : 1;
  }
  if (args.error) {
    io.error(args.error);
    io.error(help.trim());
    return 1;
  }

  let dirents;
  try {
    dirents = await readdir(args.folder, { withFileTypes: true });
  } catch (error) {
    io.error(`Could not read folder: ${error.message}`);
    return 1;
  }

  const images = [];
  const reserved = [];
  let subfolders = 0;
  for (const entry of dirents) {
    if (entry.isDirectory()) {
      subfolders += 1;
      reserved.push(entry.name);
      continue;
    }
    if (entry.isFile() && isImageName(entry.name)) images.push(entry.name);
    else reserved.push(entry.name);
  }

  const files = [];
  for (const name of images) {
    try {
      files.push(await describeImage(path.join(args.folder, name), name));
    } catch (error) {
      io.error(`Skipped ${name}: ${error.message}`);
    }
  }

  const plan = buildRenamePlan(files, reserved);
  const changes = plan.filter((item) => item.changed);
  io.log(args.apply ? "Applying renames." : "Dry run only. No files were changed.");
  io.log(path.resolve(args.folder));
  if (subfolders) {
    io.log(
      `Skipped ${subfolders} subfolder${subfolders === 1 ? "" : "s"}. Only the selected folder is processed.`,
    );
  }
  io.log("");
  if (!plan.length) {
    io.log("No supported images found.");
    return 0;
  }
  for (const item of plan) {
    io.log(`${item.name} -> ${item.newName}  [${item.source} ${formatDisplay(item.parts)}]`);
  }
  io.log("");
  const unchanged = plan.length - changes.length;
  if (!args.apply) {
    io.log(
      `${changes.length} to rename, ${unchanged} already named correctly. Re-run with --apply to rename.`,
    );
    return 0;
  }
  if (!changes.length) {
    io.log("Nothing to rename.");
    return 0;
  }
  try {
    await applyPlan(args.folder, changes);
  } catch (error) {
    io.error(`Rename stopped: ${error.message}`);
    return 1;
  }
  io.log(`Renamed ${changes.length} file${changes.length === 1 ? "" : "s"}.`);
  return 0;
}

function parseArgs(argv) {
  let folder = "";
  let apply = false;
  let helpRequested = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--help" || arg === "-h") helpRequested = true;
    else if (arg.startsWith("-")) return { error: `Unknown option: ${arg}` };
    else if (folder) return { error: "Only one folder can be renamed at a time." };
    else folder = arg;
  }
  return { folder, apply, help: helpRequested };
}

async function describeImage(fullPath, name) {
  const handle = await open(fullPath, "r");
  try {
    const info = await handle.stat();
    const length = Math.min(info.size, MAX_BYTES);
    const bytes = Buffer.alloc(length);
    if (length) await handle.read(bytes, 0, length, 0);
    const embedded = length ? parseEmbeddedCapture(bytes) : null;
    if (embedded) return { name, parts: embedded.parts, source: embedded.source };
    const fallback = fileTime(info);
    return { name, parts: fallback.parts, source: fallback.source };
  } finally {
    await handle.close();
  }
}

async function applyPlan(dir, changes) {
  const staged = [];
  try {
    for (let index = 0; index < changes.length; index++) {
      const temp = await uniqueTemp(dir, changes[index].name, index);
      await rename(path.join(dir, changes[index].name), path.join(dir, temp));
      staged.push({ temp, item: changes[index], finalized: false });
    }
    for (const step of staged) {
      const destination = path.join(dir, step.item.newName);
      await assertAbsent(destination);
      await rename(path.join(dir, step.temp), destination);
      step.finalized = true;
    }
  } catch (error) {
    for (const step of staged) {
      if (step.finalized) continue;
      const original = path.join(dir, step.item.name);
      try {
        await assertAbsent(original);
        await rename(path.join(dir, step.temp), original);
      } catch {
        // Leave the temporary name in place if the original path cannot be restored.
      }
    }
    throw error;
  }
}

async function uniqueTemp(dir, original, index) {
  const ext = path.extname(original);
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = `chrono-tmp-${process.pid}-${index}-${attempt}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    try {
      await assertAbsent(path.join(dir, name));
      return name;
    } catch (error) {
      if (!String(error.message).startsWith("Refusing to overwrite")) throw error;
    }
  }
  throw new Error("Could not choose a temporary filename.");
}

async function assertAbsent(filePath) {
  try {
    await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Refusing to overwrite ${path.basename(filePath)}`);
}

module.exports = { main };

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error?.message || error);
      process.exitCode = 1;
    },
  );
}

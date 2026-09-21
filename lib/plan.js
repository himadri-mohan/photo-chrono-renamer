"use strict";

/** Shared chronological rename plan for the CLI and the browser page. */

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".webp",
  ".tif",
  ".tiff",
]);

function extensionOf(name) {
  const index = name.lastIndexOf(".");
  if (index <= 0) return "";
  return name.slice(index);
}

function isImageName(name) {
  return IMAGE_EXTENSIONS.has(extensionOf(name).toLowerCase());
}

function partsFromDate(date) {
  return {
    y: date.getFullYear(),
    mo: date.getMonth() + 1,
    d: date.getDate(),
    h: date.getHours(),
    mi: date.getMinutes(),
    s: date.getSeconds(),
    ms: date.getMilliseconds(),
  };
}

/** Birth time when the filesystem records one, otherwise mtime. */
function fileTime(stat) {
  const birth = stat.birthtime;
  if (birth instanceof Date && Number.isFinite(birth.getTime()) && birth.getTime() > 24 * 60 * 60 * 1000) {
    return { parts: partsFromDate(birth), source: "birthtime" };
  }
  return { parts: partsFromDate(stat.mtime), source: "mtime" };
}

function formatStamp(parts) {
  return `${parts.y}-${pad(parts.mo)}-${pad(parts.d)}_${pad(parts.h)}-${pad(parts.mi)}-${pad(parts.s)}`;
}

function formatDisplay(parts) {
  return `${parts.y}-${pad(parts.mo)}-${pad(parts.d)} ${pad(parts.h)}:${pad(parts.mi)}:${pad(parts.s)}`;
}

function withCollisionSuffix(baseName, n) {
  const dot = baseName.lastIndexOf(".");
  if (dot <= 0) return `${baseName}_${n}`;
  return `${baseName.slice(0, dot)}_${n}${baseName.slice(dot)}`;
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function nameKey(name) {
  return name.toLowerCase();
}

function compareCapture(a, b) {
  const keys = ["y", "mo", "d", "h", "mi", "s", "ms"];
  for (const key of keys) {
    const delta = (a.parts[key] || 0) - (b.parts[key] || 0);
    if (delta) return delta;
  }
  return a.name.localeCompare(b.name);
}

/**
 * Build a chronological rename plan.
 * `files` items are `{ name, parts, source }`.
 * `reservedNames` stay in the folder and are never overwritten.
 * The first file for a timestamp keeps `YYYY-MM-DD_HH-MM-SS.ext`;
 * further files use `_2`, `_3`, ...
 */
function buildRenamePlan(files, reservedNames = []) {
  const sorted = [...files].sort(compareCapture);
  const used = new Set(reservedNames.map(nameKey));
  const assigned = new Map();

  for (const file of sorted) {
    const base = `${formatStamp(file.parts)}${extensionOf(file.name)}`;
    if (file.name === base && !used.has(nameKey(base))) {
      assigned.set(file, base);
      used.add(nameKey(base));
    }
  }

  for (const file of sorted) {
    if (assigned.has(file)) continue;
    const base = `${formatStamp(file.parts)}${extensionOf(file.name)}`;
    let name = base;
    let suffix = 2;
    while (used.has(nameKey(name))) {
      if (suffix > 100000) throw new Error(`Too many files share ${base}`);
      name = withCollisionSuffix(base, suffix);
      suffix += 1;
    }
    assigned.set(file, name);
    used.add(nameKey(name));
  }

  return sorted.map((file) => {
    const newName = assigned.get(file);
    return {
      name: file.name,
      newName,
      parts: file.parts,
      source: file.source,
      changed: file.name !== newName,
    };
  });
}

const planApi = {
  IMAGE_EXTENSIONS,
  extensionOf,
  isImageName,
  partsFromDate,
  fileTime,
  formatStamp,
  formatDisplay,
  withCollisionSuffix,
  buildRenamePlan,
};
if (typeof module === "object" && module.exports) module.exports = planApi;
else globalThis.PhotoChrono = Object.assign(globalThis.PhotoChrono || {}, planApi);

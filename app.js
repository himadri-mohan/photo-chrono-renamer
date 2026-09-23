"use strict";

const {
  buildRenamePlan,
  formatDisplay,
  isImageName,
  parseEmbeddedCapture,
  partsFromDate,
} = globalThis.PhotoChrono;

const imageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
]);
const selectButton = document.querySelector("#select-folder");
const applyButton = document.querySelector("#apply-renames");
const downloadButton = document.querySelector("#download-plan");
const planBody = document.querySelector("#plan-body");
const tableWrap = document.querySelector("#table-wrap");
const emptyState = document.querySelector("#empty-state");
const emptyCopy = document.querySelector("#empty-copy");
const planTitle = document.querySelector("#plan-title");
const supportNote = document.querySelector("#support-note");
let plan = [];
let selectedDirectory;

supportNote.textContent = window.showDirectoryPicker
  ? "Works entirely on this device. Capture time comes from EXIF when present, otherwise the file's modified time."
  : "Your browser can preview a rename plan, but Chrome or Edge is needed to rename files in place.";

selectButton.addEventListener("click", chooseFolder);
applyButton.addEventListener("click", applyRenames);
downloadButton.addEventListener("click", downloadPlan);

async function chooseFolder() {
  if (!window.showDirectoryPicker) {
    supportNote.textContent = "Please open this page in Chrome or Edge to select and rename a folder.";
    return;
  }
  try {
    const directory = await window.showDirectoryPicker({ mode: "readwrite" });
    selectedDirectory = directory;
    const images = [];
    const reserved = [];
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file") {
        reserved.push(name);
        continue;
      }
      const file = await handle.getFile();
      if (isImageName(name) || imageTypes.has(file.type)) images.push({ name, file, handle });
      else reserved.push(name);
    }
    const captured = [];
    for (const item of images) {
      const when = await captureDate(item.file);
      captured.push({ ...item, parts: when.parts, source: when.source });
    }
    const byName = new Map(captured.map((item) => [item.name, item]));
    plan = buildRenamePlan(captured, reserved).map((row) => ({
      ...row,
      file: byName.get(row.name).file,
      handle: byName.get(row.name).handle,
    }));
    renderPlan();
  } catch (error) {
    if (error.name !== "AbortError") supportNote.textContent = `Could not open folder: ${error.message}`;
  }
}

async function captureDate(file) {
  try {
    const length = Math.min(file.size, 48 * 1024 * 1024);
    if (length) {
      const bytes = new Uint8Array(await file.slice(0, length).arrayBuffer());
      const embedded = parseEmbeddedCapture(bytes);
      if (embedded) return embedded;
    }
  } catch (_) {
    /* Fall back to the file's modified time. */
  }
  return { parts: partsFromDate(new Date(file.lastModified)), source: "mtime" };
}

function renderPlan() {
  planBody.replaceChildren();
  plan.forEach((item, index) => {
    const row = document.querySelector("#row-template").content.cloneNode(true);
    row.querySelector(".index").textContent = index + 1;
    row.querySelector(".old-name").textContent = item.name;
    row.querySelector(".date").textContent = formatDisplay(item.parts);
    row.querySelector(".source").textContent = item.source;
    row.querySelector(".new-name").textContent = item.newName;
    planBody.append(row);
  });
  const count = plan.length;
  planTitle.textContent = count
    ? `${count} photo${count === 1 ? "" : "s"} ready to rename`
    : "No supported photos found";
  emptyCopy.textContent = count
    ? ""
    : "No supported photos in that folder. Use jpg, jpeg, png, heic, webp, or tiff.";
  emptyState.hidden = Boolean(count);
  tableWrap.hidden = !count;
  applyButton.disabled = !count;
  downloadButton.disabled = !count;
}

async function applyRenames() {
  const changes = plan.filter((item) => item.changed);
  if (!selectedDirectory || !changes.length) return;
  if (!confirm(`Rename ${changes.length} file${changes.length === 1 ? "" : "s"}? This replaces the original filenames.`)) {
    return;
  }
  applyButton.disabled = true;
  downloadButton.disabled = true;
  try {
    if (typeof changes[0].handle.move === "function") await renameWithMove(changes);
    else await renameByCopy(changes);
    supportNote.textContent = `Renamed ${changes.length} photo${changes.length === 1 ? "" : "s"}.`;
    planTitle.textContent = "Rename completed";
    applyButton.disabled = true;
    downloadButton.disabled = false;
  } catch (error) {
    supportNote.textContent = error.message;
    applyButton.disabled = false;
    downloadButton.disabled = !plan.length;
  }
}

async function renameWithMove(changes) {
  for (let index = 0; index < changes.length; index++) {
    const temp = temporaryName(changes[index].name, index);
    await changes[index].handle.move(temp);
    changes[index].tempName = temp;
  }
  for (const item of changes) {
    await item.handle.move(item.newName);
  }
}

async function renameByCopy(changes) {
  for (let index = 0; index < changes.length; index++) {
    const temp = temporaryName(changes[index].name, index);
    await writeHandle(temp, changes[index].file);
    changes[index].tempName = temp;
  }
  for (const item of changes) await selectedDirectory.removeEntry(item.name);
  for (const item of changes) {
    const tempHandle = await selectedDirectory.getFileHandle(item.tempName);
    const file = await tempHandle.getFile();
    await writeHandle(item.newName, file);
    await selectedDirectory.removeEntry(item.tempName);
  }
}

function temporaryName(name, index) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  return `chrono-tmp-${Date.now()}-${index}${ext}`;
}

async function writeHandle(name, file) {
  try {
    await selectedDirectory.getFileHandle(name);
    throw new Error(`Refusing to overwrite ${name}`);
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
  }
  const destination = await selectedDirectory.getFileHandle(name, { create: true });
  const writer = await destination.createWritable();
  await writer.write(file);
  await writer.close();
}

function downloadPlan() {
  const csv = [
    "Current filename,New filename,Capture time,Source",
    ...plan.map((item) =>
      [item.name, item.newName, formatDisplay(item.parts), item.source]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    ),
  ].join("\n");
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: "photo-rename-plan.csv",
  });
  link.click();
  URL.revokeObjectURL(link.href);
}

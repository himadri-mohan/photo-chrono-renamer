const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const selectButton = document.querySelector("#select-folder");
const applyButton = document.querySelector("#apply-renames");
const downloadButton = document.querySelector("#download-plan");
const planBody = document.querySelector("#plan-body");
const tableWrap = document.querySelector("#table-wrap");
const emptyState = document.querySelector("#empty-state");
const planTitle = document.querySelector("#plan-title");
const supportNote = document.querySelector("#support-note");
let plan = [];
let selectedDirectory;

supportNote.textContent = window.showDirectoryPicker
  ? "Works entirely on this device."
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
    const items = [];
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file") continue;
      const file = await handle.getFile();
      if (imageTypes.has(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(name)) items.push({ file, handle });
    }
    plan = await Promise.all(items.map(async item => ({ ...item, date: await captureDate(item.file) })));
    plan.sort((a, b) => a.date - b.date || a.file.name.localeCompare(b.file.name));
    plan = plan.map((item, index) => ({ ...item, newName: makeName(item.file.name, item.date, index + 1) }));
    renderPlan();
  } catch (error) {
    if (error.name !== "AbortError") supportNote.textContent = `Could not open folder: ${error.message}`;
  }
}

async function captureDate(file) {
  // JPEG EXIF dates are read when available; other images safely use modified time.
  if (file.type === "image/jpeg") {
    try {
      const text = new TextDecoder("latin1").decode(await file.slice(0, 65536).arrayBuffer());
      const match = text.match(/20\d\d:[01]\d:[0-3]\d [0-2]\d:[0-5]\d:[0-5]\d/);
      if (match) return new Date(match[0].replace(/:(?=\d\d:)/, "-").replace(/:(?=\d\d )/, "-").replace(" ", "T"));
    } catch (_) { /* fall back below */ }
  }
  return new Date(file.lastModified);
}

function makeName(oldName, date, sequence) {
  const ext = oldName.includes(".") ? oldName.slice(oldName.lastIndexOf(".")).toLowerCase() : "";
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}_${String(sequence).padStart(3, "0")}${ext}`;
}

function renderPlan() {
  planBody.replaceChildren();
  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle:"medium", timeStyle:"medium" });
  plan.forEach((item, index) => {
    const row = document.querySelector("#row-template").content.cloneNode(true);
    row.querySelector(".index").textContent = index + 1;
    row.querySelector(".old-name").textContent = item.file.name;
    row.querySelector(".date").textContent = formatter.format(item.date);
    row.querySelector(".new-name").textContent = item.newName;
    planBody.append(row);
  });
  const count = plan.length;
  planTitle.textContent = count ? `${count} photo${count === 1 ? "" : "s"} ready to rename` : "No supported photos found";
  emptyState.hidden = Boolean(count); tableWrap.hidden = !count;
  applyButton.disabled = !count; downloadButton.disabled = !count;
}

async function applyRenames() {
  if (!selectedDirectory || !confirm(`Rename ${plan.length} files? This replaces the original filenames and cannot be undone here.`)) return;
  applyButton.disabled = true;
  try {
    // Refuse to overwrite a pre-existing file. This makes the batch safe to retry.
    for (const item of plan) {
      if (item.file.name === item.newName) continue;
      try {
        await selectedDirectory.getFileHandle(item.newName);
        throw new Error(`A file named “${item.newName}” already exists. Nothing was changed.`);
      } catch (error) {
        if (error.name !== "NotFoundError") throw error;
      }
    }
    // The API has no rename operation. Write each renamed copy first, then remove originals.
    for (const item of plan) {
      if (item.file.name === item.newName) continue;
      const destination = await selectedDirectory.getFileHandle(item.newName, { create: true });
      const writer = await destination.createWritable();
      await writer.write(item.file);
      await writer.close();
    }
    for (const item of plan) {
      if (item.file.name !== item.newName) await selectedDirectory.removeEntry(item.file.name);
    }
    supportNote.textContent = `Renamed ${plan.length} photo${plan.length === 1 ? "" : "s"} successfully.`;
    applyButton.disabled = true;
    planTitle.textContent = "Rename completed";
  } catch (error) {
    supportNote.textContent = error.message;
  } finally { applyButton.disabled = false; }
}

function downloadPlan() {
  const csv = ["Current filename,New filename,Capture time", ...plan.map(item => [item.file.name, item.newName, item.date.toISOString()].map(value => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n");
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type:"text/csv" })), download:"photo-rename-plan.csv" });
  link.click(); URL.revokeObjectURL(link.href);
}

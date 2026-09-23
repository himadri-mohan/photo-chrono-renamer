"use strict";

(function () {
/**
 * Read a capture timestamp from image bytes.
 *
 * Preference: EXIF DateTimeOriginal, DateTimeDigitized, XMP DateTimeOriginal,
 * XMP CreateDate, then EXIF DateTime. Returns null when no usable embedded
 * date is present so the caller can fall back to the filesystem.
 */

const TAG_DATE_TIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TYPE_ASCII = 2;

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "heif",
  "mif1",
  "msf1",
  "avif",
  "avis",
]);

function parseEmbeddedCapture(bytes) {
  const u8 = asBytes(bytes);
  if (u8.length < 8) return null;
  const found = {};
  if (isJpeg(u8)) parseJpeg(u8, found);
  else if (isPng(u8)) parsePng(u8, found);
  else if (isWebp(u8)) parseWebp(u8, found);
  else if (isTiff(u8, 0)) mergeTiff(found, parseTiffDates(u8, 0));
  else if (isHeif(u8)) parseHeif(u8, found);
  return selectCapture(found);
}

function parseFlexibleDate(value) {
  if (!value) return null;
  const match = /(\d{4})[:\-](\d{2})[:\-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(
    String(value).trim(),
  );
  if (!match) return null;
  const parts = {
    y: Number(match[1]),
    mo: Number(match[2]),
    d: Number(match[3]),
    h: Number(match[4]),
    mi: Number(match[5]),
    s: Number(match[6]),
    ms: 0,
  };
  if (parts.y < 1900 || parts.y > 2100) return null;
  if (parts.mo < 1 || parts.mo > 12 || parts.d < 1 || parts.d > 31) return null;
  if (parts.h > 23 || parts.mi > 59 || parts.s > 60) return null;
  return parts;
}

function selectCapture(found) {
  const order = ["original", "digitized", "xmpOriginal", "xmpCreate", "modified"];
  for (const key of order) {
    if (found[key]) return { parts: found[key], source: "exif" };
  }
  return null;
}

function asBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  return new Uint8Array(bytes);
}

function viewOf(u8) {
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
}

function matchAscii(u8, offset, text) {
  if (offset < 0 || offset + text.length > u8.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (u8[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function asciiSlice(u8, start, end) {
  const from = Math.max(0, start);
  const to = Math.min(u8.length, end);
  let text = "";
  for (let i = from; i < to; i++) text += String.fromCharCode(u8[i]);
  return text;
}

function indexOfAscii(u8, text, from = 0) {
  const n = text.length;
  for (let i = Math.max(0, from); i <= u8.length - n; i++) {
    let found = true;
    for (let j = 0; j < n; j++) {
      if (u8[i + j] !== text.charCodeAt(j)) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}

function isJpeg(u8) {
  return u8[0] === 0xff && u8[1] === 0xd8;
}

function isPng(u8) {
  return (
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47 &&
    u8[4] === 0x0d &&
    u8[5] === 0x0a &&
    u8[6] === 0x1a &&
    u8[7] === 0x0a
  );
}

function isWebp(u8) {
  return matchAscii(u8, 0, "RIFF") && matchAscii(u8, 8, "WEBP");
}

function isTiff(u8, offset) {
  return (
    (matchAscii(u8, offset, "II") || matchAscii(u8, offset, "MM")) &&
    offset + 4 <= u8.length
  );
}

function isHeif(u8) {
  if (!matchAscii(u8, 4, "ftyp") || u8.length < 16) return false;
  const major = asciiSlice(u8, 8, 12).toLowerCase();
  if (HEIF_BRANDS.has(major)) return true;
  const view = viewOf(u8);
  const boxSize = view.getUint32(0, false);
  const end = Math.min(u8.length, boxSize || 32);
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    if (HEIF_BRANDS.has(asciiSlice(u8, offset, offset + 4).toLowerCase())) return true;
  }
  return false;
}

function mergeTiff(found, extra) {
  if (!extra) return;
  if (!found.original && extra.original) found.original = extra.original;
  if (!found.digitized && extra.digitized) found.digitized = extra.digitized;
  if (!found.modified && extra.modified) found.modified = extra.modified;
}

function mergeXmp(found, text) {
  if (!text) return;
  if (!found.xmpOriginal) found.xmpOriginal = matchTag(text, "DateTimeOriginal");
  if (!found.xmpCreate) {
    found.xmpCreate = matchTag(text, "CreateDate") || matchTag(text, "DateCreated");
  }
}

function matchTag(text, tag) {
  const match = new RegExp(
    `${tag}[^0-9]{0,48}([0-9]{4}[:\\-][0-9]{2}[:\\-][0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2})`,
  ).exec(text);
  return match ? parseFlexibleDate(match[1]) : null;
}

function parseJpeg(u8, found) {
  const view = viewOf(u8);
  let offset = 2;
  while (offset + 4 < u8.length) {
    if (u8[offset] !== 0xff) return;
    while (offset < u8.length && u8[offset] === 0xff) offset++;
    if (offset >= u8.length) return;
    const marker = u8[offset++];
    if (marker === 0xd9 || marker === 0xda) return;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > u8.length) return;
    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > u8.length) return;
    const dataStart = offset + 2;
    const dataEnd = offset + length;
    if (marker === 0xe1) {
      if (matchAscii(u8, dataStart, "Exif\0\0")) {
        mergeTiff(found, parseTiffDates(u8, dataStart + 6));
      } else if (matchAscii(u8, dataStart, "http://ns.adobe.com/xap/1.0/\0")) {
        const prefix = "http://ns.adobe.com/xap/1.0/\0".length;
        mergeXmp(found, asciiSlice(u8, dataStart + prefix, dataEnd));
      }
    }
    offset += length;
  }
}

function parsePng(u8, found) {
  const view = viewOf(u8);
  let offset = 8;
  while (offset + 12 <= u8.length) {
    const length = view.getUint32(offset, false);
    const type = asciiSlice(u8, offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (length < 0 || dataStart + length + 4 > u8.length) return;
    if (type === "eXIf") {
      const tiffAt = matchAscii(u8, dataStart, "Exif\0\0") ? dataStart + 6 : dataStart;
      mergeTiff(found, parseTiffDates(u8, tiffAt));
    } else if (type === "iTXt") {
      mergeXmp(found, readItxt(u8, dataStart, dataStart + length));
    } else if (type === "tEXt") {
      mergeXmp(found, asciiSlice(u8, dataStart, dataStart + length));
    }
    if (type === "IDAT" || type === "IEND") return;
    offset = dataStart + length + 4;
  }
}

function readItxt(u8, start, end) {
  let i = start;
  while (i < end && u8[i] !== 0) i++;
  i++;
  if (i >= end || u8[i] !== 0) return "";
  i += 2;
  while (i < end && u8[i] !== 0) i++;
  i++;
  while (i < end && u8[i] !== 0) i++;
  i++;
  return asciiSlice(u8, i, end);
}

function parseWebp(u8, found) {
  const view = viewOf(u8);
  let offset = 12;
  while (offset + 8 <= u8.length) {
    const type = asciiSlice(u8, offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (size < 0 || dataStart + size > u8.length) return;
    if (type === "EXIF") {
      const tiffAt = matchAscii(u8, dataStart, "Exif\0\0") ? dataStart + 6 : dataStart;
      mergeTiff(found, parseTiffDates(u8, tiffAt));
    } else if (type === "XMP ") {
      mergeXmp(found, asciiSlice(u8, dataStart, dataStart + size));
    }
    offset = dataStart + size + (size % 2);
  }
}

function parseTiffDates(u8, tiffStart) {
  if (!isTiff(u8, tiffStart) || tiffStart + 8 > u8.length) return {};
  const le = u8[tiffStart] === 0x49;
  const view = viewOf(u8);
  if (view.getUint16(tiffStart + 2, le) !== 42) return {};
  const found = {};
  walkIfd(view, u8, tiffStart, tiffStart + view.getUint32(tiffStart + 4, le), le, found, 0);
  return found;
}

function walkIfd(view, u8, tiffStart, ifdOffset, le, found, depth) {
  if (depth > 4 || ifdOffset < 0 || ifdOffset + 2 > u8.length) return;
  const count = view.getUint16(ifdOffset, le);
  if (count > 400) return;
  let exifPointer = null;
  for (let i = 0; i < count; i++) {
    const entry = ifdOffset + 2 + i * 12;
    if (entry + 12 > u8.length) return;
    const tag = view.getUint16(entry, le);
    const type = view.getUint16(entry + 2, le);
    const n = view.getUint32(entry + 4, le);
    const valueField = entry + 8;
    if (tag === TAG_EXIF_IFD && (type === 4 || type === 3) && n >= 1) {
      const pointer = type === 3 ? view.getUint16(valueField, le) : view.getUint32(valueField, le);
      exifPointer = tiffStart + pointer;
    }
    if (
      (tag === TAG_DATE_TIME || tag === TAG_DATE_TIME_ORIGINAL || tag === TAG_DATE_TIME_DIGITIZED) &&
      type === TYPE_ASCII &&
      n >= 19 &&
      n < 64
    ) {
      const parts = parseFlexibleDate(readAsciiValue(view, u8, tiffStart, valueField, n, le));
      if (!parts) continue;
      if (tag === TAG_DATE_TIME_ORIGINAL) found.original = parts;
      else if (tag === TAG_DATE_TIME_DIGITIZED) found.digitized = parts;
      else found.modified = parts;
    }
  }
  if (exifPointer != null) walkIfd(view, u8, tiffStart, exifPointer, le, found, depth + 1);
}

function readAsciiValue(view, u8, tiffStart, valueField, count, le) {
  const start = count <= 4 ? valueField : tiffStart + view.getUint32(valueField, le);
  if (start < 0 || start >= u8.length) return "";
  let text = "";
  const end = Math.min(u8.length, start + count);
  for (let i = start; i < end; i++) {
    if (u8[i] === 0) break;
    text += String.fromCharCode(u8[i]);
  }
  return text;
}

function parseHeif(u8, found) {
  let meta = null;
  walkBoxes(u8, 0, u8.length, (box) => {
    if (box.type === "meta") meta = box;
  });
  if (meta) {
    const exifPayload = readHeifExifPayload(u8, meta);
    if (exifPayload) parseExifItem(exifPayload, found);
  }
  if (!found.original && !found.digitized && !found.modified) scanLooseDates(u8, found);
}

function readHeifExifPayload(u8, meta) {
  let exifId = null;
  let iloc = null;
  let idat = null;
  const bodyStart = meta.contentStart + 4;
  if (bodyStart > meta.contentEnd) return null;
  walkBoxes(u8, bodyStart, meta.contentEnd, (box) => {
    if (box.type === "iinf") exifId = exifItemId(u8, box);
    else if (box.type === "iloc") iloc = box;
    else if (box.type === "idat") idat = box;
  });
  if (exifId == null || !iloc) return null;
  const extent = findIlocExtent(u8, iloc, exifId);
  if (!extent || extent.length < 8) return null;
  if (extent.method === 1 && idat) {
    const start = idat.contentStart + extent.offset;
    const end = start + extent.length;
    if (start < 0 || end > u8.length) return null;
    return u8.subarray(start, end);
  }
  if (extent.method !== 0) return null;
  const end = extent.offset + extent.length;
  if (extent.offset < 0 || end > u8.length) return null;
  return u8.subarray(extent.offset, end);
}

function exifItemId(u8, iinf) {
  const view = viewOf(u8);
  const version = u8[iinf.contentStart];
  let offset = iinf.contentStart + 4;
  if (version === 0) {
    if (offset + 2 > iinf.contentEnd) return null;
    offset += 2;
  } else {
    if (offset + 4 > iinf.contentEnd) return null;
    offset += 4;
  }
  let exifId = null;
  walkBoxes(u8, offset, iinf.contentEnd, (box) => {
    if (box.type !== "infe") return;
    const itemVersion = u8[box.contentStart];
    let cursor = box.contentStart + 4;
    let id;
    if (itemVersion >= 3) {
      if (cursor + 4 > box.contentEnd) return;
      id = view.getUint32(cursor, false);
      cursor += 4;
    } else if (itemVersion === 2) {
      if (cursor + 2 > box.contentEnd) return;
      id = view.getUint16(cursor, false);
      cursor += 2;
    } else return;
    cursor += 2;
    if (cursor + 4 > box.contentEnd) return;
    if (asciiSlice(u8, cursor, cursor + 4) === "Exif") exifId = id;
  });
  return exifId;
}

function findIlocExtent(u8, iloc, itemId) {
  const view = viewOf(u8);
  const start = iloc.contentStart;
  const end = iloc.contentEnd;
  if (start + 8 > end) return null;
  const version = u8[start];
  const offsetSize = u8[start + 4] >> 4;
  const lengthSize = u8[start + 4] & 0x0f;
  const baseOffsetSize = u8[start + 5] >> 4;
  const indexSize = u8[start + 5] & 0x0f;
  let cursor = start + 6;
  if (![0, 4].includes(offsetSize) && offsetSize !== 8) return null;
  let itemCount;
  if (version < 2) {
    if (cursor + 2 > end) return null;
    itemCount = view.getUint16(cursor, false);
    cursor += 2;
  } else {
    if (cursor + 4 > end) return null;
    itemCount = view.getUint32(cursor, false);
    cursor += 4;
  }
  if (itemCount > 10000) return null;
  for (let i = 0; i < itemCount; i++) {
    let id;
    if (version < 2) {
      if (cursor + 2 > end) return null;
      id = view.getUint16(cursor, false);
      cursor += 2;
    } else {
      if (cursor + 4 > end) return null;
      id = view.getUint32(cursor, false);
      cursor += 4;
    }
    let method = 0;
    if (version === 1 || version === 2) {
      if (cursor + 2 > end) return null;
      method = view.getUint16(cursor, false) & 0x0f;
      cursor += 2;
    }
    cursor += 2;
    const base = readSized(view, cursor, end, baseOffsetSize);
    if (base == null) return null;
    cursor += baseOffsetSize;
    if (cursor + 2 > end) return null;
    const extents = view.getUint16(cursor, false);
    cursor += 2;
    let first = null;
    for (let e = 0; e < extents; e++) {
      if ((version === 1 || version === 2) && indexSize > 0) {
        if (readSized(view, cursor, end, indexSize) == null) return null;
        cursor += indexSize;
      }
      const off = readSized(view, cursor, end, offsetSize);
      if (off == null) return null;
      cursor += offsetSize;
      const len = readSized(view, cursor, end, lengthSize);
      if (len == null) return null;
      cursor += lengthSize;
      if (e === 0) first = { offset: base + off, length: len, method };
    }
    if (id === itemId) return first;
  }
  return null;
}

function readSized(view, offset, end, size) {
  if (size === 0) return 0;
  if (offset + size > end) return null;
  if (size === 2) return view.getUint16(offset, false);
  if (size === 4) return view.getUint32(offset, false);
  if (size === 8) {
    const hi = view.getUint32(offset, false);
    const lo = view.getUint32(offset + 4, false);
    return hi * 2 ** 32 + lo;
  }
  return null;
}

function parseExifItem(payload, found) {
  if (payload.length < 8) return;
  const view = viewOf(payload);
  const headerOffset = view.getUint32(0, false);
  const candidates = [4 + headerOffset, headerOffset];
  for (const tiffAt of candidates) {
    if (tiffAt >= 0 && tiffAt + 8 <= payload.length && isTiff(payload, tiffAt)) {
      const magic = viewOf(payload).getUint16(tiffAt + 2, payload[tiffAt] === 0x49);
      if (magic === 42) {
        mergeTiff(found, parseTiffDates(payload, tiffAt));
        return;
      }
    }
  }
  const marker = indexOfAscii(payload, "Exif\0\0");
  if (marker !== -1) mergeTiff(found, parseTiffDates(payload, marker + 6));
}

function scanLooseDates(u8, found) {
  for (const tag of ["DateTimeOriginal", "CreateDate", "DateCreated"]) {
    const index = indexOfAscii(u8, tag);
    if (index === -1) continue;
    mergeXmp(found, asciiSlice(u8, index, Math.min(u8.length, index + 80)));
  }
}

function walkBoxes(u8, start, end, visitor) {
  const view = viewOf(u8);
  let offset = start;
  while (offset + 8 <= end && offset >= start) {
    let size = view.getUint32(offset, false);
    const type = asciiSlice(u8, offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      const hi = view.getUint32(offset + 8, false);
      const lo = view.getUint32(offset + 12, false);
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (!Number.isFinite(size) || size < header) return;
    const next = offset + size;
    if (next <= offset || next > end) return;
    visitor({ type, contentStart: offset + header, contentEnd: next });
    offset = next;
  }
}

const exifApi = { parseEmbeddedCapture, parseFlexibleDate };
if (typeof module === "object" && module.exports) module.exports = exifApi;
else globalThis.PhotoChrono = Object.assign(globalThis.PhotoChrono || {}, exifApi);
})();

"use strict";

const { crc32 } = require("node:zlib");

function buildTiff({ littleEndian = true, dateTime, dateTimeOriginal, dateTimeDigitized } = {}) {
  const exifTags = [];
  if (dateTimeOriginal) exifTags.push({ tag: 0x9003, text: dateTimeOriginal });
  if (dateTimeDigitized) exifTags.push({ tag: 0x9004, text: dateTimeDigitized });
  const ifd0Tags = [];
  if (dateTime) ifd0Tags.push({ tag: 0x0132, text: dateTime });

  const ifd0Count = ifd0Tags.length + (exifTags.length ? 1 : 0);
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifIfdOffset = 8 + ifd0Size;
  const exifIfdSize = exifTags.length ? 2 + exifTags.length * 12 + 4 : 0;
  let stringOffset = exifIfdOffset + exifIfdSize;
  const strings = [];
  const place = (text) => {
    const bytes = Buffer.from(`${text}\0`, "ascii");
    const offset = stringOffset;
    strings.push(bytes);
    stringOffset += bytes.length;
    return offset;
  };
  const ifd0Strings = ifd0Tags.map((tag) => place(tag.text));
  const exifStrings = exifTags.map((tag) => place(tag.text));
  const buf = Buffer.alloc(stringOffset);

  if (littleEndian) {
    buf.write("II", 0, "ascii");
    buf.writeUInt16LE(42, 2);
    buf.writeUInt32LE(8, 4);
  } else {
    buf.write("MM", 0, "ascii");
    buf.writeUInt16BE(42, 2);
    buf.writeUInt32BE(8, 4);
  }
  const w16 = (offset, value) =>
    littleEndian ? buf.writeUInt16LE(value, offset) : buf.writeUInt16BE(value, offset);
  const w32 = (offset, value) =>
    littleEndian ? buf.writeUInt32LE(value, offset) : buf.writeUInt32BE(value, offset);

  w16(8, ifd0Count);
  let entry = 10;
  ifd0Tags.forEach((tag, index) => {
    w16(entry, tag.tag);
    w16(entry + 2, 2);
    w32(entry + 4, tag.text.length + 1);
    w32(entry + 8, ifd0Strings[index]);
    entry += 12;
  });
  if (exifTags.length) {
    w16(entry, 0x8769);
    w16(entry + 2, 4);
    w32(entry + 4, 1);
    w32(entry + 8, exifIfdOffset);
    entry += 12;
  }
  w32(entry, 0);

  if (exifTags.length) {
    w16(exifIfdOffset, exifTags.length);
    let exifEntry = exifIfdOffset + 2;
    exifTags.forEach((tag, index) => {
      w16(exifEntry, tag.tag);
      w16(exifEntry + 2, 2);
      w32(exifEntry + 4, tag.text.length + 1);
      w32(exifEntry + 8, exifStrings[index]);
      exifEntry += 12;
    });
    w32(exifEntry, 0);
  }

  let cursor = exifIfdOffset + exifIfdSize;
  for (const bytes of strings) {
    bytes.copy(buf, cursor);
    cursor += bytes.length;
  }
  return buf;
}

function jpegSegment(marker, data) {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([header, data]);
}

function buildJpeg(tiff) {
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSegment(0xe1, payload), Buffer.from([0xff, 0xd9])]);
}

function buildJpegXmp(xml) {
  const payload = Buffer.concat([
    Buffer.from("http://ns.adobe.com/xap/1.0/\0", "ascii"),
    Buffer.from(xml, "utf8"),
  ]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSegment(0xe1, payload), Buffer.from([0xff, 0xd9])]);
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function buildPng(tiff) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("eXIf", tiff),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function buildWebp(tiff, { rawTiff = false } = {}) {
  const payload = rawTiff ? tiff : Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(payload.length);
  let chunk = Buffer.concat([Buffer.from("EXIF", "ascii"), size, payload]);
  if (payload.length % 2 === 1) chunk = Buffer.concat([chunk, Buffer.from([0])]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(4 + chunk.length);
  return Buffer.concat([Buffer.from("RIFF"), riffSize, Buffer.from("WEBP"), chunk]);
}

function box(type, content) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + content.length, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, content]);
}

function fullBox(type, version, content) {
  const flags = Buffer.alloc(4);
  flags[0] = version;
  return box(type, Buffer.concat([flags, content]));
}

function buildHeif(tiff, { ilocVersion = 1 } = {}) {
  const payload = Buffer.concat([Buffer.from([0, 0, 0, 6]), Buffer.from("Exif\0\0", "ascii"), tiff]);
  const infeBody = Buffer.alloc(9);
  infeBody.writeUInt16BE(1, 0);
  infeBody.write("Exif", 4, "ascii");
  const infe = fullBox("infe", 2, infeBody);
  const count = Buffer.alloc(2);
  count.writeUInt16BE(1, 0);
  const iinf = fullBox("iinf", 0, Buffer.concat([count, infe]));

  const methodBytes = ilocVersion === 0 ? 0 : 2;
  const ilocBody = Buffer.alloc(4 + 2 + methodBytes + 2 + 2 + 4 + 4);
  ilocBody[0] = 0x44;
  ilocBody.writeUInt16BE(1, 2);
  let cursor = 4;
  ilocBody.writeUInt16BE(1, cursor);
  cursor += 2;
  if (methodBytes) cursor += 2;
  cursor += 2;
  ilocBody.writeUInt16BE(1, cursor);
  cursor += 2;
  const offsetPos = cursor;
  cursor += 4;
  ilocBody.writeUInt32BE(payload.length, cursor);
  const iloc = fullBox("iloc", ilocVersion, ilocBody);
  const meta = fullBox("meta", 0, Buffer.concat([iinf, iloc]));
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("heic"), Buffer.alloc(4), Buffer.from("mif1")]));
  const file = Buffer.concat([ftyp, meta, payload]);
  const fieldAt = ftyp.length + 12 + iinf.length + 12 + offsetPos;
  file.writeUInt32BE(ftyp.length + meta.length, fieldAt);
  return file;
}

module.exports = { buildTiff, buildJpeg, buildJpegXmp, buildPng, buildWebp, buildHeif, box };

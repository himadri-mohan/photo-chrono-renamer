"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseEmbeddedCapture } = require("../lib/exif-date.js");
const { buildTiff, buildJpeg, buildJpegXmp, buildPng, buildWebp, buildHeif, box } = require("./fixtures.js");

const stamp = (parts) =>
  [parts.y, parts.mo, parts.d, parts.h, parts.mi, parts.s].join("-");

test("prefers DateTimeOriginal over an earlier DateTime in the file", () => {
  const jpeg = buildJpeg(
    buildTiff({
      dateTime: "2010:01:01 01:01:01",
      dateTimeOriginal: "2020:05:06 07:08:09",
      dateTimeDigitized: "2011:02:03 04:05:06",
    }),
  );
  const found = parseEmbeddedCapture(jpeg);
  assert.equal(found.source, "exif");
  assert.equal(stamp(found.parts), "2020-5-6-7-8-9");
});

test("reads a 1998 capture date and big-endian TIFF", () => {
  const jpeg = buildJpeg(
    buildTiff({ littleEndian: false, dateTimeOriginal: "1998:12:31 23:59:58" }),
  );
  assert.equal(stamp(parseEmbeddedCapture(jpeg).parts), "1998-12-31-23-59-58");
});

test("uses DateTimeDigitized, then EXIF DateTime, when original is missing", () => {
  const digitized = parseEmbeddedCapture(
    buildJpeg(buildTiff({ dateTime: "2010:01:01 01:01:01", dateTimeDigitized: "2012:03:04 05:06:07" })),
  );
  assert.equal(stamp(digitized.parts), "2012-3-4-5-6-7");

  const modified = parseEmbeddedCapture(buildJpeg(buildTiff({ dateTime: "2014:08:09 10:11:12" })));
  assert.equal(stamp(modified.parts), "2014-8-9-10-11-12");
});

test("reads XMP when EXIF is absent and lets EXIF win when both exist", () => {
  const xmp = buildJpegXmp(
    '<exif:DateTimeOriginal>2001:02:03 04:05:06</exif:DateTimeOriginal><xmp:CreateDate>2009-09-09T09:09:09</xmp:CreateDate>',
  );
  assert.equal(stamp(parseEmbeddedCapture(xmp).parts), "2001-2-3-4-5-6");

  const tiff = buildTiff({ dateTimeOriginal: "2021:01:01 02:03:04" });
  const exifPayload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const xmpPayload = Buffer.concat([
    Buffer.from("http://ns.adobe.com/xap/1.0/\0", "ascii"),
    Buffer.from("<xmp:CreateDate>1990-01-01T00:00:00</xmp:CreateDate>"),
  ]);
  const header = (data, marker) => {
    const bytes = Buffer.alloc(4);
    bytes[0] = 0xff;
    bytes[1] = marker;
    bytes.writeUInt16BE(data.length + 2, 2);
    return Buffer.concat([bytes, data]);
  };
  const both = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    header(xmpPayload, 0xe1),
    header(exifPayload, 0xe1),
    Buffer.from([0xff, 0xd9]),
  ]);
  assert.equal(stamp(parseEmbeddedCapture(both).parts), "2021-1-1-2-3-4");
});

test("reads PNG, WebP, and TIFF containers", () => {
  const tiff = buildTiff({ dateTimeOriginal: "2018:07:06 05:04:03" });
  assert.equal(stamp(parseEmbeddedCapture(buildPng(tiff)).parts), "2018-7-6-5-4-3");
  assert.equal(stamp(parseEmbeddedCapture(buildWebp(tiff)).parts), "2018-7-6-5-4-3");
  assert.equal(stamp(parseEmbeddedCapture(buildWebp(tiff, { rawTiff: true })).parts), "2018-7-6-5-4-3");
  assert.equal(stamp(parseEmbeddedCapture(tiff).parts), "2018-7-6-5-4-3");
});

test("reads HEIF item EXIF for iloc version 0 and 1", () => {
  const tiff = buildTiff({ dateTimeOriginal: "2016:04:05 06:07:08" });
  assert.equal(stamp(parseEmbeddedCapture(buildHeif(tiff, { ilocVersion: 1 })).parts), "2016-4-5-6-7-8");
  assert.equal(stamp(parseEmbeddedCapture(buildHeif(tiff, { ilocVersion: 0 })).parts), "2016-4-5-6-7-8");
});

test("finds a loose HEIF capture date when item location is missing", () => {
  const loose = Buffer.concat([
    box("ftyp", Buffer.concat([Buffer.from("heic"), Buffer.alloc(4)])),
    Buffer.from("DateTimeOriginal>1999:03:04 05:06:07"),
  ]);
  assert.equal(stamp(parseEmbeddedCapture(loose).parts), "1999-3-4-5-6-7");
});

test("returns null when no usable date is embedded", () => {
  assert.equal(parseEmbeddedCapture(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null);
  assert.equal(parseEmbeddedCapture(buildJpeg(buildTiff({ dateTimeOriginal: "0000:00:00 00:00:00" }))), null);
  assert.equal(parseEmbeddedCapture(Buffer.from("hello")), null);
});

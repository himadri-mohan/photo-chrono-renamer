# Photo Chrono Renamer

## Goal

A private, browser-based utility for putting a batch of photos in chronological order and giving them clear, consistent names. Files are processed locally; nothing is uploaded.

## First release

- Choose a folder of images.
- Read EXIF capture dates when available, falling back to the file modification date.
- Preview the proposed name for every image.
- Rename files in the selected folder in Chromium-based browsers.
- Export a rename plan everywhere else.

## Naming format

`YYYY-MM-DD_HH-mm-ss_001.ext`

The sequence suffix makes filenames unique when photos share a timestamp.

## Deployment

This is a static site: deploy the repository directly through Vercel or GitHub Pages. No server, database, or build step is required.

## Commercial direction

Keep the core rename workflow free. Validate demand through public use before building paid capabilities, then offer advanced batch workflows as a paid upgrade. The free tool's local-only processing is the main trust and marketing advantage; analytics, ads, and upload-based features must never weaken that promise without clear disclosure and consent.

# Photo Chrono Renamer

## Goal

A private, browser-based utility for putting a batch of photos in chronological order and giving them clear, consistent names. Files are processed locally; nothing is uploaded.

## First release

- Choose a folder of images from the command line or the browser page.
- Read EXIF DateTimeOriginal when available, then similar EXIF/XMP dates, then file birth time, then the modification time. The browser page can see the modification time only.
- Preview the proposed name for every image. The command line prints this plan and does not rename unless `--apply` is passed.
- Rename files in the selected folder. Names that already exist get `_2`, `_3`, and so on instead of being overwritten.
- Export a rename plan from the browser as CSV.

## Naming format

`YYYY-MM-DD_HH-MM-SS.ext`

`YYYY-MM-DD_HH-MM-SS_2.ext` when another file already uses that name.

## Deployment

This is a static site: deploy the repository directly through Vercel or GitHub Pages. No server, database, or build step is required.

## Commercial direction

Keep the core rename workflow free. Validate demand through public use before building paid capabilities, then offer advanced batch workflows as a paid upgrade. The free tool's local-only processing is the main trust and marketing advantage; analytics, ads, and upload-based features must never weaken that promise without clear disclosure and consent.

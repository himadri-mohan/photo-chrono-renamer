# Photo Chrono Renamer

Sort a folder of photos by capture time and rename them to consistent chronological filenames. Nothing is uploaded.

```text
YYYY-MM-DD_HH-MM-SS.ext
YYYY-MM-DD_HH-MM-SS_2.ext
```

The first photo for a timestamp keeps the plain name. Later photos that would use the same name get `_2`, `_3`, and so on. Existing files are never overwritten.

## Time source

1. EXIF `DateTimeOriginal`
2. EXIF `DateTimeDigitized`
3. XMP `DateTimeOriginal` or `CreateDate`
4. EXIF `DateTime`
5. File birth (creation) time, when the filesystem provides one
6. File modification time

Supported types: jpg, jpeg, png, heic, heif, webp, tif, and tiff. Only files directly in the selected folder are renamed.

## Command line

Requires Node.js 18 or newer. There is no install step.

```bash
node cli.js ./photos
node cli.js ./photos --apply
```

The first command prints a before/after mapping and does not change files. Add `--apply` to rename. Run `node cli.js --help` for the short usage text.

```bash
npm test
```

## Browser

Open `index.html` in Chrome or Edge, or serve this folder with any static file server. Choose a folder, review the plan, then rename or download the plan as CSV.

The page reads the same EXIF dates as the command-line tool. Browsers do not expose file birth time, so photos without EXIF use the file's modified time. Renaming in place uses the File System Access API (Chrome or Edge). Other browsers can still preview a plan and download it.

## Deploy with GitHub and Vercel

1. Create an empty GitHub repository named `photo-chrono-renamer`.
2. From this project folder, publish the code:

   ```bash
   git init
   git add .
   git commit -m "Initial Photo Chrono Renamer"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/photo-chrono-renamer.git
   git push -u origin main
   ```

3. In [Vercel](https://vercel.com/new), select **Add New → Project**, import the GitHub repository, and choose **Deploy**. Leave the framework preset as **Other** and do not set a build command or output directory.
4. Vercel will give you a public `vercel.app` address and redeploy every push to `main`. Add a custom domain later from **Project → Settings → Domains**.

`vercel.json` supplies conservative browser-security headers. The app has no backend or environment variables.

## Monetization

The useful first version should stay free and frictionless. Ads only become worthwhile with meaningful traffic, and third-party ad scripts reduce the privacy advantage of a local-only photo tool. A more credible early path is:

1. Publish the free tool and write focused landing-page copy for searches such as “rename photos by date” and “chronological photo renamer”.
2. Add an optional paid **Pro** feature set after validating interest: custom naming templates, duplicate detection, recursive folders, and ZIP export. Use a payment provider such as Lemon Squeezy or Stripe; this requires a small backend or hosted checkout.
3. Add a transparent “Support this project” link (Ko-fi/GitHub Sponsors) before advertising. It preserves the no-upload promise and is easy to remove or change.

Before adding analytics, advertising, affiliate links, or payments, publish a Privacy Policy and any cookie/consent notice required where you operate. Do not claim files stay local if a future feature uploads them.

## Browser support

Folder selection and in-place renaming require the File System Access API (Chrome or Edge). Other browsers can still preview a plan and download it as CSV.

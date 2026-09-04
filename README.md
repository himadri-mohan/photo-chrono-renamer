# Photo Chrono Renamer

A privacy-first browser tool for sorting and renaming photos chronologically.

## Run locally

Open `index.html` in a modern browser, or serve the directory with any static-file server.

## Use it

1. Choose **Select photo folder**.
2. Review the chronological rename plan.
3. Choose **Rename files** to apply it, or **Download plan** for a CSV record.

Photos stay on your computer. Capture times are read from image EXIF data where possible, then fall back to each file's modified date.

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

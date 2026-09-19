# Swap the social share card to the homepage portrait

## Problem
When the site is texted or shared, the link preview shows the generic Lovable placeholder image. `index.html` currently points `og:image` and `twitter:image` at `https://lovable.dev/opengraph-image-p98pqg.png`.

## Goal
The social card should show the smiling-actor portrait already featured on the homepage (the "Babe you got this" photo, supplied in this chat).

## Changes

1. **Create a share-sized copy of the portrait**
   - Social crawlers expect a landscape 1200x630 image; the portrait is vertical, so it needs a center crop (framed on her face/shirt) rather than being used as-is.
   - Produce `public/og-image.jpg` (1200x630, compressed to a few hundred KB) from the uploaded photo.

2. **Update `index.html` head tags**
   - `og:image` and `twitter:image` → `https://actsolo.ai/og-image.jpg` (absolute URL, required by crawlers).
   - Add `og:image:width` (1200) and `og:image:height` (630).
   - Leave the existing title/description tags untouched.

## Notes
- The change only reaches the live URL after the project is republished — the live site serves the last published build.
- After publishing, texting apps may still show the old card until their caches refresh (LinkedIn/X re-scrape on their own schedule); I'll confirm the tags are live with a curl check after publish.

## Verification
- File exists at the right size/weight; `index.html` tags updated; after publish, `curl https://actsolo.ai/` shows the new `og:image` URL.

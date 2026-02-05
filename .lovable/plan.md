
# Plan: Add Google Tag Manager Across All Pages

## Overview
This plan adds Google Tag Manager (GTM) to your ActSolo.AI website. Since this is a React single-page application (SPA), we only need to add GTM in **one place** — the `index.html` file — and it will automatically track all pages/routes.

## Why This Approach is Most Efficient

Since Vite/React apps have a single `index.html` entry point that loads the entire application, adding the GTM script there ensures:
- **One-time setup** — no need to modify multiple files
- **Covers all routes** — Landing, Auth, Practice, Help, etc. are all covered
- **Loads first** — script runs before React even mounts
- **Future-proof** — new pages automatically get tracking

## Implementation

### Step 1: Add GTM Script to `index.html`

Insert the GTM script immediately after the opening `<head>` tag (as high as possible per Google's recommendation):

```text
┌─────────────────────────────────────────┐
│ index.html                              │
├─────────────────────────────────────────┤
│ <!DOCTYPE html>                         │
│ <html lang="en">                        │
│   <head>                                │
│     <!-- GTM Script HERE (line 4) -->   │
│     <meta charset="UTF-8" />            │
│     ...rest of head...                  │
│   </head>                               │
│   <body>                                │
│     ...                                 │
│   </body>                               │
│ </html>                                 │
└─────────────────────────────────────────┘
```

### What Will Be Added

The exact GTM snippet you provided:

```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MJ5884V5');</script>
<!-- End Google Tag Manager -->
```

## Optional: GTM NoScript Fallback

Google also recommends adding a `<noscript>` fallback in the `<body>` for users with JavaScript disabled. If you'd like, I can add this as well:

```html
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MJ5884V5"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
```

## Summary of Changes

| File | Change |
|------|--------|
| `index.html` | Add GTM script after `<head>` tag (line 4) |
| `index.html` | (Optional) Add GTM noscript after `<body>` tag |

## After Implementation

Once approved and deployed, you can:
1. Configure Google Analytics 4 via GTM
2. Add PostHog tracking via GTM
3. Set up custom events, conversion tracking, etc.
4. Verify installation via [GTM Preview Mode](https://tagmanager.google.com/) or the Tag Assistant browser extension

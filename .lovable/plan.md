

# Plan: Fix Terms Page Text Readability

## Problem
The Terms and Conditions page has headings (e.g., "1. Acceptance of Terms") and link text appearing white/invisible. This is caused by the `.prose` CSS class in `index.css` which applies `text-foreground` to headings -- in dark mode, `--foreground` is a light color that can override the explicit `text-gray-900` classes. Additionally, the `text-primary` on the contact link can also resolve to white in certain contexts.

## Solution
Remove the `prose` wrapper class entirely from the Terms page (it's not needed here) and ensure all text uses hardcoded dark colors that won't be affected by theme variables. This guarantees readability on the light `#FFFDF9` background regardless of device, browser, or theme setting.

## Changes

### File: `src/pages/Terms.tsx`

1. **Remove `prose` class** from the content wrapper `div` (line 23) -- change `prose max-w-none space-y-6` to just `max-w-none space-y-6`. The `prose` class applies theme-aware color overrides that conflict with the hardcoded light background.

2. **Fix contact link color** (line 64) -- change `text-primary` to `text-blue-600` so it stays a readable blue link color regardless of theme.

These two changes ensure every piece of text on the page uses explicit gray/dark colors (`text-gray-900`, `text-gray-600`, `text-gray-500`) that are always dark and readable against the `#FFFDF9` background.

## Why This Works
- The page already uses hardcoded `text-gray-900` on headings and `text-gray-600` on body text -- those are correct
- The `prose` class was overriding those with `text-foreground` (which is white in dark mode)
- Removing `prose` lets the explicit gray classes take effect
- Changing `text-primary` to `text-blue-600` prevents the link from turning white


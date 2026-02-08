

# Plan: Fix Privacy Page Text Readability

## Problem
Same issue as the Terms page — the Privacy page uses the `prose` CSS class on its content wrapper (line 25), which applies `text-foreground` to headings via the global styles in `index.css`. In dark mode, `--foreground` resolves to a light/white color, overriding the explicit `text-gray-900` classes and making headings invisible against the light `#FFFDF9` background. The contact link also uses `text-primary` which can turn white.

## Changes

### File: `src/pages/Privacy.tsx`

1. **Remove `prose` class** from the content wrapper `div` (line 25) — change `prose max-w-none space-y-6` to `max-w-none space-y-6`.

2. **Fix contact link color** (line 66) — change `text-primary` to `text-blue-600` so the link stays readable.

These are the exact same fixes we applied to the Terms page. The explicit `text-gray-900`, `text-gray-600`, and `text-gray-500` classes already on the elements will take effect once the `prose` override is removed.


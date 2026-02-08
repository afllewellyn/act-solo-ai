
# Fix: Force Black Text in Contact Form Fields

## Problem
The text typed into the Name, Email, and Message fields appears white (invisible against the white background), making it unreadable on some devices and screens.

## Root Cause
The Input and Textarea components inherit their text color from the CSS variable `--foreground`, which can resolve to a light color depending on theme context. The fields have `bg-white` set explicitly, but no explicit text color override, so the text can end up white-on-white.

## Fix
Add `text-gray-900` to the `className` of each Input and Textarea on the Contact page. This forces the typed text to be consistently dark/black regardless of theme variables or device rendering.

### File: `src/pages/Contact.tsx`

Three changes, all adding `text-gray-900` to existing class strings:

1. **Name Input (line 100)**: Change `className="bg-white border-gray-300"` to `className="bg-white border-gray-300 text-gray-900"`

2. **Email Input (line 113)**: Change `className="bg-white border-gray-300"` to `className="bg-white border-gray-300 text-gray-900"`

3. **Message Textarea (line 126)**: Change `className="bg-white border-gray-300"` to `className="bg-white border-gray-300 text-gray-900"`

No other files need changes. This is a targeted, minimal fix that ensures consistent black text across all devices and screens.

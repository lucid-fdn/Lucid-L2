# CSS Isolation Implementation - Industry Standard

## ✅ Implementation Complete

This document describes the industry-standard CSS isolation architecture implemented for the Lucid browser extension, following patterns used by Notion, Grammarly, Loom, and other major extensions.

---

## 🎯 Problem Solved

**Before:** The extension's `globals.css` with `@tailwind base` was leaking styles into host pages (like ChatGPT), causing:
- Changed body background/colors
- Modified scrollbars across entire page
- Border color overrides on all elements
- CSS variable pollution

**After:** Clean separation between isolated contexts (popup) and content script contexts (sidebar).

---

## 📁 New Architecture

### Separate Tailwind Configurations

#### 1. `tailwind.popup.config.js` - For Isolated Contexts
**Used by:** popup, auth, bridge
- ✅ Full Tailwind with `@tailwind base`
- ✅ Preflight enabled
- ✅ No prefix needed
- ✅ Safe to use global styles

#### 2. `tailwind.content.config.js` - For Content Scripts
**Used by:** sidebar (injected into host pages)
- ❌ NO `@tailwind base` (preflight disabled)
- ✅ Prefix: `tw-` for all utilities
- ✅ Important: `.lucid-extension` for specificity
- ✅ Scoped animations and variables

### CSS Files

#### 1. `src/styles/globals.css` - Isolated Contexts Only
- Used by: popup, auth, bridge
- Contains: `@tailwind base`, global resets, CSS variables
- Safe to use `:root`, `body`, `*` selectors

#### 2. `src/styles/content-script.css` - Content Scripts Only
- Used by: sidebar
- Contains: `@tailwind components`, `@tailwind utilities` (NO base)
- All styles scoped under `.lucid-extension`
- Custom resets only affect extension elements

---

## 🔧 Build Configuration

### PostCSS Config (`postcss.config.js`)
Automatically switches Tailwind config based on `BUILD_TARGET`:
- `sidebar` → uses `tailwind.content.config.js`
- Others → uses `tailwind.popup.config.js`

### Vite Config (`vite.config.ts`)
Unchanged - still builds separate targets via `BUILD_TARGET` env variable

### Build Scripts (`package.json`)
Unchanged - still uses:
```bash
npm run build:popup    # Uses popup config
npm run build:sidebar  # Uses content config
npm run build:auth     # Uses popup config
npm run build:bridge   # Uses popup config
```

---

## 🎨 CSS Class Strategy

### Content Script (Sidebar)

**Before:**
```tsx
<div className="flex bg-blue-500">
```

**After (with tw- prefix):**
```tsx
<div className="tw-flex tw-bg-blue-500">
```

**Or use direct Lucid colors:**
```tsx
<div className="tw-flex tw-bg-lucid-primary">
```

### Scoped Custom Styles

All custom styles must be scoped:

```css
/* ❌ BAD - affects host page */
.my-component {
  color: white;
}

/* ✅ GOOD - scoped to extension */
.lucid-extension .my-component {
  color: white;
}
```

---

## 📊 Comparison

### Isolated Context (Popup)

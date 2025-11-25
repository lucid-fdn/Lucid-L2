# Tailwind CSS + shadcn/ui Migration Guide

## Overview

This document details the migration of the Lucid L2™ browser extension UI from custom CSS to Tailwind CSS + shadcn/ui components.

## Migration Status

### ✅ Phase 1: Setup & Configuration (COMPLETED)

#### Dependencies Installed
- `tailwindcss` - Utility-first CSS framework
- `postcss` & `autoprefixer` - CSS processing
- `tailwindcss-animate` - Animation utilities
- `class-variance-authority` - Component variant management
- `clsx` & `tailwind-merge` - Class name utilities
- `lucide-react` - Icon library
- `@radix-ui/react-slot` - Composition primitive
- `@radix-ui/react-tabs` - Tabs component
- `@radix-ui/react-separator` - Separator component

#### Configuration Files Created
1. **tailwind.config.js** - Tailwind configuration with:
   - Dark mode support (class-based)
   - Custom color palette (purple/blue theme)
   - Border radius variables
   - Animation keyframes
   - Content paths for purging

2. **postcss.config.js** - PostCSS configuration

3. **src/lib/utils.ts** - Utility function for merging Tailwind classes

4. **src/styles/globals.css** - Global styles with:
   - Tailwind directives
   - CSS custom properties (design tokens)
   - Base styles
   - Custom scrollbar styling
   - Animation definitions

#### shadcn/ui Components Created
Located in `src/components/ui/`:

1. **button.tsx** - Button component with variants:
   - default, destructive, outline, secondary, ghost, link
   - Sizes: default, sm, lg, icon

2. **card.tsx** - Card components:
   - Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter

3. **badge.tsx** - Badge component with variants:
   - default, secondary, destructive, outline

### 🚧 Phase 2: Additional Components (TODO)

Still need to create:

1. **Input Component**
```tsx
// src/components/ui/input.tsx
```

2. **Textarea Component**
```tsx
// src/components/ui/textarea.tsx
```

3. **Tabs Component** (using @radix-ui/react-tabs)
```tsx
// src/components/ui/tabs.tsx
```

4. **Separator Component** (using @radix-ui/react-separator)
```tsx
// src/components/ui/separator.tsx
```

5. **Progress Component**
```tsx
// src/components/ui/progress.tsx
```

### 🚧 Phase 3: Popup Migration (TODO)

Need to convert `popup.html` and `popup.js` to React:

#### Current Structure
```
popup.html (Static HTML)
├── Header
├── Quick Stats Banner
├── Tab Navigation
└── Tab Content
    ├── Dashboard Tab
    ├── Activity Tab
    └── Settings Tab
```

#### Target Structure
```tsx
// src/components/Popup.tsx
export function Popup() {
  return (
    <div className="w-[420px] min-h-[600px] max-h-[700px] bg-gradient-to-br from-slate-950 to-slate-900">
      <Header />
      <QuickStats />
      <Tabs>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <DashboardTab />
        </TabsContent>
        {/* ... */}
      </Tabs>
    </div>
  )
}
```

#### Component Breakdown

**Dashboard Tab Components:**
- WalletConnectionCard
- AIInteractionCard  
- QuickActionsGrid

**Activity Tab Components:**
- DailyTasksList
- RecentActivityList
- ChatGPTCapturesList
- ActiveEventsList

**Settings Tab Components:**
- NotificationSettings
- DataManagement
- InformationLinks

### 🚧 Phase 4: Build Configuration (TODO)

Update `vite.config.ts` to:
1. Import and process global CSS
2. Ensure Tailwind is compiled
3. Configure for popup, auth, and bridge builds

Example modification needed:
```typescript
// Add to each build target
import '../src/styles/globals.css'
```

### 🚧 Phase 5: Testing & Validation (TODO)

Test checklist:
- [ ] All UI components render correctly
- [ ] Wallet connection flow works
- [ ] AI interaction features function
- [ ] Tab navigation is smooth
- [ ] Settings persist correctly
- [ ] Responsive at 420x600px
- [ ] Dark theme works
- [ ] Animations are smooth
- [ ] Extension size is acceptable

## Design System

### Color Palette

The design uses HSL color format for easy theming:

```css
--background: 222 47% 11%     /* Dark slate background */
--foreground: 210 40% 98%     /* Light text */
--primary: 262 83% 58%        /* Purple/indigo */
--secondary: 217 91% 60%      /* Blue */
--muted: 217 33% 17%          /* Muted backgrounds */
--destructive: 0 84% 60%      /* Red for errors */
```

### Typography

- Font: System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto...`)
- Base size: 13px (text-sm in Tailwind)
- Weights: 400 (normal), 600 (semi-bold), 700 (bold)

### Spacing

Using Tailwind's default spacing scale:
- Compact: `p-2` (8px)
- Default: `p-4` (16px)
- Spacious: `p-6` (24px)

### Border Radius

- Small: `rounded-sm` (4px)
- Default: `rounded-md` (6px)
- Large: `rounded-lg` (8px)
- Full: `rounded-full` (9999px)

## Migration Best Practices

### 1. Component-First Approach

Build UI from shadcn/ui components:
```tsx
// ✅ Good
<Button variant="primary" size="lg">Connect Wallet</Button>

// ❌ Avoid
<button className="btn btn-primary btn-lg">Connect Wallet</button>
```

### 2. Utility Classes Over Custom CSS

Use Tailwind utilities:
```tsx
// ✅ Good
<div className="flex items-center gap-2 p-4 bg-card rounded-lg border">

// ❌ Avoid
<div className="custom-container">
```

### 3. Responsive Design

Extension is fixed at 420x600px, but components should be flexible:
```tsx
<div className="w-full max-w-[420px]">
```

### 4. Dark Mode by Default

All components use dark mode colors from design tokens:
```tsx
// Colors automatically use dark theme
<Card className="bg-card text-card-foreground">
```

### 5. Icon Usage

Replace emojis with Lucide icons:
```tsx
import { Wallet, Sparkles, Settings } from 'lucide-react'

<Button>
  <Wallet className="w-4 h-4" />
  Connect Wallet
</Button>
```

## File Structure

```
browser-extension/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   └── ... (more to add)
│   │   ├── Popup.tsx        # Main popup component (TODO)
│   │   ├── Header.tsx       # Header component (TODO)
│   │   └── ... (more components)
│   ├── lib/
│   │   └── utils.ts         # Utility functions
│   ├── styles/
│   │   └── globals.css      # Global styles + Tailwind
│   ├── popup.tsx            # Popup entry point (TODO)
│   ├── auth.tsx             # Auth entry point
│   └── bridge.tsx           # Bridge entry point
├── tailwind.config.js
├── postcss.config.js
└── vite.config.ts
```

## Next Steps

1. **Create remaining UI components** (Input, Textarea, Tabs, etc.)
2. **Build Popup component structure** in React
3. **Migrate dashboard, activity, and settings tabs** to React components
4. **Update Vite config** to import global CSS
5. **Test thoroughly** in browser extension environment
6. **Build and verify** bundle size
7. **Update documentation** with any API changes

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Lucide Icons](https://lucide.dev)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)

## Notes

- Keep existing JavaScript files (`popup.js`, `sidebar.js`, etc.) until React migration is complete
- Old CSS files (`popup-styles.css`, `sidebar-styles.css`) can be archived after migration
- Maintain backward compatibility with existing background.js and content.js
- Ensure manifest.json is updated if needed for new build outputs

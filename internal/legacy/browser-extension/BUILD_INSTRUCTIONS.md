# Build Instructions

Due to Vite limitations with multiple IIFE bundles, you need to build each file separately:

## Step 1: Build auth.js (DONE ✅)
- The current vite.config.ts is set to `BUILD_TARGET = 'auth'`
- You already ran `npm run build` and got `dist/auth.js`

## Step 2: Build bridge.js (TODO ⚠️)
1. Open `vite.config.ts`
2. Change line 5 from:
   ```typescript
   const BUILD_TARGET = 'auth'; // Change to 'bridge' for second build
   ```
   to:
   ```typescript
   const BUILD_TARGET = 'bridge'; // Change to 'bridge' for second build
   ```
3. Run `npm run build` again
4. This will create `dist/bridge.js`

## Final Result
You should have both files:
- `dist/auth.js`
- `dist/bridge.js`

Then you can test your Chrome extension!

// PostCSS config that switches Tailwind config based on build target
const BUILD_TARGET = process.env.BUILD_TARGET || 'popup';

// Use content-script config for sidebar (content script context)
// Use popup config for popup, auth, bridge (isolated contexts)
const tailwindConfig = BUILD_TARGET === 'sidebar' 
  ? './tailwind.content.config.js'
  : './tailwind.popup.config.js';

export default {
  plugins: {
    tailwindcss: { config: tailwindConfig },
    autoprefixer: {},
  },
}

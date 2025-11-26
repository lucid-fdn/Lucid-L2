/** @type {import('tailwindcss').Config} */
// Tailwind config for CONTENT SCRIPTS (sidebar) - Matches LucidMerged but SCOPED
// CRITICAL: NO preflight to prevent affecting host page styles
export default {
  darkMode: 'class',
  content: [
    "./src/sidebar.tsx",
    "./src/components/**/*.{ts,tsx}",
  ],
  
  // PREFIX all Tailwind utilities to avoid conflicts with host page
  prefix: 'tw-',
  
  // Make Tailwind utilities win specificity battles
  important: '.lucid-extension',
  
  theme: {
    extend: {
      // LucidMerged Design System Colors (same as main app)
      colors: {
        white: '#F8F9FA',
        
        // Lucid Flows Design Tokens
        porcelain: '#F7F8FA',
        mist: '#ECEEF2',
        'mist-dark': '#D1D5DB',
        graphite: {
          400: '#9CA3AF',
          600: '#5E6673',
        },
        ink: {
          900: '#14191F',
        },
        lucid: {
          DEFAULT: '#0B84F3',
          purple: '#8B5CF6',
          light: '#3B82F6',
        },
        
        // Legacy compatibility colors
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      
      // Typography - Inter font (LucidMerged standard)
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      
      // 8pt Spacing Grid (LucidMerged standard)
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
        20: '80px',
      },
      
      // Apple-style Shadows (LucidMerged standard)
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px rgba(0, 0, 0, 0.07)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
        '2xl': '0 25px 50px rgba(0, 0, 0, 0.25)',
      },
      
      // Motion Timing (LucidMerged standard) 
      transitionDuration: {
        120: '120ms',
        200: '200ms',
        240: '240ms',
        400: '400ms',
      },
      
      // Apple Easing
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      
      // Animations (LucidMerged standard)
      keyframes: {
        pulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--pulse-color)" },
          "50%": { boxShadow: "0 0 0 8px var(--pulse-color)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - var(--gap)))" },
        },
        "marquee-vertical": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(calc(-100% - var(--gap)))" },
        },
      },
      animation: {
        pulse: "pulse var(--duration) ease-out infinite",
        marquee: "marquee var(--duration) linear infinite",
        "marquee-vertical": "marquee-vertical var(--duration) linear infinite",
      },
    },
  },
  
  // DISABLE preflight - critical for content scripts!
  corePlugins: {
    preflight: false,
  },
  
  plugins: [require("tailwindcss-animate")],
}

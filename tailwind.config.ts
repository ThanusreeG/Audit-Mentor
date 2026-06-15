import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        paper: "#080A10",
        surface: "#11151E",
        surfaceElevated: "#181F2C",
        panel: "#11151E",
        panel2: "#181F2C",
        line: "#2A3140",
        ink: "#F3F4F6",
        muted: "#A7B0BF",
        accent: "#22D3EE",
        accent2: "#34D399",
        success: "#34D399",
        warning: "#FBBF24",
        danger: "#F87171",
        critical: "#EF4444",
        high: "#F97316",
        medium: "#FBBF24",
        low: "#60A5FA",
        info: "#9CA3AF"
      }
    }
  },
  plugins: []
};

export default config;

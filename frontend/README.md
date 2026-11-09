# Frontend foundation

React + TypeScript + Vite + CSS Modules. Requires Node 24.

```sh
cd frontend
npm ci
npm run dev
```

Checks: `npm test`, `npm run typecheck`, `npm run build`.
The default page is a component showcase (FE003) displaying basic UI controls and comparison widgets.

## Design sources
Figma file: tUMuB5lsAJ9gBPuQ6bJIQB.
Page: 1805:1587. Component kit: 2608:2201.
Desktop results: 2609:2229. Mobile: 2611:2452.

- Exact Figma variable colors and 16px radius: src/app/styles/tokens.css.
- Spacing, font sizes, glass effects: derived from the frames.
- Focus ring, spacing scale and fluid width bounds: implementation conventions.
- Icon SVGs in public/assets/icons are original Figma exports; preserve their root dimensions.
- Inter Variable and JetBrains Mono Variable are self-hosted through Fontsource packages.
  OFL license copies are in public/assets/fonts; Vite copies fonts and licenses into the build.
- Shared global styles include dark color scheme, keyboard focus and reduced motion.

No model calls, comparison interactions or backend changes are included in this step.



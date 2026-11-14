# Frontend foundation

React + TypeScript + Vite + CSS Modules. Requires Node 24.

```sh
cd frontend
npm ci
npm run dev
```

Vite reads shared environment files from the repository root (`../.env`), next to `.env.example`. Only `VITE_` variables are exposed through `import.meta.env`; keep `LLM_API_KEY` without that prefix and on the backend. The comparison page uses the backend API and requires no public environment variables. Restart the dev server after changing env files.

Checks: `npm test`, `npm run typecheck`, `npm run build`.
The default page is the API comparison page with an empty conversation. The component showcase remains at `/?view=components`. Run the backend on port 3000 in a second terminal (`npm run dev --prefix backend` from the repo root); Vite proxies `/api` to it. If the backend port changes, update the proxy target. Production needs a same-origin reverse proxy for `/api`; Vite preview is not a production API proxy. Browser tests (`npm run test:browser`) use their own loopback HTTP stub, never BTC.

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

FE006 is verified offline; browser-to-BTC live acceptance has not been run. Streaming, Stop, token/pricing and real reasoning are deferred.

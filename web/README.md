# SentinelAPI web: drop-in source

1. `npx -y create-vite@latest web -- --template react-ts && cd web`
2. `npm i tailwindcss @tailwindcss/vite react-router-dom` (+ `npm i -D @vitejs/plugin-react` if missing)
3. Copy this folder's `src/` and `vite.config.ts` over the scaffold (delete the template's App.css/assets).
4. Set the proxy target in `vite.config.ts` to your backend port.
5. Run `npm run dev`. To build against the fixture: put it at `src/fixtures/scan-result.sample.json` and run `VITE_USE_FIXTURE=true npm run dev`.

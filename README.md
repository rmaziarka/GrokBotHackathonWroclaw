# GrokBot Hackathon Wrocław

Minimal [Vite](https://vite.dev) + React + TypeScript app on [Void](https://void.cloud), ready to deploy to Cloudflare. The product idea is not decided yet. The home page is a server loader, and `GET /api/hello` is a server route, so the full-stack wiring is already in place.

## Run locally

Install [Bun](https://bun.sh), then from this directory:

```sh
bun install
bun run dev
```

Open http://localhost:5173. The greeting comes from `pages/index.server.ts`. http://localhost:5173/api/hello returns the same greeting as JSON.

`bun run build` produces the production build. `bun run typecheck` runs `tsc --noEmit` (run `bun install` first so `postinstall` can generate `.void/`).

## First deploy

Deploy from your own machine. This repository has no Cloudflare credentials, and the scaffold skipped deployment setup (`void init --deploy none`).

1. Install dependencies if you have not already:

   ```sh
   bun install
   ```

2. Sign in to Cloudflare. Void opens a browser for OAuth. If the browser does not open, use the URL and code printed in the terminal:

   ```sh
   bunx void cloudflare login
   ```

   Check the session:

   ```sh
   bunx void cloudflare status
   ```

3. Deploy to your Cloudflare account. The first deploy has to name the platform because no target was saved during setup. If the login above was skipped, this command opens the browser itself. If you have more than one account, pick one when asked:

   ```sh
   bunx void deploy --platform cloudflare
   ```

   Void builds the app, provisions what it needs, and prints the `workers.dev` URL.

4. Later deploys use the saved target:

   ```sh
   bun run deploy
   ```

   That script runs `void deploy`.

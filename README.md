# Spiżarnia

Shared food dashboard for one household, built on the existing Void 1.6.2 + Vite + React app. Fridge inventory, saved meal proposals, and the shopping list live in Cloudflare D1. The browser and a remote MCP client use the same tables.

This is one household, not a multi-tenant product. There are no user accounts. A single server-side `HOUSEHOLD_TOKEN` is the access gate. Anyone who has that token can read and change the household data.

The page does not generate meals and does not call a model. A Grok Bot does the reasoning and writes the result through MCP tools. Promotions and live shop prices are not implemented.

## Local development

Install [Bun](https://bun.sh), then from this directory:

```sh
bun install
```

Void reads only a root `.env` file. Other dotenv names, including `.env.example`, stop the build. Create `.env` and put a random token of at least 16 characters in it:

```sh
openssl rand -base64 32
```

```ini
HOUSEHOLD_TOKEN=paste-the-generated-value
```

Shorter values, including an empty one, are treated as not configured. Private routes and MCP then return `503` with `household_access_unconfigured`. `.env` stays untracked. Do not prefix the token with `VITE_`; that would embed it in the browser bundle.

Apply the checked-in D1 migrations and start the app:

```sh
bunx void db migrate
bun run dev
```

The dev server also applies pending local migrations when it starts. Open http://localhost:5173, enter the token once, and use the dashboard. The token is posted in the JSON body. The response sets an `HttpOnly` `SameSite=Lax` session cookie. The cookie is an HMAC of the token, not the token itself. Do not put the token in a URL.

`bun run build` builds the Worker. `bun run typecheck` runs `tsc --noEmit`. `bun test` runs validation, auth, and the local D1/MCP integration tests. Those tests start Vite themselves and do not need a remote Cloudflare account.

## Data

Expiry is a calendar date `YYYY-MM-DD` in `Europe/Warsaw`, not a timestamp. "Today" and expiry labels use that timezone. Stored instants such as `createdAt` are UTC ISO strings.

Example products are optional. The button **Wstaw przykładowe produkty** inserts four rows whose names end in `(przykład)`. Clicking it again does not duplicate them.

## HTTP API

Public:

- `GET /api/hello` returns the original greeting and no household data.
- `GET /api/session` returns `{ configured, authenticated }`.
- `POST /api/session` with `{ "token" }` starts the browser session.
- `DELETE /api/session` clears the cookie.

Private (browser cookie or `Authorization: Bearer <HOUSEHOLD_TOKEN>`):

- `GET/POST /api/inventory`
- `PATCH /api/inventory/:id`
- `POST /api/inventory/:id/consume`
- `POST /api/inventory/examples`
- `GET/POST /api/meals`
- `GET/POST /api/shopping`
- `PATCH /api/shopping/:id`

`401` means missing or wrong access. `400` means invalid JSON or fields. A query parameter named `token`, `access_token`, `api_key`, or `household_token` is rejected with `400`. Cookie-authenticated writes from another `Origin` are rejected with `403`.

## Remote MCP

Streamable HTTP is served by `@modelcontextprotocol/server` at `/mcp`. The official handler answers the current stateless protocol and 2025-era stateless clients. MCP accepts only the bearer token. The browser session cookie is not enough.

After deploy, the URL is:

```text
https://<host-printed-by-void-deploy>/mcp
```

The pinned Worker name is `grokbot-hackathon-wroclaw`. Void prints the real `workers.dev` host; this repo does not hardcode the account subdomain.

Configure the bot with that URL and the header:

```text
Authorization: Bearer <HOUSEHOLD_TOKEN>
```

Send `Accept: application/json, text/event-stream` and `Content-Type: application/json`. Do not put the token in the URL.

Tools:

| Tool | Effect |
| --- | --- |
| `list_inventory` | Read the fridge. Optional `includeConsumed`, `expiringWithinDays`. |
| `add_inventory_item` | Add a product. |
| `update_inventory_item` | Edit an active product. `expiresOn: null` clears the date. |
| `consume_inventory_item` | Mark a product consumed. |
| `list_meal_suggestions` | List saved proposals. |
| `save_meal_suggestion` | Save a proposal and ingredients. |
| `list_shopping_items` | Read the shopping list. |
| `add_shopping_item` | Add a shopping item. |
| `update_shopping_item` | Edit or check a shopping item. |

### Bot roles

Paste these as the bot instructions. They are not provisioned by this app.

**Lodówka.** You keep one household fridge in Poland. Read `list_inventory` before you answer. Add, update, or mark items consumed only when the person says that happened. `expiresOn` is a Warsaw calendar date (`YYYY-MM-DD`). Do not invent shop prices.

**Kuchnia.** Read the fridge, decide a meal yourself, and save it with `save_meal_suggestion`, including ingredients. The web app will not generate the meal for you.

**Zakupy.** Read the fridge and shopping list. Add missing items with `add_shopping_item`. Check an item only when the person says they bought it.

**Koordynator.** Read inventory, meals, and shopping. Write decisions back through those same tools. There is no second database.

**Promocje.** Not available. Do not scrape shops or invent current prices.

## Deploy

Do this from your own machine. This repository has no Cloudflare API token, and these steps are not run by the app.

1. `bun install`
2. `bunx void cloudflare login`, then `bunx void cloudflare status`
3. Set the production secret without committing it. A prompt or stdin avoids leaving it in shell history:

   ```sh
   bunx void secret put HOUSEHOLD_TOKEN
   ```

4. Deploy. Void builds the Worker, provisions the D1 database on the pinned account, applies `db/migrations/`, and prints the URL:

   ```sh
   bun run deploy
   ```

   Later deploys use the same command. `void.lock.json` already pins the Worker name and Cloudflare account. Commit that file if a deploy records a new D1 id.

`void deploy` does not upload `.env`. Rollback does not undo a migration. For a bad migration, use the `void db restore` command printed before the migration, then fix the SQL before deploying again.

## Limits

- One shared token. No per-person login, OAuth, or household switcher.
- Changes show up after refresh. The page also polls every 8 seconds while it is visible.
- No meal model, receipt scanning, retailer prices, promotions, or webhooks.
- MCP is stateless. There is no server-sent session to resume.

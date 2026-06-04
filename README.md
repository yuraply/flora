# FloraLens

FloraLens is a small plant-identification PWA. Users upload a plant photo, and
the app asks an OpenRouter vision-capable model to identify the plant, explain
care needs, detect visible health issues, and suggest a relevant shopping search
term.

## Stack

- React + Vite + TypeScript
- Node.js + Express
- OpenRouter Chat Completions API
- SQLite via `better-sqlite3`
- Docker Compose for production-style deployment
- PWA support via `vite-plugin-pwa`

## Features

- Upload or capture a plant image.
- Compress images in the browser before upload.
- Return plant name, scientific name, care guidance, health status, treatment
  suggestions, fun facts, and an Ozon search query.
- Track request metrics, security events, system metrics, and OpenRouter
  token/cost usage in SQLite.
- Basic-auth protected admin APIs and dashboard.

## Local Setup

```powershell
npm install
Copy-Item .env.example .env
# Edit .env and add your own keys/passwords.
npm run dev
```

For the API server:

```powershell
node server.js
```

The Vite dev server proxies only frontend assets; the Express API is the
production API entry point.

## Environment

See [.env.example](.env.example). Do not commit a real `.env`.

Important variables:

- `OPENROUTER_API_KEY`: required for AI requests.
- `OPENROUTER_MODEL`: defaults to `google/gemini-2.5-flash-lite`.
- `ADMIN_USER`: admin dashboard username, defaults to `admin`.
- `ADMIN_PASSWORD`: required for admin routes.
- `DATA_DIR`: optional SQLite data directory, defaults to `./data`.

## Tests and Build

```powershell
npm test
npm run build
```

## Docker

```powershell
docker compose up -d --build
```

The Compose file binds the app to `127.0.0.1:20010` so it can sit behind a
reverse proxy.

## Deployment

Deployment is pull-based from the production server:

```powershell
.\scripts\deploy-flora.ps1 -HostName user@example.com
```

See [docs/deploy-flora.md](docs/deploy-flora.md) for details.


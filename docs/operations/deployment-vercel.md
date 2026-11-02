# Vercel multi-service deployment

The repository root `vercel.json` defines three services under one Vercel project:

| Service     | Root             | Framework | Public route                                    |
| ----------- | ---------------- | --------- | ----------------------------------------------- |
| `api`       | `apps/api`       | Express   | `/api/*`, `/auth/*`, `/health*`, `/socket.io/*` |
| `dashboard` | `apps/dashboard` | Vite      | Remaining paths (`/`)                           |
| `overlay`   | `apps/overlay`   | Vite      | `/overlay/*`                                    |

API, auth, health and Socket.IO rewrites are ordered before the overlay and dashboard catch-all rules. The overlay Vite build uses `/overlay/` as its asset base; dashboard and overlay clients use same-origin `/api` and `/socket.io` URLs by default. Local development keeps the existing localhost ports, and `?api=https://api.example.com` can override the API origin when needed.

## Bindings

There are no Vercel service bindings in this configuration. Dashboard and overlay requests to the API run in the browser, not in server-side functions, so the clients cannot use runtime-only binding variables. They reach the API through the public same-origin rewrites. The API does not make server-side requests to another Vercel service.

## API release gate

The API entrypoint exports its HTTP server for Vercel's Express runtime and does not open a separate listening port when `VERCEL=1`. Preview deployments can start the API using Vercel's `VERCEL_ENV=preview` marker. Production startup intentionally throws until authenticated streamer and overlay sessions are implemented. Keep production environment variables separate from Preview, enable Vercel Preview Deployment Protection before sharing a preview URL, and do not point Preview at production data. Twitch EventSub and the transactional outbox also have long-lived/background behavior that needs deployment validation for a serverless runtime.

Vercel WebSocket support is currently in beta. The `/socket.io/*` rewrite targets the API service so the overlay's realtime connection uses the shared domain; validate this against the project's Vercel plan and current runtime before relying on it for a live stream.

## Local Vercel development

Install the Vercel CLI, then run `vercel dev -L` from the repository root to exercise the multi-service routes. The regular `pnpm dev` workflow remains available for the current three-port local setup.

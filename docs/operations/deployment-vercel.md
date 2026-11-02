# Vercel deployment

The repository-level Vercel project deploys the dashboard as a static Vite site:

- Root Directory: repository root
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @sidequest/dashboard build`
- Output directory: `apps/dashboard/dist`

These settings are encoded in [`vercel.json`](../../vercel.json). Set Vercel's Node.js version to 22 to match the local prerequisite.

## Overlay project

Create a second Vercel project from the same repository with Root Directory `apps/overlay`. Use the Vite preset and build command `pnpm --filter @sidequest/overlay build`, and include workspace source files outside the app directory in the build. The output directory is `dist`.

## API and release status

The dashboard and overlay accept an API base URL through the `api` query parameter. For example, append `?api=https%3A%2F%2Fapi.example.com` to each deployed frontend URL. The API requires a long-running Node.js host, PostgreSQL, and correct `APP_ORIGINS` entries. It is not deployed by the Vercel static project. The API intentionally throws during production startup until authenticated streamer and overlay sessions are implemented. Keep deployments as previews until that gate is removed through the security acceptance work; frontend deployment alone does not make the service production ready.

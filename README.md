# OEM Brand Portfolio

An interactive overview of the OEM brands we supply — Stellantis, Volkswagen, Renault, Ford,
Mercedes Benz, IVECO, KIA and BOTT — and the vehicles under each brand that use our
**Crew Cab (CC)**, **Flex Cab (FC)** and **Partition Wall (PW)** products.

- **Brand map** — an interactive mind map (pan/zoom/drag) with brands branching out from the
  center and vehicles branching out from each brand.
- **Vehicle page** — photo gallery, CC/FC/PW product cards with supporting images, a drag-and-drop
  bugtracker board (Margin / Quality / Portfolio) and a list of other topics.
- **Bugtracker overview** — a leaderboard of vehicles ranked by open change requests, broken down
  by category, to spot which vehicles need the most attention.
- **Editing** is gated behind a single shared admin login (see below). Signed-out visitors get a
  read-only view of everything.

## Stack

- `server/` — Express + TypeScript + SQLite (`better-sqlite3`), image uploads via `multer`,
  single-admin-password auth issuing a JWT.
- `client/` — React + TypeScript + Vite, `@xyflow/react` for the mind map, `@dnd-kit` for the
  bugtracker board, plain CSS design tokens (light/dark aware).

## Getting started

```bash
npm run install:all      # installs server + client dependencies

cp server/.env.example server/.env
# then edit server/.env and set ADMIN_PASSWORD and JWT_SECRET

npm run dev               # runs the API on :4000 and the Vite dev server on :5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/uploads` to the backend.

On first run the API seeds the eight OEM brands with no vehicles — add vehicles, images and
bugtracker tickets once logged in.

## Production build

```bash
npm run build   # builds the client, then the server (dist/ folders)
npm start        # serves the API and the built client from one process on $PORT (default 4000)
```

## Environment variables (`server/.env`)

| Variable | Purpose |
|---|---|
| `PORT` | API port (default `4000`) |
| `ADMIN_PASSWORD` | Password that unlocks edit mode across the site |
| `JWT_SECRET` | Secret used to sign the admin session token |

Uploaded images are stored on disk under `server/uploads/` and the SQLite database lives at
`server/data/app.sqlite` — both are gitignored and persist only on the machine running the server.

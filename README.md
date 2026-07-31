# OEM Brand Portfolio

An interactive overview of the OEM brands we supply — Stellantis, Volkswagen,
Renault, Ford, Mercedes Benz, IVECO, KIA and BOTT — and the vehicles under each brand that use our
**Crew Cab (CC)**, **Flex Cab (FC)** and **Partition Wall (PW)** products.

The site has two pages open to everyone — **Slides** (the home page) and **Topics** — plus a
third, **Images**, that only appears once you're logged in, and a shared admin login that gates
every edit.

- **Slides** (home page) — purpose-built to be screenshotted straight into a weekly presentation:
  four fixed, PowerPoint-widescreen-ratio (16:9) rectangles, one per customer group —
  **Stellantis · KIA · IVECO**, **Volkswagen**, **Renault · Ford · Mercedes Benz**, and
  **Overall / Universal News** (any customer not in the first three). Inside each rectangle sits
  one tile per **vehicle + product segment** in that group (e.g. "K0 Crew Cab", "K0 Flex Cab" are
  separate tiles) — every segment a customer's vehicle takes always gets a tile, even with zero
  News this week, so its background photo and Product Changes box (below) stay in place. Every
  open **News** topic for a segment stacks inside its tile, and a tile with more topics in it grows
  larger than its neighbours in the same column, so busier segments stand out at a glance, while the
  customer order (Stellantis, KIA, IVECO, …) always reads left-to-right. Each tile carries its own
  background photo (uploaded from the Images page) and that customer's logo forced to white over
  it, so it reads clearly against the photo; a High-priority topic still gets its arrow marker. A
  **+** button next to the page title opens a quick-add form (customer, model — typing a new name
  creates that vehicle on the spot — product, title, and either a calendar week or **Long term**)
  so a topic can be logged straight from the presentation view, not just from Topics. Prev/Next
  arrows shift which 3-week window is being previewed (handy for checking next month's slides ahead
  of time) — a **Today** button appears once you've navigated away, to jump straight back. A topic
  marked **Long term** has no calendar week at all and stays on its tile every week, in every
  window, until it's marked complete. Every segment tile also carries a small **Product Changes**
  box at its bottom — five fillable Ph1–Ph5 count boxes, independent of News — and the
  Overall/Universal slide additionally carries one more Product Changes box of its own, at the very
  bottom of the slide, for counts that aren't tied to any one customer.
- **Topics** — an Excel-style table of every open **News** topic: Brand, Model, Product, News
  topic, Calendar week and a Long term checkbox, plus Mark-complete/Delete actions per row in edit
  mode. Every cell is editable in place. A row at the bottom adds a new topic the same way the
  Slides page's **+** button does — pick a customer, type a model, pick a product, and set either a
  calendar week or Long term.
- **Images** (edit mode only — hidden from the nav until you log in) — where brand logos and
  per-segment (vehicle + product) photos are uploaded. Those are the same images that show up as
  each Slides tile's background and each brand's logo overlay; keeping the upload controls off the
  Slides and Topics pages keeps both focused on the presentation and the topic list themselves.
- **Editing** is gated behind a single shared admin login (see below). Signed-out visitors get a
  read-only view of everything.

## Two ways to run this

| | Standalone build | Server-backed app |
|---|---|---|
| Setup | None — open one HTML file | `npm run dev` / a real deploy |
| Data | Saved in that browser only (IndexedDB) | Shared SQLite database |
| Use for | Demos, trying it out, a link to hand someone | Real day-to-day use by a team |

### Standalone build (no server, opens directly)

```bash
cd client
npm install
npm run build:standalone   # writes client/dist-standalone/index.html
```

Open `client/dist-standalone/index.html` directly in a browser, or host that single file
anywhere static files are served (it has no backend dependency at all). The eight OEM brands
are seeded automatically; everything you add is saved to that browser's IndexedDB and stays
there — it does not sync across devices or browsers. The admin password on this build is
**`PM`**.

Under the hood, `npm run build:standalone` swaps the real HTTP API client for
`client/src/api/localClient.ts`, an IndexedDB-backed implementation of the exact same
interface, and inlines the whole app (JS, CSS, seed data) into one `.html` file via
`vite-plugin-singlefile`. Routing uses `HashRouter` in this build specifically so a reload
never depends on server-side rewrite rules.

This repo's root `index.html` is exactly this standalone build, kept in sync by
`.github/workflows/deploy-pages.yml` so GitHub Pages always serves the latest version.

### Server-backed app (shared, persistent)

Stack: `server/` is Express + TypeScript + SQLite (`better-sqlite3`), single-admin-password auth
issuing a JWT. `client/` is React + TypeScript + Vite.

## Getting started

```bash
npm run install:all      # installs server + client dependencies

cp server/.env.example server/.env
# then edit server/.env and set ADMIN_PASSWORD and JWT_SECRET

npm run dev               # runs the API on :4000 and the Vite dev server on :5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

On first run the API seeds the eight OEM brands with no vehicles — add vehicles and topics once
logged in.

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

The SQLite database lives at `server/data/app.sqlite` and uploaded images (brand logos, per-segment
Slides background photos) are stored under `server/uploads/` — both are gitignored and persist
only on the machine running the server.

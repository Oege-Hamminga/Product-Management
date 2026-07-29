# OEM Brand Portfolio

An interactive, single-page overview of the OEM brands we supply — Stellantis, Volkswagen,
Renault, Ford, Mercedes Benz, IVECO, KIA and BOTT — and the vehicles under each brand that use our
**Crew Cab (CC)**, **Flex Cab (FC)** and **Partition Wall (PW)** products.

- **Topics sidebar** — a persistent right-hand panel with **High Priority Topics** and **This
  Week's News**, collapsed to a thin strip by default so it doesn't take up space until you open it
  (a toggle on its edge expands it, and remembers that choice across visits). Wide enough, once
  open, to show a topic's complete title plus its vehicle model, category (Margin/Quality/
  Portfolio/Other) and timing (BT code or CW date) without truncating anything. In edit mode, drag
  any topic card from the brand map straight onto a sidebar section to feature it there — dropping
  on High Priority sets its priority to High, dropping on This Week's News marks it as a news item
  tagged with the current calendar week. High Priority is capped at 5: if a drop would push it past
  that, a picker lists the current five (the one just dragged in included) so you choose which one
  steps back down to Normal — cancel and the drag itself is undone instead of leaving six. Clicking
  any topic row here opens its full detail (same view as the map), not just the vehicle it belongs
  to.
- **Brand map** — brands are wide, sharp-cornered title boxes, all the same fixed size, packed
  tightly together next to each other and shown zoomed well out by default so the whole board is
  visible at a glance (no minimap needed). Drag a brand box to
  rearrange the board — its topic columns move with it, and a drop that would land on top of
  another brand is rejected, snapping back instead of overlapping. Rearranged positions are
  remembered in that browser, so closing and reopening the site brings the board back exactly how
  you left it (per-browser, not synced server-side — a different browser still sees the automatic
  layout). Each box shows only the brand name until a logo is uploaded, after which it shows only
  the logo — no clutter either way (hover for the vehicle/topic count). Every brand's open topics
  sit in columns underneath it and are always visible — no click needed to expand a brand, and no
  connecting lines cluttering the board, just proximity — one column per vehicle + product
  combination (e.g. "K0 CC", "K0 FC"). Each column is a light grey title plate with a red heading,
  matching the neutral look of the brand boxes; **News** topics are stacked at the top in grey rows
  and active **Bugtracker** topics below, sorted top-to-bottom by category (Margin, then Portfolio,
  Quality, Other) and shaded one of four reds to match — so ticket type reads at a glance, and a
  colour-key legend sits in the corner of the map as a reminder. A **High** priority topic gets a
  small upward arrow before its title, everywhere a topic's title is shown (the map, its detail
  view, the sidebar, the Slides page). A topic row's Complete/Delete buttons stay out of the way
  until you hover that row, so the board doesn't look cluttered with icons by default. In edit
  mode you can also drag a topic straight onto a different vehicle's column to move it there. An
  **All / News / BT** filter next to the quick-add button switches the whole board between showing
  every topic or just one kind. A quick-add button (global, or per-brand in edit mode) opens a
  topic form with a free-text vehicle name field — typing a new name creates that vehicle on the
  spot, so there's no separate "add a vehicle" step before you can log a topic for it. BT topics
  also carry a **Phase (1–5)** field alongside their BT code. A topic stays on the board until it's
  marked complete (a checkmark on the row, in edit mode), at which point it drops off the board,
  though it's still visible (dimmed, reopenable) in that vehicle's own panel. A **News** topic
  whose calendar week has already passed without being completed gets a
  small warning icon on the board — opening it prompts you to either mark it still valid (bumping
  it to the current week) or mark it complete, so nothing stale lingers unnoticed.
- **Topic detail** — click any topic row to open just that topic (title, description, badges), not
  the whole vehicle — with Edit / Mark complete / Delete actions in edit mode, plus a Still Valid
  action when it's a past-week News item. Click a column's header instead to open its vehicle
  inline, right there on the same page (no pop-up, no page navigation): which products (CC/FC/PW)
  it takes on the left, and its full topic history (open and completed) on the right.
- **Slides page** — a second page (next to the brand map in the nav bar) purpose-built to be
  screenshotted straight into a weekly presentation: four fixed, PowerPoint-widescreen-ratio (16:9)
  rectangles, one per customer group — **Stellantis · KIA · IVECO**, **Volkswagen**,
  **Renault · Ford · Mercedes Benz**, and **Overall / Universal News** (any customer not in the
  first three) — each showing only that group's **News** topics for the upcoming 3 calendar weeks.
  Every topic is a card with a background photo set per **vehicle + product segment** (e.g. "K0 CC"
  gets its own photo, independent of "K0 FC" — set per card, in edit mode) and that customer's logo
  forced to white over it, so it reads clearly against the photo; a High-priority topic still gets
  its arrow marker. Add a topic and the grid inside that slide reflows to fit it — cards shrink and
  rearrange automatically as the count grows, so a slide's rectangle never has to scroll or overflow
  no matter how much news lands in a given week.
- **Topics** — a unified note system. Each note is either a **BT** item (with a BT code) or a
  **News** item (with a CW date — a single week, or a "+ Period" toggle in the form lets it span a
  range like CW28–CW31; it then shows up on every week it covers, and only counts as past-due once
  the whole period has gone by), carries a **High/Normal**
  priority and an optional product, and
  is tagged **Margin**, **Quality**, **Portfolio** or **Other** — that category sets the note's
  color, so the four grouped sections give an at-a-glance read on how many topics are active and
  where.
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
**`admin`**.

Under the hood, `npm run build:standalone` swaps the real HTTP API client for
`client/src/api/localClient.ts`, an IndexedDB-backed implementation of the exact same
interface, and inlines the whole app (JS, CSS, seed data) into one `.html` file via
`vite-plugin-singlefile`. Routing uses `HashRouter` in this build specifically so a reload
never depends on server-side rewrite rules.

This repo's root `index.html` is exactly this standalone build, kept in sync by
`.github/workflows/deploy-pages.yml` so GitHub Pages always serves the latest version.

### Server-backed app (shared, persistent)

Stack: `server/` is Express + TypeScript + SQLite (`better-sqlite3`), single-admin-password auth
issuing a JWT. `client/` is React + TypeScript + Vite, `@xyflow/react` for the mind map.

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

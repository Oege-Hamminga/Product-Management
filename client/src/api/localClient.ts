// Drop-in replacement for ./client.ts used by the standalone (single-file,
// no-server) build. Same exported shape (api, ApiError, getToken, setToken)
// so every page/component works unmodified — only the storage backend
// changes, from a real HTTP API to the browser's IndexedDB.
import type {
  Brand,
  BrandOverview,
  CrImportResult,
  CrImportRow,
  CrImportUpdate,
  CrModelMapping,
  Note,
  NoteCategory,
  NoteHighlight,
  NotePriority,
  NoteSummaryRow,
  PhaseCounts,
  SegmentImage,
  ProductType,
  SidebarTopics,
  Slide,
  UniversalProductChanges,
  VehicleDetail,
  VehicleProduct,
  VehicleSummary,
} from "./types";
import {
  deleteImage,
  getImageUrl,
  loadState,
  putImage,
  saveState,
  sweepOrphanedImages,
  type DbState,
  type Row,
} from "./localDb";
import { currentIsoWeek } from "../utils/date";

const TOKEN_KEY = "oem_portfolio_standalone_token";
const ADMIN_PASSWORD = "PM"; // Local demo only — nothing sensitive is protected by this.

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {}

const SEED_BRANDS = [
  "Stellantis",
  "Volkswagen",
  "Renault",
  "Ford",
  "Mercedes Benz",
  "IVECO",
  "KIA",
  "BOTT",
];

function uid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

let statePromise: Promise<DbState> | null = null;

// A returning visitor's browser may still hold state saved by an older build
// of this app (before products/tickets/topics were consolidated into
// vehicleProducts/notes). Reading those old field shapes would throw deep
// inside getOverview() etc., which isn't an ApiError and so shows up to the
// user as a generic "Could not load the brand map." Treat anything that
// doesn't match the current shape as stale and reseed instead of crashing.
function isCurrentShape(x: unknown): x is DbState {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<DbState>;
  return Array.isArray(s.brands) && Array.isArray(s.vehicles) && Array.isArray(s.vehicleProducts) && Array.isArray(s.notes);
}

// A "model" under a brand named "Overall News" (seeded below, but a normal,
// fully deletable brand like any other) is really a news category (e.g.
// "Overall News", "Universal Product Changes"), not a real vehicle — it can
// be freely added/renamed/deleted like any other model, but never gets a
// real CC/FC/PW product.
function isUnderOverallNewsBrand(state: DbState, vehicle: Row): boolean {
  const brand = state.brands.find((b) => b.id === vehicle.brand_id);
  return brand?.name === "Overall News";
}

function resolveCrMapping(state: DbState, row: Row): CrModelMapping {
  if (row.is_universal) {
    return { external_name: row.external_name as string, vehicle_id: null, product: null, is_universal: true, vehicle_name: null, brand_name: null };
  }
  const vehicle = state.vehicles.find((v) => v.id === row.vehicle_id);
  const brand = state.brands.find((b) => b.id === vehicle?.brand_id);
  return {
    external_name: row.external_name as string,
    vehicle_id: (row.vehicle_id as string | null) ?? null,
    product: (row.product as ProductType | null) ?? null,
    is_universal: false,
    vehicle_name: (vehicle?.name as string) ?? null,
    brand_name: (brand?.name as string) ?? null,
  };
}

// Extracts a leading phase digit (1-5) from strings like "2.Design" or just
// "2" — anything else (blank, "To be created", etc.) means "not yet in a
// phase" and doesn't count toward any bucket. Mirrors the server's crImport.ts.
function phaseFromText(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const m = text.trim().match(/^([1-5])\b/);
  return m ? Number(m[1]) : null;
}

async function getState(): Promise<DbState> {
  if (!statePromise) {
    statePromise = (async () => {
      const existing = await loadState();
      if (isCurrentShape(existing)) {
        // The old mind map ("Board") page and its Bugtracker tickets were
        // removed entirely — clean out any leftover kind='bt' notes from a
        // returning visitor's older saved state (nothing creates one any
        // more, so this is a no-op once cleaned).
        const hasBtNotes = existing.notes.some((n) => n.kind === "bt");
        if (hasBtNotes) {
          existing.notes = existing.notes.filter((n) => n.kind !== "bt");
          await saveState(existing);
        }
        // "Overall News" is a starter brand like any other seeded below — not
        // reserved, fully creatable/deletable/renameable — so unlike the
        // BT-note purge above, it's intentionally NOT self-healed back in
        // here once a returning visitor's state already matches the current
        // shape. Only a brand-new visitor (the fresh-seed branch further
        // down) gets it by default; if you delete it, it stays deleted.
        let changed = false;
        // Slides are admin-configurable from Settings (title, which brands
        // appear on which, add/delete) instead of a fixed 4-group layout —
        // self-heals today's layout once, the same way the brand/category
        // seeding above does, never re-firing once at least one slide exists
        // (so it can't clobber an admin's own edits, even down to a single
        // remaining slide).
        if (!existing.slides || existing.slides.length === 0) {
          const SLIDE_DEFS: { title: string; brandNames: string[] }[] = [
            { title: "Stellantis · KIA · IVECO", brandNames: ["Stellantis", "KIA", "IVECO"] },
            { title: "Volkswagen", brandNames: ["Volkswagen"] },
            { title: "Renault · Ford · Mercedes Benz", brandNames: ["Renault", "Ford", "Mercedes Benz"] },
            { title: "Overall News", brandNames: [] },
          ];
          const slides: Row[] = [];
          SLIDE_DEFS.forEach((def, i) => {
            const slideId = uid();
            slides.push({ id: slideId, title: def.title, position: i, created_at: now() });
            def.brandNames.forEach((name) => {
              const brand = existing.brands.find((b) => b.name === name);
              if (brand) brand.slide_id = slideId;
            });
          });
          existing.slides = slides;
          changed = true;
        }
        if (changed) await saveState(existing);

        // Sweep any stored image blob no longer referenced by a brand logo
        // or segment image — leftovers from a vehicle/brand deleted before
        // its images were cleaned up, or from the old mind map's per-product
        // images.
        const keepKeys = new Set<string>();
        existing.brands.forEach((b) => keepKeys.add(`brand-logo-${b.id}`));
        (existing.segmentImages ?? []).forEach((r) =>
          keepKeys.add(`segment-image-${r.vehicle_id}-${r.product_type}`)
        );
        await sweepOrphanedImages(keepKeys);
        return existing;
      }
      const overallNewsBrandId = uid();
      const slideIds = [uid(), uid(), uid(), uid()];
      const slideForBrand: Record<string, string> = {
        Stellantis: slideIds[0],
        KIA: slideIds[0],
        IVECO: slideIds[0],
        Volkswagen: slideIds[1],
        Renault: slideIds[2],
        Ford: slideIds[2],
        "Mercedes Benz": slideIds[2],
      };
      const seeded: DbState = {
        brands: [
          ...SEED_BRANDS.map((name, i) => ({
            id: uid(),
            name,
            logo_path: null,
            position: i,
            slide_id: slideForBrand[name] ?? null,
            created_at: now(),
          })),
          {
            id: overallNewsBrandId,
            name: "Overall News",
            logo_path: null,
            position: SEED_BRANDS.length,
            slide_id: null,
            created_at: now(),
          },
        ],
        vehicles: ["Overall News", "Universal Product Changes"].map((name, i) => ({
          id: uid(),
          brand_id: overallNewsBrandId,
          name,
          position: i,
          hidden_from_slides: false,
          show_product_changes: true,
          created_at: now(),
        })),
        vehicleProducts: [],
        notes: [],
        slides: [
          { id: slideIds[0], title: "Stellantis · KIA · IVECO", position: 0, created_at: now() },
          { id: slideIds[1], title: "Volkswagen", position: 1, created_at: now() },
          { id: slideIds[2], title: "Renault · Ford · Mercedes Benz", position: 2, created_at: now() },
          { id: slideIds[3], title: "Overall News", position: 3, created_at: now() },
        ],
      };
      await saveState(seeded);
      return seeded;
    })();
  }
  return statePromise;
}

async function mutate<T>(fn: (state: DbState) => T | Promise<T>): Promise<T> {
  const state = await getState();
  const result = await fn(state);
  await saveState(state);
  return result;
}

function requireAuth() {
  if (!getToken()) throw new ApiError("Login required to make changes.");
}

async function resolveBrand(row: Row): Promise<Brand> {
  const logo_path = await getImageUrl(`brand-logo-${row.id}`);
  return { ...(row as unknown as Brand), logo_path };
}

function buildVehicleDetail(state: DbState, vehicleId: string, brand: Brand): VehicleDetail {
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) throw new ApiError("Vehicle not found.");

  const products = state.vehicleProducts
    .filter((p) => p.vehicle_id === vehicleId)
    .sort((a, b) => String(a.product_type).localeCompare(String(b.product_type)))
    .map((p) => ({ ...p, hidden_from_slides: Boolean(p.hidden_from_slides), slide_weight: (p.slide_weight as number | undefined) ?? null }));
  const notes = state.notes
    .filter((n) => n.vehicle_id === vehicleId)
    .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.created_at).localeCompare(String(b.created_at)));

  return {
    ...(vehicle as unknown as VehicleDetail),
    hidden_from_slides: Boolean(vehicle.hidden_from_slides),
    // Missing (a vehicle saved before this toggle existed) defaults to shown,
    // matching the Product Changes box's previous always-on behaviour.
    show_product_changes: vehicle.show_product_changes !== false,
    slide_weight: (vehicle.slide_weight as number | undefined) ?? null,
    brand,
    products: products as unknown as VehicleDetail["products"],
    notes: notes as unknown as VehicleDetail["notes"],
  };
}

async function vehicleDetailById(state: DbState, vehicleId: string): Promise<VehicleDetail> {
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) throw new ApiError("Vehicle not found.");
  const brandRow = state.brands.find((b) => b.id === vehicle.brand_id);
  if (!brandRow) throw new ApiError("Brand not found.");
  const brand = await resolveBrand(brandRow);
  return buildVehicleDetail(state, vehicleId, brand);
}

export const api = {
  login: async (password: string) => {
    if (password !== ADMIN_PASSWORD) throw new ApiError('Incorrect password. (Hint: it’s "PM" on this demo build.)');
    return { token: "standalone-" + uid() };
  },

  getOverview: async (): Promise<BrandOverview[]> => {
    const state = await getState();
    // Only open (not-yet-completed) topics drive the brand map: bubble size,
    // the fanned-out topic cards, and category counts. Completed topics stay
    // visible in the vehicle panel's own history, not here.
    const openNotes = state.notes.filter((n) => !n.completed);
    const noteCounts = new Map<string, number>();
    const categoryCounts = new Map<string, Record<string, number>>();
    for (const n of openNotes) {
      const key = n.vehicle_id as string;
      noteCounts.set(key, (noteCounts.get(key) ?? 0) + 1);
      const bucket = categoryCounts.get(key) ?? { Margin: 0, Quality: 0, Portfolio: 0, Other: 0 };
      bucket[n.category as string] = (bucket[n.category as string] ?? 0) + 1;
      categoryCounts.set(key, bucket);
    }
    const brands = [...state.brands].sort((a, b) => (a.position as number) - (b.position as number));
    return Promise.all(
      brands.map(async (b) => {
        const brand = await resolveBrand(b);
        const vehicles: VehicleSummary[] = state.vehicles
          .filter((v) => v.brand_id === b.id)
          .sort((a, c) => (a.position as number) - (c.position as number))
          .map((v) => ({
            ...(v as unknown as VehicleSummary),
            hidden_from_slides: Boolean(v.hidden_from_slides),
            show_product_changes: v.show_product_changes !== false,
            slide_weight: (v.slide_weight as number | undefined) ?? null,
            note_count: noteCounts.get(v.id as string) ?? 0,
            category_counts: (categoryCounts.get(v.id as string) ?? { Margin: 0, Quality: 0, Portfolio: 0, Other: 0 }) as VehicleSummary["category_counts"],
            notes: openNotes.filter((n) => n.vehicle_id === v.id) as unknown as VehicleSummary["notes"],
            products: state.vehicleProducts
              .filter((p) => p.vehicle_id === v.id)
              .map((p) => ({ ...p, hidden_from_slides: Boolean(p.hidden_from_slides), slide_weight: (p.slide_weight as number | undefined) ?? null })) as unknown as VehicleProduct[],
          }));
        return { ...brand, vehicles };
      })
    );
  },

  getBrands: async (): Promise<Brand[]> => {
    const state = await getState();
    const brands = [...state.brands].sort((a, b) => (a.position as number) - (b.position as number));
    return Promise.all(
      brands.map(async (b) => ({
        ...(await resolveBrand(b)),
        vehicle_count: state.vehicles.filter((v) => v.brand_id === b.id).length,
      }))
    );
  },

  createBrand: async (name: string): Promise<Brand> => {
    requireAuth();
    return mutate(async (state) => {
      const maxPos = Math.max(-1, ...state.brands.map((b) => b.position as number));
      const row: Row = { id: uid(), name, logo_path: null, position: maxPos + 1, slide_id: null, created_at: now() };
      state.brands.push(row);
      return resolveBrand(row);
    });
  },

  renameBrand: async (id: string, name: string): Promise<Brand> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.brands.find((b) => b.id === id);
      if (!row) throw new ApiError("Brand not found.");
      row.name = name;
      return resolveBrand(row);
    });
  },

  // Which slide a brand appears on — null means "unassigned", which falls
  // back to whichever slide is last (see SlidesPage.tsx).
  setBrandSlide: async (id: string, slideId: string | null): Promise<Brand> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.brands.find((b) => b.id === id);
      if (!row) throw new ApiError("Brand not found.");
      if (slideId !== null && !(state.slides ?? []).some((s) => s.id === slideId)) {
        throw new ApiError("Slide not found.");
      }
      row.slide_id = slideId;
      return resolveBrand(row);
    });
  },

  deleteBrand: async (id: string): Promise<void> => {
    requireAuth();
    await mutate(async (state) => {
      const vehicleIds = state.vehicles.filter((v) => v.brand_id === id).map((v) => v.id as string);
      await deleteImage(`brand-logo-${id}`);
      state.brands = state.brands.filter((b) => b.id !== id);
      state.vehicles = state.vehicles.filter((v) => v.brand_id !== id);
      state.vehicleProducts = state.vehicleProducts.filter((p) => !vehicleIds.includes(p.vehicle_id as string));
      state.notes = state.notes.filter((n) => !vehicleIds.includes(n.vehicle_id as string));
    });
  },

  uploadBrandLogo: async (id: string, file: File): Promise<Brand> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.brands.find((b) => b.id === id);
      if (!row) throw new ApiError("Brand not found.");
      await putImage(`brand-logo-${id}`, file);
      return resolveBrand(row);
    });
  },

  deleteBrandLogo: async (id: string): Promise<Brand> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.brands.find((b) => b.id === id);
      if (!row) throw new ApiError("Brand not found.");
      await deleteImage(`brand-logo-${id}`);
      return resolveBrand(row);
    });
  },

  getVehicle: async (id: string): Promise<VehicleDetail> => {
    const state = await getState();
    return vehicleDetailById(state, id);
  },

  createVehicle: async (brandId: string, name: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      if (!state.brands.some((b) => b.id === brandId)) throw new ApiError("Brand not found.");
      const maxPos = Math.max(-1, ...state.vehicles.filter((v) => v.brand_id === brandId).map((v) => v.position as number));
      const row: Row = { id: uid(), brand_id: brandId, name, position: maxPos + 1, created_at: now() };
      state.vehicles.push(row);
      return vehicleDetailById(state, row.id as string);
    });
  },

  renameVehicle: async (id: string, name: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.vehicles.find((v) => v.id === id);
      if (!row) throw new ApiError("Vehicle not found.");
      row.name = name;
      return vehicleDetailById(state, id);
    });
  },

  setVehicleHiddenFromSlides: async (id: string, hidden: boolean): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.vehicles.find((v) => v.id === id);
      if (!row) throw new ApiError("Vehicle not found.");
      row.hidden_from_slides = hidden;
      return vehicleDetailById(state, id);
    });
  },

  setVehicleShowProductChanges: async (id: string, show: boolean): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.vehicles.find((v) => v.id === id);
      if (!row) throw new ApiError("Vehicle not found.");
      row.show_product_changes = show;
      return vehicleDetailById(state, id);
    });
  },

  // Slides split-line drag for a category tile (Overall News, single
  // segment) — null resets it back to automatic sizing.
  setVehicleWeight: async (id: string, weight: number | null): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.vehicles.find((v) => v.id === id);
      if (!row) throw new ApiError("Vehicle not found.");
      row.slide_weight = weight;
      return vehicleDetailById(state, id);
    });
  },

  deleteVehicle: async (id: string): Promise<void> => {
    requireAuth();
    await mutate(async (state) => {
      const images = (state.segmentImages ?? []).filter((r) => r.vehicle_id === id);
      for (const img of images) {
        await deleteImage(`segment-image-${id}-${img.product_type}`);
      }
      state.vehicles = state.vehicles.filter((v) => v.id !== id);
      state.vehicleProducts = state.vehicleProducts.filter((p) => p.vehicle_id !== id);
      state.notes = state.notes.filter((n) => n.vehicle_id !== id);
      state.segmentImages = (state.segmentImages ?? []).filter((r) => r.vehicle_id !== id);
    });
  },

  addVehicleProduct: async (vehicleId: string, type: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const vehicle = state.vehicles.find((v) => v.id === vehicleId);
      if (!vehicle) throw new ApiError("Vehicle not found.");
      if (isUnderOverallNewsBrand(state, vehicle)) {
        throw new ApiError("News categories can't have products.");
      }
      const exists = state.vehicleProducts.some((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (exists) throw new ApiError(`${type} already added for this vehicle.`);
      state.vehicleProducts.push({
        id: uid(),
        vehicle_id: vehicleId,
        product_type: type,
        ph1: 0,
        ph2: 0,
        ph3: 0,
        ph4: 0,
        ph5: 0,
        created_at: now(),
      });
      return vehicleDetailById(state, vehicleId);
    });
  },

  deleteVehicleProduct: async (vehicleId: string, type: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.vehicleProducts.find((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (!row) throw new ApiError("Product not found for this vehicle.");
      state.vehicleProducts = state.vehicleProducts.filter((p) => p.id !== row!.id);
      return vehicleDetailById(state, vehicleId);
    });
  },

  updateVehicleProductPhases: async (
    vehicleId: string,
    type: ProductType,
    values: Partial<PhaseCounts>
  ): Promise<VehicleProduct> => {
    requireAuth();
    return mutate((state) => {
      let row = state.vehicleProducts.find((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (!row) {
        if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
        row = { id: uid(), vehicle_id: vehicleId, product_type: type, ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0, created_at: now() };
        state.vehicleProducts.push(row);
      }
      (["ph1", "ph2", "ph3", "ph4", "ph5"] as const).forEach((key) => {
        const v = values[key];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) row[key] = Math.round(v);
      });
      return { ...row, hidden_from_slides: Boolean(row.hidden_from_slides) } as unknown as VehicleProduct;
    });
  },

  // Removes/re-adds a single segment's tile (e.g. "K0 Crew Cab") from Slides
  // without touching its sibling products (e.g. "K0 Flex Cab") — same
  // auto-register-on-first-write behaviour as updateVehicleProductPhases,
  // since a tile can exist purely from a News topic with no registered
  // vehicle_products row yet.
  setSegmentHidden: async (vehicleId: string, type: ProductType, hidden: boolean): Promise<VehicleProduct> => {
    requireAuth();
    return mutate((state) => {
      let row = state.vehicleProducts.find((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (!row) {
        if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
        row = { id: uid(), vehicle_id: vehicleId, product_type: type, ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0, created_at: now() };
        state.vehicleProducts.push(row);
      }
      row.hidden_from_slides = hidden;
      return {
        ...row,
        hidden_from_slides: Boolean(row.hidden_from_slides),
        slide_weight: (row.slide_weight as number | undefined) ?? null,
      } as unknown as VehicleProduct;
    });
  },

  // Slides split-line drag between two stacked tiles — null resets a segment
  // back to automatic (topic-count-based) sizing. Same auto-register-on-
  // first-write behaviour as setSegmentHidden/updateVehicleProductPhases.
  setSegmentWeight: async (vehicleId: string, type: ProductType, weight: number | null): Promise<VehicleProduct> => {
    requireAuth();
    return mutate((state) => {
      let row = state.vehicleProducts.find((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (!row) {
        if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
        row = { id: uid(), vehicle_id: vehicleId, product_type: type, ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0, created_at: now() };
        state.vehicleProducts.push(row);
      }
      row.slide_weight = weight;
      return {
        ...row,
        hidden_from_slides: Boolean(row.hidden_from_slides),
        slide_weight: (row.slide_weight as number | undefined) ?? null,
      } as unknown as VehicleProduct;
    });
  },

  getNoteSummary: async (): Promise<NoteSummaryRow[]> => {
    const state = await getState();
    const rows: NoteSummaryRow[] = state.vehicles.map((v) => {
      const brand = state.brands.find((b) => b.id === v.brand_id);
      const vNotes = state.notes.filter((n) => n.vehicle_id === v.id && !n.completed);
      const count = (cat: string) => vNotes.filter((n) => n.category === cat).length;
      return {
        vehicle_id: v.id as string,
        vehicle_name: v.name as string,
        brand_id: (brand?.id as string) ?? "",
        brand_name: (brand?.name as string) ?? "",
        note_count: vNotes.length,
        high_count: vNotes.filter((n) => n.priority === "High").length,
        margin_count: count("Margin"),
        quality_count: count("Quality"),
        portfolio_count: count("Portfolio"),
        other_count: count("Other"),
      };
    });
    return rows.sort((a, b) => b.note_count - a.note_count || b.high_count - a.high_count);
  },

  getSidebarTopics: async (days = 7, priorityLimit = 8, newsLimit = 8): Promise<SidebarTopics> => {
    const state = await getState();
    const withVehicleBrand = (n: Row): NoteHighlight => {
      const vehicle = state.vehicles.find((v) => v.id === n.vehicle_id);
      const brand = state.brands.find((b) => b.id === vehicle?.brand_id);
      return {
        ...(n as unknown as Note),
        vehicle_name: (vehicle?.name as string) ?? "",
        brand_id: (brand?.id as string) ?? "",
        brand_name: (brand?.name as string) ?? "",
      };
    };
    const byCreatedDesc = (a: Row, b: Row) => String(b.created_at).localeCompare(String(a.created_at));

    const highPriority = state.notes
      .filter((n) => n.priority === "High" && !n.completed)
      .sort(byCreatedDesc)
      .slice(0, priorityLimit)
      .map(withVehicleBrand);

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const thisWeek = currentIsoWeek();
    const weeklyNews = state.notes
      .filter(
        (n) =>
          n.kind === "news" &&
          !n.completed &&
          (n.long_term === true ||
            n.cw_date === thisWeek ||
            (n.cw_date &&
              n.cw_date_end &&
              (n.cw_date as string) <= thisWeek &&
              thisWeek <= (n.cw_date_end as string)) ||
            (!n.cw_date && new Date(n.created_at as string).getTime() >= cutoff))
      )
      .sort(byCreatedDesc)
      .slice(0, newsLimit)
      .map(withVehicleBrand);

    return { highPriority, weeklyNews };
  },

  getNotes: async (vehicleId: string): Promise<Note[]> => {
    const state = await getState();
    return state.notes
      .filter((n) => n.vehicle_id === vehicleId)
      .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.created_at).localeCompare(String(b.created_at))) as unknown as Note[];
  },

  // Public — no requireAuth() — so anyone can log a News topic against an
  // existing model without logging in, mirroring the server's public POST.
  createNote: async (vehicleId: string, payload: Partial<Note>): Promise<Note> => {
    return mutate((state) => {
      if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
      if (!payload.title?.trim()) throw new ApiError("Title is required.");
      if (!payload.category) throw new ApiError("Category is required.");
      const isBt = payload.kind === "bt";
      const isLongTerm = !isBt && payload.long_term === true;
      const finalProduct = (payload.product as ProductType) ?? null;
      // New topics land at the bottom of their tile's list — scoped by
      // (vehicle, product) since that's exactly one Slides tile's worth.
      const maxPos = Math.max(
        -1,
        ...state.notes
          .filter((n) => n.vehicle_id === vehicleId && (n.product ?? null) === finalProduct)
          .map((n) => (n.position as number) ?? 0)
      );
      const row: Row = {
        id: uid(),
        vehicle_id: vehicleId,
        kind: payload.kind ?? "news",
        title: payload.title.trim(),
        description: payload.description ?? "",
        category: payload.category as NoteCategory,
        product: finalProduct,
        priority: (payload.priority as NotePriority) ?? "Normal",
        bt_code: isBt ? payload.bt_code ?? null : null,
        cw_date: !isBt && !isLongTerm ? payload.cw_date ?? null : null,
        cw_date_end:
          !isBt && !isLongTerm && payload.cw_date && payload.cw_date_end && payload.cw_date_end > payload.cw_date
            ? payload.cw_date_end
            : null,
        phase: isBt ? payload.phase ?? 1 : null,
        completed: false,
        long_term: isLongTerm,
        position: maxPos + 1,
        created_at: now(),
      };
      state.notes.push(row);
      return row as unknown as Note;
    });
  },

  updateNote: async (id: string, payload: Partial<Note>): Promise<Note> => {
    requireAuth();
    return mutate((state) => {
      const row = state.notes.find((n) => n.id === id);
      if (!row) throw new ApiError("Note not found.");
      const nextKind = payload.kind ?? row.kind;
      const isBt = nextKind === "bt";
      const nextLongTerm = isBt ? false : payload.long_term !== undefined ? payload.long_term : Boolean(row.long_term);
      // Moving a topic to a different vehicle (dragged from one model's
      // column to another on the map) — only if that vehicle exists.
      const nextVehicleId =
        payload.vehicle_id && payload.vehicle_id !== row.vehicle_id && state.vehicles.some((v) => v.id === payload.vehicle_id)
          ? payload.vehicle_id
          : row.vehicle_id;
      const nextCwDate = !isBt && !nextLongTerm ? payload.cw_date ?? row.cw_date ?? null : null;
      // Mirrors the server's PATCH handler: a request that doesn't mention
      // cw_date_end keeps the existing period unless cw_date moved past it.
      let nextCwDateEnd: string | null = null;
      if (!isBt && !nextLongTerm) {
        if (payload.cw_date_end !== undefined) {
          nextCwDateEnd =
            payload.cw_date_end && nextCwDate && payload.cw_date_end > nextCwDate ? payload.cw_date_end : null;
        } else {
          const existingEnd = row.cw_date_end as string | null | undefined;
          nextCwDateEnd = existingEnd && nextCwDate && existingEnd > nextCwDate ? existingEnd : null;
        }
      }
      Object.assign(row, {
        vehicle_id: nextVehicleId,
        kind: nextKind,
        title: payload.title?.trim() || row.title,
        description: payload.description ?? row.description,
        category: payload.category ?? row.category,
        product: payload.product !== undefined ? payload.product : row.product ?? null,
        priority: payload.priority ?? row.priority ?? "Normal",
        bt_code: isBt ? payload.bt_code ?? row.bt_code ?? null : null,
        cw_date: nextCwDate,
        cw_date_end: nextCwDateEnd,
        phase: isBt ? payload.phase ?? row.phase ?? 1 : null,
        completed: payload.completed !== undefined ? payload.completed : row.completed ?? false,
        long_term: nextLongTerm,
        // Drag-reorder within a Slides tile.
        position: typeof payload.position === "number" ? payload.position : row.position ?? 0,
      });
      return row as unknown as Note;
    });
  },

  deleteNote: async (id: string): Promise<void> => {
    requireAuth();
    await mutate((state) => {
      state.notes = state.notes.filter((n) => n.id !== id);
    });
  },

  getSegmentImages: async (): Promise<SegmentImage[]> => {
    const state = await getState();
    const rows = state.segmentImages ?? [];
    const resolved = await Promise.all(
      rows.map(async (r) => ({
        vehicle_id: r.vehicle_id as string,
        product_type: r.product_type as ProductType,
        image_path: await getImageUrl(`segment-image-${r.vehicle_id}-${r.product_type}`),
      }))
    );
    return resolved.filter((r): r is SegmentImage => r.image_path !== null);
  },

  uploadSegmentImage: async (vehicleId: string, type: ProductType, file: File): Promise<SegmentImage[]> => {
    requireAuth();
    return mutate(async (state) => {
      if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
      await putImage(`segment-image-${vehicleId}-${type}`, file);
      const existing = state.segmentImages ?? [];
      if (!existing.some((r) => r.vehicle_id === vehicleId && r.product_type === type)) {
        existing.push({ vehicle_id: vehicleId, product_type: type });
      }
      state.segmentImages = existing;
      return api.getSegmentImages();
    });
  },

  deleteSegmentImage: async (vehicleId: string, type: ProductType): Promise<SegmentImage[]> => {
    requireAuth();
    return mutate(async (state) => {
      await deleteImage(`segment-image-${vehicleId}-${type}`);
      state.segmentImages = (state.segmentImages ?? []).filter(
        (r) => !(r.vehicle_id === vehicleId && r.product_type === type)
      );
      return api.getSegmentImages();
    });
  },

  getUniversalProductChanges: async (): Promise<UniversalProductChanges> => {
    const state = await getState();
    return { ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0, ...(state.universalProductChanges ?? {}) };
  },

  updateUniversalProductChanges: async (values: Partial<PhaseCounts>): Promise<UniversalProductChanges> => {
    requireAuth();
    return mutate((state) => {
      const current = { ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0, ...(state.universalProductChanges ?? {}) };
      (["ph1", "ph2", "ph3", "ph4", "ph5"] as const).forEach((key) => {
        const v = values[key];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) current[key] = Math.round(v);
      });
      state.universalProductChanges = current;
      return current;
    });
  },

  getSlides: async (): Promise<Slide[]> => {
    const state = await getState();
    return [...(state.slides ?? [])].sort((a, b) => (a.position as number) - (b.position as number)) as unknown as Slide[];
  },

  createSlide: async (title: string): Promise<Slide> => {
    requireAuth();
    return mutate((state) => {
      const slides = state.slides ?? [];
      const maxPos = Math.max(-1, ...slides.map((s) => s.position as number));
      const row: Row = { id: uid(), title, position: maxPos + 1, created_at: now() };
      state.slides = [...slides, row];
      return row as unknown as Slide;
    });
  },

  renameSlide: async (id: string, title: string): Promise<Slide> => {
    requireAuth();
    return mutate((state) => {
      const row = (state.slides ?? []).find((s) => s.id === id);
      if (!row) throw new ApiError("Slide not found.");
      row.title = title;
      return row as unknown as Slide;
    });
  },

  deleteSlide: async (id: string): Promise<void> => {
    requireAuth();
    await mutate((state) => {
      const slides = state.slides ?? [];
      if (!slides.some((s) => s.id === id)) throw new ApiError("Slide not found.");
      if (slides.length <= 1) throw new ApiError("At least one slide is required.");
      state.slides = slides.filter((s) => s.id !== id);
      // Brands assigned to this slide fall back to the last remaining
      // slide, same as any brand that was never explicitly assigned.
      state.brands.forEach((b) => {
        if (b.slide_id === id) b.slide_id = null;
      });
    });
  },

  getCrMappings: async (): Promise<CrModelMapping[]> => {
    const state = await getState();
    return (state.crModelMappings ?? []).map((r) => resolveCrMapping(state, r));
  },

  setCrMapping: async (
    externalName: string,
    target: { vehicleId: string; product: ProductType } | { isUniversal: true }
  ): Promise<CrModelMapping> => {
    requireAuth();
    return mutate((state) => {
      const rows = state.crModelMappings ?? [];
      let row = rows.find((r) => r.external_name === externalName);
      if (!row) {
        row = { external_name: externalName, vehicle_id: null, product: null, is_universal: false, created_at: now() };
        rows.push(row);
      }
      if ("isUniversal" in target) {
        row.vehicle_id = null;
        row.product = null;
        row.is_universal = true;
      } else {
        if (!state.vehicles.some((v) => v.id === target.vehicleId)) throw new ApiError("Vehicle not found.");
        row.vehicle_id = target.vehicleId;
        row.product = target.product;
        row.is_universal = false;
      }
      state.crModelMappings = rows;
      return resolveCrMapping(state, row);
    });
  },

  deleteCrMapping: async (externalName: string): Promise<void> => {
    requireAuth();
    await mutate((state) => {
      state.crModelMappings = (state.crModelMappings ?? []).filter((r) => r.external_name !== externalName);
    });
  },

  // Pastes a full current snapshot each time (not a delta) — every mapped
  // target's ph1-5 is replaced wholesale from this import's counts, so
  // re-importing the same export twice is harmless. Mirrors the server's
  // POST /api/cr-import exactly.
  importProductChanges: async (rows: CrImportRow[]): Promise<CrImportResult> => {
    requireAuth();
    return mutate((state) => {
      const counts = new Map<string, [number, number, number, number, number]>();
      let ignoredRows = 0;
      for (const row of rows) {
        const model = typeof row?.model === "string" ? row.model.trim() : "";
        const phase = phaseFromText(row?.phase);
        if (!model || phase === null) {
          ignoredRows++;
          continue;
        }
        if (!counts.has(model)) counts.set(model, [0, 0, 0, 0, 0]);
        counts.get(model)![phase - 1]++;
      }

      const mappings = state.crModelMappings ?? [];
      const mapByName = new Map(mappings.map((m) => [m.external_name as string, m]));

      const updated: CrImportUpdate[] = [];
      const unmapped: string[] = [];
      const universalTotals: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      let anyUniversal = false;
      // Two external names can legitimately map to the same vehicle+product
      // (an inconsistently-spelled variant on the source site, say) — sum
      // their contributions into one write per target instead of the second
      // one silently overwriting the first's. Mirrors the server's crImport.ts.
      const targetCounts = new Map<string, { vehicleId: string; product: ProductType; counts: [number, number, number, number, number] }>();

      for (const [model, c] of counts) {
        const mapping = mapByName.get(model);
        if (!mapping) {
          unmapped.push(model);
          continue;
        }
        if (mapping.is_universal) {
          anyUniversal = true;
          c.forEach((v, i) => (universalTotals[i] += v));
          continue;
        }
        const vehicleId = (mapping.vehicle_id as string | null) ?? null;
        const product = (mapping.product as ProductType | null) ?? null;
        if (!vehicleId || !product || !state.vehicles.some((v) => v.id === vehicleId)) {
          unmapped.push(model);
          continue;
        }
        const targetKey = `${vehicleId}:${product}`;
        let target = targetCounts.get(targetKey);
        if (!target) {
          target = { vehicleId, product, counts: [0, 0, 0, 0, 0] };
          targetCounts.set(targetKey, target);
        }
        c.forEach((v, i) => (target!.counts[i] += v));
        const vehicle = state.vehicles.find((v) => v.id === vehicleId);
        const brand = state.brands.find((b) => b.id === vehicle?.brand_id);
        updated.push({
          external_name: model,
          vehicle_id: vehicleId,
          product,
          vehicle_name: (vehicle?.name as string) ?? "",
          brand_name: (brand?.name as string) ?? "",
          counts: { ph1: c[0], ph2: c[1], ph3: c[2], ph4: c[3], ph5: c[4] },
        });
      }

      for (const target of targetCounts.values()) {
        let productRow = state.vehicleProducts.find((p) => p.vehicle_id === target.vehicleId && p.product_type === target.product);
        if (!productRow) {
          productRow = { id: uid(), vehicle_id: target.vehicleId, product_type: target.product, ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0, created_at: now() };
          state.vehicleProducts.push(productRow);
        }
        [productRow.ph1, productRow.ph2, productRow.ph3, productRow.ph4, productRow.ph5] = target.counts;
      }

      let universalCounts: PhaseCounts | null = null;
      if (anyUniversal) {
        universalCounts = { ph1: universalTotals[0], ph2: universalTotals[1], ph3: universalTotals[2], ph4: universalTotals[3], ph5: universalTotals[4] };
        state.universalProductChanges = universalCounts as unknown as Row;
      }

      return {
        updated,
        universal_counts: universalCounts,
        unmapped,
        ignored_rows: ignoredRows,
        total_rows: rows.length,
      };
    });
  },
};

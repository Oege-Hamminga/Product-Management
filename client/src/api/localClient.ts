// Drop-in replacement for ./client.ts used by the standalone (single-file,
// no-server) build. Same exported shape (api, ApiError, getToken, setToken)
// so every page/component works unmodified — only the storage backend
// changes, from a real HTTP API to the browser's IndexedDB.
import type { Brand, BrandOverview, Note, NoteCategory, NoteHighlight, NotePriority, NoteSummaryRow, ProductType, SidebarTopics, VehicleDetail, VehicleSummary } from "./types";
import { deleteImage, getImageUrl, loadState, putImage, saveState, type DbState, type Row } from "./localDb";

const TOKEN_KEY = "oem_portfolio_standalone_token";
const ADMIN_PASSWORD = "admin"; // Local demo only — nothing sensitive is protected by this.

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

async function getState(): Promise<DbState> {
  if (!statePromise) {
    statePromise = (async () => {
      const existing = await loadState();
      if (isCurrentShape(existing)) return existing;
      const seeded: DbState = {
        brands: SEED_BRANDS.map((name, i) => ({
          id: uid(),
          name,
          logo_path: null,
          position: i,
          created_at: now(),
        })),
        vehicles: [],
        vehicleProducts: [],
        notes: [],
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
    .sort((a, b) => String(a.product_type).localeCompare(String(b.product_type)));
  const notes = state.notes
    .filter((n) => n.vehicle_id === vehicleId)
    .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.created_at).localeCompare(String(b.created_at)));

  return {
    ...(vehicle as unknown as VehicleDetail),
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
    if (password !== ADMIN_PASSWORD) throw new ApiError('Incorrect password. (Hint: it’s "admin" on this demo build.)');
    return { token: "standalone-" + uid() };
  },

  getOverview: async (): Promise<BrandOverview[]> => {
    const state = await getState();
    const noteCounts = new Map<string, number>();
    const categoryCounts = new Map<string, Record<string, number>>();
    for (const n of state.notes) {
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
            note_count: noteCounts.get(v.id as string) ?? 0,
            category_counts: (categoryCounts.get(v.id as string) ?? { Margin: 0, Quality: 0, Portfolio: 0, Other: 0 }) as VehicleSummary["category_counts"],
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
      const row: Row = { id: uid(), name, logo_path: null, position: maxPos + 1, created_at: now() };
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

  deleteVehicle: async (id: string): Promise<void> => {
    requireAuth();
    await mutate((state) => {
      state.vehicles = state.vehicles.filter((v) => v.id !== id);
      state.vehicleProducts = state.vehicleProducts.filter((p) => p.vehicle_id !== id);
      state.notes = state.notes.filter((n) => n.vehicle_id !== id);
    });
  },

  addVehicleProduct: async (vehicleId: string, type: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
      const exists = state.vehicleProducts.some((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (exists) throw new ApiError(`${type} already added for this vehicle.`);
      state.vehicleProducts.push({ id: uid(), vehicle_id: vehicleId, product_type: type, created_at: now() });
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

  getNoteSummary: async (): Promise<NoteSummaryRow[]> => {
    const state = await getState();
    const rows: NoteSummaryRow[] = state.vehicles.map((v) => {
      const brand = state.brands.find((b) => b.id === v.brand_id);
      const vNotes = state.notes.filter((n) => n.vehicle_id === v.id);
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
      .filter((n) => n.priority === "High")
      .sort(byCreatedDesc)
      .slice(0, priorityLimit)
      .map(withVehicleBrand);

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const weeklyNews = state.notes
      .filter((n) => n.kind === "news" && new Date(n.created_at as string).getTime() >= cutoff)
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

  createNote: async (vehicleId: string, payload: Partial<Note>): Promise<Note> => {
    requireAuth();
    return mutate((state) => {
      if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
      if (!payload.title?.trim()) throw new ApiError("Title is required.");
      if (!payload.category) throw new ApiError("Category is required.");
      const isBt = payload.kind === "bt";
      const row: Row = {
        id: uid(),
        vehicle_id: vehicleId,
        kind: payload.kind ?? "news",
        title: payload.title.trim(),
        description: payload.description ?? "",
        category: payload.category as NoteCategory,
        product: (payload.product as ProductType) ?? null,
        priority: (payload.priority as NotePriority) ?? "Normal",
        bt_code: isBt ? payload.bt_code ?? null : null,
        cw_date: !isBt ? payload.cw_date ?? null : null,
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
      Object.assign(row, {
        kind: nextKind,
        title: payload.title?.trim() || row.title,
        description: payload.description ?? row.description,
        category: payload.category ?? row.category,
        product: payload.product !== undefined ? payload.product : row.product ?? null,
        priority: payload.priority ?? row.priority ?? "Normal",
        bt_code: isBt ? payload.bt_code ?? row.bt_code ?? null : null,
        cw_date: !isBt ? payload.cw_date ?? row.cw_date ?? null : null,
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
};

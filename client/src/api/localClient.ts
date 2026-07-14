// Drop-in replacement for ./client.ts used by the standalone (single-file,
// no-server) build. Same exported shape (api, ApiError, getToken, setToken)
// so every page/component works unmodified — only the storage backend
// changes, from a real HTTP API to the browser's IndexedDB.
import type {
  Brand,
  BrandOverview,
  Ticket,
  TicketCategory,
  TicketPriority,
  TicketSummaryRow,
  Topic,
  VehicleDetail,
  VehicleImage,
  VehicleProduct,
  VehicleSummary,
} from "./types";
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

async function getState(): Promise<DbState> {
  if (!statePromise) {
    statePromise = (async () => {
      const existing = await loadState();
      if (existing) return existing;
      const seeded: DbState = {
        brands: SEED_BRANDS.map((name, i) => ({
          id: uid(),
          name,
          logo_path: null,
          position: i,
          created_at: now(),
        })),
        vehicles: [],
        vehicleImages: [],
        vehicleProducts: [],
        tickets: [],
        topics: [],
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

async function resolveVehicleImage(row: Row): Promise<VehicleImage> {
  const path = await getImageUrl(`vehicle-image-${row.id}`);
  return { ...(row as unknown as VehicleImage), path: path ?? "" };
}

async function resolveProduct(row: Row): Promise<VehicleProduct> {
  const image_path = await getImageUrl(`product-image-${row.id}`);
  return { ...(row as unknown as VehicleProduct), image_path };
}

async function buildVehicleDetail(state: DbState, vehicleId: string): Promise<VehicleDetail> {
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) throw new ApiError("Vehicle not found.");
  const brandRow = state.brands.find((b) => b.id === vehicle.brand_id);
  if (!brandRow) throw new ApiError("Brand not found.");

  const images = await Promise.all(
    state.vehicleImages
      .filter((i) => i.vehicle_id === vehicleId)
      .sort((a, b) => (a.position as number) - (b.position as number))
      .map(resolveVehicleImage)
  );
  const products = await Promise.all(
    state.vehicleProducts
      .filter((p) => p.vehicle_id === vehicleId)
      .sort((a, b) => String(a.product_type).localeCompare(String(b.product_type)))
      .map(resolveProduct)
  );
  const tickets = state.tickets
    .filter((t) => t.vehicle_id === vehicleId)
    .sort((a, b) => String(a.category).localeCompare(String(b.category)) || (a.position as number) - (b.position as number)) as unknown as Ticket[];
  const topics = state.topics
    .filter((t) => t.vehicle_id === vehicleId)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) as unknown as Topic[];

  const brand = await resolveBrand(brandRow);

  return {
    ...(vehicle as unknown as VehicleDetail),
    brand,
    images,
    products,
    tickets,
    topics,
  };
}

export const api = {
  login: async (password: string) => {
    if (password !== ADMIN_PASSWORD) throw new ApiError('Incorrect password. (Hint: it’s "admin" on this demo build.)');
    return { token: "standalone-" + uid() };
  },

  getOverview: async (): Promise<BrandOverview[]> => {
    const state = await getState();
    const ticketCounts = new Map<string, number>();
    for (const t of state.tickets) {
      const key = t.vehicle_id as string;
      ticketCounts.set(key, (ticketCounts.get(key) ?? 0) + 1);
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
            ticket_count: ticketCounts.get(v.id as string) ?? 0,
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
      for (const vid of vehicleIds) {
        for (const img of state.vehicleImages.filter((i) => i.vehicle_id === vid)) {
          await deleteImage(`vehicle-image-${img.id}`);
        }
        for (const p of state.vehicleProducts.filter((pr) => pr.vehicle_id === vid)) {
          await deleteImage(`product-image-${p.id}`);
        }
      }
      await deleteImage(`brand-logo-${id}`);
      state.brands = state.brands.filter((b) => b.id !== id);
      state.vehicles = state.vehicles.filter((v) => v.brand_id !== id);
      state.vehicleImages = state.vehicleImages.filter((i) => !vehicleIds.includes(i.vehicle_id as string));
      state.vehicleProducts = state.vehicleProducts.filter((p) => !vehicleIds.includes(p.vehicle_id as string));
      state.tickets = state.tickets.filter((t) => !vehicleIds.includes(t.vehicle_id as string));
      state.topics = state.topics.filter((t) => !vehicleIds.includes(t.vehicle_id as string));
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
    return buildVehicleDetail(state, id);
  },

  createVehicle: async (brandId: string, name: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      if (!state.brands.some((b) => b.id === brandId)) throw new ApiError("Brand not found.");
      const maxPos = Math.max(-1, ...state.vehicles.filter((v) => v.brand_id === brandId).map((v) => v.position as number));
      const row: Row = { id: uid(), brand_id: brandId, name, position: maxPos + 1, created_at: now() };
      state.vehicles.push(row);
      return buildVehicleDetail(state, row.id as string);
    });
  },

  renameVehicle: async (id: string, name: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.vehicles.find((v) => v.id === id);
      if (!row) throw new ApiError("Vehicle not found.");
      row.name = name;
      return buildVehicleDetail(state, id);
    });
  },

  deleteVehicle: async (id: string): Promise<void> => {
    requireAuth();
    await mutate(async (state) => {
      for (const img of state.vehicleImages.filter((i) => i.vehicle_id === id)) {
        await deleteImage(`vehicle-image-${img.id}`);
      }
      for (const p of state.vehicleProducts.filter((pr) => pr.vehicle_id === id)) {
        await deleteImage(`product-image-${p.id}`);
      }
      state.vehicles = state.vehicles.filter((v) => v.id !== id);
      state.vehicleImages = state.vehicleImages.filter((i) => i.vehicle_id !== id);
      state.vehicleProducts = state.vehicleProducts.filter((p) => p.vehicle_id !== id);
      state.tickets = state.tickets.filter((t) => t.vehicle_id !== id);
      state.topics = state.topics.filter((t) => t.vehicle_id !== id);
    });
  },

  addVehicleImage: async (vehicleId: string, file: File): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
      const maxPos = Math.max(-1, ...state.vehicleImages.filter((i) => i.vehicle_id === vehicleId).map((i) => i.position as number));
      const row: Row = { id: uid(), vehicle_id: vehicleId, position: maxPos + 1, created_at: now() };
      await putImage(`vehicle-image-${row.id}`, file);
      state.vehicleImages.push(row);
      return buildVehicleDetail(state, vehicleId);
    });
  },

  deleteVehicleImage: async (vehicleId: string, imageId: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.vehicleImages.find((i) => i.id === imageId && i.vehicle_id === vehicleId);
      if (!row) throw new ApiError("Image not found.");
      await deleteImage(`vehicle-image-${imageId}`);
      state.vehicleImages = state.vehicleImages.filter((i) => i.id !== imageId);
      return buildVehicleDetail(state, vehicleId);
    });
  },

  addVehicleProduct: async (vehicleId: string, type: string, notes = ""): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
      const exists = state.vehicleProducts.some((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (exists) throw new ApiError(`${type} already added for this vehicle.`);
      const row: Row = { id: uid(), vehicle_id: vehicleId, product_type: type, image_path: null, notes, created_at: now() };
      state.vehicleProducts.push(row);
      return buildVehicleDetail(state, vehicleId);
    });
  },

  updateVehicleProduct: async (vehicleId: string, type: string, notes: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.vehicleProducts.find((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (!row) throw new ApiError("Product not found for this vehicle.");
      row.notes = notes;
      return buildVehicleDetail(state, vehicleId);
    });
  },

  uploadVehicleProductImage: async (vehicleId: string, type: string, file: File): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      let row = state.vehicleProducts.find((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (!row) {
        if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
        row = { id: uid(), vehicle_id: vehicleId, product_type: type, image_path: null, notes: "", created_at: now() };
        state.vehicleProducts.push(row);
      }
      await putImage(`product-image-${row.id}`, file);
      return buildVehicleDetail(state, vehicleId);
    });
  },

  deleteVehicleProduct: async (vehicleId: string, type: string): Promise<VehicleDetail> => {
    requireAuth();
    return mutate(async (state) => {
      const row = state.vehicleProducts.find((p) => p.vehicle_id === vehicleId && p.product_type === type);
      if (!row) throw new ApiError("Product not found for this vehicle.");
      await deleteImage(`product-image-${row.id}`);
      state.vehicleProducts = state.vehicleProducts.filter((p) => p.id !== row!.id);
      return buildVehicleDetail(state, vehicleId);
    });
  },

  getTicketSummary: async (): Promise<TicketSummaryRow[]> => {
    const state = await getState();
    const rows: TicketSummaryRow[] = state.vehicles.map((v) => {
      const brand = state.brands.find((b) => b.id === v.brand_id);
      const vTickets = state.tickets.filter((t) => t.vehicle_id === v.id);
      const count = (cat: string) => vTickets.filter((t) => t.category === cat).length;
      return {
        vehicle_id: v.id as string,
        vehicle_name: v.name as string,
        brand_id: (brand?.id as string) ?? "",
        brand_name: (brand?.name as string) ?? "",
        ticket_count: vTickets.length,
        critical_count: vTickets.filter((t) => t.priority === "Critical").length,
        high_count: vTickets.filter((t) => t.priority === "High").length,
        margin_count: count("Margin"),
        quality_count: count("Quality"),
        portfolio_count: count("Portfolio"),
      };
    });
    return rows.sort((a, b) => b.ticket_count - a.ticket_count || b.critical_count - a.critical_count);
  },

  getTickets: async (vehicleId: string): Promise<Ticket[]> => {
    const state = await getState();
    return state.tickets
      .filter((t) => t.vehicle_id === vehicleId)
      .sort((a, b) => String(a.category).localeCompare(String(b.category)) || (a.position as number) - (b.position as number)) as unknown as Ticket[];
  },

  createTicket: async (vehicleId: string, payload: Partial<Ticket>): Promise<Ticket> => {
    requireAuth();
    return mutate(async (state) => {
      if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
      if (!payload.bt_code?.trim()) throw new ApiError("BT code is required.");
      const category: TicketCategory = payload.category ?? "Portfolio";
      const maxPos = Math.max(
        -1,
        ...state.tickets.filter((t) => t.vehicle_id === vehicleId && t.category === category).map((t) => t.position as number)
      );
      const row: Row = {
        id: uid(),
        vehicle_id: vehicleId,
        bt_code: payload.bt_code.trim(),
        bt_description: payload.bt_description ?? "",
        phase: payload.phase ?? 1,
        priority: (payload.priority as TicketPriority) ?? "Medium",
        category,
        position: maxPos + 1,
        created_at: now(),
      };
      state.tickets.push(row);
      return row as unknown as Ticket;
    });
  },

  updateTicket: async (id: string, payload: Partial<Ticket>): Promise<Ticket> => {
    requireAuth();
    return mutate((state) => {
      const row = state.tickets.find((t) => t.id === id);
      if (!row) throw new ApiError("Ticket not found.");
      Object.assign(row, payload);
      return row as unknown as Ticket;
    });
  },

  reorderTickets: async (updates: { id: string; category: string; position: number }[]): Promise<void> => {
    requireAuth();
    await mutate((state) => {
      for (const u of updates) {
        const row = state.tickets.find((t) => t.id === u.id);
        if (row) {
          row.category = u.category;
          row.position = u.position;
        }
      }
    });
  },

  deleteTicket: async (id: string): Promise<void> => {
    requireAuth();
    await mutate((state) => {
      state.tickets = state.tickets.filter((t) => t.id !== id);
    });
  },

  getTopics: async (vehicleId: string): Promise<Topic[]> => {
    const state = await getState();
    return state.topics
      .filter((t) => t.vehicle_id === vehicleId)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) as unknown as Topic[];
  },

  createTopic: async (vehicleId: string, title: string, description: string): Promise<Topic> => {
    requireAuth();
    return mutate((state) => {
      if (!state.vehicles.some((v) => v.id === vehicleId)) throw new ApiError("Vehicle not found.");
      if (!title.trim()) throw new ApiError("Topic title is required.");
      const row: Row = { id: uid(), vehicle_id: vehicleId, title: title.trim(), description, created_at: now() };
      state.topics.push(row);
      return row as unknown as Topic;
    });
  },

  updateTopic: async (id: string, title: string, description: string): Promise<Topic> => {
    requireAuth();
    return mutate((state) => {
      const row = state.topics.find((t) => t.id === id);
      if (!row) throw new ApiError("Topic not found.");
      if (title.trim()) row.title = title.trim();
      row.description = description;
      return row as unknown as Topic;
    });
  },

  deleteTopic: async (id: string): Promise<void> => {
    requireAuth();
    await mutate((state) => {
      state.topics = state.topics.filter((t) => t.id !== id);
    });
  },
};

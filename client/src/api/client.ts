import type {
  Brand,
  BrandOverview,
  CrImportResult,
  CrImportRow,
  CrModelMapping,
  Note,
  NoteSummaryRow,
  SegmentImage,
  ProductType,
  SidebarTopics,
  Slide,
  UniversalProductChanges,
  VehicleDetail,
  VehicleProduct,
} from "./types";

const TOKEN_KEY = "oem_portfolio_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : undefined;

  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  login: (password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  getOverview: () => request<BrandOverview[]>("/brands/overview"),
  getBrands: () => request<Brand[]>("/brands"),
  createBrand: (name: string) =>
    request<Brand>("/brands", { method: "POST", body: JSON.stringify({ name }) }),
  renameBrand: (id: string, name: string) =>
    request<Brand>(`/brands/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  setBrandSlide: (id: string, slideId: string | null) =>
    request<Brand>(`/brands/${id}`, { method: "PATCH", body: JSON.stringify({ slide_id: slideId }) }),
  deleteBrand: (id: string) => request<void>(`/brands/${id}`, { method: "DELETE" }),
  uploadBrandLogo: (id: string, file: File) => {
    const form = new FormData();
    form.append("logo", file);
    return request<Brand>(`/brands/${id}/logo`, { method: "POST", body: form });
  },
  deleteBrandLogo: (id: string) => request<Brand>(`/brands/${id}/logo`, { method: "DELETE" }),

  getVehicle: (id: string) => request<VehicleDetail>(`/vehicles/${id}`),
  createVehicle: (brandId: string, name: string) =>
    request<VehicleDetail>(`/vehicles/brand/${brandId}`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  renameVehicle: (id: string, name: string) =>
    request<VehicleDetail>(`/vehicles/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteVehicle: (id: string) => request<void>(`/vehicles/${id}`, { method: "DELETE" }),
  setVehicleHiddenFromSlides: (id: string, hidden: boolean) =>
    request<VehicleDetail>(`/vehicles/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ hidden_from_slides: hidden }),
    }),
  setVehicleShowProductChanges: (id: string, show: boolean) =>
    request<VehicleDetail>(`/vehicles/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ show_product_changes: show }),
    }),
  // Slides split-line drag for a category tile (Overall News, single
  // segment) — null resets it back to automatic sizing.
  setVehicleWeight: (id: string, weight: number | null) =>
    request<VehicleDetail>(`/vehicles/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ slide_weight: weight }),
    }),

  addVehicleProduct: (vehicleId: string, type: string) =>
    request<VehicleDetail>(`/vehicles/${vehicleId}/products/${type}`, { method: "POST" }),
  deleteVehicleProduct: (vehicleId: string, type: string) =>
    request<VehicleDetail>(`/vehicles/${vehicleId}/products/${type}`, { method: "DELETE" }),
  setSegmentHidden: (vehicleId: string, type: ProductType, hidden: boolean) =>
    request<VehicleProduct>(`/vehicles/${vehicleId}/products/${type}/hidden`, {
      method: "PATCH",
      body: JSON.stringify({ hidden }),
    }),
  // Slides split-line drag between two stacked tiles — null resets a segment
  // back to automatic (topic-count-based) sizing.
  setSegmentWeight: (vehicleId: string, type: ProductType, weight: number | null) =>
    request<VehicleProduct>(`/vehicles/${vehicleId}/products/${type}/weight`, {
      method: "PATCH",
      body: JSON.stringify({ weight }),
    }),

  getNoteSummary: () => request<NoteSummaryRow[]>("/notes/summary"),
  getSidebarTopics: (days = 7, priorityLimit = 8, newsLimit = 8) =>
    request<SidebarTopics>(`/notes/sidebar?days=${days}&priorityLimit=${priorityLimit}&newsLimit=${newsLimit}`),
  getNotes: (vehicleId: string) => request<Note[]>(`/notes/vehicle/${vehicleId}`),
  createNote: (vehicleId: string, payload: Partial<Note>) =>
    request<Note>(`/notes/vehicle/${vehicleId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateNote: (id: string, payload: Partial<Note>) =>
    request<Note>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteNote: (id: string) => request<void>(`/notes/${id}`, { method: "DELETE" }),

  getSegmentImages: () => request<SegmentImage[]>("/segment-images"),
  uploadSegmentImage: (vehicleId: string, type: ProductType, file: File) => {
    const form = new FormData();
    form.append("image", file);
    return request<SegmentImage[]>(`/segment-images/${vehicleId}/${type}`, { method: "POST", body: form });
  },
  deleteSegmentImage: (vehicleId: string, type: ProductType) =>
    request<SegmentImage[]>(`/segment-images/${vehicleId}/${type}`, { method: "DELETE" }),

  getUniversalProductChanges: () => request<UniversalProductChanges>("/universal-changes"),

  getSlides: () => request<Slide[]>("/slides"),
  createSlide: (title: string) => request<Slide>("/slides", { method: "POST", body: JSON.stringify({ title }) }),
  renameSlide: (id: string, title: string) =>
    request<Slide>(`/slides/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  deleteSlide: (id: string) => request<void>(`/slides/${id}`, { method: "DELETE" }),

  getCrMappings: () => request<CrModelMapping[]>("/cr-import/mappings"),
  setCrMapping: (externalName: string, target: { vehicleId: string; product: ProductType } | { isUniversal: true }) =>
    request<CrModelMapping>("/cr-import/mappings", {
      method: "PUT",
      body: JSON.stringify({ externalName, ...target }),
    }),
  deleteCrMapping: (externalName: string) =>
    request<void>(`/cr-import/mappings/${encodeURIComponent(externalName)}`, { method: "DELETE" }),
  importProductChanges: (rows: CrImportRow[]) =>
    request<CrImportResult>("/cr-import", { method: "POST", body: JSON.stringify({ rows }) }),
};

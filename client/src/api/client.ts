import type {
  Brand,
  BrandOverview,
  Ticket,
  TicketSummaryRow,
  Topic,
  VehicleDetail,
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

  addVehicleImage: (vehicleId: string, file: File) => {
    const form = new FormData();
    form.append("image", file);
    return request<VehicleDetail>(`/vehicles/${vehicleId}/images`, {
      method: "POST",
      body: form,
    });
  },
  deleteVehicleImage: (vehicleId: string, imageId: string) =>
    request<VehicleDetail>(`/vehicles/${vehicleId}/images/${imageId}`, { method: "DELETE" }),

  addVehicleProduct: (vehicleId: string, type: string, notes = "") =>
    request<VehicleDetail>(`/vehicles/${vehicleId}/products/${type}`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  updateVehicleProduct: (vehicleId: string, type: string, notes: string) =>
    request<VehicleDetail>(`/vehicles/${vehicleId}/products/${type}`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    }),
  uploadVehicleProductImage: (vehicleId: string, type: string, file: File) => {
    const form = new FormData();
    form.append("image", file);
    return request<VehicleDetail>(`/vehicles/${vehicleId}/products/${type}/image`, {
      method: "POST",
      body: form,
    });
  },
  deleteVehicleProduct: (vehicleId: string, type: string) =>
    request<VehicleDetail>(`/vehicles/${vehicleId}/products/${type}`, { method: "DELETE" }),

  getTicketSummary: () => request<TicketSummaryRow[]>("/tickets/summary"),
  getTickets: (vehicleId: string) => request<Ticket[]>(`/tickets/vehicle/${vehicleId}`),
  createTicket: (vehicleId: string, payload: Partial<Ticket>) =>
    request<Ticket>(`/tickets/vehicle/${vehicleId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTicket: (id: string, payload: Partial<Ticket>) =>
    request<Ticket>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  reorderTickets: (updates: { id: string; category: string; position: number }[]) =>
    request<void>("/tickets/reorder", { method: "POST", body: JSON.stringify({ updates }) }),
  deleteTicket: (id: string) => request<void>(`/tickets/${id}`, { method: "DELETE" }),

  getTopics: (vehicleId: string) => request<Topic[]>(`/topics/vehicle/${vehicleId}`),
  createTopic: (vehicleId: string, title: string, description: string) =>
    request<Topic>(`/topics/vehicle/${vehicleId}`, {
      method: "POST",
      body: JSON.stringify({ title, description }),
    }),
  updateTopic: (id: string, title: string, description: string) =>
    request<Topic>(`/topics/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title, description }),
    }),
  deleteTopic: (id: string) => request<void>(`/topics/${id}`, { method: "DELETE" }),
};

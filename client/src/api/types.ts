export interface Brand {
  id: string;
  name: string;
  logo_path: string | null;
  position: number;
  created_at: string;
  vehicle_count?: number;
}

export interface BrandOverview extends Brand {
  vehicles: VehicleSummary[];
}

export interface VehicleSummary {
  id: string;
  brand_id: string;
  name: string;
  position: number;
  created_at: string;
  ticket_count: number;
}

export interface VehicleImage {
  id: string;
  vehicle_id: string;
  path: string;
  position: number;
  created_at: string;
}

export type ProductType = "CC" | "FC" | "PW";

export interface VehicleProduct {
  id: string;
  vehicle_id: string;
  product_type: ProductType;
  image_path: string | null;
  notes: string;
  created_at: string;
}

export type TicketCategory = "Margin" | "Quality" | "Portfolio";
export type TicketPriority = "Low" | "Medium" | "High" | "Critical";

export interface Ticket {
  id: string;
  vehicle_id: string;
  bt_code: string;
  bt_description: string;
  phase: 1 | 2 | 3 | 4 | 5;
  priority: TicketPriority;
  category: TicketCategory;
  position: number;
  created_at: string;
}

export interface Topic {
  id: string;
  vehicle_id: string;
  title: string;
  description: string;
  created_at: string;
}

export interface VehicleDetail {
  id: string;
  brand_id: string;
  name: string;
  position: number;
  created_at: string;
  brand: Brand;
  images: VehicleImage[];
  products: VehicleProduct[];
  tickets: Ticket[];
  topics: Topic[];
}

export interface TicketSummaryRow {
  vehicle_id: string;
  vehicle_name: string;
  brand_id: string;
  brand_name: string;
  ticket_count: number;
  critical_count: number;
  high_count: number;
  margin_count: number;
  quality_count: number;
  portfolio_count: number;
}

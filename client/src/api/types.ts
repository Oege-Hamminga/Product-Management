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
  note_count: number;
}

export type ProductType = "CC" | "FC" | "PW";

export interface VehicleProduct {
  id: string;
  vehicle_id: string;
  product_type: ProductType;
  created_at: string;
}

export type NoteKind = "bugtracker" | "research";
export type NoteCategory = "Margin" | "Quality" | "Portfolio";
export type NotePriority = "Low" | "Medium" | "High" | "Critical";

export interface Note {
  id: string;
  vehicle_id: string;
  kind: NoteKind;
  title: string;
  description: string;
  category: NoteCategory;
  phase: 1 | 2 | 3 | 4 | 5 | null;
  priority: NotePriority | null;
  created_at: string;
}

export interface VehicleDetail {
  id: string;
  brand_id: string;
  name: string;
  position: number;
  created_at: string;
  brand: Brand;
  products: VehicleProduct[];
  notes: Note[];
}

export interface NoteHighlight extends Note {
  vehicle_name: string;
  brand_id: string;
  brand_name: string;
}

export interface NoteSummaryRow {
  vehicle_id: string;
  vehicle_name: string;
  brand_id: string;
  brand_name: string;
  note_count: number;
  critical_count: number;
  high_count: number;
  margin_count: number;
  quality_count: number;
  portfolio_count: number;
}

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
  category_counts: Record<NoteCategory, number>;
  notes: Note[];
}

export type ProductType = "CC" | "FC" | "PW";

export interface VehicleProduct {
  id: string;
  vehicle_id: string;
  product_type: ProductType;
  created_at: string;
}

export type NoteKind = "bt" | "news";
export type NoteCategory = "Margin" | "Quality" | "Portfolio" | "Other";
export type NotePriority = "High" | "Normal";

export interface Note {
  id: string;
  vehicle_id: string;
  kind: NoteKind;
  title: string;
  description: string;
  category: NoteCategory;
  product: ProductType | null;
  priority: NotePriority;
  bt_code: string | null;
  cw_date: string | null;
  phase: 1 | 2 | 3 | 4 | 5 | null;
  completed: boolean;
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

export interface SidebarTopics {
  highPriority: NoteHighlight[];
  weeklyNews: NoteHighlight[];
}

export interface NoteSummaryRow {
  vehicle_id: string;
  vehicle_name: string;
  brand_id: string;
  brand_name: string;
  note_count: number;
  high_count: number;
  margin_count: number;
  quality_count: number;
  portfolio_count: number;
  other_count: number;
}

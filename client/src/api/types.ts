export interface Brand {
  id: string;
  name: string;
  logo_path: string | null;
  position: number;
  slide_id: string | null;
  created_at: string;
  vehicle_count?: number;
}

export interface Slide {
  id: string;
  title: string;
  position: number;
  created_at: string;
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
  hidden_from_slides: boolean;
  show_product_changes: boolean;
  note_count: number;
  category_counts: Record<NoteCategory, number>;
  notes: Note[];
  products: VehicleProduct[];
}

export type ProductType = "CC" | "FC" | "PW";

export interface PhaseCounts {
  ph1: number;
  ph2: number;
  ph3: number;
  ph4: number;
  ph5: number;
}

export interface VehicleProduct extends PhaseCounts {
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
  cw_date_end: string | null;
  phase: 1 | 2 | 3 | 4 | 5 | null;
  completed: boolean;
  long_term: boolean;
  created_at: string;
}

export interface VehicleDetail {
  id: string;
  brand_id: string;
  name: string;
  position: number;
  created_at: string;
  hidden_from_slides: boolean;
  show_product_changes: boolean;
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

export interface SegmentImage {
  vehicle_id: string;
  product_type: ProductType;
  image_path: string;
}

export type UniversalProductChanges = PhaseCounts;

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

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
  slide_weight: number | null;
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

// The subset of each PhaseCounts bucket whose CR status wasn't "On Track" —
// active per phase is derived as ph{n} minus ph{n}_inactive wherever it's
// shown (Slides "Product Changes Overview"), never stored on its own. See
// routes/crImport.ts.
export interface InactivePhaseCounts {
  ph1_inactive: number;
  ph2_inactive: number;
  ph3_inactive: number;
  ph4_inactive: number;
  ph5_inactive: number;
}

export interface VehicleProduct extends PhaseCounts, InactivePhaseCounts {
  id: string;
  vehicle_id: string;
  product_type: ProductType;
  hidden_from_slides: boolean;
  slide_weight: number | null;
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
  position: number;
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
  slide_weight: number | null;
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

export type UniversalProductChanges = PhaseCounts & InactivePhaseCounts;

// Remembers how an external CR/issue-tracker table's "Model (CR)" text maps
// to a real vehicle+product (or to the Universal Product Changes bucket), so
// a Settings-page paste-import can turn its Phase column into ph1-5 counts.
export interface CrModelMapping {
  external_name: string;
  vehicle_id: string | null;
  product: ProductType | null;
  is_universal: boolean;
  vehicle_name: string | null;
  brand_name: string | null;
}

export interface CrImportRow {
  model: string;
  phase: string;
  // Optional CR status text ("On Track", "On Hold", "Not yet started", ...)
  // — only "On Track" counts as active; anything else (including missing)
  // counts as inactive. Drives the Slides "Product Changes Overview"
  // Active/Inactive split.
  status?: string;
}

export interface CrImportUpdate {
  external_name: string;
  vehicle_id: string;
  product: ProductType;
  vehicle_name: string;
  brand_name: string;
  counts: PhaseCounts;
}

export interface CrImportResult {
  updated: CrImportUpdate[];
  universal_counts: PhaseCounts | null;
  unmapped: string[];
  ignored_rows: number;
  total_rows: number;
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

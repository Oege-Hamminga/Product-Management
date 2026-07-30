import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { BrandOverview, Note, ProductType, SegmentImage } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { ArrowUpIcon, ChevronRightIcon, TrashIcon, UploadIcon } from "../components/common/Icons";
import { currentIsoWeek, formatCwDate, formatCwRange, shiftWeek } from "../utils/date";
import "./SlidesPage.css";

const WINDOW_WEEKS = 3; // viewed week + the following two

interface SlideGroup {
  title: string;
  brandNames: string[] | null; // null = catch-all for any brand no earlier slide claims
}

const SLIDE_GROUPS: SlideGroup[] = [
  { title: "Stellantis · KIA · IVECO", brandNames: ["Stellantis", "KIA", "IVECO"] },
  { title: "Volkswagen", brandNames: ["Volkswagen"] },
  { title: "Renault · Ford · Mercedes Benz", brandNames: ["Renault", "Ford", "Mercedes Benz"] },
  { title: "Overall / Universal News", brandNames: null },
];

const PRODUCT_LABEL: Record<ProductType, string> = { CC: "Crew Cab", FC: "Flex Cab", PW: "Partition Wall" };

interface SlideTopic extends Note {
  vehicleName: string;
  brandName: string;
  brandLogo: string | null;
}

interface SegmentTile {
  key: string;
  vehicleId: string;
  vehicleName: string;
  product: ProductType | null;
  brandName: string;
  brandLogo: string | null;
  topics: SlideTopic[];
}

function collectVisibleNews(overview: BrandOverview[], startWeek: string, endWeek: string): SlideTopic[] {
  const out: SlideTopic[] = [];
  overview.forEach((b) => {
    b.vehicles.forEach((v) => {
      v.notes.forEach((n) => {
        if (n.kind !== "news" || n.completed) return;
        // A long-term topic has no specific week — it's always on the board,
        // no matter which week window is being viewed.
        if (n.long_term) {
          out.push({ ...n, vehicleName: v.name, brandName: b.name, brandLogo: b.logo_path });
          return;
        }
        if (!n.cw_date) return;
        const topicEnd = n.cw_date_end && n.cw_date_end > n.cw_date ? n.cw_date_end : n.cw_date;
        // Overlap test: does [cw_date, topicEnd] intersect [startWeek, endWeek]?
        if (topicEnd < startWeek || n.cw_date > endWeek) return;
        out.push({ ...n, vehicleName: v.name, brandName: b.name, brandLogo: b.logo_path });
      });
    });
  });
  return out;
}

function slideIndexForBrand(brandName: string): number {
  const idx = SLIDE_GROUPS.findIndex((g) => g.brandNames?.includes(brandName));
  return idx === -1 ? SLIDE_GROUPS.length - 1 : idx;
}

function segmentKey(vehicleId: string, product: ProductType | null): string {
  return `${vehicleId}:${product ?? "none"}`;
}

// Groups a slide's topics into one tile per (vehicle, product) combination —
// "K0 CC" and "K0 FC" are separate tiles, each stacking its own News rows.
function buildTiles(topics: SlideTopic[]): SegmentTile[] {
  const map = new Map<string, SegmentTile>();
  topics.forEach((t) => {
    const key = segmentKey(t.vehicle_id, t.product);
    let tile = map.get(key);
    if (!tile) {
      tile = {
        key,
        vehicleId: t.vehicle_id,
        vehicleName: t.vehicleName,
        product: t.product,
        brandName: t.brandName,
        brandLogo: t.brandLogo,
        topics: [],
      };
      map.set(key, tile);
    }
    tile.topics.push(t);
  });
  return Array.from(map.values());
}

// A slide's tiles read left-to-right in the group's declared brand order
// (Stellantis, KIA, IVECO — not whatever order brands happen to sit in on
// the Board), falling back to the brand map's own order for the catch-all
// "Overall" slide, which has no fixed brand list of its own.
function sortTiles(tiles: SegmentTile[], group: SlideGroup, brandOrder: Map<string, number>): SegmentTile[] {
  const brandRank = (name: string) => {
    if (group.brandNames) {
      const idx = group.brandNames.indexOf(name);
      return idx === -1 ? 999 : idx;
    }
    return brandOrder.get(name) ?? 999;
  };
  return [...tiles].sort(
    (a, b) =>
      brandRank(a.brandName) - brandRank(b.brandName) ||
      a.vehicleName.localeCompare(b.vehicleName) ||
      (a.product ?? "").localeCompare(b.product ?? "")
  );
}

// More columns as tile count grows, so a slide with many segments still fits
// inside its fixed 16:9 frame instead of overflowing.
function tileColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 8) return 3;
  return 4;
}

const ROW_UNITS = 4; // vertical resolution a tile's size is quantized to

// A tile with more News topics stacked in it becomes visually larger — its
// row-span scales with topic count relative to the busiest tile on the slide.
function tileRowSpan(topicCount: number, maxTopicCount: number): number {
  if (maxTopicCount <= 1) return 1;
  return Math.max(1, Math.round((topicCount / maxTopicCount) * ROW_UNITS));
}

export default function SlidesPage() {
  const { isEditMode } = useAuth();
  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [segmentImages, setSegmentImages] = useState<SegmentImage[]>([]);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [viewedWeek, setViewedWeek] = useState(currentIsoWeek());

  const load = useCallback(async () => {
    try {
      const [ov, images] = await Promise.all([api.getOverview(), api.getSegmentImages()]);
      setOverview(ov);
      setSegmentImages(images);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load the slides.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startWeek = viewedWeek;
  const endWeek = shiftWeek(startWeek, WINDOW_WEEKS - 1);
  const isCurrentWeek = viewedWeek === currentIsoWeek();

  const topics = useMemo(
    () => (overview ? collectVisibleNews(overview, startWeek, endWeek) : []),
    [overview, startWeek, endWeek]
  );

  const brandOrder = useMemo(() => {
    const map = new Map<string, number>();
    (overview ?? []).forEach((b, i) => map.set(b.name, i));
    return map;
  }, [overview]);

  const slides = useMemo(
    () =>
      SLIDE_GROUPS.map((group, i) => ({
        group,
        tiles: sortTiles(buildTiles(topics.filter((t) => slideIndexForBrand(t.brandName) === i)), group, brandOrder),
      })),
    [topics, brandOrder]
  );

  const imageMap = useMemo(() => {
    const map = new Map<string, string>();
    segmentImages.forEach((s) => map.set(segmentKey(s.vehicle_id, s.product_type), s.image_path));
    return map;
  }, [segmentImages]);

  async function handleUpload(vehicleId: string, type: ProductType, file: File) {
    const key = segmentKey(vehicleId, type);
    setUploadingKey(key);
    try {
      const images = await api.uploadSegmentImage(vehicleId, type, file);
      setSegmentImages(images);
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleRemoveImage(vehicleId: string, type: ProductType) {
    const images = await api.deleteSegmentImage(vehicleId, type);
    setSegmentImages(images);
  }

  return (
    <div className="slides-page">
      <div className="slides-hero">
        <div className="container slides-header">
          <div>
            <h1 className="slides-title">Presentation Slides</h1>
            <p className="slides-subtitle">{formatCwRange(startWeek, endWeek)}</p>
          </div>
          <div className="slides-week-nav">
            <button
              type="button"
              className="slides-week-nav-btn"
              title="Previous week"
              onClick={() => setViewedWeek((w) => shiftWeek(w, -1))}
            >
              <ChevronRightIcon width={14} height={14} style={{ transform: "rotate(180deg)" }} />
            </button>
            {!isCurrentWeek && (
              <button type="button" className="slides-week-nav-today" onClick={() => setViewedWeek(currentIsoWeek())}>
                Today
              </button>
            )}
            <button
              type="button"
              className="slides-week-nav-btn"
              title="Next week"
              onClick={() => setViewedWeek((w) => shiftWeek(w, 1))}
            >
              <ChevronRightIcon width={14} height={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="container slides-body">
        {loadError && <p className="error-text">{loadError}</p>}
        {!overview && !loadError && <p className="slides-loading">Loading slides…</p>}

        {overview &&
          slides.map(({ group, tiles }) => (
            <Slide
              key={group.title}
              title={group.title}
              tiles={tiles}
              imageMap={imageMap}
              isEditMode={isEditMode}
              uploadingKey={uploadingKey}
              onUpload={handleUpload}
              onRemove={handleRemoveImage}
            />
          ))}
      </div>
    </div>
  );
}

function Slide({
  title,
  tiles,
  imageMap,
  isEditMode,
  uploadingKey,
  onUpload,
  onRemove,
}: {
  title: string;
  tiles: SegmentTile[];
  imageMap: Map<string, string>;
  isEditMode: boolean;
  uploadingKey: string | null;
  onUpload: (vehicleId: string, type: ProductType, file: File) => void;
  onRemove: (vehicleId: string, type: ProductType) => void;
}) {
  const cols = tileColumns(tiles.length);
  const maxTopicCount = Math.max(1, ...tiles.map((t) => t.topics.length));
  const topicCount = tiles.reduce((sum, t) => sum + t.topics.length, 0);
  return (
    <div className="slide-wrap">
      <div className="slide-label">
        {title}
        <span className="slide-label-count">{topicCount} news</span>
      </div>
      <div className="slide">
        <div
          className="slide-tiles"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${ROW_UNITS}, 1fr)` }}
        >
          {tiles.length === 0 && <div className="slide-empty">No news for this week</div>}
          {tiles.map((tile) => (
            <SegmentTileView
              key={tile.key}
              tile={tile}
              rowSpan={tileRowSpan(tile.topics.length, maxTopicCount)}
              bgImage={tile.product ? imageMap.get(tile.key) ?? null : null}
              isEditMode={isEditMode}
              isUploading={uploadingKey === tile.key}
              onUpload={tile.product ? (file) => onUpload(tile.vehicleId, tile.product!, file) : undefined}
              onRemove={tile.product ? () => onRemove(tile.vehicleId, tile.product!) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SegmentTileView({
  tile,
  rowSpan,
  bgImage,
  isEditMode,
  isUploading,
  onUpload,
  onRemove,
}: {
  tile: SegmentTile;
  rowSpan: number;
  bgImage: string | null;
  isEditMode: boolean;
  isUploading: boolean;
  onUpload?: (file: File) => void;
  onRemove?: () => void;
}) {
  const titleText = tile.product ? `${tile.vehicleName} ${PRODUCT_LABEL[tile.product]}` : tile.vehicleName;
  return (
    <div
      className="segment-tile"
      style={{ gridRow: `span ${rowSpan}`, ...(bgImage ? { backgroundImage: `url(${bgImage})` } : undefined) }}
    >
      <div className="segment-tile-scrim" />
      <div className="segment-tile-header">
        {tile.brandLogo ? (
          <img className="segment-tile-logo" src={tile.brandLogo} alt={tile.brandName} />
        ) : (
          <span className="segment-tile-logo-text">{tile.brandName}</span>
        )}
        <span className="segment-tile-title">{titleText}</span>
      </div>
      <div className="segment-tile-topics">
        {tile.topics.map((t) => (
          <div className="segment-tile-topic-row" key={t.id}>
            {t.priority === "High" && <ArrowUpIcon width={9} height={9} className="segment-tile-topic-priority" />}
            <span className="segment-tile-topic-title">{t.title}</span>
            <span className="segment-tile-topic-badge">
              {t.long_term ? "Long term" : t.cw_date ? formatCwDate(t.cw_date) : ""}
            </span>
          </div>
        ))}
      </div>
      {isEditMode && onUpload && (
        <div className="segment-tile-image-actions">
          <label className="segment-tile-image-btn" title={bgImage ? "Replace this segment's image" : "Set this segment's image"}>
            <UploadIcon width={11} height={11} />
            {isUploading ? "…" : bgImage ? "Replace" : "Image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          {bgImage && onRemove && (
            <button type="button" className="segment-tile-image-btn segment-tile-image-btn-remove" onClick={onRemove}>
              <TrashIcon width={11} height={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { BrandOverview, Note, PhaseCounts, ProductType, SegmentImage, UniversalProductChanges } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { ArrowUpIcon, ChevronRightIcon, PlusIcon } from "../components/common/Icons";
import { currentIsoWeek, formatCwDate, formatCwRange, shiftWeek } from "../utils/date";
import AddNewsTopicModal from "./AddNewsTopicModal";
import "./SlidesPage.css";

const WINDOW_WEEKS = 3; // viewed week + the following two
const PHASE_KEYS = ["ph1", "ph2", "ph3", "ph4", "ph5"] as const;
const ZERO_PHASE_COUNTS: PhaseCounts = { ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0 };

interface SlideGroup {
  title: string;
  brandNames: string[] | null; // null = catch-all for any brand no earlier slide claims
  isUniversal?: boolean;
}

const SLIDE_GROUPS: SlideGroup[] = [
  { title: "Stellantis · KIA · IVECO", brandNames: ["Stellantis", "KIA", "IVECO"] },
  { title: "Volkswagen", brandNames: ["Volkswagen"] },
  { title: "Renault · Ford · Mercedes Benz", brandNames: ["Renault", "Ford", "Mercedes Benz"] },
  { title: "Overall / Universal News", brandNames: null, isUniversal: true },
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
  phaseCounts: PhaseCounts | null;
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

// One tile per (vehicle, product) — seeded from every registered product so
// a segment with zero current News still shows up (and its Product Changes
// box stays fillable), then every visible topic is stacked into its tile.
function buildTilesForGroup(brandsInGroup: BrandOverview[], topicsInGroup: SlideTopic[]): SegmentTile[] {
  const map = new Map<string, SegmentTile>();

  brandsInGroup.forEach((brand) => {
    brand.vehicles.forEach((vehicle) => {
      (vehicle.products ?? []).forEach((vp) => {
        const key = segmentKey(vehicle.id, vp.product_type);
        map.set(key, {
          key,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
          product: vp.product_type,
          brandName: brand.name,
          brandLogo: brand.logo_path,
          topics: [],
          phaseCounts: {
            ph1: vp.ph1 ?? 0,
            ph2: vp.ph2 ?? 0,
            ph3: vp.ph3 ?? 0,
            ph4: vp.ph4 ?? 0,
            ph5: vp.ph5 ?? 0,
          },
        });
      });
    });
  });

  topicsInGroup.forEach((t) => {
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
        // Not yet a registered vehicle_products row — still show a fillable
        // box (updateVehicleProductPhases auto-registers it on first edit).
        phaseCounts: t.product ? { ...ZERO_PHASE_COUNTS } : null,
      };
      map.set(key, tile);
    }
    tile.topics.push(t);
  });

  return Array.from(map.values());
}

// A slide's tiles read left-to-right in the group's declared brand order
// (Stellantis, KIA, IVECO — not whatever order brands happen to sit in
// elsewhere), falling back to the overview's own order for the catch-all
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

// Splits the (already brand-ordered) tiles into `cols` contiguous, roughly
// even chunks — one per visual column — so reading order stays left-to-right
// while each column stacks its own tiles top-to-bottom.
function chunkIntoColumns(tiles: SegmentTile[], cols: number): SegmentTile[][] {
  const buckets: SegmentTile[][] = Array.from({ length: cols }, () => []);
  const perCol = Math.max(1, Math.ceil(tiles.length / cols));
  tiles.forEach((tile, i) => {
    buckets[Math.min(cols - 1, Math.floor(i / perCol))].push(tile);
  });
  return buckets;
}

export default function SlidesPage() {
  const { isEditMode } = useAuth();
  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [segmentImages, setSegmentImages] = useState<SegmentImage[]>([]);
  const [universalChanges, setUniversalChanges] = useState<UniversalProductChanges>(ZERO_PHASE_COUNTS);
  const [viewedWeek, setViewedWeek] = useState(currentIsoWeek());
  const [addingTopic, setAddingTopic] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ov, images, universal] = await Promise.all([
        api.getOverview(),
        api.getSegmentImages(),
        api.getUniversalProductChanges(),
      ]);
      setOverview(ov);
      setSegmentImages(images);
      setUniversalChanges(universal);
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

  // Grand total across every vehicle+product's Product Changes counts,
  // everywhere — not just the segments shown on any one slide.
  const totalChanges = useMemo(() => {
    const total: PhaseCounts = { ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0 };
    (overview ?? []).forEach((b) =>
      b.vehicles.forEach((v) =>
        (v.products ?? []).forEach((vp) => {
          total.ph1 += vp.ph1 ?? 0;
          total.ph2 += vp.ph2 ?? 0;
          total.ph3 += vp.ph3 ?? 0;
          total.ph4 += vp.ph4 ?? 0;
          total.ph5 += vp.ph5 ?? 0;
        })
      )
    );
    return total;
  }, [overview]);

  const slides = useMemo(() => {
    if (!overview) return [];
    return SLIDE_GROUPS.map((group, i) => {
      const brandsInGroup = overview.filter((b) => slideIndexForBrand(b.name) === i);
      const topicsInGroup = topics.filter((t) => slideIndexForBrand(t.brandName) === i);
      return { group, tiles: sortTiles(buildTilesForGroup(brandsInGroup, topicsInGroup), group, brandOrder) };
    });
  }, [overview, topics, brandOrder]);

  const imageMap = useMemo(() => {
    const map = new Map<string, string>();
    segmentImages.forEach((s) => map.set(segmentKey(s.vehicle_id, s.product_type), s.image_path));
    return map;
  }, [segmentImages]);

  async function handlePhaseChange(vehicleId: string, type: ProductType, key: keyof PhaseCounts, value: number) {
    await api.updateVehicleProductPhases(vehicleId, type, { [key]: value });
    await load();
  }

  async function handleUniversalPhaseChange(key: keyof PhaseCounts, value: number) {
    const next = await api.updateUniversalProductChanges({ [key]: value });
    setUniversalChanges(next);
  }

  return (
    <div className="slides-page">
      <div className="slides-hero">
        <div className="container slides-header">
          <div>
            <h1 className="slides-title">Presentation Slides</h1>
            <p className="slides-subtitle">{formatCwRange(startWeek, endWeek)}</p>
          </div>
          <div className="slides-header-actions">
            {isEditMode && (
              <button type="button" className="slides-add-btn" title="Add a news topic" onClick={() => setAddingTopic(true)}>
                <PlusIcon width={16} height={16} />
              </button>
            )}
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
              onPhaseChange={handlePhaseChange}
              universal={group.isUniversal ? universalChanges : undefined}
              total={group.isUniversal ? totalChanges : undefined}
              onUniversalPhaseChange={handleUniversalPhaseChange}
            />
          ))}
      </div>

      {addingTopic && overview && (
        <AddNewsTopicModal overview={overview} onClose={() => setAddingTopic(false)} onSaved={load} />
      )}
    </div>
  );
}

function Slide({
  title,
  tiles,
  imageMap,
  isEditMode,
  onPhaseChange,
  universal,
  total,
  onUniversalPhaseChange,
}: {
  title: string;
  tiles: SegmentTile[];
  imageMap: Map<string, string>;
  isEditMode: boolean;
  onPhaseChange: (vehicleId: string, type: ProductType, key: keyof PhaseCounts, value: number) => void;
  universal?: UniversalProductChanges;
  total?: PhaseCounts;
  onUniversalPhaseChange: (key: keyof PhaseCounts, value: number) => void;
}) {
  const cols = tileColumns(tiles.length);
  const columns = chunkIntoColumns(tiles, cols);
  const topicCount = tiles.reduce((sum, t) => sum + t.topics.length, 0);
  return (
    <div className="slide-wrap">
      <div className="slide-label">
        {title}
        <span className="slide-label-count">{topicCount} news</span>
      </div>
      <div className="slide">
        <div className="slide-tiles">
          {tiles.length === 0 && !universal && <div className="slide-empty">No news for this week</div>}
          {columns.map((colTiles, ci) => (
            <div className="slide-tile-column" key={ci}>
              {colTiles.map((tile) => (
                <SegmentTileView
                  key={tile.key}
                  tile={tile}
                  weight={Math.max(1, tile.topics.length)}
                  bgImage={tile.product ? imageMap.get(tile.key) ?? null : null}
                  isEditMode={isEditMode}
                  onPhaseChange={
                    tile.product ? (key, value) => onPhaseChange(tile.vehicleId, tile.product!, key, value) : undefined
                  }
                />
              ))}
            </div>
          ))}
        </div>
        {universal && (
          <div className="slide-bottom-changes">
            <ProductChangesBox
              title="Product Changes · Universal"
              counts={universal}
              isEditMode={isEditMode}
              onChange={onUniversalPhaseChange}
            />
            {total && (
              <ProductChangesBox title="Product Changes · Total" counts={total} isEditMode={false} onChange={() => {}} readOnly />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentTileView({
  tile,
  weight,
  bgImage,
  isEditMode,
  onPhaseChange,
}: {
  tile: SegmentTile;
  weight: number;
  bgImage: string | null;
  isEditMode: boolean;
  onPhaseChange?: (key: keyof PhaseCounts, value: number) => void;
}) {
  const titleText = tile.product ? `${tile.vehicleName} ${PRODUCT_LABEL[tile.product]}` : tile.vehicleName;
  return (
    <div
      className="segment-tile"
      style={{ flex: `${weight} 1 0`, ...(bgImage ? { backgroundImage: `url(${bgImage})` } : undefined) }}
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
        {tile.topics.length === 0 && <span className="segment-tile-no-news">No news this week</span>}
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
      {tile.phaseCounts && onPhaseChange && (
        <ProductChangesBox
          title="Product Changes - BT"
          counts={tile.phaseCounts}
          isEditMode={isEditMode}
          onChange={onPhaseChange}
          compact
        />
      )}
    </div>
  );
}

function ProductChangesBox({
  title,
  counts,
  isEditMode,
  onChange,
  compact,
  readOnly,
}: {
  title: string;
  counts: PhaseCounts;
  isEditMode: boolean;
  onChange: (key: keyof PhaseCounts, value: number) => void;
  compact?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className={`product-changes${compact ? " product-changes-compact" : ""}`}>
      <span className="product-changes-title">{title}</span>
      <div className="product-changes-cells">
        {PHASE_KEYS.map((key, i) => (
          <label className="product-changes-cell" key={key}>
            <span className="product-changes-cell-label">Ph{i + 1}</span>
            {isEditMode && !readOnly ? (
              <input
                type="number"
                min={0}
                className="product-changes-input"
                defaultValue={counts[key]}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0 && Math.round(v) !== counts[key]) onChange(key, Math.round(v));
                  else e.target.value = String(counts[key]);
                }}
              />
            ) : (
              <span className="product-changes-value">{counts[key]}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

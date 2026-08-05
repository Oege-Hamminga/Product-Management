import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toBlob, toPng } from "html-to-image";
import { api, ApiError } from "../api/client";
import type {
  BrandOverview,
  Note,
  PhaseCounts,
  ProductType,
  SegmentImage,
  Slide as SlideEntity,
  UniversalProductChanges,
} from "../api/types";
import { useAuth } from "../context/AuthContext";
import { ArrowUpIcon, ChevronRightIcon, CopyIcon, DownloadIcon, MinusCircleIcon, PlusIcon } from "../components/common/Icons";
import { currentIsoWeek, formatCwRange, formatCwShort, shiftWeek } from "../utils/date";
import AddNewsTopicModal from "./AddNewsTopicModal";
import "./SlidesPage.css";

const WINDOW_WEEKS = 3; // viewed week + the following two
const PHASE_KEYS = ["ph1", "ph2", "ph3", "ph4", "ph5"] as const;
const ZERO_PHASE_COUNTS: PhaseCounts = { ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0 };

const PRODUCT_LABEL: Record<ProductType, string> = { CC: "Crew Cab", FC: "Flex Cab", PW: "Partition Wall" };

// Per-brand adjustment on top of the shared .segment-tile-logo size — Ford's
// logo reads oversized at the shared size, Stellantis's undersized.
const LOGO_SIZE_CLASS: Record<string, string> = {
  Ford: " segment-tile-logo-ford",
  Stellantis: " segment-tile-logo-stellantis",
};

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
  // A manual size set by dragging the split line between two stacked tiles
  // (see TileSplitter) — null means "size automatically from topic count",
  // today's original behaviour.
  weightOverride: number | null;
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

// A brand's slide is whichever one it's explicitly assigned to from
// Settings; unassigned (or assigned to a slide that's since been deleted)
// falls back to whichever slide is last, matching the old catch-all
// behaviour before Slides were admin-configurable.
function slideIndexForBrand(brand: { slide_id: string | null }, slides: SlideEntity[]): number {
  const idx = slides.findIndex((s) => s.id === brand.slide_id);
  return idx === -1 ? slides.length - 1 : idx;
}

function segmentKey(vehicleId: string, product: ProductType | null): string {
  return `${vehicleId}:${product ?? "none"}`;
}

// One tile per (vehicle, product) — seeded from every registered product so
// a segment with zero current News still shows up (and its Product Changes
// box stays fillable), then every visible topic is stacked into its tile.
function buildTilesForGroup(brandsInGroup: BrandOverview[], topicsInGroup: SlideTopic[]): SegmentTile[] {
  const map = new Map<string, SegmentTile>();

  // Per-model toggle (Settings, left of the CC/FC/PW buttons) — hides a
  // model's Product Changes box on Slides and excludes it from the Total
  // Product Changes sum. Looked up by vehicle so it applies whether the
  // tile came from a registered product or from a topic (below).
  const showChangesByVehicle = new Map<string, boolean>();
  brandsInGroup.forEach((brand) =>
    brand.vehicles.forEach((v) => showChangesByVehicle.set(v.id, v.show_product_changes))
  );

  brandsInGroup.forEach((brand) => {
    brand.vehicles.forEach((vehicle) => {
      (vehicle.products ?? []).forEach((vp) => {
        // A hidden segment doesn't get a tile at all — that's the whole
        // point of hiding one (decluttering a busy slide) — so its News
        // topics don't resurrect it either (topicsInGroup is pre-filtered
        // for this). A sibling product for the same model is untouched.
        if (vp.hidden_from_slides) return;
        const key = segmentKey(vehicle.id, vp.product_type);
        map.set(key, {
          key,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
          product: vp.product_type,
          brandName: brand.name,
          brandLogo: brand.logo_path,
          topics: [],
          phaseCounts: vehicle.show_product_changes
            ? {
                ph1: vp.ph1 ?? 0,
                ph2: vp.ph2 ?? 0,
                ph3: vp.ph3 ?? 0,
                ph4: vp.ph4 ?? 0,
                ph5: vp.ph5 ?? 0,
              }
            : null,
          weightOverride: vp.slide_weight ?? null,
        });
      });
      // Every "model" under the reserved "Overall News" brand is really a
      // news category with no products, so it would never get a tile from
      // the loop above — seed one directly per category so each is always
      // visible (matching every real model's default), not just when it
      // happens to have a topic this week. A category has only this one
      // segment, so it still hides via the vehicle-level flag.
      if (brand.name === "Overall News" && !vehicle.hidden_from_slides) {
        const key = segmentKey(vehicle.id, null);
        if (!map.has(key)) {
          map.set(key, {
            key,
            vehicleId: vehicle.id,
            vehicleName: vehicle.name,
            product: null,
            brandName: brand.name,
            brandLogo: brand.logo_path,
            topics: [],
            phaseCounts: null,
            weightOverride: vehicle.slide_weight ?? null,
          });
        }
      }
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
        // box (updateVehicleProductPhases auto-registers it on first edit),
        // unless this model's Product Changes box has been toggled off.
        phaseCounts: t.product && showChangesByVehicle.get(t.vehicle_id) !== false ? { ...ZERO_PHASE_COUNTS } : null,
        // Same story — no registered row yet to carry a manual size either,
        // so this tile always starts out automatically sized.
        weightOverride: null,
      };
      map.set(key, tile);
    }
    tile.topics.push(t);
  });

  // Long-term topics (no specific week, always on the board) always sort
  // below every calendar-week topic within a tile; within each of those two
  // groups, lowest position first — the order a drag-reorder in edit mode
  // sets, defaulting to creation order for topics never manually reordered.
  map.forEach((tile) => {
    tile.topics.sort((a, b) => Number(a.long_term) - Number(b.long_term) || (a.position ?? 0) - (b.position ?? 0));
  });

  return Array.from(map.values());
}

// A slide's tiles read left-to-right in the brand's overview order, with
// the reserved "Overall News" brand always first on whichever slide it
// lands on.
function sortTiles(tiles: SegmentTile[], brandOrder: Map<string, number>): SegmentTile[] {
  const brandRank = (name: string) => (name === "Overall News" ? -1 : brandOrder.get(name) ?? 999);
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
  const [slideList, setSlideList] = useState<SlideEntity[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [segmentImages, setSegmentImages] = useState<SegmentImage[]>([]);
  const [universalChanges, setUniversalChanges] = useState<UniversalProductChanges>(ZERO_PHASE_COUNTS);
  const [viewedWeek, setViewedWeek] = useState(currentIsoWeek());
  const [addingTopic, setAddingTopic] = useState(false);
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    try {
      const [ov, sl, images, universal] = await Promise.all([
        api.getOverview(),
        api.getSlides(),
        api.getSegmentImages(),
        api.getUniversalProductChanges(),
      ]);
      setOverview(ov);
      setSlideList(sl);
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

  // Every segment (vehicle + product) shows on Slides by default; hiding one
  // is a display-only toggle (its data — the product, its topics, its
  // Product Changes — is untouched) and, importantly, per segment: hiding
  // "K0 Crew Cab" leaves "K0 Flex Cab" alone. An "Overall News" category
  // (product-less) only ever has the one segment, so it still hides via the
  // vehicle-level flag.
  const hiddenSegmentKeys = useMemo(() => {
    const set = new Set<string>();
    (overview ?? []).forEach((b) =>
      b.vehicles.forEach((v) => {
        if (b.name === "Overall News") {
          if (v.hidden_from_slides) set.add(segmentKey(v.id, null));
          return;
        }
        (v.products ?? []).forEach((vp) => {
          if (vp.hidden_from_slides) set.add(segmentKey(v.id, vp.product_type));
        });
      })
    );
    return set;
  }, [overview]);

  const hiddenSegments = useMemo(() => {
    const out: { key: string; vehicleId: string; product: ProductType | null; name: string; brandName: string }[] = [];
    (overview ?? []).forEach((b) =>
      b.vehicles.forEach((v) => {
        if (b.name === "Overall News") {
          if (v.hidden_from_slides) out.push({ key: segmentKey(v.id, null), vehicleId: v.id, product: null, name: v.name, brandName: b.name });
          return;
        }
        (v.products ?? []).forEach((vp) => {
          if (vp.hidden_from_slides) {
            out.push({ key: segmentKey(v.id, vp.product_type), vehicleId: v.id, product: vp.product_type, name: v.name, brandName: b.name });
          }
        });
      })
    );
    return out.sort(
      (a, b) => a.brandName.localeCompare(b.brandName) || a.name.localeCompare(b.name) || (a.product ?? "").localeCompare(b.product ?? "")
    );
  }, [overview]);

  const topics = useMemo(
    () =>
      overview
        ? collectVisibleNews(overview, startWeek, endWeek).filter((t) => !hiddenSegmentKeys.has(segmentKey(t.vehicle_id, t.product)))
        : [],
    [overview, startWeek, endWeek, hiddenSegmentKeys]
  );

  const brandOrder = useMemo(() => {
    const map = new Map<string, number>();
    (overview ?? []).forEach((b, i) => map.set(b.name, i));
    return map;
  }, [overview]);

  const brandsByName = useMemo(() => {
    const map = new Map<string, BrandOverview>();
    (overview ?? []).forEach((b) => map.set(b.name, b));
    return map;
  }, [overview]);

  // Grand total across every vehicle+product's Product Changes counts,
  // everywhere — not just the segments shown on any one slide. Deliberately
  // ignores the per-model Product Changes visibility toggle in Settings: a
  // model can be hidden from its own tile and still count here, so the
  // total on the last slide always reflects the real overall status even if
  // every individual box has been switched off.
  const totalChanges = useMemo(() => {
    const total: PhaseCounts = { ph1: 0, ph2: 0, ph3: 0, ph4: 0, ph5: 0 };
    (overview ?? []).forEach((b) =>
      b.vehicles.forEach((v) => {
        (v.products ?? []).forEach((vp) => {
          total.ph1 += vp.ph1 ?? 0;
          total.ph2 += vp.ph2 ?? 0;
          total.ph3 += vp.ph3 ?? 0;
          total.ph4 += vp.ph4 ?? 0;
          total.ph5 += vp.ph5 ?? 0;
        });
      })
    );
    return total;
  }, [overview]);

  const slidesWithTiles = useMemo(() => {
    if (!overview || slideList.length === 0) return [];
    return slideList.map((slide, i) => {
      const brandsInGroup = overview.filter((b) => slideIndexForBrand(b, slideList) === i);
      const topicsInGroup = topics.filter((t) => slideIndexForBrand(brandsByName.get(t.brandName) ?? { slide_id: null }, slideList) === i);
      return { slide, tiles: sortTiles(buildTilesForGroup(brandsInGroup, topicsInGroup), brandOrder) };
    });
  }, [overview, slideList, topics, brandOrder, brandsByName]);

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

  // A category tile (Overall News, product === null) only ever has one
  // segment, so it still hides via the vehicle-level flag; every other tile
  // hides via its own (vehicle, product) segment so its sibling products are
  // untouched.
  async function handleSetHidden(vehicleId: string, product: ProductType | null, hidden: boolean) {
    if (product) await api.setSegmentHidden(vehicleId, product, hidden);
    else await api.setVehicleHiddenFromSlides(vehicleId, hidden);
    await load();
  }

  // Reordering only ever happens within one of a tile's two groups (regular
  // topics, or long-term ones) — long-term topics always sort below regular
  // ones regardless of drag, so a drag across that boundary is a no-op.
  async function handleReorderTopic(tile: SegmentTile, draggedId: string, targetId: string) {
    const dragged = tile.topics.find((t) => t.id === draggedId);
    const target = tile.topics.find((t) => t.id === targetId);
    if (!dragged || !target || dragged.long_term !== target.long_term) return;
    const group = tile.topics.filter((t) => t.long_term === dragged.long_term);
    const from = group.findIndex((t) => t.id === draggedId);
    const to = group.findIndex((t) => t.id === targetId);
    const reordered = [...group];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    await Promise.all(reordered.map((t, i) => (t.position === i ? null : api.updateNote(t.id, { position: i }))));
    await load();
  }

  // The split-line between two stacked tiles — null resets a tile back to
  // automatic (topic-count-based) sizing. An "Overall News" category tile
  // (product === null, a single segment) sets its weight on the vehicle
  // itself; every other tile sets it on its own (vehicle, product) segment,
  // matching the same dispatch handleSetHidden already uses.
  async function handleSetWeights(a: SegmentTile, aWeight: number | null, b: SegmentTile, bWeight: number | null) {
    await Promise.all([
      a.product ? api.setSegmentWeight(a.vehicleId, a.product, aWeight) : api.setVehicleWeight(a.vehicleId, aWeight),
      b.product ? api.setSegmentWeight(b.vehicleId, b.product, bWeight) : api.setVehicleWeight(b.vehicleId, bWeight),
    ]);
    await load();
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
            <button type="button" className="slides-add-btn" title="Add a news topic" onClick={() => setAddingTopic(true)}>
              <PlusIcon width={16} height={16} />
            </button>
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

      {isEditMode && hiddenSegments.length > 0 && (
        <div className="container hidden-models-bar">
          <span className="hidden-models-label">Hidden from Slides</span>
          <div className="hidden-models-chips">
            {hiddenSegments.map((s) => (
              <button
                key={s.key}
                type="button"
                className="hidden-models-chip"
                onClick={() => handleSetHidden(s.vehicleId, s.product, false)}
                title={`Show ${s.brandName} ${s.name}${s.product ? ` ${PRODUCT_LABEL[s.product]}` : ""} on Slides again`}
              >
                <PlusIcon width={10} height={10} /> {s.brandName} {s.name}
                {s.product ? ` ${PRODUCT_LABEL[s.product]}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="container slides-body">
        {loadError && <p className="error-text">{loadError}</p>}
        {!overview && !loadError && <p className="slides-loading">Loading slides…</p>}

        {overview &&
          slidesWithTiles.map(({ slide, tiles }, i) => (
            <div className="slide-row-with-actions" key={slide.id}>
              <Slide
                title={slide.title}
                tiles={tiles}
                imageMap={imageMap}
                isEditMode={isEditMode}
                onPhaseChange={handlePhaseChange}
                onHideSegment={(vehicleId, product) => handleSetHidden(vehicleId, product, true)}
                onReorderTopic={handleReorderTopic}
                onSetWeights={handleSetWeights}
                universal={universalChanges}
                onUniversalPhaseChange={handleUniversalPhaseChange}
                total={i === slidesWithTiles.length - 1 ? totalChanges : undefined}
                setSlideRef={(el) => {
                  slideRefs.current[slide.id] = el;
                }}
              />
              <SlideActions slideId={slide.id} slideTitle={slide.title} slideRefs={slideRefs} />
            </div>
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
  onHideSegment,
  onReorderTopic,
  onSetWeights,
  universal,
  total,
  onUniversalPhaseChange,
  setSlideRef,
}: {
  title: string;
  tiles: SegmentTile[];
  imageMap: Map<string, string>;
  isEditMode: boolean;
  onPhaseChange: (vehicleId: string, type: ProductType, key: keyof PhaseCounts, value: number) => void;
  onHideSegment: (vehicleId: string, product: ProductType | null) => void;
  onReorderTopic: (tile: SegmentTile, draggedId: string, targetId: string) => void;
  onSetWeights: (a: SegmentTile, aWeight: number | null, b: SegmentTile, bWeight: number | null) => Promise<void>;
  universal: UniversalProductChanges;
  total?: PhaseCounts;
  onUniversalPhaseChange: (key: keyof PhaseCounts, value: number) => void;
  setSlideRef: (el: HTMLDivElement | null) => void;
}) {
  const cols = tileColumns(tiles.length);
  const columns = chunkIntoColumns(tiles, cols);
  const topicCount = tiles.reduce((sum, t) => sum + t.topics.length, 0);
  // The busiest model on the slide is the most presentation-worthy one — give
  // it a visibly bigger, more prominent tile so it stands out at a glance.
  // Only kicks in once there's actual news to compare and more than one tile
  // to stand out among, and only for tiles nobody has manually resized.
  const maxTopicCount = tiles.reduce((max, t) => Math.max(max, t.topics.length), 0);
  const heroKeys = new Set(
    maxTopicCount > 0 && tiles.length > 1 ? tiles.filter((t) => t.topics.length === maxTopicCount).map((t) => t.key) : []
  );

  const tileElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // Live values shown mid-drag, before the split-line release persists them
  // and a reload bakes them into the tiles themselves.
  const [dragWeights, setDragWeights] = useState<Record<string, number>>({});

  function weightFor(tile: SegmentTile): number {
    if (dragWeights[tile.key] !== undefined) return dragWeights[tile.key];
    if (tile.weightOverride != null) return tile.weightOverride;
    return Math.max(1, tile.topics.length) * (heroKeys.has(tile.key) ? 1.6 : 1);
  }

  function handleSplitterMouseDown(e: React.MouseEvent, above: SegmentTile, below: SegmentTile) {
    e.preventDefault();
    const aboveEl = tileElsRef.current.get(above.key);
    const belowEl = tileElsRef.current.get(below.key);
    if (!aboveEl || !belowEl) return;
    const startY = e.clientY;
    const aboveStartPx = aboveEl.getBoundingClientRect().height;
    const belowStartPx = belowEl.getBoundingClientRect().height;
    const totalPx = aboveStartPx + belowStartPx;
    const totalWeight = weightFor(above) + weightFor(below);
    const pxPerWeight = totalPx / totalWeight;
    const minPx = 40;

    function weightsAt(clientY: number) {
      const deltaY = clientY - startY;
      const abovePx = Math.max(minPx, Math.min(totalPx - minPx, aboveStartPx + deltaY));
      const belowPx = totalPx - abovePx;
      return { aboveWeight: abovePx / pxPerWeight, belowWeight: belowPx / pxPerWeight };
    }

    function onMove(ev: MouseEvent) {
      const { aboveWeight, belowWeight } = weightsAt(ev.clientY);
      setDragWeights((prev) => ({ ...prev, [above.key]: aboveWeight, [below.key]: belowWeight }));
    }

    async function onUp(ev: MouseEvent) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const { aboveWeight, belowWeight } = weightsAt(ev.clientY);
      await onSetWeights(above, aboveWeight, below, belowWeight);
      setDragWeights((prev) => {
        const next = { ...prev };
        delete next[above.key];
        delete next[below.key];
        return next;
      });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="slide-wrap">
      <div className="slide-label">
        {title}
        <span className="slide-label-count">{topicCount} news</span>
      </div>
      {/* Copy/Download capture only this box, not the label above — so the
          exported image is just the tile grid, ready to paste straight into
          a template slide that already has its own title. */}
      <div className="slide" ref={setSlideRef}>
        <div className="slide-tiles">
          {tiles.length === 0 && !total && <div className="slide-empty">No news for this week</div>}
          {columns.map((colTiles, ci) => (
            <div className="slide-tile-column" key={ci}>
              {colTiles.map((tile, ti) => {
                const isHero = heroKeys.has(tile.key);
                // The legacy "Universal Product Changes" counts (not tied to
                // any one customer) live inside this specific news
                // category's own tile, wherever it's been placed, instead of
                // a separate always-shown box.
                const isUniversalTile = tile.brandName === "Overall News" && tile.vehicleName === "Universal Product Changes";
                const nextTile = colTiles[ti + 1];
                return (
                  <div className="segment-tile-slot" key={tile.key} style={{ flex: `${weightFor(tile)} 1 0` }}>
                    <SegmentTileView
                      tile={isUniversalTile ? { ...tile, phaseCounts: universal } : tile}
                      rootRef={(el) => {
                        if (el) tileElsRef.current.set(tile.key, el);
                        else tileElsRef.current.delete(tile.key);
                      }}
                      isHero={isHero}
                      bgImage={tile.product ? imageMap.get(tile.key) ?? null : null}
                      isEditMode={isEditMode}
                      onPhaseChange={
                        isUniversalTile
                          ? onUniversalPhaseChange
                          : tile.product
                            ? (key, value) => onPhaseChange(tile.vehicleId, tile.product!, key, value)
                            : undefined
                      }
                      onHide={() => onHideSegment(tile.vehicleId, tile.product)}
                      onReorderTopic={(draggedId, targetId) => onReorderTopic(tile, draggedId, targetId)}
                    />
                    {isEditMode && nextTile && (
                      <div
                        className="tile-splitter"
                        title="Drag to resize — double-click to reset"
                        onMouseDown={(e) => handleSplitterMouseDown(e, tile, nextTile)}
                        onDoubleClick={() => onSetWeights(tile, null, nextTile, null)}
                      >
                        <span className="tile-splitter-grip" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {total && (
          <div className="slide-bottom-changes">
            <ProductChangesBox title="Total Product Changes" counts={total} isEditMode={false} onChange={() => {}} readOnly />
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentTileView({
  tile,
  rootRef,
  isHero,
  bgImage,
  isEditMode,
  onPhaseChange,
  onHide,
  onReorderTopic,
}: {
  tile: SegmentTile;
  rootRef: (el: HTMLDivElement | null) => void;
  isHero?: boolean;
  bgImage: string | null;
  isEditMode: boolean;
  onPhaseChange?: (key: keyof PhaseCounts, value: number) => void;
  onHide: () => void;
  onReorderTopic: (draggedId: string, targetId: string) => void;
}) {
  const productLabel = tile.product ? PRODUCT_LABEL[tile.product] : null;
  // News-category tiles aren't tied to a customer, so there's no brand badge
  // to show — the tile title already names the category.
  const isOverallNews = tile.brandName === "Overall News";
  return (
    <div
      ref={rootRef}
      className={`segment-tile${isHero ? " segment-tile-hero" : ""}`}
      // Set as a custom property (read by .segment-tile::before) rather than
      // background-image directly on this element, so the hero zoom below
      // can scale just the photo layer via transform without also scaling
      // the tile's text content.
      style={bgImage ? ({ "--tile-bg-image": `url(${bgImage})` } as CSSProperties) : undefined}
    >
      <div className="segment-tile-scrim" />
      {isEditMode && (
        <button
          type="button"
          className="segment-tile-hide-btn"
          title={`Remove ${tile.vehicleName} from Slides`}
          onClick={onHide}
        >
          <MinusCircleIcon width={13} height={13} />
        </button>
      )}
      <div className="segment-tile-header">
        {!isOverallNews &&
          (tile.brandLogo ? (
            <img
              className={`segment-tile-logo${LOGO_SIZE_CLASS[tile.brandName] ?? ""}`}
              src={tile.brandLogo}
              alt={tile.brandName}
            />
          ) : (
            <span className="segment-tile-logo-text">{tile.brandName}</span>
          ))}
        <span className="segment-tile-title">
          {tile.vehicleName}
          {productLabel && <span className="segment-tile-title-product"> {productLabel}</span>}
        </span>
      </div>
      <div className="segment-tile-topics">
        {tile.topics.length === 0 && <span className="segment-tile-no-news">No news this week</span>}
        {tile.topics.map((t) => {
          // Highlighted in red when the real current calendar week falls
          // within this topic's week (or week range) — makes this week's
          // discussion items stand out from ones shown early/late in the
          // 3-week preview window.
          const thisWeek = currentIsoWeek();
          const isCurrentWeekTopic =
            !t.long_term && !!t.cw_date && t.cw_date <= thisWeek && (t.cw_date_end ?? t.cw_date) >= thisWeek;
          return (
            <div
              className={`segment-tile-topic-row${isEditMode ? " segment-tile-topic-row-draggable" : ""}${
                isCurrentWeekTopic ? " segment-tile-topic-row-current" : ""
              }`}
              key={t.id}
              draggable={isEditMode}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", t.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (isEditMode) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData("text/plain");
                if (draggedId && draggedId !== t.id) onReorderTopic(draggedId, t.id);
              }}
            >
              {t.priority === "High" && <ArrowUpIcon width={12} height={12} className="segment-tile-topic-priority" />}
              <span className="segment-tile-topic-title">{t.title}</span>
              <span className="segment-tile-topic-badge">
                {t.long_term ? "Long term" : t.cw_date ? formatCwShort(t.cw_date) : ""}
              </span>
            </div>
          );
        })}
      </div>
      {tile.phaseCounts && onPhaseChange && (
        <ProductChangesBox
          title="Product Changes"
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

function slideFilename(title: string): string {
  const safe = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "slide";
  return `${safe}.png`;
}

// Renders a slide's DOM node to a PNG so it can be copied or downloaded and
// pasted straight into a PowerPoint deck — sits beside the slide (not
// overlaid on it) so it never shows up in the exported image itself.
function SlideActions({
  slideId,
  slideTitle,
  slideRefs,
}: {
  slideId: string;
  slideTitle: string;
  slideRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
}) {
  const [status, setStatus] = useState<"idle" | "busy" | "copied" | "downloaded" | "error">("idle");

  function flashStatus(next: "copied" | "downloaded") {
    setStatus(next);
    setTimeout(() => setStatus("idle"), 1800);
  }

  async function handleCopy() {
    const node = slideRefs.current[slideId];
    if (!node) return;
    setStatus("busy");
    try {
      // No cacheBust: it appends a ?query to every resource URL before
      // fetching it, including the blob: URLs the standalone build uses for
      // uploaded images — that turns them into unresolvable URLs and the
      // export silently drops those images. Every upload already gets a
      // fresh filename/blob (never reused), so cache-busting was never
      // actually needed here.
      // The blob promise is handed straight to ClipboardItem (rather than
      // awaited first) so the write() call itself fires in the same tick as
      // the click — awaiting the render first, on a slide with several
      // images, can take long enough that the browser treats the click's
      // permission-granting "user activation" as expired and silently
      // rejects the write.
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": toBlob(node, { pixelRatio: 2 }).then((blob) => {
            if (!blob) throw new Error("no image data");
            return blob;
          }),
        }),
      ]);
      flashStatus("copied");
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }

  async function handleDownload() {
    const node = slideRefs.current[slideId];
    if (!node) return;
    setStatus("busy");
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = slideFilename(slideTitle);
      a.click();
      flashStatus("downloaded");
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }

  return (
    <div className="slide-actions">
      <button type="button" className="slide-action-btn" disabled={status === "busy"} onClick={handleCopy}>
        <CopyIcon width={13} height={13} /> {status === "copied" ? "Copied!" : "Copy image"}
      </button>
      <button type="button" className="slide-action-btn" disabled={status === "busy"} onClick={handleDownload}>
        <DownloadIcon width={13} height={13} /> {status === "downloaded" ? "Saved!" : "Download image"}
      </button>
      {status === "error" && <span className="slide-action-error">Couldn't export — try again</span>}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type { BrandOverview, Note, ProductImages, ProductType } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { ArrowUpIcon, ImageIcon, TrashIcon, UploadIcon } from "../components/common/Icons";
import { currentIsoWeek, formatCwRange, shiftWeek } from "../utils/date";
import "./SlidesPage.css";

const UPCOMING_WEEKS = 3; // current week + the following two

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
const PRODUCT_TYPES: ProductType[] = ["CC", "FC", "PW"];

interface SlideTopic extends Note {
  vehicleName: string;
  brandName: string;
  brandLogo: string | null;
}

function collectUpcomingNews(overview: BrandOverview[], startWeek: string, endWeek: string): SlideTopic[] {
  const out: SlideTopic[] = [];
  overview.forEach((b) => {
    b.vehicles.forEach((v) => {
      v.notes.forEach((n) => {
        if (n.kind !== "news" || n.completed || !n.cw_date) return;
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

// Keeps a slide's grid inside its fixed 16:9 frame no matter how many topics
// land on it — more topics means more (smaller) grid cells, not overflow or
// scrolling, so the whole thing stays a single paste-able slide. Mirrors how
// the brand map itself scales box size by note count.
function gridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return 5;
}

export default function SlidesPage() {
  const { isEditMode } = useAuth();
  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<ProductImages | null>(null);
  const [uploadingType, setUploadingType] = useState<ProductType | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, images] = await Promise.all([api.getOverview(), api.getProductImages()]);
      setOverview(ov);
      setProductImages(images);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load the slides.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startWeek = currentIsoWeek();
  const endWeek = shiftWeek(startWeek, UPCOMING_WEEKS - 1);

  const topics = useMemo(
    () => (overview ? collectUpcomingNews(overview, startWeek, endWeek) : []),
    [overview, startWeek, endWeek]
  );

  const slides = useMemo(
    () =>
      SLIDE_GROUPS.map((group, i) => ({
        group,
        topics: topics.filter((t) => slideIndexForBrand(t.brandName) === i),
      })),
    [topics]
  );

  async function handleUpload(type: ProductType, file: File) {
    setUploadingType(type);
    try {
      const images = await api.uploadProductImage(type, file);
      setProductImages(images);
    } finally {
      setUploadingType(null);
    }
  }

  async function handleRemoveImage(type: ProductType) {
    const images = await api.deleteProductImage(type);
    setProductImages(images);
  }

  return (
    <div className="slides-page">
      <div className="slides-hero">
        <div className="container slides-header">
          <div>
            <h1 className="slides-title">Presentation Slides</h1>
            <p className="slides-subtitle">
              News for the upcoming 3 weeks · {formatCwRange(startWeek, endWeek)}
            </p>
          </div>
        </div>
      </div>

      <div className="container slides-body">
        {loadError && <p className="error-text">{loadError}</p>}
        {!overview && !loadError && <p className="slides-loading">Loading slides…</p>}

        {isEditMode && productImages && (
          <div className="product-image-panel">
            <span className="product-image-panel-label">Product background images</span>
            <div className="product-image-slots">
              {PRODUCT_TYPES.map((type) => (
                <div className="product-image-slot" key={type}>
                  <div
                    className="product-image-preview"
                    style={productImages[type] ? { backgroundImage: `url(${productImages[type]})` } : undefined}
                  >
                    {!productImages[type] && <ImageIcon width={20} height={20} />}
                  </div>
                  <span className="product-image-slot-label">{PRODUCT_LABEL[type]}</span>
                  <div className="product-image-slot-actions">
                    <label className="btn btn-secondary btn-sm">
                      <UploadIcon width={12} height={12} />
                      {uploadingType === type ? "Uploading…" : productImages[type] ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(type, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {productImages[type] && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemoveImage(type)}>
                        <TrashIcon width={12} height={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {overview &&
          slides.map(({ group, topics: slideTopics }) => (
            <Slide key={group.title} title={group.title} topics={slideTopics} productImages={productImages} />
          ))}
      </div>
    </div>
  );
}

function Slide({
  title,
  topics,
  productImages,
}: {
  title: string;
  topics: SlideTopic[];
  productImages: ProductImages | null;
}) {
  const cols = gridColumns(topics.length);
  return (
    <div className="slide-wrap">
      <div className="slide-label">
        {title}
        <span className="slide-label-count">{topics.length} news</span>
      </div>
      <div className="slide">
        <div className="slide-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {topics.length === 0 && <div className="slide-empty">No news in the next 3 weeks</div>}
          {topics.map((t) => (
            <SlideCard key={t.id} topic={t} bgImage={t.product ? productImages?.[t.product] ?? null : null} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideCard({ topic, bgImage }: { topic: SlideTopic; bgImage: string | null }) {
  return (
    <div className="slide-card" style={bgImage ? { backgroundImage: `url(${bgImage})` } : undefined}>
      <div className="slide-card-scrim" />
      {topic.brandLogo ? (
        <img className="slide-card-logo" src={topic.brandLogo} alt={topic.brandName} />
      ) : (
        <span className="slide-card-logo-text">{topic.brandName}</span>
      )}
      <div className="slide-card-text">
        <span className="slide-card-model">
          {topic.priority === "High" && <ArrowUpIcon width={10} height={10} className="slide-card-priority" />}
          {topic.vehicleName}
          {topic.product ? ` · ${topic.product}` : ""}
        </span>
        <span className="slide-card-title">{topic.title}</span>
        {topic.cw_date && <span className="slide-card-week">{formatCwRange(topic.cw_date, topic.cw_date_end)}</span>}
      </div>
    </div>
  );
}

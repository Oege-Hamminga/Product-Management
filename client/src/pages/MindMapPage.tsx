import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api, ApiError } from "../api/client";
import type { Brand, BrandOverview, Note, ProductType } from "../api/types";
import { useAuth } from "../context/AuthContext";
import BrandNode, {
  BRAND_BOX_HEIGHT_FACTOR,
  BRAND_BOX_WIDTH_FACTOR,
  type BrandNodeData,
} from "../components/mindmap/BrandNode";
import ColumnNode, { type ColumnNodeData } from "../components/mindmap/ColumnNode";
import EmptyTopicNode, { type EmptyTopicNodeData } from "../components/mindmap/EmptyTopicNode";
import BrandFormModal from "../components/mindmap/BrandFormModal";
import VehicleDrawer from "../components/mindmap/VehicleDrawer";
import TopicsSidebar from "../components/notes/TopicsSidebar";
import QuickAddNoteModal from "../components/notes/QuickAddNoteModal";
import NoteFormModal from "../components/notes/NoteFormModal";
import TopicDetailModal from "../components/notes/TopicDetailModal";
import { PlusIcon } from "../components/common/Icons";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { currentIsoWeek, formatCwDate } from "../utils/date";
import "./MindMapPage.css";

const nodeTypes = { brand: BrandNode, column: ColumnNode, empty: EmptyTopicNode };

const MIN_BRAND_RADIUS = 36;
const MAX_BRAND_RADIUS = 108;
const COLUMN_WIDTH = 190;
const COLUMN_GAP = 8;
const COLUMN_TOP_GAP = 12; // vertical gap between brand box edge and top of columns
const COLUMN_HEADER_H = 40;
const COLUMN_SECTION_LABEL_H = 20;
const COLUMN_TOPIC_H = 56; // generous enough to cover a 2-line-title row, not just 1
const COLUMN_TOPICS_PADDING = 12; // .mm-column-topics's own top+bottom padding
const COLUMN_TOPIC_GAP = 4; // gap between stacked topic rows
const COLUMN_HEIGHT_BUFFER = 10; // borders/line-height rounding safety margin
const EMPTY_WIDTH = 170;
const EMPTY_HEIGHT = 40;
const BLOCK_GAP = 16; // gap between one brand's whole footprint and the next
const ROW_MAX_WIDTH = 1300; // wrap threshold for the row-flow layout below

type TopicFilter = "all" | "news" | "bt";
const TOPIC_FILTERS: { value: TopicFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "news", label: "News" },
  { value: "bt", label: "BT" },
];

interface TopicEntry extends Note {
  vehicle_name: string;
}

function visualRadius(noteCount: number): number {
  return Math.max(MIN_BRAND_RADIUS, Math.min(MAX_BRAND_RADIUS, 36 + Math.sqrt(noteCount) * 18));
}

function brandTopics(brand: BrandOverview): TopicEntry[] {
  return brand.vehicles.flatMap((v) => v.notes.map((n) => ({ ...n, vehicle_name: v.name })));
}

function applyTopicFilter(topics: TopicEntry[], filter: TopicFilter): TopicEntry[] {
  if (filter === "all") return topics;
  return topics.filter((t) => t.kind === filter);
}

interface TopicColumn {
  key: string;
  vehicleId: string;
  vehicleName: string;
  product: ProductType | null;
  newsTopics: TopicEntry[];
  btTopics: TopicEntry[];
}

// Groups a brand's topics into one column per (vehicle, product) combination so the
// canvas shows a self-contained column instead of one node per topic. Columns are
// derived purely from the topics themselves (not the separate vehicle_products
// feature) so no open topic is ever left ungrouped.
function brandColumns(topics: TopicEntry[]): TopicColumn[] {
  const map = new Map<string, TopicColumn>();
  topics.forEach((topic) => {
    const key = `${topic.vehicle_id}::${topic.product ?? "none"}`;
    let column = map.get(key);
    if (!column) {
      column = {
        key,
        vehicleId: topic.vehicle_id,
        vehicleName: topic.vehicle_name,
        product: topic.product,
        newsTopics: [],
        btTopics: [],
      };
      map.set(key, column);
    }
    if (topic.kind === "news") column.newsTopics.push(topic);
    else column.btTopics.push(topic);
  });
  return Array.from(map.values()).sort((a, b) => {
    if (a.vehicleName !== b.vehicleName) return a.vehicleName.localeCompare(b.vehicleName);
    return (a.product ?? "").localeCompare(b.product ?? "");
  });
}

// Mirrors .mm-column-topics's own padding and inter-row gap (not just the rows
// themselves) so the reserved height matches what actually renders.
function topicsSectionHeight(count: number): number {
  return COLUMN_TOPICS_PADDING + count * COLUMN_TOPIC_H + (count - 1) * COLUMN_TOPIC_GAP;
}

function columnHeight(column: TopicColumn): number {
  let h = COLUMN_HEADER_H + COLUMN_HEIGHT_BUFFER;
  if (column.newsTopics.length > 0) h += COLUMN_SECTION_LABEL_H + topicsSectionHeight(column.newsTopics.length);
  if (column.btTopics.length > 0) h += COLUMN_SECTION_LABEL_H + topicsSectionHeight(column.btTopics.length);
  return h;
}

interface BrandLayout {
  id: string;
  r: number;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  columnsX: number;
  columnsY: number;
}

// Lays brands out left-to-right, wrapping into rows once a row gets too wide —
// a plain shelf-packing flow rather than circle-packing. Circle-packing reserves
// a full circle of empty space around each brand even though its columns only
// ever hang straight down, which was wasting most of that reserved space and
// kept brands far apart; a row flow only reserves the rectangle each brand
// actually occupies, so neighbors sit right up against it.
function layoutBrands(overview: BrandOverview[], filter: TopicFilter): BrandLayout[] {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const result: BrandLayout[] = [];

  overview.forEach((b) => {
    const noteCount = b.vehicles.reduce((sum, v) => sum + v.note_count, 0);
    const r = visualRadius(noteCount);
    const boxWidth = r * 2 * BRAND_BOX_WIDTH_FACTOR;
    const boxHeight = r * 2 * BRAND_BOX_HEIGHT_FACTOR;
    const columns = brandColumns(applyTopicFilter(brandTopics(b), filter));

    let belowWidth = 0;
    let belowHeight = 0;
    if (columns.length > 0) {
      belowWidth = columns.length * COLUMN_WIDTH + (columns.length - 1) * COLUMN_GAP;
      belowHeight = COLUMN_TOP_GAP + Math.max(...columns.map(columnHeight));
    } else if (noteCount === 0) {
      belowWidth = EMPTY_WIDTH;
      belowHeight = COLUMN_TOP_GAP + EMPTY_HEIGHT;
    }

    const footprintWidth = Math.max(boxWidth, belowWidth);
    const footprintHeight = boxHeight + belowHeight;

    if (cursorX > 0 && cursorX + footprintWidth > ROW_MAX_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + BLOCK_GAP;
      rowHeight = 0;
    }

    result.push({
      id: b.id,
      r,
      boxX: cursorX + (footprintWidth - boxWidth) / 2,
      boxY: cursorY,
      boxWidth,
      boxHeight,
      columnsX: cursorX + (footprintWidth - belowWidth) / 2,
      columnsY: cursorY + boxHeight + COLUMN_TOP_GAP,
    });

    cursorX += footprintWidth + BLOCK_GAP;
    rowHeight = Math.max(rowHeight, footprintHeight);
  });

  return result;
}

export default function MindMapPage() {
  const { isEditMode } = useAuth();

  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState<TopicFilter>("all");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const flowInstance = useRef<ReactFlowInstance | null>(null);
  const vehiclePanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedVehicleId) {
      requestAnimationFrame(() => {
        vehiclePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [selectedVehicleId]);

  const [addingBrand, setAddingBrand] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null);
  const [deletingTopic, setDeletingTopic] = useState<{ id: string; title: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<{ note: Note; vehicleName: string; brandName: string } | null>(
    null
  );
  const [editingTopic, setEditingTopic] = useState<Note | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api.getOverview();
      setOverview(data);
      setLoadError(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load the brand map.");
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleCompleteTopic = useCallback(
    (noteId: string) => {
      api.updateNote(noteId, { completed: true }).then(loadOverview);
    },
    [loadOverview]
  );

  useEffect(() => {
    if (!overview) return;
    const newNodes: Node[] = [];

    const layouts = layoutBrands(overview, topicFilter);

    layouts.forEach((layout) => {
      const brand = overview.find((b) => b.id === layout.id);
      if (!brand) return;
      const allTopics = brandTopics(brand);
      const noteCount = allTopics.length;
      const columns = brandColumns(applyTopicFilter(allTopics, topicFilter));

      const data: BrandNodeData = {
        name: brand.name,
        logoPath: brand.logo_path,
        vehicleCount: brand.vehicles.length,
        noteCount,
        radius: layout.r,
        isEditMode,
        onEdit: () => setEditingBrand(brand),
        onAddTopic: () => setAddingTopicFor(brand.id),
      };

      newNodes.push({
        id: `brand-${brand.id}`,
        type: "brand",
        position: { x: layout.boxX, y: layout.boxY },
        data,
      });

      if (columns.length > 0) {
        columns.forEach((column, j) => {
          const colX = layout.columnsX + j * (COLUMN_WIDTH + COLUMN_GAP);

          const cData: ColumnNodeData = {
            vehicleName: column.vehicleName,
            product: column.product,
            newsTopics: column.newsTopics,
            btTopics: column.btTopics,
            isEditMode,
            onOpen: () => setSelectedVehicleId(column.vehicleId),
            onOpenTopic: (topic) => setSelectedTopic({ note: topic, vehicleName: column.vehicleName, brandName: brand.name }),
            onCompleteTopic: handleCompleteTopic,
            onDeleteTopic: (id) => {
              const topic = [...column.newsTopics, ...column.btTopics].find((t) => t.id === id);
              if (topic) setDeletingTopic({ id: topic.id, title: topic.title });
            },
          };

          newNodes.push({
            id: `column-${column.key}`,
            type: "column",
            position: { x: colX, y: layout.columnsY },
            data: cData,
          });
        });
      } else if (noteCount === 0) {
        const eData: EmptyTopicNodeData = {
          isEditMode,
          onAdd: () => setAddingTopicFor(brand.id),
        };
        newNodes.push({
          id: `empty-${brand.id}`,
          type: "empty",
          position: { x: layout.columnsX, y: layout.columnsY },
          data: eData,
        });
      }
    });

    setNodes(newNodes);
    requestAnimationFrame(() => {
      flowInstance.current?.fitView({ padding: 0.15, duration: 300 });
    });
  }, [overview, topicFilter, isEditMode, setNodes, handleCompleteTopic]);

  const brandCount = overview?.length ?? 0;
  const vehicleCount = useMemo(
    () => overview?.reduce((sum, b) => sum + b.vehicles.length, 0) ?? 0,
    [overview]
  );

  async function handleDeleteTopic() {
    if (!deletingTopic) return;
    setDeleteBusy(true);
    try {
      await api.deleteNote(deletingTopic.id);
      setDeletingTopic(null);
      await loadOverview();
    } finally {
      setDeleteBusy(false);
    }
  }

  const addingTopicForBrand = addingTopicFor ? overview?.find((b) => b.id === addingTopicFor) ?? null : null;

  return (
    <div className="mindmap-page">
      <div className="mindmap-hero">
        <div className="mindmap-header container">
          <div>
            <h1 className="mindmap-title">Brand Map</h1>
            <p className="mindmap-subtitle">
              {brandCount} customers · {vehicleCount} vehicles · Crew Cab / Flex Cab / Partition Wall
              · {formatCwDate(currentIsoWeek())}
            </p>
          </div>
          {isEditMode && (
            <button className="btn btn-hero" onClick={() => setAddingBrand(true)}>
              <PlusIcon width={14} height={14} /> Add customer
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="container">
          <p className="error-text">{loadError}</p>
        </div>
      )}

      <div className="mindmap-body-row">
        <div className="mindmap-canvas">
          {!overview && !loadError && (
            <div className="mindmap-loading">
              <div className="mindmap-loading-ring" />
              <span>Loading brand map…</span>
            </div>
          )}
          <div className="mindmap-canvas-toolbar">
            {isEditMode && (
              <button className="mindmap-quick-add" title="Add a topic" onClick={() => setQuickAdding(true)}>
                <PlusIcon width={16} height={16} />
              </button>
            )}
            <div className="segmented mindmap-kind-filter">
              {TOPIC_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={topicFilter === f.value ? "active" : ""}
                  onClick={() => setTopicFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <ReactFlow
            nodes={nodes}
            onInit={(instance) => {
              flowInstance.current = instance;
            }}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            fitView
            minZoom={0.25}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={26} size={1.4} color="var(--border-strong)" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeStrokeWidth={2} nodeColor="var(--border-strong)" />
          </ReactFlow>
        </div>

        <TopicsSidebar onSelectVehicle={setSelectedVehicleId} refreshKey={refreshKey} onChanged={loadOverview} />
      </div>

      {selectedVehicleId && (
        <div className="container vehicle-panel-wrap" ref={vehiclePanelRef}>
          <VehicleDrawer
            key={selectedVehicleId}
            vehicleId={selectedVehicleId}
            onClose={() => setSelectedVehicleId(null)}
            onChanged={loadOverview}
          />
        </div>
      )}

      {addingBrand && (
        <BrandFormModal onClose={() => setAddingBrand(false)} onSaved={loadOverview} />
      )}
      {editingBrand && (
        <BrandFormModal brand={editingBrand} onClose={() => setEditingBrand(null)} onSaved={loadOverview} />
      )}
      {deletingTopic && (
        <ConfirmDialog
          title={`Delete "${deletingTopic.title}"?`}
          message="This topic will be permanently removed."
          busy={deleteBusy}
          onConfirm={handleDeleteTopic}
          onCancel={() => setDeletingTopic(null)}
        />
      )}
      {quickAdding && overview && (
        <QuickAddNoteModal overview={overview} onClose={() => setQuickAdding(false)} onSaved={loadOverview} />
      )}
      {addingTopicForBrand && overview && (
        <QuickAddNoteModal
          overview={overview}
          initialBrandId={addingTopicForBrand.id}
          onClose={() => setAddingTopicFor(null)}
          onSaved={loadOverview}
        />
      )}
      {selectedTopic && (
        <TopicDetailModal
          note={selectedTopic.note}
          vehicleName={selectedTopic.vehicleName}
          brandName={selectedTopic.brandName}
          isEditMode={isEditMode}
          onClose={() => setSelectedTopic(null)}
          onEdit={() => {
            setEditingTopic(selectedTopic.note);
            setSelectedTopic(null);
          }}
          onComplete={() => {
            handleCompleteTopic(selectedTopic.note.id);
            setSelectedTopic(null);
          }}
          onDelete={() => {
            setDeletingTopic({ id: selectedTopic.note.id, title: selectedTopic.note.title });
            setSelectedTopic(null);
          }}
        />
      )}
      {editingTopic && (
        <NoteFormModal
          vehicleId={editingTopic.vehicle_id}
          category={editingTopic.category}
          note={editingTopic}
          onClose={() => setEditingTopic(null)}
          onSaved={loadOverview}
        />
      )}
    </div>
  );
}

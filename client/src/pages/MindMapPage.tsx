import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { hierarchy, pack } from "d3-hierarchy";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api, ApiError } from "../api/client";
import type { Brand, BrandOverview, Note, ProductType } from "../api/types";
import { useAuth } from "../context/AuthContext";
import BrandNode, { type BrandNodeData } from "../components/mindmap/BrandNode";
import ColumnNode, { type ColumnNodeData, type ColumnTopic } from "../components/mindmap/ColumnNode";
import EmptyTopicNode, { type EmptyTopicNodeData } from "../components/mindmap/EmptyTopicNode";
import BrandFormModal from "../components/mindmap/BrandFormModal";
import VehicleDrawer from "../components/mindmap/VehicleDrawer";
import TopicsSidebar from "../components/notes/TopicsSidebar";
import QuickAddNoteModal from "../components/notes/QuickAddNoteModal";
import { PlusIcon } from "../components/common/Icons";
import ConfirmDialog from "../components/common/ConfirmDialog";
import "./MindMapPage.css";

const nodeTypes = { brand: BrandNode, column: ColumnNode, empty: EmptyTopicNode };

const PACK_WIDTH = 1100;
const PACK_HEIGHT = 760;
const PACK_PADDING = 24;
const MIN_BRAND_RADIUS = 44;
const MAX_BRAND_RADIUS = 130;
const COLUMN_WIDTH = 216;
const COLUMN_GAP = 20;
const COLUMN_TOP_GAP = 60; // vertical gap between brand bubble edge and top of columns
const COLUMN_HEADER_H = 40;
const COLUMN_SECTION_LABEL_H = 20;
const COLUMN_TOPIC_H = 46;

interface TopicEntry extends Note {
  vehicle_name: string;
}

function visualRadius(noteCount: number): number {
  return Math.max(MIN_BRAND_RADIUS, Math.min(MAX_BRAND_RADIUS, 46 + Math.sqrt(noteCount) * 22));
}

function brandTopics(brand: BrandOverview): TopicEntry[] {
  return brand.vehicles.flatMap((v) => v.notes.map((n) => ({ ...n, vehicle_name: v.name })));
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

function columnHeight(column: TopicColumn): number {
  let h = COLUMN_HEADER_H;
  if (column.newsTopics.length > 0) h += COLUMN_SECTION_LABEL_H + column.newsTopics.length * COLUMN_TOPIC_H;
  if (column.btTopics.length > 0) h += COLUMN_SECTION_LABEL_H + column.btTopics.length * COLUMN_TOPIC_H;
  return h;
}

interface BrandBubble {
  id: string;
  x: number;
  y: number;
  r: number;
}

interface PackDatum {
  id: string;
  packRadius: number;
  children?: PackDatum[];
}

// Brand bubbles are packed by an explicit radius (not by note-count value) so we can
// reserve extra layout space around an *expanded* brand for its grouped topic
// columns, without inflating the bubble's own visual size — this makes neighboring
// bubbles get pushed out of the way instead of overlapping the columns.
function packBrands(overview: BrandOverview[], expanded: Set<string>): BrandBubble[] {
  if (overview.length === 0) return [];
  const data: PackDatum = {
    id: "root",
    packRadius: 0,
    children: overview.map((b) => {
      const noteCount = b.vehicles.reduce((sum, v) => sum + v.note_count, 0);
      const r = visualRadius(noteCount);
      const isExpanded = expanded.has(b.id);
      let reserved = r;
      if (isExpanded) {
        const columns = brandColumns(brandTopics(b));
        if (columns.length > 0) {
          const totalWidth = columns.length * COLUMN_WIDTH + (columns.length - 1) * COLUMN_GAP;
          const maxHeight = Math.max(...columns.map(columnHeight));
          const dx = totalWidth / 2;
          const dy = r + COLUMN_TOP_GAP + maxHeight;
          reserved = Math.sqrt(dx * dx + dy * dy);
        } else {
          reserved = r + 90;
        }
      }
      return { id: b.id, packRadius: reserved, visualR: r } as PackDatum & { visualR: number };
    }),
  };

  const root = hierarchy(data);
  const packed = pack<PackDatum>()
    .size([PACK_WIDTH, PACK_HEIGHT])
    .padding(PACK_PADDING)
    .radius((d) => d.data.packRadius)(root);

  return (packed.children ?? []).map((c) => ({
    id: c.data.id,
    x: c.x - PACK_WIDTH / 2,
    y: c.y - PACK_HEIGHT / 2,
    r: (c.data as PackDatum & { visualR: number }).visualR,
  }));
}

export default function MindMapPage() {
  const { isEditMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const openVehicle = (location.state as { openVehicle?: string } | null)?.openVehicle;
    if (openVehicle) {
      setSelectedVehicleId(openVehicle);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
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

  // Every brand starts expanded so its open topics are visible on the board
  // without an extra click — but only the first time a brand is seen, so a
  // brand the user manually collapses doesn't keep popping back open every
  // time the overview refreshes after a mutation.
  const knownBrandIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!overview) return;
    // Compute which brand ids are new, and mutate the ref here in the effect
    // body (not inside the setExpanded updater below) — React's StrictMode
    // double-invokes state updaters to check they're pure, and discards the
    // first call's result, so a side effect inside the updater itself would
    // make the second (kept) call see "nothing new" and silently drop the update.
    const newIds = overview.map((b) => b.id).filter((id) => !knownBrandIds.current.has(id));
    if (newIds.length === 0) return;
    newIds.forEach((id) => knownBrandIds.current.add(id));
    setExpanded((prev) => {
      const next = new Set(prev);
      newIds.forEach((id) => next.add(id));
      return next;
    });
  }, [overview]);

  const toggleBrand = useCallback((brandId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  }, []);

  const handleCompleteTopic = useCallback(
    (noteId: string) => {
      api.updateNote(noteId, { completed: true }).then(loadOverview);
    },
    [loadOverview]
  );

  useEffect(() => {
    if (!overview) return;
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    const bubbles = packBrands(overview, expanded);

    bubbles.forEach((bubble) => {
      const brand = overview.find((b) => b.id === bubble.id);
      if (!brand) return;
      const isExpanded = expanded.has(brand.id);
      const allTopics = brandTopics(brand);
      const noteCount = allTopics.length;
      const columns = isExpanded ? brandColumns(allTopics) : [];

      const data: BrandNodeData = {
        name: brand.name,
        logoPath: brand.logo_path,
        vehicleCount: brand.vehicles.length,
        noteCount,
        radius: bubble.r,
        expanded: isExpanded,
        isEditMode,
        onToggle: () => toggleBrand(brand.id),
        onEdit: () => setEditingBrand(brand),
        onAddTopic: () => setAddingTopicFor(brand.id),
      };

      newNodes.push({
        id: `brand-${brand.id}`,
        type: "brand",
        position: { x: bubble.x - bubble.r, y: bubble.y - bubble.r },
        data,
      });

      if (isExpanded && columns.length > 0) {
        const totalWidth = columns.length * COLUMN_WIDTH + (columns.length - 1) * COLUMN_GAP;
        const startX = bubble.x - totalWidth / 2;
        const topY = bubble.y + bubble.r + COLUMN_TOP_GAP;

        columns.forEach((column, j) => {
          const colX = startX + j * (COLUMN_WIDTH + COLUMN_GAP);

          const toColumnTopic = (topic: TopicEntry): ColumnTopic => ({
            id: topic.id,
            title: topic.title,
            kind: topic.kind,
            category: topic.category,
            priority: topic.priority,
            btCode: topic.bt_code,
            cwDate: topic.cw_date,
            phase: topic.phase,
          });

          const cData: ColumnNodeData = {
            vehicleName: column.vehicleName,
            product: column.product,
            newsTopics: column.newsTopics.map(toColumnTopic),
            btTopics: column.btTopics.map(toColumnTopic),
            isEditMode,
            onOpen: () => setSelectedVehicleId(column.vehicleId),
            onCompleteTopic: handleCompleteTopic,
            onDeleteTopic: (id) => {
              const topic = [...column.newsTopics, ...column.btTopics].find((t) => t.id === id);
              if (topic) setDeletingTopic({ id: topic.id, title: topic.title });
            },
          };

          newNodes.push({
            id: `column-${column.key}`,
            type: "column",
            position: { x: colX, y: topY },
            data: cData,
          });

          newEdges.push({
            id: `e-brand-${column.key}`,
            source: `brand-${brand.id}`,
            target: `column-${column.key}`,
            type: "smoothstep",
            style: { stroke: "var(--accent)", strokeWidth: 1.5, opacity: 0.55 },
          });
        });
      } else if (isExpanded && noteCount === 0) {
        const eData: EmptyTopicNodeData = {
          isEditMode,
          onAdd: () => setAddingTopicFor(brand.id),
        };
        newNodes.push({
          id: `empty-${brand.id}`,
          type: "empty",
          position: { x: bubble.x - 85, y: bubble.y + bubble.r + COLUMN_TOP_GAP },
          data: eData,
        });
        newEdges.push({
          id: `e-brand-empty-${brand.id}`,
          source: `brand-${brand.id}`,
          target: `empty-${brand.id}`,
          type: "smoothstep",
          style: { stroke: "var(--border-strong)", strokeWidth: 1.5, strokeDasharray: "4 3" },
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
    requestAnimationFrame(() => {
      flowInstance.current?.fitView({ padding: 0.15, duration: 300 });
    });
  }, [overview, expanded, isEditMode, setNodes, setEdges, toggleBrand, handleCompleteTopic]);

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
            <p className="mindmap-eyebrow">OEM Brand Portfolio</p>
            <h1 className="mindmap-title">Brand Map</h1>
            <p className="mindmap-subtitle">
              {brandCount} customers · {vehicleCount} vehicles · Crew Cab / Flex Cab / Partition Wall
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
          {isEditMode && (
            <button className="mindmap-quick-add" title="Add a topic" onClick={() => setQuickAdding(true)}>
              <PlusIcon width={16} height={16} />
            </button>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onInit={(instance) => {
              flowInstance.current = instance;
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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
    </div>
  );
}

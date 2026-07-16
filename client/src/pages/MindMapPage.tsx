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
import type { Brand, BrandOverview, Note } from "../api/types";
import { useAuth } from "../context/AuthContext";
import BrandNode, { type BrandNodeData } from "../components/mindmap/BrandNode";
import TopicNode, { type TopicNodeData } from "../components/mindmap/TopicNode";
import EmptyTopicNode, { type EmptyTopicNodeData } from "../components/mindmap/EmptyTopicNode";
import BrandFormModal from "../components/mindmap/BrandFormModal";
import VehicleDrawer from "../components/mindmap/VehicleDrawer";
import TopicsSidebar from "../components/notes/TopicsSidebar";
import QuickAddNoteModal from "../components/notes/QuickAddNoteModal";
import { PlusIcon } from "../components/common/Icons";
import ConfirmDialog from "../components/common/ConfirmDialog";
import "./MindMapPage.css";

const nodeTypes = { brand: BrandNode, topic: TopicNode, empty: EmptyTopicNode };

const PACK_WIDTH = 1100;
const PACK_HEIGHT = 760;
const PACK_PADDING = 24;
const MIN_BRAND_RADIUS = 44;
const MAX_BRAND_RADIUS = 130;
const TOPIC_MIN_GAP = 90;
const TOPIC_NODE_SPAN = 224; // topic card width + breathing room, used to space the fan arc
const MAX_TOPIC_ARC_DEG = 170;

interface TopicEntry extends Note {
  vehicle_name: string;
}

function polarFrom(base: { x: number; y: number }, radius: number, angleRad: number) {
  return { x: base.x + Math.cos(angleRad) * radius, y: base.y + Math.sin(angleRad) * radius };
}

function visualRadius(noteCount: number): number {
  return Math.max(MIN_BRAND_RADIUS, Math.min(MAX_BRAND_RADIUS, 46 + Math.sqrt(noteCount) * 22));
}

function topicFanArcDeg(topicCount: number): number {
  return Math.min(MAX_TOPIC_ARC_DEG, 20 + topicCount * 12);
}

// Radius of the arc topic cards fan out on below a brand bubble, wide enough that
// adjacent cards don't overlap given the chosen arc angle.
function topicFanRadius(brandR: number, topicCount: number): number {
  const minRadius = brandR + TOPIC_MIN_GAP;
  if (topicCount <= 1) return minRadius;
  const arcRad = (topicFanArcDeg(topicCount) * Math.PI) / 180;
  const angleStep = arcRad / (topicCount - 1);
  const spacingRadius = TOPIC_NODE_SPAN / 2 / Math.sin(Math.max(angleStep, 0.01) / 2);
  return Math.max(minRadius, spacingRadius);
}

function brandTopics(brand: BrandOverview): TopicEntry[] {
  return brand.vehicles.flatMap((v) => v.notes.map((n) => ({ ...n, vehicle_name: v.name })));
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
// reserve extra layout space around an *expanded* brand for its fanned-out topic
// cards, without inflating the bubble's own visual size — this makes neighboring
// bubbles get pushed out of the way instead of overlapping the fan-out.
function packBrands(
  overview: BrandOverview[],
  expanded: Set<string>,
  filterByBrand: Record<string, string | null>
): BrandBubble[] {
  if (overview.length === 0) return [];
  const data: PackDatum = {
    id: "root",
    packRadius: 0,
    children: overview.map((b) => {
      const noteCount = b.vehicles.reduce((sum, v) => sum + v.note_count, 0);
      const r = visualRadius(noteCount);
      const filter = filterByBrand[b.id];
      const visibleCount = filter ? brandTopics(b).filter((t) => t.vehicle_name === filter).length : noteCount;
      const isExpanded = expanded.has(b.id) && visibleCount > 0;
      // reserve enough radius to cover the fanned-out topic cards plus their own footprint
      const reserved = isExpanded ? topicFanRadius(r, visibleCount) + 110 : r;
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
  const [filterByBrand, setFilterByBrand] = useState<Record<string, string | null>>({});
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

  const toggleBrand = useCallback((brandId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  }, []);

  const toggleFilter = useCallback((brandId: string, vehicleName: string) => {
    setFilterByBrand((prev) => ({ ...prev, [brandId]: prev[brandId] === vehicleName ? null : vehicleName }));
  }, []);

  useEffect(() => {
    if (!overview) return;
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    const bubbles = packBrands(overview, expanded, filterByBrand);

    bubbles.forEach((bubble) => {
      const brand = overview.find((b) => b.id === bubble.id);
      if (!brand) return;
      const isExpanded = expanded.has(brand.id);
      const allTopics = brandTopics(brand);
      const noteCount = allTopics.length;
      const activeFilter = filterByBrand[brand.id] ?? null;
      const visibleTopics = activeFilter ? allTopics.filter((t) => t.vehicle_name === activeFilter) : allTopics;

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

      if (isExpanded && visibleTopics.length > 0) {
        const m = visibleTopics.length;
        const arc = (topicFanArcDeg(m) * Math.PI) / 180;
        const fanRadius = topicFanRadius(bubble.r, m);
        visibleTopics.forEach((topic, j) => {
          const offset = m === 1 ? 0 : arc * (j / (m - 1) - 0.5);
          const tAngle = Math.PI / 2 + offset;
          const tCenter = polarFrom({ x: bubble.x, y: bubble.y }, fanRadius, tAngle);

          const tData: TopicNodeData = {
            vehicleName: topic.vehicle_name,
            title: topic.title,
            kind: topic.kind,
            category: topic.category,
            priority: topic.priority,
            btCode: topic.bt_code,
            cwDate: topic.cw_date,
            isEditMode,
            isFiltered: activeFilter === topic.vehicle_name,
            onOpen: () => setSelectedVehicleId(topic.vehicle_id),
            onToggleFilter: () => toggleFilter(brand.id, topic.vehicle_name),
            onDelete: () => setDeletingTopic({ id: topic.id, title: topic.title }),
          };

          newNodes.push({
            id: `topic-${topic.id}`,
            type: "topic",
            position: { x: tCenter.x - 100, y: tCenter.y - 25 },
            data: tData,
          });

          newEdges.push({
            id: `e-brand-${topic.id}`,
            source: `brand-${brand.id}`,
            target: `topic-${topic.id}`,
            type: "smoothstep",
            style: { stroke: "var(--accent)", strokeWidth: 1.5, opacity: 0.55 },
          });
        });
      } else if (isExpanded && noteCount === 0) {
        const eCenter = polarFrom({ x: bubble.x, y: bubble.y }, bubble.r + 80, Math.PI / 2);
        const eData: EmptyTopicNodeData = {
          isEditMode,
          onAdd: () => setAddingTopicFor(brand.id),
        };
        newNodes.push({
          id: `empty-${brand.id}`,
          type: "empty",
          position: { x: eCenter.x - 85, y: eCenter.y - 20 },
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
  }, [overview, expanded, filterByBrand, isEditMode, setNodes, setEdges, toggleBrand, toggleFilter]);

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

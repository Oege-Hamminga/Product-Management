import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import type { Brand, BrandOverview } from "../api/types";
import { useAuth } from "../context/AuthContext";
import CenterNode from "../components/mindmap/CenterNode";
import BrandNode, { type BrandNodeData } from "../components/mindmap/BrandNode";
import VehicleNode, { type VehicleNodeData } from "../components/mindmap/VehicleNode";
import EmptyVehicleNode, { type EmptyVehicleNodeData } from "../components/mindmap/EmptyVehicleNode";
import BrandFormModal from "../components/mindmap/BrandFormModal";
import VehicleFormModal from "../components/mindmap/VehicleFormModal";
import { PlusIcon } from "../components/common/Icons";
import ConfirmDialog from "../components/common/ConfirmDialog";
import "./MindMapPage.css";

const nodeTypes = { center: CenterNode, brand: BrandNode, vehicle: VehicleNode, empty: EmptyVehicleNode };

const BRAND_RADIUS = 340;
const VEHICLE_RADIUS = 620;
const MAX_VEHICLE_ARC_DEG = 46;

function polar(radius: number, angleRad: number) {
  return { x: Math.cos(angleRad) * radius, y: Math.sin(angleRad) * radius };
}

export default function MindMapPage() {
  const { isEditMode } = useAuth();
  const navigate = useNavigate();

  const [overview, setOverview] = useState<BrandOverview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const flowInstance = useRef<ReactFlowInstance | null>(null);

  const [addingBrand, setAddingBrand] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [addingVehicleFor, setAddingVehicleFor] = useState<{ id: string; name: string } | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<{ id: string; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api.getOverview();
      setOverview(data);
      setLoadError(null);
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

  useEffect(() => {
    if (!overview) return;
    const n = overview.length;
    const newNodes: Node[] = [
      { id: "center", type: "center", position: { x: -84, y: -46 }, data: {}, draggable: false, selectable: false },
    ];
    const newEdges: Edge[] = [];

    overview.forEach((brand, i) => {
      const angle = n > 0 ? (i / n) * 2 * Math.PI - Math.PI / 2 : 0;
      const center = polar(BRAND_RADIUS, angle);
      const isExpanded = expanded.has(brand.id);
      const ticketCount = brand.vehicles.reduce((sum, v) => sum + v.ticket_count, 0);

      const data: BrandNodeData = {
        name: brand.name,
        logoPath: brand.logo_path,
        vehicleCount: brand.vehicles.length,
        ticketCount,
        expanded: isExpanded,
        isEditMode,
        onToggle: () => toggleBrand(brand.id),
        onEdit: () => setEditingBrand(brand),
        onAddVehicle: () => setAddingVehicleFor({ id: brand.id, name: brand.name }),
      };

      newNodes.push({
        id: `brand-${brand.id}`,
        type: "brand",
        position: { x: center.x - 120, y: center.y - 35 },
        data,
      });

      newEdges.push({
        id: `e-center-${brand.id}`,
        source: "center",
        target: `brand-${brand.id}`,
        type: "smoothstep",
        style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
      });

      if (isExpanded && brand.vehicles.length > 0) {
        const m = brand.vehicles.length;
        const arc = Math.min(MAX_VEHICLE_ARC_DEG, m * 14) * (Math.PI / 180);
        brand.vehicles.forEach((vehicle, j) => {
          const offset = m === 1 ? 0 : arc * (j / (m - 1) - 0.5);
          const vAngle = angle + offset;
          const vCenter = polar(VEHICLE_RADIUS, vAngle);

          const vData: VehicleNodeData = {
            name: vehicle.name,
            ticketCount: vehicle.ticket_count,
            isEditMode,
            onOpen: () => navigate(`/vehicles/${vehicle.id}`),
            onDelete: () => setDeletingVehicle({ id: vehicle.id, name: vehicle.name }),
          };

          newNodes.push({
            id: `vehicle-${vehicle.id}`,
            type: "vehicle",
            position: { x: vCenter.x - 95, y: vCenter.y - 25 },
            data: vData,
          });

          newEdges.push({
            id: `e-brand-${vehicle.id}`,
            source: `brand-${brand.id}`,
            target: `vehicle-${vehicle.id}`,
            type: "smoothstep",
            style: { stroke: "var(--accent)", strokeWidth: 1.5, opacity: 0.55 },
          });
        });
      } else if (isExpanded && brand.vehicles.length === 0) {
        const eCenter = polar(VEHICLE_RADIUS - 140, angle);
        const eData: EmptyVehicleNodeData = {
          isEditMode,
          onAdd: () => setAddingVehicleFor({ id: brand.id, name: brand.name }),
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
  }, [overview, expanded, isEditMode, navigate, setNodes, setEdges, toggleBrand]);

  const brandCount = overview?.length ?? 0;
  const vehicleCount = useMemo(
    () => overview?.reduce((sum, b) => sum + b.vehicles.length, 0) ?? 0,
    [overview]
  );

  async function handleDeleteVehicle() {
    if (!deletingVehicle) return;
    setDeleteBusy(true);
    try {
      await api.deleteVehicle(deletingVehicle.id);
      setDeletingVehicle(null);
      await loadOverview();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="mindmap-page">
      <div className="mindmap-header container">
        <div>
          <h1 className="mindmap-title">OEM Brand Portfolio</h1>
          <p className="mindmap-subtitle">
            {brandCount} customers · {vehicleCount} vehicles · Crew Cab / Flex Cab / Partition Wall
          </p>
        </div>
        {isEditMode && (
          <button className="btn btn-primary" onClick={() => setAddingBrand(true)}>
            <PlusIcon width={14} height={14} /> Add customer
          </button>
        )}
      </div>

      {loadError && (
        <div className="container">
          <p className="error-text">{loadError}</p>
        </div>
      )}

      <div className="mindmap-canvas">
        {!overview && !loadError && (
          <div className="mindmap-loading">
            <div className="mindmap-loading-ring" />
            <span>Loading brand map…</span>
          </div>
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

      {addingBrand && (
        <BrandFormModal onClose={() => setAddingBrand(false)} onSaved={loadOverview} />
      )}
      {editingBrand && (
        <BrandFormModal brand={editingBrand} onClose={() => setEditingBrand(null)} onSaved={loadOverview} />
      )}
      {addingVehicleFor && (
        <VehicleFormModal
          brandId={addingVehicleFor.id}
          brandName={addingVehicleFor.name}
          onClose={() => setAddingVehicleFor(null)}
          onSaved={loadOverview}
        />
      )}
      {deletingVehicle && (
        <ConfirmDialog
          title={`Delete ${deletingVehicle.name}?`}
          message="This removes the vehicle along with its images, products, bugtracker tickets and topics."
          busy={deleteBusy}
          onConfirm={handleDeleteVehicle}
          onCancel={() => setDeletingVehicle(null)}
        />
      )}
    </div>
  );
}

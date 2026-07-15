import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { ProductType, VehicleDetail } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import ProductToggles from "../vehicle/ProductToggles";
import NotesPanel from "../notes/NotesPanel";
import ConfirmDialog from "../common/ConfirmDialog";
import Skeleton from "../common/Skeleton";
import { CloseIcon, PencilIcon, TrashIcon } from "../common/Icons";
import "./VehicleDrawer.css";

interface VehicleDrawerProps {
  vehicleId: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function VehicleDrawer({ vehicleId, onClose, onChanged }: VehicleDrawerProps) {
  const { isEditMode } = useAuth();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getVehicle(vehicleId);
      setVehicle(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this vehicle.");
    }
  }, [vehicleId]);

  useEffect(() => {
    setVehicle(null);
    load();
  }, [load]);

  async function handleRename() {
    if (!vehicle || !nameDraft.trim()) return;
    await api.renameVehicle(vehicle.id, nameDraft.trim());
    setRenaming(false);
    load();
    onChanged();
  }

  async function handleDeleteVehicle() {
    if (!vehicle) return;
    setDeleteBusy(true);
    try {
      await api.deleteVehicle(vehicle.id);
      onChanged();
      onClose();
    } finally {
      setDeleteBusy(false);
    }
  }

  async function refresh() {
    await load();
    onChanged();
  }

  return (
    <>
      <div className="drawer">
        <button className="drawer-close" title="Close" onClick={onClose}>
          <CloseIcon width={15} height={15} />
        </button>

        {error && <p className="error-text" style={{ padding: 20 }}>{error}</p>}

        {!vehicle && !error && (
          <div className="drawer-skeleton">
            <Skeleton width={140} height={12} style={{ marginBottom: 14 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <Skeleton width={44} height={44} circle />
              <Skeleton width={160} height={20} />
            </div>
            <Skeleton height={90} style={{ marginBottom: 16 }} />
            <Skeleton height={160} />
          </div>
        )}

        {vehicle && (
          <>
            <div className="drawer-header">
              <div className="drawer-brand">
                {vehicle.brand.logo_path ? (
                  <img src={vehicle.brand.logo_path} alt={vehicle.brand.name} />
                ) : (
                  <span>{vehicle.brand.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="drawer-heading">
                {renaming ? (
                  <div className="drawer-rename-row">
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRename()}
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleRename}>
                      Save
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setRenaming(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="drawer-title-row">
                    <h2>{vehicle.name}</h2>
                    {isEditMode && (
                      <button
                        className="icon-btn"
                        title="Rename vehicle"
                        onClick={() => {
                          setNameDraft(vehicle.name);
                          setRenaming(true);
                        }}
                      >
                        <PencilIcon width={12} height={12} />
                      </button>
                    )}
                  </div>
                )}
                <span className="drawer-brand-name">{vehicle.brand.name}</span>
              </div>
            </div>

            <div className="drawer-body">
              <div className="drawer-columns">
                <div className="drawer-col-products">
                  <h3 className="drawer-col-heading">Products</h3>
                  <ProductToggles
                    products={vehicle.products}
                    isEditMode={isEditMode}
                    onAdd={async (type: ProductType) => {
                      await api.addVehicleProduct(vehicle.id, type);
                      refresh();
                    }}
                    onRemove={async (type: ProductType) => {
                      await api.deleteVehicleProduct(vehicle.id, type);
                      refresh();
                    }}
                  />
                </div>

                <div className="drawer-col-notes">
                  <h3 className="drawer-col-heading">Topics</h3>
                  <NotesPanel
                    vehicleId={vehicle.id}
                    notes={vehicle.notes}
                    isEditMode={isEditMode}
                    onChanged={refresh}
                  />
                </div>
              </div>
            </div>

            {isEditMode && (
              <div className="drawer-footer">
                <button className="btn btn-danger" onClick={() => setDeleting(true)}>
                  <TrashIcon width={13} height={13} /> Delete vehicle
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {deleting && vehicle && (
        <ConfirmDialog
          title={`Delete ${vehicle.name}?`}
          message="This removes the vehicle along with its products and notes."
          busy={deleteBusy}
          onConfirm={handleDeleteVehicle}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  );
}

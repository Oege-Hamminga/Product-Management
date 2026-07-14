import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { ProductType, VehicleDetail } from "../api/types";
import { useAuth } from "../context/AuthContext";
import ImageGallery from "../components/vehicle/ImageGallery";
import ProductCard from "../components/vehicle/ProductCard";
import TopicsList from "../components/vehicle/TopicsList";
import KanbanBoard from "../components/kanban/KanbanBoard";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { PencilIcon, TrashIcon } from "../components/common/Icons";
import VehiclePageSkeleton from "../components/common/VehiclePageSkeleton";
import "./VehiclePage.css";

const PRODUCT_TYPES: ProductType[] = ["CC", "FC", "PW"];

export default function VehiclePage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const { isEditMode } = useAuth();
  const navigate = useNavigate();

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!vehicleId) return;
    try {
      const data = await api.getVehicle(vehicleId);
      setVehicle(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this vehicle.");
    }
  }, [vehicleId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="container vehicle-page">
        <p className="error-text">{error}</p>
        <Link to="/">← Back to brand map</Link>
      </div>
    );
  }

  if (!vehicle) {
    return <VehiclePageSkeleton />;
  }

  async function handleRename() {
    if (!vehicle || !nameDraft.trim()) return;
    await api.renameVehicle(vehicle.id, nameDraft.trim());
    setRenaming(false);
    load();
  }

  async function handleDeleteVehicle() {
    if (!vehicle) return;
    setDeleteBusy(true);
    try {
      await api.deleteVehicle(vehicle.id);
      navigate("/");
    } finally {
      setDeleteBusy(false);
    }
  }

  const productByType = new Map(vehicle.products.map((p) => [p.product_type, p]));

  return (
    <div className="vehicle-page">
      <div className="vehicle-hero">
        <div className="container">
          <div className="vehicle-breadcrumb">
            <Link to="/">Brand map</Link>
            <span>/</span>
            <span>{vehicle.brand.name}</span>
          </div>

          <div className="vehicle-header">
            <div className="vehicle-header-left">
              <div className="vehicle-brand-logo">
                {vehicle.brand.logo_path ? (
                  <img src={vehicle.brand.logo_path} alt={vehicle.brand.name} />
                ) : (
                  <span>{vehicle.brand.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div>
                {renaming ? (
                  <div className="vehicle-title-row">
                    <input
                      className="vehicle-title-input"
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
                  <div className="vehicle-title-row">
                    <h1 className="vehicle-title">{vehicle.name}</h1>
                    {isEditMode && (
                      <button
                        className="icon-btn"
                        title="Rename vehicle"
                        onClick={() => {
                          setNameDraft(vehicle.name);
                          setRenaming(true);
                        }}
                      >
                        <PencilIcon width={13} height={13} />
                      </button>
                    )}
                  </div>
                )}
                <div className="vehicle-brand-name">{vehicle.brand.name}</div>
              </div>
            </div>

            {isEditMode && (
              <button className="btn btn-danger" onClick={() => setDeleting(true)}>
                <TrashIcon width={13} height={13} /> Delete vehicle
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="container vehicle-sections">
        <section className="vehicle-section">
          <div className="vehicle-section-head">
            <h2>Vehicle photos</h2>
          </div>
          <ImageGallery
            images={vehicle.images}
            isEditMode={isEditMode}
            onUpload={async (file) => {
              await api.addVehicleImage(vehicle.id, file);
              load();
            }}
            onDelete={async (imageId) => {
              await api.deleteVehicleImage(vehicle.id, imageId);
              load();
            }}
          />
        </section>

        <section className="vehicle-section">
          <div className="vehicle-section-head">
            <h2>Products</h2>
            <span className="hint">Crew Cab · Flex Cab · Partition Wall</span>
          </div>
          <div className="products-grid">
            {PRODUCT_TYPES.map((type) => (
              <ProductCard
                key={type}
                type={type}
                product={productByType.get(type)}
                isEditMode={isEditMode}
                onAdd={async () => {
                  await api.addVehicleProduct(vehicle.id, type);
                  load();
                }}
                onDelete={async () => {
                  await api.deleteVehicleProduct(vehicle.id, type);
                  load();
                }}
                onUploadImage={async (file) => {
                  await api.uploadVehicleProductImage(vehicle.id, type, file);
                  load();
                }}
                onSaveNotes={async (notes) => {
                  await api.updateVehicleProduct(vehicle.id, type, notes);
                  load();
                }}
              />
            ))}
          </div>
        </section>

        <section className="vehicle-section">
          <div className="vehicle-section-head">
            <h2>Bugtracker</h2>
            <span className="hint">Drag tickets between Margin, Quality and Portfolio</span>
          </div>
          <KanbanBoard vehicleId={vehicle.id} tickets={vehicle.tickets} isEditMode={isEditMode} onChanged={load} />
        </section>

        <section className="vehicle-section">
          <div className="vehicle-section-head">
            <h2>Other topics</h2>
            <span className="hint">Anything outside the bugtracker categories</span>
          </div>
          <TopicsList
            topics={vehicle.topics}
            isEditMode={isEditMode}
            onCreate={async (title, description) => {
              await api.createTopic(vehicle.id, title, description);
              load();
            }}
            onUpdate={async (id, title, description) => {
              await api.updateTopic(id, title, description);
              load();
            }}
            onDelete={async (id) => {
              await api.deleteTopic(id);
              load();
            }}
          />
        </section>
      </div>

      {deleting && (
        <ConfirmDialog
          title={`Delete ${vehicle.name}?`}
          message="This removes the vehicle along with its images, products, bugtracker tickets and topics."
          busy={deleteBusy}
          onConfirm={handleDeleteVehicle}
          onCancel={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

import Skeleton from "./Skeleton";
import "../../pages/VehiclePage.css";

export default function VehiclePageSkeleton() {
  return (
    <div className="vehicle-page">
      <div className="vehicle-hero">
        <div className="container">
          <Skeleton width={140} height={12} style={{ marginBottom: 14 }} />
          <div className="vehicle-header">
            <div className="vehicle-header-left">
              <Skeleton width={46} height={46} circle />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton width={220} height={22} />
                <Skeleton width={120} height={12} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="container vehicle-sections">
        <section className="vehicle-section">
          <Skeleton width={140} height={14} style={{ marginBottom: 12 }} />
          <div className="products-grid">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={160} />
            ))}
          </div>
        </section>
        <section className="vehicle-section">
          <Skeleton width={100} height={14} style={{ marginBottom: 12 }} />
          <div className="products-grid">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={220} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

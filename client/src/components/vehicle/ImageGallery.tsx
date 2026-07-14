import { useRef, useState } from "react";
import type { VehicleImage } from "../../api/types";
import "./ImageGallery.css";

interface ImageGalleryProps {
  images: VehicleImage[];
  isEditMode: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: (imageId: string) => Promise<void>;
}

export default function ImageGallery({ images, isEditMode, onUpload, onDelete }: ImageGalleryProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (images.length === 0 && !isEditMode) {
    return <div className="empty-state">No images uploaded for this vehicle yet.</div>;
  }

  return (
    <div className="gallery-grid">
      {images.map((img) => (
        <div key={img.id} className="gallery-item">
          <img src={img.path} alt="Vehicle" />
          {isEditMode && (
            <button className="icon-btn" title="Delete image" onClick={() => onDelete(img.id)}>
              ×
            </button>
          )}
        </div>
      ))}
      {isEditMode && (
        <label className="gallery-upload">
          {uploading ? "Uploading…" : "+ Add photo"}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => handleFile(e.target.files?.[0])}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { resolveAssetUrl } from "../../api/client";

// Turns a brand name into the filename this component looks for under
// data/default-logos/ — e.g. "Mercedes Benz" -> "mercedes-benz.png".
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A brand with no logo uploaded through Settings falls back to this path —
// same-origin, so it works on any GitHub Pages deployment of this repo with
// no build step: just commit a PNG there (via GitHub's own "Add file" web
// upload, no code change needed) named after the brand, lowercased with
// spaces/punctuation turned into hyphens.
export function defaultLogoUrl(brandName: string): string {
  return resolveAssetUrl(`data/default-logos/${slugify(brandName)}.png`) ?? "";
}

// Renders a brand's uploaded logo, or the matching data/default-logos/ file
// if one exists, or (if neither loads) the brand name as plain text — used
// everywhere a brand logo appears (Slides tiles, the Product Changes
// Overview slide, Settings) so this fallback chain only lives in one place.
export function BrandLogoImg({
  brandName,
  logoPath,
  className,
  textClassName,
}: {
  brandName: string;
  logoPath: string | null;
  className?: string;
  textClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [brandName, logoPath]);

  if (failed) return <span className={textClassName}>{brandName}</span>;

  const src = resolveAssetUrl(logoPath) ?? defaultLogoUrl(brandName);
  return <img className={className} src={src} alt={brandName} onError={() => setFailed(true)} />;
}

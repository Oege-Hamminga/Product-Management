import type { CSSProperties } from "react";
import "./Skeleton.css";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  style?: CSSProperties;
}

export default function Skeleton({ width = "100%", height = 14, circle, style }: SkeletonProps) {
  return (
    <div
      className={`skel${circle ? " skel-circle" : ""}`}
      style={{ width, height, ...style }}
    />
  );
}

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Shape, Vector3, Group } from "three";
import { Line, Trail } from "@react-three/drei";
import type { GeoProjection } from "d3-geo";
import type { CityGeoJSON } from "@/types/map";
import { getInterpolatedHeight } from "./terrainUtils";

export interface HologramBorderProps {
  projection: GeoProjection;
  feature: CityGeoJSON["features"][0];
  boundaryShapes: Shape[];
  depth?: number;
}

export default function HologramBorder(props: HologramBorderProps) {
  const { feature, projection, depth = 1 } = props;
  const follower1Ref = useRef<Group>(null!);
  const follower2Ref = useRef<Group>(null!);

  const t1 = useRef(0);
  const t2 = useRef(0.5); // offset second runner

  // 1. Extract 2D boundary points for the glowing rim lines
  const points = useMemo(() => {
    if (!feature || !feature.geometry) return [];
    const coords = feature.geometry.coordinates;
    const outerRing = feature.geometry.type === "MultiPolygon" ? coords[0][0] : coords[0];
    
    return outerRing.map((el) => {
      const [x, y] = projection(el as [number, number])!;
      return new Vector3(x, -y, 0);
    });
  }, [feature, projection]);

  // Create elevated top-rim points (draped over the 3D terrain + offset)
  const topRimPoints = useMemo(() => {
    return points.map(p => {
      const h = getInterpolatedHeight(p.x, p.y);
      return new Vector3(p.x, p.y, depth + h + 0.06);
    });
  }, [points, depth]);

  // 2. Animate the zipping laser trail followers along the draped path
  useFrame((_, delta) => {
    if (points.length === 0) return;

    // Follower 1 (goes clockwise/forward)
    if (follower1Ref.current) {
      t1.current += delta * 0.12; // speed factor
      const idx = Math.floor(t1.current * points.length) % points.length;
      const p = points[idx] || new Vector3(0, 0, 0);
      const h = getInterpolatedHeight(p.x, p.y);
      follower1Ref.current.position.set(p.x, p.y, depth + h + 0.08);
    }

    // Follower 2 (goes counter-clockwise/backward)
    if (follower2Ref.current) {
      t2.current += delta * 0.16; // speed factor
      const idx = (points.length - 1 - Math.floor(t2.current * points.length)) % points.length;
      const p = points[idx >= 0 ? idx : 0] || new Vector3(0, 0, 0);
      const h = getInterpolatedHeight(p.x, p.y);
      follower2Ref.current.position.set(p.x, p.y, depth + h + 0.08);
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* A. Floating Cyan Neon Guide Ring (Draped tightly over the mountain outline) */}
      {topRimPoints.length > 0 && (
        <Line
          points={topRimPoints}
          color="#00f6ff"
          lineWidth={2.2}
          transparent
          opacity={0.8}
        />
      )}

      {/* B. Sleek Neon Zipping Light Ribbon 1 (Forward Run-Light) */}
      {points.length > 0 && (
        <Trail
          width={1.6}
          length={12}
          color={new Color("#00f6ff")}
          attenuation={(t) => t * t}>
          <group ref={follower1Ref} position={[points[0].x, points[0].y, depth + getInterpolatedHeight(points[0].x, points[0].y) + 0.08]} />
        </Trail>
      )}

      {/* C. Sleek Neon Zipping Light Ribbon 2 (Backward Run-Light) */}
      {points.length > 0 && (
        <Trail
          width={1.2}
          length={10}
          color={new Color("#ff007f")}
          attenuation={(t) => t * t}>
          <group ref={follower2Ref} position={[points[points.length - 1].x, points[points.length - 1].y, depth + getInterpolatedHeight(points[points.length - 1].x, points[points.length - 1].y) + 0.08]} />
        </Trail>
      )}
    </group>
  );
}

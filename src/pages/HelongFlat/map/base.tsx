import { useLayoutEffect, useMemo, useRef } from "react";
import { Center, useTexture } from "@react-three/drei";
import {
  Box2,
  DoubleSide,
  LineSegments,
  Mesh,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  type Group,
} from "three";
import { geoMercator } from "d3-geo";
import { useFrame, useThree } from "@react-three/fiber";
import { gsap } from "gsap";
import ShiftMaterial from "./shaderMaterial";
import GeoTrail from "./geoTrail";
import type { CityGeoJSON } from "@/types/map";
import ShapeBox from "./shape";
import FlyLine from "./flyLine";
import Label from "./label";
import { useConfigStore } from "../stores";

import helongTopography from "@/assets/helong_topography.png";
import Cones from "./cone";

export interface BaseProps {
  depth?: number;
  data: CityGeoJSON;
  outlineData?: CityGeoJSON;
}

export default function Base(props: BaseProps) {
  const { data, outlineData, depth = 0.45 } = props; // 300% thickness (0.15 * 3 = 0.45)
  const groupRef = useRef<Group>(null!);
  const camera = useThree((state) => state.camera);

  const projection = useMemo(() => {
    return geoMercator()
      .center(data.features[0].properties.centroid)
      .scale(600)
      .translate([0, 0]);
  }, [data]);

  const { regions, bbox } = useMemo(() => {
    const regions: {
      name: string;
      center: Vector3;
      points: Vector2[][];
    }[] = [];
    const bbox = new Box2();

    const toV2 = (coord: number[]) => {
      const [x, y] = projection(coord as [number, number])!;
      const projected = new Vector2(x, -y);
      bbox.expandByPoint(projected);
      return projected;
    };

    data.features.forEach((feature) => {
      const [x, y] = projection(
        feature.properties.centroid ?? feature.properties.center
      )!;

      const points = feature.geometry.coordinates.reduce<Vector2[][]>(
        (pre, cur) => [
          ...pre,
          ...cur.map<Vector2[]>((coordinates) => coordinates.map(toV2)),
        ],
        []
      );

      regions.push({
        name: feature.properties.name,
        center: new Vector3(x, -y),
        points,
      });
    });

    let boundary: Shape[] = [];

    outlineData?.features.forEach((feature) => {
      const points = feature.geometry.coordinates.map<Shape>((cur) => {
        return new Shape(
          cur.reduce<Vector2[]>(
            (pre, coordinates) => [...pre, ...coordinates.map(toV2)],
            []
          )
        );
      });

      boundary = boundary.concat(points);
    });

    return {
      regions,
      bbox,
      boundary,
    };
  }, [projection]);

  useLayoutEffect(() => {
    if (!groupRef.current) return;
    const tl = gsap.timeline();

    tl.to(camera.position, {
      x: -1.5,
      y: 6.5,
      z: 9,
      duration: 2.5,
      ease: "circ.out",
      onComplete: () => {
        useConfigStore.setState({ mapPlayComplete: true });
      },
    });
    tl.to(groupRef.current.position, { x: 0, y: 0, z: 0, duration: 1 }, 2.5);

    tl.to(
      groupRef.current.scale,
      {
        x: 1,
        y: 1,
        z: 1,
        duration: 1,
        ease: "circ.out",
      },
      2.5
    );
    groupRef.current.traverse((obj) => {
      if (obj instanceof Mesh || obj instanceof LineSegments) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          tl.to(mat, { opacity: 1, duration: 1, ease: "circ.out" }, 2.5);
        });
      }
    });

    return () => {
      tl.kill();
    };
  }, [camera]);

  return (
    <Center top>
      <group
        castShadow
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.0, 1.0, 1.0]}
        position={[0, -0.01, 0]} // sits flush with mirror floor
      >
        <group ref={groupRef} scale={[1, 1, 0]} position={[0, 0, -0.01]}>
          {regions.map((region, idx) => (
            <City
              key={region.name + idx}
              depth={depth}
              bbox={bbox}
              data={region}
            />
          ))}
          {/* Prevent any hover interception from decorative child meshes */}
          <group raycast={() => null}>
            {outlineData && (
              <GeoTrail
                projection={projection}
                feature={outlineData.features[0]}
              />
            )}
            <Cones data={regions} depth={depth} />
            <FlyLine data={regions} depth={depth} />
            {/* <Boundary data={boundary} /> */}
          </group>
        </group>
      </group>
    </Center>
  );
}

function City(props: {
  depth: number;
  bbox: Box2;
  data: {
    name: string;
    center: Vector3;
    points: Vector2[][];
  };
}) {
  const { bbox, data, depth } = props;
  const materialRef = useRef<ShaderMaterial>(null!);
  const meshRef = useRef<Mesh>(null!);
  const edgeRef = useRef<LineSegments>(null!);
  const labelGroupRef = useRef<Group>(null!);

  const hoverScaleZ = useRef(1.0);
  const currentScaleZ = useRef(1.0);

  const topoTexture = useTexture(helongTopography);

  const [shape, shapeGeometry] = useMemo(() => {
    const shapes = data.points.map((e) => new Shape(e));
    const shapeGeometry = new ShapeGeometry(shapes);
    return [shapes, shapeGeometry];
  }, [data.points]);

  useLayoutEffect(() => {
    if (meshRef.current) {
      const mats = Array.isArray(meshRef.current.material)
        ? meshRef.current.material
        : [meshRef.current.material];
      gsap.to(mats, {
        opacity: 1,
        duration: 1,
        delay: 0.5,
        ease: "circ.out",
      });
    }
    if (edgeRef.current) {
      gsap.to(edgeRef.current.material, {
        opacity: 1,
        duration: 1,
        delay: 0.5,
        ease: "circ.out",
      });
    }
  }, []);

  useFrame((_, delta) => {
    // Smooth lerp for dynamic thickness (scale.z) expansion
    currentScaleZ.current += (hoverScaleZ.current - currentScaleZ.current) * 0.15;
    
    // Scale the mesh along Z-axis (keeps the bottom z=0 flat on floor, stretches top face up)
    if (meshRef.current) {
      meshRef.current.scale.z = currentScaleZ.current;
    }
    
    // Move edge lines and label group to sit perfectly on top of the expanded mesh
    if (edgeRef.current) {
      edgeRef.current.position.z = depth * currentScaleZ.current + 0.005;
    }
    
    if (labelGroupRef.current) {
      labelGroupRef.current.position.z = depth * currentScaleZ.current + 0.05;
    }

    if (materialRef.current) {
      materialRef.current.uniforms.time.value += delta / 3;
    }
  });

  return (
    <group>
      <ShapeBox
        ref={meshRef}
        bbox={bbox}
        args={[shape, { depth, bevelEnabled: false }]}
        onPointerOver={(e) => {
          e.stopPropagation();
          hoverScaleZ.current = 1.6; // 60% thickness increase on hover
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          hoverScaleZ.current = 1.0; // return to base thickness
          document.body.style.cursor = "auto";
        }}
      >
        <meshStandardMaterial
          transparent
          attach="material-0"
          map={topoTexture}
          color="#ffffff"
          metalness={0.0}
          roughness={1.0}
          side={DoubleSide}
          opacity={0}
          onBeforeCompile={(shader: any) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              `#include <map_fragment>`,
              `#include <map_fragment>
               #ifdef USE_MAP
               // Increase saturation of the topography texture
               float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
               diffuseColor.rgb = mix(vec3(luma), diffuseColor.rgb, 1.4);
               #endif`
            );
          }}
        />
        <ShiftMaterial
          transparent
          attach="material-1"
          ref={materialRef}
          opacity={0}
          depth={depth}
        />
      </ShapeBox>
      <lineSegments ref={edgeRef} position={[0, 0, depth + 0.005]} raycast={() => null}>
        <edgesGeometry args={[shapeGeometry]} />
        <lineBasicMaterial transparent color="#ffffff" opacity={0} />
      </lineSegments>
      <group ref={labelGroupRef} position={[data.center.x, data.center.y, depth + 0.05]}>
        <Label
          center
          distanceFactor={10}
          zIndexRange={[100 - 1000]}>
          {data.name}
        </Label>
      </group>
    </group>
  );
}

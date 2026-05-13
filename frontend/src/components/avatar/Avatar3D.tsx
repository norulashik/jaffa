"use client";

// Renders a per-team GLB in a fixed-size <Canvas>. Phase 2 adds the
// `frame` prop: "full" shows head-to-feet (used in the avatar customizer
// preview), "bust" tightly crops head + chest (used on the profile page).
//
// Bundle impact: ~700 KB gzipped (three + r3f + drei). Next.js code-splits
// on the importing route, so only `/profile` and the customizer modal pay
// this cost.

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, Environment, PresentationControls, Center } from "@react-three/drei";

interface Avatar3DProps {
  /** Path to the GLB file (relative to /public). */
  url?: string;
  /** Container side length in px. */
  size?: number;
  /** Drag-to-rotate the model. Off makes it a static decorative shot. */
  interactive?: boolean;
  /** Background colour of the canvas (default transparent so card BG shows). */
  background?: string;
  /** "full" = head-to-feet (customizer), "bust" = head + chest (profile). */
  frame?: "full" | "bust";
}

function ApeModel({ url, frame }: { url: string; frame: "full" | "bust" }) {
  // useGLTF caches by URL across mounts.
  const { scene } = useGLTF(url);
  // For the bust shot we shift the model down so the chest sits at world
  // origin (the camera looks at origin by default), making the head+chest
  // appear centred in the frame. `disableY` on <Center> keeps the model's
  // intrinsic vertical position so the shift is meaningful.
  const yShift = frame === "bust" ? -0.55 : 0;
  return (
    <Center disableY={frame === "bust"}>
      <group position={[0, yShift, 0]}>
        <primitive object={scene} />
      </group>
    </Center>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#3b9eff" opacity={0.2} transparent />
    </mesh>
  );
}

export default function Avatar3D({
  url = "/avatars/kkr.glb",
  size = 320,
  interactive = true,
  background = "transparent",
  frame = "full",
}: Avatar3DProps) {
  const isBust = frame === "bust";
  // Closer camera + tighter FOV crops to the upper body; pulled-back camera
  // shows head-to-feet for the customizer. Both keep the model looking down
  // at the lens (no extreme angles).
  const cameraPos: [number, number, number] = isBust ? [0, 0, 1.25] : [0, 0, 3.5];
  const cameraFov = isBust ? 28 : 35;

  const content = (
    <Suspense fallback={<LoadingFallback />}>
      <ApeModel url={url} frame={frame} />
    </Suspense>
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
      }}
    >
      <Canvas
        camera={{ position: cameraPos, fov: cameraFov }}
        dpr={[1, 2]}
        style={{ background }}
        gl={{ preserveDrawingBuffer: false, antialias: true }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 2]} intensity={1.2} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />
        <Environment preset="city" />
        {interactive ? (
          <PresentationControls
            global
            cursor
            polar={[-0.2, 0.2]}
            azimuth={[-Math.PI / 4, Math.PI / 4]}
          >
            {content}
          </PresentationControls>
        ) : (
          content
        )}
      </Canvas>
    </div>
  );
}

// (Per-team URLs are passed explicitly by the caller; no hard-coded
// preload here so we don't load every team's GLB on app boot. Each GLB
// is downloaded once and cached by `useGLTF` keyed on URL.)

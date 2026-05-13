"use client";

// Phase 1: single GLB rendered in a fixed-size <Canvas>. Loads from
// /public/avatars/ape.glb by default. Designed as a drop-in alternative
// to the procedural SVG AvatarPreview — same containing div size, same
// onClick semantics, just a different visual.
//
// Bundle impact: ~700 KB gzipped (three + r3f + drei). Next.js
// code-splits on the importing route, so only `/profile` (or wherever
// Avatar3D is used) pays this cost.

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
}

function ApeModel({ url }: { url: string }) {
  // useGLTF caches by URL across mounts.
  const { scene } = useGLTF(url);
  return (
    <Center>
      <primitive object={scene} />
    </Center>
  );
}

function LoadingFallback() {
  // Tiny ambient cube so the Canvas isn't entirely empty during decode.
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
}: Avatar3DProps) {
  const content = (
    <Suspense fallback={<LoadingFallback />}>
      <ApeModel url={url} />
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
        camera={{ position: [0, 1.2, 3.2], fov: 35 }}
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

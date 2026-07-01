import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';

// A starter scene: one rotating cube under basic lighting, with orbit controls.
// Ask the agent in chat to extend it — add meshes, materials, textures, physics…
function SpinningCube() {
  const mesh = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (mesh.current) {
      mesh.current.rotation.x += delta * 0.4;
      mesh.current.rotation.y += delta * 0.6;
    }
  });
  return (
    <mesh ref={mesh}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial color="#6366f1" />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
      <color attach="background" args={['#0b0b12']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <SpinningCube />
      <OrbitControls enableDamping />
    </Canvas>
  );
}

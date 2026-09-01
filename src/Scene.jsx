import { Canvas } from "@react-three/fiber";
import Environment from "./components/Environment";

import FrameLimiter from "./utils/FPSLimiter";

const Scene = () => {
  return (
    <Canvas camera={{ fov: 65, position: [0, 30, 100] }} dpr={1}>
      <color attach="background" args={["#0a0a0c"]} />

      <directionalLight position={[4, 25, 10]} intensity={2} />

      <ambientLight intensity={0.6} />

      <Environment />

      {/* <Stats /> */}

      <FrameLimiter />
    </Canvas>
  );
};

export default Scene;

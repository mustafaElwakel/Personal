import { useProgress } from "@react-three/drei";

const Loader = () => {
  const { active } = useProgress();

  if (!active) return null;

  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
    </div>
  );
};

export default Loader;

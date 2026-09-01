import { useRef, useEffect, useMemo, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import {
  useGLTF,
  useAnimations,
  useTexture,
  PositionalAudio,
  Html,
} from "@react-three/drei";
import * as THREE from "three";

// Utils
import { lerpAngle } from "../utils/helper-functions";

// Character configuration
const CHARACTER_SPEED = 12;

// Animation Names
const WALK_ANIMATION = "Armature|mixamo.com|Layer0";
const IDLE_ANIMATION = "Armature.001|mixamo.com|Layer0";

// Floor bounds (character is kept inside these)
const FLOOR_WIDTH = 140;
const FLOOR_DEPTH = 100;
const BOUNDARY_MARGIN = 3;

// Scale used across all props: real-world meters -> scene units,
// matched to the character (~1.75m tall -> ~19.4 scene units).
const WORLD_UNITS_PER_METER = 11.1;

// Porsche 911 (930) Turbo real length is ~4.291m; raw model length along
// its long axis is ~6.233 units, so scale it to match, then convert to
// scene units the same way as everything else.
// Shifted off the character's spawn line (x=0) so props don't sit directly
// behind the character from the default rear-chase camera.
const ROW_X_OFFSET = 25;

const CAR_SCALE = (4.291 / 6.233) * WORLD_UNITS_PER_METER;
// On the other side of the chair (character's right), far enough past the
// spawn point that the character doesn't stand between them and block the
// car from the fixed rear-chase camera.
const CAR_POSITION = [-2 + ROW_X_OFFSET, -0.0949 * CAR_SCALE, -28];

// Cyber dragon chair's raw height (its tallest, most reliable dimension)
// is ~20.695 units; scaled to a real ~1.3m gaming-chair height.
const CHAIR_SCALE = (1.3 / 20.695) * WORLD_UNITS_PER_METER;
// Left of the Porsche, same back-row line, where the office used to sit.
const CHAIR_POSITION = [-38.1 + ROW_X_OFFSET, 0.4, -31.5];

// World position of the chair's center monitor mesh (measured directly from
// the loaded scene), used to anchor the hotspot button and the zoom-in view.
const MONITOR_POSITION = new THREE.Vector3(-14.37, 8.99, -31.5);
const ZOOM_DISTANCE = 16;
const ZOOM_HEIGHT = MONITOR_POSITION.y + 2;
const tempVector = new THREE.Vector3();


const Environment = () => {
  // References for character
  const characterRef = useRef();
  const characterParentRef = useRef();

  // References for movement and rotation smoothing
  const smoothMovement = useRef(new THREE.Vector3());
  const lastMovementTime = useRef(0);
  const currentRotation = useRef(0);
  const characterPosition = new THREE.Vector3();

  // Camera setup
  const { camera } = useThree();
  const cameraOffset = useMemo(() => new THREE.Vector3(0, 20, 30), []);
  const cameraTargetRef = useRef(new THREE.Vector3());

  // State for movement and audio
  const [isMoving, setIsMoving] = useState(false);
  const footstepAudioRef = useRef();

  // Monitor hotspot / zoom state
  const [isZoomed, setIsZoomed] = useState(false);
  const zoomApproachDirRef = useRef(new THREE.Vector3(1, 0, 0));

  const handleHotspotClick = () => {
    setIsZoomed((wasZoomed) => {
      const willZoom = !wasZoomed;
      if (willZoom) {
        zoomApproachDirRef.current
          .set(
            MONITOR_POSITION.x - camera.position.x,
            0,
            MONITOR_POSITION.z - camera.position.z
          )
          .normalize();
      }
      return willZoom;
    });
  };

  // Reference for movement input
  const movement = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });

  // Load character model and animations
  const { scene, animations } = useGLTF("/models/explorer.glb");
  const { actions } = useAnimations(animations, scene);
  const currentAnimationRef = useRef(null);

  // Load character textures
  const [occlusion, texture, normal] = useTexture([
    "/textures/character/occlusion.png",
    "/textures/character/texture.png",
    "/textures/character/normal.png",
  ]);

  texture.flipY = false;
  normal.flipY = false;
  occlusion.flipY = false;

  // Load car prop
  const { scene: carScene } = useGLTF(
    "/models/free_1975_porsche_911_930_turbo.glb"
  );

  // Load cyber dragon chair prop
  const { scene: chairScene } = useGLTF("/models/cyber_dragon_chair.glb");

  // Function to switch character animations
  const switchAnimation = (animationName) => {
    const currentAnimation = currentAnimationRef.current;

    if (currentAnimation === animationName) return;

    actions[currentAnimation]?.fadeOut(0.5);

    if (actions[animationName]) {
      actions[animationName].reset().fadeIn(0.4).play();
      currentAnimationRef.current = animationName;
    }
  };

  // Update character materials and scale on load
  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.material.map = texture;
        child.material.normalMap = normal;
        child.material.aoMap = occlusion;
        child.material.color.set("#1c1c1c");
        child.material.roughness = 0.85;
        child.material.metalness = 0.05;
        child.material.needsUpdate = true;
      }
    });

    if (characterRef.current) {
      characterRef.current.scale.set(0.09, 0.09, 0.09);
    }
  }, [scene, texture, normal, occlusion]);

  // Adjust character's vertical position based on bounding box
  useEffect(() => {
    if (characterRef.current) {
      const boundingBox = new THREE.Box3().setFromObject(characterRef.current);
      const yMin = boundingBox.min.y;

      characterParentRef.current.position.set(
        0,
        -yMin * characterRef.current.scale.y - 0.5,
        0
      );
    }
  }, [scene]);

  // Handle keyboard inputs for movement
  useEffect(() => {
    const handleKeyDown = (event) => {
      switch (event.key.toLowerCase()) {
        case "arrowup":
        case "w":
          movement.current.forward = true;
          break;
        case "arrowdown":
        case "s":
          movement.current.backward = true;
          break;
        case "arrowleft":
        case "a":
          movement.current.left = true;
          break;
        case "arrowright":
        case "d":
          movement.current.right = true;
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (event) => {
      switch (event.key.toLowerCase()) {
        case "arrowup":
        case "w":
          movement.current.forward = false;
          break;
        case "arrowdown":
        case "s":
          movement.current.backward = false;
          break;
        case "arrowleft":
        case "a":
          movement.current.left = false;
          break;
        case "arrowright":
        case "d":
          movement.current.right = false;
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Handle touch inputs for mobile controls
  useEffect(() => {
    const touchStartRef = { x: 0, y: 0 };
    const joystickRef = { x: 0, y: 0 };

    const handleTouchStart = (event) => {
      const touch = event.touches[0];
      touchStartRef.x = touch.clientX;
      touchStartRef.y = touch.clientY;
    };

    const handleTouchMove = (event) => {
      event.preventDefault();
      const touch = event.touches[0];
      const deltaX = touch.clientX - touchStartRef.x;
      const deltaY = touch.clientY - touchStartRef.y;

      const maxRadius = 50; // Maximum joystick radius
      const distance = Math.min(
        Math.sqrt(deltaX * deltaX + deltaY * deltaY),
        maxRadius
      );
      const angle = Math.atan2(deltaY, deltaX);

      joystickRef.x = (distance / maxRadius) * Math.cos(angle);
      joystickRef.y = (distance / maxRadius) * Math.sin(angle);

      movement.current.left = joystickRef.x < -0.3;
      movement.current.right = joystickRef.x > 0.3;
      movement.current.forward = joystickRef.y < -0.3;
      movement.current.backward = joystickRef.y > 0.3;
    };

    const handleTouchEnd = () => {
      joystickRef.x = 0;
      joystickRef.y = 0;
      movement.current.left = false;
      movement.current.right = false;
      movement.current.forward = false;
      movement.current.backward = false;
    };

    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // Main animation loop
  useFrame((state, delta) => {
    if (isZoomed) {
      tempVector
        .copy(zoomApproachDirRef.current)
        .multiplyScalar(ZOOM_DISTANCE)
        .add(MONITOR_POSITION);
      tempVector.y = ZOOM_HEIGHT;
      camera.position.lerp(tempVector, 0.06);
      camera.lookAt(MONITOR_POSITION);
      return;
    }

    const speed = CHARACTER_SPEED;
    const direction = new THREE.Vector3();

    // Determine movement direction based on input
    if (movement.current.forward) direction.z -= 1;
    if (movement.current.backward) direction.z += 1;
    if (movement.current.left) direction.x -= 1;
    if (movement.current.right) direction.x += 1;

    direction.normalize();

    // Apply smoothing to the movement
    smoothMovement.current.lerp(direction, 0.05);

    const isCurrentlyMoving = smoothMovement.current.lengthSq() > 0.01;

    // Handle movement state and audio
    if (isCurrentlyMoving) {
      lastMovementTime.current = state.clock.elapsedTime;
      if (!isMoving) {
        setIsMoving(true);
        if (footstepAudioRef.current && !footstepAudioRef.current.isPlaying) {
          footstepAudioRef.current.play();
        }
      }
    } else {
      if (state.clock.elapsedTime - lastMovementTime.current > 1) {
        if (isMoving) {
          setIsMoving(false);
          if (footstepAudioRef.current && footstepAudioRef.current.isPlaying) {
            footstepAudioRef.current.stop();
          }
        }
      }
    }

    // Update animation based on movement
    switchAnimation(isCurrentlyMoving ? WALK_ANIMATION : IDLE_ANIMATION);

    // Update character position and rotation
    if (characterParentRef.current) {
      if (isCurrentlyMoving) {
        characterParentRef.current.position.addScaledVector(
          smoothMovement.current,
          speed * delta
        );

        // Keep the character inside the warehouse floor
        const halfWidth = FLOOR_WIDTH / 2 - BOUNDARY_MARGIN;
        const halfDepth = FLOOR_DEPTH / 2 - BOUNDARY_MARGIN;
        characterParentRef.current.position.x = THREE.MathUtils.clamp(
          characterParentRef.current.position.x,
          -halfWidth,
          halfWidth
        );
        characterParentRef.current.position.z = THREE.MathUtils.clamp(
          characterParentRef.current.position.z,
          -halfDepth,
          halfDepth
        );

        const targetRotation = Math.atan2(
          smoothMovement.current.x,
          smoothMovement.current.z
        );
        currentRotation.current = lerpAngle(
          currentRotation.current,
          targetRotation,
          delta * 4
        );
        characterParentRef.current.rotation.y = currentRotation.current;
      }

      characterParentRef.current.getWorldPosition(characterPosition);

      cameraTargetRef.current
        .copy(characterPosition)
        .add(new THREE.Vector3(0, 0, 0));

      const offsetRotated = cameraOffset
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 0, 0), currentRotation.current);
      const targetCameraPosition = characterPosition.clone().add(offsetRotated);

      camera.position.lerp(targetCameraPosition, 0.01);
      camera.lookAt(
        cameraTargetRef.current.x,
        cameraTargetRef.current.y + 7,
        cameraTargetRef.current.z
      );
    }
  });

  return (
    <>
      {/* Warehouse floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_WIDTH, FLOOR_DEPTH]} />
        <meshBasicMaterial color="#0a0a0c" toneMapped={false} />
      </mesh>

      <primitive
        object={carScene}
        position={CAR_POSITION}
        scale={CAR_SCALE}
      />

      <primitive
        object={chairScene}
        position={CHAIR_POSITION}
        scale={CHAIR_SCALE}
        rotation={[0, (3 * Math.PI) / 2, 0]}
      />

      <Html position={MONITOR_POSITION} zIndexRange={[10, 0]}>
        <div className="monitor-hotspot">
          <button
            type="button"
            className="hotspot-button"
            onClick={handleHotspotClick}
            aria-label="Warehouse Tech"
          />
          {isZoomed && (
            <div className="hotspot-popup">Warehouse Tech</div>
          )}
        </div>
      </Html>

      <group ref={characterParentRef}>
        <primitive ref={characterRef} object={scene} />
        <PositionalAudio
          ref={footstepAudioRef}
          url="/audio/snow-step.mp3"
          distance={10}
          loop={true}
          autoplay={false}
        />
      </group>
    </>
  );
};

export default Environment;

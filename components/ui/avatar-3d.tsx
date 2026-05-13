"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Avatar3DConfig } from "@/lib/avatars";

type Avatar3DProps = {
  config: Avatar3DConfig;
  className?: string;
};

export function Avatar3D({ config, className }: Avatar3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const testCanvas = document.createElement("canvas");
    const gl =
      testCanvas.getContext("webgl2") ||
      testCanvas.getContext("webgl") ||
      testCanvas.getContext("experimental-webgl");

    if (!gl) {
      setFallback(true);
      return;
    }

    setFallback(false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
    camera.position.set(0, 0.1, 6.2);
    camera.lookAt(0, 0.15, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.15);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff8ef, 1.1);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.65);
    fillLight.position.set(-4, 1.8, 3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf5d0fe, 0.45);
    rimLight.position.set(0, 4, -4);
    scene.add(rimLight);

    const group = new THREE.Group();
    group.position.y = -0.05;
    scene.add(group);

    const backdrop = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 64),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(config.style === "girl" ? 0xf3e8ff : 0xe0f2fe),
        transparent: true,
        opacity: 0.95,
      })
    );
    backdrop.position.set(0, 0.1, -2.4);
    group.add(backdrop);

    const skin = new THREE.Color(config.skinTone);
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: skin,
      roughness: 0.52,
      metalness: 0.02,
    });
    const softSkinMaterial = new THREE.MeshStandardMaterial({
      color: skin.clone().offsetHSL(0, 0.02, 0.05),
      roughness: 0.5,
      metalness: 0.02,
    });
    const shadowSkinMaterial = new THREE.MeshStandardMaterial({
      color: skin.clone().offsetHSL(0, -0.02, -0.08),
      roughness: 0.55,
      metalness: 0.01,
    });
    const hairMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.hairColor),
      roughness: 0.72,
      metalness: 0.04,
    });

    const head = new THREE.Mesh(createHeadGeometry(), skinMaterial);
    head.position.set(0, 0.2, 0);
    group.add(head);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.65, 24), shadowSkinMaterial);
    neck.position.set(0, -1.2, -0.05);
    group.add(neck);

    const shoulders = new THREE.Mesh(
      new THREE.CapsuleGeometry(1.18, 0.95, 6, 18),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(config.style === "girl" ? 0xfbcfe8 : 0xbfdbfe),
        roughness: 0.82,
        metalness: 0.02,
      })
    );
    shoulders.position.set(0, -2.1, -0.55);
    shoulders.scale.set(1.05, 0.58, 0.72);
    group.add(shoulders);

    const leftEar = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 18), shadowSkinMaterial);
    leftEar.position.set(-1.05, 0.12, 0.02);
    leftEar.scale.set(0.65, 0.9, 0.55);
    const rightEar = leftEar.clone();
    rightEar.position.x = 1.05;
    group.add(leftEar, rightEar);

    const cheeks = createCheeks(softSkinMaterial);
    group.add(cheeks);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 18), shadowSkinMaterial);
    nose.position.set(0, -0.03, 1.0);
    nose.scale.set(0.72, 0.95, 1.15);
    group.add(nose);

    const philtrum = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.03, 0.12, 3, 8),
      new THREE.MeshStandardMaterial({
        color: skin.clone().offsetHSL(0, -0.02, -0.12),
        roughness: 0.52,
      })
    );
    philtrum.position.set(0, -0.47, 1.04);
    group.add(philtrum);

    const mouth = createMouthMesh();
    group.add(mouth);

    const eyeFeatures = createEyeFeatures(config, skinMaterial);
    group.add(eyeFeatures);

    const brows = createBrows(config);
    group.add(brows);

    const hair = createHairMesh(config, hairMaterial);
    group.add(hair);

    let frameId = 0;
    let lastSize = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const size = Math.max(1, Math.min(rect.width, rect.height));
      if (size === lastSize) return;
      lastSize = size;
      renderer.setSize(size, size, true);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(container);

    group.rotation.y = -0.24;
    group.rotation.x = 0.04;

    const animate = () => {
      resize();
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
      renderer.dispose();
      scene.traverse((object: any) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((material: any) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      container.removeChild(renderer.domElement);
    };
  }, [config]);

  if (fallback) {
    return (
      <div
        className={className}
        aria-label="3D avatar fallback"
        role="img"
        style={{
          borderRadius: "9999px",
          background: `radial-gradient(circle at 30% 25%, #ffffff 0%, ${config.style === "girl" ? "#f3e8ff" : "#e0f2fe"} 70%)`,
          display: "grid",
          placeItems: "center",
          color: "#1f2937",
          fontSize: "0.85rem",
        }}
      >
        3D
      </div>
    );
  }

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}

function createHeadGeometry() {
  const geometry = new THREE.SphereGeometry(1.12, 48, 48);
  const position = geometry.attributes.position;
  const vector = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    vector.fromBufferAttribute(position, i);

    const yNorm = vector.y / 1.12;
    const jaw = THREE.MathUtils.clamp((-yNorm - 0.04) / 0.96, 0, 1);
    const forehead = THREE.MathUtils.clamp((yNorm - 0.2) / 0.8, 0, 1);
    const cheek = Math.max(0, 1 - Math.abs(yNorm - 0.05) * 1.35);

    vector.x *= 1.0 - jaw * 0.22 - forehead * 0.06 + cheek * 0.04;
    vector.y *= 1.1;
    vector.z *= 0.95 + jaw * 0.08;

    if (yNorm < -0.72) {
      vector.x *= 0.78;
      vector.z *= 0.92;
    }

    position.setXYZ(i, vector.x, vector.y, vector.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createCheeks(material: any) {
  const group = new THREE.Group();
  const left = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 18), material);
  left.position.set(-0.48, -0.24, 0.82);
  left.scale.set(1.15, 0.65, 0.75);
  const right = left.clone();
  right.position.x = 0.48;
  group.add(left, right);
  return group;
}

function createMouthMesh() {
  const upperCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.22, -0.48, 1.03),
    new THREE.Vector3(-0.11, -0.525, 1.048),
    new THREE.Vector3(0, -0.54, 1.054),
    new THREE.Vector3(0.11, -0.525, 1.048),
    new THREE.Vector3(0.22, -0.48, 1.03),
  ]);

  const lowerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.15, -0.505, 1.026),
    new THREE.Vector3(-0.05, -0.535, 1.037),
    new THREE.Vector3(0.05, -0.535, 1.037),
    new THREE.Vector3(0.15, -0.505, 1.026),
  ]);

  const lipMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#9a3412"),
    roughness: 0.4,
    metalness: 0.02,
  });

  const shadowMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#7c2d12"),
    roughness: 0.46,
    metalness: 0.02,
  });

  const upperLip = new THREE.Mesh(new THREE.TubeGeometry(upperCurve, 32, 0.018, 10, false), lipMaterial);
  const lowerLip = new THREE.Mesh(new THREE.TubeGeometry(lowerCurve, 24, 0.013, 10, false), shadowMaterial);

  const group = new THREE.Group();
  group.add(upperLip, lowerLip);
  return group;
}

function createEyeFeatures(config: Avatar3DConfig, skinMaterial: any) {
  const group = new THREE.Group();

  const left = createSingleEye(config, false, skinMaterial);
  left.position.set(-0.42, 0.16, 0.98);
  const right = createSingleEye(config, config.eyeStyle === "wink", skinMaterial);
  right.position.set(0.42, 0.16, 0.98);

  if (config.eyeStyle === "almond") {
    left.rotation.z = -0.08;
    right.rotation.z = 0.08;
  }

  group.add(left, right);
  return group;
}

function createSingleEye(config: Avatar3DConfig, wink: boolean, skinMaterial: any) {
  const group = new THREE.Group();

  if (wink) {
    const curve = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.016, 8, 24, Math.PI * 0.85),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(config.eyeColor),
        roughness: 0.35,
      })
    );
    curve.rotation.set(Math.PI, 0, 0.2);
    group.add(curve);
    return group;
  }

  const sclera = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 20),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f8fafc"),
      roughness: 0.18,
      metalness: 0.02,
    })
  );

  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(0.082, 18, 18),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.eyeColor),
      roughness: 0.25,
      metalness: 0.1,
    })
  );
  iris.position.z = 0.11;

  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 16),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#020617"),
      roughness: 0.15,
    })
  );
  pupil.position.z = 0.17;

  const highlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 10, 10),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ffffff"),
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 0.25,
      roughness: 0.1,
    })
  );
  highlight.position.set(0.03, 0.03, 0.19);

  const upperLid = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 18, 18, 0, Math.PI * 2, 0, Math.PI * 0.48),
    skinMaterial
  );
  upperLid.position.set(0, 0.085, 0.02);
  upperLid.rotation.x = -0.12;

  const lowerLid = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 18, 18, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.18),
    skinMaterial
  );
  lowerLid.position.set(0, -0.04, 0.02);

  if (config.eyeStyle === "almond") {
    sclera.scale.set(1.2, 0.68, 0.7);
    upperLid.position.y = 0.07;
    lowerLid.scale.set(1.1, 0.82, 0.8);
  } else if (config.eyeStyle === "sleepy") {
    sclera.scale.set(1.12, 0.58, 0.72);
    upperLid.position.y = 0.045;
    upperLid.scale.set(1.05, 1.12, 1);
    lowerLid.scale.set(1.1, 0.75, 0.85);
    iris.position.y = -0.015;
  } else {
    sclera.scale.set(1, 0.92, 0.78);
  }

  group.add(sclera, iris, pupil, highlight, upperLid, lowerLid);
  return group;
}

function createBrows(config: Avatar3DConfig) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.hairColor),
    roughness: 0.6,
  });

  const left = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.22, 4, 8), material);
  left.position.set(-0.42, 0.43, 1.0);
  left.rotation.z = -0.18;

  const right = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.22, 4, 8), material);
  right.position.set(0.42, 0.43, 1.0);
  right.rotation.z = 0.18;

  if (config.eyeStyle === "sleepy") {
    left.rotation.z = -0.08;
    right.rotation.z = 0.08;
    left.position.y = 0.39;
    right.position.y = 0.39;
  }

  group.add(left, right);
  return group;
}

function createHairMesh(config: Avatar3DConfig, material: any) {
  const group = new THREE.Group();

  const scalp = new THREE.Mesh(
    new THREE.SphereGeometry(1.18, 40, 40, 0, Math.PI * 2, 0, Math.PI * 0.56),
    material
  );
  scalp.position.set(0, 0.9, -0.02);
  scalp.scale.set(1.0, 1.0, 0.96);
  group.add(scalp);

  switch (config.hairStyle) {
    case "short": {
      const fringe = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.7, 4, 10), material);
      fringe.position.set(0, 0.72, 0.78);
      fringe.rotation.set(1.36, 0, 0);
      group.add(fringe);
      break;
    }
    case "quiff": {
      const quiff = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.95, 6, 14), material);
      quiff.position.set(0, 1.02, 0.55);
      quiff.rotation.set(1.1, 0, 0);
      quiff.scale.set(1, 1.12, 0.88);

      const side = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.6, 4, 10), material);
      side.position.set(-0.78, 0.47, 0.22);
      side.rotation.z = -0.1;
      const side2 = side.clone();
      side2.position.x = 0.78;
      side2.rotation.z = 0.1;

      group.add(quiff, side, side2);
      break;
    }
    case "fade": {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.02, 28, 28, 0, Math.PI * 2, 0, Math.PI * 0.45), material);
      crown.position.set(0, 0.92, 0.05);
      crown.scale.set(1.0, 0.9, 0.94);

      const side = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.78, 1.08), material);
      side.position.set(0, 0.44, 0.02);
      side.scale.set(1, 0.86, 0.92);

      group.add(crown, side);
      break;
    }
    case "buzz": {
      scalp.scale.set(0.96, 0.93, 0.92);
      break;
    }
    case "bob": {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 0.95, 6, 18), material);
      back.position.set(0, 0.18, -0.18);
      back.scale.set(1.02, 1.08, 0.88);

      const bangs = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.2, 4, 10), material);
      bangs.position.set(0, 0.62, 0.74);
      bangs.rotation.x = 1.34;
      bangs.scale.set(1, 0.9, 0.9);

      const side = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.9, 4, 10), material);
      side.position.set(-0.86, -0.02, 0.22);
      side.rotation.z = -0.06;
      const side2 = side.clone();
      side2.position.x = 0.86;
      side2.rotation.z = 0.06;

      group.add(back, bangs, side, side2);
      break;
    }
    case "long": {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(1.08, 2.25, 8, 20), material);
      back.position.set(0, -0.45, -0.35);
      back.scale.set(1.02, 1.12, 0.82);

      const leftStrand = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 2.1, 6, 14), material);
      leftStrand.position.set(-0.82, -0.18, 0.3);
      leftStrand.rotation.z = 0.06;

      const rightStrand = leftStrand.clone();
      rightStrand.position.x = 0.82;
      rightStrand.rotation.z = -0.06;

      const bangs = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.08, 4, 10), material);
      bangs.position.set(0, 0.7, 0.78);
      bangs.rotation.x = 1.35;

      group.add(back, leftStrand, rightStrand, bangs);
      break;
    }
    case "wave": {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(1.02, 1.9, 8, 18), material);
      back.position.set(0, -0.24, -0.28);
      back.scale.set(1, 1.06, 0.82);

      const leftWave = new THREE.Mesh(new THREE.TorusKnotGeometry(0.28, 0.08, 60, 10), material);
      leftWave.position.set(-0.88, -0.18, 0.24);
      leftWave.rotation.set(1.2, 0.4, 0.4);
      leftWave.scale.set(0.92, 1.45, 0.8);

      const rightWave = leftWave.clone();
      rightWave.position.x = 0.88;
      rightWave.rotation.y = -0.4;
      rightWave.rotation.z = -0.4;

      const fringe = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.0, 4, 10), material);
      fringe.position.set(0, 0.7, 0.75);
      fringe.rotation.x = 1.32;

      group.add(back, leftWave, rightWave, fringe);
      break;
    }
    case "bun": {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 1.05, 6, 18), material);
      back.position.set(0, 0.12, -0.18);
      back.scale.set(1, 1.02, 0.84);

      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), material);
      bun.position.set(0, 1.52, -0.16);
      bun.scale.set(1, 0.92, 1);

      const side = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.05, 4, 10), material);
      side.position.set(-0.82, -0.02, 0.24);
      const side2 = side.clone();
      side2.position.x = 0.82;

      group.add(back, bun, side, side2);
      break;
    }
    default:
      break;
  }

  return group;
}

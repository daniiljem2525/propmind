import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Archviz-квартал для hero: два сблокированных корпуса с витражными лоджиями,
 * рамами окон, витриной первого этажа, благоустройством и IBL-окружением.
 *
 * Всё процедурное: геометрия строится кодом, текстуры — canvas, окружение —
 * PMREM из градиента. Ни GLTF, ни HDRI-файлов.
 *
 * Правила: аддитивные элементы (рамы, откосы, балясины) считаются от позиции
 * корпуса — b.x / b.z прибавляются всегда, иначе инстансы улетают к началу
 * координат.
 */

const FLOOR = 1.55;

const BUILDINGS = [
  // белый корпус с антрацитовым торцом, балконы к зрителю (+z)
  { id: "a", x: -2.6, z: 1.6, w: 11.4, d: 6.6, floors: 5, dark: "end", balcony: "z+", cols: 5 },
  // тёмный корпус-вставка справа
  { id: "b", x: 7.0, z: -1.2, w: 6.2, d: 6.2, floors: 5, dark: "body", balcony: "z+", cols: 3 },
];

const C = {
  wall: "#eaeff4",
  wallSide: "#e7edf3",
  band: "#e9eef4",
  dark: "#3b4147",
  darkSide: "#33383d",
  frame: "#f4f7fa",
  sill: "#e6ebf1",
  glassTop: "#93a9bd",
  glassBottom: "#243140",
  balconyGlass: "#a9c8de",
  metal: "#9aa5b1",
  plinth: "#2f353a",
  roofSlab: "#d2dae4",
  parapet: "#d7dee6",
  tech: "#c9d1d9",
  grass: "#6f8b55",
  grassAlt: "#63804b",
  paving: "#d5d9de",
  curb: "#c2c8cf",
  road: "#4b525a",
  trunk: "#6b5744",
  leaf: "#4d7842",
  leafAlt: "#5c8a4a",
};

const PLOT = { w: 30, d: 24 };

/* ——— процедурные текстуры ——— */

function makeGlassTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, C.glassTop);
  grad.addColorStop(0.45, "#64798d");
  grad.addColorStop(0.62, "#3c4d5f");
  grad.addColorStop(1, C.glassBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);

  // лёгкие блики по стеклу
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, 40);
  ctx.lineTo(64, 8);
  ctx.lineTo(64, 40);
  ctx.lineTo(0, 74);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePavingTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = C.paving;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(120,130,142,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  return texture;
}

function makeAOTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, "rgba(20,28,36,0.34)");
  grad.addColorStop(0.55, "rgba(20,28,36,0.16)");
  grad.addColorStop(1, "rgba(20,28,36,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeEnvTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#f2f7fd");
  grad.addColorStop(0.46, "#dbe6f2");
  grad.addColorStop(0.5, "#c3cdd6");
  grad.addColorStop(0.54, "#93a189");
  grad.addColorStop(1, "#6f7f61");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ——— сборка инстансов ——— */

function buildInstances() {
  const windows = [];
  const frames = [];
  const sills = [];
  const mullions = [];
  const slabs = [];
  const panels = [];
  const balusters = [];
  const rails = [];

  for (const b of BUILDINGS) {
    const h = b.floors * FLOOR;
    const halfW = b.w / 2;
    const halfD = b.d / 2;

    for (let f = 1; f < b.floors; f += 1) {
      const y = f * FLOOR + FLOOR * 0.52;

      // фасады ±z
      const stepX = b.w / (b.cols + 1);
      for (let i = 1; i <= b.cols; i += 1) {
        const x = b.x - halfW + stepX * i;
        const ww = i % 2 === 0 ? 1.14 : 0.92;
        for (const sign of [1, -1]) {
          const z = b.z + sign * (halfD + 0.01);
          frames.push({ p: [x, y, z], s: [ww + 0.2, 1.2, 0.05], r: 0 });
          windows.push({ p: [x, y, z + sign * 0.03], s: [ww, 1.0, 0.04], r: 0 });
          mullions.push({ p: [x, y, z + sign * 0.06], s: [0.05, 1.0, 0.03], r: 0 });
          sills.push({ p: [x, y - 0.56, b.z + sign * (halfD + 0.05)], s: [ww + 0.3, 0.07, 0.16], r: 0 });
        }
      }

      // фасады ±x
      const rows = Math.max(2, Math.round(b.d / 2.2));
      const stepZ = b.d / (rows + 1);
      for (let i = 1; i <= rows; i += 1) {
        const z = b.z - halfD + stepZ * i;
        for (const sign of [1, -1]) {
          const x = b.x + sign * (halfW + 0.01);
          frames.push({ p: [x, y, z], s: [0.05, 1.2, 1.34], r: 0 });
          windows.push({ p: [x + sign * 0.03, y, z], s: [0.04, 1.0, 1.14], r: 0 });
          sills.push({ p: [b.x + sign * (halfW + 0.05), y - 0.56, z], s: [0.16, 0.07, 1.44], r: 0 });
        }
      }
    }

    // витрина первого этажа по главному фасаду
    const plinthY = FLOOR * 0.52;
    const storefront = b.w * 0.62;
    frames.push({ p: [b.x, plinthY, b.z + halfD + 0.01], s: [storefront, 1.36, 0.05], r: 0 });
    windows.push({ p: [b.x, plinthY, b.z + halfD + 0.04], s: [storefront - 0.16, 1.2, 0.04], r: 0 });
    for (let i = -2; i <= 2; i += 1) {
      mullions.push({ p: [b.x + (storefront / 5) * i, plinthY, b.z + halfD + 0.07], s: [0.06, 1.2, 0.04], r: 0 });
    }

    // балконы
    if (b.balcony) {
      const span = b.w;
      const count = Math.max(2, Math.floor(span / 2.7));
      const step = span / count;
      const depth = 1.1;

      for (let f = 1; f < b.floors; f += 1) {
        const y = f * FLOOR + 0.08;
        for (let i = 0; i < count; i += 1) {
          const t = -span / 2 + step * (i + 0.5);
          const width = Math.min(1.95, step * 0.84);
          const px = b.x + t;
          const pz = b.z + halfD + depth / 2;

          slabs.push({ p: [px, y, pz], s: [width, 0.16, depth], r: 0 });

          const gh = 1.0;
          const gy = y + gh / 2 + 0.08;
          const glassZ = pz + depth / 2 - 0.04;

          panels.push({ p: [px, gy, glassZ], s: [width * 0.98, gh, 0.035], r: 0 });
          for (const side of [-1, 1]) {
            panels.push({ p: [px + side * (width / 2 - 0.02), gy, pz], s: [0.035, gh, depth * 0.98], r: 0 });
            rails.push({ p: [px + side * (width / 2 - 0.02), gy, glassZ], s: [0.05, gh, 0.05], r: 0 });
          }

          // верхняя планка и балясины
          rails.push({ p: [px, y + gh + 0.12, glassZ], s: [width, 0.06, 0.06], r: 0 });
          const bars = Math.max(3, Math.round(width / 0.28));
          for (let k = 0; k <= bars; k += 1) {
            const bx = px - width / 2 + (width / bars) * k;
            balusters.push({ p: [bx, gy, glassZ + 0.005], s: [0.018, gh, 0.018], r: 0 });
          }
        }
      }
    }
  }

  return { windows, frames, sills, mullions, slabs, panels, balusters, rails };
}

function Instances({ data, material, castShadow = false, receiveShadow = false, renderOrder }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || !data.length) return;
    const dummy = new THREE.Object3D();
    data.forEach((item, index) => {
      dummy.position.set(item.p[0], item.p[1], item.p[2]);
      dummy.scale.set(item.s[0], item.s[1], item.s[2]);
      dummy.rotation.set(0, item.r ?? 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.count = data.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [data]);

  if (!data.length) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, data.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      renderOrder={renderOrder}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      {material}
    </instancedMesh>
  );
}

/* ——— корпус ——— */
function BuildingBlock({ b }) {
  const h = b.floors * FLOOR;
  const halfW = b.w / 2;
  const halfD = b.d / 2;
  const isDark = b.dark === "body";
  const ao = useMemo(() => makeAOTexture(), []);

  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.w, h, b.d]} />
        <meshStandardMaterial
          color={isDark ? C.dark : C.wall}
          roughness={0.9}
          metalness={0}
          envMapIntensity={0.14}
        />
      </mesh>

      {b.dark === "end" && (
        <mesh position={[-halfW + 1.15, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.3, h + 0.02, b.d + 0.02]} />
          <meshStandardMaterial color={C.dark} roughness={0.8} metalness={0} envMapIntensity={0.3} />
        </mesh>
      )}

      {Array.from({ length: b.floors }, (_, f) => (
        <mesh key={f} position={[0, (f + 1) * FLOOR - 0.06, 0]} castShadow receiveShadow>
          <boxGeometry args={[b.w + 0.12, 0.09, b.d + 0.12]} />
          <meshStandardMaterial color={C.band} roughness={0.92} metalness={0} />
        </mesh>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0.2]} renderOrder={1}>
        <planeGeometry args={[b.w + 5.5, b.d + 5.5]} />
        <meshBasicMaterial map={ao} transparent depthWrite={false} />
      </mesh>

      {/* кровля + парапет + техблоки */}
      <mesh position={[0, h + 0.01, 0]} receiveShadow>
        <boxGeometry args={[b.w - 0.04, 0.02, b.d - 0.04]} />
        <meshStandardMaterial color={C.roofSlab} roughness={0.95} />
      </mesh>
      {[
        [0, halfD - 0.08, b.w + 0.1, 0.16],
        [0, -halfD + 0.08, b.w + 0.1, 0.16],
      ].map(([px, pz, sx, sz], i) => (
        <mesh key={`pz${i}`} position={[px, h + 0.17, pz]} castShadow>
          <boxGeometry args={[sx, 0.34, sz]} />
          <meshStandardMaterial color={C.parapet} roughness={0.92} />
        </mesh>
      ))}
      {[-1, 1].map((sign, i) => (
        <mesh key={`px${i}`} position={[sign * (halfW - 0.08), h + 0.17, 0]} castShadow>
          <boxGeometry args={[0.16, 0.34, b.d - 0.16]} />
          <meshStandardMaterial color={C.parapet} roughness={0.92} />
        </mesh>
      ))}

      {[
        [-halfW * 0.42, halfD * 0.18, 1.0, 0.46, 0.8],
        [halfW * 0.22, -halfD * 0.24, 0.85, 0.38, 0.7],
        [halfW * 0.52, halfD * 0.12, 0.7, 0.3, 0.6],
      ].map(([tx, tz, sx, sy, sz], i) => (
        <mesh key={`t${i}`} position={[tx, h + 0.02 + sy / 2, tz]} castShadow>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial color={C.tech} roughness={0.85} />
        </mesh>
      ))}

      {/* вентстояки */}
      {[-halfW * 0.2, halfW * 0.36].map((tx, i) => (
        <mesh key={`v${i}`} position={[tx, h + 0.02 + 0.3, halfD * 0.32]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.6, 8]} />
          <meshStandardMaterial color={C.parapet} roughness={0.7} metalness={0.2} />
        </mesh>
      ))}

      {/* цоколь, козырёк, дверь */}
      <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.w + 0.22, 0.48, b.d + 0.22]} />
        <meshStandardMaterial color={C.plinth} roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.42, halfD + 0.62]} castShadow>
        <boxGeometry args={[3.4, 0.16, 1.5]} />
        <meshStandardMaterial color={C.band} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.72, halfD + 0.07]}>
        <boxGeometry args={[2.0, 1.1, 0.09]} />
        <meshStandardMaterial color="#2c3a48" roughness={0.2} metalness={0.35} envMapIntensity={0.8} />
      </mesh>
    </group>
  );
}

/* ——— благоустройство ——— */
function Ground({ pavingTexture }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[PLOT.w, PLOT.d]} />
        <meshStandardMaterial color={C.grass} roughness={1} />
      </mesh>

      {[
        [-8.5, 8.6, 8, 3.4],
        [7.2, 8.8, 9.5, 3.2],
        [0.2, 1.0, 6.5, 2.4],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.012, z]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={C.grassAlt} roughness={1} />
        </mesh>
      ))}

      {/* дорожки с плиткой */}
      {[
        [0, 8.6, 28, 1.7],
        [0, -0.4, 1.8, 17],
        [7.0, 6.4, 1.4, 4.4],
      ].map(([x, z, w, d], i) => (
        <mesh key={`p${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.022, z]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial map={pavingTexture} color="#ffffff" roughness={0.95} />
        </mesh>
      ))}

      {/* бордюры вдоль главной дорожки */}
      {[-1, 1].map((sign) => (
        <mesh key={sign} position={[0, 0.05, 8.6 + sign * 0.92]} receiveShadow>
          <boxGeometry args={[28, 0.1, 0.14]} />
          <meshStandardMaterial color={C.curb} roughness={0.9} />
        </mesh>
      ))}

      {/* проезд, парковка, разметка */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-13.4, 0.02, 0]} receiveShadow>
        <planeGeometry args={[3.2, 22]} />
        <meshStandardMaterial color={C.road} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-11.4, 0.021, 6.4]} receiveShadow>
        <planeGeometry args={[2.6, 6.4]} />
        <meshStandardMaterial color={C.paving} roughness={0.95} />
      </mesh>
      {[-1, 1].map((sign) => (
        <mesh key={`l${sign}`} rotation={[-Math.PI / 2, 0, 0]} position={[-11.4 + sign * 1.15, 0.023, 6.4]} receiveShadow>
          <planeGeometry args={[0.08, 6.2]} />
          <meshStandardMaterial color="#eef1f4" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

const TREES = [
  [-11.2, 9.0, 1.2],
  [-10.4, -6.2, 1.05],
  [-3.2, 9.4, 0.95],
  [3.4, 9.5, 1.1],
  [9.8, 9.2, 0.9],
  [12.2, -3.2, 1.05],
  [11.9, 8.6, 0.85],
  [-5.8, -9.0, 0.95],
  [1.2, -9.4, 0.85],
];

function Trees() {
  return (
    <group>
      {TREES.map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} scale={s}>
          <mesh position={[0, 0.62, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.14, 1.24, 6]} />
            <meshStandardMaterial color={C.trunk} roughness={0.95} />
          </mesh>
          <mesh position={[0, 1.72, 0]} castShadow>
            <icosahedronGeometry args={[0.95, 1]} />
            <meshStandardMaterial color={C.leaf} roughness={0.95} flatShading />
          </mesh>
          <mesh position={[0.32, 1.32, 0.26]} castShadow>
            <icosahedronGeometry args={[0.62, 1]} />
            <meshStandardMaterial color={C.leafAlt} roughness={0.95} flatShading />
          </mesh>
          <mesh position={[-0.3, 1.5, -0.2]} castShadow>
            <icosahedronGeometry args={[0.5, 1]} />
            <meshStandardMaterial color={C.leaf} roughness={0.95} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Bushes() {
  const spots = [
    [-6.8, 5.6, 0.42],
    [-4.2, 5.7, 0.36],
    [4.6, 5.5, 0.4],
    [6.4, 5.8, 0.34],
    [-8.4, -2.6, 0.38],
    [9.2, -6.4, 0.36],
  ];
  return (
    <group>
      {spots.map(([x, z, r], i) => (
        <mesh key={i} position={[x, r * 0.8, z]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={i % 2 ? C.leafAlt : C.leaf} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

const CARS = [
  { x: -11.4, z: 4.6, rot: 0, body: "#e9edf2" },
  { x: -11.4, z: 8.0, rot: 0, body: "#3f4750" },
  { x: -13.4, z: -1.4, rot: Math.PI / 2, body: "#8d98a3" },
];

function Cars() {
  return (
    <group>
      {CARS.map((car, i) => (
        <group key={i} position={[car.x, 0, car.z]} rotation={[0, car.rot, 0]}>
          <mesh position={[0, 0.34, 0]} castShadow>
            <boxGeometry args={[0.82, 0.36, 1.78]} />
            <meshStandardMaterial color={car.body} roughness={0.32} metalness={0.35} envMapIntensity={0.9} />
          </mesh>
          <mesh position={[0, 0.64, -0.08]} castShadow>
            <boxGeometry args={[0.74, 0.32, 0.94]} />
            <meshStandardMaterial color="#2b333c" roughness={0.18} metalness={0.45} envMapIntensity={1} />
          </mesh>
          {[
            [-0.36, 0.55],
            [0.36, 0.55],
            [-0.36, -0.55],
            [0.36, -0.55],
          ].map(([wx, wz], k) => (
            <mesh key={k} position={[wx, 0.18, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.17, 0.17, 0.12, 12]} />
              <meshStandardMaterial color="#1e242b" roughness={0.85} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Playground() {
  return (
    <group position={[2.2, 0, 4.4]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <circleGeometry args={[2.2, 28]} />
        <meshStandardMaterial color="#d8c9a6" roughness={1} />
      </mesh>
      <mesh position={[0.15, 0.28, 0]} castShadow>
        <boxGeometry args={[2.3, 0.46, 1.4]} />
        <meshStandardMaterial color="#cf6f35" roughness={0.8} />
      </mesh>
      <mesh position={[-0.95, 0.72, 0.1]} castShadow>
        <boxGeometry args={[0.5, 0.86, 0.5]} />
        <meshStandardMaterial color="#c06a37" roughness={0.8} />
      </mesh>
      {/* горка */}
      <mesh position={[0.85, 0.5, 0.62]} rotation={[0.42, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.08, 1.1]} />
        <meshStandardMaterial color="#c9d3dc" roughness={0.4} metalness={0.3} />
      </mesh>
    </group>
  );
}

function Lamps() {
  return (
    <group>
      {[
        [-6.2, 8.2],
        [5.6, 8.2],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.06, 3.2, 8]} />
            <meshStandardMaterial color={C.metal} roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[0, 3.24, 0]} castShadow>
            <boxGeometry args={[0.36, 0.1, 0.22]} />
            <meshStandardMaterial color="#d8dee5" roughness={0.5} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ——— камера и вращение ——— */
function CameraRig({ target }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useLayoutEffect(() => {
    if (!size.width || !size.height) return;
    const aspect = size.width / size.height;
    const dist = 29 * Math.max(1, 1.45 / aspect);
    camera.position.set(dist * 0.62, dist * 0.46, dist * 0.78);
    camera.lookAt(target[0], target[1], target[2]);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, target]);

  return null;
}

function Orbit({ children, interactive, reduced }) {
  const group = useRef(null);
  const state = useRef({ target: 0, current: 0, dragging: false, lastX: 0 });
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    const down = (e) => {
      state.current.dragging = true;
      state.current.lastX = e.clientX;
      el.style.cursor = "grabbing";
    };
    const move = (e) => {
      if (!state.current.dragging) return;
      const dx = e.clientX - state.current.lastX;
      state.current.lastX = e.clientX;
      state.current.target = THREE.MathUtils.clamp(state.current.target + dx * 0.006, -0.65, 0.65);
    };
    const up = () => {
      state.current.dragging = false;
      el.style.cursor = "grab";
    };
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.style.cursor = "";
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl, interactive]);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const idle = reduced || state.current.dragging ? 0 : Math.sin(clock.getElapsedTime() * 0.09) * 0.09;
    state.current.current = THREE.MathUtils.damp(state.current.current, state.current.target + idle, 4, delta);
    group.current.rotation.y = state.current.current;
  });

  return <group ref={group}>{children}</group>;
}

/* ——— окружение (IBL) ——— */
function SkyEnv() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  useLayoutEffect(() => {
    const source = makeEnvTexture();
    if (!source) return undefined;
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromEquirectangular(source).texture;
    scene.environment = env;
    source.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [scene, gl]);

  return null;
}

const instances = buildInstances();

function Scene({ interactive, reduced }) {
  const glassTexture = useMemo(() => makeGlassTexture(), []);
  const pavingTexture = useMemo(() => makePavingTexture(), []);

  return (
    <>
      <SkyEnv />
      <hemisphereLight args={["#eaf2fb", "#9aa892", 0.18]} />
      <ambientLight intensity={0.05} />
      <directionalLight
        position={[-20, 20, 16]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={100}
        shadow-bias={-0.0002}
      />

      <Orbit interactive={interactive} reduced={reduced}>
        <Ground pavingTexture={pavingTexture} />
        {BUILDINGS.map((b) => (
          <BuildingBlock key={b.id} b={b} />
        ))}

        <Instances data={instances.frames} material={<meshStandardMaterial color={C.frame} roughness={0.9} />} />
        <Instances
          data={instances.windows}
          material={
            <meshStandardMaterial map={glassTexture} color="#ffffff" roughness={0.16} metalness={0.3} envMapIntensity={0.7} />
          }
        />
        <Instances data={instances.mullions} material={<meshStandardMaterial color={C.frame} roughness={0.85} />} />
        <Instances data={instances.sills} castShadow material={<meshStandardMaterial color={C.sill} roughness={0.9} />} />
        <Instances data={instances.slabs} castShadow material={<meshStandardMaterial color={C.frame} roughness={0.9} />} />
        <Instances
          data={instances.panels}
          renderOrder={2}
          material={
            <meshPhysicalMaterial
              color={C.balconyGlass}
              transparent
              opacity={0.42}
              roughness={0.08}
              metalness={0}
              depthWrite={false}
              envMapIntensity={0.75}
            />
          }
        />
        <Instances
          data={instances.balusters}
          material={<meshStandardMaterial color="#7d8794" roughness={0.4} metalness={0.5} envMapIntensity={0.6} />}
        />
        <Instances
          data={instances.rails}
          material={<meshStandardMaterial color="#8a949f" roughness={0.35} metalness={0.55} envMapIntensity={0.7} />}
        />

        <Trees />
        <Bushes />
        <Cars />
        <Playground />
        <Lamps />
      </Orbit>
    </>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

export default function HeroScene({ className = "", interactive = true }) {
  const reduced = usePrefersReducedMotion();

  return (
    <div className={["absolute inset-0", className].filter(Boolean).join(" ")} aria-hidden="true">
      <Canvas
        shadows
        flat
        dpr={[1, 1.6]}
        frameloop={reduced ? "demand" : "always"}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 32, near: 0.5, far: 200, position: [26, 20, 32] }}
        style={{ width: "100%", height: "100%", background: "transparent" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping;
        }}
      >
        <CameraRig target={[0.4, 4.2, 0.6]} />
        <Scene interactive={interactive && !reduced} reduced={reduced} />
      </Canvas>
    </div>
  );
}

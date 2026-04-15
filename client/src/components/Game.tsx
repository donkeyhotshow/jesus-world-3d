import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS (from GDD and jesus_ultimate.html)
// ═══════════════════════════════════════════════════════════════
const GROUND_SIZE = 200;
const CAM_DIST = 8;
const PHYSICS_DT = 1 / 60;
const DEAD_SEC = 5;
const MAX_RESURRECTS = 3;
const MANA_MAX = 5.0;
const MANA_REGEN = 0.35;
const FLY_HEIGHT = 6.0;

const ABILITY_MAX = [0.35, 0.5, 5, 7, 15, 8, 25, 0]; // smite, fish, wine, parry, flood, bread, grace, fly
const ABILITY_ICONS = ['⚡', '🐟', '🍷', '✋', '🌊', '🍞', '☀', '✞'];
const ABILITY_COLORS = ['#ffee44', '#4499cc', '#8b0000', '#ffcc44', '#2266aa', '#d4a55a', '#ffffff', '#88ddff'];

const BIBLE_CRITS = [
  '"Аз есмь" — Ин.8:58',
  '"Силён Бог" — 2Кор.9:8',
  '"Господь — свет мой" — Пс.26:1',
  '"Нет страха в любви" — 1Ин.4:18',
  '"Победитель" — Откр.3:21',
  '"Претерпевший спасётся" — Мф.24:13',
];

const WAVE_VERSES = [
  '"Господь — твердыня моя" — Пс.17:3',
  '"Не бойся, Я с тобой" — Ис.41:10',
  '"Грядёт Судия" — Пс.95:13',
  '"Блаженны кроткие" — Мф.5:5',
  '"Легион — имя мне!" — Мк.5:9',
  '"Велика сила Его" — Иов.9:4',
  '"Ищите и найдёте" — Мф.7:7',
  '"Пришёл час" — Ин.12:23',
  '"Буря стихнет" — Мф.8:26',
  '"Се, грядёт с облаками" — Откр.1:7',
];

// Enemy Types (from GDD)
const ENEMY_TYPES: Record<string, {
  name: string;
  hp: number;
  spd: number;
  dmg: number;
  rw: number;
  body: number;
  dark: number;
  sz: number;
  wings: boolean;
  fire: boolean;
  boss: boolean;
  legion: boolean;
}> = {
  s: { name: 'Грешник', hp: 3, spd: 2.4, dmg: 12, rw: 10, body: 0xc0392b, dark: 0x4a0000, sz: 1.0, wings: false, fire: false, boss: false, legion: false },
  d: { name: 'Демон', hp: 5, spd: 1.7, dmg: 18, rw: 25, body: 0x6c1a8a, dark: 0x2a0035, sz: 1.15, wings: true, fire: false, boss: false, legion: false },
  f: { name: 'Огненный', hp: 4, spd: 2.9, dmg: 16, rw: 18, body: 0xcc4400, dark: 0x661100, sz: 0.95, wings: false, fire: true, boss: false, legion: false },
  a: { name: 'Архидемон', hp: 14, spd: 1.2, dmg: 28, rw: 60, body: 0x1a0000, dark: 0x8b0000, sz: 1.6, wings: true, fire: false, boss: true, legion: false },
  l: { name: 'Легион', hp: 9, spd: 1.5, dmg: 20, rw: 40, body: 0x2a4a2a, dark: 0x001a00, sz: 1.3, wings: false, fire: false, boss: false, legion: true },
  z: { name: 'САТАНА', hp: 80, spd: 0.9, dmg: 35, rw: 600, body: 0x110000, dark: 0xff0000, sz: 2.4, wings: true, fire: true, boss: true, legion: false },
};

// ═══════════════════════════════════════════════════════════════════
//  AUDIO SYSTEM (from jesus_ultimate.html)
// ═══════════════════════════════════════════════════════════════════
const Audio = {
  ctx: null as AudioContext | null,
  
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
  },
  
  tone(freq: number, type: OscillatorType, dur: number, gain = 0.15, start = 0) {
    if (!this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain, this.ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + start + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(this.ctx.currentTime + start);
      o.stop(this.ctx.currentTime + start + dur + 0.01);
    } catch (e) { /* quiet */ }
  },
  
  noise(dur: number, gain = 0.12) {
    if (!this.ctx) return;
    try {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / d.length);
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      src.buffer = buf;
      g.gain.value = gain;
      src.connect(g);
      g.connect(this.ctx.destination);
      src.start();
    } catch (e) { /* quiet */ }
  },
  
  smite() { this.tone(880, 'sawtooth', 0.2, 0.18); this.tone(440, 'sine', 0.12, 0.08, 0.05); },
  fish() { this.tone(440, 'sine', 0.06, 0.1); this.tone(660, 'sine', 0.06, 0.08, 0.05); this.tone(330, 'sine', 0.1, 0.06, 0.1); },
  wine() { [400, 500, 640].forEach((f, i) => this.tone(f, 'sine', 0.15, 0.08, i * 0.06)); },
  flood() { this.noise(0.5, 0.14); },
  resurrect() { [261, 329, 392, 523].forEach((f, i) => this.tone(f, 'triangle', 0.35, 0.14, i * 0.12)); },
  crit() { this.tone(1200, 'triangle', 0.18, 0.2); },
  bread() { this.tone(523, 'sine', 0.2, 0.1); this.tone(659, 'sine', 0.2, 0.1, 0.1); },
  grace() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 'sine', 0.5, 0.12, i * 0.1)); },
  fly() { this.tone(440, 'sine', 0.3, 0.08); this.tone(550, 'sine', 0.3, 0.06, 0.05); },
  parry() { this.tone(880, 'square', 0.08, 0.22); this.tone(1100, 'square', 0.08, 0.18, 0.03); },
  hit() { this.tone(200, 'square', 0.1, 0.12); },
  ring() { this.tone(880, 'sine', 0.25, 0.1); this.tone(1100, 'sine', 0.2, 0.08, 0.06); },
};

// ═══════════════════════════════════════════════════════════════════
//  GAME STATE INTERFACES
// ═══════════════════════════════════════════════════════════════════
interface Player {
  mesh: THREE.Group | null;
  x: number;
  z: number;
  y: number;
  velY: number;
  hp: number;
  maxHp: number;
  mana: number;
  iframes: number;
  dead: boolean;
  livesLeft: number;
  cds: number[];
  cheekOn: boolean;
  cheekT: number;
  parryActive: boolean;
  parryT: number;
  shieldOn: boolean;
  shieldT: number;
  flying: boolean;
  yaw: number;
  walkPhase: number;
  onGround: boolean;
}

interface Enemy {
  mesh: THREE.Group;
  type: string;
  hp: number;
  maxHp: number;
  speed: number;
  iframes: number;
  drunk: number;
  drunkExplode: boolean;
  wrath: number;
  stepCd: number;
  wingPhase: number;
  ally: boolean;
  allyTimer: number;
  legionSplit: boolean;
}

interface Projectile {
  mesh: THREE.Group;
  dir: { x: number; z: number };
  speed: number;
  type: string;
  life: number;
  maxLife: number;
  crit: boolean;
  bibleQuote: string;
  homing: boolean;
}

interface Pickup {
  mesh: THREE.Mesh;
  hp: number;
  life: number;
  maxLife: number;
}

type CelestialRing = THREE.Mesh & {
  rotSpeed: { x: number; y: number; z: number };
  bobPhase: number;
  baseY: number;
};

// ═══════════════════════════════════════════════════════════════════
//  MAIN GAME COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startGameRef = useRef<(() => void) | null>(null);
  const resumeGameRef = useRef<(() => void) | null>(null);
  const showMenuRef = useRef<(() => void) | null>(null);
  const skipDeadWaitRef = useRef<(() => void) | null>(null);

  // Game state
  const [gameStatus, setGameStatus] = useState<'menu' | 'playing' | 'paused' | 'dead' | 'gameover'>('menu');
  const [hp, setHp] = useState(100);
  const [mana, setMana] = useState(MANA_MAX);
  const [livesLeft, setLivesLeft] = useState(MAX_RESURRECTS);
  const [wave, setWave] = useState(1);
  const [kills, setKills] = useState(0);
  const [score, setScore] = useState(0);
  const [hiScore, setHiScore] = useState(0);
  const [cooldowns, setCooldowns] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const [combo, setCombo] = useState(0);
  const [deadTimer, setDeadTimer] = useState(0);
  const [resurrectCount, setResurrectCount] = useState(0);
  const [engineReady, setEngineReady] = useState(false);

  // Refs for game loop (mutable state)
  const gameRef = useRef({
    status: 'menu' as 'menu' | 'playing' | 'paused' | 'dead' | 'gameover',
    gtime: 0,
    wave: 1,
    kills: 0,
    score: 0,
    waveTimer: 0,
    deadTimer: 0,
    waterOn: false,
    waterTimer: 0,
    camYaw: 0,
    camPitch: -0.22,
    hiScore: 0,
    resurrectCount: 0,
    comboKills: 0,
    comboTimer: 0,
  });

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Load hi score
    const saved = localStorage.getItem('jw_hi');
    if (saved) {
      gameRef.current.hiScore = parseInt(saved);
      setHiScore(parseInt(saved));
    }

      const canvas = canvasRef.current!;
      const container = containerRef.current!;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.BasicShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      // Scene
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(68, container.clientWidth / container.clientHeight, 0.1, 500);
      scene.fog = new THREE.FogExp2(0x8fbbe0, 0.011);

      // ═══════════════════════════════════════════════════════════════
      //  SKY & LIGHTING
      // ═══════════════════════════════════════════════════════════
      const skyMat = new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color(0x3a7bd5) },
          bottomColor: { value: new THREE.Color(0x8fbbe0) },
          offset: { value: 30 },
          exponent: { value: 0.5 },
        },
        vertexShader: `varying vec3 vW;void main(){vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform vec3 topColor,bottomColor;uniform float offset,exponent;varying vec3 vW;void main(){float h=normalize(vW+vec3(0,offset,0)).y;gl_FragColor=vec4(mix(bottomColor,topColor,max(pow(max(h,0.),exponent),0.)),1.);}`,
        side: THREE.BackSide,
      });
      const skyGeo = new THREE.SphereGeometry(400, 24, 12);
      skyGeo.scale(-1, 1, 1);
      scene.add(new THREE.Mesh(skyGeo, skyMat));

      const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfffae0 }));
      sunMesh.position.set(120, 160, -200);
      scene.add(sunMesh);

      // Clouds
      const clouds: THREE.Group[] = [];
      const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
      function makeCloud(x: number, y: number, z: number) {
        const g = new THREE.Group();
        [[0, 0, 0, 1.8], [1.5, 0.4, 0, 1.3], [-1.5, 0.3, 0, 1.2]].forEach(([px, py, pz, r]) => {
          const m = new THREE.Mesh(new THREE.SphereGeometry(r, 5, 3), cloudMat);
          m.position.set(px as number, py as number, pz as number);
          g.add(m);
        });
        g.position.set(x, y, z);
        g.userData.drift = Math.random() * 0.4 + 0.1;
        return g;
      }
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 60 + Math.random() * 110;
        const c = makeCloud(Math.cos(a) * d, 28 + Math.random() * 18, Math.sin(a) * d);
        scene.add(c);
        clouds.push(c);
      }

      // Lighting
      scene.add(new THREE.AmbientLight(0xb0c8e8, 0.7));
      const sunLight = new THREE.DirectionalLight(0xfff8e0, 1.6);
      sunLight.position.set(80, 120, -140);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(512, 512);
      sunLight.shadow.camera.near = 1;
      sunLight.shadow.camera.far = 50;
      sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -60;
      sunLight.shadow.camera.right = sunLight.shadow.camera.top = 60;
      sunLight.shadow.bias = -0.001;
      scene.add(sunLight);
      scene.add(new THREE.HemisphereLight(0x88bbff, 0x227722, 0.4));

      // ═══════════════════════════════════════════════════════
      //  GROUND & WATER
      // ═══════════════════════════════════════════════════════
      const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 28, 28);
      groundGeo.rotateX(-Math.PI / 2);
      const posArr = groundGeo.attributes.position.array;
      const colBuf: number[] = [];
      for (let i = 0; i < groundGeo.attributes.position.count; i++) {
        const px = posArr[i * 3];
        const pz = posArr[i * 3 + 2];
        const n = (Math.sin(px * 0.3) * Math.cos(pz * 0.28) + Math.sin(px * 0.11 + pz * 0.17)) * 0.5 + 0.5;
        posArr[i * 3 + 1] = (Math.sin(px * 0.4) * Math.cos(pz * 0.35) + Math.sin(px * 0.13 + pz * 0.19) * 0.5) * 0.22;
        colBuf.push(0.12 + n * 0.06, 0.28 + n * 0.15, 0.08 + n * 0.04);
      }
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colBuf, 3));
      groundGeo.computeVertexNormals();
      const groundMesh = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      groundMesh.receiveShadow = true;
      scene.add(groundMesh);

      const waterGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
      waterGeo.rotateX(-Math.PI / 2);
      const waterMat = new THREE.MeshLambertMaterial({ color: 0x2266aa, transparent: true, opacity: 0.75 });
      const waterMesh = new THREE.Mesh(waterGeo, waterMat);
      waterMesh.position.y = 0.05;
      waterMesh.visible = false;
      scene.add(waterMesh);

      // ═══════════════════════════════════════════════════════
      //  TREES & ROCKS & CROSSES
      // ═══════════════════════════════════════════════════════
      const treeMats = {
        trunk: new THREE.MeshLambertMaterial({ color: 0x5c3a1e }),
        leaf: new THREE.MeshLambertMaterial({ color: 0x2a5a1a }),
        pine: new THREE.MeshLambertMaterial({ color: 0x1f4a14 }),
      };

      function addTree(x: number, z: number, s = 1, pine = false) {
        const g = new THREE.Group();
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 2 * s, 7), treeMats.trunk);
        tr.position.y = s;
        tr.castShadow = true;
        g.add(tr);
        if (pine) {
          const co = new THREE.Mesh(new THREE.ConeGeometry(1.6 * s, 3 * s, 7), treeMats.pine);
          co.position.y = 3.5 * s;
          co.castShadow = true;
          g.add(co);
        } else {
          const ca = new THREE.Mesh(new THREE.SphereGeometry((1.6 + Math.random() * 0.5) * s, 7, 6), treeMats.leaf);
          ca.position.y = 3 * s;
          ca.castShadow = true;
          g.add(ca);
        }
        g.position.set(x, 0, z);
        scene.add(g);
      }
      for (let i = 0; i < 36; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 14 + Math.random() * 72;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const s = 0.7 + Math.random() * 0.7;
        addTree(x, z, s, Math.random() < 0.45);
      }

      const rockMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
      const rockGeo = new THREE.DodecahedronGeometry(0.4, 0);
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 8 + Math.random() * 80;
        const r = new THREE.Mesh(rockGeo, rockMat);
        r.position.set(Math.cos(a) * d, 0.2, Math.sin(a) * d);
        r.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
        r.castShadow = true;
        scene.add(r);
      }

      // ═══════════════════════════════════════════════════════
      //  PLAYER (JESUS) MODEL
      // ═══════════════════════════════════════════════════════
      function makeJesus() {
        const g = new THREE.Group();
        const robeMat = new THREE.MeshLambertMaterial({ color: 0xf0ead8 });
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xede0c4 });
        const hairMat = new THREE.MeshLambertMaterial({ color: 0x6b3f10 });
        const skinMat = new THREE.MeshLambertMaterial({ color: 0xf5e4c8 });

        const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.3, 10), robeMat);
        robe.position.y = 0.65;
        robe.castShadow = true;
        g.add(robe);

        const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.09, 10), new THREE.MeshLambertMaterial({ color: 0xc8a84b }));
        belt.position.y = 0.75;
        g.add(belt);

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.45, 8), bodyMat);
        body.position.y = 1.28;
        g.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 11, 9), skinMat);
        head.position.y = 1.63;
        head.castShadow = true;
        g.add(head);

        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.235, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
        hair.position.y = 1.70;
        g.add(hair);

        [-1, 1].forEach(s => {
          const lh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.028, 0.38, 6), hairMat);
          lh.position.set(s as number * 0.19, 1.46, 0);
          lh.rotation.z = (s as number) * 0.18;
          g.add(lh);
        });

        const beard = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.38), hairMat);
        beard.position.set(0, 1.52, 0.1);
        g.add(beard);

        [-1, 1].forEach(s => {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 5), new THREE.MeshBasicMaterial({ color: 0x2a1500 }));
          eye.position.set(s as number * 0.09, 1.66, 0.19);
          g.add(eye);
        });

        const armGroup = new THREE.Group();
        armGroup.name = 'armGroup';
        [-1, 1].forEach(s => {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.65, 6), bodyMat);
          arm.rotation.z = s as number * (Math.PI / 4 + 0.12);
          arm.position.set(s as number * 0.52, 1.18, 0);
          arm.castShadow = true;
          arm.name = `arm${s}`;
          armGroup.add(arm);
          const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 5), skinMat);
          hand.position.set(s as number * 0.82, 0.9, 0);
          armGroup.add(hand);
        });
        g.add(armGroup);

        const legGroup = new THREE.Group();
        legGroup.name = 'legGroup';
        [-1, 1].forEach(s => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.6, 6), new THREE.MeshLambertMaterial({ color: 0xd4c4a0 }));
          leg.position.set(s as number * 0.12, 0.02, 0);
          leg.castShadow = true;
          leg.name = `leg${s}`;
          legGroup.add(leg);
        });
        g.add(legGroup);

        // Wing cross (shown in flight)
        const crossG = new THREE.Group();
        crossG.name = 'flyCross';
        const cm = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.7 });
        const cv = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), cm);
        cv.position.y = 1.1;
        crossG.add(cv);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.06), cm);
        ch.position.set(0, 1.4, 0);
        crossG.add(ch);
        crossG.visible = false;
        g.add(crossG);

        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.04, 8, 26), new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1.1 }));
        halo.position.y = 1.95;
        halo.name = 'halo';
        g.add(halo);

        const hl = new THREE.PointLight(0xffd700, 1.0, 5);
        hl.position.y = 1.95;
        hl.name = 'haloLight';
        g.add(hl);

        // Shield
        const sh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshLambertMaterial({ color: 0x88bbff, transparent: true, opacity: 0, side: THREE.DoubleSide }));
        sh.name = 'shield';
        g.add(sh);

        g.traverse((m: THREE.Object3D) => {
          if (m instanceof THREE.Mesh) m.castShadow = true;
        });
        return g;
      }

      // ═══════════════════════════════════════════════════════════════
      //  ENEMY MODEL
      // ═══════════════════════════════════════════════════════════════
      function makeEnemyMesh(type: string) {
        const T = ENEMY_TYPES[type];
        const sz = T.sz;
        const g = new THREE.Group();
        const bm = new THREE.MeshLambertMaterial({ color: T.body });
        const dm = new THREE.MeshLambertMaterial({ color: T.dark });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * sz, 0.34 * sz, 0.95 * sz, 8), bm);
        body.position.y = 0.47 * sz;
        body.castShadow = true;
        g.add(body);

        const hr = 0.26 * sz * (T.boss ? 1.25 : 1);
        const headY = (0.47 + 0.95 / 2 + hr) * sz;
        const head = new THREE.Mesh(new THREE.SphereGeometry(hr, 9, 7), bm);
        head.position.y = headY;
        head.castShadow = true;
        g.add(head);

        g.userData.headY = headY;
        g.userData.sz = sz;

        [-1, 1].forEach(s => {
          const ec = type === 'f' || type === 'z' ? 0xff6600 : type === 'd' || type === 'a' ? 0xcc00ff : type === 'l' ? 0x00ff88 : 0xff2200;
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055 * sz, 5, 5), new THREE.MeshBasicMaterial({ color: ec }));
          eye.position.set(s as number * hr * 0.58, headY + 0.02, hr * 0.85);
          g.add(eye);
        });

        if (type === 's' || type === 'd' || type === 'l') {
          [-1, 1].forEach(s => {
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06 * sz, 0.28 * sz, 5), dm);
            horn.position.set(s as number * hr * 0.65, headY + hr * 0.72, 0);
            horn.rotation.z = (s as number) * 0.3;
            g.add(horn);
          });
        }

        if (type === 'a') {
          for (let i = 0; i < 7; i++) {
            const a = i / 6 * Math.PI;
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07 * sz, (0.22 + Math.sin(a) * 0.14) * sz, 5), dm);
            horn.position.set(Math.cos(a) * hr * 0.9 - hr * 0.45, headY + hr * 0.75, Math.sin(a) * hr * 0.3);
            g.add(horn);
          }
        }

        if (type === 'z') {
          for (let i = 0; i < 12; i++) {
            const a = i / 12 * Math.PI * 2;
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09 * sz, 0.5 * sz, 4), new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 0.9 }));
            horn.position.set(Math.cos(a) * hr * 0.9, headY + hr * 0.85, Math.sin(a) * hr * 0.9);
            horn.rotation.z = Math.cos(a) * 0.6;
            g.add(horn);
          }
        }

        if (type === 'l') {
          for (let i = 0; i < 3; i++) {
            const a = i / 3 * Math.PI * 2 + Math.PI;
            const sh = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.5, 6, 5), bm);
            sh.position.set(Math.cos(a) * hr * 0.9, headY + hr * 0.5, Math.sin(a) * hr * 0.6);
            g.add(sh);
          }
        }

        [-1, 1].forEach(s => {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.065 * sz, 0.065 * sz, 0.65 * sz, 6), bm);
          arm.rotation.z = s as number * (Math.PI / 4 + 0.15);
          arm.position.set(s as number * 0.5 * sz, 0.72 * sz, 0);
          g.add(arm);
          if (type === 'f' || type === 'z') {
            const fb = new THREE.Mesh(new THREE.SphereGeometry(0.11 * sz, 5, 5), new THREE.MeshLambertMaterial({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 1.3 }));
            fb.position.set(s as number * 0.77 * sz, 0.47 * sz, 0);
            g.add(fb);
          }
        });

        [-1, 1].forEach(s => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * sz, 0.08 * sz, 0.55 * sz, 6), dm);
          leg.position.set(s as number * 0.15 * sz, 0.06 * sz, 0);
          leg.castShadow = true;
          g.add(leg);
        });

        if (type !== 'a' && type !== 'z') {
          const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * sz, 0.01 * sz, 0.55 * sz, 5), dm);
          tail.position.set(0.38 * sz, 0.52 * sz, 0);
          tail.rotation.z = -Math.PI / 3;
          g.add(tail);
        }

        if (T.wings) {
          [-1, 1].forEach(s => {
            const wing = new THREE.Mesh(new THREE.ConeGeometry(0.62 * sz, 1.15 * sz, 4, 1, true), new THREE.MeshLambertMaterial({ color: type === 'z' ? 0x550000 : type === 'a' ? 0x330000 : 0x220033, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }));
            wing.rotation.z = s as number * (Math.PI / 2 + 0.38);
            wing.rotation.y = s as number * 0.28;
            wing.position.set(s as number * 0.38 * sz, 0.88 * sz, -0.1);
            wing.name = 'wing';
            g.add(wing);
          });
        }

        if (T.fire) {
          const fl = new THREE.PointLight(0xff4400, type === 'z' ? 2.5 : 1.0, type === 'z' ? 10 : 5);
          fl.position.y = 0.7 * sz;
          fl.name = 'fireLight';
          g.add(fl);
        }

        if (T.boss) {
          const al = new THREE.PointLight(type === 'z' ? 0xff0000 : 0x880000, type === 'z' ? 2.0 : 1.3, type === 'z' ? 10 : 7);
          al.position.y = 1.2 * sz;
          al.name = 'bossLight';
          g.add(al);
        }

        // HP bars
        const bbg = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * sz, 0.08 * sz), new THREE.MeshBasicMaterial({ color: 0x220000, depthTest: false }));
        bbg.position.y = headY + hr + 0.32 * sz;
        bbg.name = 'barBg';
        g.add(bbg);

        const bfg = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * sz, 0.08 * sz), new THREE.MeshBasicMaterial({ color: 0x44ee44, depthTest: false }));
        bfg.position.copy(bbg.position);
        bfg.position.z = 0.002;
        bfg.name = 'barFg';
        g.add(bfg);

        g.traverse((m: THREE.Object3D) => {
          if (m instanceof THREE.Mesh) m.castShadow = true;
        });
        return g;
      }

      // ═══════════════════════════════════════════════════════
      //  PROJECTILE MODELS
      // ═══════════════════════════════════════════════════════
      function makeSmiteMesh() {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 7), new THREE.MeshLambertMaterial({ color: 0xffee00, emissive: 0xffcc00, emissiveIntensity: 1.8 })));
        g.add(new THREE.PointLight(0xffdd00, 2.5, 7));
        const cm = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const cv = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.04), cm);
        g.add(cv);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), cm);
        ch.position.y = 0.08;
        g.add(ch);
        return g;
      }

      function makeFishMesh() {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshLambertMaterial({ color: 0x4499cc })));
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 5), new THREE.MeshLambertMaterial({ color: 0x3377aa }));
        t.rotation.z = Math.PI / 2;
        t.position.x = -0.24;
        g.add(t);
        return g;
      }

      function makeWineMesh() {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.24, 7), new THREE.MeshLambertMaterial({ color: 0x8b0000 })));
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.1, 7), new THREE.MeshLambertMaterial({ color: 0x660000 }));
        t.position.y = 0.17;
        g.add(t);
        return g;
      }

      function makeBreadMesh() {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), new THREE.MeshLambertMaterial({ color: 0xd4a55a, emissive: 0x8b6020, emissiveIntensity: 0.3 }));
        m.scale.set(1, 0.55, 0.8);
        return m;
      }

      function makeCelestialRing(): CelestialRing {
        const m = new THREE.Mesh(
          new THREE.TorusGeometry(1.0, 0.12, 8, 32),
          new THREE.MeshLambertMaterial({ color: 0x00ffff, emissive: 0x00aaff, emissiveIntensity: 0.7 }),
        ) as unknown as CelestialRing;
        m.rotSpeed = {
          x: Math.random() * 0.8 - 0.4,
          y: Math.random() * 0.8 + 0.5,
          z: Math.random() * 0.4 - 0.2,
        };
        m.bobPhase = Math.random() * Math.PI * 2;
        m.baseY = 18 + Math.random() * 14;
        m.position.y = m.baseY;
        return m;
      }

      // ═══════════════════════════════════════════════════════
      //  FLOATING TEXT & PARTICLES & RINGS (POOLS)
      // ═══════════════════════════════════════════════════════
      const floatTexts: { mesh: THREE.Sprite; life: number; startY: number }[] = [];
      const particles: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
      const rings: CelestialRing[] = [];

      function spawnFloatText(x: number, y: number, z: number, text: string, color: string) {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 72;
        const ctx = canvas.getContext('2d')!;
        ctx.font = 'bold 32px Georgia';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(text, 80, 50);

        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(1.6, 0.72, 1);
        sprite.position.set(x, y + 1.5, z);
        scene.add(sprite);

        floatTexts.push({ mesh: sprite, life: 0, startY: y + 1.5 });
      }

      const burstGeo = new THREE.SphereGeometry(0.07, 4, 3);
      function spawnParticles(x: number, y: number, z: number, color: number, count = 6) {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
        for (let i = 0; i < count; i++) {
          const m = new THREE.Mesh(burstGeo, mat.clone());
          m.position.set(x, y, z);
          const v = new THREE.Vector3((Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5);
          scene.add(m);
          particles.push({ mesh: m, v, life: 0 });
        }
      }

      function spawnRing(x: number, y: number, z: number) {
        const r = makeCelestialRing();
        r.position.set(x, y, z);
        scene.add(r);
        rings.push(r);
      }

      // ═══════════════════════════════════════════════════════
      //  INPUT HANDLING
      // ═══════════════════════════════════════════════════════
      const keys: Set<string> = new Set();
      const clicks: number[] = [];
      const MOUSE_SENS_DEFAULT = 0.0024;
      const MAX_POINTER_DELTA = 95;
      let mouseSens = MOUSE_SENS_DEFAULT;
      try {
        const raw = localStorage.getItem('jw_mouse_sens');
        if (raw) {
          const v = parseFloat(raw);
          if (v > 0.0005 && v < 0.015) mouseSens = v;
        }
      } catch {
        /* ignore */
      }
      let dx = 0;
      let dy = 0;
      let locked = false;

      const clearHeldInput = () => {
        keys.clear();
        dx = 0;
        dy = 0;
        clicks.length = 0;
      };
      const onVisibility = () => {
        if (document.visibilityState !== 'visible') clearHeldInput();
      };
      const onWinBlur = () => clearHeldInput();

      const handleKeyDown = (e: KeyboardEvent) => {
        keys.add(e.code);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      };
      const handleKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
      const handleMouseMove = (e: MouseEvent) => {
        if (!locked) return;
        dx += e.movementX;
        dy += e.movementY;
      };
      const handleMouseDown = (e: MouseEvent) => clicks.push(e.button);
      const handleContextMenu = (e: MouseEvent) => e.preventDefault();

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('blur', onWinBlur);
      document.addEventListener('visibilitychange', onVisibility);
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('contextmenu', handleContextMenu);

      const handlePointerLockClick = () => {
        if (gameRef.current.status === 'playing') canvas.requestPointerLock();
      };
      canvas.addEventListener('click', handlePointerLockClick);

      const handlePointerLockChange = () => {
        locked = !!document.pointerLockElement;
      };
      document.addEventListener('pointerlockchange', handlePointerLockChange);

      // ═══════════════════════════════════════════════════════
      //  GAME ENTITIES
      // ═══════════════════════════════════════════════════════
      let player = {
        mesh: null as THREE.Group | null,
        x: 0,
        z: 0,
        y: 0,
        velY: 0,
        hp: 100,
        maxHp: 100,
        mana: MANA_MAX,
        iframes: 0,
        dead: false,
        livesLeft: MAX_RESURRECTS,
        cds: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
        cheekOn: false,
        cheekT: 0,
        parryActive: false,
        parryT: 0,
        shieldOn: false,
        shieldT: 0,
        flying: false,
        yaw: 0,
        walkPhase: 0,
        onGround: true,
      };

      const enemies: Enemy[] = [];
      const projectiles: Projectile[] = [];
      const pickups: Pickup[] = [];

      const camPos = new THREE.Vector3(0, 8, 10);

      // ═══════════════════════════════════════════════════════
      //  ABILITIES
      // ═══════════════════════════════════════════════════════
      function activateFlood() {
        if (player.cds[4] > 0) return;
        gameRef.current.waterOn = true;
        gameRef.current.waterTimer = 9;
        player.cds[4] = 15;
        waterMesh.visible = true;
        skyMat.uniforms.topColor.value.set(0x1a3a6a);
        skyMat.uniforms.bottomColor.value.set(0x2255aa);
        scene.fog!.color.set(0x2255aa);
        enemies.forEach(e => e.speed *= 0.4);
        Audio.flood();
      }

      function deactivateFlood() {
        gameRef.current.waterOn = false;
        waterMesh.visible = false;
        skyMat.uniforms.topColor.value.set(0x3a7bd5);
        skyMat.uniforms.bottomColor.value.set(0x8fbbe0);
        scene.fog!.color.set(0x8fbbe0);
        enemies.forEach(e => {
          e.speed = ENEMY_TYPES[e.type].spd * (1 + gameRef.current.wave * 0.035);
        });
      }

      function activateParry() {
        if (player.cds[3] > 0) return;
        player.parryActive = true;
        player.parryT = 0.5;
        player.cds[3] = 7;
        player.cheekOn = true;
        player.cheekT = 4;
        Audio.parry();

        // Try convert one enemy
        enemies.forEach(e => {
          const dx = player.x - (e.mesh as THREE.Group).position.x;
          const dz = player.z - (e.mesh as THREE.Group).position.z;
          if (Math.sqrt(dx * dx + dz * dz) >= 8 || e.ally || ENEMY_TYPES[e.type].boss) return;
          if (Math.random() < 0.2) {
            e.ally = true;
            e.allyTimer = 15;
            spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y, (e.mesh as THREE.Group).position.z, '😇 ОБРАЩЁН!', '#c8a84b');
          } else {
            e.wrath = 3;
            spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y, (e.mesh as THREE.Group).position.z, '😡', '#ff4444');
          }
        });
      }

      function parryCounter() {
        const cPos = new THREE.Vector3(player.x, 1, player.z);
        enemies.forEach(e => {
          const d = (e.mesh as THREE.Group).position.distanceTo(cPos);
          if (d < 6) {
            e.hp -= 4;
            spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y + 1, (e.mesh as THREE.Group).position.z, '⚡-4', '#ffee44');
            {
              const p = (e.mesh as THREE.Group).position;
              spawnParticles(p.x, p.y, p.z, 0xffdd00, 6);
            }
          }
        });
        Audio.crit();
      }

      function activateBread() {
        if (player.cds[5] > 0 || gameRef.current.wave < 5) return;
        player.cds[5] = 8;

        // Spawn 5 bread pickups
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2 + Math.random();
          const r = 2 + Math.random() * 4;
          const m = makeBreadMesh();
          m.position.set(player.x + Math.cos(a) * r, 0.22, player.z + Math.sin(a) * r);
          scene.add(m);
          pickups.push({ mesh: m, hp: 35, life: 0, maxLife: 12 });
        }
        Audio.bread();
      }

      function activateGrace() {
        if (player.cds[6] > 0 || gameRef.current.wave < 10) return;
        player.cds[6] = 25;

        enemies.forEach(e => {
          e.hp -= Math.ceil(ENEMY_TYPES[e.type].hp * 0.6);
          {
            const p = (e.mesh as THREE.Group).position;
            spawnParticles(p.x, p.y, p.z, 0xffffff, 8);
          }
          spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y + 1, (e.mesh as THREE.Group).position.z, '☀ БЛАГОДАТЬ', '#ffffff');
        });

        player.hp = Math.min(player.maxHp, player.hp + 30);
        Audio.grace();
      }

      function startFlight() {
        if (player.mana < 0.3) return;
        player.flying = true;
        Audio.fly();
      }

      function stopFlight() {
        player.flying = false;
      }

      function chainLightning(hitPos: THREE.Vector3, hitEnemy: Enemy, dmg: number) {
        let rem = 2;
        enemies.forEach(e => {
          if (e === hitEnemy || rem === 0 || e.ally) return;
          if (hitPos.distanceTo((e.mesh as THREE.Group).position) < 8) {
            e.hp -= Math.ceil(dmg * 0.6);
            spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y + 1, (e.mesh as THREE.Group).position.z, '⚡', '#ffee44');
            {
              const p = (e.mesh as THREE.Group).position;
              spawnParticles(p.x, p.y + 0.5, p.z, 0xffdd00, 4);
            }
            rem--;
          }
        });
      }

      // ═══════════════════════════════════════════════════════
      //  WAVE SPAWNING
      // ═══════════════════════════════════════════════════════
      function pickType(w: number) {
        if (w === 20) return 'z';
        if (w % 5 === 0 && w >= 5 && Math.random() < 0.5) return 'a';
        const r = Math.random();
        if (w >= 8 && r < 0.07) return 'l';
        if (w >= 5 && r < 0.12) return 'a';
        if (w >= 3 && r < 0.28) return 'd';
        if (r < 0.35) return 'f';
        return 's';
      }

      function spawnWave() {
        const n = Math.floor(2 + gameRef.current.wave * 1.8 + gameRef.current.wave * gameRef.current.wave * 0.04);
        const boss = gameRef.current.wave % 5 === 0 && gameRef.current.wave >= 5;

        for (let i = 0; i < n; i++) {
          setTimeout(() => {
            if (gameRef.current.status === 'menu') return;
            const t = pickType(gameRef.current.wave);
            const a = Math.random() * Math.PI * 2;
            const d = 18 + Math.random() * 12;
            spawnEnemy(t, Math.cos(a) * d, Math.sin(a) * d, gameRef.current.wave);
          }, i * 360 + 180);
        }

        if (boss && gameRef.current.wave < 20) {
          setTimeout(() => {
            if (gameRef.current.status === 'menu') return;
            spawnEnemy('a', 15, 15, gameRef.current.wave);
          }, n * 360 + 600);
        }

        if (gameRef.current.wave === 20) {
          setTimeout(() => {
            if (gameRef.current.status === 'menu') return;
            spawnEnemy('z', 0, 20, gameRef.current.wave);
          }, n * 360 + 1000);
        }

        // Replenish celestial rings
        if (rings.length < 2) {
          const a = Math.random() * Math.PI * 2;
          const d = 20 + Math.random() * 50;
          spawnRing(Math.cos(a) * d, 18 + Math.random() * 14, Math.sin(a) * d);
        }
      }

      function spawnEnemy(type: string, x: number, z: number, wave: number) {
        const T = ENEMY_TYPES[type];
        const mesh = makeEnemyMesh(type);
        mesh.position.set(x, 0, z);
        scene.add(mesh);

        const ws = 1 + wave * 0.12;
        enemies.push({
          mesh,
          type,
          hp: Math.ceil(T.hp * ws),
          maxHp: Math.ceil(T.hp * ws),
          speed: T.spd * (1 + wave * 0.035),
          iframes: 0,
          drunk: 0,
          drunkExplode: false,
          wrath: 0,
          stepCd: 0,
          wingPhase: Math.random() * Math.PI * 2,
          ally: false,
          allyTimer: 0,
          legionSplit: type === 'l',
        });
      }

      function fireProjectile(type: string, x: number, y: number, z: number, yaw: number) {
        const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        let mesh;
        if (type === 'smite') mesh = makeSmiteMesh();
        else if (type === 'fish') mesh = makeFishMesh();
        else mesh = makeWineMesh();

        mesh.position.set(x + dir.x * 0.9, y, z + dir.z * 0.9);
        scene.add(mesh);

        const isCrit = Math.random() < 0.20;
        const spd = type === 'smite' ? 18 : type === 'fish' ? 13 : 9;
        const bq = isCrit ? BIBLE_CRITS[Math.floor(Math.random() * BIBLE_CRITS.length)] : '';

        projectiles.push({
          mesh,
          dir: { x: dir.x, z: dir.z },
          speed: spd,
          type,
          life: 0,
          maxLife: 4,
          crit: isCrit,
          bibleQuote: bq,
          homing: type === 'fish',
        });

        return isCrit;
      }

      // ═══════════════════════════════════════════════════════
      //  GAME INIT
      // ═══════════════════════════════════════════════════════
      function initGame() {
        if (player.mesh) scene.remove(player.mesh);
        player.mesh = makeJesus();
        player.mesh.position.set(0, 0, 0);
        scene.add(player.mesh);

        // Clear entities
        enemies.forEach(e => scene.remove(e.mesh as THREE.Group));
        enemies.length = 0;
        projectiles.forEach(p => scene.remove(p.mesh));
        projectiles.length = 0;
        pickups.forEach(p => scene.remove(p.mesh));
        pickups.length = 0;
        rings.forEach(r => scene.remove(r));
        rings.length = 0;
        floatTexts.forEach(f => {
          (f.mesh.material as THREE.SpriteMaterial).map?.dispose();
          (f.mesh.material as THREE.SpriteMaterial).dispose();
          scene.remove(f.mesh);
        });
        floatTexts.length = 0;
        particles.forEach(p => {
          (p.mesh.material as THREE.MeshBasicMaterial).dispose();
          scene.remove(p.mesh);
        });
        particles.length = 0;

        gameRef.current.wave = 1;
        gameRef.current.kills = 0;
        gameRef.current.score = 0;
        gameRef.current.waveTimer = 0;
        gameRef.current.gtime = 0;
        gameRef.current.deadTimer = 0;
        gameRef.current.resurrectCount = 0;
        gameRef.current.comboKills = 0;
        gameRef.current.comboTimer = 0;
        gameRef.current.waterOn = false;
        gameRef.current.waterTimer = 0;
        waterMesh.visible = false;
        skyMat.uniforms.topColor.value.set(0x3a7bd5);
        skyMat.uniforms.bottomColor.value.set(0x8fbbe0);
        scene.fog!.color.set(0x8fbbe0);

        player.hp = 100;
        player.mana = MANA_MAX;
        player.dead = false;
        player.iframes = 0;
        player.livesLeft = MAX_RESURRECTS;
        player.cds = [0, 0, 0, 0, 0, 0, 0, 0];
        player.cheekOn = false;
        player.cheekT = 0;
        player.parryActive = false;
        player.parryT = 0;
        player.shieldOn = false;
        player.shieldT = 0;
        player.x = 0;
        player.z = 0;
        player.y = 0;
        player.velY = 0;
        player.yaw = gameRef.current.camYaw;
        player.walkPhase = 0;
        player.flying = false;
        player.onGround = true;

        gameRef.current.camYaw = 0;
        gameRef.current.camPitch = -0.22;

        // Spawn initial celestial rings
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 20 + Math.random() * 50;
          spawnRing(Math.cos(a) * d, 18 + Math.random() * 14, Math.sin(a) * d);
        }

        spawnWave();
      }

      function startGame() {
        Audio.init();
        initGame();
        gameRef.current.status = 'playing';
        setGameStatus('playing');
        canvas.requestPointerLock();
      }

      function showMenu() {
        gameRef.current.status = 'menu';
        setGameStatus('menu');
        if (document.pointerLockElement) document.exitPointerLock();
      }

      function pauseGame() {
        if (gameRef.current.status !== 'playing') return;
        gameRef.current.status = 'paused';
        setGameStatus('paused');
        if (document.pointerLockElement) document.exitPointerLock();
      }

      function resumeGame() {
        if (gameRef.current.status !== 'paused') return;
        gameRef.current.status = 'playing';
        setGameStatus('playing');
        canvas.requestPointerLock();
      }

      startGameRef.current = startGame;
      resumeGameRef.current = resumeGame;
      showMenuRef.current = showMenu;
      skipDeadWaitRef.current = () => {
        if (gameRef.current.status !== 'dead') return;
        gameRef.current.deadTimer = 0;
      };

      // ═══════════════════════════════════════════════════════════════
      //  UPDATE PLAYER
      // ═══════════════════════════════════════════════════════════════
      function updatePlayer(dt: number) {
        const isFlying = player.flying;
        const spd = isFlying ? 8.5 : 5.8 * (gameRef.current.waterOn ? 1.3 : 1);

        let mx = 0;
        let mz = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) { mx -= Math.sin(gameRef.current.camYaw); mz -= Math.cos(gameRef.current.camYaw); }
        if (keys.has('KeyS') || keys.has('ArrowDown')) { mx += Math.sin(gameRef.current.camYaw); mz += Math.cos(gameRef.current.camYaw); }
        if (keys.has('KeyA')) { mx -= Math.cos(gameRef.current.camYaw); mz += Math.sin(gameRef.current.camYaw); }
        if (keys.has('KeyD')) { mx += Math.cos(gameRef.current.camYaw); mz -= Math.sin(gameRef.current.camYaw); }

        const ml = Math.sqrt(mx * mx + mz * mz);
        const isMoving = ml > 0.01;
        if (isMoving) { mx /= ml; mz /= ml; }

        player.x += mx * spd * dt;
        player.z += mz * spd * dt;
        const B = 88;
        player.x = Math.max(-B, Math.min(B, player.x));
        player.z = Math.max(-B, Math.min(B, player.z));

        // Vertical physics
        if (isFlying) {
          player.y += (FLY_HEIGHT - player.y) * 0.08;
          player.mana -= dt;
          const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight');
          if (player.mana <= 0 || !shiftHeld) {
            stopFlight();
            if (player.mana <= 0) player.mana = 0;
          }
        } else {
          if (player.mana < MANA_MAX) player.mana = Math.min(MANA_MAX, player.mana + MANA_REGEN * dt);
          player.velY -= 22 * dt;
          player.y += player.velY * dt;
          if (player.y <= 0) {
            player.y = 0;
            player.velY = 0;
            player.onGround = true;
          } else {
            player.onGround = false;
          }
        }

        player.mesh!.position.set(player.x, player.y, player.z);

        // Смотрит туда же, куда камера (третье лицо сзади)
        player.yaw = gameRef.current.camYaw;
        player.mesh!.rotation.y = player.yaw;

        // Walk/fly animation
        if (isMoving && !isFlying) player.walkPhase += dt * 8;

        const ag = player.mesh!.getObjectByName('armGroup') as THREE.Group;
        const lg = player.mesh!.getObjectByName('legGroup') as THREE.Group;
        if (isFlying) {
          if (ag) {
            const a1 = ag.getObjectByName('arm1') as THREE.Mesh;
            const aN = ag.getObjectByName('arm-1') as THREE.Mesh;
            if (a1) a1.rotation.z = Math.PI / 2;
            if (aN) aN.rotation.z = -Math.PI / 2;
          }
        } else if (ag && isMoving) {
          const a1 = ag.getObjectByName('arm1') as THREE.Mesh;
          const aN = ag.getObjectByName('arm-1') as THREE.Mesh;
          if (a1) a1.rotation.x = Math.sin(player.walkPhase) * 0.4;
          if (aN) aN.rotation.x = -Math.sin(player.walkPhase) * 0.4;
        }
        if (lg && isMoving && !isFlying) {
          const l1 = lg.getObjectByName('leg1') as THREE.Mesh;
          const lN = lg.getObjectByName('leg-1') as THREE.Mesh;
          if (l1) l1.rotation.x = Math.sin(player.walkPhase) * 0.35;
          if (lN) lN.rotation.x = -Math.sin(player.walkPhase) * 0.35;
        }

        const fc = player.mesh!.getObjectByName('flyCross') as THREE.Group;
        if (fc) fc.visible = isFlying;

        // Halo animation
        const halo = player.mesh!.getObjectByName('halo') as THREE.Mesh;
        if (halo) {
          halo.rotation.y += dt * 2.2;
          halo.position.y = 1.95 + Math.sin(gameRef.current.gtime * 3) * 0.04;
        }
        const hl = player.mesh!.getObjectByName('haloLight') as THREE.PointLight;
        if (hl) hl.intensity = isFlying ? 3.5 : player.cheekOn ? 2.8 : player.shieldOn ? 3.5 : 1.0;

        // Shield pulse
        const sh = player.mesh!.getObjectByName('shield') as THREE.Mesh;
        if (sh) {
          (sh.material as THREE.MeshLambertMaterial).opacity = player.shieldOn ? 0.24 + Math.sin(gameRef.current.gtime * 6) * 0.06 : 0;
          sh.rotation.y += dt * 3;
        }

        // Cooldowns
        player.cds = player.cds.map((cd, i) => (i === 7 ? cd : Math.max(0, cd - dt)));
        if (player.iframes > 0) player.iframes -= dt;
        if (player.cheekOn) {
          player.cheekT -= dt;
          if (player.cheekT <= 0) player.cheekOn = false;
        }
        if (player.parryActive) {
          player.parryT -= dt;
          if (player.parryT <= 0) player.parryActive = false;
        }
        if (player.shieldOn) {
          player.shieldT -= dt;
          if (player.shieldT <= 0) player.shieldOn = false;
        }
        if (gameRef.current.waterOn) {
          gameRef.current.waterTimer -= dt;
          if (gameRef.current.waterTimer <= 0) deactivateFlood();
        }
        if (gameRef.current.comboTimer > 0) {
          gameRef.current.comboTimer -= dt;
          if (gameRef.current.comboTimer <= 0) gameRef.current.comboKills = 0;
        }

        // Bread pickup
        for (let i = pickups.length - 1; i >= 0; i--) {
          const pk = pickups[i];
          pk.life += dt;
          (pk.mesh as THREE.Mesh).rotation.y += dt * 2;
          (pk.mesh as THREE.Mesh).position.y = 0.22 + Math.sin(pk.life * 3) * 0.08;
          const dx = player.x - (pk.mesh as THREE.Mesh).position.x;
          const dz = player.z - (pk.mesh as THREE.Mesh).position.z;
          if (Math.sqrt(dx * dx + dz * dz) < 0.9) {
            scene.remove(pk.mesh as THREE.Mesh);
            player.hp = Math.min(player.maxHp, player.hp + pk.hp);
            pickups.splice(i, 1);
          } else if (pk.life >= pk.maxLife) {
            scene.remove(pk.mesh as THREE.Mesh);
            pickups.splice(i, 1);
          }
        }

        // Celestial rings
        for (let i = rings.length - 1; i >= 0; i--) {
          const r = rings[i];
          r.rotation.x += r.rotSpeed.x * dt;
          r.rotation.y += r.rotSpeed.y * dt;
          r.rotation.z += r.rotSpeed.z * dt;
          r.position.y = r.baseY + Math.sin(gameRef.current.gtime * 0.7 + r.bobPhase) * 2;
          const dx = player.x - r.position.x;
          const dy = player.y - r.position.y;
          const dz = player.z - r.position.z;
          if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 2.5) {
            scene.remove(r);
            rings.splice(i, 1);
            player.mana = Math.min(MANA_MAX, player.mana + 1.5);
          }
        }

        // Replenish rings
        if (rings.length < 2) {
          const a = Math.random() * Math.PI * 2;
          const d = 20 + Math.random() * 50;
          spawnRing(Math.cos(a) * d, 18 + Math.random() * 14, Math.sin(a) * d);
        }

        // Next wave
        if (enemies.length === 0) {
          gameRef.current.waveTimer += dt;
          if (gameRef.current.waveTimer > 2.8) {
            gameRef.current.wave++;
            gameRef.current.waveTimer = 0;
            spawnWave();
          }
        }

        // Death
        if (player.hp <= 0 && !player.dead) {
          player.dead = true;
          player.hp = 0;
          if (gameRef.current.score > gameRef.current.hiScore) {
            gameRef.current.hiScore = gameRef.current.score;
            localStorage.setItem('jw_hi', gameRef.current.hiScore.toString());
          }
          gameRef.current.status = 'dead';
          gameRef.current.deadTimer = DEAD_SEC;
          setGameStatus('dead');
          setDeadTimer(DEAD_SEC);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  UPDATE ENEMIES
      // ═══════════════════════════════════════════════════════════════
      function checkMelee() {
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (e.stepCd > 0 || e.ally) continue;
          const ep = (e.mesh as THREE.Group).position;
          const dx = player.x - ep.x;
          const dz = player.z - ep.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const hitRange = 1.15 * ENEMY_TYPES[e.type].sz * (player.flying ? 0 : 1);

          if (dist < hitRange) {
            if (player.parryActive) {
              player.parryActive = false;
              player.parryT = 0;
              player.iframes = 0.7;
              e.stepCd = 1;
              parryCounter();
            } else if (player.cheekOn) {
              e.wrath = 3;
              e.stepCd = 2;
              spawnFloatText(ep.x, ep.y, ep.z, '😇 СМУЩЁН', '#ffffff');
            } else if (player.shieldOn) {
              spawnFloatText(ep.x, ep.y, ep.z, '🛡 БЛК', '#88bbff');
              e.stepCd = 1;
            } else if (player.iframes <= 0) {
              const dmg = ENEMY_TYPES[e.type].dmg;
              player.hp -= dmg;
              player.iframes = 1.4;
              e.stepCd = 1;
              spawnFloatText(player.x, 0, player.z, `-${dmg}`, '#ff2222');
              spawnParticles(player.x, 1, player.z, 0xff0000, 5);
              Audio.hit();
            }
          }
        }
      }

      function updateEnemies(dt: number) {
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          const em = e.mesh as THREE.Group;

          e.wingPhase += dt * 4;
          em.children.forEach((c: THREE.Object3D) => {
            if (c.name === 'wing') c.rotation.y = Math.sin(e.wingPhase) * 0.55;
          });

          const fl = em.getObjectByName('fireLight') as THREE.PointLight;
          if (fl) fl.intensity = 0.6 + Math.sin(gameRef.current.gtime * 9) * 0.45;

          const bl = em.getObjectByName('bossLight') as THREE.PointLight;
          if (bl) bl.intensity = 1 + Math.sin(gameRef.current.gtime * 4) * 0.4;

          const ep = em.position;
          const jdx = player.x - ep.x;
          const jdz = player.z - ep.z;
          const jdist = Math.sqrt(jdx * jdx + jdz * jdz);

          if (e.ally) {
            e.allyTimer -= dt;
            let nearE: Enemy | null = null;
            let nd = 999;
            enemies.forEach(en => {
              if (en === e || en.ally) return;
              const d = ep.distanceTo(en.mesh.position);
              if (d < nd) {
                nd = d;
                nearE = en;
              }
            });
            const nearEEnemy = nearE as Enemy | null;
            if (nearEEnemy && nd > 0.1) {
              const adx = nearEEnemy.mesh.position.x - ep.x;
              const adz = nearEEnemy.mesh.position.z - ep.z;
              const ad = Math.sqrt(adx * adx + adz * adz);
              ep.x += (adx / ad) * e.speed * dt;
              ep.z += (adz / ad) * e.speed * dt;
            }
            if (nearEEnemy && nd < 1.5 && e.stepCd <= 0) {
              nearEEnemy.hp -= 2;
              e.stepCd = 1;
            }
            if (e.allyTimer <= 0 || e.hp <= 0) {
              spawnParticles(ep.x, ep.y + 0.8, ep.z, 0x88ff88, 4);
              scene.remove(em);
              enemies.splice(i, 1);
              continue;
            }
          } else {
            if (e.drunk > 0) {
              e.drunk -= dt;
              ep.x += Math.cos(gameRef.current.gtime * 3 + i) * e.speed * dt * 0.4;
              ep.z += Math.sin(gameRef.current.gtime * 2.2 + i) * e.speed * dt * 0.4;
            } else if (e.wrath > 0) {
              e.wrath -= dt;
              if (jdist > 0.1) {
                ep.x -= (jdx / jdist) * e.speed * dt * 0.35;
                ep.z -= (jdz / jdist) * e.speed * dt * 0.35;
              }
            } else if (jdist > 0.1) {
              ep.x += (jdx / jdist) * e.speed * dt;
              ep.z += (jdz / jdist) * e.speed * dt;
            }
            em.rotation.y = Math.atan2(jdx, jdz);

            // Separation logic (avoid clumping)
            for (let j = 0; j < enemies.length; j++) {
              if (i === j) continue;
              const e2 = enemies[j];
              const e2p = (e2.mesh as THREE.Group).position;
              const dx = ep.x - e2p.x;
              const dz = ep.z - e2p.z;
              const sqDist = dx * dx + dz * dz;
              const minDist = (ENEMY_TYPES[e.type].sz + ENEMY_TYPES[e2.type].sz) * 0.7;
              if (sqDist < minDist * minDist && sqDist > 0.001) {
                const dist = Math.sqrt(sqDist);
                const push = (minDist - dist) * 2.0 * dt;
                ep.x += (dx / dist) * push;
                ep.z += (dz / dist) * push;
              }
            }
          }

          const q = camera.quaternion;
          ['barBg', 'barFg'].forEach(n => {
            const m = em.getObjectByName(n);
            if (m) m.quaternion.copy(q);
          });
          const bfg = em.getObjectByName('barFg') as THREE.Mesh;
          if (bfg) {
            const hr = e.hp / e.maxHp;
            bfg.scale.x = Math.max(0, hr);
            (bfg.material as THREE.MeshBasicMaterial).color.setHex(hr > 0.5 ? 0x44ee44 : hr > 0.25 ? 0xffaa00 : 0xee2222);
          }

          if (e.iframes > 0) e.iframes -= dt;
          if (e.stepCd > 0) e.stepCd -= dt;

          if (e.hp <= 0) {
            const _v3 = ep.clone();
            _v3.y += 0.8;
            const isBoss = ENEMY_TYPES[e.type].boss;
            spawnParticles(_v3.x, _v3.y, _v3.z, isBoss ? 0xff0000 : e.type === 'f' ? 0xff6600 : 0xff5500, isBoss ? 14 : 7);

            // Legion split
            if (e.legionSplit) {
              for (let k = 0; k < 3; k++) {
                const a = k / 3 * Math.PI * 2;
                const d = 2;
                setTimeout(() => {
                  spawnEnemy('s', ep.x + Math.cos(a) * d, ep.z + Math.sin(a) * d, Math.max(1, gameRef.current.wave - 2));
                }, 50);
              }
            }

            // Wine explode
            if (e.drunkExplode) {
              enemies.forEach(en => {
                if (en !== e && ep.distanceTo(en.mesh.position) < 4) {
                  en.hp -= 3;
                  spawnFloatText(en.mesh.position.x, en.mesh.position.y, en.mesh.position.z, '💥-3', '#ff6600');
                }
              });
            }

            // Score + combo
            gameRef.current.comboKills++;
            gameRef.current.comboTimer = 3;
            const cmult = Math.min(3, 1 + Math.floor(gameRef.current.comboKills / 3) * 0.5);
            const reward = Math.round(ENEMY_TYPES[e.type].rw * cmult * (gameRef.current.wave * 0.12 + 1));
            spawnFloatText(ep.x, ep.y, ep.z, `+${reward}`, '#c8a84b');
            gameRef.current.score += reward;
            gameRef.current.kills++;

            if (isBoss) Audio.resurrect();

            if (gameRef.current.score > gameRef.current.hiScore) {
              gameRef.current.hiScore = gameRef.current.score;
              localStorage.setItem('jw_hi', gameRef.current.hiScore.toString());
            }

            scene.remove(em);
            enemies.splice(i, 1);
          }

          const Eb = 90;
          ep.x = Math.max(-Eb, Math.min(Eb, ep.x));
          ep.z = Math.max(-Eb, Math.min(Eb, ep.z));
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  UPDATE PROJECTILES
      // ═══════════════════════════════════════════════════════
      function updateProjs(dt: number) {
        for (let i = projectiles.length - 1; i >= 0; i--) {
          const p = projectiles[i];

          // Fish homing
          if (p.homing && enemies.length > 0) {
            let ne: Enemy | null = null;
            let nd = 999;
            enemies.forEach(e => {
              if (e.ally) return;
              const d = p.mesh.position.distanceTo(e.mesh.position);
              if (d < nd) {
                nd = d;
                ne = e;
              }
            });
            const neEnemy = ne as Enemy | null;
            if (neEnemy && nd < 20) {
              const td = neEnemy.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(p.mesh.position).normalize();
              p.dir.x = THREE.MathUtils.lerp(p.dir.x, td.x, dt * 4);
              p.dir.z = THREE.MathUtils.lerp(p.dir.z, td.z, dt * 4);
              const len = Math.sqrt(p.dir.x * p.dir.x + p.dir.z * p.dir.z);
              p.dir.x /= len;
              p.dir.z /= len;
            }
          }

          p.mesh.position.x += p.dir.x * p.speed * dt;
          p.mesh.position.z += p.dir.z * p.speed * dt;
          p.life += dt;

          if (p.type === 'smite') p.mesh.rotation.y += 8 * dt;
          if (p.type === 'fish') p.mesh.rotation.y = Math.atan2(p.dir.x, p.dir.z);

          if (p.life > p.maxLife) {
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
            continue;
          }

          let hit = false;
          for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (e.ally) continue;
            if (p.mesh.position.distanceTo((e.mesh as THREE.Group).position) < 1.15 * ENEMY_TYPES[e.type].sz) {
              if (p.type === 'wine') {
                e.drunk = 4;
                e.drunkExplode = true;
                spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y, (e.mesh as THREE.Group).position.z, '🍷 ПЬЯН!', '#ffaa44');
              } else {
                const base = p.type === 'smite' ? 2 : 1;
                const dmg = p.crit ? base * 3 : base;
                e.hp -= dmg;
                if (p.crit) {
                  spawnParticles(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xff8800, 10);
                  spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y + 1, (e.mesh as THREE.Group).position.z, `⚡КРИТ -${dmg}`, '#ff8800');
                  Audio.crit();
                } else {
                  spawnParticles(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xff5500, 5);
                  spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y, (e.mesh as THREE.Group).position.z, `-${dmg}`, '#ff5555');
                }
                if (p.type === 'smite') chainLightning(p.mesh.position.clone(), e, dmg);
              }
              scene.remove(p.mesh);
              projectiles.splice(i, 1);
              hit = true;
              break;
            }
          }
          if (hit) continue;
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  UPDATE FLOATS & PARTICLES
      // ═══════════════════════════════════════════════════════════════
      function updateFloats(dt: number) {
        for (let i = floatTexts.length - 1; i >= 0; i--) {
          const f = floatTexts[i];
          f.life += dt * 0.85;
          f.mesh.position.y = f.startY + f.life * 1.4;
          f.mesh.material.opacity = Math.max(0, 1 - f.life);
          if (f.life >= 1) {
            (f.mesh.material as THREE.SpriteMaterial).map?.dispose();
            (f.mesh.material as THREE.SpriteMaterial).dispose();
            scene.remove(f.mesh);
            floatTexts.splice(i, 1);
          }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life += dt * 1.6;
          p.mesh.position.x += p.v.x * dt;
          p.mesh.position.y += p.v.y * dt - 4 * dt * p.life;
          p.mesh.position.z += p.v.z * dt;
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p.life);
          if (p.life >= 1) {
            (p.mesh.material as THREE.MeshBasicMaterial).dispose();
            scene.remove(p.mesh);
            particles.splice(i, 1);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  UPDATE DEAD/RESURRECT
      // ═══════════════════════════════════════════════════════════════
      function updateDead(dt: number) {
        gameRef.current.deadTimer -= dt;
        setDeadTimer(Math.max(0, Math.ceil(gameRef.current.deadTimer)));

        if (gameRef.current.deadTimer <= 0) {
          gameRef.current.resurrectCount++;
          player.livesLeft = Math.max(0, player.livesLeft - 1);

          if (player.livesLeft <= 0) {
            gameRef.current.status = 'gameover';
            setGameStatus('gameover');
            return;
          }

          setLivesLeft(player.livesLeft);
          setResurrectCount(gameRef.current.resurrectCount);

          gameRef.current.status = 'playing';
          setGameStatus('playing');
          player.dead = false;
          player.hp = player.maxHp;
          player.iframes = 4;
          player.shieldOn = true;
          player.shieldT = 5;

          Audio.resurrect();

          // Damage nearby enemies on resurrect
          enemies.forEach(e => {
            if ((e.mesh as THREE.Group).position.distanceTo(new THREE.Vector3(player.x, 0, player.z)) < 7) {
              e.hp = 0;
            } else {
              e.hp = Math.ceil(e.hp * 0.5);
            }
          });
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  CAMERA UPDATE
      // ═══════════════════════════════════════════════════════════════
      function updateCamera() {
        gameRef.current.camPitch = Math.max(-0.9, Math.min(0.5, gameRef.current.camPitch));
        const lookTarget = new THREE.Vector3(player.x, 1.4 + player.y * 0.5, player.z);
        const ox = -Math.sin(gameRef.current.camYaw) * Math.cos(gameRef.current.camPitch) * CAM_DIST;
        const oy = -Math.sin(gameRef.current.camPitch) * CAM_DIST + 1.8 + player.y * 0.3;
        const oz = -Math.cos(gameRef.current.camYaw) * Math.cos(gameRef.current.camPitch) * CAM_DIST;
        const desired = new THREE.Vector3(player.x + ox, Math.max(1.5, lookTarget.y + oy), player.z + oz);
        camPos.lerp(desired, 0.22);
        camera.position.copy(camPos);
        camera.lookAt(lookTarget);
        camera.updateMatrixWorld();
      }

      // ═══════════════════════════════════════════════════════════════
      //  MAIN LOOP
      // ═══════════════════════════════════════════════════════════════
      let lastTime = performance.now();
      let accumulator = 0;
      let lastHudAt = 0;
      const HUD_INTERVAL_MS = 48;
      let rafId = 0;

      const animate = (time: number) => {
        rafId = requestAnimationFrame(animate);

        const rawDt = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;

        const mx = Math.max(-MAX_POINTER_DELTA, Math.min(MAX_POINTER_DELTA, dx));
        const my = Math.max(-MAX_POINTER_DELTA, Math.min(MAX_POINTER_DELTA, dy));
        if (mx !== 0 || my !== 0) {
          gameRef.current.camYaw -= mx * mouseSens;
          gameRef.current.camPitch -= my * mouseSens;
        }
        dx = 0;
        dy = 0;

        // Clouds
        clouds.forEach(c => {
          c.position.x += c.userData.drift * rawDt;
          if (c.position.x > 150) c.position.x = -150;
        });

        // Water animation
        if (gameRef.current.waterOn) waterMesh.position.y = 0.05 + Math.sin(gameRef.current.gtime * 1.5) * 0.04;

        if (gameRef.current.status === 'playing') {
          accumulator += rawDt;
          const maxSteps = 3;
          let steps = 0;
          while (accumulator >= PHYSICS_DT && steps < maxSteps) {
            gameRef.current.gtime += PHYSICS_DT;
            updatePlayer(PHYSICS_DT);
            updateEnemies(PHYSICS_DT);
            updateProjs(PHYSICS_DT);
            checkMelee();
            accumulator -= PHYSICS_DT;
            steps++;
          }
          if (accumulator > PHYSICS_DT) accumulator = PHYSICS_DT;

          // Frame-rate inputs
          clicks.forEach(btn => {
            if (btn === 0 && player.cds[0] <= 0) {
              const isCrit = fireProjectile('smite', player.x, 1 + player.y, player.z, player.yaw);
              player.cds[0] = 0.35;
              if (isCrit) Audio.crit();
              else Audio.smite();
            }
            if (btn === 2 && player.cds[1] <= 0) {
              fireProjectile('fish', player.x, 1 + player.y, player.z, player.yaw);
              player.cds[1] = 0.5;
              Audio.fish();
            }
          });
          clicks.length = 0;

          updateFloats(rawDt);
          updateCamera();

          if (time - lastHudAt >= HUD_INTERVAL_MS) {
            lastHudAt = time;
            const cm = Math.min(3, 1 + Math.floor(gameRef.current.comboKills / 3) * 0.5);
            setCombo(cm > 1 ? cm : 0);
            setHp(Math.max(0, player.hp));
            setMana(player.mana);
            setLivesLeft(player.livesLeft);
            setWave(gameRef.current.wave);
            setKills(gameRef.current.kills);
            setScore(gameRef.current.score);
            setHiScore(gameRef.current.hiScore);
            setCooldowns([...player.cds]);
          }
        } else if (gameRef.current.status === 'dead') {
          gameRef.current.gtime += rawDt;
          updateDead(rawDt);
          updateEnemies(rawDt);
          updateFloats(rawDt);
          updateCamera();
          setHp(0);
        }

        renderer.render(scene, camera);
      };

      // ═══════════════════════════════════════════════════════════════════
      //  KEYBOARD SHORTCUTS
      // ═══════════════════════════════════════════════════════════════
      const handleKeyDownEvent = (e: KeyboardEvent) => {
        if (e.code === 'Escape') {
          if (gameRef.current.status === 'playing') pauseGame();
          else if (gameRef.current.status === 'paused') resumeGame();
          return;
        }
        if (gameRef.current.status !== 'playing') return;

        if (e.code === 'KeyQ' && player.cds[2] <= 0) {
          fireProjectile('wine', player.x, 1 + player.y, player.z, player.yaw);
          player.cds[2] = 5;
          Audio.wine();
        }
        if (e.code === 'KeyE') activateParry();
        if (e.code === 'KeyR') activateFlood();
        if (e.code === 'KeyF') activateBread();
        if (e.code === 'KeyG') activateGrace();
        if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !player.flying && player.mana > 0.3 && player.onGround) startFlight();
        if (e.code === 'Space' && !player.flying && player.onGround) {
          player.velY = 7.5;
          player.onGround = false;
          e.preventDefault();
        }
      };

      const handleKeyUpEvent = (e: KeyboardEvent) => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') if (player.flying) stopFlight();
      };

      window.addEventListener('keydown', handleKeyDownEvent);
      window.addEventListener('keyup', handleKeyUpEvent);

      const handleCanvasClick = () => {
        if (gameRef.current.status === 'menu') startGame();
      };
      canvas.addEventListener('click', handleCanvasClick);

      // Resize
      const handleResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', handleResize);

      // Initial camera
      camera.position.set(0, 8, 12);
      camera.lookAt(0, 0, 0);

      setEngineReady(true);

      // Start loop
      rafId = requestAnimationFrame(animate);

      // Cleanup
      return () => {
        cancelAnimationFrame(rafId);
        startGameRef.current = null;
        resumeGameRef.current = null;
        showMenuRef.current = null;
        skipDeadWaitRef.current = null;
        setEngineReady(false);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('blur', onWinBlur);
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('contextmenu', handleContextMenu);
        canvas.removeEventListener('click', handlePointerLockClick);
        document.removeEventListener('pointerlockchange', handlePointerLockChange);
        window.removeEventListener('keydown', handleKeyDownEvent);
        window.removeEventListener('keyup', handleKeyUpEvent);
        window.removeEventListener('resize', handleResize);
        canvas.removeEventListener('click', handleCanvasClick);
        burstGeo.dispose();
        renderer.dispose();
      };
  }, []);

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Canvas */}
      <div ref={containerRef} className="w-full h-full">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* HUD - only show when playing or dead */}
      {(gameStatus === 'playing' || gameStatus === 'dead') && (
        <div className="absolute top-0 left-0 w-full pointer-events-none p-3">
          <div className="flex justify-between items-start gap-2 flex-wrap">
            {/* HP Panel */}
            <div className="bg-black/80 border border-amber-600/60 rounded-md p-2 backdrop-blur-sm">
              <div className="text-amber-500 text-xs tracking-widest font-serif uppercase">✝ Святость</div>
              <div className="w-44 h-3 bg-red-900 rounded mt-1 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-800 via-red-600 to-red-400 transition-all duration-150"
                  style={{ width: `${(hp / 100) * 100}%` }}
                />
              </div>
              <div className="text-gray-300 text-xs text-right mt-0.5 font-serif">
                {Math.round(hp)} / 100
              </div>
              {/* Mana */}
              <div className="text-amber-500 text-xs tracking-widest font-serif uppercase mt-2">✞ Вознесение</div>
              <div className="w-44 h-2 bg-blue-900 rounded mt-1 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-150"
                  style={{ width: `${(mana / MANA_MAX) * 100}%` }}
                />
              </div>
              {/* Lives */}
              <div className="flex gap-1 mt-2">
                {Array.from({ length: MAX_RESURRECTS }).map((_, i) => (
                  <span
                    key={i}
                    className={`text-amber-500 ${i < livesLeft ? '' : 'opacity-20'}`}
                  >
                    ✝
                  </span>
                ))}
              </div>
            </div>

            {/* Wave Block */}
            <div className="bg-black/80 border border-amber-600/60 rounded-md px-4 py-2 text-center backdrop-blur-sm">
              <div className="text-amber-500 text-xs tracking-widest font-serif">ВОЛНА</div>
              <div className="text-white text-2xl font-black font-serif">{wave}</div>
              <div className="text-gray-500 text-xs font-serif">Грешников: {kills}</div>
            </div>

            {/* Abilities */}
            <div className="bg-black/80 border border-amber-600/60 rounded-md p-2 backdrop-blur-sm">
              {ABILITY_ICONS.map((icon, i) => (
                <div key={i} className="flex items-center gap-2 my-0.5">
                  <div className="w-6 h-6 bg-amber-600 rounded flex items-center justify-center text-xs font-bold text-black">
                    {[0, 1].includes(i) ? (i === 0 ? 'ЛКМ' : 'ПКМ') : ['Q', 'E', 'R', 'F', 'G', 'S'][i - 2]}
                  </div>
                  <span className="text-gray-200 text-xs">{icon}</span>
                  <span className={`text-xs ${cooldowns[i] <= 0 ? 'text-amber-500' : 'text-gray-500'}`}>
                    {cooldowns[i] <= 0 ? '✓' : Math.ceil(cooldowns[i]) + 'с'}
                  </span>
                </div>
              ))}
            </div>

            {/* Score */}
            <div className="bg-black/80 border border-amber-600/60 rounded-md px-3 py-2 text-center backdrop-blur-sm">
              <div className="text-amber-500 text-xs tracking-widest font-serif">ОЧКИ</div>
              <div className="text-white text-xl font-black font-serif">{score}</div>
              <div className="text-amber-500/40 text-xs font-serif">РЕК: {hiScore}</div>
            </div>

            {/* Combo */}
            {combo > 1 && (
              <div className="bg-black/80 border border-amber-600/60 rounded-md px-3 py-2 text-center backdrop-blur-sm">
                <div className="text-amber-500 text-2xl font-black">×{combo.toFixed(1)}</div>
                <div className="text-amber-500/60 text-xs font-serif">COMBO</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dead Overlay */}
      {gameStatus === 'dead' && (
        <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center z-50 backdrop-blur-sm pointer-events-auto">
          <div className="text-red-600 text-4xl md:text-5xl font-black tracking-widest mb-3 font-serif" style={{ textShadow: '0 0 24px rgba(180,0,0,0.5)' }}>
            РАСПЯЛИ…
          </div>
          <div className="text-white/90 text-lg mb-6 font-serif">Смайтнуто грешников: {kills}</div>
          <div className="text-amber-500/80 text-sm mb-2 font-serif">Воскресение через</div>
          <div className="text-white text-6xl font-black tabular-nums mb-8">{deadTimer}</div>
          <button
            type="button"
            onClick={() => skipDeadWaitRef.current?.()}
            className="bg-gradient-to-br from-amber-400 to-amber-600 text-black font-black py-3 px-14 rounded-lg tracking-widest hover:scale-105 transition-transform cursor-pointer font-serif text-lg"
          >
            ВОСКРЕСНУТЬ
          </button>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameStatus === 'gameover' && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-50">
          <div className="text-red-500 text-5xl font-black tracking-widest mb-4 font-serif">✟ КОНЕЦ ✟</div>
          <div className="text-amber-500 text-xl mb-2 font-serif">ВОЛНА {wave}</div>
          <div className="text-amber-500 text-xl mb-2 font-serif">ОЧКИ {score}</div>
          <div className="text-amber-500 text-lg mb-6 font-serif">РЕКОРД {hiScore}</div>
          <button
            onClick={() => window.location.reload()}
            className="bg-gradient-to-br from-amber-500 to-amber-700 text-black font-bold py-3 px-10 rounded tracking-widest hover:scale-105 transition-transform cursor-pointer pointer-events-auto font-serif"
          >
            В МЕНЮ
          </button>
        </div>
      )}

      {/* Menu Overlay */}
      {gameStatus === 'menu' && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/95 to-black flex flex-col items-center justify-center z-50">
          <div className="text-amber-400 text-4xl md:text-6xl font-black tracking-widest mb-3 font-serif" style={{ textShadow: '0 0 36px rgba(200,168,75,0.45)' }}>
            + ИИСУС БЬЁТ +
          </div>
          <p className="text-white/90 text-base md:text-lg mb-8 font-sans max-w-md px-4 text-center">
            Мочи грешников молниями и рыбой
          </p>
          {hiScore > 0 && <div className="text-amber-500/50 mb-4 text-lg font-serif">Рекорд: {hiScore}</div>}
          <button
            type="button"
            disabled={!engineReady}
            onClick={() => startGameRef.current?.()}
            className="bg-gradient-to-br from-amber-400 to-amber-600 text-black font-black py-3 px-12 rounded-lg tracking-widest hover:scale-105 transition-transform cursor-pointer pointer-events-auto font-sans text-lg disabled:opacity-40 disabled:pointer-events-none"
          >
            {engineReady ? 'НАЧАТЬ' : 'ЗАГРУЗКА…'}
          </button>
          <div className="text-amber-800/70 mt-10 text-xs leading-relaxed font-serif text-center max-w-lg px-6">
            WASD · мышь · ЛКМ/ПКМ · Q E R F G · пробел · Shift · Esc
          </div>
        </div>
      )}

      {/* Pause Overlay */}
      {gameStatus === 'paused' && (
        <div className="absolute inset-0 bg-black/88 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
          <div className="text-amber-500 text-4xl font-black tracking-widest mb-8 font-serif">✝ ПАУЗА ✝</div>
          <button
            type="button"
            onClick={() => resumeGameRef.current?.()}
            className="bg-gradient-to-br from-amber-500 to-amber-700 text-black font-bold py-3 px-10 rounded tracking-widest hover:scale-105 transition-transform cursor-pointer pointer-events-auto font-serif mb-4"
          >
            ПРОДОЛЖИТЬ
          </button>
          <button
            type="button"
            onClick={() => showMenuRef.current?.()}
            className="bg-gradient-to-br from-gray-600 to-gray-800 text-white font-bold py-3 px-10 rounded tracking-widest hover:scale-105 transition-transform cursor-pointer pointer-events-auto font-serif"
          >
            ГЛАВНОЕ МЕНЮ
          </button>
        </div>
      )}

      {/* Crosshair (playing) */}
      {gameStatus === 'playing' && (
        <div className="absolute top-1/2 left-1/2 w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="absolute top-1/2 left-0 w-full h-0.5 -translate-y-1/2 bg-amber-300/90" />
          <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-amber-300/90" />
          <div className="absolute top-1/2 left-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 bg-amber-300 rounded-full" />
        </div>
      )}

    </div>
  );
}
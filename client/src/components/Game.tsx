import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useIsMobile } from '../hooks/useMobile';
import MobileTouchControls from './MobileTouchControls';

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
const BASE_FOV = 68;
const COYOTE_SEC = 0.14;

const ABILITY_ICONS = ['⚡', '🐟', '🍷', '✋', '🌊', '🍞', '☀', '✞'];

const BIBLE_CRITS = [
  '"Аз есмь" — Ин.8:58',
  '"Силён Бог" — 2Кор.9:8',
  '"Господь — свет мой" — Пс.26:1',
  '"Нет страха в любви" — 1Ин.4:18',
  '"Победитель" — Откр.3:21',
  '"Претерпевший спасётся" — Мф.24:13',
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
  // Arcade feel
  attackTimer: number;   // decays to 0, drives arm swing
  attackHand: number;    // 1 = right arm, -1 = left arm
  landSquash: number;    // 1 → 0, squash on landing
  coyoteTime: number;    // coyote jump window (sec)
  prevOnGround: boolean;
  idlePhase: number;     // slow bob when stationary
  resurrectScale: number; // 0 → 1, pop-in animation on resurrection
  speedBoost: number;    // > 0 = speed boosted (remaining sec)
  graceBuff: number;     // > 0 = grace divine buff active (remaining sec)
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
  hitFlash: number;   // 1 → 0, white emissive on hit
  slowed: number;     // > 0 = slowed (sec), speed 0.4x
  knockX: number;     // knockback velocity X
  knockZ: number;     // knockback velocity Z
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
  type?: string;   // 'bread' = grants speed boost on collect
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
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const startGameRef = useRef<(() => void) | null>(null);
  const resumeGameRef = useRef<(() => void) | null>(null);
  const showMenuRef = useRef<(() => void) | null>(null);
  const skipDeadWaitRef = useRef<(() => void) | null>(null);
  const eventQueueRef = useRef<string[]>([]);
  
  // Mobile touch control refs
  const isMobile = useIsMobile();
  const mobileInputRef = useRef({
    moveX: 0,
    moveZ: 0,
    lookDx: 0,
    lookDy: 0,
    pendingAbilities: [] as string[],
    pendingAttacks: [] as number[],
    flightHeld: false,
  });

  // Mobile input callbacks
  const handleMobileMove = useCallback((dx: number, dz: number) => {
    mobileInputRef.current.moveX = dx;
    mobileInputRef.current.moveZ = dz;
  }, []);

  const handleMobileLook = useCallback((dx: number, dy: number) => {
    mobileInputRef.current.lookDx += dx;
    mobileInputRef.current.lookDy += dy;
  }, []);

  const handleMobileAbility = useCallback((ability: string) => {
    if (ability === 'ShiftDown') {
      mobileInputRef.current.flightHeld = true;
    } else if (ability === 'ShiftUp') {
      mobileInputRef.current.flightHeld = false;
    } else {
      mobileInputRef.current.pendingAbilities.push(ability);
    }
  }, []);

  const handleMobileAttack = useCallback((button: number) => {
    mobileInputRef.current.pendingAttacks.push(button);
  }, []);

  // Game state
  const [gameStatus, setGameStatus] = useState<'menu' | 'playing' | 'paused' | 'dead' | 'gameover'>('menu');
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [mana, setMana] = useState(MANA_MAX);
  const [livesLeft, setLivesLeft] = useState(MAX_RESURRECTS);
  const [wave, setWave] = useState(1);
  const [kills, setKills] = useState(0);
  const [score, setScore] = useState(0);
  const [hiScore, setHiScore] = useState(0);
  const [cooldowns, setCooldowns] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const [combo, setCombo] = useState(0);
  const [deadTimer, setDeadTimer] = useState(0);
  const [engineReady, setEngineReady] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [lockedMsg, setLockedMsg] = useState('');
  const [satanWarning, setSatanWarning] = useState(false);
  const [hitFlash, setHitFlash] = useState(0); // 0-1, red screen overlay
  const [bibleQuoteNotif, setBibleQuoteNotif] = useState('');
  const [bibleQuoteOpacity, setBibleQuoteOpacity] = useState(0);
  const [activeBuffs, setActiveBuffs] = useState<string[]>([]); // active buff names for HUD

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
    floodPushTimer: 0,
    camYaw: 0,
    camPitch: -0.22,
    hiScore: 0,
    resurrectCount: 0,
    comboKills: 0,
    comboTimer: 0,
    pendingSpawnCount: 0,
    // Arcade feel
    camShake: 0,
    targetFov: BASE_FOV,
    hitFlashVal: 0,    // raw value, synced to React state every HUD tick
    // Bible quote notification (set on boss crit, fades over 3s)
    bibleQuoteText: '',
    bibleQuoteFade: 0,
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
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
      //  ARENA — PILLARS, TORCHES, STONE CIRCLE
      // ═══════════════════════════════════════════════════════
      const stoneMat = new THREE.MeshPhongMaterial({ color: 0x888888, specular: 0x444444, shininess: 14 });
      const stoneDarkMat = new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0x333333, shininess: 8 });

      // Central stone plaza — circular disk
      const plazaGeo = new THREE.CylinderGeometry(12, 12.3, 0.18, 28);
      const plazaMat = new THREE.MeshPhongMaterial({ color: 0x7a7060, specular: 0x443322, shininess: 10 });
      const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
      plazaMesh.position.y = -0.05;
      plazaMesh.receiveShadow = true;
      scene.add(plazaMesh);

      // Cobblestone ring border
      const cobbleRing = new THREE.Mesh(new THREE.TorusGeometry(12.2, 0.5, 6, 32), new THREE.MeshPhongMaterial({ color: 0x605040, specular: 0x222211, shininess: 6 }));
      cobbleRing.rotation.x = Math.PI / 2;
      cobbleRing.position.y = 0.05;
      scene.add(cobbleRing);

      // 8 pillars with torches
      const torchLights: THREE.PointLight[] = [];
      const PILLAR_RADIUS = 45;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const px = Math.sin(angle) * PILLAR_RADIUS;
        const pz = Math.cos(angle) * PILLAR_RADIUS;

        const pg = new THREE.Group();
        // Stone base
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.1), stoneDarkMat);
        base.position.y = 0.22;
        base.castShadow = true;
        pg.add(base);
        // Main pillar shaft
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 4.5, 8), stoneMat);
        shaft.position.y = 2.7;
        shaft.castShadow = true;
        pg.add(shaft);
        // Capital (top detail)
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.35, 0.88), stoneDarkMat);
        cap.position.y = 5.15;
        cap.castShadow = true;
        pg.add(cap);
        // Torch bracket arm
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.8, 5), new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 30 }));
        arm.rotation.z = Math.PI / 2.4;
        arm.position.set(0.55, 5.0, 0);
        pg.add(arm);
        // Torch body
        const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.42, 6), new THREE.MeshPhongMaterial({ color: 0x5c3a1e, shininess: 5 }));
        torch.position.set(0.82, 5.22, 0);
        pg.add(torch);
        // Flame sphere (glowing orange)
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff7700 }));
        flame.position.set(0.82, 5.48, 0);
        flame.name = 'flame';
        pg.add(flame);
        // Torch light
        const tl = new THREE.PointLight(0xff8800, 2.2, 22);
        tl.position.set(0.82, 5.6, 0);
        pg.add(tl);
        torchLights.push(tl);

        pg.position.set(px, 0, pz);
        scene.add(pg);
      }

      // Arena boundary ring on ground
      const arenaRingGeo = new THREE.TorusGeometry(PILLAR_RADIUS, 0.18, 5, 64);
      const arenaRingMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.22 });
      const arenaRing = new THREE.Mesh(arenaRingGeo, arenaRingMat);
      arenaRing.rotation.x = Math.PI / 2;
      arenaRing.position.y = 0.04;
      scene.add(arenaRing);

      // ═══════════════════════════════════════════════════════
      //  PLAYER (JESUS) MODEL
      // ═══════════════════════════════════════════════════════
      function makeJesus() {
        const g = new THREE.Group();
        const robeMat = new THREE.MeshPhongMaterial({ color: 0xf5efe0, specular: 0xffffff, shininess: 18 });
        const innerRobeMat = new THREE.MeshPhongMaterial({ color: 0xd4c49a, specular: 0xdddddd, shininess: 10 });
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xf0dfc4, specular: 0xffeecc, shininess: 12 });
        const hairMat = new THREE.MeshPhongMaterial({ color: 0x5a2f08, specular: 0x885520, shininess: 20 });
        const skinMat = new THREE.MeshPhongMaterial({ color: 0xf5dfc0, specular: 0xffe8cc, shininess: 14 });
        const sandMat = new THREE.MeshPhongMaterial({ color: 0x7a5018, specular: 0xaa7030, shininess: 8 });
        const goldMat = new THREE.MeshPhongMaterial({ color: 0xffd700, emissive: 0xcc8800, emissiveIntensity: 0.6, specular: 0xffffaa, shininess: 60 });

        // Robe outer (flared, more segments for roundness)
        const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.52, 1.38, 16), robeMat);
        robe.position.y = 0.69;
        robe.castShadow = true;
        g.add(robe);

        // Robe fold overlay (subtle crease)
        const robeFold = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.82, 16), new THREE.MeshPhongMaterial({ color: 0xe8dfc8, specular: 0xffffff, shininess: 10 }));
        robeFold.position.y = 0.92;
        g.add(robeFold);

        // Inner robe visible at hem
        const innerRobe = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.44, 0.20, 14), innerRobeMat);
        innerRobe.position.y = 0.10;
        g.add(innerRobe);

        // Belt
        const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.095, 14), goldMat);
        belt.position.y = 0.80;
        g.add(belt);

        // Belt knot / buckle
        const knot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.09), goldMat);
        knot.position.set(0, 0.80, 0.305);
        g.add(knot);

        // Upper body / chest
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.29, 0.48, 12), bodyMat);
        body.position.y = 1.29;
        g.add(body);

        // Mantle / shoulder drape
        const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.22, 12), innerRobeMat);
        mantle.position.y = 1.40;
        g.add(mantle);

        // Head (slightly elongated)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.225, 14, 12), skinMat);
        head.scale.y = 1.08;
        head.position.y = 1.65;
        head.castShadow = true;
        g.add(head);

        // Hair cap
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.240, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
        hair.position.y = 1.73;
        g.add(hair);

        // Long side hair strands
        [-1, 1].forEach(s => {
          const lh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.018, 0.48, 6), hairMat);
          lh.position.set((s as number) * 0.21, 1.44, 0.02);
          lh.rotation.z = (s as number) * 0.24;
          lh.rotation.x = 0.10;
          g.add(lh);
          // Extra strand for fuller hair
          const lh2 = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.012, 0.36, 5), hairMat);
          lh2.position.set((s as number) * 0.16, 1.42, 0.10);
          lh2.rotation.z = (s as number) * 0.38;
          lh2.rotation.x = 0.25;
          g.add(lh2);
        });

        // Beard (fuller shape with two layers)
        const beard = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.48), hairMat);
        beard.position.set(0, 1.50, 0.12);
        g.add(beard);
        const beardTip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.025, 0.22, 6), hairMat);
        beardTip.position.set(0, 1.35, 0.14);
        beardTip.rotation.x = -0.15;
        g.add(beardTip);

        // Moustache
        const moustache = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 5, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.22), hairMat);
        moustache.position.set(0, 1.585, 0.205);
        g.add(moustache);

        // Eyes with white sclera
        [-1, 1].forEach(s => {
          const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.034, 7, 7), new THREE.MeshPhongMaterial({ color: 0xfff8f0, shininess: 40 }));
          sclera.position.set((s as number) * 0.092, 1.67, 0.195);
          g.add(sclera);
          const iris = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), new THREE.MeshBasicMaterial({ color: 0x3d1e00 }));
          iris.position.set((s as number) * 0.092, 1.67, 0.214);
          g.add(iris);

          // Eyebrow (angled for wise expression)
          const brow = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.024), hairMat);
          brow.position.set((s as number) * 0.090, 1.715, 0.210);
          brow.rotation.z = (s as number) * -0.20;
          g.add(brow);
        });

        // Nose
        const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.027, 0.060, 6), skinMat);
        nose.position.set(0, 1.63, 0.215);
        nose.rotation.x = Math.PI / 2 + 0.28;
        g.add(nose);

        // Ears
        [-1, 1].forEach(s => {
          const ear = new THREE.Mesh(new THREE.SphereGeometry(0.040, 6, 5), skinMat);
          ear.scale.set(0.6, 1.0, 0.5);
          ear.position.set((s as number) * 0.228, 1.64, 0.0);
          g.add(ear);
        });

        // Arms with sleeve detail
        const armGroup = new THREE.Group();
        armGroup.name = 'armGroup';
        [-1, 1].forEach(s => {
          // Sleeve
          const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.42, 8), robeMat);
          sleeve.rotation.z = (s as number) * (Math.PI / 4 + 0.18);
          sleeve.position.set((s as number) * 0.44, 1.20, 0);
          armGroup.add(sleeve);
          // Forearm (skin)
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.28, 7), skinMat);
          arm.rotation.z = (s as number) * (Math.PI / 4 + 0.18);
          arm.position.set((s as number) * 0.68, 0.98, 0);
          arm.castShadow = true;
          arm.name = `arm${s}`;
          armGroup.add(arm);
          // Hand
          const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 7), skinMat);
          hand.position.set((s as number) * 0.84, 0.87, 0);
          armGroup.add(hand);
          // Stigmata glow
          const stigma = new THREE.Mesh(new THREE.CircleGeometry(0.022, 8), new THREE.MeshBasicMaterial({ color: 0xff3300, side: THREE.DoubleSide }));
          stigma.position.set((s as number) * 0.844, 0.872, 0.07);
          armGroup.add(stigma);
        });
        g.add(armGroup);

        // Legs with sandals
        const legGroup = new THREE.Group();
        legGroup.name = 'legGroup';
        [-1, 1].forEach(s => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.080, 0.065, 0.62, 8), new THREE.MeshPhongMaterial({ color: 0xd4c4a0, shininess: 8 }));
          leg.position.set((s as number) * 0.13, 0.03, 0);
          leg.castShadow = true;
          leg.name = `leg${s}`;
          legGroup.add(leg);
          // Sandal sole
          const sandal = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.042, 0.25), sandMat);
          sandal.position.set((s as number) * 0.13, -0.285, 0.04);
          legGroup.add(sandal);
          // Sandal strap (across foot)
          const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.028, 0.028), sandMat);
          strap1.position.set((s as number) * 0.13, -0.230, 0.04);
          legGroup.add(strap1);
          // Sandal strap (toe)
          const strap2 = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.18), sandMat);
          strap2.position.set((s as number) * 0.13, -0.230, 0.02);
          legGroup.add(strap2);
        });
        g.add(legGroup);

        // ── FLIGHT CROSS — Полное Распятие ──────────────────────────────
        const crossG = new THREE.Group();
        crossG.name = 'flyCross';

        // Dark wood materials
        const woodMat = new THREE.MeshPhongMaterial({ color: 0x4a2800, specular: 0x221100, shininess: 8 });
        const woodDarkMat = new THREE.MeshPhongMaterial({ color: 0x2a1400, specular: 0x110800, shininess: 4 });
        // Gold emissive for edges and inlays
        const crossGoldMat = new THREE.MeshPhongMaterial({ color: 0xffd700, emissive: 0xcc8800, emissiveIntensity: 1.0, specular: 0xffffaa, shininess: 80 });
        // Divine glow material (large transparent aura behind cross)
        const auraMat = new THREE.MeshBasicMaterial({ color: 0xfff5cc, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
        // White glow for corpus
        const corpusMat = new THREE.MeshPhongMaterial({ color: 0xf5e8d0, emissive: 0xffd080, emissiveIntensity: 0.5, specular: 0xffffff, shininess: 30 });

        // ── Cross beams (wood) ──
        // Vertical beam: full height from base to top
        const cVert = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.10), woodMat);
        cVert.position.y = 0.6;  // positioned so cross base is near player feet, top ~y=1.7
        crossG.add(cVert);
        // Vertical beam dark face
        const cVertFace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.18, 0.12), woodDarkMat);
        cVertFace.position.set(0, 0.6, 0.01);
        crossG.add(cVertFace);

        // Horizontal beam: at about 70% up
        const cHoriz = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.10), woodMat);
        cHoriz.position.set(0, 1.28, 0);
        crossG.add(cHoriz);
        const cHorizFace = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.12), woodDarkMat);
        cHorizFace.position.set(0, 1.28, 0.01);
        crossG.add(cHorizFace);

        // Gold inlay lines along beam edges (4 edge strips)
        [-1, 1].forEach(s => {
          const edgeV = new THREE.Mesh(new THREE.BoxGeometry(0.018, 2.2, 0.018), crossGoldMat);
          edgeV.position.set((s as number) * 0.06, 0.6, 0.055);
          crossG.add(edgeV);
          const edgeH = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.018, 0.018), crossGoldMat);
          edgeH.position.set(0, (s as number) * 0.06 + 1.28, 0.055);
          crossG.add(edgeH);
        });

        // INRI title plate at top of cross
        const inriPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.05), crossGoldMat);
        inriPlate.position.set(0, 1.72, 0.04);
        crossG.add(inriPlate);

        // ── Corpus of Christ — simplified luminous figure ──
        // Head
        const corpusHead = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), corpusMat);
        corpusHead.position.set(0, 1.50, 0.11);
        crossG.add(corpusHead);
        // Crown of thorns (dark ring)
        const thornMat = new THREE.MeshPhongMaterial({ color: 0x2a1500, shininess: 4 });
        const thorn = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 6, 16), thornMat);
        thorn.position.set(0, 1.53, 0.11);
        thorn.rotation.x = Math.PI / 2;
        crossG.add(thorn);
        // Torso
        const corpusTorso = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.30, 0.07), corpusMat);
        corpusTorso.position.set(0, 1.24, 0.10);
        crossG.add(corpusTorso);
        // Arms outstretched along horizontal beam
        [-1, 1].forEach(s => {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.06), corpusMat);
          arm.position.set((s as number) * 0.35, 1.30, 0.10);
          crossG.add(arm);
          // Hand
          const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), corpusMat);
          hand.position.set((s as number) * 0.62, 1.28, 0.10);
          crossG.add(hand);
          // Stigmata glow (nail wound)
          const stigmataMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.8 });
          const stigmata = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), stigmataMat);
          stigmata.position.set((s as number) * 0.62, 1.28, 0.135);
          crossG.add(stigmata);
        });
        // Legs
        const corpusLegs = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.07), corpusMat);
        corpusLegs.position.set(0, 0.94, 0.10);
        crossG.add(corpusLegs);
        // Foot stigmata
        const footStigMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.8 });
        const footStig = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), footStigMat);
        footStig.position.set(0, 0.81, 0.14);
        crossG.add(footStig);

        // ── Divine Aura disc behind cross ──
        const auraDisk = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), auraMat);
        auraDisk.position.set(0, 1.0, -0.05);
        crossG.add(auraDisk);
        const auraRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 32), new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
        auraRing.position.set(0, 1.0, -0.04);
        crossG.add(auraRing);
        const auraRing2 = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.28, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
        auraRing2.position.set(0, 1.0, -0.03);
        crossG.add(auraRing2);

        // ── Rotating Gem Ring (8 diamonds orbiting cross center) ──
        const gemRingG = new THREE.Group();
        gemRingG.name = 'crossRing';
        gemRingG.position.y = 1.0;
        for (let gi = 0; gi < 8; gi++) {
          const angle = (gi / 8) * Math.PI * 2;
          const r = 1.4;
          const gemMat = new THREE.MeshPhongMaterial({
            color: gi % 2 === 0 ? 0xffd700 : 0xffffff,
            emissive: gi % 2 === 0 ? 0xcc8800 : 0x8888ff,
            emissiveIntensity: 0.9,
            specular: 0xffffff,
            shininess: 120,
            transparent: true,
            opacity: 0.9,
          });
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), gemMat);
          gem.position.set(Math.cos(angle) * r, Math.sin(angle) * 0.3, Math.sin(angle) * r);
          gemRingG.add(gem);
        }
        crossG.add(gemRingG);

        // ── Wing Beams of Light ──
        const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
        [-1, 1].forEach(s => {
          const wing = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), wingMat);
          wing.name = 'crossWing';
          wing.position.set((s as number) * 1.2, 1.28, 0);
          wing.rotation.z = (s as number) * 0.25;
          crossG.add(wing);
        });

        // ── Lights ──
        const crossLight1 = new THREE.PointLight(0xffd700, 4.0, 9);
        crossLight1.name = 'crossLight';
        crossLight1.position.set(0, 1.3, 0.3);
        crossG.add(crossLight1);
        const crossLight2 = new THREE.PointLight(0xffffff, 2.5, 7);
        crossLight2.position.set(0, 1.7, 0.3);
        crossG.add(crossLight2);
        const crossLight3 = new THREE.PointLight(0x8888ff, 1.2, 5);
        crossLight3.position.set(0, 0.5, 0.4);
        crossG.add(crossLight3);

        crossG.visible = false;
        g.add(crossG);

        // Halo (outer ring + inner ring)
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 12, 36), goldMat);
        halo.position.y = 1.99;
        halo.name = 'halo';
        g.add(halo);
        const haloInner = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 8, 24), goldMat);
        haloInner.position.y = 1.99;
        g.add(haloInner);

        const hl = new THREE.PointLight(0xffd700, 1.5, 6);
        hl.position.y = 2.0;
        hl.name = 'haloLight';
        g.add(hl);

        // Shield
        const sh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshPhongMaterial({ color: 0x88bbff, transparent: true, opacity: 0, side: THREE.DoubleSide, specular: 0xffffff, shininess: 40 }));
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
        const bm = new THREE.MeshPhongMaterial({ color: T.body, specular: 0x441111, shininess: 22 });
        const dm = new THREE.MeshPhongMaterial({ color: T.dark, specular: 0x220000, shininess: 16 });

        // Body (more segments for smoother look)
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * sz, 0.36 * sz, 0.98 * sz, 12), bm);
        body.position.y = 0.49 * sz;
        body.castShadow = true;
        g.add(body);

        // Archdemon: armour chest plates + pauldrons
        if (type === 'a') {
          const plateMat = new THREE.MeshPhongMaterial({ color: 0x3a0000, specular: 0x880000, shininess: 40 });
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46 * sz, 0.58 * sz, 0.24 * sz), plateMat);
          plate.position.set(0, 0.62 * sz, 0.19 * sz);
          g.add(plate);
          // Plate ridge
          const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.08 * sz, 0.58 * sz, 0.06 * sz), new THREE.MeshPhongMaterial({ color: 0x660000, shininess: 60 }));
          ridge.position.set(0, 0.62 * sz, 0.31 * sz);
          g.add(ridge);
          [-1, 1].forEach(s => {
            const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.20 * sz, 8, 6), plateMat);
            pauldron.position.set((s as number) * 0.42 * sz, 0.92 * sz, 0);
            g.add(pauldron);
            // Spike on pauldron
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04 * sz, 0.18 * sz, 5), dm);
            spike.position.set((s as number) * 0.42 * sz, 1.11 * sz, 0);
            g.add(spike);
          });
        }

        // Legion: extra bulk / mass
        if (type === 'l') {
          const massExtra = new THREE.Mesh(new THREE.SphereGeometry(0.32 * sz, 9, 7), bm);
          massExtra.position.y = 0.72 * sz;
          g.add(massExtra);
        }

        // Fire demon: lava cracks on body
        if (type === 'f') {
          for (let i = 0; i < 4; i++) {
            const a = i / 4 * Math.PI * 2;
            const crack = new THREE.Mesh(new THREE.BoxGeometry(0.04 * sz, 0.55 * sz, 0.04 * sz), new THREE.MeshBasicMaterial({ color: 0xff4400 }));
            crack.position.set(Math.cos(a) * 0.27 * sz, 0.49 * sz, Math.sin(a) * 0.27 * sz);
            crack.rotation.y = a;
            g.add(crack);
          }
        }

        const hr = 0.27 * sz * (T.boss ? 1.28 : 1);
        const headY = (0.49 + 0.98 / 2 + hr * 0.9) * sz;
        const head = new THREE.Mesh(new THREE.SphereGeometry(hr, 12, 10), bm);
        // Bosses get slightly elongated heads
        if (T.boss) head.scale.set(1.0, 1.12, 1.0);
        head.position.y = headY;
        head.castShadow = true;
        g.add(head);

        // Jaw / chin protrusion for menacing look
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.55, 8, 6), dm);
        jaw.scale.set(1.1, 0.55, 1.0);
        jaw.position.set(0, headY - hr * 0.55, hr * 0.55);
        g.add(jaw);

        g.userData.headY = headY;
        g.userData.sz = sz;

        // Eyes with glow material
        [-1, 1].forEach(s => {
          const ec = type === 'f' || type === 'z' ? 0xff6600 : type === 'd' || type === 'a' ? 0xcc00ff : type === 'l' ? 0x00ff88 : 0xff2200;
          const eyeGlow = new THREE.MeshBasicMaterial({ color: ec });
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.060 * sz, 7, 7), eyeGlow);
          eye.position.set((s as number) * hr * 0.56, headY + 0.03 * sz, hr * 0.84);
          g.add(eye);
          // Pupil slit
          const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028 * sz, 5, 5), new THREE.MeshBasicMaterial({ color: 0x000000 }));
          pupil.position.set((s as number) * hr * 0.56, headY + 0.03 * sz, hr * 0.92);
          g.add(pupil);
        });

        // Horns — sinner, demon, legion
        if (type === 's' || type === 'd' || type === 'l') {
          [-1, 1].forEach(s => {
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.065 * sz, 0.32 * sz, 6), dm);
            horn.position.set((s as number) * hr * 0.62, headY + hr * 0.75, 0);
            horn.rotation.z = (s as number) * 0.32;
            g.add(horn);
            // Horn base ring
            const hring = new THREE.Mesh(new THREE.TorusGeometry(0.055 * sz, 0.018 * sz, 4, 10), dm);
            hring.position.set((s as number) * hr * 0.62, headY + hr * 0.60, 0);
            hring.rotation.x = Math.PI / 2;
            g.add(hring);
          });
        }

        // Archdemon: crown of many curved horns
        if (type === 'a') {
          for (let i = 0; i < 7; i++) {
            const a = i / 6 * Math.PI;
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.075 * sz, (0.25 + Math.sin(a) * 0.16) * sz, 5), dm);
            horn.position.set(Math.cos(a) * hr * 0.88 - hr * 0.44, headY + hr * 0.78, Math.sin(a) * hr * 0.32);
            horn.rotation.z = (Math.cos(a) * 0.4);
            g.add(horn);
          }
        }

        // Legion: multiple secondary skull-faces
        if (type === 'l') {
          for (let i = 0; i < 3; i++) {
            const a = i / 3 * Math.PI * 2 + Math.PI;
            const extra = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.58, 8, 7), bm);
            extra.position.set(Math.cos(a) * hr * 0.98, headY + hr * 0.42, Math.sin(a) * hr * 0.68);
            g.add(extra);
            // Mini glowing eyes on each face
            const mec = 0x00ff88;
            [-1, 1].forEach(s => {
              const me = new THREE.Mesh(new THREE.SphereGeometry(0.030 * sz, 5, 5), new THREE.MeshBasicMaterial({ color: mec }));
              me.position.set(Math.cos(a) * hr * 0.98 + (s as number) * 0.045 * sz, headY + hr * 0.44, Math.sin(a) * hr * 0.68 + 0.06 * sz);
              g.add(me);
            });
            // Mini horns on secondary faces
            [-1, 1].forEach(s => {
              const mh = new THREE.Mesh(new THREE.ConeGeometry(0.030 * sz, 0.10 * sz, 4), dm);
              mh.position.set(Math.cos(a) * hr * 0.98 + (s as number) * 0.055 * sz, headY + hr * 0.42 + hr * 0.55, Math.sin(a) * hr * 0.68);
              mh.rotation.z = (s as number) * 0.28;
              g.add(mh);
            });
          }
        }

        // Satan: crown of thorns + glowing trident + tail
        if (type === 'z') {
          const satanMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 1.0, specular: 0xff8888, shininess: 40 });
          // Crown ring
          const crown = new THREE.Mesh(new THREE.TorusGeometry(hr * 0.90, 0.060 * sz, 7, 22), satanMat);
          crown.position.y = headY + hr * 0.82;
          crown.rotation.x = Math.PI / 2;
          g.add(crown);
          // Crown spikes
          for (let i = 0; i < 12; i++) {
            const a = i / 12 * Math.PI * 2;
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08 * sz, 0.55 * sz, 4), satanMat);
            horn.position.set(Math.cos(a) * hr * 0.90, headY + hr * 1.05, Math.sin(a) * hr * 0.90);
            horn.rotation.z = Math.cos(a) * 0.55;
            horn.rotation.x = -Math.sin(a) * 0.55;
            g.add(horn);
          }
          // Trident
          const tridentMat = new THREE.MeshPhongMaterial({ color: 0xcc0000, emissive: 0x660000, emissiveIntensity: 0.7, specular: 0xff4444, shininess: 50 });
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.048 * sz, 0.036 * sz, 2.2 * sz, 7), tridentMat);
          shaft.position.set(0.85 * sz, 1.45 * sz, 0.1);
          shaft.rotation.z = 0.16;
          g.add(shaft);
          [-1, 0, 1].forEach(s => {
            const prong = new THREE.Mesh(new THREE.ConeGeometry(0.045 * sz, 0.48 * sz, 4), tridentMat);
            prong.position.set(0.85 * sz + (s as number) * 0.14 * sz, 2.55 * sz, 0.1);
            g.add(prong);
          });
          // Tail with tip spike
          const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * sz, 0.02 * sz, 0.80 * sz, 5), dm);
          tail.position.set(0, 0.12 * sz, -0.45 * sz);
          tail.rotation.x = -Math.PI / 2.1;
          g.add(tail);
          const tailTip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.10 * sz), satanMat);
          tailTip.position.set(0, -0.04 * sz, -0.88 * sz);
          g.add(tailTip);
        }

        // Arms
        [-1, 1].forEach(s => {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.068 * sz, 0.060 * sz, 0.68 * sz, 8), bm);
          arm.rotation.z = (s as number) * (Math.PI / 4 + 0.18);
          arm.position.set((s as number) * 0.52 * sz, 0.74 * sz, 0);
          arm.castShadow = true;
          g.add(arm);
          // Clawed hand
          const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09 * sz, 7, 6), dm);
          hand.position.set((s as number) * 0.79 * sz, 0.46 * sz, 0);
          g.add(hand);
          // Claws
          for (let c = 0; c < 3; c++) {
            const ca = (c / 2 - 0.5) * 0.5;
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.022 * sz, 0.14 * sz, 4), dm);
            claw.position.set((s as number) * (0.79 + 0.12) * sz + Math.sin(ca) * 0.06 * sz, 0.35 * sz + Math.cos(ca) * 0.06 * sz - 0.06 * sz, 0);
            claw.rotation.z = (s as number) * (Math.PI / 2 + 0.5) + ca;
            g.add(claw);
          }
          // Fire fireballs on hands for fire types
          if (type === 'f' || type === 'z') {
            const fb = new THREE.Mesh(new THREE.SphereGeometry(0.12 * sz, 7, 7), new THREE.MeshPhongMaterial({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 1.6, shininess: 30 }));
            fb.position.set((s as number) * 0.79 * sz, 0.46 * sz, 0);
            g.add(fb);
          }
        });

        // Legs
        [-1, 1].forEach(s => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.095 * sz, 0.082 * sz, 0.58 * sz, 8), dm);
          leg.position.set((s as number) * 0.16 * sz, 0.07 * sz, 0);
          leg.castShadow = true;
          g.add(leg);
          // Foot / hoof
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14 * sz, 0.08 * sz, 0.20 * sz), dm);
          foot.position.set((s as number) * 0.16 * sz, -0.21 * sz, 0.03 * sz);
          g.add(foot);
        });

        // Tail for non-boss types
        if (type !== 'a' && type !== 'z') {
          const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.042 * sz, 0.010 * sz, 0.60 * sz, 6), dm);
          tail.position.set(0.40 * sz, 0.54 * sz, 0);
          tail.rotation.z = -Math.PI / 3;
          g.add(tail);
          // Arrowhead tail tip
          const tip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06 * sz), dm);
          tip.position.set(0.70 * sz, 0.24 * sz, 0);
          g.add(tip);
        }

        // Wings — bat-wing style with membrane ribs
        if (T.wings) {
          [-1, 1].forEach(s => {
            const wingColor = type === 'z' ? 0x880000 : type === 'a' ? 0x4a0000 : 0x330044;
            const wingMat = new THREE.MeshPhongMaterial({ color: wingColor, side: THREE.DoubleSide, transparent: true, opacity: 0.90, specular: 0x440000, shininess: 15 });
            const memMat = new THREE.MeshPhongMaterial({ color: wingColor, side: THREE.DoubleSide, transparent: true, opacity: 0.65, specular: 0x220000, shininess: 8 });
            const ribMat = new THREE.MeshPhongMaterial({ color: T.dark, specular: 0x110000, shininess: 20 });

            const wg = new THREE.Group();
            wg.name = 'wing';

            // Main arm bone of wing
            const armBone = new THREE.Mesh(new THREE.CylinderGeometry(0.030 * sz, 0.018 * sz, 0.90 * sz, 5), ribMat);
            armBone.rotation.z = (s as number) * (Math.PI / 2 + 0.20);
            armBone.position.set((s as number) * 0.45 * sz, 0.92 * sz, -0.06);
            wg.add(armBone);

            // Upper wing membrane (triangular)
            const upperWing = new THREE.Mesh(
              new THREE.ConeGeometry(0.72 * sz, 1.10 * sz, 4, 1, true),
              wingMat
            );
            upperWing.rotation.z = (s as number) * (Math.PI / 2 + 0.30);
            upperWing.rotation.y = (s as number) * 0.25;
            upperWing.position.set((s as number) * 0.42 * sz, 0.94 * sz, -0.08);
            wg.add(upperWing);

            // Lower membrane lobe
            const lowerWing = new THREE.Mesh(
              new THREE.ConeGeometry(0.38 * sz, 0.65 * sz, 4, 1, true),
              memMat
            );
            lowerWing.rotation.z = (s as number) * (Math.PI / 2 + 0.70);
            lowerWing.rotation.y = (s as number) * 0.22;
            lowerWing.position.set((s as number) * 0.42 * sz, 0.46 * sz, -0.10);
            wg.add(lowerWing);

            // Rib bones (3 finger struts)
            for (let r = 0; r < 3; r++) {
              const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * sz, 0.008 * sz, (0.55 + r * 0.14) * sz, 4), ribMat);
              const angle = (s as number) * (Math.PI / 2 + 0.18 + r * 0.22);
              rb.rotation.z = angle;
              rb.position.set((s as number) * (0.40 + r * 0.08) * sz, (0.90 - r * 0.06) * sz, -0.06);
              wg.add(rb);
            }

            g.add(wg);
          });
        }

        // Lights
        if (T.fire) {
          const fl = new THREE.PointLight(0xff4400, type === 'z' ? 3.5 : 1.4, type === 'z' ? 14 : 7);
          fl.position.y = 0.72 * sz;
          fl.name = 'fireLight';
          g.add(fl);
        }

        if (T.boss) {
          const al = new THREE.PointLight(type === 'z' ? 0xff0000 : 0x990000, type === 'z' ? 3.0 : 1.8, type === 'z' ? 14 : 9);
          al.position.y = 1.3 * sz;
          al.name = 'bossLight';
          g.add(al);
        }

        // HP bars
        const bbg = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * sz, 0.09 * sz), new THREE.MeshBasicMaterial({ color: 0x220000, depthTest: false }));
        bbg.position.y = headY + hr + 0.34 * sz;
        bbg.name = 'barBg';
        g.add(bbg);

        const bfg = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * sz, 0.09 * sz), new THREE.MeshBasicMaterial({ color: 0x44ee44, depthTest: false }));
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
        // Glowing golden orb
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), new THREE.MeshPhongMaterial({ color: 0xffee00, emissive: 0xffcc00, emissiveIntensity: 2.0, specular: 0xffffff, shininess: 80 })));
        g.add(new THREE.PointLight(0xffdd00, 3.0, 8));
        // White cross
        const cm = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const cv = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.32, 0.045), cm);
        g.add(cv);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.045), cm);
        ch.position.y = 0.09;
        g.add(ch);
        // Sparkle ring
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.018, 5, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        return g;
      }

      function makeFishMesh() {
        const g = new THREE.Group();
        const fishMat = new THREE.MeshPhongMaterial({ color: 0x55aadd, specular: 0xaaddff, shininess: 50 });
        const darkMat = new THREE.MeshPhongMaterial({ color: 0x2266aa, specular: 0x4488cc, shininess: 40 });
        // Fish body (elongated sphere)
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), fishMat);
        body.scale.set(1.55, 0.85, 0.90);
        g.add(body);
        // Tail fin
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.22, 5), darkMat);
        tail.rotation.z = Math.PI / 2;
        tail.position.x = -0.28;
        g.add(tail);
        // Dorsal fin
        const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), darkMat);
        dorsal.position.set(0.02, 0.13, 0);
        g.add(dorsal);
        // Eye
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        eye.position.set(0.13, 0.03, 0.10);
        g.add(eye);
        // Scales shimmer
        g.add(new THREE.PointLight(0x44aaff, 1.0, 3));
        return g;
      }

      function makeWineMesh() {
        const g = new THREE.Group();
        const bottleMat = new THREE.MeshPhongMaterial({ color: 0x220066, transparent: true, opacity: 0.85, specular: 0x9966ff, shininess: 70 });
        const wineMat = new THREE.MeshPhongMaterial({ color: 0x990022, emissive: 0x440000, emissiveIntensity: 0.5, specular: 0xdd0044, shininess: 50 });
        // Bottle body
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.095, 0.26, 9), bottleMat);
        g.add(bottle);
        // Bottle neck
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.062, 0.12, 7), bottleMat);
        neck.position.y = 0.19;
        g.add(neck);
        // Cork
        const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.04, 6), new THREE.MeshPhongMaterial({ color: 0xc8a060, shininess: 10 }));
        cork.position.y = 0.28;
        g.add(cork);
        // Wine inside glow
        const wineFill = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.078, 0.18, 8), wineMat);
        wineFill.position.y = -0.02;
        g.add(wineFill);
        g.add(new THREE.PointLight(0x990022, 1.2, 3));
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
        m.baseY = 1.4 + Math.random() * 1.6;
        m.position.y = m.baseY;
        return m;
      }

      // ═══════════════════════════════════════════════════════
      //  FLOATING TEXT & PARTICLES & RINGS (POOLS)
      // ═══════════════════════════════════════════════════════
      const floatTexts: { mesh: THREE.Sprite; life: number; startY: number }[] = [];
      const particles: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
      const rings: CelestialRing[] = [];
      const deathRings: { mesh: THREE.Mesh; life: number; maxLife: number; boss: boolean }[] = [];
      const winePuddles: { mesh: THREE.Mesh; life: number }[] = [];

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
        mat.dispose(); // safe: each particle uses mat.clone(), so disposing the template here does not affect existing clones
      }

      function spawnRing(x: number, y: number, z: number) {
        const r = makeCelestialRing();
        r.position.set(x, y, z);
        scene.add(r);
        rings.push(r);
      }

      function disposeMesh(obj: THREE.Object3D) {
        obj.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const mat = child.material;
            if (Array.isArray(mat)) mat.forEach(m => m.dispose());
            else mat.dispose();
          }
        });
      }

      function disposeRing(r: CelestialRing) {
        (r as unknown as THREE.Mesh).geometry.dispose();
        ((r as unknown as THREE.Mesh).material as THREE.Material).dispose();
      }

      function spawnDeathRing(x: number, z: number, boss: boolean) {
        const life = boss ? 2.8 : 1.8;
        const geo = new THREE.TorusGeometry(0.3, 0.12, 5, 22);
        const col = boss ? 0xff3300 : 0xdd4400;
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = Math.PI / 2;
        m.position.set(x, 0.06, z);
        scene.add(m);
        deathRings.push({ mesh: m, life: 0, maxLife: life, boss });
      }

      function spawnWinePuddle(x: number, z: number) {
        const geo = new THREE.CircleGeometry(2.2, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0x880022, transparent: true, opacity: 0.65 });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.07, z);
        scene.add(m);
        winePuddles.push({ mesh: m, life: 0 });
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
      const player = {
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
        // Arcade feel
        attackTimer: 0,
        attackHand: 1,
        landSquash: 0,
        coyoteTime: 0,
        prevOnGround: true,
        idlePhase: 0,
        resurrectScale: 1,
        speedBoost: 0,
        graceBuff: 0,
      };

      const enemies: Enemy[] = [];
      const projectiles: Projectile[] = [];
      const pickups: Pickup[] = [];
      const spawnTimers: ReturnType<typeof setTimeout>[] = [];

      const camPos = new THREE.Vector3(0, 8, 10);
      const camShakeVec = new THREE.Vector3();
      // Reusable scratch vectors — allocated once to avoid per-frame GC pressure
      const _vLook = new THREE.Vector3();
      const _vDesired = new THREE.Vector3();
      const _vHoming = new THREE.Vector3();

      // ═══════════════════════════════════════════════════════
      //  ABILITIES
      // ═══════════════════════════════════════════════════════
      function activateFlood() {
        if (player.cds[4] > 0) return;
        gameRef.current.waterOn = true;
        gameRef.current.waterTimer = 9;
        gameRef.current.floodPushTimer = 2.0;
        player.cds[4] = 15;
        waterMesh.visible = true;
        skyMat.uniforms.topColor.value.set(0x1a3a6a);
        skyMat.uniforms.bottomColor.value.set(0x2255aa);
        scene.fog!.color.set(0x2255aa);
        enemies.forEach(e => { if (!e.ally) e.speed *= 0.4; });
        // Flood camera shake
        gameRef.current.camShake = Math.max(gameRef.current.camShake, 0.45);
        gameRef.current.targetFov = BASE_FOV + 12;
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
        player.parryT = 0.8;  // wider parry window
        player.cds[3] = 7;
        player.cheekOn = true;
        player.cheekT = 4;
        Audio.parry();
        // Visual ring pulse on parry
        spawnParticles(player.x, 0.3, player.z, 0xffffff, 12);
        gameRef.current.hitFlashVal = Math.min(1, gameRef.current.hitFlashVal + 0.15);

        // Try to convert nearby non-boss enemies (30% chance each)
        enemies.forEach(e => {
          const dx = player.x - (e.mesh as THREE.Group).position.x;
          const dz = player.z - (e.mesh as THREE.Group).position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 10 && !e.ally && !ENEMY_TYPES[e.type].boss) {
            if (Math.random() < 0.30) {
              e.ally = true;
              e.allyTimer = 18;
              spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y, (e.mesh as THREE.Group).position.z, '😇 ОБРАЩЁН!', '#c8a84b');
            } else {
              e.wrath = 3;
              spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y, (e.mesh as THREE.Group).position.z, '😡', '#ff4444');
            }
          }
        });
      }

      function parryCounter() {
        enemies.forEach(e => {
          if (e.ally) return;
          const ep = (e.mesh as THREE.Group).position;
          const dx = player.x - ep.x;
          const dz = player.z - ep.z;
          if (Math.sqrt(dx * dx + dz * dz) < 6) {
            e.hp -= 4;
            e.hitFlash = 1.0;
            spawnFloatText(ep.x, ep.y + 1, ep.z, '⚡-4', '#ffee44');
            spawnParticles(ep.x, ep.y, ep.z, 0xffdd00, 8);
          }
        });
        // Big parry shake + FOV pulse
        gameRef.current.camShake = Math.max(gameRef.current.camShake, 0.55);
        gameRef.current.targetFov = BASE_FOV + 14;
        Audio.crit();
      }

      function activateBread() {
        if (player.cds[5] > 0) return;
        if (gameRef.current.wave < 5) {
          setLockedMsg('🍞 Хлеб доступен с Волны 5');
          setTimeout(() => setLockedMsg(''), 2000);
          return;
        }
        player.cds[5] = 8;

        // Spawn 5 bread pickups
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2 + Math.random();
          const r = 2 + Math.random() * 4;
          const m = makeBreadMesh();
          m.position.set(player.x + Math.cos(a) * r, 0.22, player.z + Math.sin(a) * r);
          scene.add(m);
          pickups.push({ mesh: m, hp: 35, life: 0, maxLife: 12, type: 'bread' });
        }
        Audio.bread();
      }

      function activateGrace() {
        if (player.cds[6] > 0) return;
        if (gameRef.current.wave < 10) {
          setLockedMsg('☀ Благодать доступна с Волны 10');
          setTimeout(() => setLockedMsg(''), 2000);
          return;
        }
        player.cds[6] = 20;  // reduced from 25

        enemies.forEach(e => {
          if (e.ally) return;
          e.hp -= Math.ceil(e.maxHp * 0.65);
          e.hitFlash = 1.0;
          {
            const p = (e.mesh as THREE.Group).position;
            spawnParticles(p.x, p.y + 0.8, p.z, 0xffffff, 12);
          }
          spawnFloatText((e.mesh as THREE.Group).position.x, (e.mesh as THREE.Group).position.y + 1, (e.mesh as THREE.Group).position.z, '☀ БЛАГОДАТЬ', '#ffffff');
        });

        // Divine invincibility + full screen glow
        player.graceBuff = 2.5;
        player.iframes = 2.5;
        player.hp = Math.min(player.maxHp, player.hp + 30);
        // Bright white divine flash (overrides red hit flash)
        gameRef.current.hitFlashVal = 1.2;
        gameRef.current.camShake = Math.max(gameRef.current.camShake, 0.55);
        gameRef.current.targetFov = BASE_FOV + 20;
        spawnFloatText(player.x, 2.5, player.z, '☀ НЕПОБЕДИМ!', '#ffff88');
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
        // Wave 20: Satan spawns exclusively via spawnWave boss-slot; regular slots use 'a'
        if (w === 20) return 'a';
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
          gameRef.current.pendingSpawnCount++;
          spawnTimers.push(setTimeout(() => {
            gameRef.current.pendingSpawnCount = Math.max(0, gameRef.current.pendingSpawnCount - 1);
            if (gameRef.current.status === 'menu' || gameRef.current.status === 'gameover') return;
            const t = pickType(gameRef.current.wave);
            const a = Math.random() * Math.PI * 2;
            const d = 18 + Math.random() * 12;
            spawnEnemy(t, Math.cos(a) * d, Math.sin(a) * d, gameRef.current.wave);
          }, i * 360 + 180));
        }

        if (boss && gameRef.current.wave < 20) {
          gameRef.current.pendingSpawnCount++;
          spawnTimers.push(setTimeout(() => {
            gameRef.current.pendingSpawnCount = Math.max(0, gameRef.current.pendingSpawnCount - 1);
            if (gameRef.current.status === 'menu' || gameRef.current.status === 'gameover') return;
            spawnEnemy('a', 15, 15, gameRef.current.wave);
          }, n * 360 + 600));
        }

        if (gameRef.current.wave === 20) {
          gameRef.current.pendingSpawnCount++;
          setSatanWarning(true);
          setTimeout(() => setSatanWarning(false), 4000);
          spawnTimers.push(setTimeout(() => {
            gameRef.current.pendingSpawnCount = Math.max(0, gameRef.current.pendingSpawnCount - 1);
            if (gameRef.current.status === 'menu' || gameRef.current.status === 'gameover') return;
            spawnEnemy('z', 0, 20, gameRef.current.wave);
          }, n * 360 + 1000));
        }

        // Replenish celestial rings
        if (rings.length < 2) {
          const a = Math.random() * Math.PI * 2;
          const d = 20 + Math.random() * 50;
          spawnRing(Math.cos(a) * d, 1.4 + Math.random() * 1.6, Math.sin(a) * d);
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
          speed: T.spd * (1 + wave * 0.035) * (gameRef.current.waterOn ? 0.4 : 1),
          iframes: 0,
          drunk: 0,
          drunkExplode: false,
          wrath: 0,
          stepCd: 0,
          wingPhase: Math.random() * Math.PI * 2,
          ally: false,
          allyTimer: 0,
          legionSplit: type === 'l',
          hitFlash: 0,
          slowed: 0,
          knockX: 0,
          knockZ: 0,
        });
      }

      function fireProjectile(type: string, x: number, y: number, z: number, yaw: number) {
        const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        let mesh;
        if (type === 'smite') mesh = makeSmiteMesh();
        else if (type === 'fish') mesh = makeFishMesh();
        else mesh = makeWineMesh();

        mesh.position.set(x + dir.x * 0.9, y, z + dir.z * 0.9);

        // Stretch projectile in direction of travel for speed feel
        const stretchAxis = type === 'fish' ? 'x' : 'y';
        mesh.scale[stretchAxis] = type === 'smite' ? 1.5 : 1.3;

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

        // Arcade feel: FOV kick + attack animation
        const fovKick = type === 'smite' ? 9 : type === 'fish' ? 6 : 5;
        gameRef.current.targetFov = BASE_FOV + fovKick;
        player.attackTimer = 0.28;
        player.attackHand = type === 'fish' ? -1 : 1;

        // Tiny camera kick backwards for smite
        if (type === 'smite') gameRef.current.camShake = Math.max(gameRef.current.camShake, 0.06);

        return isCrit;
      }

      // ═══════════════════════════════════════════════════════
      //  GAME INIT
      // ═══════════════════════════════════════════════════════
      function initGame() {
        // Cancel pending spawn timers from previous wave/game
        spawnTimers.forEach(id => clearTimeout(id));
        spawnTimers.length = 0;

        if (player.mesh) { disposeMesh(player.mesh); scene.remove(player.mesh); }
        player.mesh = makeJesus();
        player.mesh.position.set(0, 0, 0);
        scene.add(player.mesh);

        // Clear entities
        enemies.forEach(e => { disposeMesh(e.mesh); scene.remove(e.mesh); });
        enemies.length = 0;
        projectiles.forEach(p => { disposeMesh(p.mesh); scene.remove(p.mesh); });
        projectiles.length = 0;
        pickups.forEach(p => { disposeMesh(p.mesh); scene.remove(p.mesh); });
        pickups.length = 0;
        rings.forEach(r => { disposeRing(r); scene.remove(r); });
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
        gameRef.current.pendingSpawnCount = 0;
        gameRef.current.bibleQuoteText = '';
        gameRef.current.bibleQuoteFade = 0;
        waterMesh.visible = false;
        skyMat.uniforms.topColor.value.set(0x3a7bd5);
        skyMat.uniforms.bottomColor.value.set(0x8fbbe0);
        scene.fog!.color.set(0x8fbbe0);

        player.hp = 100;
        player.maxHp = 100;
        player.mana = MANA_MAX;
        player.dead = false;
        player.iframes = 0;
        player.livesLeft = MAX_RESURRECTS;
        player.cds = [0, 0, 0, 0, 0, 0, 0, 30]; // slot 7 = passive shield, starts at 30s charge
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
        player.attackTimer = 0;
        player.attackHand = 1;
        player.landSquash = 0;
        player.coyoteTime = 0;
        player.prevOnGround = true;
        player.idlePhase = 0;
        player.resurrectScale = 1;
        player.speedBoost = 0;
        player.graceBuff = 0;

        gameRef.current.camYaw = 0;
        gameRef.current.camPitch = -0.22;

        // Spawn initial celestial rings
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 20 + Math.random() * 50;
          spawnRing(Math.cos(a) * d, 1.4 + Math.random() * 1.6, Math.sin(a) * d);
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
        // Decay buffs
        if (player.speedBoost > 0) player.speedBoost = Math.max(0, player.speedBoost - dt);
        if (player.graceBuff > 0) {
          player.graceBuff = Math.max(0, player.graceBuff - dt);
          // Keep invincibility active while grace buff lasts
          player.iframes = Math.max(player.iframes, player.graceBuff > 0 ? 0.1 : 0);
        }
        const speedMult = player.speedBoost > 0 ? 1.6 : 1.0;
        const spd = isFlying ? 9.5 : 5.8 * (gameRef.current.waterOn ? 1.3 : 1) * speedMult;

        let mx = 0;
        let mz = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += Math.sin(gameRef.current.camYaw); mz += Math.cos(gameRef.current.camYaw); }
        if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= Math.sin(gameRef.current.camYaw); mz -= Math.cos(gameRef.current.camYaw); }
        if (keys.has('KeyA')) { mx -= Math.cos(gameRef.current.camYaw); mz += Math.sin(gameRef.current.camYaw); }
        if (keys.has('KeyD')) { mx += Math.cos(gameRef.current.camYaw); mz -= Math.sin(gameRef.current.camYaw); }
        
        // Mobile joystick input (adds to keyboard input)
        const mobMove = mobileInputRef.current;
        if (mobMove.moveX !== 0 || mobMove.moveZ !== 0) {
          // Convert joystick input to world-relative movement based on camera yaw
          mx += Math.sin(gameRef.current.camYaw) * mobMove.moveZ + Math.cos(gameRef.current.camYaw) * mobMove.moveX;
          mz += Math.cos(gameRef.current.camYaw) * mobMove.moveZ - Math.sin(gameRef.current.camYaw) * mobMove.moveX;
        }

        const ml = Math.sqrt(mx * mx + mz * mz);
        const isMoving = ml > 0.01;
        if (isMoving) { mx /= ml; mz /= ml; }

        const airCtrl = (!isFlying && !player.onGround && player.coyoteTime <= 0) ? 0.78 : 1.0;
        player.x += mx * spd * airCtrl * dt;
        player.z += mz * spd * airCtrl * dt;
        const B = 88;
        player.x = Math.max(-B, Math.min(B, player.x));
        player.z = Math.max(-B, Math.min(B, player.z));

        // Track previous ground state before physics update
        player.prevOnGround = player.onGround;

        // Vertical physics
        if (isFlying) {
          player.y += (FLY_HEIGHT - player.y) * 0.08;
          player.mana -= dt;
          const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobileInputRef.current.flightHeld;
          if (player.mana <= 0 || !shiftHeld) {
            stopFlight();
            if (player.mana <= 0) player.mana = 0;
          }
        } else {
          const idleRegenMult = isMoving ? 1.0 : 1.55;
          if (player.mana < MANA_MAX) player.mana = Math.min(MANA_MAX, player.mana + MANA_REGEN * idleRegenMult * dt);
          player.velY -= 26 * dt;
          player.y += player.velY * dt;
          if (player.y <= 0) {
            player.y = 0;
            // Landing squash: bigger squash the harder the fall
            if (!player.prevOnGround && player.velY < -2) {
              player.landSquash = Math.min(1.0, Math.abs(player.velY) * 0.055);
              gameRef.current.camShake = Math.max(gameRef.current.camShake, player.landSquash * 0.22);
            }
            player.velY = 0;
            player.onGround = true;
            player.coyoteTime = COYOTE_SEC;
          } else {
            player.onGround = false;
            if (player.coyoteTime > 0) player.coyoteTime -= dt;
          }
        }

        player.mesh!.position.set(player.x, player.y, player.z);

        // Face camera direction
        player.yaw = gameRef.current.camYaw;
        player.mesh!.rotation.y = player.yaw;

        // Landing squash decay + apply
        if (player.landSquash > 0) {
          player.landSquash = Math.max(0, player.landSquash - dt * 6);
          const sy = 1 - player.landSquash * 0.45;
          const sx = 1 + player.landSquash * 0.22;
          player.mesh!.scale.set(sx * player.resurrectScale, sy * player.resurrectScale, sx * player.resurrectScale);
        } else {
          if (player.resurrectScale < 1) {
            // Pop-in animation: overshoot to 1.12 then settle at 1
            player.resurrectScale = Math.min(1, player.resurrectScale + dt * 3.5);
            const popScale = player.resurrectScale < 0.85
              ? player.resurrectScale
              : 1 + Math.sin((player.resurrectScale - 0.85) / 0.15 * Math.PI) * 0.12;
            player.mesh!.scale.setScalar(popScale);
          } else {
            player.mesh!.scale.set(1, 1, 1);
          }
        }

        // Walk / fly animation
        if (isMoving && !isFlying) player.walkPhase += dt * 8;
        if (!isMoving && !isFlying) player.idlePhase += dt * 1.8;

        const ag = player.mesh!.getObjectByName('armGroup') as THREE.Group;
        const lg = player.mesh!.getObjectByName('legGroup') as THREE.Group;

        if (isFlying) {
          if (ag) {
            const a1 = ag.getObjectByName('arm1') as THREE.Mesh;
            const aN = ag.getObjectByName('arm-1') as THREE.Mesh;
            if (a1) a1.rotation.z = Math.PI / 2;
            if (aN) aN.rotation.z = -Math.PI / 2;
          }
        } else if (player.attackTimer > 0) {
          // Attack arm punch: shoot arm forward+down
          player.attackTimer -= dt;
          const t = player.attackTimer / 0.28; // 1 → 0
          const punchAngle = (1 - t) * Math.PI * 0.55; // swings forward then back
          if (ag) {
            const fireArm = ag.getObjectByName(`arm${player.attackHand}`) as THREE.Mesh;
            const idleArm = ag.getObjectByName(`arm${-player.attackHand}`) as THREE.Mesh;
            if (fireArm) {
              fireArm.rotation.x = Math.sin(punchAngle * Math.PI) * 1.2;
              fireArm.rotation.z = player.attackHand * (Math.PI / 4 + 0.12) - punchAngle * 0.3;
            }
            if (idleArm) {
              // Counter swing for balance
              idleArm.rotation.x = -Math.sin(punchAngle * Math.PI) * 0.35;
            }
          }
        } else if (ag && isMoving) {
          const a1 = ag.getObjectByName('arm1') as THREE.Mesh;
          const aN = ag.getObjectByName('arm-1') as THREE.Mesh;
          if (a1) { a1.rotation.x = Math.sin(player.walkPhase) * 0.4; a1.rotation.z = Math.PI / 4 + 0.12; }
          if (aN) { aN.rotation.x = -Math.sin(player.walkPhase) * 0.4; aN.rotation.z = -(Math.PI / 4 + 0.12); }
        } else if (ag && !isMoving) {
          // Idle: gentle arm sway
          const a1 = ag.getObjectByName('arm1') as THREE.Mesh;
          const aN = ag.getObjectByName('arm-1') as THREE.Mesh;
          const idleSway = Math.sin(player.idlePhase) * 0.06;
          if (a1) { a1.rotation.x = idleSway; a1.rotation.z = Math.PI / 4 + 0.12; }
          if (aN) { aN.rotation.x = -idleSway; aN.rotation.z = -(Math.PI / 4 + 0.12); }
        }

        if (lg && isMoving && !isFlying) {
          const l1 = lg.getObjectByName('leg1') as THREE.Mesh;
          const lN = lg.getObjectByName('leg-1') as THREE.Mesh;
          if (l1) l1.rotation.x = Math.sin(player.walkPhase) * 0.35;
          if (lN) lN.rotation.x = -Math.sin(player.walkPhase) * 0.35;
        } else if (lg && !isMoving) {
          const l1 = lg.getObjectByName('leg1') as THREE.Mesh;
          const lN = lg.getObjectByName('leg-1') as THREE.Mesh;
          if (l1) l1.rotation.x = 0;
          if (lN) lN.rotation.x = 0;
        }

        const fc = player.mesh!.getObjectByName('flyCross') as THREE.Group;
        if (fc) {
          fc.visible = isFlying;
          if (isFlying) {
            // Rotate gem ring
            const cr = fc.getObjectByName('crossRing') as THREE.Group;
            if (cr) cr.rotation.y += dt * 1.8;
            // Pulse cross light
            const cl = fc.getObjectByName('crossLight') as THREE.PointLight;
            if (cl) cl.intensity = 3.5 + Math.sin(gameRef.current.gtime * 5) * 1.2;
            // Pulse wing opacity
            fc.children.forEach(c => {
              if (c.name === 'crossWing') (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity !== undefined
                && (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(gameRef.current.gtime * 3) * 0.08);
            });
            // Slow gentle bob of entire cross
            fc.position.y = Math.sin(gameRef.current.gtime * 2.2) * 0.08;
            // Flight particle trail — golden light every ~0.08s
            const trailTick = Math.floor(gameRef.current.gtime * 12);
            const prevTick = Math.floor((gameRef.current.gtime - dt) * 12);
            if (trailTick !== prevTick) {
              spawnParticles(player.x + (Math.random() - 0.5) * 0.4, player.y + 1.0, player.z + (Math.random() - 0.5) * 0.4, 0xffd700, 2);
            }
          }
        }

        // Halo animation
        const halo = player.mesh!.getObjectByName('halo') as THREE.Mesh;
        if (halo) {
          halo.rotation.y += dt * 2.2;
          halo.position.y = 1.95 + Math.sin(gameRef.current.gtime * 3) * 0.04;
        }
        const hl = player.mesh!.getObjectByName('haloLight') as THREE.PointLight;
        if (hl) {
          const baseIntensity = player.graceBuff > 0 ? 8.0 + Math.sin(gameRef.current.gtime * 12) * 2.5
            : isFlying ? 3.5 : player.cheekOn ? 2.8 : player.shieldOn ? 3.5 : 1.0;
          hl.intensity = baseIntensity;
          // Grace: pulse gold → white
          if (player.graceBuff > 0) {
            hl.color.setHex(Math.sin(gameRef.current.gtime * 8) > 0 ? 0xffffff : 0xffd700);
          } else {
            hl.color.setHex(0xffd700);
          }
        }

        // Shield pulse
        const sh = player.mesh!.getObjectByName('shield') as THREE.Mesh;
        if (sh) {
          (sh.material as THREE.MeshLambertMaterial).opacity = player.shieldOn ? 0.24 + Math.sin(gameRef.current.gtime * 6) * 0.06 : 0;
          sh.rotation.y += dt * 3;
        }

        // Cooldowns (all slots tick uniformly; slot 7 drives the passive auto-shield)
        for (let ci = 0; ci < player.cds.length; ci++) {
          player.cds[ci] = Math.max(0, player.cds[ci] - dt);
        }
        // Passive auto-shield: every 30s grant a 1-hit shield when cds[7] reaches 0
        if (player.cds[7] <= 0 && !player.dead && !player.shieldOn) {
          player.shieldOn = true;
          player.shieldT = 9999; // consumed on first hit, not time-expiry
          player.cds[7] = 30;
          spawnFloatText(player.x, 2, player.z, '✞ ЩИТ', '#aaddff');
          Audio.resurrect();
        }
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
          gameRef.current.floodPushTimer -= dt;
          if (gameRef.current.floodPushTimer <= 0) {
            gameRef.current.floodPushTimer = 2.0;
            enemies.forEach(e => {
              if (e.ally) return;
              const ep2 = (e.mesh as THREE.Group).position;
              const fdx = ep2.x - player.x;
              const fdz = ep2.z - player.z;
              const fdist = Math.sqrt(fdx * fdx + fdz * fdz) + 0.01;
              const pushStr = Math.max(0, 14 - fdist) * 0.35 + 2.5;
              e.knockX = (fdx / fdist) * pushStr;
              e.knockZ = (fdz / fdist) * pushStr;
              spawnParticles(ep2.x, ep2.y + 0.5, ep2.z, 0x4499ee, 3);
            });
            spawnFloatText(player.x, 2.5, player.z, '🌊 РАЗЛИВ!', '#4499ff');
          }
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
            disposeMesh(pk.mesh);
            scene.remove(pk.mesh);
            player.hp = Math.min(player.maxHp, player.hp + pk.hp);
            // Bread gives speed boost
            if (pk.type === 'bread') {
              player.speedBoost = 4.0;
              spawnFloatText(player.x, 1.8, player.z, '⚡ БЫСТРО!', '#ffee44');
              spawnParticles(player.x, 1, player.z, 0xffdd00, 6);
            }
            pickups.splice(i, 1);
          } else if (pk.life >= pk.maxLife) {
            disposeMesh(pk.mesh);
            scene.remove(pk.mesh);
            pickups.splice(i, 1);
          }
        }

        // Celestial rings
        for (let i = rings.length - 1; i >= 0; i--) {
          const r = rings[i];
          r.rotation.x += r.rotSpeed.x * dt;
          r.rotation.y += r.rotSpeed.y * dt;
          r.rotation.z += r.rotSpeed.z * dt;
          r.position.y = r.baseY + Math.sin(gameRef.current.gtime * 0.7 + r.bobPhase) * 0.4;
          const dx = player.x - r.position.x;
          const dy = player.y - r.position.y;
          const dz = player.z - r.position.z;
          if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 2.5) {
            disposeRing(r);
            scene.remove(r);
            rings.splice(i, 1);
            player.mana = Math.min(MANA_MAX, player.mana + 1.5);
            Audio.ring();
          }
        }

        // Replenish rings — handled once per frame in animate, not here
        if (enemies.length === 0 && gameRef.current.pendingSpawnCount === 0) {
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
          const hitRange = 1.15 * ENEMY_TYPES[e.type].sz * (player.flying && player.y > 2.5 ? 0 : 1);

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
              // Shield absorbs exactly one hit then breaks
              player.shieldOn = false;
              player.shieldT = 0;
              gameRef.current.camShake = Math.max(gameRef.current.camShake, 0.18);
            } else if (player.iframes <= 0) {
              const dmg = ENEMY_TYPES[e.type].dmg;
              player.hp -= dmg;
              player.iframes = 1.4;
              e.stepCd = 1;
              spawnFloatText(player.x, 0, player.z, `-${dmg}`, '#ff2222');
              spawnParticles(player.x, 1, player.z, 0xff0000, 5);
              Audio.hit();
              // Arcade: screen shake + red vignette + camera yank
              gameRef.current.camShake = Math.max(gameRef.current.camShake, 0.38 + ENEMY_TYPES[e.type].sz * 0.14);
              gameRef.current.hitFlashVal = Math.min(1, gameRef.current.hitFlashVal + 0.75);
              gameRef.current.targetFov = BASE_FOV + 10;
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

          // Hit flash: traverse body parts and pulse emissive (works for both Lambert + Phong)
          if (e.hitFlash > 0) {
            e.hitFlash = Math.max(0, e.hitFlash - dt * 9);
            const flashIntensity = e.hitFlash * 3.5;
            em.traverse(child => {
              if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhongMaterial | THREE.MeshLambertMaterial;
                if (mat && 'emissive' in mat) {
                  mat.emissive.setHex(0xffffff);
                  mat.emissiveIntensity = flashIntensity;
                }
              }
            });
          }

          // Slowed tint: blue-ish if slowed
          if (e.slowed > 0) {
            e.slowed = Math.max(0, e.slowed - dt);
            // Restore speed once slow expires
            if (e.slowed <= 0) {
              e.speed = ENEMY_TYPES[e.type].spd * (1 + gameRef.current.wave * 0.035) * (gameRef.current.waterOn ? 0.4 : 1);
            }
          }

          const ep = em.position;

          // Knockback: apply decaying knockback velocity
          if (e.knockX !== 0 || e.knockZ !== 0) {
            ep.x += e.knockX * dt;
            ep.z += e.knockZ * dt;
            e.knockX *= (1 - 8 * dt);
            e.knockZ *= (1 - 8 * dt);
            if (Math.abs(e.knockX) < 0.05) e.knockX = 0;
            if (Math.abs(e.knockZ) < 0.05) e.knockZ = 0;
          }

          // Fire enemies take extra damage in flood (holy water)
          if (gameRef.current.waterOn && ENEMY_TYPES[e.type].fire && !e.ally) {
            e.hp -= dt * 1.5;
            if (Math.random() < dt * 3) spawnParticles(ep.x, ep.y + 0.5, ep.z, 0x4488ff, 2);
          }

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
            const nearEnemy = nearE as Enemy | null;
            if (nearEnemy && nd > 0.1) {
              const adx = nearEnemy.mesh.position.x - ep.x;
              const adz = nearEnemy.mesh.position.z - ep.z;
              const ad = Math.sqrt(adx * adx + adz * adz);
              ep.x += (adx / ad) * e.speed * dt;
              ep.z += (adz / ad) * e.speed * dt;
            }
            if (nearEnemy && nd < 1.5 && e.stepCd <= 0) {
              nearEnemy.hp -= 2;
              e.stepCd = 1;
            }
            if (e.allyTimer <= 0 || e.hp <= 0) {
              spawnParticles(ep.x, ep.y + 0.8, ep.z, 0x88ff88, 4);
              disposeMesh(em);
              scene.remove(em);
              enemies.splice(i, 1);
              continue;
            }
          } else {
            if (e.drunk > 0) {
              e.drunk -= dt;
              if (e.drunk <= 0) e.drunkExplode = false;
              ep.x += Math.cos(gameRef.current.gtime * 3 + i) * e.speed * dt * 0.4;
              ep.z += Math.sin(gameRef.current.gtime * 2.2 + i) * e.speed * dt * 0.4;
            } else if (e.wrath > 0) {
              e.wrath -= dt;
              if (jdist > 0.1) {
                ep.x += (jdx / jdist) * e.speed * dt * 2.0;
                ep.z += (jdz / jdist) * e.speed * dt * 2.0;
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
                const sx = ep.x + Math.cos(a) * d;
                const sz = ep.z + Math.sin(a) * d;
                const spawnWave = Math.max(1, gameRef.current.wave - 2);
                gameRef.current.pendingSpawnCount++;
                spawnTimers.push(setTimeout(() => {
                  gameRef.current.pendingSpawnCount = Math.max(0, gameRef.current.pendingSpawnCount - 1);
                  if (gameRef.current.status === 'menu' || gameRef.current.status === 'gameover') return;
                  spawnEnemy('s', sx, sz, spawnWave);
                }, 50));
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

            // Event log entry
            const killMsg = isBoss
              ? `☩ ${ENEMY_TYPES[e.type].name} повержен! +${reward}`
              : `${ENEMY_TYPES[e.type].name} +${reward}`;
            eventQueueRef.current = [killMsg, ...eventQueueRef.current].slice(0, 6);

            // Death ring on ground
            spawnDeathRing(ep.x, ep.z, isBoss);

            if (isBoss) {
              Audio.resurrect();
              // Boss death: big screen shake + FOV punch
              gameRef.current.camShake = Math.max(gameRef.current.camShake, 0.9);
              gameRef.current.targetFov = BASE_FOV + 18;
              spawnParticles(ep.x, ep.y + 1, ep.z, 0xff4400, 20);
              // Extra rings for boss
              spawnDeathRing(ep.x + 1.5, ep.z, true);
              spawnDeathRing(ep.x, ep.z + 1.5, true);
            } else {
              // Normal kill: micro shake
              gameRef.current.camShake = Math.max(gameRef.current.camShake, 0.04);
            }

            if (gameRef.current.score > gameRef.current.hiScore) {
              gameRef.current.hiScore = gameRef.current.score;
              localStorage.setItem('jw_hi', gameRef.current.hiScore.toString());
            }

            disposeMesh(em);
            scene.remove(em);
            enemies.splice(i, 1);
            continue;
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
            const nearEnemy = ne as Enemy | null;
            if (nearEnemy && nd < 20) {
              // Reuse scratch vector — avoids 2 allocations per physics step
              _vHoming.set(nearEnemy.mesh.position.x, nearEnemy.mesh.position.y + 0.8, nearEnemy.mesh.position.z)
                .sub(p.mesh.position).normalize();
              p.dir.x = THREE.MathUtils.lerp(p.dir.x, _vHoming.x, dt * 4);
              p.dir.z = THREE.MathUtils.lerp(p.dir.z, _vHoming.z, dt * 4);
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

          // Projectile trails
          if (p.type === 'smite' && Math.random() < dt * 22) {
            const trailGeo = new THREE.SphereGeometry(0.065 + Math.random() * 0.04, 4, 3);
            const trailMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.78 });
            const trail = new THREE.Mesh(trailGeo, trailMat);
            trail.position.set(p.mesh.position.x + (Math.random() - 0.5) * 0.15, p.mesh.position.y + (Math.random() - 0.5) * 0.15, p.mesh.position.z + (Math.random() - 0.5) * 0.15);
            scene.add(trail);
            particles.push({ mesh: trail, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2 + 0.3, (Math.random() - 0.5) * 1.5), life: 0 });
          }
          if (p.type === 'fish' && Math.random() < dt * 16) {
            const trailGeo = new THREE.SphereGeometry(0.05 + Math.random() * 0.03, 4, 3);
            const trailMat = new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.65 });
            const trail = new THREE.Mesh(trailGeo, trailMat);
            trail.position.set(p.mesh.position.x + (Math.random() - 0.5) * 0.1, p.mesh.position.y + (Math.random() - 0.5) * 0.1, p.mesh.position.z + (Math.random() - 0.5) * 0.1);
            scene.add(trail);
            particles.push({ mesh: trail, v: new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8), life: 0.3 });
          }

          if (p.life > p.maxLife) {
            disposeMesh(p.mesh);
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
            continue;
          }

          let hit = false;
          for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (e.ally) continue;
            const ep2 = (e.mesh as THREE.Group).position;
            const hdx = p.mesh.position.x - ep2.x;
            const hdz = p.mesh.position.z - ep2.z;
            if (Math.sqrt(hdx * hdx + hdz * hdz) < 1.15 * ENEMY_TYPES[e.type].sz) {
              if (p.type === 'wine') {
                // Primary target: drunk
                e.drunk = 5;
                e.drunkExplode = true;
                e.hitFlash = 0.7;
                spawnFloatText(ep2.x, ep2.y, ep2.z, '🍷 ПЬЯН!', '#ffaa44');
                // AoE: nearby enemies also get drunk (wine splash)
                const winePos = p.mesh.position.clone();
                enemies.forEach(en => {
                  if (en === e || en.ally) return;
                  if (winePos.distanceTo((en.mesh as THREE.Group).position) < 5) {
                    if (Math.random() < 0.55) {
                      en.drunk = 3;
                      en.drunkExplode = true;
                      en.hitFlash = 0.5;
                      spawnFloatText((en.mesh as THREE.Group).position.x, (en.mesh as THREE.Group).position.y + 0.8, (en.mesh as THREE.Group).position.z, '🍷', '#ffaa44');
                    }
                  }
                });
                spawnParticles(winePos.x, winePos.y, winePos.z, 0xaa2255, 14);
                spawnWinePuddle(winePos.x, winePos.z);
              } else {
                const base = p.type === 'smite' ? 2 : 1;
                const dmg = p.crit ? base * 3 : base;
                e.hp -= dmg;
                e.hitFlash = p.crit ? 1.0 : 0.6;

                // SMITE: knockback the hit enemy
                if (p.type === 'smite') {
                  const kbStr = 5.5 + (p.crit ? 3 : 0);
                  e.knockX = p.dir.x * kbStr;
                  e.knockZ = p.dir.z * kbStr;
                  chainLightning(p.mesh.position.clone(), e, dmg);
                }

                // FISH: slow the hit enemy for 3 seconds
                if (p.type === 'fish') {
                  if (e.slowed <= 0) {
                    e.speed *= 0.4;  // will be restored when slowed expires
                  }
                  e.slowed = 3.0;
                  spawnFloatText(ep2.x, ep2.y + 0.6, ep2.z, '🐟 ЗАМЕДЛЕН', '#88ccff');
                  spawnParticles(ep2.x, ep2.y + 0.5, ep2.z, 0x4488ff, 6);
                }

                if (p.crit) {
                  spawnParticles(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xff8800, 10);
                  spawnFloatText(ep2.x, ep2.y + 1, ep2.z, `⚡КРИТ -${dmg}`, '#ff8800');
                  // Crit: mini screen shake + FOV pulse
                  gameRef.current.camShake = Math.max(gameRef.current.camShake, 0.14);
                  gameRef.current.targetFov = Math.max(gameRef.current.targetFov, BASE_FOV + 6);
                  // Bible quote notification when critting a boss
                  if (ENEMY_TYPES[e.type].boss && p.bibleQuote) {
                    gameRef.current.bibleQuoteText = p.bibleQuote;
                    gameRef.current.bibleQuoteFade = 3.0;
                  }
                  Audio.crit();
                } else {
                  spawnParticles(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xff5500, 5);
                  spawnFloatText(ep2.x, ep2.y, ep2.z, `-${dmg}`, '#ff5555');
                }
              }
              disposeMesh(p.mesh);
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

        // Death rings — expand outward, fade out
        for (let i = deathRings.length - 1; i >= 0; i--) {
          const dr = deathRings[i];
          dr.life += dt;
          const t = dr.life / dr.maxLife;
          const scale = 0.4 + t * (dr.boss ? 9.0 : 5.5);
          dr.mesh.scale.setScalar(scale);
          (dr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - t * t));
          if (dr.life >= dr.maxLife) {
            (dr.mesh.material as THREE.MeshBasicMaterial).dispose();
            dr.mesh.geometry.dispose();
            scene.remove(dr.mesh);
            deathRings.splice(i, 1);
          }
        }

        // Wine puddles — fade out over 5s
        for (let i = winePuddles.length - 1; i >= 0; i--) {
          const wp = winePuddles[i];
          wp.life += dt;
          const t = wp.life / 5.0;
          (wp.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.65 * (1 - t));
          // Slow enemies walking on puddle
          enemies.forEach(e => {
            const ep2 = (e.mesh as THREE.Group).position;
            const dx = ep2.x - wp.mesh.position.x;
            const dz = ep2.z - wp.mesh.position.z;
            if (Math.sqrt(dx * dx + dz * dz) < 2.2 && !e.ally && e.slowed <= 0 && e.drunk <= 0) {
              e.speed *= 0.6;
              e.slowed = 0.3;
            }
          });
          if (wp.life >= 5.0) {
            (wp.mesh.material as THREE.MeshBasicMaterial).dispose();
            wp.mesh.geometry.dispose();
            scene.remove(wp.mesh);
            winePuddles.splice(i, 1);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  UPDATE DEAD/RESURRECT
      // ═══════════════════════════════════════════════════════════════
      function updateDead(dt: number) {
        gameRef.current.deadTimer -= dt;

        if (gameRef.current.deadTimer <= 0) {
          gameRef.current.resurrectCount++;

          if (player.livesLeft <= 0) {
            gameRef.current.status = 'gameover';
            setGameStatus('gameover');
            return;
          }

          player.livesLeft--;
          setLivesLeft(player.livesLeft);

          gameRef.current.status = 'playing';
          setGameStatus('playing');
          player.dead = false;
          player.flying = false;
          player.velY = 0;
          player.hp = player.maxHp;
          player.iframes = 4;
          player.shieldOn = true;
          player.shieldT = 5;
          player.resurrectScale = 0.01; // pop-in animation starts from near-zero

          Audio.resurrect();

          // Damage nearby enemies on resurrect — inline squared-distance avoids per-enemy Vector3 allocation
          enemies.forEach(e => {
            const ep = (e.mesh as THREE.Group).position;
            const ddx = ep.x - player.x;
            const ddz = ep.z - player.z;
            if (ddx * ddx + ddz * ddz < 49) { // 7² = 49
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

        _vLook.set(player.x, 1.4 + player.y * 0.5, player.z);
        const ox = -Math.sin(gameRef.current.camYaw) * Math.cos(gameRef.current.camPitch) * CAM_DIST;
        const oy = -Math.sin(gameRef.current.camPitch) * CAM_DIST + 1.8 + player.y * 0.3;
        const oz = -Math.cos(gameRef.current.camYaw) * Math.cos(gameRef.current.camPitch) * CAM_DIST;
        _vDesired.set(player.x + ox, Math.max(1.5, _vLook.y + oy), player.z + oz);
        camPos.lerp(_vDesired, 0.22);

        // Camera lean toward movement direction (gentle drift)
        let lx = 0; let lz = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) { lx += Math.sin(gameRef.current.camYaw); lz += Math.cos(gameRef.current.camYaw); }
        if (keys.has('KeyS') || keys.has('ArrowDown')) { lx -= Math.sin(gameRef.current.camYaw); lz -= Math.cos(gameRef.current.camYaw); }
        if (keys.has('KeyA')) { lx -= Math.cos(gameRef.current.camYaw); lz += Math.sin(gameRef.current.camYaw); }
        if (keys.has('KeyD')) { lx += Math.cos(gameRef.current.camYaw); lz -= Math.sin(gameRef.current.camYaw); }
        const lm = Math.sqrt(lx * lx + lz * lz);
        const LEAN = player.flying ? 0.6 : 0.35;
        if (lm > 0.01) {
          camPos.x += (lx / lm) * LEAN;
          camPos.z += (lz / lm) * LEAN;
        }

        // Screen shake: decaying oscillation with random direction
        if (gameRef.current.camShake > 0) {
          gameRef.current.camShake = Math.max(0, gameRef.current.camShake - 0.04);
          const s = gameRef.current.camShake;
          camShakeVec.set(
            (Math.random() * 2 - 1) * s * 0.55,
            (Math.random() * 2 - 1) * s * 0.38,
            (Math.random() * 2 - 1) * s * 0.28,
          );
          camPos.add(camShakeVec);
        }

        camera.position.copy(camPos);
        camera.lookAt(_vLook);

        // FOV animation: kick then relax back to BASE_FOV
        if (gameRef.current.targetFov > BASE_FOV) {
          gameRef.current.targetFov = Math.max(BASE_FOV, gameRef.current.targetFov - 55 * (1 / 60));
        }
        camera.fov = THREE.MathUtils.lerp(camera.fov, gameRef.current.targetFov, 0.18);
        camera.updateProjectionMatrix();

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
          gameRef.current.camYaw += mx * mouseSens;
          gameRef.current.camPitch += my * mouseSens;
        }
        dx = 0;
        dy = 0;
        
        // Mobile look input
        const mobileInput = mobileInputRef.current;
        if (mobileInput.lookDx !== 0 || mobileInput.lookDy !== 0) {
          gameRef.current.camYaw += mobileInput.lookDx;
          gameRef.current.camPitch += mobileInput.lookDy;
          mobileInput.lookDx = 0;
          mobileInput.lookDy = 0;
        }

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
          
          // Mobile attack inputs
          mobileInput.pendingAttacks.forEach(btn => {
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
          mobileInput.pendingAttacks.length = 0;
          
          // Mobile ability inputs
          mobileInput.pendingAbilities.forEach(ability => {
            if (ability === 'Q' && player.cds[2] <= 0) {
              fireProjectile('wine', player.x, 1 + player.y, player.z, player.yaw);
              player.cds[2] = 5;
              Audio.wine();
            }
            if (ability === 'E') activateParry();
            if (ability === 'R') activateFlood();
            if (ability === 'F') activateBread();
            if (ability === 'G') activateGrace();
            if (ability === 'Space' && !player.flying && (player.onGround || player.coyoteTime > 0)) {
              player.velY = 9.5;
              player.onGround = false;
              player.coyoteTime = 0;
              player.landSquash = -0.12;
              gameRef.current.targetFov = Math.max(gameRef.current.targetFov, BASE_FOV + 5);
            }
            if (ability === 'Escape') {
              if (gameRef.current.status === 'playing') pauseGame();
            }
          });
          mobileInput.pendingAbilities.length = 0;
          
          // Mobile flight (Shift held)
          if (mobileInput.flightHeld && !player.flying && player.mana > 0.3 && player.onGround) {
            startFlight();
          }
          if (!mobileInput.flightHeld && player.flying) {
            stopFlight();
          }

          updateFloats(rawDt);
          updateCamera();

          // Replenish celestial rings once per frame
          if (rings.length < 2) {
            const ra = Math.random() * Math.PI * 2;
            const rd = 20 + Math.random() * 50;
            spawnRing(Math.cos(ra) * rd, 1.4 + Math.random() * 1.6, Math.sin(ra) * rd);
          }

          if (time - lastHudAt >= HUD_INTERVAL_MS) {
            lastHudAt = time;
            const cm = Math.min(3, 1 + Math.floor(gameRef.current.comboKills / 3) * 0.5);
            setCombo(cm > 1 ? cm : 0);
            setHp(Math.max(0, player.hp));
            setMaxHp(player.maxHp);
            setMana(player.mana);
            setLivesLeft(player.livesLeft);
            setWave(gameRef.current.wave);
            setKills(gameRef.current.kills);
            setScore(gameRef.current.score);
            setHiScore(gameRef.current.hiScore);
            setCooldowns([...player.cds]);
            setEventLog([...eventQueueRef.current]);
            // Active buffs display
            const buffs: string[] = [];
            if (player.speedBoost > 0) buffs.push(`⚡ БЫСТРО ${Math.ceil(player.speedBoost)}с`);
            if (player.graceBuff > 0) buffs.push(`☀ НЕПОБЕДИМ ${Math.ceil(player.graceBuff)}с`);
            if (player.shieldOn) buffs.push('🛡 ЩИТ');
            if (player.flying) buffs.push('✞ ПОЛЁТ');
            setActiveBuffs(buffs);

            // Decay hit flash and sync to React state
            if (gameRef.current.hitFlashVal > 0) {
              gameRef.current.hitFlashVal = Math.max(0, gameRef.current.hitFlashVal - 0.22);
              setHitFlash(gameRef.current.hitFlashVal);
            } else {
              setHitFlash(0);
            }

            // Bible quote fade-out
            if (gameRef.current.bibleQuoteFade > 0) {
              gameRef.current.bibleQuoteFade = Math.max(0, gameRef.current.bibleQuoteFade - HUD_INTERVAL_MS / 1000);
              setBibleQuoteNotif(gameRef.current.bibleQuoteText);
              // Fade in over first 0.4s, hold, fade out over last 1s
              const f = gameRef.current.bibleQuoteFade;
              setBibleQuoteOpacity(Math.min(1, Math.min(f, 3 - f) * 2.5));
            } else if (bibleQuoteNotif) {
              setBibleQuoteNotif('');
              setBibleQuoteOpacity(0);
            }

            // Draw minimap
            const mc = minimapRef.current;
            if (mc) {
              const ctx2 = mc.getContext('2d');
              if (ctx2) {
                const S = mc.width;
                const half = GROUND_SIZE / 2;
                const scale = S / GROUND_SIZE;
                ctx2.clearRect(0, 0, S, S);
                ctx2.fillStyle = 'rgba(0,0,0,0.82)';
                ctx2.fillRect(0, 0, S, S);
                ctx2.strokeStyle = '#c8a84b44';
                ctx2.lineWidth = 1;
                ctx2.strokeRect(0.5, 0.5, S - 1, S - 1);
                enemies.forEach(e => {
                  const ex = (e.mesh.position.x + half) * scale;
                  const ez = (e.mesh.position.z + half) * scale;
                  ctx2.fillStyle = e.ally ? '#00ff88' : ENEMY_TYPES[e.type].boss ? '#ff2200' : ENEMY_TYPES[e.type].fire ? '#ff6600' : '#ff4444';
                  ctx2.beginPath();
                  ctx2.arc(ex, ez, e.ally ? 2 : ENEMY_TYPES[e.type].boss ? 4.5 : 2.5, 0, Math.PI * 2);
                  ctx2.fill();
                });
                // Player dot + direction
                const px = (player.x + half) * scale;
                const pz = (player.z + half) * scale;
                ctx2.fillStyle = '#ffd700';
                ctx2.beginPath();
                ctx2.arc(px, pz, 3.5, 0, Math.PI * 2);
                ctx2.fill();
                ctx2.strokeStyle = '#ffd700';
                ctx2.lineWidth = 1.5;
                ctx2.beginPath();
                ctx2.moveTo(px, pz);
                ctx2.lineTo(px + Math.sin(player.yaw) * 8, pz + Math.cos(player.yaw) * 8);
                ctx2.stroke();
              }
            }
          }
        } else if (gameRef.current.status === 'dead') {
          gameRef.current.gtime += rawDt;
          updateDead(rawDt);
          updateEnemies(rawDt);
          updateFloats(rawDt);
          updateCamera();
          if (time - lastHudAt >= HUD_INTERVAL_MS) {
            lastHudAt = time;
            setDeadTimer(Math.max(0, Math.ceil(gameRef.current.deadTimer)));
            if (gameRef.current.status === 'dead') {
              // Still dead: show 0 HP
              setHp(0);
            } else {
              // Just transitioned to 'playing' inside updateDead (resurrection):
              // sync real HP immediately so the UI never shows 0 on a live player
              setHp(player.hp);
              setLivesLeft(player.livesLeft);
              lastHudAt = 0; // force full HUD refresh next frame
            }
          }
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
        if (e.code === 'Space' && !player.flying && (player.onGround || player.coyoteTime > 0)) {
          player.velY = 9.5;
          player.onGround = false;
          player.coyoteTime = 0;
          // Jump stretch: squash up for a frame
          player.landSquash = -0.12; // negative = stretch up briefly
          gameRef.current.targetFov = Math.max(gameRef.current.targetFov, BASE_FOV + 5);
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
        spawnTimers.forEach(id => clearTimeout(id));
        spawnTimers.length = 0;
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
        // Dispose all live game objects
        if (player.mesh) { disposeMesh(player.mesh); scene.remove(player.mesh); }
        enemies.forEach(e => { disposeMesh(e.mesh); scene.remove(e.mesh); });
        enemies.length = 0;
        projectiles.forEach(p => { disposeMesh(p.mesh); scene.remove(p.mesh); });
        projectiles.length = 0;
        pickups.forEach(p => { disposeMesh(p.mesh); scene.remove(p.mesh); });
        pickups.length = 0;
        rings.forEach(r => { disposeRing(r); scene.remove(r); });
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
        burstGeo.dispose();
        renderer.dispose();
        // Dispose remaining static scene GPU resources (sky, ground, water, trees, rocks, clouds, sun)
        const disposedMats = new Set<THREE.Material>();
        scene.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material as THREE.Material];
            mats.forEach(m => { if (!disposedMats.has(m)) { disposedMats.add(m); m.dispose(); } });
          } else if ((obj as THREE.DirectionalLight).isDirectionalLight || (obj as THREE.PointLight).isPointLight) {
            ((obj as THREE.DirectionalLight).shadow?.map as THREE.RenderTarget | undefined)?.dispose();
          }
        });
        scene.clear();
        // Close AudioContext to release OS audio resources
        if (Audio.ctx) { Audio.ctx.close(); Audio.ctx = null; }
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

      {/* Red damage vignette overlay */}
      {hitFlash > 0 && (
        <div
          className="absolute inset-0 pointer-events-none z-30"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(200,0,0,${(hitFlash * 0.82).toFixed(2)}) 100%)`,
          }}
        />
      )}

      {/* Mobile Touch Controls */}
      {isMobile && (
        <MobileTouchControls
          onMove={handleMobileMove}
          onLook={handleMobileLook}
          onAbility={handleMobileAbility}
          onAttack={handleMobileAttack}
          gameStatus={gameStatus}
          cooldowns={cooldowns}
          wave={wave}
        />
      )}

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
                  style={{ width: `${Math.max(0, (hp / maxHp) * 100)}%` }}
                />
              </div>
              <div className="text-gray-300 text-xs text-right mt-0.5 font-serif">
                {Math.round(hp)} / {maxHp}
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

            {/* Abilities - hidden on mobile as touch controls have their own buttons */}
            {!isMobile && (
              <div className="bg-black/80 border border-amber-600/60 rounded-md p-2 backdrop-blur-sm">
                {ABILITY_ICONS.map((icon, i) => {
                  const locked = (i === 5 && wave < 5) || (i === 6 && wave < 10);
                  return (
                    <div key={i} className="flex items-center gap-2 my-0.5">
                      <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${locked ? 'bg-gray-700 text-gray-500' : 'bg-amber-600 text-black'}`}>
                        {[0, 1].includes(i) ? (i === 0 ? 'ЛКМ' : 'ПКМ') : i === 7 ? '★' : ['Q', 'E', 'R', 'F', 'G', 'Sh'][i - 2]}
                      </div>
                      <span className={`text-xs ${locked ? 'opacity-30' : ''}`}>{icon}</span>
                      <span className={`text-xs ${locked ? 'text-gray-600' : cooldowns[i] <= 0 ? 'text-amber-500' : 'text-gray-500'}`}>
                        {locked ? `В${i === 5 ? 5 : 10}` : i === 7 && cooldowns[i] <= 0 ? '🛡' : cooldowns[i] <= 0 ? '✓' : Math.ceil(cooldowns[i]) + 'с'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

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

      {/* Minimap */}
      {(gameStatus === 'playing' || gameStatus === 'dead') && (
        <div className="absolute bottom-3 right-3 pointer-events-none">
          <canvas ref={minimapRef} width={130} height={130} className="rounded border border-amber-600/40 opacity-85" />
        </div>
      )}

      {/* Bible Quote notification — bottom center, gold, fade on boss crit */}
      {bibleQuoteNotif && (
        <div
          className="absolute bottom-40 left-1/2 -translate-x-1/2 pointer-events-none z-30 text-center"
          style={{ opacity: bibleQuoteOpacity, transition: 'opacity 0.1s' }}
        >
          <div className="text-amber-400 font-serif text-base px-5 py-2 rounded-lg bg-black/70 border border-amber-600/50 backdrop-blur-sm"
            style={{ textShadow: '0 0 18px rgba(200,168,75,0.7)' }}>
            ✝ {bibleQuoteNotif}
          </div>
        </div>
      )}

      {/* Event Log */}
      {(gameStatus === 'playing' || gameStatus === 'dead') && eventLog.length > 0 && (
        <div className="absolute bottom-3 left-3 pointer-events-none flex flex-col-reverse gap-0.5 max-w-xs">
          {eventLog.map((msg, i) => (
            <div
              key={i}
              className="text-xs font-serif px-2 py-0.5 rounded bg-black/60 text-amber-400/80"
              style={{ opacity: 1 - i * 0.18 }}
            >
              {msg}
            </div>
          ))}
        </div>
      )}

      {/* Active Buffs display */}
      {gameStatus === 'playing' && activeBuffs.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none z-30">
          {activeBuffs.map((buff, i) => (
            <div
              key={i}
              className="bg-black/70 border border-amber-400/60 text-amber-300 text-xs font-serif px-2 py-1 rounded-full backdrop-blur-sm animate-pulse"
              style={{ textShadow: '0 0 8px rgba(255,215,0,0.8)' }}
            >
              {buff}
            </div>
          ))}
        </div>
      )}

      {/* Locked ability toast */}
      {lockedMsg && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-none z-40">
          <div className="bg-black/85 border border-amber-600/60 text-amber-400 text-sm font-serif px-4 py-2 rounded-lg backdrop-blur-sm">
            {lockedMsg}
          </div>
        </div>
      )}

      {/* Satan boss warning */}
      {satanWarning && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40 animate-pulse">
          <div className="text-red-600 text-center font-black font-serif" style={{ textShadow: '0 0 40px rgba(255,0,0,0.9)', fontSize: 'clamp(2rem, 6vw, 4rem)' }}>
            ☩ САТАНА ЯВИЛСЯ ☩<br />
            <span className="text-2xl font-normal">Волна 20 — финальная битва</span>
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
          <div className="text-amber-500 text-lg mb-2 font-serif">ГРЕШНИКОВ {kills}</div>
          <div className="text-amber-500/70 text-lg mb-6 font-serif">РЕКОРД {hiScore}</div>
          <button
            type="button"
            onClick={() => showMenuRef.current?.()}
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

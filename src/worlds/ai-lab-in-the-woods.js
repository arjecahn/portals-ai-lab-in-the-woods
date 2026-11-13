// THE AI LAB IN THE WOODS
// A lab that is a wood: fifteen hectares of flat sandy ground, three metres above the sea, with a brook through the middle.
// Old oak coppice grown tall, wetter alder and birch to the north, three meadows inside their hedgerows, a farmhouse and a
// handful of plain huts, and in the middle of the wood a ring of six old beeches round a small pool, with a swing.
//
// The place is invented, and its layout is the invention's: X is east, Z is south, a metre is a metre, the farmhouse stands
// at the origin, wood everywhere the meadows and the clearings are not.
//
// The flight is a story, told low and slow in the last hour of a summer day. Our visitor arrives with AI they cannot steer,
// and leaves with a wood full of people building their own:
//   it opens high over the west meadow and comes down over the big welcome board, onto the cart track -> a padlocked vendor
//   cage rusting in the hedge, the lockdown reflex -> the Gatehouse, smoke from its stove -> through the gate into the
//   meadow: belted cattle under the lone tree, starlings overhead, and laptops left glowing on stumps in the grass, everyone
//   running AI their own way -> the pilot shed under its brambles, the thing that worked once -> the Cabin, the Lodge, the
//   footbridge over the brook -> the farmhouse, where a stack of office chairs says No seats -> into the wood: the three
//   steps of the plan on a signpost, the weathervane that says Any model, the cellar where the data stays, the spring where
//   every answer shows its source -> the pool and the ring of beeches, the swing, and a board where colleagues have pinned
//   the next process they want. The portal hangs in the middle of the ring.
import * as THREE from 'three';
import { makePath, clamp, smoothstep } from '../kit/core.js';
import * as SKY from '../kit/sky.js';
import * as T from '../kit/terrain.js';
import * as W from '../kit/water.js';
import * as flora from '../kit/flora.js';
import * as F from '../kit/fauna.js';
import * as fx from '../kit/fx.js';
import * as S from '../kit/structures.js';

const TAU = Math.PI * 2, GROUND = 3;   // NAP +3 m
const RING = { x: -130, z: -28, r: 12 }, POND = { x: -106, z: -32, r: 6.5 };
// The ground: the outline of the whole, the three meadows inside it (the enclosed one with its free-standing trees, the big
// west one, the south-east one), and wood everywhere else, which leaves the tree belts between the meadows and the wooded
// strip along the cart track by themselves. The brook runs from the pool down the enclosed meadow's east side.
const ESTATE = [[-296, -56], [-20, -211], [65, -104], [82, 63], [102, 233], [78, 243], [-92, 318], [-133, 256], [-184, 178], [-214, 188], [-296, 233], [-374, 114], [-381, 103], [-228, 42], [-248, 35]];
const MEADOW = [[-163, 29], [-116, 8], [-75, 0], [-85, 35], [-88, 63], [-58, 86], [-105, 103], [-153, 137], [-190, 97], [-207, 56], [-180, 52]];
const MEADOW_W = [[-374, 114], [-228, 63], [-153, 154], [-296, 233]], MEADOW_SE = [[-184, 178], [-51, 100], [3, 165], [-44, 202], [-71, 222], [-126, 256]];
const BELTS = [[-381, 103, -560, 176], [110, 250, 150, 420]];   // beyond the wood: the track running on west, the lane going south
const BEEK = [[-106, -32], [-92, -18], [-80, 0], [-80, 30], [-84, 62], [-58, 90], [-30, 140], [40, 185], [104, 215]];
const inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const segD = (x, z, x0, z0, x1, z1) => { const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - x0 - dx * t, z - z0 - dz * t); };
const lineD = (L, x, z) => { let m = 1e9; for (let i = 0; i < L.length - 1; i++) m = Math.min(m, segD(x, z, L[i][0], L[i][1], L[i + 1][0], L[i + 1][1])); return m; };

// where the story's props stand, and how much room each one keeps clear of shrubs so the flight can see it
const PROPS = [[-225, 51, 8], [-182, 64, 4], [-161, 67, 4], [-153, 86, 4], [-133, 85, 4], [-113, 90, 4], [-87, 50, 9], [-19, -9, 8], [-38, -49, 6], [-94, -68, 7], [-122, -56, 9], [-78, -16, 8], [-133, -35, 6]];

// ---------- small building blocks: the huts are plain, and so is this ----------
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.92, metalness: 0, emissive: o.emissive ?? '#000000', emissiveIntensity: o.glow ?? 0, side: o.side ?? THREE.FrontSide });
function box(g, m, w, h, d, x, y, z, ry = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); o.rotation.y = ry; g.add(o); return o; }
// a gable roof: a triangular prism, ridge along z, eaves overhanging by `over`
function gable(g, m, w, h, d, x, y, z, over = 0.35, ends = over) {
  const s = new THREE.Shape(); s.moveTo(-w / 2 - over, 0); s.lineTo(w / 2 + over, 0); s.lineTo(0, h); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: d + ends * 2, bevelEnabled: false }); geo.translate(0, 0, -d / 2 - ends);
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o;
}
// a hipped roof (the thatched 'wolfskap' of the farmhouse, seen from the air a low pyramid)
function hip(g, m, w, h, d, x, y, z, over = 0.5) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); geo.rotateY(Math.PI / 4);
  const o = new THREE.Mesh(geo, m); o.scale.set(w + over * 2, h, d + over * 2); o.position.set(x, y + h / 2, z); g.add(o); return o;
}
const M = () => ({
  white: mat('#efeadc'), thatch: mat('#8f7f55', { roughness: 1 }), thatchDark: mat('#6f6344', { roughness: 1 }), tile: mat('#9a4a34'), tar: mat('#2a2826'),
  plank: mat('#2e2620'), brown: mat('#6a4a30'), green: mat('#3f6a48'), greenDark: mat('#24402c'), wood: mat('#7a6248'), woodPale: mat('#a48c68'),
  soil: mat('#3a2c20', { roughness: 1 }), leafy: mat('#4f7a34'), glass: mat('#ffd9a0', { emissive: '#ffb860', glow: 0.9, roughness: 0.4 }), stone: mat('#8d8a82'),
  hive: mat('#d9c68a'), iron: mat('#1c1c1c', { roughness: 0.6 }), rope: mat('#b79a68'),
  shedWood: mat('#6b6354', { roughness: 1 }), chair: mat('#4a5a6a', { roughness: 0.6 }), pane: mat('#26323a', { roughness: 0.15 }), screen: mat('#cfe9ff', { emissive: '#6fc6ff', glow: 3.2, roughness: 0.25 }), led: mat('#bfe9ff', { emissive: '#49c8ff', glow: 2.4 }),
  brass: mat('#b9923a', { roughness: 0.35 }), steel: mat('#6e7276', { roughness: 0.5 }), paleRed: mat('#8e3a2c'), frame: mat('#f4f1e8'), frameYellow: mat('#dcae3a'), ridge: mat('#b5553c'), plinth: mat('#1d1b1a'), thatchGrey: mat('#847e6c', { roughness: 1 }),
  cabin: mat('#1f3327', { roughness: 0.7 }), rust: mat('#5a3424', { roughness: 0.95 }), shutter: mat('#3f8a52'), glow: mat('#ffd9a0', { emissive: '#ffb860', glow: 0.7, roughness: 0.4 }),
});
// a window: dark glass in a painted frame with glazing bars (white, or the yellow of the Workshop)
function windowOn(g, m, x, y, z, ry = 0, w = 0.7, h = 0.8, frame = null, glass = null) {
  const o = new THREE.Group(); o.position.set(x, y, z); o.rotation.y = ry;
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.16, h + 0.16), frame || m.frame); o.add(f);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass || m.pane); p.position.z = 0.012; o.add(p);
  const bar = frame || m.frame;
  const v = new THREE.Mesh(new THREE.PlaneGeometry(0.045, h), bar); v.position.z = 0.02; o.add(v);
  const hz = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.045), bar); hz.position.z = 0.02; o.add(hz);
  g.add(o); return o;
}
function picnicTable(m) {
  const g = new THREE.Group(); g.name = 'picknicktafel';
  box(g, m.woodPale, 1.9, 0.06, 0.8, 0, 0.74, 0); for (const z of [-0.72, 0.72]) box(g, m.woodPale, 1.9, 0.05, 0.28, 0, 0.44, z);
  for (const x of [-0.7, 0.7]) { const a = box(g, m.wood, 0.08, 0.8, 0.08, x, 0, -0.42); a.rotation.x = 0.35; const b = box(g, m.wood, 0.08, 0.8, 0.08, x, 0, 0.42); b.rotation.x = -0.35; }
  return g;
}
// The farmhouse: white plaster, a steep thatched roof that comes low at the sides, a white pointed gable to the lawn with
// its top hipped off (the wolfskap), green shutters beside small-paned windows, picnic tables on the grass
function whiteHouse(m) {
  const g = new THREE.Group(); g.name = 'de-boerderij';
  const W = 10.5, D = 11, H = 2.9, R = 6.2, F = D / 2;
  box(g, m.white, W, H, D, 0, 0, 0); box(g, m.plinth, W + 0.06, 0.3, D + 0.06, 0, 0, 0);
  gable(g, m.thatch, W, R, D, 0, H, 0, 0.75, 0.05);
  for (const sz of [1, -1]) gable(g, m.white, W - 0.5, R - 0.35, 0.06, 0, H, sz * (F + 0.1), 0, 0);   // the white gables
  for (const sz of [1, -1]) { const h = hip(g, m.thatch, 4.6, 2.4, 1.5, 0, H + R - 2.45, sz * (F - 0.25), 0.2); h.rotation.x = sz * 0.5; }   // ... with the tops hipped off
  box(g, m.thatchDark, 0.7, 0.3, D * 0.82, 0, H + R - 0.2, 0);
  box(g, m.white, 0.8, 1.3, 0.8, 0, H + R - 0.4, -1.2); box(g, m.ridge, 0.95, 0.2, 0.95, 0, H + R + 0.9, -1.2);
  for (const x of [-3.2, 3.2]) { windowOn(g, m, x, 1.65, F + 0.02, 0, 1.25, 1.35); for (const sx of [-1, 1]) box(g, m.shutter, 0.55, 1.5, 0.05, x + sx * 1.02, 0.9, F + 0.03); }
  windowOn(g, m, 0, 1.75, F + 0.02, 0, 1.0, 1.5); for (const sx of [-1, 1]) box(g, m.shutter, 0.5, 1.9, 0.05, sx * 0.86, 0.7, F + 0.03);
  windowOn(g, m, 0, H + 1.75, F + 0.14, 0, 2.3, 0.95);
  for (const z of [-2.5, 2]) for (const sx of [-1, 1]) windowOn(g, m, sx * (W / 2 + 0.02), 1.6, z, sx * Math.PI / 2, 1.1, 1.0);
  for (const [x, z, r] of [[-3.5, F + 6, 0.2], [1.5, F + 7.5, -0.1], [5.5, F + 5.5, 0.4]]) { const t = picnicTable(m); t.position.set(x, 0, z); t.rotation.y = r; g.add(t); }
  return g;
}
// the smaller white thatched building beside the house
function outhouse(m) {
  const g = new THREE.Group(); g.name = 'bijgebouw';
  box(g, m.white, 5.4, 2.3, 4.2, 0, 0, 0); box(g, m.plinth, 5.46, 0.25, 4.26, 0, 0, 0); hip(g, m.thatchGrey, 5.4, 2.6, 4.2, 0, 2.3, 0, 0.55);
  windowOn(g, m, -1.2, 1.4, 2.12, 0, 0.9, 0.9); box(g, m.greenDark, 0.9, 1.9, 0.06, 1.2, 0, 2.12);
  return g;
}
// the old wagon barn: dark boards, a red tiled roof, an open bay
function barn(m) {
  const g = new THREE.Group(); g.name = 'de-oude-schuur';
  box(g, m.plank, 9, 3.2, 6, 0, 0, 0); gable(g, m.tile, 9, 2.6, 6, 0, 3.2, 0, 0.5); box(g, m.tar, 3.2, 2.6, 0.1, -1.6, 0, 3.02);
  return g;
}
// The Workshop: white plaster on a black plinth, thatch with a ridge of red tiles, a wing with its own gable to the lawn,
// yellow window frames, glass doors with the lamp on inside, a white chimney; on the lawn the rusty stove with its tall pipe
function workshopHut(m) {
  const g = new THREE.Group(); g.name = 'de-werkplaats';
  const main = new THREE.Group(); main.rotation.y = Math.PI / 2; g.add(main);                 // the long wing, ridge along x
  box(g, m.white, 7.2, 2.3, 3.6, -1.2, 0, -0.6); box(g, m.plinth, 7.26, 0.32, 3.66, -1.2, 0, -0.6);
  gable(main, m.thatch, 3.6, 2.2, 7.2, 0.6, 2.3, -1.2, 0.5, 0.25);
  box(g, m.ridge, 7.5, 0.16, 0.5, -1.2, 4.42, -0.6);
  box(g, m.white, 3.8, 2.3, 3.4, 2.2, 0, 2.0); box(g, m.plinth, 3.86, 0.32, 3.46, 2.2, 0, 2.0);   // the gabled wing
  gable(g, m.thatchDark, 3.8, 2.5, 3.4, 2.2, 2.3, 2.0, 0.5, 0.3); gable(g, m.white, 3.5, 2.25, 0.05, 2.2, 2.3, 3.98, 0, 0);
  windowOn(g, m, 2.2, 3.3, 4.03, 0, 0.42, 0.42, m.frameYellow);
  windowOn(g, m, 1.5, 1.25, 3.72, 0, 0.75, 1.9, m.frame, m.glow); windowOn(g, m, 2.6, 1.25, 3.72, 0, 0.75, 1.9, m.frame, m.glow);   // the glass doors
  windowOn(g, m, -2.6, 1.45, 1.22, 0, 1.2, 0.85, m.frameYellow);
  box(g, m.white, 0.7, 1.5, 0.7, 3.2, 3.6, -0.4);
  box(g, m.white, 0.12, 2.2, 0.12, 5.6, 0, 3.4); box(g, m.white, 1.9, 0.1, 2.6, 4.9, 2.2, 2.3);    // the little porch
  box(g, m.rust, 0.6, 0.85, 0.6, -3.5, 0.15, 8.5); box(g, m.rust, 0.14, 2.9, 0.14, -3.5, 1.0, 8.4); box(g, m.iron, 0.5, 0.12, 0.4, -3.5, 0, 8.9);
  box(g, m.plank, 1.1, 2.0, 1.1, 8.0, 0, -2.5); gable(g, m.tar, 1.1, 0.5, 1.1, 8.0, 2.0, -2.5, 0.15);   // the toilet hut
  return g;
}
// The Lodge: black boards with white-painted windows under a hipped thatch gone grey, a rail fence at its corner
function lodgeHut(m) {
  const g = new THREE.Group(); g.name = 'de-lodge';
  box(g, m.plinth, 6.2, 2.0, 4.4, 0, 0, 0); hip(g, m.thatchGrey, 6.2, 2.9, 4.4, 0, 2.0, 0, 0.65);
  windowOn(g, m, -1.9, 1.15, 2.22, 0, 0.8, 0.75); windowOn(g, m, 0.6, 1.15, 2.22, 0, 1.7, 0.75); windowOn(g, m, 3.12, 1.15, 0.3, Math.PI / 2, 0.9, 0.75);
  box(g, m.plank, 0.85, 1.8, 0.06, 2.3, 0, 2.22);
  box(g, m.iron, 0.12, 1.1, 0.12, -4.4, 0, 1.5); box(g, m.iron, 0.5, 0.06, 0.06, -4.2, 1.0, 1.5);   // the pump
  return g;
}
// The Cottage: a low dark-brown hut among the beeches, with a shed
function cottageHut(m) {
  const g = new THREE.Group(); g.name = 'het-huisje';
  box(g, m.brown, 5.0, 2.1, 3.4, 0, 0, 0); gable(g, m.tar, 5.0, 0.75, 3.4, 0, 2.1, 0, 0.45);
  windowOn(g, m, 2.52, 1.3, 0.2, Math.PI / 2, 0.9, 0.7); windowOn(g, m, -0.9, 1.3, 1.72, 0, 1.3, 0.7); box(g, m.plank, 0.9, 1.85, 0.06, 1.2, 0, 1.72);
  box(g, m.brown, 2.0, 1.8, 1.6, -4.4, 0, -0.6); box(g, m.tar, 2.3, 0.1, 1.9, -4.4, 1.8, -0.6);
  return g;
}
// The Gatehouse and the Cabin: dark green ribbed huts with a wall of glass to the front, on a plank deck with a picnic
// table. The Gatehouse has the wood stove: it returns the top of the pipe for the smoke.
function tinyHouse(m, name, stove) {
  const g = new THREE.Group(); g.name = name;
  box(g, m.cabin, 6.4, 2.7, 2.8, 0, 0.25, 0);
  for (let k = 0; k < 20; k++) box(g, m.greenDark, 0.06, 2.6, 0.03, -3.1 + k * 0.33, 0.3, -1.42);   // the ribs of the sheeting
  const roof = box(g, m.tar, 6.8, 0.12, 3.3, 0, 2.95, 0.1); roof.rotation.x = 0.05;
  box(g, m.woodPale, 3.9, 2.25, 0.08, -0.6, 0.4, 1.4);
  for (const x of [-1.9, -0.6, 0.7]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.0), m.pane); p.position.set(x, 1.52, 1.45); g.add(p); }
  box(g, m.woodPale, 6.0, 0.14, 3.4, 0.4, 0.1, 3.2);                                               // the deck
  const t = picnicTable(m); t.position.set(1.0, 0.24, 3.4); t.rotation.y = 0.2; g.add(t);
  if (stove) { box(g, m.iron, 0.16, 1.5, 0.16, 2.4, 3.0, -0.6); g.userData.pipe = new THREE.Vector3(2.4, 4.5, -0.6); }
  box(g, m.wood, 2.2, 1.5, 1.0, -5.4, 0, -0.6); box(g, m.tar, 2.5, 0.1, 1.3, -5.4, 1.5, -0.6); box(g, m.woodPale, 1.9, 1.0, 0.7, -5.4, 0.1, -0.5);   // the wood shed
  return g;
}
// the high seat beside the lone tree in the meadow: a ladder up to a board
function highSeat(m) {
  const g = new THREE.Group(); g.name = 'hoogzit';
  for (const [x, z] of [[-0.55, -0.45], [0.55, -0.45], [-0.55, 0.45], [0.55, 0.45]]) { const l = box(g, m.wood, 0.08, 3.4, 0.08, x, 0, z); l.rotation.z = -x * 0.22; l.rotation.x = z * 0.2; }
  for (let k = 1; k < 8; k++) box(g, m.woodPale, 0.9 - k * 0.05, 0.05, 0.05, 0, k * 0.4, 0.5 - k * 0.012);
  box(g, m.woodPale, 0.9, 0.06, 0.8, 0, 3.3, 0); box(g, m.woodPale, 0.9, 0.5, 0.05, 0, 3.6, -0.38);
  return g;
}
// the vegetable garden: raised beds in rows, bean poles, compost bins
function garden(m, rng) {
  const g = new THREE.Group(); g.name = 'moestuin';
  for (let r = 0; r < 5; r++) {
    box(g, m.soil, 1.3, 0.22, 11, r * 2.3 - 4.6, 0, 0);
    for (let k = 0; k < 9; k++) { const s = rng.range(0.25, 0.6); box(g, m.leafy, s, s * rng.range(0.7, 1.6), s, r * 2.3 - 4.6 + rng.range(-0.3, 0.3), 0.2, -5 + k * 1.2 + rng.range(-0.2, 0.2), rng() * TAU); }
  }
  for (let k = 0; k < 6; k++) { const p = box(g, m.woodPale, 0.05, 2.1, 0.05, -4.6 + (k % 2 ? 0.25 : -0.25), 0.2, -4 + (k >> 1) * 0.9); p.rotation.z = k % 2 ? 0.14 : -0.14; }
  for (let k = 0; k < 3; k++) box(g, m.wood, 1.2, 0.9, 1.2, 7.5, 0, -3 + k * 1.4);
  return g;
}
// the hives by the garden
function hives(m) { const g = new THREE.Group(); g.name = 'bijenkasten'; for (let k = 0; k < 4; k++) { box(g, m.hive, 0.5, 0.7, 0.55, k * 0.95, 0.35, 0); box(g, m.tar, 0.6, 0.07, 0.65, k * 0.95, 1.05, 0); box(g, m.wood, 0.06, 0.35, 0.06, k * 0.95 - 0.2, 0, 0.2); box(g, m.wood, 0.06, 0.35, 0.06, k * 0.95 + 0.2, 0, -0.2); } return g; }
// the farm gate on the lane, standing open, and the green welcome board where the track comes in
function gate(m) {
  const g = new THREE.Group(); g.name = 'boerenhek';
  for (const x of [-2.6, 2.6]) box(g, m.wood, 0.24, 1.6, 0.24, x, 0, 0);
  const leaf = new THREE.Group(); leaf.position.set(-2.6, 0, 0); leaf.rotation.y = 1.25;
  for (const y of [0.35, 0.7, 1.05, 1.35]) box(leaf, m.woodPale, 4.6, 0.09, 0.05, 2.4, y, 0);
  for (const x of [0.2, 2.4, 4.6]) box(leaf, m.woodPale, 0.09, 1.25, 0.06, x, 0.25, 0);
  const brace = box(leaf, m.woodPale, 4.9, 0.08, 0.05, 2.4, 0.8, 0.03); brace.rotation.z = 0.22;
  g.add(leaf); return g;
}
function welcomeBoard(m) {
  const g = new THREE.Group(); g.name = 'welkomstbord';
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#2f5a3a'; x.fillRect(0, 0, 512, 256); x.strokeStyle = '#e9e2c8'; x.lineWidth = 8; x.strokeRect(14, 14, 484, 228);
  x.fillStyle = '#f2ecd6'; x.textAlign = 'center'; x.font = 'italic 600 96px Georgia, serif'; x.fillText('Welcome', 256, 116); x.font = '500 34px Georgia, serif'; x.fillText('Any model · your data stays here', 256, 186);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.06), [m.greenDark, m.greenDark, m.greenDark, m.greenDark, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), m.greenDark]);
  board.position.set(0, 1.75, 0); g.add(board);
  for (const px of [-0.8, 0.8]) box(g, m.wood, 0.1, 1.9, 0.1, px, 0, -0.06);
  return g;
}
// the wooden footbridge over the beek, along z
function footbridge(m) {
  const g = new THREE.Group(); g.name = 'bruggetje';
  for (let k = 0; k < 15; k++) box(g, m.woodPale, 1.7, 0.07, 0.3, 0, 0, -2.45 + k * 0.35);
  for (const x of [-0.75, 0.75]) { box(g, m.wood, 0.14, 0.16, 5.4, x, -0.16, 0); for (const z of [-2.4, 0, 2.4]) box(g, m.wood, 0.09, 1.0, 0.09, x, 0, z); box(g, m.wood, 0.07, 0.07, 5.0, x, 0.95, 0); }
  return g;
}
// the big swing in the beech ring: two long ropes from a bough and a board
function swing(m, len = 7.5) {
  const g = new THREE.Group(); g.name = 'schommel';
  const arm = new THREE.Group(); g.add(arm);
  for (const x of [-0.35, 0.35]) box(arm, m.rope, 0.035, len, 0.035, x, -len, 0);
  box(arm, m.woodPale, 0.95, 0.06, 0.28, 0, -len, 0);
  const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 9, 8), m.stone); bough.rotation.z = Math.PI / 2 - 0.08; bough.position.set(0.5, 0.1, 0); g.add(bough);
  g.userData.arm = arm; return g;
}

// ---------- the story the flight tells ----------
// Our visitor's own story, left about the place as things: what they came in with (a vendor cage, laptops in the grass, a
// pilot that ran once), what they are given here (three steps on a signpost, a weathervane, a cellar, a spring), and what
// they leave with (a board where colleagues ask for the next process). Nine props and a big board, no text in the air.

// a painted face for a board: lines = [[text, y as a fraction of the height, css font, colour]]
function plateMat(lines, o = {}) {
  const w = o.w ?? 1024, h = o.h ?? 256, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = o.bg ?? '#f2ecd8'; x.fillRect(0, 0, w, h);
  if (o.grain) for (let k = 0; k < 160; k++) { x.fillStyle = `rgba(90,70,40,${0.02 + 0.03 * ((k * 7) % 5) / 5})`; x.fillRect(0, (k / 160) * h, w, 1 + (k % 3)); }   // boards, not paper
  if (o.frame) { x.strokeStyle = o.frame; x.lineWidth = o.fw ?? 10; x.strokeRect((o.fw ?? 10) / 2, (o.fw ?? 10) / 2, w - (o.fw ?? 10), h - (o.fw ?? 10)); }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const room = o.room ?? w * 0.9;   // the widest a line may run; a longer one is set smaller until it fits
  for (const L of lines) { x.fillStyle = L[3] || o.fg || '#2b2a26'; let px = +(/(\d+)px/.exec(L[2]) || [0, 40])[1]; x.font = L[2];
    while (px > 12 && x.measureText(L[0]).width > room) { px -= 2; x.font = L[2].replace(/\d+px/, px + 'px'); }
    x.fillText(L[0], o.x ?? w / 2, L[1] * h); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.84, metalness: 0 });
}
// a flat board painted on both faces, so it reads from whichever side the flight comes
const boardMesh = (w, h, d, face, side) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, face, face]);
// the big board over the way in: 26 m across on two posts, so the flight comes over its top with the whole wood behind it
function bigBoard(m) {
  const g = new THREE.Group(); g.name = 'groot-bord';
  const face = plateMat([['AI Lab in the Woods', 0.42, 'italic 600 168px Georgia, serif', '#2f5a3a'],
    ['Welcome. Mind the kabouters.', 0.76, '500 76px Georgia, serif', '#5a6a52']], { w: 2048, h: 640, bg: '#f4eedc', frame: '#2f5a3a', fw: 26, grain: 1 });
  const board = boardMesh(26, 8, 0.45, face, m.plank); board.position.y = 10; g.add(board);
  for (const px of [-10.5, 10.5]) { box(g, m.wood, 0.75, 10.4, 0.75, px, 0, -0.35); const br = box(g, m.wood, 0.45, 7.4, 0.45, px - Math.sign(px) * 2.4, 3.4, -2.6); br.rotation.x = -0.42; br.rotation.z = Math.sign(px) * 0.3; }
  for (const y of [6.4, 13.4]) box(g, m.wood, 25, 0.3, 0.3, 0, y, -0.3);
  return g;
}
// the lockdown reflex: a steel cage padlocked shut in the hedge, one rack still blinking inside, the notice still up
function vendorCage(m) {
  const g = new THREE.Group(); g.name = 'leveranciers-kooi';
  for (let k = 0; k <= 11; k++) for (const z of [-1.3, 1.3]) box(g, m.steel, 0.06, 2.5, 0.06, -1.65 + k * 0.3, 0, z);
  for (const sx of [-1.65, 1.65]) for (let k = 0; k <= 9; k++) box(g, m.steel, 0.06, 2.5, 0.06, sx, 0, -1.3 + k * 0.29);
  for (let k = 0; k <= 11; k++) box(g, m.steel, 0.05, 0.05, 2.7, -1.65 + k * 0.3, 2.5, 0);
  box(g, m.tar, 1.1, 1.95, 0.75, -0.2, 0, 0.1);                                           // the rack
  for (let k = 0; k < 8; k++) box(g, m.led, 0.07, 0.05, 0.03, -0.55 + (k % 4) * 0.22, 0.45 + (k >> 2) * 0.55, 0.5);
  box(g, m.iron, 0.22, 0.3, 0.1, 0, 1.15, -1.36); box(g, m.steel, 0.1, 0.26, 0.08, 0, 1.42, -1.36);   // the padlock on the door
  const notice = boardMesh(3.4, 1.15, 0.08, plateMat([['AI POLICY: NO', 0.42, '700 104px Georgia, serif', '#f6e8df'], ['signed, one vendor', 0.78, 'italic 66px Georgia, serif', '#f0d4ca']], { w: 1024, h: 400, bg: '#7e3528', frame: '#f2e4da', fw: 12 }), m.plank);
  notice.position.set(0, 3.7, -1.3); g.add(notice);
  for (const px of [-1.3, 1.3]) box(g, m.wood, 0.13, 4.0, 0.13, px, 0, -1.38);
  return g;
}
// everybody running AI their own way: a laptop left glowing on a stump, lid half down
function stumpLaptop(m, rng) {
  const g = new THREE.Group(); g.name = 'laptop-op-stobbe';
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, rng.range(0.45, 0.6), 10), m.rust); st.position.y = st.geometry.parameters.height / 2; g.add(st);
  const top = st.geometry.parameters.height, l = new THREE.Group(); l.position.set(0, top, 0); l.scale.setScalar(2.6); g.add(l);   // (and the whole is placed larger again), so the flight sees it
  box(l, m.steel, 0.36, 0.022, 0.26, 0, 0, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.02, -0.13); lid.rotation.x = -rng.range(0.2, 0.4); l.add(lid);
  box(lid, m.steel, 0.36, 0.24, 0.016, 0, 0, 0);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), m.screen); sc.position.set(0, 0.12, 0.012); lid.add(sc);
  return g;
}
// the pilot that worked once: a shed sunk at one corner, door open, brambles over the roof, the sign gone pale
function pilotShed(m) {
  const g = new THREE.Group(); g.name = 'pilot-schuur';
  const b = new THREE.Group(); b.rotation.z = 0.09; g.add(b);
  box(b, m.shedWood, 4.2, 2.2, 3.0, 0, 0, 0); gable(b, m.tar, 4.2, 1.1, 3.0, 0, 2.2, 0, 0.35);
  box(b, m.brown, 1.0, 1.9, 0.07, -1.0, 0, 1.53); const door = box(b, m.brown, 1.0, 1.9, 0.07, 0.6, 0, 1.53); door.rotation.y = -1.1; door.position.x = 0.1;
  windowOn(b, m, 1.3, 1.3, 1.54, 0, 0.6, 0.6, m.plank, m.pane);
  const sign = boardMesh(3.8, 1.0, 0.06, plateMat([['PILOT · it worked once', 0.5, '600 86px Georgia, serif', '#8a8470']], { w: 1024, h: 260, bg: '#d9d3bd', frame: '#a8a08a', fw: 10, grain: 1 }), m.plank);
  sign.position.set(0, 2.75, 1.95); sign.rotation.z = -0.07; b.add(sign);
  for (let k = 0; k < 7; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.55, 7, 5), m.leafy); c.position.set(-1.8 + k * 0.62, 2.3 + (k % 3) * 0.2, -0.9 + (k % 2) * 0.7); c.scale.y = 0.55; b.add(c); }   // brambles over it
  return g;
}
// one fixed platform price, no seats: the chairs stacked by the farmhouse with a note on top
function chairStack(m) {
  const g = new THREE.Group(); g.name = 'geen-stoelen';
  g.scale.setScalar(1.5);
  for (let k = 0; k < 5; k++) { const c = new THREE.Group(); c.position.y = k * 0.42; c.rotation.y = k * 0.5;
    box(c, m.chair, 0.52, 0.07, 0.5, 0, 0.1, 0); box(c, m.chair, 0.5, 0.52, 0.07, 0, 0.17, -0.24); box(c, m.steel, 0.07, 0.12, 0.07, 0, 0, 0); g.add(c); }
  const note = boardMesh(1.2, 0.5, 0.04, plateMat([['No seats.', 0.5, 'italic 600 118px Georgia, serif', '#2b4a34']], { w: 512, h: 220, bg: '#f4eedc', frame: '#2f5a3a', fw: 8 }), m.plank);
  note.position.set(0, 2.55, 0.1); note.rotation.x = -0.25; g.add(note); box(g, m.wood, 0.07, 2.4, 0.07, 0, 0, 0.1);
  return g;
}
// the plan, on a signpost where the way turns into the wood: three arms, three steps
function planPost(m) {
  const g = new THREE.Group(); g.name = 'plan-wegwijzer';
  box(g, m.woodPale, 0.16, 3.4, 0.16, 0, 0, 0);
  const arms = [['1', 'connect your sources, pick one process', 3.0, 0.35], ['2', 'your team builds it, the first time with us', 2.25, -0.55], ['3', 'your people build the next process', 1.5, 0.15]];
  for (const [n, t, y, ry] of arms) {
    const h = new THREE.Group(); h.rotation.y = ry; g.add(h);
    const a = boardMesh(3.4, 0.62, 0.07, plateMat([[t, 0.56, '600 66px Georgia, serif', '#1f1e1b']], { w: 1300, h: 230, bg: '#f2ecd8', frame: '#2f5a3a', fw: 8, grain: 1, x: 760, room: 1020 }), m.woodPale);
    a.position.set(1.75, y, 0); h.add(a);
    const nn = boardMesh(0.5, 0.5, 0.075, plateMat([[n, 0.58, '700 150px Georgia, serif', '#f2ecd8']], { w: 256, h: 256, bg: '#2f5a3a' }), m.woodPale);
    nn.position.set(0.32, y, 0.01); h.add(nn);
  }
  return g;
}
// any model, switch anytime: a weathervane that never settles, over the clearing
function vane(m) {
  const g = new THREE.Group(); g.name = 'windwijzer';
  box(g, m.woodPale, 0.14, 3.5, 0.14, 0, 0, 0);
  const arm = new THREE.Group(); arm.position.y = 3.6; g.add(arm);
  const face = plateMat([['ANY MODEL', 0.38, '700 96px Georgia, serif', '#2b2a26'], ['switch anytime', 0.74, 'italic 600 78px Georgia, serif', '#3a4a36']], { w: 1024, h: 300, bg: '#f2ecd8', frame: '#2f5a3a', fw: 9, grain: 1 });
  const b = boardMesh(3.6, 1.05, 0.06, face, m.woodPale); b.position.set(0.7, 0, 0); arm.add(b);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 4), m.greenDark); tail.rotation.z = Math.PI / 2; tail.position.set(-1.2, 0, 0); arm.add(tail);
  g.userData.arm = arm; return g;
}
// your data stays here: a cellar in the bank, a plank door, a plate screwed to it
function cellar(m) {
  const g = new THREE.Group(); g.name = 'kelder';
  const mound = new THREE.Mesh(new THREE.SphereGeometry(3.1, 16, 10, 0, TAU, 0, Math.PI / 2), m.soil); mound.scale.set(1, 0.52, 1.25); g.add(mound);
  for (let k = 0; k < 9; k++) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), m.leafy); t.position.set(-2.2 + k * 0.55, 1.1 + ((k * 3) % 4) * 0.12, -0.6 + ((k * 5) % 3) * 0.5); t.scale.y = 0.4; g.add(t); }
  box(g, m.stone, 3.0, 2.7, 0.5, 0, 0, 2.9); const d = box(g, m.plank, 1.1, 1.75, 0.1, 0, 0, 3.17); d.name = 'kelderdeur';
  const plate = boardMesh(2.6, 0.62, 0.05, plateMat([['YOUR DATA STAYS HERE', 0.54, '700 80px Georgia, serif', '#2a2318']], { w: 1100, h: 260, bg: '#d0aa52', frame: '#7a5a20', fw: 10 }), m.brass);
  plate.position.set(0, 2.22, 3.2); g.add(plate);
  box(g, m.brass, 0.1, 0.22, 0.09, 0.42, 0.75, 3.24);
  return g;
}
// every answer shows its source: a spring by the brook, a pipe over a basin of stones and a board beside it
function springSign(m) {
  const g = new THREE.Group(); g.name = 'de-bron';
  for (let k = 0; k < 11; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.22 + (k % 3) * 0.06, 6, 4), m.stone); s.position.set(Math.cos(k) * 0.9, 0.1, Math.sin(k * 1.7) * 0.8); s.scale.y = 0.6; g.add(s); }
  const pipe = box(g, m.brass, 0.1, 0.8, 0.1, -0.5, 0.2, -0.4); pipe.rotation.z = -0.5;
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.75), new THREE.MeshStandardMaterial({ color: '#cfe6ea', roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  fall.position.set(-0.18, 0.4, -0.3); g.add(fall);
  const b = boardMesh(2.3, 0.56, 0.06, plateMat([['every answer shows its source', 0.52, 'italic 600 74px Georgia, serif', '#2b4a34']], { w: 1200, h: 280, bg: '#f2ecd8', frame: '#2f5a3a', fw: 9, grain: 1 }), m.woodPale);
  b.position.set(0, 1.5, 0.9); g.add(b); for (const px of [-0.95, 0.95]) box(g, m.wood, 0.09, 1.6, 0.09, px, 0, 0.84);
  return g;
}
// what the visitor leaves with: in the ring, a board where colleagues have pinned the next process they want
function noticeBoard(m) {
  const g = new THREE.Group(); g.name = 'prikbord';
  const c = document.createElement('canvas'); c.width = 1200; c.height = 760; const x = c.getContext('2d');
  x.fillStyle = '#3f3226'; x.fillRect(0, 0, 1200, 760); x.fillStyle = '#6a5436'; x.fillRect(18, 18, 1164, 724);
  x.fillStyle = '#f2ecd8'; x.textAlign = 'center'; x.font = '700 76px Georgia, serif'; x.fillText('THE NEXT PROCESS', 600, 108);
  const notes = [['invoices,', 'next please', -0.06], ['onboarding,', 'like sales did', 0.05], ['the tender', 'answers', -0.03], ['contracts?', 'can we?', 0.06], ['site visits', 'ours too', -0.05], ['we build', 'it ourselves', 0.04]];
  notes.forEach(([l1, l2, r], i) => { const px = 210 + (i % 3) * 390, py = 290 + Math.floor(i / 3) * 250;
    x.save(); x.translate(px, py); x.rotate(r); x.fillStyle = ['#f6efd6', '#e8f0d8', '#f6e4c6'][i % 3]; x.fillRect(-175, -100, 350, 200);
    x.fillStyle = '#1f1e1b'; x.font = 'italic 600 52px Georgia, serif'; x.fillText(l1, 0, -14); x.fillText(l2, 0, 52);
    x.fillStyle = '#b4452f'; x.beginPath(); x.arc(0, -80, 11, 0, 7); x.fill(); x.restore(); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const b = boardMesh(3.6, 2.3, 0.14, face, m.wood); b.position.y = 2.3; g.add(b);
  gable(g, m.tar, 3.9, 0.45, 0.5, 0, 3.45, 0, 0.3); for (const px of [-1.5, 1.5]) box(g, m.wood, 0.16, 2.4, 0.16, px, 0, -0.1);
  return g;
}

// ---------- the wood ----------
// Old coppice grown tall: slender trunks close together, bare for two thirds of their height, a high roof of small leaves
// with the sky showing through, saplings in between, sun flecks on brown leaf litter. None of that is in the kit's trees
// (broad, low, large-leaved), so the wood is made here: trunks with boughs as instances of a few shapes, bark drawn on a
// canvas, crowns as many small cards of drawn leaves that take the light from the side the sun is on.
const SPECIES = [
  { name: 'eik', h: [19, 25], r: [0.2, 0.3], crown: [0.56, 1.0], spread: 4.6, cards: [30, 20], size: [2.4, 3.8], leaf: ['#4d8a2c', '#7fae3c', '#3a6e26'], bark: '#b0a494', tex: 'oak', shape: 0 },
  { name: 'eik-slank', h: [17, 23], r: [0.15, 0.22], crown: [0.62, 1.0], spread: 3.6, cards: [24, 17], size: [2.2, 3.4], leaf: ['#56932e', '#8ab844', '#3f7428'], bark: '#a4988a', tex: 'oak', shape: 0 },
  { name: 'berk', h: [15, 20], r: [0.1, 0.15], crown: [0.5, 1.0], spread: 2.8, cards: [20, 13], size: [1.9, 3.0], leaf: ['#74a83c', '#a4c858', '#588c30'], bark: '#e8e4da', tex: 'birch', shape: 1 },
  { name: 'els', h: [13, 18], r: [0.12, 0.18], crown: [0.42, 1.0], spread: 2.6, cards: [20, 13], size: [2.0, 3.0], leaf: ['#3c6e2c', '#5a8a36', '#2c5424'], bark: '#7a7064', tex: 'oak', shape: 1 },
  { name: 'beuk', h: [30, 34], r: [0.5, 0.62], crown: [0.4, 1.0], spread: 10.5, cards: [90, 60], size: [3.4, 5.4], leaf: ['#5a9632', '#96c24a', '#3e7628'], bark: '#c8c6bc', tex: 'beech', shape: 2 },
  { name: 'opslag', h: [3.5, 7], r: [0.03, 0.05], crown: [0.35, 1.0], spread: 1.3, cards: [7, 0], size: [1.2, 2.0], leaf: ['#7ab23e', '#a8d058', '#5c9634'], bark: '#8a8072', tex: 'oak', shape: 1 },
  // the layers under the roof, which make the wood close and woolly: shrubs leafed to the ground (rowan, juneberry, hazel, elder,
  // holly), young trees that fill the space between the shrubs and the crowns, and the bramble mat over the floor
  { name: 'struik', h: [2.2, 5], r: [0.025, 0.045], crown: [0.04, 1.0], spread: 1.9, cards: [15, 6], size: [1.1, 1.9], fill: 0.9, vary: 0.3, leaf: ['#5e9a34', '#93c450', '#3c6c2a'], bark: '#6a6258', tex: 'oak', shape: 1 },
  { name: 'tussenlaag', h: [7, 12], r: [0.06, 0.1], crown: [0.22, 1.0], spread: 2.6, cards: [24, 9], size: [1.6, 2.6], fill: 0.7, vary: 0.2, leaf: ['#62a036', '#9acb52', '#40742c'], bark: '#7c7468', tex: 'oak', shape: 1 },
  { name: 'braam', h: [0.5, 1.0], r: [0.01, 0.01], crown: [0.25, 1.0], spread: 1.1, cards: [3, 0], size: [1.3, 2.1], fill: 1, vary: 0.25, leaf: ['#4a7e2e', '#6fa23c', '#345e26'], noTrunk: true, tex: 'oak', shape: 1 },
];
function barkTexture(kind, rng) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512; const x = c.getContext('2d');
  if (kind === 'birch') {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(30,26,22,${rng.range(0.25, 0.85)})`; x.fillRect(rng.range(0, 128), rng.range(0, 512), rng.range(6, 34), rng.range(1.5, 5)); }
    const g = x.createLinearGradient(0, 512, 0, 380); g.addColorStop(0, 'rgba(40,34,28,0.95)'); g.addColorStop(1, 'rgba(40,34,28,0)'); x.fillStyle = g; x.fillRect(0, 380, 128, 132);   // the dark, cracked foot
  } else if (kind === 'beech') {
    x.fillStyle = '#e9e9e4'; x.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${rng.pick(['70,74,70', '120,124,112', '60,72,58'])},${rng.range(0.08, 0.3)})`; x.beginPath(); x.ellipse(rng.range(0, 128), rng.range(0, 512), rng.range(6, 30), rng.range(3, 14), 0, 0, 7); x.fill(); }
    for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(50,52,48,${rng.range(0.15, 0.4)})`; x.fillRect(rng.range(0, 128), rng.range(0, 512), rng.range(8, 40), 1.5); }
    const g = x.createLinearGradient(0, 512, 0, 430); g.addColorStop(0, 'rgba(70,96,50,0.6)'); g.addColorStop(1, 'rgba(70,96,50,0)'); x.fillStyle = g; x.fillRect(0, 430, 128, 82);     // moss at the foot
  } else {
    x.fillStyle = '#d8d4cc'; x.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 260; i++) { const px = rng.range(0, 128), w = rng.range(1.5, 5); x.strokeStyle = `rgba(40,34,28,${rng.range(0.18, 0.5)})`; x.lineWidth = w; x.beginPath(); let y = rng.range(-40, 512), xx = px; x.moveTo(xx, y); for (let k = 0; k < 4; k++) { y += rng.range(18, 60); xx += rng.range(-4, 4); x.lineTo(xx, y); } x.stroke(); }
    const g = x.createLinearGradient(0, 512, 0, 440); g.addColorStop(0, 'rgba(60,84,44,0.55)'); g.addColorStop(1, 'rgba(60,84,44,0)'); x.fillStyle = g; x.fillRect(0, 440, 128, 72);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
// a spray of small leaves on twigs, thick in the middle and ragged at the rim, white to light grey so the instance colour is the green
function leafTexture(rng) {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  for (let i = 0; i < 26; i++) { const a = rng.range(0, TAU), r = rng.range(60, 235); x.strokeStyle = 'rgba(70,60,48,0.9)'; x.lineWidth = rng.range(1.5, 3.5); x.beginPath(); x.moveTo(N / 2, N / 2); x.quadraticCurveTo(N / 2 + Math.cos(a + 0.4) * r * 0.5, N / 2 + Math.sin(a + 0.4) * r * 0.5, N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r); x.stroke(); }
  for (let i = 0; i < 620; i++) {
    const a = rng.range(0, TAU), r = Math.pow(rng(), 0.62) * 246, px = N / 2 + Math.cos(a) * r, py = N / 2 + Math.sin(a) * r, l = rng.range(11, 19), w = l * rng.range(0.42, 0.6), v = Math.round(rng.range(150, 255) * (0.72 + 0.28 * (i / 620)));
    x.save(); x.translate(px, py); x.rotate(rng.range(0, TAU)); x.fillStyle = `rgb(${v},${v},${Math.round(v * 0.94)})`; x.beginPath(); x.ellipse(0, 0, l / 2, w / 2, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.16)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-l / 2, 0); x.lineTo(l / 2, 0); x.stroke(); x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// the three trunk shapes, built for a tree 20 m high with a trunk radius of 1 (instances scale height and radius apart):
// 0 an oak that forks into a few rising boughs, 1 a single slender stem, 2 a beech with heavy spreading boughs
function trunkGeometry(shape, rng) {
  const parts = [];
  const limb = (x0, y0, z0, x1, y1, z1, r0, r1, seg = 5, bend = 0) => {
    const g = new THREE.CylinderGeometry(r1, r0, 1, 7, seg, true), P = g.attributes.position, a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), d = b.clone().sub(a), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const t = v.y + 0.5; v.x += Math.sin(t * Math.PI) * bend; v.y = t * L; v.applyQuaternion(q).add(a); P.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); parts.push(g);
  };
  if (shape === 1) { limb(0, 0, 0, rng.range(-1.5, 1.5), 19, rng.range(-1.5, 1.5), 1.15, 0.3, 8, rng.range(-0.8, 0.8)); for (let k = 0; k < 4; k++) { const a = rng.range(0, TAU), y = rng.range(9, 16); limb(0, y, 0, Math.cos(a) * 9, y + rng.range(2, 4), Math.sin(a) * 9, 0.4, 0.1, 3); } }
  else if (shape === 0) {
    const top = 12.5; limb(0, 0, 0, rng.range(-1, 1), top, rng.range(-1, 1), 1.25, 0.8, 7, rng.range(-0.6, 0.6));
    const n = 4; for (let k = 0; k < n; k++) { const a = (k / n) * TAU + rng.range(-0.4, 0.4), r = rng.range(9, 15); limb(0, top - 0.4, 0, Math.cos(a) * r, rng.range(17, 19.5), Math.sin(a) * r, 0.62, 0.14, 4, rng.range(-0.5, 0.5)); }
    for (let k = 0; k < 2; k++) { const a = rng.range(0, TAU); limb(0, rng.range(8, 11), 0, Math.cos(a) * 11, rng.range(11, 14), Math.sin(a) * 11, 0.35, 0.08, 3); }
  } else {
    const top = 8.5; limb(0, 0, 0, 0, top, 0, 1.3, 0.92, 6); limb(0, top - 0.3, 0, rng.range(-0.6, 0.6), 18.5, rng.range(-0.6, 0.6), 0.86, 0.22, 5);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + rng.range(-0.3, 0.3), y = rng.range(6.5, 12.5), r = rng.range(7, 13); limb(0, y, 0, Math.cos(a) * r, y + rng.range(3, 6.5), Math.sin(a) * r, 0.5, 0.1, 4, rng.range(-0.3, 0.3)); }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; limb(Math.cos(a) * 0.9, 0.9, Math.sin(a) * 0.9, Math.cos(a) * 2.3, -0.2, Math.sin(a) * 2.3, 0.5, 0.2, 2); }   // the roots spread at the foot
  }
  // merge, with uv from the angle round the stem and the height
  let n = 0, ni = 0; for (const g of parts) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni); let o = 0, oi = 0;
  for (const g of parts) { const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.set([P.getX(i), P.getY(i) / 20, P.getZ(i)], (o + i) * 3); nor.set([Nn.getX(i), Nn.getY(i), Nn.getZ(i)], (o + i) * 3); uv.set([U.getX(i) * 2, 1 - P.getY(i) / 20], (o + i) * 2); }
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + o; o += P.count; oi += g.index.count; g.dispose(); }
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); G.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); G.setIndex(new THREE.BufferAttribute(idx, 1));
  return G;
}
// points: [{ x, y, z, s, d, v }] (v: index into SPECIES). -> { object, update(dt, t), dispose() }
function makeWood(points, rng, sunDir) {
  const object = new THREE.Group(); object.name = 'het-bos';
  const time = { value: 0 }, disposables = [];
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Pv = new THREE.Vector3(), Sv = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), out = new THREE.Vector3(), eul = new THREE.Euler();
  // --- trunks: one instanced mesh per bark and shape ---
  const groups = new Map();
  for (const p of points) { const sp = SPECIES[p.v], key = sp.tex + sp.shape; if (sp.noTrunk) continue; if (!groups.has(key)) groups.set(key, { sp, list: [] }); groups.get(key).list.push(p); }
  for (const p of points) { const sp = SPECIES[p.v]; p.H = rng.range(sp.h[0], sp.h[1]) * p.s; p.R = rng.range(sp.r[0], sp.r[1]) * p.s; p.yaw = rng.range(0, TAU); p.lean = rng.range(0, 0.045); p.leanA = rng.range(0, TAU); }
  for (const { sp, list } of groups.values()) {
    const geo = trunkGeometry(sp.shape, rng.fork('trunk' + sp.tex + sp.shape)), tex = barkTexture(sp.tex, rng.fork('bark' + sp.tex));
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length); mesh.name = 'stammen-' + sp.tex;
    list.forEach((p, i) => {
      const s2 = SPECIES[p.v];
      eul.set(Math.cos(p.leanA) * p.lean, p.yaw, Math.sin(p.leanA) * p.lean);
      M4.compose(Pv.set(p.x, p.y - 0.15, p.z), Q.setFromEuler(eul), Sv.set(p.R, p.H, p.R));
      mesh.setMatrixAt(i, M4); mesh.setColorAt(i, col.set(s2.bark).multiplyScalar(rng.range(0.78, 1.08)));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false; object.add(mesh); disposables.push(geo, mat, tex);
  }
  // --- crowns: cards of small leaves, turned so that each faces out of its crown and takes the sun on the sun's side ---
  const card = new THREE.BufferGeometry();
  { const pos = [], uv = [], nor = [], idx = [];
    const quad = (ax, ay, az, bx, by, bz) => { const o = pos.length / 3; pos.push(-ax - bx, -ay - by, -az - bz, ax - bx, ay - by, az - bz, ax + bx, ay + by, az + bz, -ax + bx, -ay + by, -az + bz); uv.push(0, 0, 1, 0, 1, 1, 0, 1); for (let k = 0; k < 4; k++) nor.push(0, 1, 0); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    quad(0.5, 0, 0, 0, 0.08, 0.5); quad(0.5, 0.1, 0, 0, 0.42, -0.26); quad(0, 0.1, 0.5, 0.26, 0.42, 0);   // one lying nearly flat, two leaning: a spray, not a ball
    card.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); card.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); card.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); card.setIndex(idx); }
  const ltex = leafTexture(rng.fork('leaf'));
  const lmat = new THREE.MeshStandardMaterial({ map: ltex, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.78, metalness: 0, emissive: '#ffffff', emissiveMap: ltex, emissiveIntensity: 0.0 });
  lmat.onBeforeCompile = (sh) => {
    sh.uniforms.uWoodTime = time; sh.uniforms.uWoodSun = { value: sunDir.clone() };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWoodTime; varying float vWoodThru;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 c = instanceMatrix[3].xyz; float g = 0.6 + 0.4 * sin(uWoodTime * 0.35 + c.x * 0.05 + c.z * 0.04);
          transformed.x += g * 0.035 * sin(uWoodTime * 1.5 + c.x * 0.9 + c.y * 0.6 + position.z * 4.0); transformed.z += g * 0.03 * cos(uWoodTime * 1.2 + c.z * 0.8 + position.x * 4.0); transformed.y += g * 0.012 * sin(uWoodTime * 2.1 + c.x + c.z); }`);
    // sunlight through the leaves: a card seen against the sun glows the yellow-green of a leaf held to the light
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uWoodSun;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 sv = normalize((viewMatrix * vec4(uWoodSun, 0.0)).xyz); float thru = pow(max(-dot(normalize(vViewPosition), sv), 0.0), 2.0);
          totalEmissiveRadiance = diffuseColor.rgb * vec3(1.25, 1.2, 0.55) * (0.1 + 0.75 * thru); }`);
  };
  lmat.customProgramCacheKey = () => 'woods-leaves';
  let total = 0; for (const p of points) { const sp = SPECIES[p.v]; p.cards = p.d < 55 ? sp.cards[0] : sp.cards[1]; total += p.cards; }
  const leaves = new THREE.InstancedMesh(card, lmat, total); leaves.name = 'kruinen'; let n = 0;
  const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();
  for (const p of points) {
    const sp = SPECIES[p.v], far = p.d >= 55, y0 = p.H * sp.crown[0], y1 = p.H * sp.crown[1], cy = (y0 + y1) / 2, ry = (y1 - y0) / 2, rr = sp.spread * p.s * (p.H / ((sp.h[0] + sp.h[1]) / 2));
    cA.set(sp.leaf[0]); cB.set(sp.leaf[1]); cC.set(sp.leaf[2]);
    const vr = sp.vary || 0, tone = rng.range(0.88 - vr, 1.1 + vr * 0.4), warm = vr ? rng.range(-vr, vr) : 0;
    if (vr) { cA.offsetHSL(warm * 0.06, 0, 0); cB.offsetHSL(warm * 0.06, 0, 0); }   // one shrub yellower, the next bluer and darker: several kinds grow together
    for (let k = 0; k < p.cards; k++) {
      // in the outer shell of a crown that is widest two thirds of the way up, thinner below (the boughs carry leaves at their ends)
      const a = rng.range(0, TAU), v = rng.range(-1, 1), shell = Math.pow(rng(), sp.fill ?? 0.45), w = Math.sqrt(Math.max(0, 1 - v * v)) * (v < 0 ? 0.75 + 0.25 * (1 + v) : 1);
      out.set(Math.cos(a) * w, v * 0.9 + 0.25, Math.sin(a) * w).normalize();
      Pv.set(p.x + Math.cos(a) * w * rr * shell, p.y + cy + v * ry, p.z + Math.sin(a) * w * rr * shell);
      Q.setFromUnitVectors(up, out.lerp(up, 0.35).normalize()); Q.multiply(new THREE.Quaternion().setFromAxisAngle(up, rng.range(0, TAU)));
      const size = rng.range(sp.size[0], sp.size[1]) * (far ? 2.0 : 1) * Math.min(1.25, p.s);
      M4.compose(Pv, Q, Sv.set(size, size, size)); leaves.setMatrixAt(n, M4);
      const light = 0.5 + 0.5 * v, sun = Math.max(0, Math.cos(a) * sunDir.x + Math.sin(a) * sunDir.z);
      col.copy(cC).lerp(cA, Math.min(1, light * 1.2)).lerp(cB, 0.55 * light * shell + 0.3 * sun).multiplyScalar(tone * (0.72 + 0.28 * shell) * rng.range(0.9, 1.08));
      leaves.setColorAt(n, col); n++;
    }
  }
  leaves.instanceMatrix.needsUpdate = true; leaves.instanceColor.needsUpdate = true; leaves.frustumCulled = false; object.add(leaves); disposables.push(card, lmat, ltex);
  return { object, trunks: points.length, cards: total, update(dt, t) { time.value = t; }, dispose() { for (const d of disposables) d.dispose(); } };
}
// sun flecks on the floor of the wood: a sheet laid on the ground wherever trees stand, which darkens it to shade except in drifting patches
function makeDapple(hAt, forestAt, bounds, rng) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  x.fillStyle = '#6f7480'; x.fillRect(0, 0, N, N);                                   // shade: darker and a little blue
  for (let i = 0; i < 150; i++) { const px = rng.range(0, N), py = rng.range(0, N), r = rng.range(5, 24);
    for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) { const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, `rgba(255,250,232,${rng.range(0.5, 0.95)})`); g.addColorStop(1, 'rgba(255,250,232,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(px + ox, py + oy, r, r * rng.range(0.5, 1), rng.range(0, 3), 0, 7); x.fill(); } }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const [x0, z0, x1, z1] = bounds, step = 4, nx = Math.floor((x1 - x0) / step), nz = Math.floor((z1 - z0) / step), pos = [], uv = [], idx = [], id = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
  const inside = (i, k) => forestAt(x0 + i * step, z0 + k * step) > 0;
  const vert = (i, k) => { const q = k * (nx + 1) + i; if (id[q] < 0) { const px = x0 + i * step, pz = z0 + k * step; id[q] = pos.length / 3; pos.push(px, hAt(px, pz) + 0.07, pz); uv.push(px / 19, pz / 19); } return id[q]; };
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) if (inside(i, k) && inside(i + 1, k) && inside(i, k + 1) && inside(i + 1, k + 1)) { const a = vert(i, k), b = vert(i + 1, k), d = vert(i, k + 1), e = vert(i + 1, k + 1); idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ map: tex, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6, toneMapped: false });
  const mesh = new THREE.Mesh(g, m); mesh.name = 'zonnevlekken'; mesh.renderOrder = 1;
  return { object: mesh, update(dt, t) { tex.offset.set(Math.sin(t * 0.21) * 0.012, Math.cos(t * 0.17) * 0.012); }, dispose() { g.dispose(); m.dispose(); tex.dispose(); } };
}

// ---------- kabouters ----------
// They live here and would rather not be seen. Each one keeps a tree trunk (or a signpost, a hive, a compost bin) between
// itself and whoever comes by: it stands on the far side and moves round as the eye moves. Now and then curiosity wins and
// it leans out past the edge for a look, hat first, and is gone again. Come too close and it does not look at all.
function kabouter(m, rng) {
  const g = new THREE.Group(); g.name = 'kabouter';
  const coat = mat(rng.pick(['#3a5fa8', '#3f7a4c', '#7a5a34', '#4a6a8a'])), hat = mat(rng.pick(['#c8281e', '#c8281e', '#d8431c', '#b01c2c'])), skin = mat('#e8b896'), beard = mat('#f2efe6'), boot = mat('#3a2a1c');
  const add = (geo, ma, x, y, z) => { const o = new THREE.Mesh(geo, ma); o.position.set(x, y, z); g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.13, 0.19, 0.34, 10), coat, 0, 0.25, 0);
  add(new THREE.SphereGeometry(0.13, 12, 10), skin, 0, 0.5, 0);
  const b = add(new THREE.ConeGeometry(0.12, 0.3, 10), beard, 0, 0.36, 0.09); b.rotation.x = Math.PI;
  add(new THREE.SphereGeometry(0.035, 8, 6), skin, 0, 0.49, 0.13);
  const h = add(new THREE.ConeGeometry(0.15, 0.46, 12), hat, 0, 0.8, -0.01); h.rotation.x = -0.12;
  for (const x of [-0.08, 0.08]) add(new THREE.SphereGeometry(0.07, 8, 6), boot, x, 0.06, 0.05).scale.set(1, 0.7, 1.5);
  for (const x of [-0.05, 0.05]) add(new THREE.SphereGeometry(0.018, 6, 5), boot, x, 0.53, 0.115);
  return g;
}
// covers: [{ x, z, r }] the things they hide behind. -> { object, update(dt, t, camera), count }
function makeKabouters(m, rng, covers, hAt) {
  const object = new THREE.Group(); object.name = 'kabouters';
  const list = covers.map((c) => { const o = kabouter(m, rng), s = rng.range(1.25, 1.7); o.scale.setScalar(s); object.add(o);
    return { o, c, s, side: rng.sign(), every: rng.range(7, 13), phase: rng.range(0, 13), look: rng.range(1.6, 2.6), peek: 0, bob: rng.range(0, 6) }; });
  const cam = new THREE.Vector3();
  return { object, count: list.length,
    update(dt, t, camera) {
      cam.setFromMatrixPosition(camera.matrixWorld);
      for (const k of list) {
        const c = k.c, dx = cam.x - c.x, dz = cam.z - c.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        // a look every `every` seconds or so, `look` seconds long; none while the eye is within 6 m, and a longer, bolder one from far off
        const cycle = (t + k.phase) % k.every, want = d > 6 && d < 70 && cycle < k.look + (d > 25 ? 1.2 : 0) ? 1 : 0;
        if (cycle < dt * 1.5) k.side = -k.side;                                   // the other side of the trunk next time
        k.peek += (want - k.peek) * (1 - Math.exp(-dt * (want ? 3.2 : 9)));       // out slowly, back in a hurry
        const back = c.r + 0.22 * k.s, out = (c.r + 0.34 * k.s) * k.peek * k.side;
        const x = c.x - ux * back * (1 - 0.75 * k.peek) + -uz * out, z = c.z - uz * back * (1 - 0.75 * k.peek) + ux * out;
        k.o.position.set(x, hAt(x, z) + 0.012 * Math.sin(t * 2.2 + k.bob), z);
        k.o.rotation.set(0, Math.atan2(cam.x - x, cam.z - z), -0.3 * k.peek * k.side);   // facing the eye, leaning out round the edge
      }
    } };
}

export default {
  id: 'ai-lab-in-the-woods',
  name: 'The AI Lab in the Woods',
  category: 'wilderness',
  weirdness: 0.02,
  calm: 1,
  async build(ctx) {
    const rng = ctx.rng, noise = ctx.noise, DURATION = 105;
    const scene = new THREE.Scene(), C = (h) => new THREE.Color(h), m = M();
    const updates = [], warn = (what, e) => console.warn('ai-lab: ' + what, e);
    // one piece of the kit that will not build does not take the whole wood with it
    const attempt = async (what, fn) => { try { const r = await fn(); if (r && r.object) scene.add(r.object); if (r && r.update) updates.push(r); return r; } catch (e) { warn(what, e); return null; } };

    // ----- the light: a late summer afternoon, the sun low ahead and to the left, through the crowns -----
    // the last hour of a summer day: the sun low ahead and to the left, so the meadow is lit along its length and the light comes
    // through the wood in shafts; a sky that is still blue overhead
    const sunDir = new THREE.Vector3(-0.52, 0.36, -0.66).normalize(), sunCol = C('#ffe0ac');
    const sky = SKY.makeSky({ rng, preset: 'goldenHour', sunDirection: sunDir, sunColor: sunCol, zenith: '#346ac0', mid: '#8fb4e4', horizon: '#f8dfa8', sunGlow: 0.9,
      clouds: { coverage: 0.5, softness: 0.6, lit: '#fff0d0', shade: '#8f94ae', silver: 1.6, wind: [0.01, -0.012] }, lightColor: sunCol, lightIntensity: 3.0, ambientIntensity: 1.55 });
    scene.add(sky.object);
    const haze = sky.colorAt(new THREE.Vector3(0, 0.05, -1).normalize(), new THREE.Color()).lerp(C('#dfe8d4'), 0.5);
    scene.fog = new THREE.FogExp2(haze.lerp(C('#f6e2b4'), 0.25), 0.0021);
    const rig = SKY.makeLightRig(sky, { intensity: 1, ambient: 1, bounce: 0.4 });
    scene.add(rig.object);
    await ctx.yield();

    // ----- the route -----
    const j = (a) => rng.range(-a, a), G = GROUND;
    const path = makePath([
      // it opens high over the west meadow, the whole wood ahead and the water shining to the north, and comes down onto
      // the cart track that runs in from the west under its line of trees
      [-470, G + 58, 196], [-430, G + 44, 168], [-388, G + 20, 128], [-352, G + 5, 100], [-318, G + 2.8, 80], [-282, G + 2.5, 66], [-250, G + 2.4, 52], [-222, G + 2.4, 43],
      [-200, G + 2.5, 46], [-182, G + 2.6, 58], [-162, G + 3.0, 72], [-140 + j(1.5), G + 3.4, 88], [-114, G + 3.0, 86], [-98, G + 2.6, 68], [-95, G + 2.3, 44], [-92, G + 2.1, 22],
      [-82, G + 2.0, 2], [-66, G + 2.2, -12], [-44, G + 2.5, -13], [-24, G + 2.8, -12], [-22, G + 2.9, -30], [-32, G + 2.6, -46], [-48, G + 2.4, -60], [-72, G + 2.2, -62],
      [-96, G + 2.2, -60], [-112, G + 2.1, -52], [-123, G + 2.0, -40], [RING.x, G + 2.0, RING.z],
    ]);
    const pTab = []; for (let i = 0; i <= 160; i++) { const q = path.pointAt(i / 160); pTab.push(q.x, q.z); }
    const pathD = (x, z) => { if (x < -490 || x > 35 || z < -120 || z > 215) return 99; let b = 1e9; for (let i = 0; i < pTab.length; i += 2) { const dx = pTab[i] - x, dz = pTab[i + 1] - z, q = dx * dx + dz * dz; if (q < b) b = q; } return Math.sqrt(b); };

    // ----- the lie of the land: where the wood is, where the meadows are, the yard, the beek -----
    const beekD = (x, z) => lineD(BEEK, x, z);
    const edge = (x, z) => 3 * noise.n2(x * 0.03 + 3, z * 0.03 - 7);
    const SITES = { house: [0, 0], atelier: [12, -13], stable: [14, -36], barn: [-52, -80], garden: [-78, -82], workshop: [-128, -66], cottage: [-107, -81], lodge: [-64, 4], cabin: [-76, 64], gatehouse: [-194, 25], oak: [-136, 68] };
    const near = (s, x, z, r) => Math.hypot(x - s[0], z - s[1]) < r;
    const meadowAt = (x, z) => inPoly(MEADOW, x, z) || inPoly(MEADOW_W, x, z) || inPoly(MEADOW_SE, x, z);
    const yardAt = (x, z) => Math.hypot((x - 2) * 0.85, (z - 18) * 0.8) < 27 + edge(x, z);   // the lawn and the gravel round the house, mostly to its south
    // the clearing in the middle of the wood: the garden, the old barn, the Cottage and the Workshop on one lawn
    const clearAt = (x, z) => yardAt(x, z) || Math.hypot((x + 92) / 50, (z + 70) / 21) < 1 + edge(x, z) * 0.03 || near(SITES.lodge, x, z, 8) || near(SITES.cabin, x, z, 7) || near(SITES.gatehouse, x, z, 8)
      || Math.hypot(x - RING.x, z - RING.z) < RING.r - 2.5 || Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.5
      || PROPS.some((q) => near(q, x, z, q[2]));   // an opening round each prop of the story, out to the way
    const beltAt = (x, z) => { for (const b of BELTS) if (segD(x, z, b[0], b[1], b[2], b[3]) < 5) return 1; return 0; };
    const woodAt = (x, z) => inPoly(ESTATE, x + edge(x, z), z + edge(z, x));
    const forestAt = (x, z) => (meadowAt(x, z) ? 0 : woodAt(x, z) ? (clearAt(x, z) ? 0 : 1) : beltAt(x, z));
    const baseH = (x, z) => {
      let h = G + 0.32 * noise.fbm2(x * 0.012, z * 0.012, 3) + 0.08 * noise.n2(x * 0.09, z * 0.09);
      if (z < -95 && forestAt(x, z)) h += 0.13 * Math.sin(x * 0.9) * smoothstep(-95, -125, z);   // the old planting ridges (rabatten) in the wet north wood
      const bd = beekD(x, z); if (bd < 4) h -= 0.95 * (1 - smoothstep(0.6, 4, bd));
      const pd = Math.hypot(x - POND.x, z - POND.z); if (pd < POND.r + 3) h -= 1.1 * (1 - smoothstep(POND.r * 0.35, POND.r + 3, pd));
      return h;
    };
    const cMeadow = C('#6f8f3c'), cMeadow2 = C('#8fa24a'), cDry = C('#a9a45a'), cLitter = C('#9a7a50'), cLitter2 = C('#7a5e3c'), cSand = C('#c2ad80'), cGravel = C('#b9b2a2'), cMud = C('#3d3a2a'), cLawn = C('#5f8a3a'),
      cField = C('#9aa35e'), cField2 = C('#b9b47c'), cBeech = C('#8f5c2c'), cMoss = C('#5f7a36');
    const groundColor = (x, z, h, ny, out) => {
      const n = noise.fbm2(x * 0.03, z * 0.03, 2) * 0.5 + 0.5, pd = pathD(x, z), wood = woodAt(x, z) && !meadowAt(x, z);
      if (wood && !clearAt(x, z)) out.copy(cLitter).lerp(cLitter2, n).lerp(cMoss, 0.55 * smoothstep(0.1, 0.6, noise.n2(x * 0.07 + 13, z * 0.07)) * smoothstep(1.6, 4, pd)).lerp(cBeech, 0.6 * (1 - smoothstep(14, 32, Math.hypot(x - RING.x, z - RING.z))));   // old beech leaves lie under the ring, as they do all year
      else if (wood) out.copy(cLawn).lerp(cMeadow2, n * 0.5);
      else if (meadowAt(x, z)) out.copy(cMeadow).lerp(cMeadow2, n).lerp(cDry, smoothstep(0.55, 0.9, noise.n2(x * 0.011 + 9, z * 0.011) * 0.5 + 0.5) * 0.6);
      else { const stripe = 0.5 + 0.5 * Math.sin((x * 0.77 + z * 0.64) * 0.9); out.copy(cField).lerp(cField2, 0.35 * stripe + 0.4 * n); if (beltAt(x, z)) out.lerp(cLitter, 0.7); }   // the farmland round the estate, mown in strips
      if (yardAt(x, z)) out.lerp(cGravel, smoothstep(9, 4, Math.hypot(x + 16, z + 12)) * 0.8);   // the gravel before the house
      // the way itself: a sandy lane through the wood, two cart ruts through the grass
      if (pd < 3) { const k = wood ? 1 - smoothstep(1.1, 2.4, pd) : 0.55 * (1 - smoothstep(0.3, 0.9, Math.abs(pd - 0.8))); out.lerp(cSand, k * (0.75 + 0.25 * n)); }
      const bd = beekD(x, z); if (bd < 3) out.lerp(cMud, 1 - smoothstep(0.8, 3, bd));
      const pp = Math.hypot(x - POND.x, z - POND.z); if (pp < POND.r + 2) out.lerp(cMud, 1 - smoothstep(POND.r - 1, POND.r + 2, pp));
      return out;
    };
    await ctx.yield();
    const land = await T.makeTerrainAsync({ rng: rng.fork('land'), noise, path, height: baseH, bounds: [-900, -700, 520, 780], cell: 2.5, near: 40, levels: 4, refine: 1, maxTriangles: 36000,
      biome: 'meadow', palette: { tufts: 0.8, pebbles: 0.15, cracks: 0, clouds: 0.35, patchAmount: 0 }, color: groundColor, shadow: 0, ao: 0, skirt: 20,
      corridor: { clearance: 1.6, width: 5, slope: 0.3 } }, () => ctx.yield());
    scene.add(land.object);
    const hAt = (x, z) => land.heightAt(x, z);
    await ctx.yield();
    // the far edge of a flat country: lines of trees, never hills
    await attempt('tree lines', () => T.makeHorizonRidges({ rng: rng.fork('lines'), layers: 3, radius: [430, 640], height: [11, 24], base: G - 2, jagged: 0.55, coverage: 1,
      colorNear: C('#31482a'), fog: scene.fog, sunDir, sunColor: sunCol, sunIntensity: 0.5, rim: 0.2 }));
    await ctx.yield();

    // ----- water: the brook through the middle, the small pool by the beeches -----
    { const pos = [], idx = [], y = G - 0.52; let n = 0;
      for (let k = 0; k < BEEK.length - 1; k++) { const a = BEEK[k], b = BEEK[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, w = 1.5;
        pos.push(a[0] - nx * w, y, a[1] - nz * w, a[0] + nx * w, y, a[1] + nz * w, b[0] - nx * w, y, b[1] - nz * w, b[0] + nx * w, y, b[1] + nz * w); idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
        if (k) idx.push(n - 2, n, n - 1, n - 1, n, n + 1);   // the bend between this reach and the last
        n += 4; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const beek = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#4a5c50', roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.86, side: THREE.DoubleSide })); beek.name = 'de-beek'; scene.add(beek); }
    // the water, two kilometres off to the north: a band of light under the sky
    { const lake = new THREE.Mesh(new THREE.PlaneGeometry(5200, 1500), new THREE.MeshStandardMaterial({ color: '#cfe0ee', roughness: 0.08, metalness: 0.75, emissive: '#f6e6c0', emissiveIntensity: 0.25 }));
      lake.rotation.x = -Math.PI / 2; lake.position.set(-100, G - 0.2, -1450); lake.name = 'het-water'; scene.add(lake); }
    const pondLevel = G - 0.45;
    const pond = await attempt('pond', () => W.makeLake({ rng: rng.fork('pond'), light: W.waterLight(sky), level: pondLevel, center: [POND.x, POND.z], radius: POND.r + 2.5, segments: 28,
      depthAt: (x, z) => pondLevel - hAt(x, z), deep: '#1d2b22', shallow: '#6a6440', shoreFoam: 0, clarity: 0.6, ripple: 0.5 }));
    if (!pond) { const d = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 28), new THREE.MeshStandardMaterial({ color: '#2c3a30', roughness: 0.1, metalness: 0.3 })); d.rotation.x = -Math.PI / 2; d.position.set(POND.x, pondLevel, POND.z); scene.add(d); }
    await ctx.yield();

    // ----- trees: oak coppice grown tall, birch and alder in the wet north, the six beeches, the oak that stands alone -----
    const wind = flora.makeWind({ direction: [0.8, -0.6], strength: 0.55, speed: 0.8 });
    const treeMatOpts = { wind, backlight: 0.6, backlightTint: '#ffe9a6' };
    if (flora.prepareLeafTexture) await flora.prepareLeafTexture(treeMatOpts, () => ctx.yield());
    const treeMat = flora.windMaterial(treeMatOpts);
    const oakLeaf = { leaf: '#4f8a30', leafLight: '#b4d05a', leafDark: '#2c5626', bark: '#6f6557', barkDark: '#3f382f', barkLight: '#8a8072' };
    const beechLeaf = { leaf: '#4f8434', leafLight: '#b9cf62', leafDark: '#2a5026', bark: '#8f8c84', barkDark: '#5c5a54', barkLight: '#a9a69e' };
    const rt = rng.fork('treepts');
    const treePts = flora.scatterPoints({ rng: rt, path, count: 950, radius: 110, corridor: 5.2, spacing: 4.4, falloff: 0.3, heightAt: hAt, scale: [0.85, 1.15],
      density: (x, z) => (forestAt(x, z) && beekD(x, z) > 3 ? 1 : 0) })
      // and the rest of the wood, out to its edges, which the flight only sees from across the meadow and the fields
      .concat(flora.scatterPoints({ rng: rt, path, bounds: [-400, -230, 120, 330], count: 1500, spacing: 5.6, heightAt: hAt, scale: [0.85, 1.15], density: (x, z) => (forestAt(x, z) && pathD(x, z) > 60 ? 1 : 0) }));
    for (const p of treePts) { const wet = smoothstep(-100, -160, p.z); p.v = rt.chance(0.2 + 0.5 * wet) ? (rt.chance(0.5 + 0.2 * wet) ? 3 : 2) : rt.int(0, 1); }
    const plant = (x, z, sc, v) => { const nn = path.nearestXZ(x, z); treePts.push({ x, y: hAt(x, z), z, s: sc, rot: rt() * TAU, d: nn.dist, u: nn.u, v }); };
    for (let k = 0; k < 6; k++) { const a = ((k + 0.5) / 6) * TAU; plant(RING.x + Math.cos(a) * RING.r, RING.z + Math.sin(a) * RING.r, rt.range(0.95, 1.05), 4); }   // the ring: the way in from the east lies between two of them
    plant(SITES.oak[0], SITES.oak[1], 0.62, 4);                               // the great oak alone in the meadow
    plant(SITES.house[0] - 14, SITES.house[1] + 20, 0.8, 4);                 // the beech at the house
    for (const [x, z, sc] of [[-121, 77, 0.95], [-172, 84, 0.9], [-128, 30, 0.85]]) plant(x, z, sc, 1);   // the other free-standing trees in the meadow
    // saplings between the trunks, near the way
    for (const q of flora.scatterPoints({ rng: rt, path, count: 380, radius: 45, corridor: 3.2, spacing: 2.2, falloff: 0.6, heightAt: hAt, scale: [0.8, 1.3], density: (x, z) => (forestAt(x, z) && beekD(x, z) > 2 ? 0.8 : 0) })) { q.v = 5; treePts.push(q); }
    await ctx.yield();
    // the shrub layer, close up to the way so the wood stands round it; the young trees above that; the bramble mat on the floor
    const under = (v, o) => { for (const q of flora.scatterPoints({ rng: rt, path, heightAt: hAt, ...o })) { q.v = v; treePts.push(q); } };
    // (not between the way and a hut or a prop: each keeps its view of the path, and the path of it)
    const open = (x, z) => Math.hypot((x + 92) / 62, (z + 68) / 30) < 1 || near(SITES.house, x, z, 36) || near(SITES.lodge, x, z, 18) || near(SITES.cabin, x, z, 16) || near(SITES.gatehouse, x, z, 18) || near([RING.x, RING.z], x, z, RING.r + 3) || PROPS.some((q) => near(q, x, z, q[2] + 4));
    const inWood = (x, z) => (forestAt(x, z) && beekD(x, z) > 1.8 && !open(x, z) ? 1 : 0), patchy = (x, z, f, lo) => lo + (1 - lo) * smoothstep(-0.25, 0.35, noise.n2(x * f + 31, z * f - 17));
    under(6, { count: 2100, radius: 62, corridor: 3.0, spacing: 1.7, falloff: 0.45, scale: [0.75, 1.3], density: (x, z) => inWood(x, z) * patchy(x, z, 0.05, 0.35) });
    under(7, { count: 520, radius: 75, corridor: 4.6, spacing: 3.4, falloff: 0.4, scale: [0.8, 1.25], density: (x, z) => inWood(x, z) * patchy(x, z, 0.03, 0.4) });
    under(8, { count: 5200, radius: 40, corridor: 1.7, spacing: 0.85, falloff: 0.6, scale: [0.8, 1.3], density: (x, z) => inWood(x, z) * patchy(x, z, 0.09, 0.15) });
    under(6, { bounds: [-400, -230, 120, 330], count: 1700, spacing: 3.6, scale: [0.9, 1.5], density: (x, z) => (forestAt(x, z) && pathD(x, z) > 62 ? 1 : 0) });
    await ctx.yield();
    const wood = await attempt('wood', () => makeWood(treePts, rng.fork('wood'), sunDir));
    await ctx.yield();
    const dapple = await attempt('dapple', () => makeDapple(hAt, (x, z) => (forestAt(x, z) && !beltAt(x, z) ? 1 : 0), [-320, -240, 120, 340], rng.fork('dapple')));
    await ctx.yield();

    // ----- under the trees and in the grass -----
    const shade = undefined, tmpC = new THREE.Color(), gCol = (x, z, y) => groundColor(x, z, y, 1, tmpC);
    await attempt('ferns', () => flora.makeFerns({ rng: rng.fork('ferns'), path, radius: 42, corridor: 1.6, count: 1100, scale: [0.4, 0.85], heightAt: hAt, wind, map: treeMat.map, density: (x, z) => (forestAt(x, z) ? 1 : 0) }));
    await ctx.yield();
    // the bramble mat under the oaks, and the hedgerows between the meadows
    await attempt('brambles', () => flora.makeBushes({ rng: rng.fork('bramble'), path, radius: 60, corridor: 3.5, count: 420, heightAt: hAt, wind, map: treeMat.map, scale: [0.6, 1.3],
      density: (x, z) => (pathD(x, z) < 5 ? 0 : beltAt(x, z) ? 1 : forestAt(x, z) ? 0.5 : 0) }));
    await ctx.yield();
    const grassAt = (x, z) => (beekD(x, z) < 1.6 || pathD(x, z) < 0.45 ? 0 : meadowAt(x, z) ? 1 : !woodAt(x, z) ? (beltAt(x, z) ? 0.2 : 0.8) : clearAt(x, z) && !near([-14, -12], x, z, 15) && !near(SITES.garden, x, z, 14) ? 0.4 : 0);
    const mkGrass = (o) => (flora.makeGrassAsync ? flora.makeGrassAsync(o, () => ctx.yield()) : Promise.resolve(flora.makeGrass(o)));
    await attempt('grass', () => mkGrass({ rng: rng.fork('grass'), path, radius: 34, count: 26000, bias: 2.4, width: [0.5, 0.95], height: [0.3, 0.7], cards: 3, root: '#3f6a22', tip: '#9ccf58', tint: 0.3,
      heightAt: hAt, heightStep: 4, groundColor: gCol, shade, wind, map: treeMat.map, flowers: 0, fade: [105, 150], chunks: 8, density: grassAt }));
    await ctx.yield();
    await attempt('far grass', () => mkGrass({ rng: rng.fork('fargrass'), path, radius: 95, count: 5200, bias: 1.2, width: [2.2, 4.2], height: [0.45, 0.95], cards: 2, root: '#3f5a22', tip: '#b9c866', tint: 0.3,
      heightAt: hAt, heightStep: 8, groundColor: gCol, wind, map: treeMat.map, flowers: 0, fade: [200, 260], chunks: 4, density: (x, z, lat) => (lat < 26 ? 0 : (meadowAt(x, z) || !woodAt(x, z)) && beekD(x, z) > 2 ? 1 : 0) }));
    await ctx.yield();
    // oxeye daisies, buttercups, self-heal
    await attempt('flowers', () => flora.makeFlowers({ rng: rng.fork('flowers'), path, radius: 40, count: 900, scale: [0.3, 0.6], heightAt: hAt, wind, map: treeMat.map, colors: ['#f6f3e6', '#f6f3e6', '#f2cf4a', '#8f6fd0'],
      density: (x, z) => (meadowAt(x, z) && pathD(x, z) > 0.9 && beekD(x, z) > 2 ? 0.35 + 0.65 * smoothstep(-0.1, 0.5, noise.n2(x * 0.03, z * 0.03 + 5)) : 0) }));
    await ctx.yield();
    // marsh marigolds on the banks of the beek
    await attempt('marigolds', () => flora.makeFlowers({ rng: rng.fork('dotters'), bounds: [-120, -45, 110, 225], count: 520, scale: [0.35, 0.65], corridor: 0, heightAt: hAt, wind, map: treeMat.map, colors: ['#f6c81e', '#f2b810'],
      density: (x, z) => { const d = beekD(x, z); return d > 1.3 && d < 3.2 ? 1 : 0; } }));
    await ctx.yield();
    // soft rush and reed along the beek and in the wet west meadow
    await attempt('reeds', () => flora.makeReeds({ rng: rng.fork('reeds'), bounds: [-120, -45, 110, 225], count: 420, corridor: 0, heightAt: hAt, wind, map: treeMat.map,
      density: (x, z) => { const d = beekD(x, z); return d > 1.4 && d < 4.5 && pathD(x, z) > 2.5 ? 1 : 0; } }));
    await ctx.yield();

    // ----- what people built: plain, and little of it -----
    const built = new THREE.Group(); built.name = 'gebouwen'; scene.add(built);
    const put = (o, x, z, ry = 0, lift = 0, k = 1) => { o.position.set(x, hAt(x, z) + lift, z); o.rotation.y = ry; o.scale.multiplyScalar(k); built.add(o); return o; };
    put(welcomeBoard(m), -300, 79.5, 1.0);                                    // where the track comes in from the west
    const gr = put(tinyHouse(m, 'het-poorthuis', true), SITES.gatehouse[0], SITES.gatehouse[1], 0.7);   // at the corner of the meadow, by the track
    put(gate(m), -189, 54.5, 1.05);
    put(highSeat(m), SITES.oak[0] + 3.2, SITES.oak[1] + 1.5, 0.6);
    put(tinyHouse(m, 'de-cabine', false), SITES.cabin[0], SITES.cabin[1], -1.5);   // past the Lodge, behind a thicket, looking over the meadow
    put(lodgeHut(m), SITES.lodge[0], SITES.lodge[1], -0.8);                   // at the meadow's north-east tip, looking down it
    put(footbridge(m), -81, 1, -0.85, 0.12);
    put(whiteHouse(m), SITES.house[0], SITES.house[1], -0.75);                // its gable and the tables to the lawn on the south-west
    put(outhouse(m), SITES.atelier[0], SITES.atelier[1], -0.75);              // the atelier
    put(barn(m), SITES.stable[0], SITES.stable[1], 0.8);                      // the stable
    put(barn(m), SITES.barn[0], SITES.barn[1], 0.1);                          // the old wagon barn by the garden
    put(garden(m, rng.fork('garden')), SITES.garden[0], SITES.garden[1], 0.1);
    put(hives(m), -66, -68.5, 0.1);
    put(cottageHut(m), SITES.cottage[0], SITES.cottage[1], 0.1);
    put(workshopHut(m), SITES.workshop[0], SITES.workshop[1], 1.2);           // the Workshop, where the team builds
    // the swing hangs inside the ring, from a bough of the beech to the left of the way in
    const sw = swing(m); { const a = (1.5 / 6) * TAU, bx = RING.x + Math.cos(a) * RING.r, bz = RING.z + Math.sin(a) * RING.r; sw.position.set(bx * 0.45 + RING.x * 0.55, hAt(bx, bz) + 8.6, bz * 0.45 + RING.z * 0.55); sw.rotation.y = a + Math.PI / 2; built.add(sw); }
    // rail fences: the meadow's south side with the way through, and the cow meadow by the Lodge
    const fence = (pts) => attempt('fence', () => S.makeFence({ rng: rng.fork('fence' + pts[0][0]), points: pts.map(([x, z]) => [x, hAt(x, z), z]), type: 'rail', heightAt: hAt }));
    await attempt('garden paling', () => S.makeFence({ rng: rng.fork('paling'), points: [[-91, 0, -69], [-65, 0, -69], [-65, 0, -95], [-91, 0, -95], [-91, 0, -69]].map(([x, y, z]) => [x, hAt(x, z), z]), type: 'picket', height: 1.0, heightAt: hAt, palette: { wood: '#a8926a' } }));
    await fence([[-205, 57], [-198, 78], [-190, 97], [-172, 117], [-154, 136]]); await fence([[-183, 52.5], [-172, 41], [-163, 30]]);
    await ctx.yield();

    // ----- the story, left about the place as things -----
    put(bigBoard(m), -396, 135.6, -0.81);                                     // high over the way in, flown over
    // (larger than life, every one of them: the flight should not have to look for them, and slows down to read them)
    put(vendorCage(m), -225.2, 50.6, -2.97, 0, 1.7);                          // the lockdown reflex, rusting in the hedge
    { const lr = rng.fork('laptops'); for (const [x, z, ry] of [[-181.9, 63.6, 2.54], [-161.5, 66.8, -0.63], [-152.8, 86, 2.47], [-133.1, 84.7, -0.03], [-113.1, 90.5, -2.67]]) put(stumpLaptop(m, lr), x, z, ry, 0, 2.4); }
    put(pilotShed(m), -87.4, 50, -0.53, 0, 1.5);                              // the pilot that ran once
    put(chairStack(m), -18.6, -9.2, -1.71, 0, 1.4);                           // no seats, on the lawn by the farmhouse
    put(planPost(m), -38, -49, 0.77, 0, 1.6);                                 // the three steps, where the way turns into the wood
    const wv = put(vane(m), -94, -67.6, 1.34, 0, 1.6);                        // any model, switch anytime
    put(cellar(m), -122.1, -55.8, 1.73, 0, 1.5);                              // your data stays here
    put(springSign(m), -77.9, -15.9, -0.34, 0, 2.0);                          // by the brook at the footbridge: every answer shows its source
    put(noticeBoard(m), -132.8, -35.4, 2.15, 0, 1.8);                         // where the way comes into the ring: the next process, pinned by colleagues
    updates.push({ update(dt, t) { wv.userData.arm.rotation.y = 0.35 * Math.sin(t * 0.3) + 0.12 * Math.sin(t * 1.1 + 1.3); } });   // the vane never settles
    await ctx.yield();

    // ----- the kabouters: behind trunks beside the way, one every so often, and a few behind what people left standing -----
    { const kr = rng.fork('kabouters'), covers = [];
      const cand = treePts.filter((p) => p.v < 2 && p.d > 6.2 && p.d < 13 && !meadowAt(p.x, p.z)).sort((a, b) => a.u - b.u);
      let lastU = -1; for (const p of cand) { if (p.u - lastU < 0.055 || kr.chance(0.35)) continue; covers.push({ x: p.x, z: p.z, r: (p.R || 0.25) + 0.05 }); lastU = p.u; if (covers.length >= 11) break; }
      covers.push({ x: -300, z: 79.5, r: 0.75 }, { x: -64.6, z: -68.5, r: 0.95 }, { x: -70.3, z: -84, r: 1.3 }, { x: SITES.oak[0], z: SITES.oak[1], r: 0.7 },
        { x: RING.x + Math.cos((2.5 / 6) * TAU) * RING.r, z: RING.z + Math.sin((2.5 / 6) * TAU) * RING.r, r: 0.85 });   // the welcome board, the hives, the compost bins, the lone oak, a beech of the ring
      await attempt('kabouters', () => makeKabouters(m, kr, covers, hAt)); }
    await ctx.yield();

    // ----- who lives here -----
    const light = F.lightFrom(scene), fauna = F.makeFauna(scene, { light, rng: rng.fork('fauna') });
    const add = (what, fn) => { try { return fauna.add(fn()); } catch (e) { warn(what, e); return null; } };
    // belted cattle in the summer meadow: black, with a white sheet round the middle
    const cows = add('belted cattle', () => F.makeHerd({ rng: rng.fork('cows'), preset: { ...F.HERD_PRESETS.bison, h: 1.35, neckAng: 12, pattern: 'band', speed: 0.6, count: 9 },
      coat: '#16130f', belly: '#16130f', legs: '#16130f', sock: '#16130f', accent: '#f3eee2', horn: '#d8d0b8', count: 9, heightAt: hAt, light, center: [-150, 0, 60], radius: 11, path, clear: 9 }));
    await ctx.yield();
    // the sheep: woolly, cream, black faces and legs
    add('sheep', () => F.makeHerd({ rng: rng.fork('sheep'), preset: { ...F.HERD_PRESETS.bison, h: 0.72, pattern: 'none', speed: 0.5, count: 6 }, coat: '#e6dcc4', belly: '#e0d6be', legs: '#1c1916', sock: '#1c1916', accent: '#1c1916', horn: '#1c1916',
      count: 6, heightAt: hAt, light, center: [-268, 0, 96], radius: 10, path, clear: 8 }));
    // roe deer between the trunks, a little way off the path
    add('roe deer', () => F.makeHerd({ rng: rng.fork('roe'), species: 'deer', pattern: 'none', coat: '#9a6a3e', count: 3, size: 0.72, heightAt: hAt, light, center: [-66, 0, -34], radius: 7, path, clear: 11 }));
    add('roe deer far', () => F.makeHerd({ rng: rng.fork('roe2'), species: 'deer', pattern: 'none', coat: '#8a5e38', count: 2, size: 0.72, heightAt: hAt, light, center: [-160, 0, -52], radius: 6, path, clear: 12 }));
    await ctx.yield();
    add('buzzard', () => F.makeFlock({ rng: rng.fork('buzzard'), species: 'eagles', count: 2, center: [-130, G + 44, 70], radius: 46, light, size: 0.7 }));
    // the starlings come in to roost: one cloud of them turning over the meadow
    add('starlings', () => F.makeFlock({ rng: rng.fork('spreeuwen'), species: 'starlings', form: 'murmuration', count: Math.round(900 * ctx.quality.detail), size: 1.6, speed: 12, center: [-130, G + 34, 70], radius: 70, light }));
    add('swallows', () => F.makeFlock({ rng: rng.fork('swallows'), species: 'swifts', count: 12, light, along: { path, side: 7, up: 1.5, lead: 24, from: 0.3, to: 0.56, drift: 9 } }));
    add('pigeons', () => F.makeFlock({ rng: rng.fork('pigeons'), species: 'gulls', body: '#8a8f98', belly: '#a9a6b0', count: 5, light, cross: { path, u: 0.7, lead: 60, angle: 70, side: 1, height: 16, span: 260, duration: DURATION } }));
    add('butterflies', () => F.makeButterflies({ rng: rng.fork('vlinders'), light, path, count: 46, heightAt: hAt, from: 0.33, to: 0.56, radius: 16 }));
    await ctx.yield();

    // ----- air: pollen in the low sun, a thread of smoke from the Gatehouse stove, a little mist over the wet meadow -----
    const time = { value: 0 }, set = fx.fxGroup(); scene.add(set.object);
    const tryFx = (what, fn) => { try { return set.add(fn()); } catch (e) { warn(what, e); return null; } };
    tryFx('pollen', () => fx.makeParticles({ rng: rng.fork('pollen'), preset: 'pollen', time, count: 420, box: [46, 12, 46], follow: 'xz', center: [0, G + 5, 0], opacity: 0.5, lightDir: sunDir }));
    { const p = gr.userData.pipe.clone().applyMatrix4(gr.updateMatrixWorld(true) || gr.matrixWorld);
      tryFx('smoke', () => fx.makeSmokeColumn({ rng: rng.fork('smoke'), time, position: [p.x, p.y, p.z], count: 34, height: 11, radius: [0.12, 1.6], size: [0.5, 3.4], color: '#cfc9c0', colorTop: '#efe9df', shadowColor: '#8a857c',
        opacity: 0.4, rate: 0.09, wind: [0.9, 0, -0.5], bend: 0.9, rim: 0.4, scatter: 0.4, sunDir, sunColor: sunCol })); }
    // shafts of the low sun through the crowns: over the path in the oak wood, and falling into the ring of beeches
    { const down = sunDir.clone().negate(), rayCol = '#ffe6ae';
      const shafts = (label, x, z, o) => tryFx(label, () => { const len = o.length, src = new THREE.Vector3(x, G + 1, z).addScaledVector(down, -len * 0.92);
        return fx.makeGodRays({ rng: rng.fork(label), time, position: [src.x, src.y, src.z], direction: [down.x, down.y, down.z], color: rayCol, ...o }); });
      shafts('rays-oak', -46, -13, { radius: 20, count: 12, length: 62, width: [1.5, 5.5], intensity: 0.6 });
      shafts('rays-lane', -40, -54, { radius: 22, count: 12, length: 62, width: [1.5, 5.5], intensity: 0.6 });
      shafts('rays-ring', RING.x, RING.z, { radius: 13, count: 16, length: 84, width: [2, 7], intensity: 0.9 }); }
    tryFx('mist', () => fx.makeGroundFog({ time, layers: 4, size: 620, y: G + 0.4, height: 3.2, color: '#f6e4b4', opacity: 0.11, coverage: 0.5, scale: 0.012, wind: [0.5, -0.3], sunDir, sunColor: sunCol, scatter: 0.5 }));
    await ctx.yield();

    // ----- where the eye goes -----
    const at = (s, y) => new THREE.Vector3(s[0], G + y, s[1]);
    // (each look is held from a little before the flight comes abreast of the thing to just as it passes)
    const look = (s, y, w, before = 0.07, after = 0.01) => { const u = path.nearestXZ(s[0], s[1]).u; return { at: at(s, y), from: Math.max(0.02, u - before), to: Math.min(0.97, u + after), weight: w }; };
    const pois = [
      look([-225, 51], 2.6, 0.55, 0.06, 0.01),   // the cage
      look(SITES.gatehouse, 2.2, 0.45),
      { ...look([-150, 60], 1.2, 0.5, 0.06, 0.02), at: () => (cows && cows.positionAt ? cows.positionAt(time.value, 0, _poi).setY(G + 1.2) : _poi.set(-150, G + 1.2, 60)) },
      look(SITES.cabin, 2.0, 0.35, 0.05), look(SITES.lodge, 2.2, 0.5), look(SITES.house, 3.5, 0.55, 0.08), look(SITES.garden, 0.8, 0.3, 0.05), look(SITES.cottage, 1.6, 0.35, 0.04), look(SITES.workshop, 1.8, 0.45, 0.05, 0),
      look([-153, 86], 1.6, 0.45, 0.04, 0.01),  // a laptop on its stump
      look([-87, 50], 2.4, 0.5, 0.06, 0.01),    // the pilot shed
      look([-19, -9], 1.8, 0.4, 0.05, 0.01),    // the chairs
      look([-38, -49], 2.4, 0.5, 0.05, 0.01),   // the three steps
      look([-94, -68], 3.6, 0.5, 0.05, 0.01),   // the weathervane
      look([-122, -56], 2.0, 0.5, 0.05, 0.01), // the cellar
      look([-78, -16], 2.6, 0.55, 0.05, 0.01),  // the spring
      look([-133, -35], 2.4, 0.5, 0.04, 0.02),  // the board in the ring
    ];
    try { await sky.prewarm(ctx.renderer, null, scene); } catch (e) { /* drawn on first use */ }

    const arm = sw.userData.arm;
    return {
      scene, path, duration: DURATION,
      camera: { fov: 60, near: 0.3, far: 2400, lookAhead: 20, sway: 0.5, bank: 0.4 },
      pois,
      portal: { shape: 'circle', radius: 3.8, color: '#fff3cf', glow: 1.3, revealDistance: 120 },
      post: { exposure: 1.04, bloom: { strength: 0.46, radius: 0.7, threshold: 0.88 } },
      // brisk between the stations of the story, slow enough at each to read its board
      pace: (u) => { let k = 1; for (const r of READ) k = Math.min(k, 0.36 + 0.64 * smoothstep(0.014, 0.045, Math.abs(u - r))); return (u < 0.07 ? 1.5 : 1.25) * k; },
      update(dt, t, camera, u) {
        time.value = t;
        sky.update(dt, t, camera); rig.update(dt, t, camera); land.update(dt, t);
        for (const o of updates) o.update(dt, t, camera);
        fauna.update(dt, t, camera, u); set.update(dt, t, camera);
        arm.rotation.x = 0.3 * Math.sin(t * 1.25) * Math.exp(-t * 0.012);   // somebody has just got off
      },
      dispose() { sky.dispose(); if (wood) wood.dispose(); if (dapple) dapple.dispose(); },
    };
  },
};
const _poi = new THREE.Vector3();
// where along the flight each board is read: the big board, the cage, the laptops, the pilot shed, the chairs, the signpost,
// the weathervane, the cellar, the board in the ring (the spring by the footbridge comes between the shed and the chairs)
const READ = [0.105, 0.385, 0.5, 0.615, 0.718, 0.775, 0.835, 0.912, 0.942, 0.977];

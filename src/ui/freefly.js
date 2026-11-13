// Free flight: the viewer takes the camera. V (or the button) turns it on and off. W A S D move, the mouse looks, E and Q
// go up and down, Shift goes faster (Space still pauses). While it is on the journey stands where it was: the world goes on
// living (wind, animals, water) but the route is not flown and the portal is not crossed. Turning it off picks the route
// up again at the place on it nearest to where the camera is.
// The mouse: click the picture once and the pointer is taken, so moving it looks around (Esc gives it back); where the
// browser will not hand the pointer over, hold the button and drag. While the
// journey is paused the pointer is left free for picking things up (ui/fling.js): then drag with the right button to look.
import * as THREE from 'three';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', KeyE: 'u', KeyQ: 'd', ShiftLeft: 'fast', ShiftRight: 'fast' };

export function setupFreeFly({ engine, canvas, toast, button }) {
  const fly = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  const held = {}; let on = false, yaw = 0, pitch = 0, last = 0, dragging = false, told = false;
  const vel = new THREE.Vector3();
  const locked = () => document.pointerLockElement === canvas;
  // (asking for the pointer can be refused: no click yet, or a frame that may not take it. Then dragging looks instead.)
  const lock = () => { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* dragging looks instead */ } };
  const aim = () => { _e.set(pitch, yaw, 0); fly.quaternion.setFromEuler(_e); };

  function start() {
    const cam = engine.camera; if (!engine.cur) return;
    fly.position.copy(cam.position); _e.setFromQuaternion(cam.quaternion); yaw = _e.y; pitch = _e.x; aim(); vel.set(0, 0, 0);
    engine.fly = fly; on = true; last = performance.now(); requestAnimationFrame(tick);
    if (button) { button.classList.add('on'); button.setAttribute('aria-pressed', 'true'); }
    if (!engine.settings.paused) lock();
    toast(told ? 'Free flight' : 'Free flight: W A S D to move, mouse to look, E / Q up and down, Shift faster, V to fly the route again', told ? 1800 : 7000); told = true;
  }
  function stop() {
    on = false; engine.fly = null; for (const k in held) held[k] = false;
    if (locked()) document.exitPointerLock();
    if (button) { button.classList.remove('on'); button.setAttribute('aria-pressed', 'false'); }
    // back onto the route at the nearest place, looking the way the viewer was looking, from where the gaze eases to the route's own
    const W = engine.cur; if (W && W.path) { const n = W.path.nearestXZ(fly.position.x, fly.position.z); W.dist = Math.min(W.path.length - 2, n.u * W.path.length); engine.speed = 0; engine.camQuat.copy(fly.quaternion); engine.arrived = 0; }
    toast('Flying the route again', 1800);
  }
  const toggle = () => (on ? stop() : start());

  function tick(now) {
    if (!on) return;
    requestAnimationFrame(tick);
    if (engine.fly !== fly || !engine.cur) { on = false; engine.fly = null; if (button) button.classList.remove('on'); return; }   // (the engine drops it when the world changes)
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    _f.set(0, 0, -1).applyQuaternion(fly.quaternion); _r.set(1, 0, 0).applyQuaternion(fly.quaternion);
    const sp = held.fast ? 34 : 9;
    const want = _f.multiplyScalar(((held.f ? 1 : 0) - (held.b ? 1 : 0)) * sp).addScaledVector(_r, ((held.r ? 1 : 0) - (held.l ? 1 : 0)) * sp); want.y += ((held.u ? 1 : 0) - (held.d ? 1 : 0)) * sp * 0.7;
    vel.lerp(want, 1 - Math.exp(-dt * 6));                                           // eased, so starts and stops glide
    fly.position.addScaledVector(vel, dt);
  }

  // keys: taken before the page's own (S is sound and D the debug panel there), only while flying
  const typing = (t) => t && (t.tagName === 'INPUT' && t.type !== 'range' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.code === 'KeyV') { toggle(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!on) return;
    const k = KEYS[e.code]; if (!k) return;
    held[k] = true; e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  window.addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) held[k] = false; }, true);
  window.addEventListener('blur', () => { for (const k in held) held[k] = false; });

  // the mouse
  const turn = (dx, dy) => { yaw -= dx * 0.0023; pitch = Math.max(-1.45, Math.min(1.45, pitch - dy * 0.0023)); aim(); };
  document.addEventListener('mousemove', (e) => { if (on && (locked() || dragging)) turn(e.movementX, e.movementY); });
  canvas.addEventListener('pointerdown', (e) => {
    if (!on) return;
    if (e.button === 2) { dragging = true; return; }
    if (e.button === 0 && !engine.settings.paused && !locked()) { dragging = true; lock(); }   // until the pointer is taken, holding the button and moving looks
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('contextmenu', (e) => { if (on) e.preventDefault(); });
  // one finger on a touch screen looks; flying there needs keys, so it is a look-around only
  let touch = null;
  canvas.addEventListener('touchstart', (e) => { if (on && e.touches.length === 1) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  canvas.addEventListener('touchmove', (e) => { if (on && touch && e.touches.length === 1 && !engine.settings.paused) { const t = e.touches[0]; turn(-(t.clientX - touch.x) * 1.4, -(t.clientY - touch.y) * 1.4); touch = { x: t.clientX, y: t.clientY }; } }, { passive: true });
  canvas.addEventListener('touchend', () => { touch = null; }, { passive: true });

  if (button) button.onclick = toggle;
  return { toggle, get on() { return on; },
    // the page tells it when the pause goes on or off: a paused journey gives the pointer back, for picking things up
    paused(p) { if (on && p && locked()) document.exitPointerLock(); } };
}

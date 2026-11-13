// Fling: while the journey is paused, a thing in the world can be picked up with the pointer, dragged about and thrown.
// What is picked up is the object under the pointer together with what it is attached to (the group it belongs to, as far
// up as that group stays about the object's own size). Let go while moving and it keeps going, turning as it was swung,
// and comes to rest. With Shift held it leaves copies of itself behind as it goes, so a swing paints a stroke of it.
// Z (or Backspace) puts everything back. Nothing here runs while the journey plays: the world's own update() owns the
// scene then, and whatever was moved simply stays where it was left until the world is flown out of.
import * as THREE from 'three';

const MAX_STAMPS = 500, MAX_STAMP_DRAWS = 4000;
const _m = new THREE.Matrix4(), _n = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _axis = new THREE.Vector3(), _box = new THREE.Box3(), _sph = new THREE.Sphere();
const _ndc = new THREE.Vector2(), _plane = new THREE.Plane(), _hit = new THREE.Vector3();

export function setupFling({ engine, canvas, toast }) {
  const ray = new THREE.Raycaster();
  let world = null;                // the world the things below belong to
  let bodies = new Map();          // every thing touched in this world, by key, so it can be put back
  let stamps = [];                 // the copies left behind: { remove() }
  let stampDraws = 0;
  let held = null;                 // { body, grab: world point under the pointer, target, depthN, depthP, lastMove }
  let running = false, last = 0, told = false, shift = false;

  const paused = () => !!engine.settings.paused && !engine.opts.freeze;
  const reset = () => { bodies = new Map(); stamps = []; stampDraws = 0; held = null; };
  const sync = () => { if (engine.cur !== world) { world = engine.cur; reset(); } };

  // ---- what a body is: an object of the scene, or one instance of an instanced mesh ----
  const radiusOf = (o, centre) => {
    _box.setFromObject(o);
    if (_box.isEmpty()) { o.getWorldPosition(centre); return 1; }
    _box.getBoundingSphere(_sph); centre.copy(_sph.center); return Math.max(1e-3, _sph.radius);
  };
  const countDraws = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh || c.isPoints || c.isLine || c.isSprite) n++; }); return n; };

  function bodyFor(hit, dist) {
    let o = hit.object;
    if (o.isInstancedMesh && hit.instanceId != null) {
      const id = hit.instanceId, key = o.uuid + ':' + id;
      let b = bodies.get(key);
      if (!b) {
        const home = new THREE.Matrix4(); o.getMatrixAt(id, home);
        const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        const centre = g.boundingSphere.center.clone().applyMatrix4(_m.multiplyMatrices(o.matrixWorld, home));
        const radius = Math.max(1e-3, g.boundingSphere.radius * _m.getMaxScaleOnAxis());
        b = { key, inst: o, id, home, centre, radius, vel: new THREE.Vector3(), ang: new THREE.Vector3(), draws: 1 };
        o.frustumCulled = false;   // its instances no longer lie where its bounds were reckoned
        bodies.set(key, b);
      }
      return b;
    }
    // the object and what it is attached to: up the tree while the group stays about the size of the thing that was hit
    const c0 = new THREE.Vector3(), r0 = radiusOf(o, c0);
    if (r0 < dist) {
      const cap = Math.max(r0 * 4, dist * 0.25);
      for (let p = o.parent; p && p !== world.scene && !p.isScene; p = p.parent) {
        if (radiusOf(p, _w) > cap) break;
        o = p;
      }
    }
    let b = bodies.get(o.uuid);
    if (!b) {
      // a thing inside one already moved is that one; a group around ones already moved takes them along as they are
      for (let p = o.parent; p; p = p.parent) if (bodies.has(p.uuid)) return bodies.get(p.uuid);
      const centre = new THREE.Vector3(), radius = radiusOf(o, centre);
      b = { key: o.uuid, o, home: { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), m: o.matrix.clone() }, centre, radius, vel: new THREE.Vector3(), ang: new THREE.Vector3(), draws: countDraws(o) };
      bodies.set(b.key, b);
    }
    return b;
  }

  // moves a body by dp and turns it by the rotation `rot` (a quaternion, or null) about the world point `about`
  function move(b, dp, rot, about) {
    _m.makeTranslation(about.x + dp.x, about.y + dp.y, about.z + dp.z);
    if (rot) _m.multiply(_n.makeRotationFromQuaternion(rot));
    _m.multiply(_n.makeTranslation(-about.x, -about.y, -about.z));          // _m: the step, in world space
    b.centre.applyMatrix4(_m);
    if (b.inst) {
      const o = b.inst; o.getMatrixAt(b.id, _n);
      _n.premultiply(o.matrixWorld).premultiply(_m).premultiply(_inv.copy(o.matrixWorld).invert());
      o.setMatrixAt(b.id, _n); o.instanceMatrix.needsUpdate = true;
      return;
    }
    const o = b.o; o.updateWorldMatrix(true, false);
    _n.copy(o.matrixWorld).premultiply(_m);
    if (o.parent) _n.premultiply(_inv.copy(o.parent.matrixWorld).invert());
    _n.decompose(o.position, o.quaternion, o.scale);
    if (!o.matrixAutoUpdate) { o.matrix.copy(_n); o.matrixWorldNeedsUpdate = true; }
    o.updateMatrixWorld(true);
  }

  // ---- painting: a copy of the body is left where it is ----
  function stamp(b) {
    if (stamps.length >= MAX_STAMPS || stampDraws + b.draws > MAX_STAMP_DRAWS) return;
    if (b.inst) {
      const o = b.inst, cap = o.instanceMatrix.count;
      if (o.count >= cap) return;                                            // no room left in this mesh for another
      const id = o.count; o.getMatrixAt(b.id, _n); o.setMatrixAt(id, _n);
      if (o.instanceColor) { const c = new THREE.Color(); o.getColorAt(b.id, c); o.setColorAt(id, c); o.instanceColor.needsUpdate = true; }
      o.count = id + 1; o.instanceMatrix.needsUpdate = true;
      stamps.push({ remove: () => { o.count = Math.min(o.count, id); } });
    } else {
      const o = b.o; let c;
      // (three copies userData by way of JSON, and worlds keep notes there that point back at their own objects: the notes are set aside for the copy)
      const notes = []; o.traverse((x) => { notes.push(x, x.userData); x.userData = {}; });
      try { c = o.clone(true); } catch (e) { c = null; } finally { for (let i = 0; i < notes.length; i += 2) notes[i].userData = notes[i + 1]; }
      if (!c) return;
      c.traverse((x) => { x.matrixAutoUpdate = false; });
      c.matrix.copy(o.matrix); c.matrixWorldNeedsUpdate = true;
      o.parent.add(c); c.updateMatrixWorld(true);
      stamps.push({ remove: () => c.removeFromParent() });
    }
    stampDraws += b.draws;
    b.stampAt = (b.stampAt || new THREE.Vector3()).copy(b.centre);
  }
  const maybeStamp = (b) => { if (!b.stampAt) { b.stampAt = b.centre.clone(); return; } if (b.stampAt.distanceTo(b.centre) > b.step) stamp(b); };

  function putBack() {
    sync();
    for (let i = stamps.length - 1; i >= 0; i--) stamps[i].remove();
    for (const b of bodies.values()) {
      if (b.inst) { b.inst.setMatrixAt(b.id, b.home); b.inst.instanceMatrix.needsUpdate = true; }
      else { const o = b.o, h = b.home; o.position.copy(h.p); o.quaternion.copy(h.q); o.scale.copy(h.s); o.matrix.copy(h.m); o.matrixWorldNeedsUpdate = true; o.updateMatrixWorld(true); }
    }
    reset();
  }

  // ---- the pointer ----
  const aim = (e) => {
    const r = canvas.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(_ndc, engine.camera); ray.camera = engine.camera;
  };
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const solid = (o) => {
    if (!o.isMesh) return false;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    return !!m && m.visible !== false && m.depthWrite !== false && m.depthTest !== false;   // not a sky, a glow or a haze
  };
  function pick(e) {
    aim(e); ray.near = engine.camera.near; ray.far = engine.camera.far;
    const portal = world.portal && world.portal.group;
    let hits; try { hits = ray.intersectObjects(world.scene.children, true); } catch (err) { return null; }
    for (const h of hits) {
      if (!solid(h.object) || !shown(h.object)) continue;
      let inPortal = false; for (let p = h.object; p; p = p.parent) if (p === portal) { inPortal = true; break; }
      if (!inPortal) return h;
    }
    return null;
  }
  const targetOf = (e, out) => { aim(e); return ray.ray.intersectPlane(_plane.setFromNormalAndCoplanarPoint(held.depthN, held.depthP), out); };

  canvas.addEventListener('pointerdown', (e) => {
    if (!paused() || e.button > 0 || !engine.cur) return;
    sync();
    const h = pick(e); if (!h) return;
    const b = bodyFor(h, h.distance);
    b.vel.set(0, 0, 0); b.ang.set(0, 0, 0); b.free = false; b.paint = false; b.stampAt = null;
    b.step = Math.max(1e-3, h.distance * 0.045);   // a copy is left each time it has gone about this far: a twentieth of the picture's width at the depth it was taken hold of
    held = { body: b, grab: h.point.clone(), target: h.point.clone(), depthN: engine.camera.getWorldDirection(new THREE.Vector3()), depthP: h.point.clone(), lastMove: performance.now(), id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the drag still works inside the window */ }
    canvas.style.cursor = 'grabbing'; e.preventDefault(); start();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!held || e.pointerId !== held.id) return;
    shift = e.shiftKey;
    if (targetOf(e, _hit)) { held.target.copy(_hit); held.lastMove = performance.now(); }
  });
  const drop = (e) => {
    if (!held || (e && e.pointerId !== held.id)) return;
    const b = held.body;
    if (performance.now() - held.lastMove > 90) { b.vel.set(0, 0, 0); b.ang.set(0, 0, 0); }   // held still, then let go: it is put down, not thrown
    b.free = true; b.paint = shift;
    held = null; canvas.style.cursor = paused() ? 'grab' : '';
  };
  canvas.addEventListener('pointerup', drop); canvas.addEventListener('pointercancel', drop);
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') shift = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') shift = false; });

  // ---- the motion ----
  function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); } }
  function tick(now) {
    const dt = Math.min(0.05, Math.max(1e-3, (now - last) / 1000)); last = now;
    if (!paused() || engine.cur !== world) { if (held) drop(); running = false; for (const b of bodies.values()) b.free = false; return; }
    let busy = false;
    if (held) {
      busy = true;
      const b = held.body, dp = _v.subVectors(held.target, held.grab);
      // the speed of the hand, smoothed over a few frames; the swing: the body turns about the point it is held by, as
      // a thing dragged by one corner does (omega = r x v / r^2, r from the body's middle to that point)
      b.vel.lerp(_w.copy(dp).divideScalar(dt), 0.35);
      const r = _w.subVectors(held.grab, b.centre), rr = Math.max(r.lengthSq(), b.radius * b.radius * 0.04);
      _axis.crossVectors(r, b.vel).divideScalar(rr).multiplyScalar(0.6);
      b.ang.lerp(_axis, 0.2);
      const a = b.ang.length() * dt;
      move(b, dp, a > 1e-5 ? _q.setFromAxisAngle(_axis.copy(b.ang).normalize(), a) : null, held.grab);
      held.grab.copy(held.target);
      if (shift) maybeStamp(b);
    }
    for (const b of bodies.values()) {
      if (!b.free) continue;
      const sp = b.vel.length(), an = b.ang.length();
      if (sp < b.step * 0.2 && an < 0.03) { b.free = false; continue; }
      busy = true;
      const a = an * dt;
      move(b, _v.copy(b.vel).multiplyScalar(dt), a > 1e-5 ? _q.setFromAxisAngle(_axis.copy(b.ang).normalize(), a) : null, b.centre);
      b.vel.multiplyScalar(Math.exp(-dt * 0.9)); b.ang.multiplyScalar(Math.exp(-dt * 0.6));
      if (b.paint) maybeStamp(b);
    }
    if (busy) requestAnimationFrame(tick); else running = false;
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !paused()) return;
    const tag = e.target && e.target.tagName; if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { if (bodies.size || stamps.length) { putBack(); toast('Put back'); } }
  });

  return {
    // the page tells it when the pause goes on or off
    paused(p) {
      canvas.style.cursor = p ? 'grab' : '';
      if (p && !told) { told = true; toast('Paused: drag anything to fling it · hold Shift to paint with it · Z puts it back', 6000); }
      if (!p && held) drop();
    },
    putBack,
    // for tests: what has been moved in this world, and how many copies were left
    state: () => ({ held: held ? held.body.key : null, stamps: stamps.length, bodies: [...bodies.values()].map((b) => ({ name: b.inst ? b.inst.name + '#' + b.id : b.o.name || b.o.type, radius: Math.round(b.radius * 10) / 10, draws: b.draws, free: !!b.free })) }),
  };
}

// Termiz — Boshqaruv: klaviatura + sichqoncha + sensorli
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (id) => document.getElementById(id);

export class Input {
  constructor(onAction) {
    this.onAction = onAction || (() => {});
    this.keys = new Set();
    // Piyoda
    this.move = { fwd: 0, side: 0 };   // -1..1
    this.sprint = false;
    this.jump = false;
    this.attack = false;
    this.aim = false;
    // Mashina
    this.car = { gas: 0, brake: 0, steer: 0, handbrake: false, horn: false };
    // Sichqoncha yaw/pitch (piyoda kamera)
    this.yawDelta = 0; this.pitchDelta = 0;
    this.pointerLocked = false;
    // Touch joystick
    this.lJoy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.rJoy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.touchSteer = 0; this.steerPtr = null;
    this.holdGas = false; this.holdBrake = false;
    this.inCar = false;
    this._bind();
  }

  _bind() {
    // Klaviatura
    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'KeyE' || k === 'KeyF') this.onAction('interact');
      else if (k === 'KeyM') this.onAction('map');
      else if (k === 'Escape' || k === 'KeyP') this.onAction('menu');
      else if (k === 'KeyC') this.onAction('cam');
      else if (k === 'KeyH') { if (this.inCar) this.car.horn = true; }
      else if (k === 'KeyR') this.onAction('respawn');
      else if (k === 'Digit1') this.onAction('weapon0');
      else if (k === 'Digit2') this.onAction('weapon1');
      else if (k === 'Digit3') this.onAction('weapon2');
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyH') this.car.horn = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); });

    // Pointer lock (piyoda kamera)
    const canvas = document.getElementById('c');
    if (canvas) {
      canvas.addEventListener('click', () => {
        if (!this.inCar && !this.pointerLocked) {
          canvas.requestPointerLock?.().catch(() => {});
        }
      });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) this.attack = true;
        if (e.button === 2) this.aim = true;
      });
      canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.attack = false;
        if (e.button === 2) this.aim = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.yawDelta   += e.movementX * 0.0022;
      this.pitchDelta += e.movementY * 0.0022;
    });

    // Touch joystick
    const lz = $('ljoy'), rz = $('rjoy');
    if (lz) {
      lz.addEventListener('pointerdown', (e) => {
        e.preventDefault(); lz.setPointerCapture(e.pointerId);
        const r = lz.getBoundingClientRect();
        this.lJoy = { x: 0, y: 0, id: e.pointerId, ox: r.left + r.width/2, oy: r.top + r.height/2 };
      });
      lz.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.lJoy.id) return;
        const R = 44;
        let dx = (e.clientX - this.lJoy.ox) / R, dy = (e.clientY - this.lJoy.oy) / R;
        const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
        this.lJoy.x = dx; this.lJoy.y = dy;
        const kn = lz.querySelector('.jk'); if (kn) kn.style.transform = `translate(${dx*R}px,${dy*R}px)`;
      });
      const endL = (e) => { if (e.pointerId !== this.lJoy.id) return; this.lJoy.x = this.lJoy.y = 0; this.lJoy.id = null; const kn = lz.querySelector('.jk'); if (kn) kn.style.transform = ''; };
      lz.addEventListener('pointerup', endL); lz.addEventListener('pointercancel', endL);
    }
    // Right joystick (kamera)
    if (rz) {
      rz.addEventListener('pointerdown', (e) => {
        e.preventDefault(); rz.setPointerCapture(e.pointerId);
        const r = rz.getBoundingClientRect();
        this.rJoy = { x: 0, y: 0, id: e.pointerId, ox: r.left + r.width/2, oy: r.top + r.height/2 };
      });
      rz.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.rJoy.id) return;
        const R = 44;
        let dx = (e.clientX - this.rJoy.ox) / R, dy = (e.clientY - this.rJoy.oy) / R;
        const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
        this.rJoy.x = dx; this.rJoy.y = dy;
        const kn = rz.querySelector('.jk'); if (kn) kn.style.transform = `translate(${dx*R}px,${dy*R}px)`;
      });
      const endR = (e) => { if (e.pointerId !== this.rJoy.id) return; this.rJoy.x = this.rJoy.y = 0; this.rJoy.id = null; const kn = rz.querySelector('.jk'); if (kn) kn.style.transform = ''; };
      rz.addEventListener('pointerup', endR); rz.addEventListener('pointercancel', endR);
    }
    // Mashina rul zonasi
    const st = $('steer');
    if (st) {
      const setFrom = (e) => {
        const r = st.getBoundingClientRect(), cx = r.left + r.width/2, hw = r.width/2 - 24;
        let v = (e.clientX - cx) / hw; if (Math.abs(v) < 0.08) v = 0;
        this.touchSteer = clamp(v * 1.2, -1, 1);
        const kn = st.querySelector('.knob'); if (kn) kn.style.transform = `translateX(${this.touchSteer * hw}px)`;
      };
      st.addEventListener('pointerdown', (e) => { e.preventDefault(); this.steerPtr = e.pointerId; try { st.setPointerCapture(e.pointerId); } catch { /*ok*/ } setFrom(e); });
      st.addEventListener('pointermove', (e) => { if (e.pointerId === this.steerPtr) { e.preventDefault(); setFrom(e); } });
      const endSt = (e) => { if (e.pointerId !== this.steerPtr) return; this.steerPtr = null; this.touchSteer = 0; const kn = st.querySelector('.knob'); if (kn) kn.style.transform = ''; };
      st.addEventListener('pointerup', endSt); st.addEventListener('pointercancel', endSt);
    }
    // Gas/brake buttons
    const hold = (id, cb) => {
      const el = $(id); if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); cb(true); });
      el.addEventListener('pointerup',   () => cb(false));
      el.addEventListener('pointercancel', () => cb(false));
    };
    hold('gas',   (v) => this.holdGas   = v);
    hold('brake', (v) => this.holdBrake = v);
    // Action buttons (shoot, interact, jump)
    const tap = (id, act) => { const el = $(id); if (!el) return; el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onAction(act); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 120); }); };
    tap('tjump',    'jump');
    tap('tattack',  'attack_tap');
    tap('tinteract','interact');
    tap('tcam',     'cam');
    tap('tmenu',    'menu');
  }

  consumeYaw()   { const v = this.yawDelta;   this.yawDelta   = 0; return v; }
  consumePitch() { const v = this.pitchDelta; this.pitchDelta = 0; return v; }

  updateFoot() {
    const k = this.keys;
    // sol joystick yoki klaviatura
    let fx = this.lJoy.x, fy = -this.lJoy.y; // joystick: y osi teskari
    if (k.has('KeyW') || k.has('ArrowUp'))    fy = Math.max(fy, 1);
    if (k.has('KeyS') || k.has('ArrowDown'))  fy = Math.min(fy, -1);
    if (k.has('KeyA') || k.has('ArrowLeft'))  fx = Math.min(fx, -1);
    if (k.has('KeyD') || k.has('ArrowRight')) fx = Math.max(fx, 1);
    this.move.fwd  = clamp(fy, -1, 1);
    this.move.side = clamp(fx, -1, 1);
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    this.jump   = k.has('Space');
    // Right joystick → kamera yaw/pitch
    if (this.rJoy.id !== null) {
      this.yawDelta   += this.rJoy.x * 0.045;
      this.pitchDelta += this.rJoy.y * 0.030;
    }
  }

  updateCar() {
    const k = this.keys;
    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft'))  steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    if (!steer) steer = this.touchSteer;
    this.car.steer     = clamp(steer, -1, 1);
    this.car.gas       = (k.has('KeyW') || k.has('ArrowUp')   || this.holdGas)   ? 1 : 0;
    this.car.brake     = (k.has('KeyS') || k.has('ArrowDown') || this.holdBrake) ? 1 : 0;
    this.car.handbrake = k.has('Space');
  }
}

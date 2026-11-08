// Termiz — Boshqaruv: klaviatura + sichqoncha + sensorli (ko'rinadigan joystick, erkin qarash, tugmalar)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (id) => document.getElementById(id);

export class Input {
  constructor(onAction) {
    this.onAction = onAction || (() => {});
    this.keys = new Set();
    this.move = { fwd: 0, side: 0 };       // fwd: oldinga +, side: o'ngga +
    this.sprint = false; this.jump = false; this.attack = false; this.aim = false;
    this.car = { gas: 0, brake: 0, steer: 0, handbrake: false, horn: false };
    this.yawDelta = 0; this.pitchDelta = 0;
    this.pointerLocked = false;
    this.stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.look = { id: null, lx: 0, ly: 0 };
    this.holdGas = false; this.holdBrake = false; this.holdHand = false; this.holdRun = false;
    this.inCar = false; this.looking = false;
    this._bind();
  }

  _bind() {
    // ── Klaviatura ──
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'KeyE') this.onAction('interact');
      else if (k === 'KeyM') this.onAction('map');
      else if (k === 'KeyV' || k === 'KeyC') this.onAction('cam');
      else if (k === 'KeyG') this.onAction('nextweapon');
      else if (k === 'KeyF') this.onAction('attack_start');
      else if (k === 'KeyH') { this.car.horn = true; this.onAction('horn'); }
      else if (k === 'KeyR') this.onAction('respawn');
      else if (k === 'KeyT') this.onAction('chat');
      else if (k === 'Digit1') this.onAction('weapon0');
      else if (k === 'Digit2') this.onAction('weapon1');
      else if (k === 'Digit3') this.onAction('weapon2');
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyF') this.onAction('attack_stop');
      if (e.code === 'KeyH') this.car.horn = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); });

    // ── Sichqoncha ──
    const canvas = $('c');
    if (canvas) {
      canvas.addEventListener('click', () => {
        if (!document.body.classList.contains('touch') && !this.pointerLocked) { try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* ok */ } }
      });
      canvas.addEventListener('mousedown', (e) => { if (e.button === 0 && this.pointerLocked) this.onAction('attack_start'); if (e.button === 2) this.aim = true; });
      window.addEventListener('mouseup', (e) => { if (e.button === 0) this.onAction('attack_stop'); if (e.button === 2) this.aim = false; });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === canvas; });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.yawDelta += e.movementX * 0.0022; this.pitchDelta += e.movementY * 0.0022;
    });

    // ── Chap joystick (ko'rinadigan, suzuvchi) ──
    const zone = $('stickzone'), base = $('stick');
    if (zone && base) {
      const R = 54;
      const knob = base.querySelector('.jk');
      const home = { left: base.style.left, top: base.style.top };
      const setKnob = (dx, dy) => { if (knob) knob.style.transform = `translate(${dx * R}px,${dy * R}px)`; };
      zone.addEventListener('pointerdown', (e) => {
        if (this.stick.id !== null) return;
        e.preventDefault(); try { zone.setPointerCapture(e.pointerId); } catch { /* ok */ }
        const zr = zone.getBoundingClientRect();
        // asos nuqtasi — bosilgan joy (zona chegarasidan chiqmasin)
        const ox = clamp(e.clientX, zr.left + R, zr.right - R * 0.5), oy = clamp(e.clientY, zr.top + R, zr.bottom - R * 0.5);
        this.stick = { x: 0, y: 0, id: e.pointerId, ox, oy };
        base.style.left = (ox - base.parentElement.getBoundingClientRect().left) + 'px';
        base.style.top = (oy - base.parentElement.getBoundingClientRect().top) + 'px';
        base.classList.add('active'); setKnob(0, 0);
      });
      zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.stick.id) return;
        e.preventDefault();
        let dx = (e.clientX - this.stick.ox) / R, dy = (e.clientY - this.stick.oy) / R;
        const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
        this.stick.x = dx; this.stick.y = dy; setKnob(dx, dy);
      });
      const end = (e) => {
        if (e.pointerId !== this.stick.id) return;
        this.stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
        base.style.left = home.left; base.style.top = home.top; base.classList.remove('active'); setKnob(0, 0);
      };
      zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    }

    // ── O'ng tomon: erkin qarash ──
    const lz = $('lookzone');
    if (lz) {
      lz.addEventListener('pointerdown', (e) => {
        if (this.look.id !== null) return;
        e.preventDefault(); try { lz.setPointerCapture(e.pointerId); } catch { /* ok */ }
        this.look = { id: e.pointerId, lx: e.clientX, ly: e.clientY }; this.looking = true;
      });
      lz.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.look.id) return;
        e.preventDefault();
        const dx = e.clientX - this.look.lx, dy = e.clientY - this.look.ly;
        this.look.lx = e.clientX; this.look.ly = e.clientY;
        this.yawDelta += dx * 0.0062; this.pitchDelta += dy * 0.0048;
      });
      const endL = (e) => { if (e.pointerId !== this.look.id) return; this.look = { id: null, lx: 0, ly: 0 }; this.looking = false; };
      lz.addEventListener('pointerup', endL); lz.addEventListener('pointercancel', endL); lz.addEventListener('lostpointercapture', endL);
    }

    // ── Tugmalar ──
    const press = (id, down, up) => {
      const el = $(id); if (!el) return;
      const on = (e) => { e.preventDefault(); e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch { /* ok */ } el.classList.add('on'); down?.(); };
      const off = (e) => { e.stopPropagation(); el.classList.remove('on'); up?.(); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    };
    press('btn-fire', () => this.onAction('attack_start'), () => this.onAction('attack_stop'));
    press('btn-jump', () => this.onAction('jump'));
    press('btn-enter', () => this.onAction('interact'));
    press('btn-wpn', () => this.onAction('nextweapon'));
    press('btn-run', () => { this.holdRun = true; }, () => { this.holdRun = false; });
    press('btn-gas', () => { this.holdGas = true; }, () => { this.holdGas = false; });
    press('btn-brake', () => { this.holdBrake = true; }, () => { this.holdBrake = false; });
    press('btn-hand', () => { this.holdHand = true; }, () => { this.holdHand = false; });
    press('btn-map', () => this.onAction('map'));
    press('btn-cam', () => this.onAction('cam'));
  }

  consumeYaw() { const v = this.yawDelta; this.yawDelta = 0; return v; }
  consumePitch() { const v = this.pitchDelta; this.pitchDelta = 0; return v; }

  updateFoot() {
    const k = this.keys;
    let fx = this.stick.x, fy = -this.stick.y;
    // o'lik zona + egri javob
    const m = Math.hypot(fx, fy);
    if (m < 0.12) { fx = fy = 0; } else { const s = Math.min(1, (m - 0.12) / 0.88); const g = s / m; fx *= g; fy *= g; }
    if (k.has('KeyW') || k.has('ArrowUp')) fy = Math.max(fy, 1);
    if (k.has('KeyS') || k.has('ArrowDown')) fy = Math.min(fy, -1);
    if (k.has('KeyA') || k.has('ArrowLeft')) fx = Math.min(fx, -1);
    if (k.has('KeyD') || k.has('ArrowRight')) fx = Math.max(fx, 1);
    this.move.fwd = clamp(fy, -1, 1); this.move.side = clamp(fx, -1, 1);
    this.stickMag = Math.hypot(this.move.fwd, this.move.side);
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.holdRun || (this.stick.id !== null && m > 0.93);
    this.jump = k.has('Space');
  }

  updateCar() {
    const k = this.keys;
    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    const sx = Math.abs(this.stick.x) < 0.1 ? 0 : this.stick.x;
    if (!steer) steer = clamp(sx * 1.15, -1, 1);
    this.car.steer = clamp(steer, -1, 1);
    const up = this.stick.y < -0.55, down = this.stick.y > 0.55;
    this.car.gas = (k.has('KeyW') || k.has('ArrowUp') || this.holdGas || up) ? 1 : 0;
    this.car.brake = (k.has('KeyS') || k.has('ArrowDown') || this.holdBrake || down) ? 1 : 0;
    this.car.handbrake = k.has('Space') || this.holdHand;
  }
}

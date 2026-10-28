// Boshqaruv: klaviatura, sensorli tugmalar (rul zonasi), telefonni egish
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (id) => document.getElementById(id);

export class Input {
  constructor(onAction) {
    this.onAction = onAction;
    this.keys = new Set();
    this.hold = { gas: false, brake: false, nitro: false, drift: false };
    this.touchSteer = 0; this.steerPtr = null;
    this.mode = 'btn';            // 'btn' | 'tilt'
    this.tiltRange = 35;          // daraja: shu burchakda to'liq rul
    this.tiltInv = false; this.tiltZero = 0;
    this.beta = null; this.gamma = null; this.tiltPhi = 0; this.tiltOK = false;
    this.enabled = false;
    this.out = { steer: 0, gas: 0, brake: 0, nitro: false, drift: false };
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (!this.enabled) { if (k === 'Escape') this.onAction('menu'); return; }
      if (k === 'KeyE' || k === 'Enter' || k === 'KeyF') this.onAction('item');
      else if (k === 'KeyH') this.onAction('horn');
      else if (k === 'KeyC') this.onAction('cam');
      else if (k === 'KeyR') this.onAction('reset');
      else if (k === 'KeyM') this.onAction('mute');
      else if (k === 'Escape' || k === 'KeyP') this.onAction('menu');
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.releaseAll(); });

    // sensorli tugmalar
    const hold = (id, key) => {
      const el = $(id); if (!el) return;
      const on = (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } this.hold[key] = true; el.classList.add('on'); };
      const off = (e) => { this.hold[key] = false; el.classList.remove('on'); void e; };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    };
    hold('gas', 'gas'); hold('brake', 'brake'); hold('nitro', 'nitro'); hold('drift', 'drift');
    const tap = (id, act) => { const el = $(id); if (!el) return; el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 140); this.onAction(act); }); };
    tap('titem', 'item'); tap('thorn', 'horn'); tap('tcam', 'cam'); tap('treset', 'reset'); tap('tmenu', 'menu');

    // rul zonasi (analog: barmoq o'rniga qarab)
    const st = $('steer');
    const setFrom = (e) => {
      const r = st.getBoundingClientRect(), cx = r.left + r.width / 2, hw = r.width / 2 - 34;
      let v = (e.clientX - cx) / hw; if (Math.abs(v) < 0.08) v = 0;
      this.touchSteer = clamp(v * 1.15, -1, 1);
      const kn = st.querySelector('.knob'); if (kn) kn.style.transform = `translateX(${this.touchSteer * hw}px)`;
    };
    st.addEventListener('pointerdown', (e) => { if (this.mode === 'tilt' && this.tiltOK) return; e.preventDefault(); this.steerPtr = e.pointerId; try { st.setPointerCapture(e.pointerId); } catch { /* ignore */ } st.classList.add('on'); setFrom(e); });
    st.addEventListener('pointermove', (e) => { if (e.pointerId === this.steerPtr) { e.preventDefault(); setFrom(e); } });
    const endSt = (e) => { if (e.pointerId !== this.steerPtr) return; this.steerPtr = null; this.touchSteer = 0; st.classList.remove('on'); const kn = st.querySelector('.knob'); if (kn) kn.style.transform = ''; };
    st.addEventListener('pointerup', endSt); st.addEventListener('pointercancel', endSt); st.addEventListener('lostpointercapture', endSt);

    // egish
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      this.beta = e.beta; this.gamma = e.gamma; this.tiltOK = true;
    });
  }

  releaseAll() {
    for (const k of Object.keys(this.hold)) this.hold[k] = false;
    this.touchSteer = 0; this.steerPtr = null;
    document.querySelectorAll('#touch .tb.on').forEach((el) => el.classList.remove('on'));
    const kn = document.querySelector('#steer .knob'); if (kn) kn.style.transform = '';
  }

  // Ekran yo'nalishini hisobga olgan holda rul burchagi (daraja)
  tiltAngle() {
    if (this.beta == null) return 0;
    const b = this.beta * Math.PI / 180, g = this.gamma * Math.PI / 180;
    const gx = Math.sin(g) * Math.cos(b), gy = -Math.sin(b), gz = -Math.cos(g) * Math.cos(b);
    void gz;
    let ang = 0;
    try { ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0; } catch { ang = 0; }
    ang = ((ang % 360) + 360) % 360;
    let right, up;   // tortishish kuchining ekran o'qlaridagi tashkil etuvchilari
    if (ang === 90) { right = -gy; up = gx; }
    else if (ang === 270) { right = gy; up = -gx; }
    else if (ang === 180) { right = -gx; up = -gy; }
    else { right = gx; up = gy; }
    return Math.atan2(right, -up) * 180 / Math.PI;
  }
  calibrate() { this.tiltZero = this.tiltAngle(); return this.tiltZero; }

  update() {
    const k = this.keys, o = this.out;
    let steer = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) steer -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) steer += 1;
    if (this.mode === 'tilt' && this.tiltOK) {
      let a = this.tiltAngle() - this.tiltZero; if (a > 180) a -= 360; if (a < -180) a += 360;
      this.tiltPhi = a;
      let v = a / this.tiltRange; if (Math.abs(v) < 0.06) v = 0;
      v = clamp(v, -1, 1); if (this.tiltInv) v = -v;
      if (Math.abs(v) > Math.abs(steer)) steer = v;
    } else if (this.touchSteer) steer = this.touchSteer;
    o.steer = clamp(steer, -1, 1);
    o.gas = (k.has('ArrowUp') || k.has('KeyW') || this.hold.gas) ? 1 : 0;
    o.brake = (k.has('ArrowDown') || k.has('KeyS') || this.hold.brake) ? 1 : 0;
    o.nitro = k.has('ShiftLeft') || k.has('ShiftRight') || this.hold.nitro;
    o.drift = k.has('Space') || this.hold.drift;
    return o;
  }
}

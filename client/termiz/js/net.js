// Termiz — WebSocket tarmoq (Sariq Hovli/Poyga uslubida)
const lerp = (a, b, t) => a + (b - a) * t;
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2; return a + d * t; };

export class Network {
  constructor(url, onMsg) {
    this.url = url;
    this.onMsg = onMsg;
    this.ws = null;
    this.id = -1;
    this.connected = false;
    this.pingMs = 0;
    this._pingAt = 0;
    this._reconnT = 0;
    this.snaps = new Map(); // id → [{t, x, z, h, inCar, hp, wanted}]
    this._buf = [];         // outgoing buffer
    this._sendInterval = null;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen    = () => { this.connected = true; this._startPing(); this.onMsg({ type: 'open' }); };
      this.ws.onclose   = () => { this.connected = false; this._stopPing(); this.onMsg({ type: 'close' }); };
      this.ws.onerror   = () => { this.ws.close(); };
      this.ws.onmessage = (e) => this._handleMsg(e.data);
    } catch (err) { console.warn('WS xatosi:', err); }
  }

  _handleMsg(raw) {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'welcome') {
        this.id = msg.id;
        this.onMsg(msg);
      } else if (msg.type === 'p') {
        // Pozitsiya yangilanishi
        const now = performance.now();
        for (const [id, snap] of Object.entries(msg.players)) {
          const iid = parseInt(id);
          if (iid === this.id) continue;
          if (!this.snaps.has(iid)) this.snaps.set(iid, []);
          const arr = this.snaps.get(iid);
          arr.push({ t: now, ...snap });
          if (arr.length > 10) arr.shift();
        }
        this.onMsg({ type: 'p', players: msg.players });
      } else if (msg.type === 'hit') {
        this.onMsg(msg);
      } else if (msg.type === 'death') {
        this.onMsg(msg);
      } else if (msg.type === 'chat') {
        this.onMsg(msg);
      } else if (msg.type === 'pong') {
        this.pingMs = Math.round(performance.now() - this._pingAt);
        this.onMsg({ type: 'pong', ms: this.pingMs });
      }
    } catch { /* ignore */ }
  }

  send(data) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try { this.ws.send(JSON.stringify(data)); } catch { /* ignore */ }
  }

  sendPos(x, z, h, inCar, carX, carZ, carH, hp, wanted) {
    this.send({
      type: 'p',
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
      h: Math.round(h * 100) / 100,
      inCar: inCar ? 1 : 0,
      cx: carX != null ? Math.round(carX * 10) / 10 : undefined,
      cz: carZ != null ? Math.round(carZ * 10) / 10 : undefined,
      ch: carH != null ? Math.round(carH * 100) / 100 : undefined,
      hp: Math.round(hp),
      wanted
    });
  }

  sendHit(targetId, dmg) {
    this.send({ type: 'hit', target: targetId, dmg });
  }

  sendChat(text) {
    this.send({ type: 'chat', text: text.slice(0, 100) });
  }

  // Interpolyatsiya bilan pozitsiyani olish
  getInterpolated(id, interpMs = 130) {
    const arr = this.snaps.get(id);
    if (!arr || arr.length < 1) return null;
    const renderTime = performance.now() - interpMs;
    // Ikki snap orasida interpolyatsiya
    for (let i = arr.length - 1; i > 0; i--) {
      const a = arr[i - 1], b = arr[i];
      if (a.t <= renderTime && renderTime <= b.t) {
        const t = (renderTime - a.t) / (b.t - a.t);
        return {
          x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t),
          h: lerpA(a.h, b.h, t), inCar: b.inCar,
          cx: b.cx != null ? lerp(a.cx??b.cx, b.cx, t) : undefined,
          cz: b.cz != null ? lerp(a.cz??b.cz, b.cz, t) : undefined,
          ch: b.ch != null ? lerpA(a.ch??b.ch, b.ch, t) : undefined,
          hp: b.hp, wanted: b.wanted
        };
      }
    }
    return arr[arr.length - 1];
  }

  _startPing() {
    this._pingInterval = setInterval(() => {
      this._pingAt = performance.now();
      this.send({ type: 'ping' });
    }, 3000);
  }
  _stopPing() { clearInterval(this._pingInterval); }

  disconnect() {
    this._stopPing();
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.connected = false;
  }
}

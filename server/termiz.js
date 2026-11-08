// Termiz GTA — /ws3 WebSocket server (relay mode)
import { WebSocketServer } from 'ws';

const MAX_PLAYERS = 16;
const PING_INTERVAL = 15000;

export function createTermiz() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
  let nextId = 1;
  const players = new Map(); // id → { ws, id, name, color, x, z, h, inCar, cx, cz, ch, hp, wanted }

  function broadcast(data, exceptId = -1) {
    const str = JSON.stringify(data);
    for (const [id, p] of players) {
      if (id === exceptId) continue;
      if (p.ws.readyState === 1) {
        try { p.ws.send(str); } catch { /* ignore */ }
      }
    }
  }

  function broadcastAll(data) {
    const str = JSON.stringify(data);
    for (const [, p] of players) {
      if (p.ws.readyState === 1) {
        try { p.ws.send(str); } catch { /* ignore */ }
      }
    }
  }

  function sendTo(id, data) {
    const p = players.get(id);
    if (p && p.ws.readyState === 1) {
      try { p.ws.send(JSON.stringify(data)); } catch { /* ignore */ }
    }
  }

  // Barcha o'yinchilar pozitsiyasini broadcast
  let lastBroadcast = Date.now();
  setInterval(() => {
    if (players.size === 0) return;
    const now = Date.now();
    if (now - lastBroadcast < 40) return; // max 25 Hz
    lastBroadcast = now;

    const dict = {};
    for (const [id, p] of players) {
      dict[id] = {
        name: p.name, color: p.color,
        x: p.x, z: p.z, h: p.h,
        inCar: p.inCar, cx: p.cx, cz: p.cz, ch: p.ch,
        hp: p.hp, wanted: p.wanted,
      };
    }
    broadcastAll({ type: 'p', players: dict });
  }, 50);

  wss.on('connection', (ws) => {
    if (players.size >= MAX_PLAYERS) {
      ws.close(1008, 'Server to\'liq');
      return;
    }

    const id = nextId++;
    const player = {
      ws, id,
      name: `Oʻyinchi${id}`, color: 0,
      x: 0, z: 0, h: 0,
      inCar: 0, cx: 0, cz: 0, ch: 0,
      hp: 100, wanted: 0,
      alive: true,
      pingAt: 0,
    };
    players.set(id, player);

    // Xush kelibsiz
    try { ws.send(JSON.stringify({ type: 'welcome', id })); } catch { /* ignore */ }
    console.log(`[Termiz] +${id} (jami: ${players.size})`);

    ws.on('pong', () => { player.pingAt = Date.now(); });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'join') {
        player.name = (msg.name || 'Mehmon').slice(0, 24);
        player.color = parseInt(msg.color) || 0;
        broadcast({ type: 'chat', name: 'Tizim', text: `${player.name} kirdi` }, id);

      } else if (msg.type === 'p') {
        // Pozitsiya yangilash
        player.x = typeof msg.x === 'number' ? msg.x : player.x;
        player.z = typeof msg.z === 'number' ? msg.z : player.z;
        player.h = typeof msg.h === 'number' ? msg.h : player.h;
        player.inCar = msg.inCar ? 1 : 0;
        if (msg.inCar) {
          player.cx = typeof msg.cx === 'number' ? msg.cx : player.cx;
          player.cz = typeof msg.cz === 'number' ? msg.cz : player.cz;
          player.ch = typeof msg.ch === 'number' ? msg.ch : player.ch;
        }
        player.hp     = typeof msg.hp     === 'number' ? Math.max(0, Math.min(100, msg.hp)) : player.hp;
        player.wanted = typeof msg.wanted === 'number' ? Math.max(0, Math.min(5, msg.wanted)) : player.wanted;

      } else if (msg.type === 'hit') {
        // Zarba relay
        const target = players.get(parseInt(msg.target));
        if (target && target.ws.readyState === 1) {
          const dmg = Math.min(100, Math.max(0, Number(msg.dmg) || 0));
          sendTo(target.id, { type: 'hit', from: id, target: target.id, dmg });
        }

      } else if (msg.type === 'chat') {
        const text = (msg.text || '').slice(0, 100);
        broadcastAll({ type: 'chat', from: id, name: player.name, text });

      } else if (msg.type === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong', t: msg.t })); } catch { /* ignore */ }
      }
    });

    ws.on('close', () => {
      players.delete(id);
      console.log(`[Termiz] -${id} (jami: ${players.size})`);
      broadcast({ type: 'chat', name: 'Tizim', text: `${player.name} chiqdi` });
    });

    ws.on('error', () => {});
  });

  // Ping-pong keepalive
  setInterval(() => {
    for (const [, p] of players) {
      if (p.ws.readyState === 1) {
        try { p.ws.ping(); } catch { /* ignore */ }
      }
    }
  }, PING_INTERVAL);

  return {
    handleUpgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    },
    get playerCount() { return players.size; },
  };
}

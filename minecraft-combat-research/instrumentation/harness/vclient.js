// Packet-level "virtual vanilla client" for Minecraft Java 1.21.11.
// Reproduces the per-tick serverbound packet ORDER of the vanilla client, derived from
// Minecraft.tick() -> gameMode.tick() -> handleKeybinds() -> level.tickEntities() (LocalPlayer.tick/sendPosition)
// -> ServerboundClientTickEndPacket. It does NOT simulate client physics; experiments script positions explicitly.
'use strict';
const mc = require('minecraft-protocol');
const net = require('net');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class VClient {
  constructor(name, opts = {}) {
    this.name = name; this.opts = opts;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.onGround = true; this.hColl = false;
    this.selected = 0; this.carriedIndex = 0; this.sprinting = false; this.wasSprinting = false;
    this.input = 0; this.lastSentInput = 0; this.velocities = []; this.entityId = null; this.health = 20;
    this.tickNo = 0; this.lastSentPos = null; this.lastSentRot = null; this.events = [];
  }
  connect(host = '127.0.0.1', port = 25565) {
    return new Promise((resolve, reject) => {
      const c = this.client = mc.createClient({ host, port, username: this.name, version: '1.21.11', auth: 'offline', hideErrors: false });
      c.on('error', (e) => { console.error(this.name, 'error', e.message); });
      c.on('end', (r) => { this.ended = true; });
      c.on('kick_disconnect', (p) => console.error(this.name, 'kicked', JSON.stringify(p)));
      c.on('login', (p) => { this.entityId = p.entityId; });
      c.on('position', (p) => {
        // absolute teleports only in this harness (flags==0 expected)
        this.x = p.x; this.y = p.y; this.z = p.z; this.yaw = p.yaw; this.pitch = p.pitch;
        c.write('teleport_confirm', { teleportId: p.teleportId });
        c.write('position_look', { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, flags: { onGround: false, hasHorizontalCollision: false } });
        this.events.push({ t: this.tickNo, ev: 'teleport', x: p.x, y: p.y, z: p.z });
        if (!this.loaded) { this.loaded = true; c.write('player_loaded', {}); setTimeout(() => resolve(this), 300); }
      });
      c.on('chunk_batch_finished', () => c.write('chunk_batch_received', { chunksPerTick: 20.0 }));
      c.on('entity_velocity', (p) => {
        if (p.entityId === this.entityId) { const v = p.velocity; this.velocities.push({ t: this.tickNo, wall: Date.now(), x: v.x, y: v.y, z: v.z }); }
      });
      c.on('update_health', (p) => { this.health = p.health; this.food = p.food; });
      c.on('packet', (data, meta) => { if (/cooldown/.test(meta.name)) { (this.cooldowns = this.cooldowns || []).push({ t: this.tickNo, name: meta.name, data }); } });
      c.on('held_item_slot', (p) => { this.selected = this.carriedIndex = p.slot ?? p.slotId; });
      setTimeout(() => reject(new Error('connect timeout ' + this.name)), 20000);
    });
  }
  // ---- per-tick emulation (one call == one vanilla client tick) ----
  // actions: {slotKey: n, attack: [entityId,...], sprint: bool, input: bits, pos:{x,y,z}, rot:{yaw,pitch}, onGround: bool, use: bool, releaseUse: bool}
  tick(a = {}) {
    const c = this.client;
    // (1) gameMode.tick(): ensureHasSentCarriedItem() for slot changes made by scroll during previous frames
    if (a.scrollSlot !== undefined) this.selected = a.scrollSlot; // scroll happened in frames before this tick
    this.ensureCarried();
    // (2) handleKeybinds(): hotbar keys first, then use-item release, attacks, uses
    if (a.slotKey !== undefined) this.selected = a.slotKey;
    if (a.releaseUse) { c.write('block_dig', { status: 5, location: { x: 0, y: 0, z: 0 }, face: 0, sequence: 0 }); this.using = false; }
    if (a.attack && !this.using) for (const id of a.attack) {
      this.ensureCarried();
      c.write('use_entity', { target: id, mouse: 1, sneaking: !!a.sneak });
      c.write('arm_animation', { hand: 0 });
      if (a.clientPredictSprintReset !== false && this.sprinting && a.predictHit) this.sprinting = false; // client-side causeExtraKnockback prediction
    }
    if (a.use) { this.ensureCarried(); c.write('use_item', { hand: a.useHand ?? 1, sequence: ++this.seqNo || (this.seqNo = 1), rotation: { x: this.yaw, y: this.pitch } }); this.using = true; }
    // (3) LocalPlayer.tick(): player_input if changed, then sendPosition(): sprint cmd if changed, then move packet
    if (a.input !== undefined) this.input = a.input;
    if (this.input !== this.lastSentInput) { c.write('player_input', { inputs: this.bits(this.input) }); this.lastSentInput = this.input; }
    if (a.sprint !== undefined) this.sprinting = a.sprint;
    if (this.sprinting !== this.wasSprinting) { c.write('entity_action', { entityId: this.entityId, actionId: this.sprinting ? 'start_sprinting' : 'stop_sprinting', jumpBoost: 0 }); this.wasSprinting = this.sprinting; }
    if (a.pos) { this.x = a.pos.x; this.y = a.pos.y; this.z = a.pos.z; }
    if (a.rot) { this.yaw = a.rot.yaw; this.pitch = a.rot.pitch ?? this.pitch; }
    if (a.onGround !== undefined) this.onGround = a.onGround;
    if (!a.noMove) c.write('position_look', { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, flags: { onGround: this.onGround, hasHorizontalCollision: this.hColl } });
    // (4) ServerboundClientTickEndPacket
    c.write('tick_end', {});
    this.tickNo++;
  }
  ensureCarried() { if (this.selected !== this.carriedIndex) { this.carriedIndex = this.selected; this.client.write('held_item_slot', { slotId: this.selected }); } }
  bits(n) { const f = ['forward', 'backward', 'left', 'right', 'jump', 'shift', 'sprint']; const o = {}; f.forEach((k, i) => o[k] = !!(n & (1 << i))); return o; }
  end() { try { this.client.end(); } catch (e) { } }
}

// Minimal RCON client (Source RCON protocol) for test setup commands only.
class Rcon {
  constructor(host = '127.0.0.1', port = 25575, pw = 'research') { this.host = host; this.port = port; this.pw = pw; this.id = 1; this.pending = new Map(); this.buf = Buffer.alloc(0); }
  connect() {
    return new Promise((res, rej) => {
      this.s = net.connect(this.port, this.host, async () => { await this.send(this.pw, 3); res(this); });
      this.s.on('error', rej);
      this.s.on('data', (d) => {
        this.buf = Buffer.concat([this.buf, d]);
        while (this.buf.length >= 4) {
          const len = this.buf.readInt32LE(0); if (this.buf.length < len + 4) break;
          const id = this.buf.readInt32LE(4); const body = this.buf.toString('utf8', 12, 4 + len - 2);
          this.buf = this.buf.subarray(4 + len);
          const p = this.pending.get(id); if (p) { this.pending.delete(id); p(body); }
        }
      });
    });
  }
  send(cmd, type = 2) {
    const id = this.id++; const body = Buffer.from(cmd, 'utf8');
    const b = Buffer.alloc(14 + body.length); b.writeInt32LE(10 + body.length, 0); b.writeInt32LE(id, 4); b.writeInt32LE(type, 8); body.copy(b, 12); b.writeInt16LE(0, 12 + body.length);
    return new Promise((res) => { this.pending.set(id, res); this.s.write(b); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); res(''); } }, 3000); });
  }
  cmd(c) { return this.send(c, 2); }
  end() { this.s.end(); }
}

// Fixed-rate tick driver: calls fn(i) every 50 ms using a drift-corrected schedule.
async function runTicks(n, fn, period = 50) {
  const t0 = Date.now();
  for (let i = 0; i < n; i++) { await fn(i); const next = t0 + (i + 1) * period; const d = next - Date.now(); if (d > 0) await sleep(d); }
}
module.exports = { VClient, Rcon, sleep, runTicks };

'use strict';
const { VClient, Rcon, sleep, runTicks } = require('./vclient');
const Y = -60; // superflat surface
async function setup(names, rc) {
  for (const n of names) {
    await rc.cmd(`clear ${n}`); await rc.cmd(`effect clear ${n}`);
    await rc.cmd(`attribute ${n} minecraft:max_health base set 1024`);
    await rc.cmd(`effect give ${n} minecraft:instant_health 1 120 true`);
    await rc.cmd(`effect give ${n} minecraft:saturation 1000000 10 true`);
  }
}
async function world(rc) {
  const out = [];
  for (const g of ['spawn_mobs false', 'advance_time false', 'advance_weather false', 'doMobSpawning false', 'doDaylightCycle false', 'doWeatherCycle false'])
    out.push(g + ' -> ' + (await rc.cmd('gamerule ' + g)));
  await rc.cmd('time set noon'); await rc.cmd('weather clear');
  return out;
}
async function tp(rc, n, x, y, z, yaw = 0, pitch = 0) { await rc.cmd(`tp ${n} ${x} ${y} ${z} ${yaw} ${pitch}`); }
async function mark(rc, label) { return rc.cmd('probe mark ' + label); }
async function connectAll(names) { const bots = {}; for (const n of names) { bots[n] = await new VClient(n).connect(); await sleep(200); } return bots; }
// yaw (MC convention): facing vector = (-sin(yaw), cos(yaw)); yaw that faces from (x1,z1) to (x2,z2)
function yawTo(x1, z1, x2, z2) { return Math.atan2(-(x2 - x1), (z2 - z1)) * 180 / Math.PI; }
module.exports = { VClient, Rcon, sleep, runTicks, setup, world, tp, mark, connectAll, yawTo, Y };

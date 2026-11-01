// E5b: Which ticks of a standing jump yield a server-side crit? Client positions follow vanilla jump physics
// (v=0.42; each tick y+=v; v=(v-0.08)*0.98). Attack is sent in client tick k (before tick k's move packet).
const H = require('./common'); const fs = require('fs');
const server = process.argv[2] || 'paper'; const port = +(process.argv[3] || 25565); const rport = +(process.argv[4] || 25575);
function arc() { const ys = []; let y = 0, v = 0.42; for (let i = 0; i < 20; i++) { y += v; v = (v - 0.08) * 0.98; if (y <= 0) { ys.push(0); break; } ys.push(y); } return ys; }
(async () => {
  const rc = await new H.Rcon('127.0.0.1', rport).connect();
  const A = await new H.VClient('A').connect('127.0.0.1', port); await H.sleep(200);
  const T = await new H.VClient('T').connect('127.0.0.1', port);
  await H.world(rc); await H.setup(['A', 'T'], rc); await rc.cmd('give A minecraft:diamond_sword');
  const ys = arc(); console.log('arc', ys.map(x => x.toFixed(4)).join(' '));
  const res = [];
  for (let k = 1; k < ys.length; k++) for (let rep = 0; rep < 3; rep++) {
    await H.tp(rc, 'A', 0.5, H.Y, 0.5, 0, 0); await H.tp(rc, 'T', 0.5, H.Y, 3.25, 180, 0); await H.sleep(150);
    await rc.cmd('effect give T minecraft:instant_health 1 120 true'); await H.sleep(300);
    const aim = H.yawTo(A.x, A.z, T.x, T.z) + 0; const J = 25; const hp = [];
    if (server === 'paper') await H.mark(rc, `E5b k=${k} rep=${rep}`);
    await H.runTicks(J + ys.length + 6, async (i) => {
      T.tick({ onGround: true }); hp.push(T.health);
      if (i < 4) { A.tick({ onGround: true, rot: { yaw: aim + [0.5, 45, 45.5, 0][i], pitch: 0 } }); return; }
      const j = i - J; // j=0 is the jump tick (packet: y0+0.42, onGround=false)
      let y = H.Y, og = true;
      if (j >= 0 && j < ys.length) { y = H.Y + ys[j]; og = ys[j] === 0; }
      A.tick({ onGround: og, attack: j === k ? [T.entityId] : undefined, pos: { x: 0.5, y, z: 0.5 }, rot: { yaw: aim, pitch: 0 } });
    });
    await H.sleep(250); hp.push(T.health);
    const pre = hp[J + k - 1]; const dmg = +(pre - Math.min(...hp.slice(J + k))).toFixed(4);
    res.push({ server, k, rep, yBeforeAttack: ys[k - 1], dmg, crit: dmg > 7.01 });
    console.log(server, 'k', k, 'y(k-1)', ys[k - 1].toFixed(4), 'rep', rep, 'dmg', dmg, dmg > 7.01 ? 'CRIT' : '');
  }
  fs.writeFileSync(`/home/user/mirrortab/minecraft-combat-research/test-results/E5b_jump_crit_window_${server}.json`, JSON.stringify(res, null, 1));
  if (server === 'paper') await rc.cmd('probe flush');
  A.end(); T.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

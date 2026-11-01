// E5: Crits while sinking in a cobweb. Server: aiStep -> applyEffectsFromBlocks -> WebBlock.entityInside -> makeStuckInBlock -> resetFallDistance().
// handleMovePlayer adds -dy to fallDistance. Attack in client tick N is processed BEFORE tick N's move packet.
// Prediction: crit only if tick N-1's move packet and tick N's attack are processed in the same inter-tick window (bunched ticks).
const H = require('./common'); const fs = require('fs');
const server = process.argv[2] || 'paper'; const port = +(process.argv[3] || 25565); const rport = +(process.argv[4] || 25575);
(async () => {
  const rc = await new H.Rcon('127.0.0.1', rport).connect();
  const A = await new H.VClient('A').connect('127.0.0.1', port); await H.sleep(200);
  const T = await new H.VClient('T').connect('127.0.0.1', port);
  await H.world(rc); await H.setup(['A', 'T'], rc); await rc.cmd('give A minecraft:diamond_sword');
  const res = [];
  for (const mode of ['normal_spacing', 'bunched_prev_tick', 'no_web_falling_normal']) for (let rep = 0; rep < 5; rep++) {
    await rc.cmd('setblock 0 -60 0 ' + (mode === 'no_web_falling_normal' ? 'minecraft:air' : 'minecraft:cobweb'));
    await H.tp(rc, 'A', 0.5, -59.5, 0.5, 0, 0); await H.tp(rc, 'T', 0.5, H.Y, 3.25, 180, 0); await H.sleep(200);
    await rc.cmd('effect give T minecraft:instant_health 1 120 true'); await H.sleep(300);
    const aim = H.yawTo(A.x, A.z, T.x, T.z) + 0;
    let y = -59.5; const N = 30; const hp = [];
    const dy = mode === 'no_web_falling_normal' ? -0.0 : -0.0039; // in web: slow sink; no web: hover (fall begins at N-2)
    if (server === 'paper') await H.mark(rc, `E5 mode=${mode} rep=${rep}`);
    await H.runTicks(N + 8, async (i) => {
      T.tick({ onGround: true }); hp.push(T.health);
      if (i < 4) { A.tick({ onGround: false, pos: { x: 0.5, y, z: 0.5 }, rot: { yaw: aim + [0.5, 45, 45.5, 0][i], pitch: 0 } }); return; }
      if (mode === 'no_web_falling_normal' && i >= N - 3) y -= 0.08; else y += dy;
      if (i === N - 1 && mode === 'bunched_prev_tick') return; // hold tick N-1 back (frame hitch): sent together with tick N below
      if (i === N && mode === 'bunched_prev_tick') {
        A.tick({ onGround: false, pos: { x: 0.5, y: y - dy, z: 0.5 }, rot: { yaw: aim, pitch: 0 } }); // tick N-1 (late)
        A.tick({ onGround: false, attack: [T.entityId], pos: { x: 0.5, y, z: 0.5 }, rot: { yaw: aim, pitch: 0 } }); // tick N, immediately after
        return;
      }
      if (i === N) { A.tick({ onGround: false, attack: [T.entityId], pos: { x: 0.5, y, z: 0.5 }, rot: { yaw: aim, pitch: 0 } }); return; }
      A.tick({ onGround: false, pos: { x: 0.5, y, z: 0.5 }, rot: { yaw: aim, pitch: 0 } });
    });
    await H.sleep(250); hp.push(T.health);
    const pre = hp[N - 2]; const dmg = +(pre - Math.min(...hp.slice(N - 1))).toFixed(4);
    res.push({ server, mode, rep, dmg, crit: dmg > 7.01 });
    console.log(server, mode, rep, 'dmg', dmg, dmg > 7.01 ? 'CRIT' : '');
  }
  await rc.cmd('setblock 0 -60 0 minecraft:air');
  fs.writeFileSync(`/home/user/mirrortab/minecraft-combat-research/test-results/E5_web_crit_${server}.json`, JSON.stringify(res, null, 1));
  if (server === 'paper') await rc.cmd('probe flush');
  A.end(); T.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

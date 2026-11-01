// E8: (a) same-tick sword->axe swap vs shield, spaced >5 s so the 100-tick shield cooldown never carries over.
//     (b) control for E1: non-sprinting flick (extra-KB strength = 0 -> no yaw component expected).
const H = require('./common'); const fs = require('fs');
const server = process.argv[2] || 'paper'; const port = +(process.argv[3] || 25565); const rport = +(process.argv[4] || 25575);
(async () => {
  const rc = await new H.Rcon('127.0.0.1', rport).connect();
  const A = await new H.VClient('A').connect('127.0.0.1', port); await H.sleep(200);
  const T = await new H.VClient('T').connect('127.0.0.1', port);
  await H.world(rc); await H.setup(['A', 'T'], rc);
  await rc.cmd('give A minecraft:diamond_sword'); await rc.cmd('give A minecraft:diamond_axe');
  await rc.cmd('item replace entity T weapon.offhand with minecraft:shield');
  const res = [];
  const plans = [{ name: 'shield_sword_only', key: undefined, shield: true }, { name: 'shield_sword_to_axe_sametick', key: 1, shield: true },
                 { name: 'nosprint_flick90', flick: 90 }];
  for (const P of plans) for (let rep = 0; rep < 4; rep++) {
    await H.tp(rc, 'A', 0.5, H.Y, 0.5, 0, 0); await H.tp(rc, 'T', 0.5, H.Y, 3.25, 180, 0); await H.sleep(150);
    const aim = H.yawTo(A.x, A.z, T.x, T.z) + 0; T.velocities.length = 0; T.cooldowns = [];
    if (server === 'paper') await H.mark(rc, `E8 plan=${P.name} rep=${rep}`);
    const N = 30;
    await H.runTicks(N + 8, async (i) => {
      if (P.shield && i === 5) T.tick({ onGround: true, use: true, useHand: 1 }); else T.tick({ onGround: true });
      if (i < 4) { A.tick({ onGround: true, scrollSlot: 0, rot: { yaw: aim + [0.5, 45, 45.5, 0][i], pitch: 0 } }); return; }
      if (P.flick && i === N - 1) { A.tick({ onGround: true, rot: { yaw: aim + P.flick, pitch: 0 } }); return; }
      if (i === N) { A.tick({ onGround: true, slotKey: P.key, attack: [T.entityId], rot: { yaw: aim, pitch: 0 } }); return; }
      if (i === N + 2) { A.tick({ onGround: true, slotKey: 0, rot: { yaw: aim, pitch: 0 } }); return; }
      A.tick({ onGround: true, rot: { yaw: aim, pitch: 0 } });
    });
    await H.sleep(250); if (P.shield) T.tick({ onGround: true, releaseUse: true });
    const cd = (T.cooldowns || []).map(c => c.data.cooldownTicks);
    const v = T.velocities[0] ? [T.velocities[0].x, T.velocities[0].y, T.velocities[0].z].map(x => +x.toFixed(4)) : null;
    res.push({ server, plan: P.name, rep, shieldCooldownPkts: cd, kb: v });
    console.log(server, P.name, rep, 'shieldCooldownTicks', JSON.stringify(cd), 'kb', JSON.stringify(v));
    if (P.shield) await H.sleep(5600);
  }
  fs.writeFileSync(`/home/user/mirrortab/minecraft-combat-research/test-results/E8_shield_swap_${server}.json`, JSON.stringify(res, null, 1));
  if (server === 'paper') await rc.cmd('probe flush');
  A.end(); T.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

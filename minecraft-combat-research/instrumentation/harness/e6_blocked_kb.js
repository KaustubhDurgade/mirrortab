// E6: Shield-blocked hit. Knockback is applied to the defender's SERVER velocity (hurtServer applies 0.4 KB even when blocked)
// but no velocity packet is sent (markHurt skipped). Does the server-side player sim then displace the defender and
// trigger a "moved wrongly" correction (teleport) on the next movement packet?
const H = require('./common'); const fs = require('fs');
const server = process.argv[2] || 'paper'; const port = +(process.argv[3] || 25565); const rport = +(process.argv[4] || 25575);
(async () => {
  const rc = await new H.Rcon('127.0.0.1', rport).connect();
  const A = await new H.VClient('A').connect('127.0.0.1', port); await H.sleep(200);
  const T = await new H.VClient('T').connect('127.0.0.1', port);
  await H.world(rc); await H.setup(['A', 'T'], rc);
  await rc.cmd('give A minecraft:diamond_sword');
  await rc.cmd('item replace entity T weapon.offhand with minecraft:shield');
  const res = [];
  for (const sprint of [false, true]) for (let rep = 0; rep < 3; rep++) {
    await H.tp(rc, 'A', 0.5, H.Y, 0.5, 0, 0); await H.tp(rc, 'T', 0.5, H.Y, 3.25, 180, 0); await H.sleep(150);
    const aim = H.yawTo(A.x, A.z, T.x, T.z) + 0;
    T.velocities.length = 0; T.events.length = 0;
    const T0 = { x: T.x, y: T.y, z: T.z };
    if (server === 'paper') await H.mark(rc, `E6 sprint=${sprint} rep=${rep}`);
    const N = 30;
    await H.runTicks(N + 15, async (i) => {
      if (i === 5) T.tick({ onGround: true, use: true, useHand: 1 }); else T.tick({ onGround: true, pos: T0 });
      if (i < 4) { A.tick({ onGround: true, rot: { yaw: aim + [0.5, 45, 45.5, 0][i], pitch: 0 } }); return; }
      if (i === 6 && sprint) { A.tick({ onGround: true, sprint: true, input: 65, rot: { yaw: aim, pitch: 0 } }); return; }
      if (i === N) { A.tick({ onGround: true, attack: [T.entityId], rot: { yaw: aim, pitch: 0 } }); return; }
      A.tick({ onGround: true, rot: { yaw: aim, pitch: 0 } });
    });
    await H.sleep(200);
    T.tick({ onGround: true, releaseUse: true }); A.tick({ sprint: false, input: 0 });
    const tps = T.events.filter(e => e.ev === 'teleport');
    res.push({ server, sprint, rep, velocityPackets: T.velocities, teleports: tps, T0 });
    console.log(server, 'sprint', sprint, rep, 'vel pkts', T.velocities.length, 'teleports', JSON.stringify(tps.map(t => [t.t, +t.x.toFixed(4), +t.y.toFixed(4), +t.z.toFixed(4)])));
    await H.sleep(5500); // shield disable cooldown not expected (sword), but keep spacing
  }
  fs.writeFileSync(`/home/user/mirrortab/minecraft-combat-research/test-results/E6_blocked_kb_${server}.json`, JSON.stringify(res, null, 1));
  if (server === 'paper') await rc.cmd('probe flush');
  A.end(); T.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

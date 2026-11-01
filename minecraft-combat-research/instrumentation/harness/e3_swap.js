// E3: Same-client-tick hotbar swap + attack ("attribute swapping") on Paper vs vanilla.
// Client order within one tick: hotbar key -> startAttack -> ensureHasSentCarriedItem (held_item_slot) -> use_entity -> swing.
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
  // holdSlot: slot held before; atkSlotKey: hotbar key pressed in the attack tick (undefined = no swap); shield: T blocks
  const plans = [
    { name: 'sword_baseline', hold: 0 },
    { name: 'axe_baseline', hold: 1 },
    { name: 'sword_to_axe_sametick', hold: 0, key: 1 },
    { name: 'axe_to_sword_sametick', hold: 1, key: 0 },
    { name: 'sword_to_axe_prevtick', hold: 0, keyPrev: 1 },
    { name: 'shield_sword_baseline', hold: 0, shield: true },
    { name: 'shield_sword_to_axe_sametick', hold: 0, key: 1, shield: true },
  ];
  for (const P of plans) for (let rep = 0; rep < 3; rep++) {
    await H.tp(rc, 'A', 0.5, H.Y, 0.5, 0, 0); await H.tp(rc, 'T', 0.5, H.Y, 3.25, 180, 0); await H.sleep(150);
    await rc.cmd('effect give T minecraft:instant_health 1 120 true');
    const aim = H.yawTo(A.x, A.z, T.x, T.z) + 0;
    T.velocities.length = 0; T.cooldowns = [];
    if (server === 'paper') await H.mark(rc, `E3 plan=${P.name} rep=${rep}`);
    const hp = []; const N = 40;
    await H.runTicks(N + 10, async (i) => {
      // T: optionally raise shield at i=5 and keep it up
      if (P.shield && i === 5) T.tick({ onGround: true, use: true, useHand: 1 }); else T.tick({ onGround: true });
      if (i < 4) { A.tick({ onGround: true, scrollSlot: P.hold, rot: { yaw: aim + [0.5, 45, 45.5, 0][i], pitch: 0 } }); return; }
      if (i === N - 1 && P.keyPrev !== undefined) { A.tick({ onGround: true, slotKey: P.keyPrev, rot: { yaw: aim, pitch: 0 } }); return; }
      if (i === N) { A.tick({ onGround: true, slotKey: P.key, attack: [T.entityId], rot: { yaw: aim, pitch: 0 } }); hp.push(T.health); return; }
      if (i === N + 2) { A.tick({ onGround: true, slotKey: P.hold, rot: { yaw: aim, pitch: 0 } }); return; }
      A.tick({ onGround: true, rot: { yaw: aim, pitch: 0 } }); hp.push(T.health);
    });
    await H.sleep(250);
    if (P.shield) { T.tick({ onGround: true, releaseUse: true }); }
    const dmg = +(hp[0] - Math.min(...hp)).toFixed(4);
    const v = T.velocities[0] ? [T.velocities[0].x, T.velocities[0].y, T.velocities[0].z].map(x => +x.toFixed(4)) : null;
    const shieldCd = (T.cooldowns || []).map(c => c.data);
    res.push({ server, plan: P.name, rep, dmg, kb: v, shieldCd });
    console.log(server, P.name, rep, 'dmg', dmg, 'kb', JSON.stringify(v), 'cooldownPkts', JSON.stringify(shieldCd));
    await H.sleep(300);
  }
  fs.writeFileSync(`/home/user/mirrortab/minecraft-combat-research/test-results/E3_swap_${server}.json`, JSON.stringify(res, null, 1));
  if (server === 'paper') await rc.cmd('probe flush');
  A.end(); T.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

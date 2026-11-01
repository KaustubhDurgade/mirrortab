// E9: Triple attribute swap (sword damage/charge + spear client reach + mace smash bonus). BACKGROUND ONLY (not Diamond-kit legal).
// Vanilla client, one tick: frames before tick N: scroll to spear  -> pick() at tick start uses spear ATTACK_RANGE (4.5+0.125)
//                            tick N: gameMode.tick sends slot=spear; hotbar key mace; startAttack (mace has no ATTACK_RANGE -> no client check)
//                            -> slot=mace, attack, swing.  Server: attributes from last Player.tick (sword, vanilla), weapon item = mace.
// Attacker walks off a 5-block pillar; attack on fall tick 10 (server state after tick 9: fallDistance 3.297, 1.70 above ground).
const H = require('./common'); const fs = require('fs');
const server = process.argv[2] || 'paper'; const port = +(process.argv[3] || 25565); const rport = +(process.argv[4] || 25575);
(async () => {
  const rc = await new H.Rcon('127.0.0.1', rport).connect();
  const A = await new H.VClient('A').connect('127.0.0.1', port); await H.sleep(200);
  const T = await new H.VClient('T').connect('127.0.0.1', port);
  await H.world(rc); await H.setup(['A', 'T'], rc);
  await rc.cmd('give A minecraft:diamond_sword'); await rc.cmd('give A minecraft:diamond_spear'); await rc.cmd('give A minecraft:mace');
  await rc.cmd('fill 0 -60 0 0 -56 0 minecraft:stone');
  const TOP = -55, TZ = 5.6;
  const plans = [
    { name: 'mace_only', hold: 2 },
    { name: 'sword_only', hold: 0 },
    { name: 'sword_to_mace', hold: 0, key: 2 },
    { name: 'triple_sword_spear_mace', hold: 0, scroll: 1, key: 2 },
  ];
  const res = [];
  for (const P of plans) for (let rep = 0; rep < 3; rep++) {
    await H.tp(rc, 'A', 0.5, TOP, 0.5, 0, 0); await H.tp(rc, 'T', 0.5, H.Y, TZ, 180, 0); await H.sleep(150);
    await rc.cmd('effect give T minecraft:instant_health 1 120 true'); await H.sleep(300);
    const aim = H.yawTo(0.5, 1.4, 0.5, TZ) + 0;
    if (server === 'paper') await H.mark(rc, `E9 plan=${P.name} rep=${rep}`);
    let x = 0.5, y = TOP, z = 0.5, v = -0.0784, og = true; const W = 45; const hp = []; let atkIdx = -1, fallTick = 0, fdAt = null, eyeDist = null;
    await H.runTicks(W + 18, async (i) => {
      T.tick({ onGround: true }); hp.push(T.health);
      if (i < 4) { A.tick({ onGround: true, scrollSlot: P.hold, rot: { yaw: aim + [0.5, 45, 45.5, 0][i], pitch: 0 } }); return; }
      if (i < W) { A.tick({ onGround: true, rot: { yaw: aim, pitch: 20 } }); return; }        // charge >= 40 ticks holding P.hold
      const k = i - W;
      if (k < 3) { z += 0.3; og = z <= 1.3; if (!og) { y += v; v = (v - 0.08) * 0.98; fallTick++; } }
      else if (y > H.Y) { y += v; v = (v - 0.08) * 0.98; fallTick++; og = false; if (y <= H.Y) { y = H.Y; og = true; } }
      const attackNow = fallTick === 10 && atkIdx < 0;
      if (attackNow) {
        atkIdx = hp.length - 1; fdAt = TOP - (y - v / 0.98 - 0.08 + 0.08) ; // informational only
        const ey = (y - (v / 0.98 + 0.08)) + 1.62; eyeDist = Math.hypot(Math.max(0, ey - (H.Y + 1.8)), TZ - 0.3 - z);
        A.tick({ onGround: og, scrollSlot: P.scroll, slotKey: P.key, attack: [T.entityId], pos: { x, y, z }, rot: { yaw: aim, pitch: 20 } });
      } else A.tick({ onGround: og, pos: { x, y, z }, rot: { yaw: aim, pitch: 20 } });
    });
    await H.sleep(300); hp.push(T.health);
    const pre = hp[atkIdx - 1]; const dmg = +(pre - Math.min(...hp.slice(atkIdx))).toFixed(4);
    res.push({ server, plan: P.name, rep, dmg, eyeToTargetBoxApprox: +eyeDist.toFixed(3) });
    console.log(server, P.name, rep, 'dmg', dmg, 'eye->box ~', eyeDist.toFixed(2));
    await rc.cmd('fill 0 -60 0 0 -56 0 minecraft:stone');
  }
  fs.writeFileSync(`/home/user/mirrortab/minecraft-combat-research/test-results/E9_triple_swap_${server}.json`, JSON.stringify(res, null, 1));
  if (server === 'paper') await rc.cmd('probe flush');
  A.end(); T.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

// E2: Does a click that lands during the target's i-frames (and deals no damage) reset the attacker's cooldown?
// Vanilla: Player.attack -> onAttack() -> resetOnlyAttackStrengthTicker() BEFORE damage (always).
// Paper/CraftBukkit: reset moved into LivingEntity.actuallyHurt (only reached if damage goes through).
const H = require('./common'); const fs = require('fs');
const server = process.argv[2] || 'paper'; const port = +(process.argv[3] || 25565); const rport = +(process.argv[4] || 25575);
(async () => {
  const rc = await new H.Rcon('127.0.0.1', rport).connect();
  const A = await new H.VClient('A').connect('127.0.0.1', port); await H.sleep(200);
  const T = await new H.VClient('T').connect('127.0.0.1', port);
  await H.world(rc); await H.setup(['A', 'T'], rc); await rc.cmd('give A minecraft:diamond_sword');
  const res = [];
  const plans = {
    noGhost: [0, 13],
    ghostAt5: [0, 5, 13],
    ghostAt3and7: [0, 3, 7, 13],
    spam_every2: [0, 2, 4, 6, 8, 10, 12, 14],
  };
  for (const [plan, clicks] of Object.entries(plans)) for (let rep = 0; rep < 4; rep++) {
    await H.tp(rc, 'A', 0.5, H.Y, 0.5, 0, 0); await H.tp(rc, 'T', 0.5, H.Y, 3.25, 180, 0); await H.sleep(150);
    await rc.cmd('effect give T minecraft:instant_health 1 120 true');
    const aim = H.yawTo(A.x, A.z, T.x, T.z) + 0;
    const hp = [];
    if (server === 'paper') await H.mark(rc, `E2 plan=${plan} rep=${rep}`);
    const base = 40;
    await H.runTicks(base + 20, async (i) => {
      T.tick({ onGround: true });
      if (i < 4) { A.tick({ onGround: true, rot: { yaw: aim + [0.5, 45, 45.5, 0][i], pitch: 0 } }); return; }
      const k = i - base;
      if (clicks.includes(k)) A.tick({ attack: [T.entityId], onGround: true, rot: { yaw: aim, pitch: 0 } });
      else A.tick({ onGround: true, rot: { yaw: aim, pitch: 0 } });
      hp.push([k, T.health]);
    });
    await H.sleep(200);
    // damage per click: health drop observed after each click
    const drops = []; for (let j = 1; j < hp.length; j++) if (hp[j][1] < hp[j - 1][1] - 1e-6) drops.push([hp[j][0], +(hp[j - 1][1] - hp[j][1]).toFixed(4)]);
    res.push({ server, plan, rep, clicks, drops, final: T.health });
    console.log(server, plan, rep, 'damage events (tick,amount):', JSON.stringify(drops));
  }
  fs.writeFileSync(`/home/user/mirrortab/minecraft-combat-research/test-results/E2_iframe_cooldown_${server}.json`, JSON.stringify(res, null, 1));
  if (server === 'paper') await rc.cmd('probe flush');
  A.end(); T.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

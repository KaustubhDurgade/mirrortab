// E1: Which attacker yaw does the server use for the sprint (extra) knockback?
// Vanilla client order per tick: [use_entity attack] ... [position_look with CURRENT yaw] [tick_end].
// So an attack in tick N is processed with the yaw from tick N-1's move packet.
const H = require('./common');
const fs = require('fs');
(async () => {
  const rc = await new H.Rcon().connect();
  const bots = await H.connectAll(['A', 'T']);
  await H.world(rc); await H.setup(['A', 'T'], rc);
  await rc.cmd('give A minecraft:diamond_sword');
  const A = bots.A, T = bots.T;
  const results = [];
  const offsets = [0, 30, 60, 90, 135, 180, -90];
  const modes = ['flick_last_tick', 'control_aim_held'];
  for (const mode of modes) for (const off of offsets) for (let rep = 0; rep < 3; rep++) {
    await H.tp(rc, 'A', 0.5, H.Y, 0.5, 0, 0); await H.tp(rc, 'T', 0.5, H.Y, 3.25, 180, 0);
    await H.sleep(150);
    const aim = H.yawTo(A.x, A.z, T.x, T.z) + 0; // +0 normalizes -0
    const D = aim + off;
    T.velocities.length = 0;
    await H.mark(rc, `E1 mode=${mode} off=${off} rep=${rep}`);
    let atkTick = 30;
    await H.runTicks(36, async (i) => {
      T.tick({ onGround: true });
      // settle: deterministically consume CraftBukkit 'justTeleported' (see analysis/paper-differences.md)
      if (i === 1) { A.tick({ onGround: true, rot: { yaw: aim + 0.5, pitch: 0 } }); return; }   // sub-threshold drift
      if (i === 2) { A.tick({ onGround: true, rot: { yaw: aim + 45, pitch: 0 } }); return; }    // significant -> dropped, flag cleared
      if (i === 3) { A.tick({ onGround: true, rot: { yaw: aim + 45.5, pitch: 0 } }); return; }  // applied
      if (i === 4) { A.tick({ sprint: true, input: 1 | 64, onGround: true, rot: { yaw: aim, pitch: 0 } }); return; }
      if (mode === 'flick_last_tick') {
        if (i === atkTick - 1) A.tick({ onGround: true, rot: { yaw: D, pitch: 0 } });       // tick N-1: looking at D
        else if (i === atkTick) A.tick({ attack: [T.entityId], predictHit: true, onGround: true, rot: { yaw: aim, pitch: 0 } }); // flick to target between ticks, click
        else A.tick({ onGround: true, rot: { yaw: aim, pitch: 0 } });
      } else {
        // control: look at D for a while, then turn to target one full tick BEFORE clicking
        if (i === atkTick - 3 || i === atkTick - 2) A.tick({ onGround: true, rot: { yaw: D, pitch: 0 } });
        else if (i === atkTick) A.tick({ attack: [T.entityId], predictHit: true, onGround: true, rot: { yaw: aim, pitch: 0 } });
        else A.tick({ onGround: true, rot: { yaw: aim, pitch: 0 } });
      }
    });
    await H.sleep(150);
    const v = T.velocities[0] || null;
    // prediction: v = v0/4 + 0.2*a + 0.5*f(yawUsed); a = unit(attacker->target), f = (-sin yaw, cos yaw)
    const a = [T.x - A.x, T.z - A.z]; const n = Math.hypot(...a); a[0] /= n; a[1] /= n;
    const yawUsed = mode === 'flick_last_tick' ? D : aim;
    const r = yawUsed * Math.PI / 180; const f = [-Math.sin(r), Math.cos(r)];
    const pred = [0.2 * a[0] + 0.5 * f[0], 0.2 * a[1] + 0.5 * f[1]];
    const r2 = aim * Math.PI / 180; const predIfAimYaw = [0.2 * a[0] + 0.5 * -Math.sin(r2), 0.2 * a[1] + 0.5 * Math.cos(r2)];
    results.push({ mode, off, rep, aim, D, recv: v, pred, predIfAimYaw });
    console.log(mode, off, rep, v ? [v.x.toFixed(4), v.y.toFixed(4), v.z.toFixed(4)].join(',') : 'NONE', 'pred', pred.map(x => x.toFixed(4)).join(','));
  }
  fs.writeFileSync('/home/user/mirrortab/minecraft-combat-research/test-results/E1_stale_yaw.json', JSON.stringify(results, null, 1));
  await rc.cmd('probe flush');
  A.end(); T.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

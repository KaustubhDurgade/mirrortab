// E10 (background, out of kit): "spear lunge downward after riptiding up".
// Riptide push uses the SERVER's stored pitch (previous client tick) on the server, the client's current pitch on the client.
// Lunge (POST_PIERCING_ATTACK ApplyEntityImpulse, horizontal only) is added to the SERVER velocity and hurtMarked=true,
// so the server then sends its whole velocity to the client, replacing the client's.
const H = require('./common'); const fs = require('fs');
const server = process.argv[2] || 'paper'; const port = +(process.argv[3] || 25565); const rport = +(process.argv[4] || 25575);
(async () => {
  const rc = await new H.Rcon('127.0.0.1', rport).connect();
  const A = await new H.VClient('A').connect('127.0.0.1', port);
  await H.world(rc); await H.setup(['A'], rc);
  console.log(await rc.cmd('give A minecraft:trident[enchantments={riptide:3}]'), '|', await rc.cmd('give A minecraft:diamond_spear[enchantments={lunge:3}]'));
  await rc.cmd('fill -3 -60 -3 3 -40 3 minecraft:air'); await rc.cmd('setblock 0 -60 0 minecraft:water');
  const res = [];
  for (const mode of ['control_look_up', 'flick_down_to_up']) for (let rep = 0; rep < 3; rep++) {
    await H.tp(rc, 'A', 0.5, H.Y, 0.5, 0, 0); await H.sleep(200);
    A.velocities.length = 0; if (server === 'paper') await H.mark(rc, `E10 mode=${mode} rep=${rep}`);
    const R = 30; let y = H.Y, v = 0, flying = false; let stabIdx = null;
    await H.runTicks(R + 32, async (i) => {
      if (i < 4) { A.tick({ onGround: true, scrollSlot: 0, rot: { yaw: [0.5, 45, 45.5, 0][i], pitch: 0 } }); return; }
      if (i === 8) { A.tick({ onGround: true, use: true, useHand: 0, rot: { yaw: 0, pitch: -90 } }); return; }
      if (i === R - 1) { A.tick({ onGround: true, rot: { yaw: 0, pitch: mode === 'flick_down_to_up' ? 90 : -90 } }); return; }
      if (i === R) { // release: client riptides with its CURRENT pitch (-90, straight up); onGround bonus +1.2
        flying = true; v = 3.0; y += 1.2; y += v; v = (v - 0.08) * 0.98;
        A.tick({ releaseUse: true, onGround: false, pos: { x: 0.5, y, z: 0.5 }, rot: { yaw: 0, pitch: -90 } }); return;
      }
      if (flying) { y += v; v = (v - 0.08) * 0.98; }
      const k = i - R;
      if (k === 1) { A.tick({ slotKey: 1, onGround: false, pos: { x: 0.5, y, z: 0.5 }, rot: { yaw: 0, pitch: 0 } }); return; }
      if (k === 24) { stabIdx = A.velocities.length; A.client.write('block_dig', { status: 7, location: { x: 0, y: 0, z: 0 }, face: 0, sequence: 0 });
        A.tick({ onGround: false, pos: { x: 0.5, y, z: 0.5 }, rot: { yaw: 0, pitch: 0 }, clientVy: v }); return; }
      A.tick({ onGround: false, pos: { x: 0.5, y, z: 0.5 }, rot: { yaw: 0, pitch: 0 } });
    });
    await H.sleep(300);
    const after = A.velocities.slice(stabIdx || 0).map(q => [q.t, +q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3)]);
    const clientVyAtStab = +(((y) => 0)(0)).toFixed(3);
    res.push({ server, mode, rep, velocityPacketsAfterStab: after });
    console.log(server, mode, rep, 'velocity received after stab (tick,x,y,z):', JSON.stringify(after.slice(0, 2)));
    await rc.cmd('kill @e[type=minecraft:trident]');
  }
  fs.writeFileSync(`/home/user/mirrortab/minecraft-combat-research/test-results/E10_riptide_lunge_${server}.json`, JSON.stringify(res, null, 1));
  if (server === 'paper') await rc.cmd('probe flush');
  A.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

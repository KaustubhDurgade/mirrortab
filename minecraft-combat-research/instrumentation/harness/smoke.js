const H = require('./common');
(async () => {
  const rc = await new H.Rcon().connect();
  const bots = await H.connectAll(['A', 'T']);
  console.log((await H.world(rc)).join('\n'));
  await H.setup(['A', 'T'], rc);
  console.log(await rc.cmd('give A minecraft:diamond_sword'), await rc.cmd('give A minecraft:diamond_axe'));
  await H.tp(rc, 'A', 0.5, H.Y, 0.5, 0, 0); await H.tp(rc, 'T', 0.5, H.Y, 3.0, 180, 0);
  await H.sleep(500);
  const A = bots.A, T = bots.T;
  console.log('A', A.entityId, A.x, A.y, A.z, 'T', T.entityId, T.x, T.y, T.z);
  await H.mark(rc, 'smoke-start');
  await H.runTicks(40, async (i) => {
    T.tick({ onGround: true });
    if (i === 2) A.tick({ sprint: true, input: 1 | 64, onGround: true });
    else if (i === 30) A.tick({ attack: [T.entityId], onGround: true });
    else A.tick({ onGround: true });
  });
  await H.sleep(300);
  console.log('T velocities', JSON.stringify(T.velocities));
  await H.mark(rc, 'smoke-end'); await rc.cmd('probe flush');
  A.end(); T.end(); rc.end(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

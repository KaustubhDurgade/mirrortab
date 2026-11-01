# Research log

All times UTC, 2026-11-01. Work dir for copyrighted/bulky artifacts: `/home/user/mcwork` (NOT in repo).

## Session 1

- 01:52 Fetched Mojang manifest. 1.21.11 version json `96403ac4…`. Downloaded client.jar, server.jar, client.txt, server.txt; SHA1 all match manifest (see sources/README.md).
- 01:52 Paper: Fill API v3 `paper/1.21.11` latest = build **132** (STABLE, 2026-05-11T11:43:09Z), commit `c5eb0790f199da6c38d0a650e1e5cd5415b28185`. SHA256 verified.
- 01:53 Paperclip `-Dpaperclip.patchonly=true` -> `versions/1.21.11/paper-1.21.11.jar` (Mojang-mapped at runtime since 1.20.5, so decompiling it yields Paper's *effective* server code with Mojang names).
- 01:53 ProGuard -> Tiny v2 via mapping-io 0.9.2 (namespace switch), remapped client.jar with tiny-remapper 0.15.0. Vanilla baseline = remapped client.jar (contains integrated server, i.e. all common + server code).
- 01:53 Vineflower 1.12.0 decompile of both trees started.
- 01:55 Paper source cloned at c5eb079 (patch sets under paper-server/patches/{sources,features}).
- 02:0x Read Player.attack, LivingEntity.hurtServer/knockback/aiStep, Entity.move, ServerGamePacketListenerImpl.handleMovePlayer (vanilla + Paper).
- 02:10 CORRECTION: initially read ServerPlayer velocity as "not simulated" (LivingEntity.canSimulateMovement). Wrong: `Player.canSimulateMovement()` and `Player.isEffectiveAi()` return true on the server, so `LivingEntity.aiStep -> travel()` runs a zero-input shadow physics sim for every ServerPlayer (gravity, drag, friction). Probe confirmed idle server dm = (0,-0.0784,0).
- 02:12 Paper server up (build 132, Java 21.0.12). Probe plugin (passive) + node-minecraft-protocol 1.68.0 harness reproducing vanilla client packet order.
- 02:20 E1 stale yaw: first run confounded by CraftBukkit `justTeleported` (drops one significant move packet after a teleport). Fixed with a deterministic settle sequence. Result 42/42 trials match `v = 0.2*a + 0.5*f(yaw_{N-1})`, max err 4e-5 (LpVec3 quantization). CONFIRMED.
- 02:26 E2 i-frame click cooldown: Paper moved resetOnlyAttackStrengthTicker into actuallyHurt, BUT `ServerPlayer.swing()` resets the ticker and the vanilla client always sends ServerboundSwingPacket after the attack. Paper == vanilla (16/16 trials each). REFUTED.
- 02:29 Vanilla 1.21.11 dedicated server started as control (port 25566).
- 02:32 E3 same-tick swap: vanilla sword->axe 7.0 dmg, axe->sword 9.0 dmg; Paper 1.8045 / 1.4089 (3/3 each). Paper default `unsupported-settings.update-equipment-on-player-actions: true` + Player.detectEquipmentUpdates override => attributes AND cooldown reset applied at the slot packet. CONFIRMED (Paper divergence).
- 02:36 E6 blocked hit: no velocity packet, no teleport (both). Server dm shows reversed shield recoil (−0.5) + base KB. Rubber-band hypothesis REFUTED.
- 02:40 E5 web crit: normal 0/5, bunched 5/5 (both). First run had a client-side health-baseline bug; probe already showed correct split; rerun reported.
- 02:44 E5b jump arc: crit ticks 7–10, tick 11 denied (sim onGround=true, fd 1.13). Both servers 3/3.
- 02:48 E8: same-tick swap disables shield 4/4 both; non-sprint flick straight 4/4.
- 02:50 Prior-art search: knockback displacement & Paper swap fix already known; landing-tick crit denial not found.
- 02:55 Wrote analysis/, hypotheses/, discoveries/, FINAL_REPORT.md.

- (session 2) Container processes had stopped; restarted both servers. E9 triple swap: vanilla 29.54, Paper 13.89, mace-only 28.04, sword-only 10.5; 3/3 each. Spear reach is client-side; server accepts ~6 blocks for any item.

## Continuation checkpoint
- Acquired: Mojang 1.21.11 client/server + mappings (verified), Paper 132 jar + source @c5eb079. Decompiled trees in /home/user/mcwork/decomp (NOT persisted — container is ephemeral; rebuild with instrumentation/tools + sources/README.md).
- Servers: /home/user/mcwork/{paper-run,vanilla-run}; scripts instrumentation/tools/{server,vserver}.sh.
- Done: E1, E2, E3, E5, E5b, E6, E8. Open: H12, H13, H14, H22, P6, latency injection, real-client confirmation.
- Next step: add `dmBefore/onGround` assertions to a new E9 for H12–H14; then netem jitter sweep for E5/E5b.

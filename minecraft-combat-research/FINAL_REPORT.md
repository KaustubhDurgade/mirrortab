# Minecraft Java 1.21.11 / Paper 1.21.11-132 — Combat Engine Research: Final Report (session 1)

Environment: Paper 1.21.11 build 132 (commit c5eb079, 2026-05-11), default config, OpenJDK 21.0.12; vanilla 1.21.11
dedicated server as control. Source: Mojang jars + official mappings (SHA-1 verified), Vineflower 1.12.0. Details: `sources/README.md`.
Evidence: 7 experiment scripts, ~250 controlled trials, raw JSON in `test-results/`, passive server probe (JSONL, not committed).

## A. Source-code findings (most important)
1. **Packet order fixes what the server sees.** Vanilla client tick: `pick()` → `gameMode.tick()` (sends pending slot
   change) → `handleKeybinds()` (slot keys, then attack: `Interact`, `Swing`) → `LocalPlayer.tick()` (`PlayerInput`,
   sprint command, `Move`) → `ClientTickEnd` (`Minecraft.java:1738`). ⇒ An attack is evaluated with the attacker's
   **previous-tick** yaw, position, sprint flag, onGround and fallDistance.
2. **Knockback has two direction sources** (`LivingEntity.hurtServer:1414` positional 0.4; `Player.causeExtraKnockback:1169`
   yaw-based `k+0.5`). Sprint hit: `v = v0_h/4 + 0.2·â + 0.5·f̂(yaw_{N−1})`, `v_y = 0.4`.
3. **Every ServerPlayer runs a zero-input shadow physics sim** (`Player.canSimulateMovement()`=true, `LivingEntity.aiStep:3474`).
   It owns the target velocity `v0` used by knockback and rewrites `onGround` each server tick. Knockback sent to a
   player is never stored in `v0` (restored after the packet).
4. **Cooldown** is reset by `ServerPlayer.swing()` (`:2558`) on the swing packet that follows every click — on both servers.
5. **Shield disable** (`LivingEntity.getSecondsToDisableBlocking:4580`) needs only an axe in the main hand *at hit time* — no charge.
6. **Cobweb** resets `fallDistance` every server tick (`Entity.makeStuckInBlock:3747`) and zeroes velocity on the next move.

## B. Client–server discrepancies
| Discrepancy | Cause | Effect |
|---|---|---|
| Aim rotation (tick N) ≠ knockback yaw (tick N−1) | attack packet precedes move packet | knockback displacement / pull (E1) |
| Client predicts crit on landing tick; server denies | server sim `onGround` lands one tick early (E5b) | phantom crit particles on arc tick 11 |
| Client predicts every hit on a RemotePlayer (`hurtClient`=true) | prediction ignores i-frames/blocks | client self-applies sprint loss & 0.6 slowdown on rejected hits |
| Client predicts same-tick swap with old attributes; Paper uses new | Paper `update-equipment-on-player-actions` | client and Paper disagree on damage/strong-hit for swap hits |
| Defender's server velocity/onGround after a block never reaches the client | no `markHurt` on blocked hits | hidden server state for ~5 ticks (E6) |
| Target `v0` is the sim's, not the client's velocity | client-authoritative movement | KB ignores the target's WASD momentum; only jump impulses leak in |

## C. Paper-specific differences
See `analysis/paper-differences.md`. Gameplay-relevant at defaults: **(P1)** slot change applies attributes and resets
cooldown immediately → vanilla attribute-swap damage tricks disabled (E3: 7.0→1.80, 9.0→1.41); **(P3)** `justTeleported`
drops one significant move after teleports; **(P6)** shield side-effects skipped during i-frames. P2 (cooldown reset
moved into `actuallyHurt`) is masked by the swing reset — no observable change (E2).

## D. Strongest original hypotheses
H10 (landing-tick crit denial) and H9 (web crits as tick-bunching artefacts) are, as far as a brief prior-art search
found, undocumented explanations. H12–H14 (shadow-sim velocity/onGround leaking into knockback) are source-supported
and untested. Full list: `hypotheses/index.md` (24 hypotheses).

## E. Experimental results
| Exp | Result | Reproduction |
|---|---|---|
| E1 stale yaw | KB = `0.2â+0.5f̂(ψ_{N−1})`, max err 4e-5; 180° ⇒ (−0.300 pull, 0.4 up) | 42/42 Paper |
| E2 i-frame clicks | 0 extra clicks 7.0; 1 → 3.99; 2 → 2.91; every 2 ticks → 1.62 | identical Paper/vanilla, 16/16 each |
| E3 same-tick swap | vanilla 7.0 / 9.0; Paper 1.80 / 1.41; key one tick early: same as same-tick | 3/3 per cell, both |
| E5 web crit | normal 0/5 crit, bunched 5/5 crit (10.5) | both |
| E5b jump crit window | crit on arc ticks 7–10 only; tick 11 (0.121 above ground, fd 1.13) denied | 3/3 per tick, both |
| E6 blocked hit | 0 velocity pkts, 0 teleports; server dm (0,0.4,0.15) decaying; onGround false 5 ticks | 6/6, both |
| E9 triple swap (background) | vanilla sword→(spear)→mace = 29.54 (= (7+12.69)×1.5), Paper 13.89 (uncharged mace + full smash bonus); server accepted 4.17-block hits for every item | 3/3 per cell, both |
| E8 shield swap | same-tick sword→axe disables shield 4/4 (100 ticks); sword 0/4; non-sprint flick straight 4/4 | both |
Limitations: localhost (no injected latency/jitter except deliberate bunching); scripted (not simulated) client physics;
single machine; Diamond-kit armour/enchantments not applied (plain items).

## F. Competitive applications (Diamond SMP, Paper defaults)
Scores 0–10: Adv(antage) / Repro / Ease (10 = easy) / Lat(ency robustness) / Mov(ement robustness) / Kit / Novelty / SrcConf / vsSkilled.

| Finding | Adv | Rep | Ease | Lat | Mov | Kit | Nov | Src | vsSk | Use |
|---|---|---|---|---|---|---|---|---|---|---|
| Stale-yaw sprint KB (pull/sideways) | 8 | 10 | 4 | 10 | 8 | 10 | 3 | 10 | 7 | Flick+click in the same 50 ms window. 90° ⇒ 68° deflection at 0.54; 180° ⇒ 0.30 pull. Knock into webs/lava/off bridges; pull a fleeing player back into reach. Needs sprint (or Knockback ench.). Latency-independent. |
| Landing-tick crit denial | 6 | 10 | 6 | 7 | 6 | 10 | 8 | 9 | 6 | On flat ground the crit window is arc ticks 7–10 (≈200 ms). Clicking on the last airborne tick wastes the charge (client still shows crit particles — ignore them as feedback). |
| Swap behaviour (Paper) | 6 | 10 | 7 | 9 | 9 | 10 | 2 | 10 | 6 | On Paper, same-tick sword→axe still breaks shields (0 charge needed) but deals 1.8; don't expect vanilla swap damage. On vanilla servers: axe-held → sword-key+click = 9 dmg (13.5 crit) and end holding the sword. Check the server's `update-equipment-on-player-actions`. |
| Web crit = jitter artefact | 4 | 10 | — | 2 | — | 10 | 7 | 10 | 4 | Don't plan crits from inside webs. Webbing an opponent denies their crits and nearly nullifies your KB on them. |
| Click economy | 5 | 10 | 8 | 9 | 9 | 10 | 1 | 10 | 5 | Each extra click in the 10 i-frame ticks costs charge on both servers (1 extra ⇒ 3.99 instead of 7.0). |

### Triple swapping (out of kit, background)
Sword = damage + 12.5-tick charge (attributes, vanilla only); spear = reach (client raycast only; the server allows ≈6 blocks for any item);
mace = smash bonus (item method, read at hit time, added after cooldown scaling). Vanilla: 29.5 at sword cadence, about 2× a mace swung at
that cadence. Paper default: 13.9 (the sword part is lost; mace bonus and reach survive). Details: `analysis/attribute-swapping.md`.

## G. Refuted
H4 Paper free ghost clicks (swing reset); "pre-charged axe" on Paper; H15 sprint desync crits (flag resync, source);
blocked-hit rubber-band; my initial "server doesn't simulate player velocity" reading. Details: `discoveries/refuted.md`.

## H. Future investigations
1. Test H12/H13/H14 with the probe (`dmBefore`, `onGround` at knockback) and quantify effect sizes.
2. Inject latency/jitter (netem or a delaying proxy) to measure how often bunching occurs at realistic ping/FPS hitches (web crits, crit-window edges).
3. Run a real 1.21.11 client (e.g. headless with Fabric) to confirm client-side predictions (phantom crit particles, webbed-target KB).
4. Partial blocks (slabs, trapdoors, pressure plates) vs the shadow sim's landing prediction (H22).
5. Vanilla-only P6: shield raised inside i-frames + axe hit.
6. Knockback-enchanted weapons and armour (if the kit permits) — displacement scales with `k+0.5`.

## Prior art consulted
- Knockback displacement technique descriptions (incl. "previous tick" explanation and 180° reverse KB): https://sozai.app/transcript/minecraft-knockback-displacement-tutorial/index.md , https://www.curseforge.com/minecraft/mc-mods/backslap
- Attribute swapping / Paper setting / plugins: https://github.com/Fiojf/FAF , https://minecraftbible.com/plugins/project/attribute-swap-fixer , https://feedback.minecraft.net/hc/en-us/community/posts/46353568845325-Keep-Attribute-Swapping-Removing-it-Slows-PVP
- Crit/onGround: https://bugs.mojang.com/browse/MC-90024 (different issue; no description of landing-tick denial found)

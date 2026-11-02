# Hypotheses (source-derived)

Status per §15: CONFIRMED / SOURCE-SUPPORTED / EXPERIMENTAL / SPECULATIVE / REFUTED. "Both" = Paper 132 and vanilla 1.21.11 control.
Experiments: `experiments/README.md`, raw data `../test-results/`.

| ID | Hypothesis (interacting states) | Prediction | Disproof | Status |
|---|---|---|---|---|
| H1 | Sprint-KB direction uses attacker yaw from tick N−1 (attack packet precedes move packet) while aim uses tick-N rotation | `v_h = 0.2â + 0.5f̂(ψ_{N−1})` | KB follows aim after a between-tick flick | **CONFIRMED** both (E1 42/42; known technique, mechanism now verified) |
| H2 | Base KB direction is positional, independent of yaw | non-sprint flick gives straight 0.4 | deflection without sprint | **CONFIRMED** both (E8 4/4) |
| H3 | 180° between-tick flick inverts net horizontal KB ("pull") | −0.3 toward attacker, y 0.4 | positive along â | **CONFIRMED** both (E1 3/3) |
| H4 | Paper (cooldown reset moved into `actuallyHurt`) makes i-frame "ghost clicks" free | next hit full damage on Paper | equal damage on both | **REFUTED** — `ServerPlayer.swing` resets the ticker (E2, identical 16/16) |
| H5 | Vanilla same-tick swap mixes old attributes with new item components | sword→axe 7.0; axe→sword 9.0 | new-item damage | **CONFIRMED** vanilla (E3) |
| H6 | Paper default applies new attributes + cooldown reset at the slot packet | sword→axe 1.80, axe→sword 1.41 | vanilla numbers on Paper | **CONFIRMED** Paper (E3) |
| H7 | Vanilla swap window spans 2 client ticks (slot sent by next `gameMode.tick`) | key in N−1 + click in N still 7.0 | 1.8 | **CONFIRMED** vanilla (E3) |
| H8 | Shield disable needs no charge; read from current main hand | same-tick sword→axe disables shield on both | no cooldown pkt | **CONFIRMED** both (E8 4/4 vs 0/4) |
| H9 | Cobweb resets fallDistance each server tick ⇒ web crits only with bunched ticks | 0 crits normal, crits bunched | crits at normal spacing | **CONFIRMED** both (E5 0/5 vs 5/5) |
| H10 | Server shadow sim sets onGround one tick early ⇒ last airborne tick of a jump cannot crit (client still predicts one) | arc ticks 7–10 crit, 11 not | crit at 11 | **CONFIRMED** server side both (E5b); client particle part SOURCE-SUPPORTED |
| H11 | Blocked hit applies base KB + reversed shield recoil to defender's server velocity only | no motion pkt, no teleport, dm changes | motion/teleport | **CONFIRMED** both (E6) |
| H12 | After a blocked hit the defender's server onGround is false ~5 ticks ⇒ an unblocked hit in that window gets `v_y = dm.y` instead of 0.4 if processed before the defender's move packet | vertical ≠0.4 | always 0.4 | SOURCE-SUPPORTED (probe shows onG false at tick ends; KB not tested) |
| H13 | Airborne target vertical KB = sim `v0y` ≈ target's own vertical velocity | no extra lift mid-air | 0.4 mid-air | SOURCE-SUPPORTED |
| H14 | Server `jumpFromGround` on lift-off (incl. lift-off from our KB) adds 0.2·facing if target server-sprinting ⇒ next KB changes by ≤0.05 | ±7% | no change | SOURCE-SUPPORTED |
| H15 | Server-only sprint reset (client charge ≤0.9 < server) gives a lasting sprint desync enabling sprint-speed crits | crits while client sprints | flag resync | **REFUTED** by source: server syncs shared flags + speed modifier to self (not tested) |
| H16 | Multiple clicks in one client tick share one raycast; extra clicks hit i-frames and each swing resets cooldown | ≥2 clicks/tick = wasted & harmful | — | SOURCE-SUPPORTED (E2 spam plan: 1.62 dmg on the post-i-frame hit) |
| H17 | Ghost/early clicks during i-frames cost charge on both servers | E2: 1 extra click → 3.99, 2 → 2.91, every-2-ticks → 1.62 | — | **CONFIRMED** both (E2; known "don't spam" lore, now quantified) |
| H18 | CraftBukkit `justTeleported` drops one significant move after a teleport | yaw unchanged after a flick | applied | **CONFIRMED** Paper (E1 runs 1–2); low value |
| H19 | Attacker still `isUsingItem` server-side (e.g. eat finishing client-first) ⇒ `getActiveItem ≠ axe` ⇒ no shield disable | disable fails | disables | SPECULATIVE (vanilla client blocks attacks while using; window ≤1 tick) |
| H20 | KB velocity LpVec3 quantisation is negligible | ≤1e-4 | larger | **CONFIRMED** (E1 max err 4e-5) |
| H21 | Paper `PlayerVelocityEvent` in the attack path reports pre-hit velocity | event ≠ sent | equal | **CONFIRMED** Paper (probe); plugin-only impact |
| H22 | Slabs/trapdoors/fences change shadow-sim landing ⇒ alter crit window and KB `onGround` branch | different crit ticks near partial blocks | same | SPECULATIVE (not tested) |
| H23 | Paper `knockback()` without early return halves velocity even at full KB resistance | — | — | SOURCE-SUPPORTED; outside kit |
| H25 | Triple swap: vanilla mixes sword attributes/charge with the mace smash bonus in one hit | (7+bonus)×1.5 | (6+bonus)×1.5 | **CONFIRMED** vanilla (E9 29.54 vs mace 28.04) |
| H26 | Paper default reduces the triple swap to an uncharged mace smash; the bonus is unaffected because it is added after cooldown scaling | 6×0.2+bonus, no crit | ~1.2 total | **CONFIRMED** Paper (E9 13.89) |
| H27 | The spear's reach in the triple swap is client-only (raycast); the server allows ≈6 blocks for any item | server accepts 4.17 for all items | rejects non-spear | server half **CONFIRMED** both (E9); client half SOURCE-SUPPORTED |
| H28 | Riptide is applied server-side with the previous-tick pitch ⇒ a flick+release stores a velocity opposite to the client's flight | probe push −3 vs client up | +3 | **CONFIRMED** both (E10) |
| H29 | Lunge (horizontal impulse + hurtMarked) syncs the server's whole stored velocity to the client ⇒ "downward lunge" | client receives y −3.36 | y ≥ 0 | **CONFIRMED** both (E10 3/3; control +0.34) |
| H24 | Non-sprint ground hits lift 0.3608 not 0.4 because sim resting v0y=−0.0784 | 0.3608 | 0.4 | **CONFIRMED** both (E3/E8) |

## Top 5 by competitive value (see FINAL_REPORT §F for scoring)
1. **H1/H3 stale-yaw sprint KB** — deterministic, latency-independent directional control incl. a 0.3 pull.
2. **H10 landing-tick crit denial** — the real server crit window on flat ground is arc ticks 7–10; tick 11 is a phantom crit.
3. **H5–H8 swap behaviour is server-dependent** — on Paper defaults only the shield-break part of attribute swapping survives.
4. **H9 web crits are hitch/jitter artefacts** — don't build combos on them; webs deny the opponent's crits.
5. **H17/H16 click economy** — every swing resets cooldown on both servers; quantified penalties.

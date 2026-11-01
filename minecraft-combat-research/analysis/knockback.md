# Knockback (melee, player → player)

## Equations (source: `LivingEntity.knockback` `:2017`, `hurtServer` `:1414`, `Player.causeExtraKnockback` `:1169`)
Let `â` = unit horizontal vector attacker→target (from **positions**), `f̂(ψ) = (−sin ψ, cos ψ)` attacker look vector
from server-side **yaw ψ**, `v0` = target's *server* velocity snapshot, `k = getKnockback()` (enchant/attribute; 0 for plain kit).

Stage 1 (always, inside `hurtServer`, even when the hit is shield-blocked):
`v1 = (v0x/2 + 0.4·âx, G ? min(0.4, v0y/2 + 0.4) : v0y, v0z/2 + 0.4·âz)`
Stage 2 (only if hurt returned true and `k + 0.5·sprintKB > 0`):
`v2 = (v1x/2 + s·f̂x, G ? min(0.4, v1y/2 + s) : v1y, v1z/2 + s·f̂z)`, `s = k + 0.5·[sprinting ∧ scale>0.9]`
(G = target's server `onGround` at that instant.)

Sprint hit, plain kit, grounded target: **`v_h = v0_h/4 + 0.2·â + 0.5·f̂(ψ)`, `v_y = 0.4`**.
Non-sprint: `v_h = v0_h/2 + 0.4·â`, `v_y = min(0.4, v0y/2 + 0.4)` = 0.3608 for a resting target (v0y = −0.0784).
The result is sent immediately (`SetEntityMotion`, LpVec3-quantised, error ≤4e-5 measured) and **replaces** the
target client's velocity; the server then restores its own `v0`.

## Two direction sources (the knockback-displacement mechanism) — CONFIRMED (E1)
Base 0.4 uses positions; the 0.5 sprint component uses yaw ψ. ψ is whatever the server holds when the attack packet
is processed = the rotation in the attacker's **previous client tick's** move packet (client order: attack → move).
The client's crosshair raycast uses the rotation **at the start of tick N**. So the yaw used for knockback lags the
aim by exactly the mouse rotation that happened in the frames between client ticks N−1 and N.
E1: 42/42 trials matched `0.2·â + 0.5·f̂(ψ_{N−1})`, max error 4e-5. Control (aim held ≥1 tick before the click):
always 0.7 straight. Non-sprint flick (E8): no deflection — the effect needs sprint KB or a Knockback enchant.

| yaw lag θ (aim − ψ) | horizontal KB (along â, sideways) | magnitude | deflection |
|---|---|---|---|
| 0° | (+0.700, 0) | 0.700 | 0° |
| 30° | (+0.633, +0.250) | 0.681 | 21.6° |
| 45° | (+0.554, +0.354) | 0.657 | 32.6° |
| 60° | (+0.450, +0.433) | 0.624 | 43.9° |
| 90° | (+0.200, +0.500) | 0.539 | 68.2° |
| 120° | (−0.050, +0.433) | 0.436 | 96.6° |
| 135° | (−0.154, +0.354) | 0.385 | 113.5° |
| 180° | (−0.300, 0) | 0.300 | 180° (**pull**) |

Vertical is unaffected (0.4). Lag = mouse angular speed × 50 ms during the last inter-tick window: 1000°/s → 50°,
1800°/s → 90°, a single-frame 180° snap → 180°. **Timing requirement:** the flick and the click must fall in the
*same* inter-tick window (order inside the window doesn't matter: the click is queued, the raycast happens at the next
tick start with the post-flick view, the server still holds the pre-flick yaw).
Prior art: the community already describes "knockback displacement" incl. 180° "reverse knockback" and attributes it to
the previous tick's camera direction (see FINAL_REPORT sources). This work supplies the source path, the exact
formula, magnitudes, the sprint requirement, and controlled confirmation on Paper 1.21.11-132 and vanilla.

## Target velocity v0 (server shadow simulation)
`Player.canSimulateMovement()` is true on the server ⇒ `v0` is a zero-input physics sim, **not** the client's velocity:
- resting on ground: (0, −0.0784, 0) (measured) — explains 0.3608 vs 0.4 vertical for non-sprint vs sprint hits;
- after a lift-off packet: `jumpFromGround` sets `v0y = max(0.42, v0y)` and adds `0.2·facing` if the target is server-sprinting — including
  lift-offs caused by *our own previous knockback*; then gravity/drag/friction (air 0.91, ground 0.546 per tick);
- client WASD acceleration is never included; previous knockback is never included (restored after each hit);
- shield-blocked hits leave the base KB **and** a reversed 0.5 shield-recoil (`blockedByItem` knocks the *defender* toward the attacker) in `v0` (E6: dm z −0.5 then +0.65 net 0.15, y 0.4) — never sent to the defender.
Effect sizes: `v0_h/4` with a fresh sprint-jump boost is ≤0.05 (≤7% of 0.7) — measurable, not decisive (SOURCE-SUPPORTED, not separately tested).
Airborne target: vertical = `v0y` (sim value ≈ the target's real current vertical velocity) ⇒ air hits add no lift beyond the target's own arc.

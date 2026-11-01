# Paper 1.21.11-132 vs vanilla 1.21.11 — combat-relevant differences

Status column: **E** = verified by experiment on both servers, **S** = source only.

| # | Area | Vanilla | Paper (default config) | Gameplay effect | Status |
|---|---|---|---|---|---|
| P1 | Slot change (`handleSetCarriedItem`) | only sets slot; attributes + item-change cooldown reset happen at the next `Player.tick` | `unsupported-settings.update-equipment-on-player-actions: true` → `detectEquipmentUpdates()` immediately; Paper's `Player.detectEquipmentUpdates` override also resets the cooldown on item-type change | Same-tick swap+hit uses **new** attributes with a **reset** ticker ⇒ vanilla "attribute swapping" damage tricks are gone (sword→axe 7.0→1.80, axe→sword 9.0→1.41). Shield disable still works (no charge needed). | E (E3, E8) |
| P2 | Attacker cooldown reset | `onAttack()` resets ticker before damage | moved into `LivingEntity.actuallyHurt` (only if damage proceeds) + `PlayerAttackEntityCooldownResetEvent` | **None for vanilla clients**: `ServerPlayer.swing()` resets the ticker on the swing packet that always follows the attack | E (E2: identical numbers) |
| P3 | Rotation/position after teleport | — | CraftBukkit `justTeleported`: after any `internalTeleport` (tp, respawn, moved-wrongly/too-quickly correction, plugin teleport), the first "significant" move (>1/16 block² or >10°) whose `from` differs from the current location is **silently dropped** (`ServerGamePacketListenerImpl.java:1680`) | One rotation update can be lost after a rubber-band; the attack's yaw (and thus sprint-KB direction) can lag one more tick. Low practical value; it confounded the first E1 run. | E (E1 run 1–2) |
| P4 | Blocked hit `markHurt` | `markHurt` if `!blocked || remaining>0` | `markHurt` only if `!blocked` | no difference for full shield blocks of melee (shield blocks 100% within 90°) | S |
| P5 | `knockback()` with strength ≤ 0 | early return | no early return (still halves existing velocity) | only with knockback resistance ≥ 1; not reachable with Diamond kit | S |
| P6 | Shield side-effects during i-frames | `applyItemBlocking` (shield damage, axe disable, recoil) runs **before** the i-frame check | runs inside `actuallyHurt` → skipped if `invulnerableTime>10 && amount<=lastHurt` | Vanilla: an axe hit on a shield raised during the first 10 i-frame ticks after an unblocked hit still disables it; Paper: not if the axe hit ≤ the hit that started the i-frames | S (not tested) |
| P7 | `PlayerVelocityEvent` in attack path | n/a | event carries the **pre-hit** velocity (`currentMovement`), not the knockback that is then sent | Only matters for plugins (KB plugins/anticheats reading it) | E (probe smoke test: event vel = (0,−0.0784,0) while client received (0,0.4,0.7)) |
| P8 | Sprint interruption on attack | always | `misc.disable-sprint-interruption-on-attack` (default false = vanilla) | none at defaults | S |
| P9 | Crits | always | `entities.behavior.disable-player-crits` (default false) | none at defaults | S |
| P10 | Interaction range leniency | `isWithinRange(..., 3.0)` | configurable `misc.client-interaction-leniency-distance` (default 3.0) | none at defaults | S |

Not different (verified by identical E1/E2/E5/E5b/E6/E8 results on both servers): stale-yaw sprint knockback,
swing-based cooldown reset, cobweb fall-distance reset, landing-tick crit denial, shield disable on same-tick swap,
blocked-hit server-only knockback.

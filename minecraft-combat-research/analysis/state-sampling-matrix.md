# Combat state-sampling matrix (server-authoritative outcome of an attack in client tick N)

"Prev-tick" = value carried by client tick N−1's packets (the attack packet precedes tick N's move/command packets).
"Sim" = overwritten each server tick by the zero-input ServerPlayer physics simulation. Paper column only where it differs.

| # | Property | Where read (Paper src) | Side | Updated by | Sampled when | Cached / stale? | Paper Δ |
|---|---|---|---|---|---|---|---|
| 1 | Attack damage | `Player.attack` `getAttributeValue(ATTACK_DAMAGE)` | S | `detectEquipmentUpdates` (server tick) | attack | vanilla: stale up to 1 tick after a slot change (old item) | updated at slot packet (P1) |
| 2 | Attack speed | `getCurrentItemAttackStrengthDelay` | S | same as 1 | attack | same as 1 | P1 |
| 3 | Attack cooldown (ticker) | `getAttackStrengthScale(0.5)` | S | ++ per server tick; reset on swing packet, item-type change (tick), attack (vanilla `onAttack` / Paper `actuallyHurt`) | attack, before swing | swing comes after attack in same client tick | reset also at slot packet (P1) |
| 4 | Interaction range | `ServerboundInteractPacket.isWithinRange(+3.0)` | S | target AABB from target's last move | packet | lenient server; strict client raycast (`pick`, tick-start) | configurable |
| 5 | Selected weapon (components: WEAPON disable seconds, enchantments, #swords for sweep) | `getWeaponItem()` = main hand | S | slot packet (immediate) | attack | never stale | — |
| 6 | Equipment attribute modifiers | `detectEquipmentUpdates` | S | server tick | attack | see 1 | P1 |
| 7 | Knockback strength | `getKnockback(target, src)` + 0.5 if sprintKB | S | weapon item (immediate) + sprint flag | attack | sprint flag prev-tick | — |
| 8a | KB direction (base 0.4) | `hurtServer`: `src.getSourcePosition() − target.pos` | S | attacker & target positions from their last move packets | hurt | prev-tick positions | — |
| 8b | KB direction (extra/sprint) | `causeExtraKnockback`: `sin/cos(getYRot())` | S | attacker `PosRot/Rot` packets | attack | **prev-tick yaw** (E1) | — |
| 9 | Sprint state | `isSprinting()` (shared flag 3) | S | START/STOP command (sent in `sendPosition`, after attack); attack sets false | attack | prev-tick | — |
| 10 | Attacker yaw/pitch | `getYRot()` | S | move packets | attack | prev-tick | P3 drop after teleport |
| 11 | Attacker velocity | `getDeltaMovement` (sim) | S | sim + KB + `jumpFromGround` | KB on attacker only | sim value, not client velocity | — |
| 12 | Target velocity `v0` | `target.getDeltaMovement()` | S | sim (gravity/friction), `jumpFromGround` on lift-off packets (+0.2·facing if sprinting), blocked-hit KB; **restored to pre-hit after every successful player hit** | attack | sim value ≈ client vertical arc; horizontal ≈ only jump boosts | — |
| 13 | Target position | AABB/pos | S | target move packets | attack | latest processed | — |
| 14 | Attacker position | pos | S | move packets | attack | prev-tick | — |
| 15 | Grounded (attacker, crit) | `onGround()` | S | move packet **then sim each server tick** | attack | **sim value**: sim predicts landing one tick early (E5b) | — |
| 16 | Fall distance | `fallDistance` | S | move packets (`doCheckFallDamage`), reset by cobweb tick effect, by landing packets | attack | sim does **not** touch it; cobweb resets it every server tick (E5) | — |
| 17 | Crit eligibility | `canCriticalAttack` | S/C | composite of 3,9,15,16 | attack | client predicts with its own state → phantom crits (E5b tick 11) | `disable-player-crits` |
| 18 | Target shield state | `getItemBlockingWith`: using item with BLOCKS_ATTACKS and `useDuration−remaining ≥ 5` ticks | S | `useItemRemaining--` per server tick from the use packet | hurt | 5-tick delay counted on the server | — |
| 19 | Shield disable | `getSecondsToDisableBlocking`: weapon WEAPON component and `weaponItem == getActiveItem()` | S | slot packet | hurt | **no charge requirement** (E8) | P6 |
| 20 | Damage immunity | `invulnerableTime > duration/2` (10 of 20 ticks) and `amount <= lastHurt` | S | set on hit | hurt | — | P6 ordering |
| 21 | KB immunity | none separate; KB skipped only if hurt returns false before KB (i-frame reject) | S | — | — | blocked hits still apply base KB server-side | — |
| 22 | Collision state | sim + packet flags | S | both | — | sim | — |
| 23 | Fluid state | `isInWater()` | S | `baseTick` fluid update | attack (crit) | per server tick | — |
| 24 | Cobweb state | `stuckSpeedMultiplier` | S | `applyEffectsFromBlocks` (server tick, along movement path) | next `move()` | consumed & zeroes `dm` on next move | — |

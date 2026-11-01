# Shield state machine (1.21.11, `BlocksAttacks` component)

States (server): **idle** → use packet (`ServerboundUseItemPacket`, offhand) → **raising** (`isUsingItem`, not blocking) →
after `useDuration − useItemRemaining ≥ blockDelayTicks = round(0.25·20) = 5` server ticks → **blocking**
(`getItemBlockingWith` `LivingEntity.java:4172`) → disabled (item cooldown, `stopUsingItem`) or released.

Hit resolution (`hurtServer`): `applyItemBlocking` (`:1567`) — angle between defender head-yaw view vector and the
horizontal vector to the *source position* ≤ 90° ⇒ `resolveBlockedDamage` = full amount for melee.
Side effects (`blockingItemEffects`/`blockUsingItem`): shield durability `3 + floor(1·dmg)` (if ≥3), and if the
attacker's `getSecondsToDisableBlocking() > 0` → `BlocksAttacks.disable`: shield cooldown `round(5·20·1.0)=100` ticks + stop using.
Disable needs only: weapon has `WEAPON.disable_blocking_for_seconds>0` (axe) and the attacker is not using another item
(`weaponItem == getActiveItem()`). No charge, sprint or crit requirement (E8: 4/4 with a 0-charge same-tick swap).

Knockback when blocked: `Player.attack` sees hurt=false ⇒ no sprint KB, no sprint reset for the attacker, no
`markHurt` ⇒ **nothing is sent to the defender**. But `hurtServer` still applies the base 0.4 KB and `blockedByItem`
applies 0.5 *to the defender toward the attacker* — to the defender's server-side velocity only (E6, both servers:
0 velocity packets, 0 teleports; server dm afterwards (0, 0.4, ±0.15) decaying, server `onGround` reads false for ~5
ticks). Blocked hits still reset the attacker's cooldown (swing packet) and set i-frames with `lastHurt=0`
(so the next real hit within 10 ticks is not reduced).

Paper vs vanilla ordering of these side effects during i-frames: see paper-differences.md P6.
Client-side note: others see the raise animation immediately, but blocking starts 5 server ticks after the use packet
is processed; and a vanilla client discards attack clicks while using an item, so "release + click" in one tick loses the click.

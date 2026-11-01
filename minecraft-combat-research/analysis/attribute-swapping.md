# Attribute swapping (sword ↔ axe)

## What is sampled when
- Weapon **item** (components: `WEAPON` disable-blocking seconds, enchantments, `#swords` for sweep, durability) — `getWeaponItem()` = current main hand; changes the instant the slot packet is processed.
- **Attributes** ATTACK_DAMAGE / ATTACK_SPEED — from modifiers applied in `detectEquipmentUpdates()`:
  vanilla: next server `Player.tick`; Paper default: at the slot packet (`update-equipment-on-player-actions: true`).
- **Cooldown ticker** — reset on item-*type* change: vanilla at next `Player.tick`; Paper at the slot packet
  (Paper's `Player.detectEquipmentUpdates` override `Player.java:1950`). Also reset by every swing packet.

Diamond values (`Items`/`ToolMaterial`): sword 7 dmg, 1.6 speed (12.5-tick delay), `Weapon(1)`;
axe 9 dmg, 1.0 speed (20 ticks), `Weapon(2, disable 5 s)`; shield `BlocksAttacks(block_delay 0.25 s=5 ticks, 90°, full)`.

## Client window
A hotbar key pressed during tick N−1's `handleKeybinds` (or a scroll in frames before tick N) is sent by
`gameMode.tick()` at the **start of tick N**, immediately before tick N's attack ⇒ vanilla's same-window swap tolerates
the key being ~1–2 client ticks early (E3 `sword_to_axe_prevtick` = 7.0 on vanilla). This is consistent with the
community "1–2 tick" description of MC-28289.

## Results (E3/E8, 3–4 reps each, zero variance)
| Sequence | Vanilla | Paper 132 default |
|---|---|---|
| sword held (charged) → hit | 7.0 | 7.0 |
| axe held (charged) → hit | 9.0 | 9.0 |
| sword held → key axe + hit same tick | **7.0** (sword attrs, charged, axe item) | **1.8045** (axe attrs, ticker 0) |
| axe held → key sword + hit same tick | **9.0 with sword in hand** | **1.4089** |
| sword held → key axe in tick N−1, hit tick N | 7.0 | 1.8045 |
| same-tick sword→axe vs raised shield | shield disabled 4/4 (100-tick cooldown) | disabled 4/4 |
| sword only vs raised shield | 0/4 | 0/4 |

## Interpretation
- Shield disabling has **no charge requirement** (`getSecondsToDisableBlocking` only checks the WEAPON component and
  `weaponItem == getActiveItem()`), so a same-tick swap-hit breaks shields on both servers.
- Vanilla additionally lets you deliver sword-cadence damage *with* the axe's properties, or a charged axe hit (9, crit 13.5)
  while ending the action already holding the sword. Paper's default removes both damage outcomes. Plugins exist to
  re-enable the vanilla behaviour on Paper (prior art: FAF, Attribute Swap Fixer, Paper Attribute Swap Fix).
- Triple swapping (sword/spear/mace) relies on the same split between component reads (instant) and attribute reads
  (tick-delayed); spear/mace are out of kit and were not tested. Note 1.21.11 spears (`KINETIC_WEAPON`,
  `MINIMUM_ATTACK_CHARGE`, `cannotAttackWithItem(item, 5)` on the server) add further independently-sampled states.

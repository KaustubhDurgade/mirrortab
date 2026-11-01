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


## Triple swapping: sword damage + spear reach + mace smash (E9) — background only, not Diamond-kit legal

### What each item contributes, and where it is sampled
| Item | Contributes | Sampled by | When | Server-side? |
|---|---|---|---|---|
| Sword | ATTACK_DAMAGE 7 and a 12.5-tick charge | `Player.attack` attribute + ticker | vanilla: last `Player.tick` (old item) | yes |
| Spear | reach: `ATTACK_RANGE` max 4.5 + 0.125 margin | **client** `LocalPlayer.raycastHitResult` (`:1201`), called by `pick()` at tick start with the item held *then* | client tick start | **no** — server accepts ≈6 for any item (`AttackRange.defaultFor` = interaction range 3.0, plus 3.0 leniency in `ServerboundInteractPacket.isWithinRange`) |
| Mace | smash bonus: 4/block of fall up to 3 blocks, 2/block to 8, then 1/block (`MaceItem.getAttackDamageBonus:90`); needs fallDistance > 1.5 | `weaponItem.getItem().getAttackDamageBonus` = item in hand **now** | attack | yes |

`startAttack` range-checks only the item in hand at click time (`ATTACK_RANGE` of the mace = none ⇒ no check). The mace
bonus is added **after** cooldown scaling (`f *= 0.2+0.8·scale²; f += bonus`), and the crit ×1.5 then multiplies base and bonus together.

Client recipe (one window): scroll to the spear in the frames before tick N (so `pick()` uses spear reach) → in tick N
press the mace hotbar key and click. Packets: `SetCarried(spear)` from `gameMode.tick()`, `SetCarried(mace)`, `Interact`, `Swing`.
No server tick separates them, so vanilla still holds the sword's attributes and charge.

### E9 results (5-block drop off a pillar, attack on fall tick 10: fallDistance ≈3.35, ~1.7 above ground, eye→hitbox ≈4.17; 3/3 reps each, zero variance)
| Plan | Vanilla | Paper 132 default | Formula |
|---|---|---|---|
| mace held (charged) | 28.04 | 28.04 | (6 + 12.69) × 1.5 crit |
| sword held (charged) | 10.5 | 10.5 | 7 × 1.5 |
| sword → mace same tick | **29.54** | **13.89** | vanilla (7 + 12.69) × 1.5 · Paper 6×0.20 + 12.69, no crit |
| sword → spear → mace (triple) | **29.54** | **13.89** | identical to the double swap server-side |

### Interpretation
- **The sword step is about cadence, not peak damage.** Triple vs a fully charged mace is only +1.5. But the sword charges in
  12.5 ticks against the mace's 33.3. At a 12.5-tick cadence a plain mace scores ≈6×0.32 + 12.69 ≈ 14.6 with no crit, while the
  vanilla swap scores 29.5, about 2×.
- **The spear step is purely client-side.** It lifts the vanilla client's 3-block raycast limit to 4.625. The server already
  accepted 4.17 blocks for every plan, including mace-only and sword-only. Server-side, the triple and the double swap are
  indistinguishable, so this harness (no client raycast) cannot test the spear step. It is SOURCE-SUPPORTED, not run.
- **On Paper defaults:** the sword step dies (attributes update and the cooldown resets on each slot packet, so no charge and
  no crit). The **mace bonus survives at full value**, because it is added after scaling. The **spear reach survives** too:
  it is client pick plus the server's default leniency, not an attribute. Net on Paper: an uncharged 13.9-damage mace smash
  at up to ~4.6 blocks, at any cadence.
- **Kit relevance:** none directly; spear and mace are excluded. The general principle does transfer: components and item
  methods read the hand *now*, attributes read the last tick (vanilla), and reach is a client-side gate. On kit items, that
  principle is exactly the sword→axe shield break.

# Cobweb physics

`WebBlock.entityInside` (`WebBlock.java:27`) → `makeStuckInBlock(state, (0.25, 0.05, 0.25))` (Weaving: 0.5/0.25/0.5)
→ `resetFallDistance()` + set `stuckSpeedMultiplier`. Called from `applyEffectsFromBlocks()` at the end of the entity's
tick (checks blocks along the tick's recorded movement path, so a web crossed mid-movement counts).
`Entity.move` (`:1144`): if `stuckSpeedMultiplier` is set → movement ×multiplier, multiplier cleared,
**`deltaMovement = 0`**. Consequences:
1. Entering: the multiplier is applied on the *next* move ⇒ the first tick of motion into a web is unslowed.
2. Knockback on a webbed target (client-authoritative): the received velocity is used for exactly one move at 25%
   horizontal / 5% vertical, then zeroed ⇒ ≈0.175 blocks of displacement from a 0.7 sprint hit, ~0.02 vertical. (Source-supported; client physics not simulated in the harness.)
3. **Crits from inside a web:** the server resets `fallDistance` every server tick; a move packet adds only the tiny
   sink (≈0.004). The attack in tick N is processed before tick N's move packet, so normally a server tick sits between
   the last fall increment and the attack ⇒ `fallDistance = 0` ⇒ **no crit**. A crit happens only if tick N−1's move
   and tick N's attack are processed in the same inter-tick window (client frame hitch → ticks run back-to-back, or
   network jitter). **E5: normal spacing 0/5 crits, bunched 5/5 crits (10.5 dmg) on both servers;** probe: fall 0.0 vs 0.0039.
4. The web also zeroes the server sim's `v0`, so a target that just left a web has `v0 ≈ 0` for knockback purposes.
Competitive reading: web crits are not a reliable technique at stable FPS/latency; they appear "randomly" under
hitches/jitter. Placing a web on a target removes *their* crit ability (a defensive use) and nearly nullifies your
own knockback on them (combo continuation must use damage, not spacing).

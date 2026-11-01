# Client attack pipeline (vanilla 1.21.11 client)

Source: remapped client.jar, Vineflower. Lines = `src-vanilla`.

## Frame vs tick
`Minecraft.runTick`: runs 0..10 game ticks (`this.tick()`) per frame, **then** applies accumulated mouse movement
(`mouseHandler.handleAccumulatedMovement()` → `turnPlayer`). ⇒ **Rotation changes per frame; everything below happens
per tick and sees the rotation as of the last frame before the tick.** No frame runs between steps of one tick.
If a frame hitches (>50 ms), several ticks run back-to-back in one frame → their packets leave ~simultaneously
("bunched ticks"; used by E5).

## Order inside `Minecraft.tick()` (`Minecraft.java:1738`)
1. `gameRenderer.pick(1.0F)` (`:1753`) — crosshair raycast (`hitResult`) with **current** rotation & position. Once per tick.
2. `gameMode.tick()` (`:1757`) → `ensureHasSentCarriedItem()` (`MultiPlayerGameMode.java:307`): sends
   `ServerboundSetCarriedItemPacket` if the selected slot differs from the last sent one. **A hotbar key pressed in
   tick N−1 or a scroll in the frames before tick N is transmitted here, at the start of tick N.**
3. `handleKeybinds()` (`:1877`), fixed order:
   - hotbar keys 1–9: `if (consumeClick()) setSelectedSlot(i)` — one press per key per tick, loop order 0→8
     (if two keys are pressed in the same tick, the higher slot index wins regardless of press order);
   - swap-offhand, drop, …;
   - if `player.isUsingItem()`: release use if key up, and **all queued attack/use clicks are discarded**;
   - else `while (keyAttack.consumeClick()) startAttack()` — **every** queued click in the tick fires, all with the
     same `hitResult`.
4. `startAttack()` (`:1595`): `missTime` gate; `cannotAttackWithItem(stack,0)` (MINIMUM_ATTACK_CHARGE — none on
   sword/axe); ENTITY hit → `gameMode.attack(player, target)`; always `player.swing(MAIN_HAND)` afterwards.
5. `MultiPlayerGameMode.attack` (`:415`): `ensureHasSentCarriedItem()` → `ServerboundInteractPacket(ATTACK, sneaking)`
   → local prediction `player.attack(target)` → `player.resetAttackStrengthTicker()`.
   `swing()` → `ServerboundSwingPacket`.
6. `level.tickEntities()` → `LocalPlayer.tick()`: physics (`aiStep/travel`), then
   `ServerboundPlayerInputPacket` if key state changed, then `sendPosition()` (`LocalPlayer.java:247`):
   `sendIsSprintingIfNeeded()` (START/STOP_SPRINTING command) then one of `PosRot/Pos/Rot/StatusOnly`
   (rotation only if changed; position if moved >2e-4 or every 20 ticks).
7. `ServerboundClientTickEndPacket`.

### Per-tick serverbound order (what the harness reproduces)
`[SetCarriedItem]? [SetCarriedItem]? [Interact ATTACK, Swing]* [PlayerInput]? [PlayerCommand sprint]? [Move] [TickEnd]`

**Consequence:** the attack in tick N is always processed by the server with the attacker's **rotation, position,
onGround, fallDistance and sprint flag from tick N−1's packets** (plus one server tick of server-side simulation),
while the client aimed with tick N's rotation.

## Local prediction (client side of `Player.attack`)
- Target is a `RemotePlayer`; `RemotePlayer.hurtClient` returns **true** (`RemotePlayer.java:32`), so the client always
  predicts a successful hit: if its *own* charge >0.9 and it is sprinting it applies `deltaMovement *= (0.6,1,0.6)` and
  `setSprinting(false)` to itself, and plays crit particles (`LocalPlayer.crit` → `ParticleTypes.CRIT`) if its own
  `canCriticalAttack` passes — independent of what the server decides.
- Client cooldown: client resets its ticker on every attack and every swing, same as server ⇒ in lockstep except tick-phase jitter.
- Client attributes update in the client `LivingEntity.tick` (after `handleKeybinds`), i.e. a same-tick swap is predicted
  with the **old** item's attributes.

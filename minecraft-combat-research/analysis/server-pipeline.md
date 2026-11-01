# Server attack pipeline (Paper 1.21.11-132; vanilla differences noted)

## Scheduling
Netty threads decode packets; `PacketUtils.ensureRunningOnSameThread` re-queues every game packet onto the main
thread. Queued tasks run **between** ticks (`MinecraftServer` task polling while waiting for the next tick), never
inside a tick, and always in per-connection arrival order. A server tick is atomic w.r.t. packets. So the only
interleaving that matters is **which server tick boundary falls between two packets** — two packets of the same
client tick (µs apart) are effectively never split; packets of consecutive client ticks (~50 ms apart) are almost
always separated by exactly one server tick unless jitter/frame hitches bunch them (E5 exploits this).
The probe's `netIn` (network thread) vs event timestamps confirm in-order processing in every run.

Per server tick, each `ServerPlayer.doTick()` (`ServerPlayer.java:848`) runs `Player.tick` → `LivingEntity.tick/baseTick/aiStep`:
- `attackStrengthTicker++`, `itemSwapTicker++` (`Player.java:308`); if main-hand item *type* changed since
  `lastItemInMainHand` → `resetAttackStrengthTicker()`.
- `detectEquipmentUpdates()` → applies main-hand attribute modifiers (ATTACK_DAMAGE, ATTACK_SPEED).
- **`aiStep → travel()` with zero input** — `Player.canSimulateMovement()` and `Player.isEffectiveAi()` are true on the
  server (`Player.java:1345,1350`): every ServerPlayer has a *shadow physics simulation* of its velocity (gravity 0.08,
  drag 0.98, ground friction 0.546/air 0.91, collisions → `onGround`). It does **not** use the client's WASD input, does
  not move the authoritative position (E6: position unchanged), but it **does** rewrite `deltaMovement`, `onGround`,
  and collision flags every tick.
- `applyEffectsFromBlocks()` (cobweb → `makeStuckInBlock` → `resetFallDistance`).

## Packet handlers
- `handleMovePlayer` (`ServerGamePacketListenerImpl.java:1444`): sets position/rotation (`absSnapTo`), onGround from
  packet, `doCheckFallDamage` (adds −dy to fallDistance), and **calls `jumpFromGround()` whenever server onGround &&
  !packet.onGround && dy>0** (`:1582`) — this sets `dm.y=max(0.42,dm.y)` and adds `0.2·facing` if server-sprinting.
  CraftBukkit wrapper: PlayerMoveEvent threshold (1/256 blocks² or 10°) and the `justTeleported` drop (see paper-differences.md).
- `handleSetCarriedItem` (`:2254`): sets selected slot; **Paper:** `detectEquipmentUpdates()` immediately (default config).
- `handleInteract` (`:2758`): range check `isWithinRange(player, targetAABB, leniency 3.0)` (server allows ~interaction
  range + 3; the 3-block limit is effectively client-side), `cannotAttackWithItem(item, 5)`, then `Player.attack`.
- `handleAnimate` (`:2568`) → `ServerPlayer.swing` (`ServerPlayer.java:2558`) → **`resetAttackStrengthTicker()`** (vanilla too).
- `handlePlayerCommand` (`:2631`): START/STOP_SPRINTING are the only way the server sprint flag becomes true.

## `Player.attack(target)` (`Player.java:999`), in order
1. Paper `PrePlayerAttackEntityEvent`.
2. `f = ATTACK_DAMAGE attribute` *(current modifiers)*; `weapon = getWeaponItem()` (= main hand **now**).
3. `scale = getAttackStrengthScale(0.5) = clamp((ticker+0.5)/(20/ATTACK_SPEED))` *(current ticker, current ATTACK_SPEED)*.
4. `f1 = scale·(enchanted − f)`; `f *= 0.2 + 0.8·scale²`; `onAttack()` (vanilla: resets ticker here; Paper: no-op, reset moved to `actuallyHurt`).
5. `strong = scale>0.9`; `sprintKB = isSprinting() && strong`.
6. `crit = strong && fallDistance>0 && !onGround && !climbable && !inWater && !mobilityRestricted && !passenger && !isSprinting()` (`:1087`) → ×1.5.
7. `sweep = strong && !crit && !sprintKB && onGround && knownMovement² < (speed·2.5)² && main hand ∈ #swords`.
8. `v0 = target.getDeltaMovement()` (snapshot); `target.hurtOrSimulate(src, f+f1)` → `LivingEntity.hurtServer` (`LivingEntity.java:1414`):
   blocking (`applyItemBlocking`), i-frames (`invulnerableTime > duration/2` and `amount <= lastHurt` → return false),
   `actuallyHurt` (Paper: resets attacker cooldown, shield side-effects), `markHurt` unless blocked,
   **base knockback `knockback(0.4, src.x−x, src.z−z)` — direction from attacker *position*, applied even when blocked**.
9. If hurt returned true: `causeExtraKnockback(target, getKnockback()+ (sprintKB?0.5:0), v0)` (`:1169`):
   `knockback(strength, sin(yRot), −cos(yRot))` — direction from attacker **yaw**; attacker `dm *= (0.6,1,0.6)`;
   `setSprinting(false)` (Paper: configurable, default on). Then if target is a ServerPlayer with `hurtMarked`:
   send `ClientboundSetEntityMotionPacket(target)` **immediately** and **restore `target.dm = v0`**.
10. Sweep, effects, durability (`itemAttackInteraction`), exhaustion.
Then the client's `ServerboundSwingPacket` resets the ticker.

## `LivingEntity.knockback` (`:2017`)
`v' = (v.x/2 − k·nx, onGround ? min(0.4, v.y/2 + k) : v.y, v.z/2 − k·nz)`, `n = normalize(x,z)` (pointing *toward* the source).
Sprint hit on a target with server `v0`: `v_final = v0_h/4 + 0.2·â + 0.5·f̂(yaw)`, `v_y = 0.4` if server onGround else `v0.y`.
Non-sprint hit: `v_h = v0_h/2 + 0.4·â`, `v_y = min(0.4, v0.y/2+0.4)` → **0.3608** for a resting player (v0.y = −0.0784 from the shadow sim; measured).

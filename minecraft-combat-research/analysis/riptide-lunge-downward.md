# "Spear lunge downward after riptiding up" — explained (E10, background: trident/spear are out of the Diamond kit)

## Observation (community video)
Player riptides upward out of water, then a spear stab with Lunge slams him **downward**, with the lunge sound, although
Lunge is a horizontal-only impulse.

## Mechanism (source + experiment)
1. **Riptide uses each side's own pitch.** `TridentItem.releaseUsing` runs on the client (current pitch) *and* on the server
   (`player.getXRot()` = the pitch from the **previous client tick**, because `RELEASE_USE_ITEM` is sent from `handleKeybinds`
   before that tick's move packet; same ordering as the stale-yaw knockback, E1). A between-tick flick from looking down to
   looking up while releasing makes the client fly **up** while the server applies the push **down**: `push(0,−3,0)` for Riptide III
   (strength 1.5 + 0.75·(level−1)).
2. **The server keeps that velocity in its shadow sim** (`Player.canSimulateMovement()`=true). It is never sent to the client:
   `push()` sets `needsSync`, not `hurtMarked`, and players only receive their own velocity on `hurtMarked`. It stays ≈ −3…−3.9
   (gravity, drag) while the player is high enough that the sim step does not hit ground (sim collisions zero it).
3. **Lunge is applied server-side to that stored velocity, then the whole thing is sent.** Lunge = `POST_PIERCING_ATTACK` →
   `ApplyEntityImpulse(dir (0,0,1) local, coordinate_scale (1,0,1), 0.458/level)`: horizontal only; blocked in water, while
   gliding or riding. `apply()` does `addDeltaMovement(impulse)` on the **server** velocity and sets `hurtMarked=true`, so
   `ServerEntity` sends `SetEntityMotion(server velocity)`, which **replaces** the client's velocity. The client-side
   `lungeForwardMaybe()` does nothing (`doLungeEffects` only runs on `ServerLevel`).
   Result: client velocity = (lunge horizontal, server's stored −3.x vertical), a downward slam with the lunge sound.

So both TikTok comments were half right: lunge *is* horizontal only; the downward part is the server's stale riptide
velocity, created by the camera flick.

## E10 (Paper 1.21.11-132 and vanilla 1.21.11, 3/3 reps each, identical)
Setup: water source block, Riptide III trident (hold ≥10 ticks), release, swap to Diamond Spear + Lunge III, stab 24 ticks
later near the client's apex (spear needs full charge: `MINIMUM_ATTACK_CHARGE 1.0`, server allows 5 ticks of leniency).
| Mode | Server riptide push (probe) | Server velocity next tick | Client receives at stab |
|---|---|---|---|
| look up in tick N−1 and N | (0, +3.0, 0) | (0, +2.995, 0) | (0, +0.338, 1.374) |
| look down in N−1, up in N (flick) | (0, **−3.0**, 0) | (0, **−3.005**, 0) | (0, **−3.357**, 1.374) |
1.374 = 3 × 0.458 (Lunge III). The control's +0.338 is the sim's arc, slightly behind the client's.
A first run was contaminated by a leftover stone pillar from E9 (the server-side riptide move collided and zeroed the velocity); the cleaned rerun is reported.

## Recipe, as the code dictates
Charge riptide in water/rain → look down → in the same inter-tick window flick up and release → (client launches up; server
stores −3) → swap to a Lunge spear, wait for full charge, stab while still well above the ground and out of water → slammed down.
Any other server velocity sync on that player also releases the stored velocity. For example, being hit while airborne gives a
knockback vertical of `v0.y` (the stored −3.x) instead of lift.

## Relevance to the Diamond kit
None directly. It is a third confirmed instance of the same two engine facts that matter for kit play: actions are evaluated
with the **previous tick's rotation**, and the **server's private copy of your velocity** surfaces whenever the server syncs velocity.

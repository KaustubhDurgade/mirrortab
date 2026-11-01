# Hitbox & targeting

- Client raycast: `GameRenderer.pick(1.0F)` once per tick at tick start, eye position = current (not interpolated)
  position, rotation as of the last frame; reach 3.0 (entity interaction range attribute) for melee, `ATTACK_RANGE`
  component if present (none on sword/axe).
- Server validation: `ServerboundInteractPacket.isWithinRange(player, targetAABB, 3.0 leniency)` against the target's
  *server* AABB (its last processed move). The server does not check look direction. The 3-block melee limit is
  enforced client-side; the server accepts ~6.
- Player AABB 0.6×1.8 (1.5 crouching; pose changes applied in `Player.tick → updatePlayerPose`, i.e. the next server tick
  after a shift change — `handleInteract` sets the shift flag from the attack packet immediately but not the pose).
- Visual body/head rotation never rotates the AABB (axis-aligned).
- Crosshair-to-knockback decoupling: aim (tick-N rotation) and knockback yaw (tick-N−1) are independent inputs (see knockback.md).
- Not investigated experimentally: slab/trapdoor/fence/pressure-plate collision interactions (hypothesis H22 in index).

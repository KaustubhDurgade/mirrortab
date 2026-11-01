# EXPERIMENTAL (observed, mechanism not fully established)
- Shadow-sim `move(SELF)` changes `onGround`/collision flags and velocity but the logged server position stayed fixed (E6).
  Which code path prevents the position change for ServerPlayer was not traced; the observable behaviour is consistent in all runs.

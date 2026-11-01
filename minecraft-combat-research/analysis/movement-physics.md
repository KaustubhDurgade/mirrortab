# Movement physics relevant to combat

- **Two simulations exist for every player**: the client's (authoritative for position) and the server's zero-input
  shadow sim (`Player.canSimulateMovement()`=true server-side, `LivingEntity.aiStep → travel`, `:3474`, `travelInAir` `:2936`).
  The shadow sim uses: gravity 0.08, drag 0.98, friction `blockFriction·0.91` (0.546 on grass), collisions; *no* WASD;
  impulses only from `jumpFromGround` (server-detected lift-off), knockback applied server-side and not restored
  (blocked hits, sweeps, non-player sources), and cobweb zeroing.
- It rewrites `deltaMovement`, `onGround`, collision flags each server tick but not the position (E6).
- `onGround` is therefore **not** simply "the client's last onGround": between a server tick and the next move packet it is the sim's.
  The sim lands one tick before the client on a normal jump (sim velocity ≈ client velocity, sim steps from the client's
  last reported position) ⇒ landing-tick crit denial (E5b).
- Jump arc on flat ground (client): heights 0.420, 0.753, 1.001, 1.166, 1.249, 1.252, 1.177, 1.024, 0.797, 0.495, 0.121, land.
  Server crit outcome for an attack sent in arc tick k (k=jump tick+…): k=1–6 no (fallDistance 0, rising/apex),
  **k=7–10 crit**, k=11 (client still 0.121 above ground, fd 1.13) **no** (sim onGround=true). 3/3 reps, both servers.
- Sprint: client-decided; server flag only via START/STOP commands (sent after the attack in the same tick) and cleared
  by sprint-KB hits. The server pushes its flag and the movement-speed modifier back via entity data / attribute sync
  to the player itself (`ServerEntity.sendDirtyEntityData` → `sendToTrackingPlayersAndSelf`), so any sprint desync self-heals within ~1 RTT (source).
- Sweep requires `knownMovement² < (speed·2.5)²` — `knownMovement` is the client-reported per-tick displacement.

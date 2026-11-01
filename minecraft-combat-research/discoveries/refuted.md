# REFUTED
- **H4** Paper "free ghost clicks": refuted by E2 (identical to vanilla, 16/16). Cause: `ServerPlayer.swing()` resets the ticker; vanilla client always sends the swing.
- **Initial assumption** that server-side player velocity is not simulated (only jump impulse + 0.98 decay): wrong — `Player.canSimulateMovement()` overrides to true; probe showed resting dm (0,−0.0784,0). All conclusions were re-derived.
- **"Pre-charged axe" on Paper** (ticker carries across a same-tick swap): refuted by source (`Player.detectEquipmentUpdates` override resets) and E3 (1.80).
- **H15** persistent sprint desync / sprint-speed crits: refuted by source (server re-syncs flag and speed modifier to self); not run.
- **Blocked-hit rubber-band**: predicted a "moved wrongly" teleport from server-side KB; E6 found none on either server.

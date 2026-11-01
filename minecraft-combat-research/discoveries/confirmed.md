# CONFIRMED (experiment on Paper 1.21.11-132 + source explanation)

1. **Stale-yaw sprint knockback (H1–H3)** — sprint component uses tick N−1 yaw; base uses positions. 42/42 + 4/4 controls. Both servers (E1 Paper; E8 control both). Prior art exists for the technique; mechanism/formula verified here.
2. **Landing-tick crit denial (H10)** — server shadow-sim lands the attacker one tick early; arc ticks 7–10 crit, tick 11 does not (3/3 per tick, both servers). Not found in prior-art search.
3. **Cobweb crits require bunched client ticks (H9)** — 0/5 normal vs 5/5 bunched, both servers.
4. **Paper default disables attribute-swap damage (H6)**, vanilla allows it (H5) with a 2-client-tick input window (H7). Known in community (MC-28289, Paper setting); quantified here.
5. **Same-tick swap disables shields on both servers; no charge needed (H8)** — 4/4 vs 0/4.
6. **Blocked hits: server-only knockback incl. reversed shield recoil, no displacement (H11)** — both servers.
7. **Every click's swing resets cooldown on both servers; Paper's `actuallyHurt` relocation is inert for vanilla clients (H4 refuted / H17 confirmed)**.
8. Non-sprint ground hits lift 0.3608 (H24); LpVec3 error ≤4e-5 (H20); Paper `justTeleported` drop (H18); Paper `PlayerVelocityEvent` pre-hit value (H21).

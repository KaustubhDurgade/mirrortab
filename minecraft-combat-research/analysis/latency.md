# Latency, tick phase and packet bunching

- Server: packets run between ticks in arrival order; a client tick's packets are effectively atomic w.r.t. server ticks.
- What latency changes is not ordering within a tick but **how many server ticks separate consecutive client ticks**.
  Normally exactly one. Jitter or client frame hitches (Minecraft runs up to 10 ticks per frame to catch up) produce
  bunching (0 server ticks between client ticks N−1 and N) or gaps (2).
- Bunching flips outcomes that depend on server-tick-applied state: cobweb fall-distance reset (E5: crit 0/5 → 5/5),
  shadow-sim `onGround`, cooldown increments (E2 one Paper rep: 2.91→3.42 because an extra server tick elapsed).
- Stale-yaw knockback (E1) is *latency-independent*: it depends only on client packet order, not on timing.
- Constant latency shifts everything equally and does not change any confirmed result. The harness ran on localhost
  (RTT ≈ 0); artificial latency/jitter injection was not implemented (future work: tc/netem or a delaying TCP proxy).

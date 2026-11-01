# minecraft-combat-research
Source-grounded, experimentally tested investigation of Minecraft Java 1.21.11 melee combat on Paper 1.21.11-132,
with a vanilla 1.21.11 server as control. Start with `FINAL_REPORT.md`.

- `analysis/` — pipeline traces, state-sampling matrix, per-system notes (knockback, swapping, shield, cobweb, movement, hitbox, latency, Paper diffs)
- `hypotheses/index.md` — 24 hypotheses with status; `hypotheses/experiments/README.md` — methods
- `instrumentation/combatprobe` — passive Paper plugin (MONITOR listeners, per-tick NMS snapshots, read-only packet tap → JSONL)
- `instrumentation/harness` — packet-level vanilla-order client + experiment scripts (`npm install`, then `node e1_stale_yaw.js`)
- `instrumentation/tools` — mapping conversion, plugin build, server start/stop scripts
- `test-results/` — raw per-trial JSON; `discoveries/` — findings by status; `research-log.md` — chronology + checkpoint
No Mojang or Paper binaries/decompiled sources are included.

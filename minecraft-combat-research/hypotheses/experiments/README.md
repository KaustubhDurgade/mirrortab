# Experiments

Harness: `instrumentation/harness` (node ≥18, `npm install` → minecraft-protocol 1.68.0). `vclient.js` emits the vanilla
per-tick packet order (see analysis/client-pipeline.md). It does **not** simulate client physics: every position,
onGround flag and rotation is scripted explicitly, so each trial is a precisely specified, vanilla-reachable packet
sequence. Server: Paper 1.21.11-132 (port 25565, passive CombatProbe plugin) and vanilla 1.21.11 (port 25566).
Setup between trials via RCON only (`tp`, `give`, `effect instant_health`, `attribute max_health 1024`, `setblock`).
Every trial starts with a deterministic rotation "settle" (sub-threshold drift, a dropped significant rotation, then a
real one) to neutralise CraftBukkit `justTeleported` (H18). Target max health 1024 (health does not enter any KB/damage formula).

| ID | Script | Question | Trials | Result file |
|---|---|---|---|---|
| E1 | e1_stale_yaw.js | yaw used for sprint KB after a between-tick flick (θ ∈ {0,30,60,90,135,180,−90}) vs aim-held control | 42 (Paper) | E1_stale_yaw.json |
| E2 | e2_iframe_cooldown.js | cooldown cost of clicks absorbed by i-frames | 16 + 16 | E2_iframe_cooldown_{paper,vanilla}.json |
| E3 | e3_swap.js | same-tick swap damage/KB; shield (contaminated, superseded by E8) | 21 + 21 | E3_swap_*.json |
| E5 | e5_web_crit.js | crit from inside a cobweb, normal vs bunched ticks | 15 + 15 | E5_web_crit_*.json |
| E5b | e5b_jump_crit_window.js | crit per tick of a standing jump arc | 33 + 33 | E5b_jump_crit_window_*.json |
| E6 | e6_blocked_kb.js | what a shield-blocked hit does to the defender | 6 + 6 | E6_blocked_kb_*.json |
| E9 | e9_triple_swap.js | triple swap sword→spear→mace vs double/single, 5-block fall, ~4.2-block reach | 12 + 12 | E9_triple_swap_*.json |
| E10 | e10_riptide_lunge.js | riptide flick + Lunge spear: why the lunge goes down | 6 + 6 | E10_riptide_lunge_*.json |
| E8 | e8_shield_swap.js | shield disable via same-tick swap (spaced 5.6 s); non-sprint flick | 12 + 12 | E8_shield_swap_*.json |

Baselines: every plan has an un-manipulated baseline (aim-held, no swap, no web, sword-only, normal spacing).
Variance: all results were bit-identical across reps except E2 Paper `ghostAt3and7` rep 1 (2.91 → 3.42, hit landed
one server tick later due to tick-phase jitter) and first-tick-of-trial timing (damage registered at tick 1 vs 2).
Known measurement bug fixed: first E5 run computed damage from a health baseline taken before instant-health
applied (showed spurious "1.0"); the probe data from that run already showed the correct 7.0/10.5 split; rerun is reported.
Limitations: localhost only (no injected latency); one machine; client-side effects (KB in web, particles) inferred from source.

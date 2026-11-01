# Paper build under test
Build 132 / commit c5eb079 (see `sources/README.md`). Configuration: **defaults** generated on first boot, except
`server.properties`: `online-mode=false` (offline test bots — authentication does not touch combat code),
`level-type=flat`, `spawn-protection=0`, `difficulty=easy`, `spawn-monsters=false`, `spawn-animals=false`,
`view/simulation-distance=4`, `enable-rcon=true` (test setup only). Gamerules set via RCON: `spawn_mobs false`,
`advance_time false`, `advance_weather false` (1.21.11 uses the new snake_case gamerule IDs; old camelCase IDs are rejected).

Combat-relevant `paper-global.yml` default confirmed in source (`GlobalConfiguration.java:189`):
`unsupported-settings.update-equipment-on-player-actions: true`.
A vanilla 1.21.11 dedicated server (same properties, port 25566) was run side by side as a control.

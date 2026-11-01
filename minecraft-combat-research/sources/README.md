# Sources (provenance only — no Mojang code is stored in this repo)

## Mojang 1.21.11
Manifest: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json` → `1.21.11` →
`https://piston-meta.mojang.com/v1/packages/96403ac4a56447675325d2b1b5e320d76a5b5625/1.21.11.json` (javaVersion 21)

| Artifact | SHA-1 (manifest == downloaded) | Size | URL |
|---|---|---|---|
| client.jar | ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd | 31152600 | https://piston-data.mojang.com/v1/objects/ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd/client.jar |
| client.txt (mappings) | 031a68bebf55d824f66d6573d8c752f0e1bf232a | 11779287 | https://piston-data.mojang.com/v1/objects/031a68bebf55d824f66d6573d8c752f0e1bf232a/client.txt |
| server.jar | 64bb6d763bed0a9f1d632ec347938594144943ed | 56327581 | https://piston-data.mojang.com/v1/objects/64bb6d763bed0a9f1d632ec347938594144943ed/server.jar |
| server.txt (mappings) | 5621e9253f05fd57872bbe7f8ddf5f9a7d525955 | 8678606 | https://piston-data.mojang.com/v1/objects/5621e9253f05fd57872bbe7f8ddf5f9a7d525955/server.txt |

## PaperMC
- Fill API v3: `https://fill.papermc.io/v3/projects/paper/versions/1.21.11/builds/latest` → **build 132**, channel STABLE, 2026-05-11T11:43:09Z
- Commit `c5eb0790f199da6c38d0a650e1e5cd5415b28185` ("Fork friendly byte buf correctly")
- `paper-1.21.11-132.jar` SHA-256 `5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba`
- Startup banner: `Paper version 1.21.11-132-ver/1.21.11@c5eb079 (2026-05-11T11:43:09Z) (Implementing API version 1.21.11-R0.1-SNAPSHOT)`
- Source: `https://github.com/PaperMC/Paper` @ c5eb079 (patches under `paper-server/patches/{sources,features}`)

## Runtime
- OpenJDK 21.0.12.1+1 (Ubuntu 24.04 build), Linux x86_64, 4 vCPU, 15 GB RAM.
- Paper JVM flags: `-Xms2g -Xmx4g`. Vanilla control server: `-Xms1g -Xmx3g`.

## Toolchain
- mapping-io 0.9.2 (ProGuard → Tiny v2, namespace switched obf→named): `instrumentation/tools/Pg2Tiny.java`
- tiny-remapper 0.15.0 (fat) — remapped client.jar (contains integrated server ⇒ full vanilla common+server code)
- Vineflower 1.12.0 (`-dgs=1`) — decompiled remapped vanilla client and Paper's patched, Mojang-mapped server jar
  (`versions/1.21.11/paper-1.21.11.jar`, produced by `java -Dpaperclip.patchonly=true -jar paper-1.21.11-132.jar`).

Decompiled trees live outside the repo at `/home/user/mcwork/decomp/src-{vanilla,paper}` (6622 / 6415 files).
Line numbers cited in `analysis/` refer to those Vineflower outputs (`src-paper/...` unless marked vanilla).

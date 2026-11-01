# Mappings
Official Mojang ProGuard mappings (client.txt / server.txt, see `sources/README.md`), converted to Tiny v2 with
`instrumentation/tools/Pg2Tiny.java` (mapping-io `MappingSourceNsSwitch(tree, "target")` so the source namespace is
obfuscated and the destination is Mojang names). Mapping files themselves are not committed (Mojang license).
Paper 1.20.5+ ships Mojang-mapped at runtime, so Paper needed no remapping.

#!/bin/bash
set -eo pipefail
cd /home/user/mcwork/paper-run
CP="versions/1.21.11/paper-1.21.11.jar:$(find libraries -name '*.jar' | tr '\n' ':')"
rm -rf /home/user/mcwork/build/cp && mkdir -p /home/user/mcwork/build/cp
SRC=/home/user/mirrortab/minecraft-combat-research/instrumentation/combatprobe/src
javac -nowarn -proc:none -cp "$CP" -d /home/user/mcwork/build/cp $SRC/research/combatprobe/*.java 2>&1 | grep -v -E "JAVA_TOOL|^Note:" || true
cp $SRC/plugin.yml /home/user/mcwork/build/cp/
printf "paperweight-mappings-namespace: mojang\n" > /home/user/mcwork/build/manifest.txt
(cd /home/user/mcwork/build/cp && jar cfm /home/user/mcwork/paper-run/plugins/CombatProbe.jar /home/user/mcwork/build/manifest.txt .)
ls -la /home/user/mcwork/paper-run/plugins/CombatProbe.jar

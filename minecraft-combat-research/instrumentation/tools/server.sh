#!/bin/bash
# usage: server.sh start|stop|restart
D=/home/user/mcwork/paper-run; PF=$D/server.pid
stop() { if [ -f $PF ] && kill -0 $(cat $PF) 2>/dev/null; then kill -TERM $(cat $PF); while kill -0 $(cat $PF) 2>/dev/null; do sleep 1; done; fi; rm -f $PF; }
start() { cd $D; : > server-console.log; nohup java -Xms2g -Xmx4g -jar paper-1.21.11-132.jar --nogui > server-console.log 2>&1 < /dev/null & echo $! > $PF; until grep -q "Done (" server-console.log; do sleep 2; if ! kill -0 $(cat $PF) 2>/dev/null; then echo DIED; tail -20 server-console.log; exit 1; fi; done; grep -E "CombatProbe|RCON" server-console.log; }
case $1 in start) start;; stop) stop;; restart) stop; start;; esac

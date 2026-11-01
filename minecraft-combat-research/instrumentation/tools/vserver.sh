#!/bin/bash
D=/home/user/mcwork/vanilla-run; PF=$D/server.pid
stop() { if [ -f $PF ] && kill -0 $(cat $PF) 2>/dev/null; then kill -TERM $(cat $PF); while kill -0 $(cat $PF) 2>/dev/null; do sleep 1; done; fi; rm -f $PF; }
start() { cd $D; : > console.log; nohup java -Xms1g -Xmx3g -jar server.jar nogui > console.log 2>&1 < /dev/null & echo $! > $PF; until grep -q "Done (" console.log; do sleep 2; if ! kill -0 $(cat $PF) 2>/dev/null; then echo DIED; tail -20 console.log; exit 1; fi; done; grep -E "Starting minecraft|RCON|Done" console.log; }
case $1 in start) start;; stop) stop;; restart) stop; start;; esac

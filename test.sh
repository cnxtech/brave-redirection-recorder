#!/bin/bash
TMP_DIR=/tmp/brave-redirection-grapher;
test -d $TMP_DIR && rm -Rf $TMP_DIR && mkdir $TMP_DIR;

docker run -it -v /Users/snyderp/Code/brave-redirection-recorder:/var/task lambci/lambda:nodejs8.10 index.handler '{"url": "https://www.peteresnyder.com", "debug": true, "seconds": 10}'

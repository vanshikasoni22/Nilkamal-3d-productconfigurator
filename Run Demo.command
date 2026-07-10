#!/bin/bash
cd "$(dirname "$0")"
PORT=8000
echo "Starting Nilkamal Configurator demo server on http://localhost:$PORT ..."
( sleep 1.2 && open "http://localhost:$PORT" ) &
python3 -m http.server $PORT

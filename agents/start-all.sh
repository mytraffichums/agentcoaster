#!/bin/bash
set -a; source .env; set +a

echo "Starting all agents..."

PRIVATE_KEY=$MOMENTUM_MIKE_KEY node momentum-mike.js &
PRIVATE_KEY=$MEAN_REVERSION_MARY_KEY node mean-reversion-mary.js &
PRIVATE_KEY=$YOLO_YOLANDA_KEY node yolo-yolanda.js &

echo "Agents running. Press Ctrl+C to stop all."
wait

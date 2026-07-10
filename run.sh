#!/bin/bash

docker run --rm -it \
  --env-file .env \
  --device=/dev/kfd \
  --device=/dev/dri \
  --group-add video \
  --group-add render \
  --ipc=host \
  --security-opt seccomp=unconfined \
  -p 8000:8000 \
  -v "$(pwd):/app" \
  -v "$HOME/data:/data" \
  yolo-app

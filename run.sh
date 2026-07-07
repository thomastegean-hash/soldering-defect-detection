#!/bin/bash

docker run --rm -it \
  --device=/dev/kfd \
  --device=/dev/dri \
  --group-add video \
  --group-add render \
  --ipc=host \
  --security-opt seccomp=unconfined \
  -v "$(pwd):/app" \
  -v "$HOME/data:/data" \
  yolo-app

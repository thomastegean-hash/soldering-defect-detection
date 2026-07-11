# SMD vision

A web application that runs real-time soldering defect detection using a YOLO model, served via a FastAPI backend. Built to run on **AMD GPUs** using ROCm — no NVIDIA required.

Users upload or stream PCB images through a browser UI, and the app returns annotated results with bounding boxes around detected defects.

---

## What It Does

- Accepts image uploads via a web interface
- Runs inference using a YOLO model (Ultralytics) with AMD GPU acceleration via ROCm
- Returns annotated images with detected soldering defects highlighted
- Includes basic authentication (bcrypt-based) and rate limiting to protect the API
- Serves a Jinja2-templated frontend from `static/`

---

## AMD GPU (ROCm) Resource Usage

This project targets AMD GPUs via the [ROCm](https://rocm.docs.amd.com/) stack. The Docker image is built on:

```
rocm/pytorch:rocm7.1_ubuntu24.04_py3.12_pytorch_release_2.8.0
```

At runtime, the container accesses AMD GPU hardware through two device nodes:

| Device | Purpose |
|---|---|
| `/dev/kfd` | AMD Kernel Fusion Driver — GPU compute access |
| `/dev/dri` | Direct Rendering Infrastructure — GPU rendering/display |

The `run.sh` script also adds the container to the `video` and `render` groups, which are required for GPU access on most Linux systems.

**Minimum requirements:**
- An AMD GPU supported by ROCm 7.1 (e.g., RX 6000/7000 series, RDNA2+, or supported data center GPUs)
- ROCm drivers installed on the host
- Linux host (ROCm does not support Windows or macOS natively)

To verify your AMD GPU is visible to ROCm on the host before running:
```bash
rocm-smi
```

---

## Project Structure

```
.
├── app/                  # FastAPI application (main entry point: app/main.py)
├── models/
│   └── deploy/           # Trained YOLO model weights (.pt files go here)
├── static/               # Frontend assets (CSS, JS, HTML templates)
├── Dockerfile            # ROCm-based Docker image definition
├── build.sh              # Builds the Docker image
├── run.sh                # Runs the container with AMD GPU passthrough
└── requirements.txt      # Python dependencies
```

**Main code path:** `app/main.py` → FastAPI routes → YOLO inference via `ultralytics` → annotated image response.

---

## Setup

### Prerequisites

- Docker (with support for `--device` passthrough)
- AMD GPU with ROCm 7.1 compatible drivers installed on the host
- A trained YOLO model weights file (`.pt`) placed in `models/deploy/`
- A `.env` file in the project root (see below)

### 1. Create a `.env` file

```env
SECRET_KEY=your-secret-key-here
```

> The app uses `itsdangerous` for session signing. Set `SECRET_KEY` to a long random string.

### 2. Place your model weights

Copy your trained YOLO `.pt` file into `models/deploy/`:

```bash
cp your_model.pt models/deploy/
```

### 3. Build the Docker image

```bash
./build.sh
```

This runs `docker build -t yolo-app .` using the ROCm PyTorch base image.

### 4. Run the container

```bash
./run.sh
```

This starts the app at **http://localhost:8000** with AMD GPU access enabled.

The full `run.sh` command for reference:

```bash
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
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `ultralytics` | YOLO model loading and inference |
| `opencv-python` | Image preprocessing and annotation |
| `fastapi` | Web API framework |
| `uvicorn` | ASGI server |
| `python-multipart` | File upload handling |
| `passlib[bcrypt]` + `bcrypt` | Password hashing for authentication |
| `itsdangerous` | Secure session/token signing |
| `jinja2` | HTML template rendering |
| `slowapi` | Rate limiting for API endpoints |

All Python dependencies are installed inside the Docker container from `requirements.txt`.

---

## External Services

This project has **no external service dependencies** — inference runs fully locally inside the Docker container. There are no API calls to third-party services, cloud platforms, or external model registries at runtime.

The base Docker image (`rocm/pytorch`) is pulled from Docker Hub on first build.

---

## Checklist

| Item | Status |
|---|---|
| README explains what was built | ✅ |
| README explains AMD resource usage | ✅ |
| Setup instructions are complete | ✅ |
| Main code path is easy to find | ✅ `app/main.py` |
| External services are documented | ✅ None required |

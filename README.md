# SMD Vision

Real-time PCB soldering defect detection using YOLO, FastAPI, and AMD GPUs with ROCm.

SMD Vision is a browser-based inspection application for detecting soldering defects on PCB images. It uses a two-stage YOLO inference pipeline to first classify the PCB view, then route the image to the appropriate specialized defect-detection model. Inference runs fully locally — no cloud services required.

---

## Features

- **Browser-based** PCB image inspection UI
- **Two-stage YOLO pipeline** — classifies perspective vs. top-down view, then routes to the appropriate detector
- **Bounding box annotations** with confidence scores and defect class labels
- **AMD GPU acceleration** via ROCm (no NVIDIA GPU required)
- **Docker-based deployment**
- **Operator authentication** — bcrypt password verification, signed session cookies, rate limiting, and "remember me" support
- **Fully local inference** — no cloud APIs or external model registries
- **Trained YOLO weights included** in the repository

---

## How It Works

SMD Vision uses a two-stage computer vision pipeline:

```
                PCB Image
                    │
                    ▼
          ┌──────────────────┐
          │  View Classifier  │
          │      YOLO         │
          └────────┬─────────┘
                   │
          ┌────────┴─────────┐
          │                  │
    perspective              top
          │                  │
          ▼                  ▼
┌─────────────────┐  ┌─────────────────┐
│ Perspective      │  │ Top-View        │
│ Detector         │  │ Detector        │
└────────┬────────┘  └────────┬────────┘
         │                    │
         └──────────┬─────────┘
                    ▼
           Defect detections
                    │
                    ▼
          Class + confidence
             + bounding box
                    │
                    ▼
            Annotated image
```

Each detection returns:

```json
{
  "class": "example_defect",
  "confidence": 0.94,
  "bbox": [x1, y1, x2, y2]
}
```

The pipeline also returns the classified PCB view alongside detections.

---

## Models

Trained YOLO weights are included in the repository under `models/deploy/`. No download or external model registry is required.

| Model | Purpose |
|---|---|
| View classifier | Determines whether the input is a perspective or top-down PCB image |
| Perspective detector | Detects soldering defects in perspective-view images |
| Top-view detector | Detects soldering defects in top-down images |

> **Note:** Check the repository license and applicable dataset/model licensing terms before redistributing the weights separately.

---

## Project Structure

```
.
├── app/
│   ├── main.py             # FastAPI application entry point
│   ├── auth.py             # Operator authentication and sessions
│   ├── routes.py           # Application/API routes
│   ├── models.py           # YOLO model loading
│   └── templates/
│       └── login.html      # Login page
│
├── models/
│   └── deploy/             # Included trained YOLO weights
│
├── static/                 # Frontend assets and inspection UI
│
├── Dockerfile              # ROCm-based container image
├── build.sh                # Docker image build script
├── run.sh                  # Container startup script
└── requirements.txt        # Python dependencies
```

---

## Requirements

- Linux host
- Docker
- AMD GPU supported by the installed ROCm version
- ROCm drivers installed on the host

Verify the host can see the GPU before starting the application:

```bash
rocm-smi
```

---

## Setup

### 1. Configure the session secret

Create a `.env` file in the project root:

```env
ENV=production
SESSION_SECRET=your-generated-secret
OPERATORS_JSON=...
```

Generate a secure session secret:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

> For development, `ENV` can be omitted. The application uses a built-in fixture operator when `OPERATORS_JSON` is not set.
>
> **Do not use the development fixture credentials in production.**

### 2. Build the Docker image

```bash
./build.sh
```

This builds the application image from the ROCm PyTorch base image.

### 3. Start the application

```bash
./run.sh
```

The application will be available at **http://localhost:8000**.

The underlying Docker command:

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

## API

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/login` | Login page |
| `POST` | `/api/auth/login` | Authenticate an operator |
| `POST` | `/api/auth/logout` | End the current session |
| `GET` | `/api/auth/me` | Return the authenticated operator |

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "operator_id": "OP-1001",
  "password": "password",
  "remember": false
}
```

**Response:**

```json
{
  "ok": true,
  "operator": {
    "operator_id": "OP-1001",
    "name": "Operator One",
    "role": "operator"
  }
}
```

A successful login sets a signed session cookie. All protected routes require this cookie.

---

## Authentication Details

| Property | Value |
|---|---|
| Password hashing | bcrypt |
| Login rate limit | 10 attempts / minute |
| Default session duration | 8 hours |
| "Remember me" duration | 14 days |
| Cookie flags | `HttpOnly`, `SameSite=Lax` |
| Production cookie flag | `Secure` |

- Unknown operator IDs perform a dummy bcrypt verification to reduce timing differences during authentication.
- Failed and successful login attempts are logged; passwords are never logged.

---

## AMD GPU / ROCm

The Docker image is based on:

```
rocm/pytorch:rocm7.1_ubuntu24.04_py3.12_pytorch_release_2.8.0
```

The container receives AMD GPU access through:

| Device | Purpose |
|---|---|
| `/dev/kfd` | AMD Kernel Fusion Driver / GPU compute |
| `/dev/dri` | Direct Rendering Infrastructure |

The `video` and `render` groups are also required for GPU access.

---

## Dependencies

| Package | Purpose |
|---|---|
| `ultralytics` | YOLO model loading and inference |
| `opencv-python` | Image processing and annotation |
| `fastapi` | Web API framework |
| `uvicorn` | ASGI server |
| `python-multipart` | File upload handling |
| `passlib[bcrypt]` / `bcrypt` | Password hashing and verification |
| `itsdangerous` | Signed session tokens |
| `jinja2` | Template support |
| `slowapi` | API rate limiting |
| `pydantic` | Request and response validation |

All dependencies are installed inside the Docker image from `requirements.txt`.

---

## External Services

Inference runs fully inside the Docker container. There are no runtime dependencies on:

- Cloud inference APIs
- Third-party AI services
- Hosted databases
- External model-serving services

The ROCm PyTorch base image is pulled from Docker Hub during the build step.

---

## Troubleshooting

**ROCm cannot see the GPU**

First verify the host:

```bash
rocm-smi
```

If this fails, resolve the host ROCm installation before troubleshooting Docker. If the host can see the GPU but the container cannot, confirm the container is started with `/dev/kfd`, `/dev/dri`, and the `video` and `render` groups.

---

**Application refuses to start in production**

Ensure `.env` contains all required production variables:

```env
ENV=production
SESSION_SECRET=...
OPERATORS_JSON=...
```

---

**Session cookie is not working**

Production cookies are marked `Secure`, so the browser requires HTTPS. For local HTTP development, run without `ENV=production`.

---

## Dataset

The models were trained on the following publicly available dataset:

**SolDef_AI: An Open Source PCB Dataset for Mask R-CNN Defect Detection in Soldering Processes of Electronic Components**

*Gianmauro Fontana, Maurizio Calabrese, Leonardo Agnusdei, Gabriele Papadia, Antonio Del Prete*

DOI: [https://doi.org/10.3390/jmmp8030117](https://doi.org/10.3390/jmmp8030117)

See the original publication for dataset details and licensing.

---

## License

See the repository's configured GitHub license for the terms under which this project is distributed.

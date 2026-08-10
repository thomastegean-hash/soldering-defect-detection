SMD Vision

Real-time PCB soldering defect detection using YOLO, FastAPI, and AMD GPUs with ROCm.

SMD Vision is a browser-based inspection application for detecting soldering defects on PCB images. It uses a two-stage YOLO inference pipeline to first determine the PCB view and then route the image to the appropriate specialized defect-detection model.

The application runs inference locally through a FastAPI backend and is designed for AMD GPUs using the ROCm stack — no NVIDIA GPU is required.

Features

- Browser-based PCB image inspection
- Two-stage YOLO inference pipeline
  - Classifies the input as a "perspective" or "top" view
  - Routes the image to the corresponding specialized detection model
- Soldering defect detection with bounding boxes
- Detection confidence scores and defect classes
- Annotated image results
- AMD GPU acceleration through ROCm
- Docker-based deployment
- Operator authentication with bcrypt password verification
- Signed session cookies with configurable expiration
- "Remember me" sessions
- Login rate limiting
- Protected application routes
- Development and production configuration modes
- Fully local inference with no cloud inference service required
- Trained YOLO models included in the repository

How It Works

SMD Vision uses a two-stage computer-vision pipeline.

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
    │ Perspective     │  │ Top-View        │
    │ Detector        │  │ Detector        │
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

The view classifier selects the detector before defect inference is performed. This allows separate models to specialize in different PCB viewing conditions.

Each detection contains:

{
  "class": "example_defect",
  "confidence": 0.94,
  "bbox": [x1, y1, x2, y2]
}

The detection pipeline also returns the classified PCB view.

Application Architecture

The application consists of a FastAPI backend, authentication layer, inference pipeline, and browser frontend.

Browser
   │
   ├── Login
   │      │
   │      └── /api/auth/login
   │             │
   │             ├── bcrypt verification
   │             ├── rate limiting
   │             └── signed session cookie
   │
   └── Authenticated inspection UI
              │
              ▼
         FastAPI routes
              │
              ▼
        YOLO inference
              │
       ┌──────┴──────┐
       ▼             ▼
 Perspective       Top-view
 detector          detector
       │             │
       └──────┬──────┘
              ▼
       Detection results

Main code path:

app/main.py
    ↓
FastAPI routes
    ↓
Detection pipeline
    ↓
View classifier
    ↓
Perspective / top-view detector
    ↓
Detection results

Models

The trained YOLO models required by SMD Vision are included in the repository under:

models/
└── deploy/

The application uses three models:

Model| Purpose
View classifier| Determines whether the PCB image is a perspective or top-down view
Perspective detector| Detects soldering defects in perspective-view images
Top-view detector| Detects soldering defects in top-down images

The inference pipeline automatically selects the appropriate detector after classifying the input view.

No model download or external model registry is required to run the application.

The model weights are distributed with this repository. Check the repository license and the applicable model/dataset licensing terms before redistributing the weights separately.

Authentication

SMD Vision includes session-based operator authentication for the inspection console.

- Passwords are verified using bcrypt.
- Login attempts are limited to 10 attempts per minute.
- Successful authentication creates a signed session cookie using "itsdangerous".
- Normal sessions last 8 hours.
- "Remember me" sessions last 14 days.
- Session cookies use "HttpOnly" and "SameSite=Lax".
- Production cookies use the "Secure" flag.
- Protected routes require an authenticated operator.
- Operator IDs, names, and roles are available to authenticated endpoints.
- Failed and successful authentication attempts are logged without logging passwords.
- Unknown operator IDs perform a dummy bcrypt verification to reduce timing differences during authentication.

Production configuration

Production deployments require:

ENV=production
SESSION_SECRET=<long-random-secret>
OPERATORS_JSON=<operator-configuration>

Generate a session secret with:

python3 -c "import secrets; print(secrets.token_hex(32))"

"OPERATORS_JSON" contains the configured operator accounts and bcrypt password hashes.

In development mode, the application can use a built-in fixture operator when "OPERATORS_JSON" is not provided.

«Do not use the development fixture credentials in production.»

AMD GPU / ROCm

SMD Vision is designed to run inference on AMD GPUs using ROCm.

The Docker image is based on:

rocm/pytorch:rocm7.1_ubuntu24.04_py3.12_pytorch_release_2.8.0

The container receives AMD GPU access through two device nodes:

Device| Purpose
"/dev/kfd"| AMD Kernel Fusion Driver / GPU compute
"/dev/dri"| Direct Rendering Infrastructure

The container is also started with the "video" and "render" groups, which are commonly required for AMD GPU access.

Requirements

- Linux host
- Docker
- AMD GPU supported by the installed ROCm version
- ROCm drivers installed on the host
- Docker device passthrough support

Verify that the host can see the GPU before starting the application:

rocm-smi

If the host cannot see the GPU through ROCm, the Docker container will not be able to use it either.

Project Structure

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

Setup

Prerequisites

You need:

- Docker
- Linux host
- AMD GPU with compatible ROCm support
- ROCm drivers installed on the host

No model download is required. The trained YOLO weights are already included in "models/deploy/".

1. Configure the session secret

Create a ".env" file in the project root:

ENV=production
SESSION_SECRET=your-generated-secret
OPERATORS_JSON=...

Generate a secure session secret:

python3 -c "import secrets; print(secrets.token_hex(32))"

For development, "ENV" can be omitted. The application provides a development configuration when production-only environment variables are not supplied.

2. Build the Docker image

Run:

./build.sh

This builds the application image using the ROCm PyTorch base image.

3. Start the application

Run:

./run.sh

The application will be available at:

http://localhost:8000

The container is configured for AMD GPU passthrough.

The underlying Docker command is:

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

API

The application exposes authentication and inspection endpoints through FastAPI.

Authentication

GET  /login
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

Login

POST /api/auth/login
Content-Type: application/json

Example:

{
  "operator_id": "OP-1001",
  "password": "password",
  "remember": false
}

A successful login creates the signed session cookie and returns the authenticated operator:

{
  "ok": true,
  "operator": {
    "operator_id": "OP-1001",
    "name": "Operator One",
    "role": "operator"
  }
}

Authentication-protected endpoints require the session cookie created during login.

Dependencies

Package| Purpose
"ultralytics"| YOLO model loading and inference
"opencv-python"| Image processing and annotation
"fastapi"| Web API framework
"uvicorn"| ASGI server
"python-multipart"| File upload handling
"passlib[bcrypt]" / "bcrypt"| Password hashing and verification
"itsdangerous"| Signed session tokens
"jinja2"| Template support
"slowapi"| API rate limiting
"pydantic"| Request and response validation

All Python dependencies are installed inside the Docker image from "requirements.txt".

External Services

Inference runs locally inside the Docker container.

There are no runtime dependencies on:

- Cloud inference APIs
- Third-party AI APIs
- Hosted databases
- External model-serving services

The ROCm PyTorch base image is pulled from Docker Hub when the Docker image is built.

Dataset

The project uses the following publicly available PCB soldering-defect dataset:

SolDef_AI: An Open Source PCB Dataset for Mask R-CNN Defect Detection in Soldering Processes of Electronic Components

Authors:

- Gianmauro Fontana
- Maurizio Calabrese
- Leonardo Agnusdei
- Gabriele Papadia
- Antonio Del Prete

DOI:

https://doi.org/10.3390/jmmp8030117

See the original publication for dataset details and licensing information.

Troubleshooting

ROCm cannot see the GPU

First verify the host:

rocm-smi

If this fails, resolve the host ROCm installation before troubleshooting Docker.

If the host can see the GPU but the container cannot, verify that the container is started with:

/dev/kfd
/dev/dri

and the required "video" and "render" groups.

Application refuses to start in production

Check that ".env" contains:

ENV=production
SESSION_SECRET=...
OPERATORS_JSON=...

"SESSION_SECRET" and "OPERATORS_JSON" are required in production.

Session cookie is not working

Production cookies are marked "Secure", so the browser expects the application to be accessed over HTTPS in a production deployment.

For local HTTP development, run the application without "ENV=production".

License

See the repository's configured GitHub license for the terms under which this project is distributed.
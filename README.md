# OBSBOT Remote

A server-client system for remote control and live streaming of OBSBOT cameras. Stream 1080p video to multiple clients while simultaneously performing loop recording with AI-powered moment detection.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         OBSBOT Camera                           │
│                    (USB: Video + Control)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                         Server                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Native SDK  │  │   FFmpeg    │  │     Loop Recording      │  │
│  │  (Camera    │  │  Pipeline   │  │  • 30s HEVC segments    │  │
│  │  Control)   │  │             │  │  • 10-min rolling buf   │  │
│  └─────────────┘  └──────┬──────┘  │  • AI moment detection  │  │
│                          │         └─────────────────────────┘  │
│                          ▼                                       │
│              ┌───────────────────────┐                          │
│              │  H.264 Live Stream    │◄── UDP/RTSP ──►MediaMTX  │
│              │  (NVENC low-latency)  │                          │
│              └───────────────────────┘                          │
│                                                                  │
│  REST API: /api/status, /api/command                            │
│  WebSocket: /ws/gimbal (real-time PTZ)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Web Client (React)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ WebRTC View │  │  Gimbal     │  │   AI Tracking Controls  │  │
│  │ (MediaMTX)  │  │  Joystick   │  │   Mode, Speed, Gestures │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Live Streaming**: 1080p60 H.264 stream to 2-3 clients via WebRTC (MediaMTX)
- **Remote PTZ Control**: Real-time gimbal control with sub-100ms latency via WebSocket
- **AI Tracking**: Full control over OBSBOT AI modes (Human, Group, Hand, Whiteboard, Desk)
- **Loop Recording**: Continuous HEVC recording in 30-second segments with 10-minute rolling buffer
- **Hardware Acceleration**: NVIDIA NVENC for encoding (HEVC for recording, H.264 for streaming)

## Requirements

- Linux (tested on Ubuntu)
- NVIDIA GPU with NVENC support
- Node.js 18+
- FFmpeg with NVENC support
- [MediaMTX](https://github.com/bluenviron/mediamtx) for WebRTC relay
- OBSBOT camera (Tiny 2, Meet 4K, etc.)

## Project Structure

```
obsbot-remote/
├── package.json          # Monorepo root (npm workspaces)
├── client/               # React web client
│   ├── src/
│   │   ├── App.tsx       # Main UI component
│   │   └── hooks/
│   │       └── useCamera.ts  # Camera state & commands
│   └── package.json
└── server/               # Node.js + native addon
    ├── src/
    │   ├── index.ts      # Express + WebSocket server
    │   ├── native/       # C++ OBSBOT SDK wrapper
    │   └── services/
    │       ├── camera.ts       # Camera control service
    │       ├── ffmpeg.ts       # FFmpeg pipeline
    │       ├── segmentManager.ts
    │       └── stt.ts
    ├── sdk/              # OBSBOT SDK (headers + libs)
    └── package.json
```

## Setup

### 1. Install Dependencies

```bash
cd obsbot-remote
npm install
```

### 2. Build Native Addon

```bash
cd server
npm run build:native
```

### 3. Configure Environment

```bash
cp server/env.example server/.env
# Edit .env with your device paths
```

### 4. Start MediaMTX

```bash
cd server/media_mtx
docker compose up -d
```

### 5. Run

```bash
# Terminal 1: Server
npm run dev:server

# Terminal 2: Client
npm run dev:client
```

Open http://localhost:5173 in your browser.

## API

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Get camera status and recording segments |
| `/api/command` | POST | Send camera command |

### Commands

```json
// AI Control
{ "type": "ai-set-enabled", "payload": { "enabled": true } }
{ "type": "ai-set-mode", "payload": { "mode": 2, "subMode": 0 } }
{ "type": "ai-set-tracking-speed", "payload": { "speed": 2 } }

// Zoom
{ "type": "zoom-set", "payload": { "zoom": 2.5 } }

// Presets
{ "type": "preset-trigger", "payload": { "id": 1 } }
```

### WebSocket (`/ws/gimbal`)

Real-time gimbal control:

```json
{ "type": "gimbal-set-speed", "payload": { "pitch": 25, "pan": -10, "roll": 0 } }
{ "type": "gimbal-stop" }
{ "type": "gimbal-reset" }
```

## Configuration

### Environment Variables (server/.env)

```env
PORT=8080
VIDEO_DEVICE=/dev/video0
AUDIO_DEVICE=default
RTSP_URL=rtsp://localhost:8554/live
```

## License

MIT

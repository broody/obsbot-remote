# OBSBOT Remote

A server-client system for remote control and live streaming of OBSBOT cameras. Stream 1080p video with audio to multiple clients via HLS while simultaneously performing loop recording in 30-second MP4 segments.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         OBSBOT Camera                           │
│                 (USB: Video + Audio + Control)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                         Server                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Native SDK  │  │  GStreamer  │  │     Loop Recording      │  │
│  │  (Camera    │  │   Pipeline  │  │  • 30s MP4 segments     │  │
│  │  Control)   │  │             │  │  • H.264 + AAC          │  │
│  └─────────────┘  └──────┬──────┘  │  • Rolling buffer       │  │
│                          │         └─────────────────────────┘  │
│                          ▼                                       │
│              ┌───────────────────────┐                          │
│              │  H.264 + AAC Stream   │◄──── RTSP ────►MediaMTX  │
│              │  (x264enc + voaacenc) │                          │
│              └───────────────────────┘                          │
│                                                                  │
│  REST API: /api/status, /api/command                            │
│  WebSocket: /ws/gimbal (real-time PTZ)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Web Client (React)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  HLS Video  │  │  Gimbal     │  │   AI Tracking Controls  │  │
│  │  (MediaMTX) │  │  Joystick   │  │   Mode, Speed, Gestures │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Live Streaming**: 1080p30 H.264 video with AAC audio via HLS (MediaMTX)
- **Remote PTZ Control**: Real-time gimbal control with sub-100ms latency via WebSocket
- **AI Tracking**: Full control over OBSBOT AI modes (Human, Group, Hand, Whiteboard, Desk)
- **Loop Recording**: Continuous MP4 recording in 30-second segments with H.264 video and AAC audio
- **Single Encode Architecture**: Encode once, use for both streaming and recording to minimize CPU load
- **Cross-Platform**: Works on x86_64 with NVIDIA GPUs (nvh264enc) and ARM devices like Jetson Nano (x264enc)

## Requirements

- Linux (tested on Ubuntu 22.04 and Jetson Linux)
- Node.js 18+
- GStreamer 1.0 with the following plugins:
  - `gstreamer1.0-plugins-base`
  - `gstreamer1.0-plugins-good`
  - `gstreamer1.0-plugins-bad`
  - `gstreamer1.0-plugins-ugly`
  - `gstreamer1.0-libav`
  - `gstreamer1.0-rtsp` (for rtspclientsink)
  - `gstreamer1.0-alsa` (for audio capture)
  - `gstreamer1.0-x264` (software encoding) OR NVIDIA hardware encoding support
- [MediaMTX](https://github.com/bluenviron/mediamtx) for RTSP to HLS transcoding
- Docker and Docker Compose (for MediaMTX)
- OBSBOT camera (Tiny 2 Lite, Meet 4K, etc.)

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
    │       ├── camera.ts            # Camera control service
    │       ├── gstreamer-simple.ts  # GStreamer pipeline (streaming + recording)
    │       ├── segmentManager.ts
    │       └── stt.ts
    ├── sdk/              # OBSBOT SDK (headers + libs)
    ├── media_mtx/        # MediaMTX Docker config
    └── package.json
```

## Setup

### 1. Install System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y \
  gstreamer1.0-tools \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-ugly \
  gstreamer1.0-libav \
  gstreamer1.0-rtsp \
  gstreamer1.0-alsa \
  gstreamer1.0-x264 \
  libgstreamer1.0-dev
```

**Jetson (ARM):**
```bash
# GStreamer should be pre-installed
# Install additional plugins if needed:
sudo apt-get install -y \
  gstreamer1.0-rtsp \
  gstreamer1.0-x264
```

### 2. Install Node Dependencies

```bash
cd obsbot-remote
npm install
```

### 3. Build Native Addon

```bash
cd server
npm run build:native
```

### 4. Configure Environment

```bash
cp server/env.example server/.env
# Edit .env with your device paths
```

### 5. Start MediaMTX

```bash
cd server/media_mtx
docker compose up -d
```

### 6. Run

```bash
# Terminal 1: Server
npm run dev:server

# Terminal 2: Client
npm run dev:client
```

Open http://localhost:5173 in your browser.

## API

### REST Endpoints

| Endpoint       | Method | Description                              |
| -------------- | ------ | ---------------------------------------- |
| `/api/status`  | GET    | Get camera status and recording segments |
| `/api/command` | POST   | Send camera command                      |

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

## How It Works

The GStreamer pipeline captures video and audio from the OBSBOT camera, encodes them once, then uses tees to split the streams:

1. **Video Path**: v4l2src → MJPEG decode → H.264 encode → tee
   - Branch 1: RTSP streaming to MediaMTX
   - Branch 2: MP4 recording (30s segments)

2. **Audio Path**: alsasrc → AAC encode → tee
   - Branch 1: RTSP streaming to MediaMTX
   - Branch 2: MP4 recording (30s segments)

3. **MediaMTX**: Receives H.264 + AAC via RTSP, transcodes to HLS for web browser playback

This architecture ensures:
- Single encode (efficient CPU usage)
- Synchronized audio/video in both streaming and recording
- Low latency streaming (~1-2 seconds)
- Automatic 30-second segment files for easy review

## Configuration

### Environment Variables (server/.env)

```env
PORT=8080
VIDEO_DEVICE=/dev/video0
# Use 'arecord -l' to find the ALSA audio device (hw:CARD,DEVICE format)
AUDIO_DEVICE=hw:2,0
RTSP_URL=rtsp://localhost:8554/live
CAPTURE_SERVICE=gstreamer  # Options: ffmpeg, gstreamer
```

**Finding your audio device:**
```bash
# List audio capture devices
arecord -l

# Output example:
# card 2: Lite [OBSBOT Tiny 2 Lite], device 0: USB Audio [USB Audio]
# Use: AUDIO_DEVICE=hw:2,0
```

## Troubleshooting

### No video stream in web client

1. Check GStreamer pipeline is running:
   ```bash
   sudo journalctl -u obsbot-server.service -f
   ```

2. Verify MediaMTX received the stream:
   ```bash
   curl http://localhost:9997/v3/paths/list
   ```
   Should show `"name":"live"` with `"ready":true`

3. Test HLS endpoint directly:
   ```bash
   curl http://localhost:8890/live/
   ```

### Audio issues

- If using systemd service, ensure `AUDIO_DEVICE` uses ALSA format (`hw:X,Y`) not PulseAudio format
- Check available audio devices: `arecord -l`
- Test audio capture: `gst-launch-1.0 alsasrc device=hw:2,0 ! fakesink`

### Recording not working

- Check recordings directory exists: `server/recordings/segments/`
- Look for GStreamer errors in logs about splitmuxsink
- Verify disk has space: `df -h`

### Camera control not working

- Check USB connection: `lsusb | grep OBSBOT`
- Verify camera permissions: May need udev rules for non-root access
- Check native addon built successfully: `ls server/build/Release/camera_addon.node`

## License

MIT

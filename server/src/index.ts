import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { cameraService } from './services/camera';
import { ffmpegService } from './services/ffmpeg';
import { gstreamerService } from './services/gstreamer';
import { segmentManager } from './services/segmentManager';
import { sttService } from './services/stt';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 8080;
const VIDEO_DEVICE = process.env.VIDEO_DEVICE || '/dev/video0';
const AUDIO_DEVICE = process.env.AUDIO_DEVICE || 'default';
const RTSP_URL = process.env.RTSP_URL || 'rtsp://localhost:8554/live';
const CAPTURE_SERVICE = process.env.CAPTURE_SERVICE || 'ffmpeg';

// Select capture service
const captureService = CAPTURE_SERVICE === 'gstreamer' ? gstreamerService : ffmpegService;

// Express app for REST API
const app = express();
app.use(cors());
app.use(express.json());

// ==================== REST API ====================

// GET /api/status - Get full camera status
app.get('/api/status', (req, res) => {
  const status = cameraService.getStatus();
  const segments = segmentManager.getRecentSegments();
  res.json({ camera: status, segments });
});

// POST /api/command - Execute a camera command
app.post('/api/command', async (req, res) => {
  const { type, payload } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Missing command type' });
  }

  try {
    const result = await cameraService.executeCommand(type, payload || {});

    // Wait for camera to update state for certain commands
    if (['ai-set-enabled', 'ai-set-mode', 'ai-set-gesture', 'zoom-set'].includes(type)) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Return updated status along with result
    const status = cameraService.getStatus();
    res.json({ success: true, result, status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== HTTP + WebSocket Server ====================

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/gimbal' });

const clients: Set<WebSocket> = new Set();

wss.on('connection', (ws: WebSocket) => {
  console.log('Gimbal WebSocket client connected');
  clients.add(ws);

  ws.on('message', async (message: string) => {
    try {
      const { type, payload } = JSON.parse(message);

      // Only handle gimbal commands via WebSocket
      if (type === 'gimbal-set-speed') {
        await cameraService.executeCommand('gimbal-set-speed', payload);
      } else if (type === 'gimbal-stop') {
        await cameraService.executeCommand('gimbal-stop', {});
      } else if (type === 'gimbal-reset') {
        await cameraService.executeCommand('gimbal-reset', {});
      }
    } catch (error: any) {
      console.error('Gimbal WebSocket error:', error.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Gimbal WebSocket client disconnected');
  });
});

// ==================== Start Server ====================

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server listening on all interfaces at port ${PORT}`);
  console.log(`  REST API: http://0.0.0.0:${PORT}/api/status`);
  console.log(`  Gimbal WS: ws://0.0.0.0:${PORT}/ws/gimbal`);

  // Start capture after a short delay
  setTimeout(() => {
    console.log(`Using capture service: ${CAPTURE_SERVICE}`);
    captureService.startCapture({
      videoDevice: VIDEO_DEVICE,
      audioDevice: AUDIO_DEVICE,
      rtspUrl: RTSP_URL,
    });
  }, 2000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  captureService.stopCapture();
  cameraService.close();
  process.exit(0);
});

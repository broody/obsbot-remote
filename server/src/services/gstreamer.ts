import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class GStreamerService {
  private gstProcess: ChildProcess | null = null;
  private recordingsDir = path.join(process.cwd(), 'recordings');

  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories() {
    const dirs = ['segments', 'audio', 'snapshots'];
    dirs.forEach((dir) => {
      const fullPath = path.join(this.recordingsDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  public startCapture(options: { videoDevice: string; audioDevice: string; rtspUrl: string }) {
    if (this.gstProcess) {
      console.warn('GStreamer capture already running');
      return;
    }

    /**
     * GStreamer Pipeline Explanation:
     *
     * 1. Sources:
     *    - v4l2src: Captures from camera (MJPEG 1080p 30fps)
     *    - pulsesrc: Captures from audio device
     *
     * 2. Processing:
     *    - jpegdec & videoconvert: Decodes MJPEG and prepares for encoding
     *    - audioconvert & audioresample: Prepares audio
     *    - tees: Splits video/audio for multiple outputs
     *
     * 3. Output 1 (High Quality Segmented MP4):
     *    - nvh265enc: NVIDIA HW HEVC encoding
     *    - voaacenc: AAC audio encoding
     *    - splitmuxsink: Creates 30s segments
     *
     * 4. Output 2 (Segmented WAV for STT):
     *    - wavenc: Wraps raw audio in WAV container
     *    - splitmuxsink: Creates 10s segments
     *
     * 5. Output 3 (Live RTSP Stream):
     *    - nvh264enc: NVIDIA HW H.264 encoding
     *    - rtspclientsink: Pushes to RTSP server (e.g. MediaMTX)
     *
     * 6. Output 4 (Periodic Snapshots):
     *    - videorate: Limits framerate to 1 frame every 10s
     *    - jpegenc: Encodes as JPEG
     *    - multifilesink: Saves numbered images
     */

    // Note: GStreamer splitmuxsink doesn't support strftime-style filenames directly
    // in the location property via gst-launch-1.0. We use indexed naming for now.

    const args = [
      '-e', // Send EOS on interrupt to finalize files

      // Video Source: v4l2 capture -> mjpeg decode -> convert
      'v4l2src',
      `device=${options.videoDevice}`,
      '!',
      'image/jpeg,width=3840,height=2160,framerate=30/1',
      '!',
      'queue',
      'max-size-buffers=30',
      'name=v_src_q',
      '!',
      'jpegdec',
      '!',
      'videoconvert',
      '!',
      'tee',
      'name=vtee',

      // Audio Source: pulse capture -> convert -> resample
      'pulsesrc',
      `device=${options.audioDevice}`,
      '!',
      'queue',
      'max-size-buffers=30',
      'name=a_src_q',
      '!',
      'audioconvert',
      '!',
      'audioresample',
      '!',
      'audio/x-raw,rate=48000',
      '!',
      'tee',
      'name=atee',

      // -- OUTPUT 1: High-Quality Segments (HEVC 4K) --
      'vtee.',
      '!',
      'queue',
      'max-size-buffers=30',
      '!',
      'nvh265enc',
      'preset=hq',
      'bitrate=15000',
      'gop-size=60',
      '!',
      'h265parse',
      '!',
      'smux.video',

      'atee.',
      '!',
      'queue',
      'max-size-buffers=60',
      '!',
      'voaacenc',
      'bitrate=128000',
      '!',
      'aacparse',
      '!',
      'smux.audio_0',

      'splitmuxsink',
      'name=smux',
      'muxer-factory=mp4mux',
      `location=${path.join(this.recordingsDir, 'segments/gst_%05d.mp4')}`,
      'max-size-time=30000000000', // 30 seconds

      // -- OUTPUT 2: Audio Segments (WAV) --
      'atee.',
      '!',
      'queue',
      'max-size-buffers=60',
      '!',
      'audioconvert',
      '!',
      'audioresample',
      '!',
      'audio/x-raw,rate=16000,channels=1',
      '!',
      'as_smux.audio_0',
      'splitmuxsink',
      'name=as_smux',
      'muxer-factory=wavenc',
      `location=${path.join(this.recordingsDir, 'audio/gst_%05d.wav')}`,
      'max-size-time=10000000000', // 10 seconds

      // -- OUTPUT 3: Live Stream (H.264 1080p) --
      'vtee.',
      '!',
      'queue',
      'max-size-buffers=30',
      '!',
      'videoscale',
      '!',
      'video/x-raw,width=1920,height=1080',
      '!',
      'nvh264enc',
      'preset=low-latency',
      'zerolatency=true',
      'bitrate=3000',
      'gop-size=30',
      '!',
      'h264parse',
      '!',
      'rtsp_sink.sink_0',
      'rtspclientsink',
      'name=rtsp_sink',
      `location=${options.rtspUrl}`,

      // -- OUTPUT 4: Periodic Snapshots (JPEG 1080p) --
      'vtee.',
      '!',
      'queue',
      'max-size-buffers=30',
      '!',
      'videorate',
      '!',
      'video/x-raw,framerate=1/10',
      '!', // One frame every 10 seconds
      'videoscale',
      '!',
      'video/x-raw,width=1920,height=1080',
      '!',
      'videoconvert',
      '!',
      'jpegenc',
      'quality=85',
      '!',
      'multifilesink',
      `location=${path.join(this.recordingsDir, 'snapshots/snap_%05d.jpg')}`,
    ];

    console.log('Starting GStreamer with args:', args.join(' '));

    this.gstProcess = spawn('gst-launch-1.0', args);

    this.gstProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      // Suppress the constant position/duration messages if GStreamer emits them
      if (!msg.includes('position')) {
        console.log(`[GStreamer] ${msg.trim()}`);
      }
    });

    this.gstProcess.on('close', (code) => {
      console.log(`GStreamer process exited with code ${code}`);
      this.gstProcess = null;
    });

    this.gstProcess.on('error', (err) => {
      console.error('GStreamer process error:', err);
      this.gstProcess = null;
    });
  }

  public stopCapture() {
    if (this.gstProcess) {
      // Send SIGINT so GStreamer can finalize the files (-e flag)
      this.gstProcess.kill('SIGINT');
    }
  }

  public isRunning() {
    return this.gstProcess !== null;
  }
}

export const gstreamerService = new GStreamerService();

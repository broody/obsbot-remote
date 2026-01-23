import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class GStreamerSimpleService {
  private gstProcess: ChildProcess | null = null;
  private recordingsDir = path.join(process.cwd(), 'recordings');

  // Detect if running on NVIDIA Jetson (L4T)
  private isJetson = fs.existsSync('/etc/nv_tegra_release');

  private get encoders() {
    return this.isJetson
      ? {
          h264: 'x264enc',
          h265: 'x265enc',
          presetProp: 'speed-preset',
          h264Preset: 'ultrafast',
          h265Preset: 'ultrafast',
        }
      : {
          h264: 'nvh264enc',
          h265: 'nvh265enc',
          presetProp: 'preset',
          h264Preset: 'low-latency',
          h265Preset: 'hq',
        };
  }

  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories() {
    const segmentsDir = path.join(this.recordingsDir, 'segments');
    if (!fs.existsSync(segmentsDir)) {
      fs.mkdirSync(segmentsDir, { recursive: true });
    }
  }

  private checkRtspClientSinkAvailable(): boolean {
    try {
      const { execSync } = require('child_process');
      execSync('gst-inspect-1.0 rtspclientsink', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  public startCapture(options: { videoDevice: string; audioDevice: string; rtspUrl: string }) {
    if (this.gstProcess) {
      console.warn('GStreamer capture already running');
      return;
    }

    // Check if rtspclientsink is available
    const rtspAvailable = this.checkRtspClientSinkAvailable();

    if (!rtspAvailable) {
      console.error('[GStreamer] rtspclientsink not found. Install gstreamer1.0-rtsp package.');
      return;
    }

    const { encoders } = this;

    // Generate timestamp prefix for this capture session
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/T/, '_')
      .replace(/\..+/, ''); // Format: YYYYMMDD_HHMMSS

    /**
     * GStreamer Pipeline with Recording (Single Encode):
     * - Video: v4l2 -> MJPEG decode -> H.264 encode ONCE -> tee
     *   - Branch 1: RTSP streaming
     *   - Branch 2: MP4 segment recording
     * This reduces CPU load by encoding only once instead of twice
     */
    const args = [
      '-e', // Send EOS on interrupt

      // Video Source: Capture, decode, and encode ONCE
      'v4l2src',
      `device=${options.videoDevice}`,
      '!',
      'image/jpeg,width=1920,height=1080,framerate=30/1',
      '!',
      'queue',
      'max-size-buffers=30',
      '!',
      'jpegdec',
      '!',
      'videoconvert',
      '!',
      'video/x-raw',
      '!',

      // Single H.264 encoder (high quality)
      encoders.h264,
      `${encoders.presetProp}=${encoders.h264Preset}`,
      this.isJetson ? 'tune=zerolatency' : 'zerolatency=true',
      'bitrate=8000', // High quality for both streaming and recording
      this.isJetson ? 'key-int-max=30' : 'gop-size=30',
      this.isJetson ? 'bframes=0' : '',
      '!',
      'h264parse',
      'config-interval=-1',
      '!',

      // Split encoded H.264 stream
      'tee',
      'name=h264tee',
      'allow-not-linked=true', // Allow branches to operate independently

      // Branch 1: RTSP streaming
      'h264tee.',
      '!',
      'queue',
      'max-size-buffers=1',
      'leaky=downstream',
      '!',
      'rtspclientsink',
      `location=${options.rtspUrl}`,
      'latency=0',
      'protocols=tcp',

      // Branch 2: Segment recording (larger queue to prevent frame drops)
      'h264tee.',
      '!',
      'queue',
      'max-size-buffers=200', // Larger buffer to handle disk write delays
      'max-size-time=3000000000', // 3 seconds of buffering
      'max-size-bytes=20971520', // 20MB buffer
      '!',
      'splitmuxsink',
      'muxer-factory=mp4mux',
      'async-finalize=true', // Don't block when finalizing segments
      `location=${path.join(this.recordingsDir, `segments/${timestamp}_%05d.mp4`)}`,
      'max-size-time=30000000000', // 30 second segments
    ].filter(arg => arg !== ''); // Remove empty args

    console.log('Starting GStreamer pipeline with recording');
    console.log('  - Single H.264 encode at 8Mbps (high quality)');
    console.log('  - Live stream: RTSP -> MediaMTX');
    console.log('  - Recordings: 30s MP4 segments');
    console.log('Command:', 'gst-launch-1.0', args.join(' '));

    this.gstProcess = spawn('gst-launch-1.0', args);

    this.gstProcess.stdout?.on('data', (data) => {
      console.log(`[GStreamer] ${data.toString().trim()}`);
    });

    this.gstProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
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
      this.gstProcess.kill('SIGINT');
    }
  }

  public isRunning() {
    return this.gstProcess !== null;
  }
}

export const gstreamerSimpleService = new GStreamerSimpleService();

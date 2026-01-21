import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class FFmpegService {
    private ffmpegProcess: ChildProcess | null = null;
    private recordingsDir = path.join(process.cwd(), 'recordings');

    constructor() {
        this.ensureDirectories();
    }

    private ensureDirectories() {
        const dirs = [
            'segments',
            'audio'
        ];
        dirs.forEach(dir => {
            const fullPath = path.join(this.recordingsDir, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }
        });
    }

    public startCapture(options: {
        videoDevice: string;
        audioDevice: string;
        rtspUrl: string;
    }) {
        if (this.ffmpegProcess) {
            console.warn('FFmpeg capture already running');
            return;
        }

        const args = [
            // Inputs
            '-thread_queue_size', '512',
            '-f', 'v4l2',
            '-input_format', 'mjpeg',
            '-video_size', '1920x1080',
            '-framerate', '30',
            '-i', options.videoDevice,
            
            '-thread_queue_size', '512',
            '-f', 'pulse',
            '-i', options.audioDevice,
            
            // Global options
            '-y', // Overwrite files
            
            // OUTPUT 1: High-Quality Loop Recording (HEVC NVENC)
            '-map', '0:v', '-map', '1:a',
            '-c:v', 'hevc_nvenc', '-preset', 'p4', '-cq', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k',
            '-f', 'segment', 
            '-segment_time', '30', 
            '-reset_timestamps', '1', 
            '-strftime', '1',
            path.join(this.recordingsDir, 'segments/%Y%m%d_%H%M%S.mp4'),
            
            // OUTPUT 2: AI Speech-to-Text Audio (WAV)
            '-map', '1:a',
            '-ar', '16000', '-ac', '1',
            '-f', 'segment', 
            '-segment_time', '10', 
            '-strftime', '1',
            path.join(this.recordingsDir, 'audio/%Y%m%d_%H%M%S.wav'),
            
            // OUTPUT 3: Low-Latency Live Stream (H.264 for MediaMTX/ffplay)
            '-map', '0:v',
            '-c:v', 'h264_nvenc', 
            '-preset', 'p1', 
            '-tune', 'll', 
            '-zerolatency', '1',
            '-delay', '0', 
            '-g', '30', 
            '-forced-idr', '1',
            '-pix_fmt', 'yuv420p',
            '-f', options.rtspUrl.startsWith('udp://') ? 'mpegts' : 'rtsp',
            options.rtspUrl.startsWith('udp://') ? `${options.rtspUrl}?pkt_size=1316&buffer_size=65535` : options.rtspUrl
        ];

        console.log('Starting FFmpeg with args:', args.join(' '));

        this.ffmpegProcess = spawn('ffmpeg', args);

        this.ffmpegProcess.stderr?.on('data', (data) => {
            const msg = data.toString();
            // Suppress the constant frame=... messages
            if (!msg.includes('frame=')) {
                console.log(`[FFmpeg] ${msg.trim()}`);
            }
        });

        this.ffmpegProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
            this.ffmpegProcess = null;
        });

        this.ffmpegProcess.on('error', (err) => {
            console.error('FFmpeg process error:', err);
            this.ffmpegProcess = null;
        });
    }

    public stopCapture() {
        if (this.ffmpegProcess) {
            this.ffmpegProcess.kill('SIGINT');
        }
    }

    public isRunning() {
        return this.ffmpegProcess !== null;
    }
}

export const ffmpegService = new FFmpegService();

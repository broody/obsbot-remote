import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as chokidar from 'chokidar';
import { segmentManager } from './segmentManager';

export class STTService {
  private audioDir = path.join(process.cwd(), 'recordings', 'audio');
  private whisperPath = process.env.WHISPER_PATH || './whisper.cpp';
  private whisperModel = process.env.WHISPER_MODEL || 'models/ggml-base.bin';

  constructor() {
    if (process.env.ENABLE_STT === 'true') {
      this.startWatching();
    }
  }

  private startWatching() {
    const watcher = chokidar.watch(this.audioDir, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('add', (filePath) => {
      if (path.extname(filePath) === '.wav') {
        // For GStreamer, the file might be renamed or completed.
        // We Wait for a bit to ensure it's written.
        setTimeout(() => {
          this.processAudio(filePath);
        }, 1000);
      }
    });
  }

  private async processAudio(filePath: string) {
    const command = `${this.whisperPath} -m ${this.whisperModel} -f ${filePath} -otxt`;

    console.log(`[STT] Processing ${path.basename(filePath)}...`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`[STT] Error processing ${filePath}:`, error);
        return;
      }

      // Read the generated .txt file
      const txtPath = filePath + '.txt';
      if (fs.existsSync(txtPath)) {
        const transcript = fs.readFileSync(txtPath, 'utf-8').trim();
        console.log(`[STT] Transcript for ${path.basename(filePath)}: "${transcript}"`);

        // Clean up the .txt file
        fs.unlinkSync(txtPath);

        // Here we could trigger a callback or emit an event
        this.handleTranscript(transcript, filePath);
      }
    });
  }

  private handleTranscript(transcript: string, filePath: string) {
    if (!transcript) return;

    // Simple trigger logic: if transcript contains "look" or "amazing", mark for keeping
    const keywords = ['look', 'amazing', 'god', 'wow', 'baby', 'dancing'];
    const found = keywords.some((kw) => transcript.toLowerCase().includes(kw));

    if (found) {
      const filename = path.basename(filePath);
      let ts = this.extractTimestamp(filename);

      if (!ts) {
        try {
          ts = fs.statSync(filePath).mtimeMs;
        } catch (err) {
          console.error(`[STT] Failed to get stats for ${filePath}:`, err);
        }
      }

      if (ts) {
        segmentManager.markForKeeping(ts, `Audio Trigger: "${transcript}"`);
      }
    }
  }

  private extractTimestamp(filename: string): number | null {
    const match = filename.match(/^(\d{8}_\d{6})/);
    if (!match) return null;
    const tsStr = match[1];
    const year = parseInt(tsStr.substring(0, 4));
    const month = parseInt(tsStr.substring(4, 6)) - 1;
    const day = parseInt(tsStr.substring(6, 8));
    const hour = parseInt(tsStr.substring(9, 11));
    const min = parseInt(tsStr.substring(11, 13));
    const sec = parseInt(tsStr.substring(13, 15));
    return new Date(year, month, day, hour, min, sec).getTime();
  }
}

export const sttService = new STTService();

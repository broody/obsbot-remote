import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import Database from 'better-sqlite3';

export interface Segment {
  filename: string;
  type: 'video' | 'audio';
  timestamp: number;
  keep: boolean;
  reason?: string;
}

export class SegmentManager {
  private db: Database.Database;
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private segmentsDir = path.join(this.recordingsDir, 'segments');
  private audioDir = path.join(this.recordingsDir, 'audio');
  private retentionBufferMs = 10 * 60 * 1000; // 10 minutes

  constructor() {
    this.db = new Database(path.join(this.recordingsDir, 'metadata.db'));
    this.initializeDb();
    this.startWatching();
    this.startCleanupJob();
  }

  private initializeDb() {
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS segments (
                filename TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                keep INTEGER DEFAULT 0,
                reason TEXT
            )
        `);
  }

  private startWatching() {
    const watcher = chokidar.watch([this.segmentsDir, this.audioDir], {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: false,
    });

    watcher.on('add', (filePath) => {
      const filename = path.basename(filePath);
      const ext = path.extname(filename);

      // Only process completed files (FFmpeg might still be writing)
      // For segments, they are created and then closed.
      if (ext !== '.mp4' && ext !== '.wav') return;

      const type = ext === '.mp4' ? 'video' : 'audio';
      let timestamp = this.extractTimestamp(filename);

      // Fallback to file creation/modification time if timestamp extraction fails (e.g. GStreamer files)
      if (!timestamp) {
        try {
          const stats = fs.statSync(filePath);
          timestamp = stats.mtimeMs;
        } catch (err) {
          console.error(`Failed to get stats for ${filePath}:`, err);
          return;
        }
      }

      if (timestamp) {
        this.registerSegment(filename, type, timestamp);
      }
    });
  }

  private extractTimestamp(filename: string): number | null {
    // Format: YYYYMMDD_HHMMSS.ext
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

  private registerSegment(filename: string, type: 'video' | 'audio', timestamp: number) {
    const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO segments (filename, type, timestamp)
            VALUES (?, ?, ?)
        `);
    stmt.run(filename, type, timestamp);
  }

  public markForKeeping(
    timestamp: number,
    reason: string,
    bufferBeforeMs = 60000,
    bufferAfterMs = 30000
  ) {
    const start = timestamp - bufferBeforeMs;
    const end = timestamp + bufferAfterMs;

    const stmt = this.db.prepare(`
            UPDATE segments 
            SET keep = 1, reason = ? 
            WHERE timestamp >= ? AND timestamp <= ?
        `);
    stmt.run(reason, start, end);
    console.log(
      `Marked segments between ${new Date(start).toISOString()} and ${new Date(end).toISOString()} for keeping. Reason: ${reason}`
    );
  }

  private startCleanupJob() {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Run cleanup every minute
  }

  private cleanup() {
    const now = Date.now();
    const cutoff = now - this.retentionBufferMs;

    const expiredSegments = this.db
      .prepare(
        `
            SELECT filename, type FROM segments 
            WHERE timestamp < ? AND keep = 0
        `
      )
      .all(cutoff) as { filename: string; type: string }[];

    expiredSegments.forEach((seg) => {
      const dir = seg.type === 'video' ? this.segmentsDir : this.audioDir;
      const filePath = path.join(dir, seg.filename);

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          // console.log(`Deleted expired segment: ${seg.filename}`);
        }

        this.db.prepare('DELETE FROM segments WHERE filename = ?').run(seg.filename);
      } catch (error) {
        console.error(`Failed to delete segment ${seg.filename}:`, error);
      }
    });
  }

  public getRecentSegments(limit = 20) {
    return this.db
      .prepare(
        `
            SELECT * FROM segments 
            ORDER BY timestamp DESC 
            LIMIT ?
        `
      )
      .all(limit);
  }
}

export const segmentManager = new SegmentManager();

import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';

export class SegmentRenamer {
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private segmentsDir = path.join(this.recordingsDir, 'segments');
  private watcher: chokidar.FSWatcher | null = null;

  public start() {
    // Watch for new segment files
    this.watcher = chokidar.watch(this.segmentsDir, {
      ignored: /^\./,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Wait 1s after file write finishes
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filePath) => {
      this.renameSegment(filePath);
    });

    console.log('[SegmentRenamer] Started watching for new segments');
  }

  private renameSegment(filePath: string) {
    const filename = path.basename(filePath);

    // Only rename files that match the session_timestamp_index pattern
    if (!filename.match(/^\d{8}_\d{6}_\d{5}\.mp4$/)) {
      return;
    }

    try {
      // Get file creation time
      const stats = fs.statSync(filePath);
      const timestamp = new Date(stats.mtime);

      // Format: YYYYMMDD_HHMMSS.mp4
      const newFilename = timestamp
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/T/, '_')
        .replace(/\..+/, '') + '.mp4';

      const newPath = path.join(this.segmentsDir, newFilename);

      // Rename the file
      fs.renameSync(filePath, newPath);
      console.log(`[SegmentRenamer] Renamed: ${filename} -> ${newFilename}`);
    } catch (error) {
      console.error(`[SegmentRenamer] Failed to rename ${filename}:`, error);
    }
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[SegmentRenamer] Stopped watching');
    }
  }
}

export const segmentRenamer = new SegmentRenamer();

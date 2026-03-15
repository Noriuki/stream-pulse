import { Transform } from 'node:stream';
import type { LogEntry, LogLevel } from '../types.js';

export interface LevelFilterStreamOptions {
  /** Levels to allow. If empty, all levels pass. */
  levels?: LogLevel[];
  /** If true, only entries with level in levels pass; if false, those levels are excluded. Default true. */
  include?: boolean;
}

/**
 * Transform stream that filters log entries by level.
 * Respects backpressure: only pushes when downstream is ready.
 */
export class LevelFilterStream extends Transform {
  private levels: Set<LogLevel>;
  private include: boolean;

  constructor(options: LevelFilterStreamOptions = {}, streamOptions?: ConstructorParameters<typeof Transform>[0]) {
    super({
      ...streamOptions,
      objectMode: true,
    });
    this.levels = new Set(options.levels ?? []);
    this.include = options.include ?? true;
  }

  _transform(
    chunk: LogEntry,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: LogEntry) => void
  ): void {
    const allowed = this.levels.size === 0 || (this.include ? this.levels.has(chunk.level) : !this.levels.has(chunk.level));
    if (allowed) this.push(chunk);
    callback();
  }

  /** Update filter levels at runtime (e.g. from dashboard). */
  setLevels(levels: LogLevel[]): void {
    this.levels = new Set(levels);
  }
}

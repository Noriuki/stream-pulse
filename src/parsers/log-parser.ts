import { Transform } from 'node:stream';
import type { LogEntry, LogLevel } from '../types.js';

const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
const LEVEL_REGEX = new RegExp(
  `^\\[?(\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}[.\\d]*Z?)?\\s*[\\[\\s]*(ERROR|WARN|INFO|DEBUG)[\\]\\s]*`,
  'i'
);

/**
 * Transform stream that parses raw log lines into LogEntry objects.
 * Handles common formats: timestamp + level + message, or level + message.
 * Backpressure is handled automatically by the Transform stream.
 */
export class LogParserStream extends Transform {
  private buffer = '';

  constructor(options?: ConstructorParameters<typeof Transform>[0]) {
    super({
      ...options,
      objectMode: true,
      decodeStrings: true,
    });
  }

  _transform(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: LogEntry) => void
  ): void {
    const text = (this.buffer + (typeof chunk === 'string' ? chunk : chunk.toString())).replace(/\r\n/g, '\n');
    this.buffer = '';
    const lines = text.split('\n');
    const last = lines.pop();
    if (last !== undefined && last !== '') {
      this.buffer = last + '\n';
    }
    for (const line of lines) {
      if (!line.trim()) continue;
      const entry = this.parseLine(line);
      if (entry) this.push(entry);
    }
    callback();
  }

  _flush(callback: (error?: Error | null) => void): void {
    if (this.buffer.trim()) {
      const entry = this.parseLine(this.buffer.trim());
      if (entry) this.push(entry);
    }
    callback();
  }

  private parseLine(line: string): LogEntry | null {
    const match = line.match(LEVEL_REGEX);
    let level: LogLevel = 'info';
    let message = line;
    let timestamp = new Date().toISOString();

    if (match) {
      const [, ts, lvl] = match;
      if (lvl) level = lvl.toLowerCase() as LogLevel;
      if (ts) timestamp = ts;
      message = line.slice(match[0].length).trim();
    } else {
      // Try JSON log format
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (obj.level && LEVELS.includes(String(obj.level).toLowerCase() as LogLevel)) {
          level = String(obj.level).toLowerCase() as LogLevel;
        }
        if (obj.message) message = String(obj.message);
        if (obj.timestamp || obj.time) timestamp = String(obj.timestamp ?? obj.time);
        return {
          level,
          message,
          timestamp,
          raw: line,
          meta: obj,
        };
      } catch {
        // Plain line, keep as info
      }
    }

    return { level, message, timestamp, raw: line };
  }
}

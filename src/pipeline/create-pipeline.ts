import type { Writable } from 'node:stream';
import { LogParserStream } from '../parsers/index.js';
import { LevelFilterStream } from '../streams/index.js';
import type { BroadcastStream } from '../websocket/broadcast-stream.js';
import type { LogLevel } from '../types.js';

export interface PipelineOptions {
  /** Log levels to include (default: all). */
  levels?: LogLevel[];
  /** Include (true) or exclude (false) the given levels. Default true. */
  includeLevels?: boolean;
}

export interface LogPipeline {
  /** Pipe the log source (e.g. process.stdin) into this stream. */
  input: Writable;
  /** Update filter levels at runtime (e.g. from dashboard). */
  setLevels(levels: LogLevel[]): void;
}

/**
 * Builds the log processing pipeline:
 *   source (Readable) → parser → filter → broadcast
 *
 * Backpressure flows from broadcast (slow clients) back to the source.
 */
export function createLogPipeline(
  broadcast: BroadcastStream,
  options: PipelineOptions = {}
): LogPipeline {
  const parser = new LogParserStream();
  const filter = new LevelFilterStream(
    {
      levels: options.levels,
      include: options.includeLevels ?? true,
    },
    { objectMode: true }
  );

  parser.pipe(filter).pipe(broadcast);

  return {
    input: parser,
    setLevels(levels: LogLevel[]) {
      filter.setLevels(levels);
    },
  };
}

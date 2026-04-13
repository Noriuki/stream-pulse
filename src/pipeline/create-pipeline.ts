import { pipeline as pipelineCallback } from 'node:stream';
import type { Writable } from 'node:stream';
import { LogParserStream } from '../parsers/index.js';
import { LevelFilterStream } from '../streams/index.js';
import type { SseBroadcastStream } from '../sse/sse-broadcast-stream.js';
import type { LogLevel } from '../types.js';

export interface PipelineOptions {
  /** Log levels to include (default: all). */
  levels?: LogLevel[];
  /** Include (true) or exclude (false) the given levels. Default true. */
  includeLevels?: boolean;
  /**
   * Called when the internal parser → filter → broadcast chain errors or completes with an error.
   * `stream.pipeline` destroys participating streams on failure.
   */
  onPipelineError?: (err: Error) => void;
}

export interface LogPipeline {
  /** Pipe the log source (e.g. process.stdin) into this stream. */
  input: Writable;
  /** Update filter levels at runtime (e.g. via POST /api/levels). */
  setLevels(levels: LogLevel[]): void;
  /** Tear down the pipeline (e.g. on shutdown). */
  destroy(): void;
}

/**
 * Builds the log processing pipeline with `stream.pipeline()` for automatic cleanup on error:
 *   parser → filter → broadcast
 *
 * Backpressure flows from broadcast (slow SSE clients) back toward the source.
 */
export function createLogPipeline(
  broadcast: SseBroadcastStream,
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

  pipelineCallback(parser, filter, broadcast, (err) => {
    if (err) {
      const handler = options.onPipelineError ?? defaultPipelineError;
      handler(err);
    }
  });

  return {
    input: parser,
    setLevels(levels: LogLevel[]) {
      filter.setLevels(levels);
    },
    destroy() {
      parser.destroy();
    },
  };
}

function defaultPipelineError(err: Error): void {
  process.stderr.write(`[StreamPulse] pipeline error: ${err.message}\n`);
}

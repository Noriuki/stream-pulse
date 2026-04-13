import { createServer } from 'node:http';
import { SseBroadcastStream } from './sse/index.js';
import { createLogPipeline } from './pipeline/index.js';
import type { LogPipeline } from './pipeline/index.js';
import type { LogLevel } from './types.js';

export interface StreamPulseServerOptions {
  port?: number;
  /** Initial log level filter (default: all levels). */
  levels?: LogLevel[];
  /** Called if parser → filter → broadcast fails (after `stream.pipeline` cleanup). */
  onPipelineError?: (err: Error) => void;
}

export interface StreamPulseServer {
  server: ReturnType<typeof createServer>;
  pipeline: LogPipeline;
  broadcast: SseBroadcastStream;
}

const API_INFO = {
  name: 'StreamPulse',
  description: 'Log streaming API over HTTP (SSE + JSON)',
  endpoints: {
    stream: 'GET /api/stream — Server-Sent Events, one JSON log per event',
    stats: 'GET /api/stats — subscriber count',
    levels: '/api/levels',
    health: '/api/health',
  },
};

/**
 * Creates and starts the StreamPulse HTTP API and log pipeline.
 * Pipe a log source into pipeline.input (e.g. via `stream.pipeline(stdin, pipeline.input, cb)`).
 */
export function createStreamPulseServer(
  options: StreamPulseServerOptions = {}
): StreamPulseServer {
  const port = options.port ?? 3080;
  const broadcast = new SseBroadcastStream();
  const pipeline = createLogPipeline(broadcast, {
    levels: options.levels,
    onPipelineError: options.onPipelineError,
  });

  const server = createServer((req, res) => {
    const url = req.url?.split('?')[0] ?? '/';

    if (url === '/api/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({ status: 'ok' })
      );
      return;
    }

    if (url === '/api/stats' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          sseSubscribers: broadcast.getClientCount(),
        })
      );
      return;
    }

    if ((url === '/' || url === '/api') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(API_INFO));
      return;
    }

    if (url === '/api/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': streampulse\n\n');
      broadcast.addClient(res);
      let detached = false;
      const detach = (): void => {
        if (detached) return;
        detached = true;
        broadcast.removeClient(res);
        if (!res.writableEnded) {
          try {
            res.end();
          } catch {
            /* ignore */
          }
        }
      };
      req.on('close', detach);
      req.on('error', detach);
      res.on('error', detach);
      return;
    }

    if (url === '/api/levels' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const { levels } = JSON.parse(body) as { levels: LogLevel[] };
          if (Array.isArray(levels)) pipeline.setLevels(levels);
          res.writeHead(204).end();
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({ error: 'Invalid body' })
          );
        }
      });
      return;
    }

    if (url === '/api/levels' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({ levels: options.levels ?? [] })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({ error: 'Not found' })
    );
  });

  server.listen(port, () => {
    process.stderr.write(
      `StreamPulse API listening on http://localhost:${port}\n` +
        `  GET /api/stream (SSE)  GET /api/stats  GET /api/health  POST /api/levels  GET /\n`
    );
  });

  return { server, pipeline, broadcast };
}

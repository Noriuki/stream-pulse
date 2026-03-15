import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BroadcastStream } from './websocket/index.js';
import { attachWebSocketServer } from './websocket/server.js';
import { createLogPipeline } from './pipeline/index.js';
import type { LogPipeline } from './pipeline/index.js';
import type { LogLevel } from './types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// When running from dist/index.js, resolve public from project root (parent of dist)
const PUBLIC_DIR = join(__dirname, '..', 'public');

const MIMES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
};

export interface StreamPulseServerOptions {
  port?: number;
  /** Initial log level filter (default: all levels). */
  levels?: LogLevel[];
}

export interface StreamPulseServer {
  server: ReturnType<typeof createServer>;
  pipeline: LogPipeline;
  broadcast: BroadcastStream;
}

/**
 * Creates and starts the StreamPulse HTTP server, WebSocket, and log pipeline.
 * Pipe a log source into pipeline.input (e.g. process.stdin).
 */
export function createStreamPulseServer(
  options: StreamPulseServerOptions = {}
): StreamPulseServer {
  const port = options.port ?? 3080;
  const broadcast = new BroadcastStream();
  const pipeline = createLogPipeline(broadcast, { levels: options.levels });

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
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

    const path = url === '/' ? '/index.html' : url;
    const filePath = join(PUBLIC_DIR, path.replace(/^\//, ''));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = readFileSync(filePath);
      const mime = MIMES[extname(filePath)] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime }).end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });

  attachWebSocketServer(server, { broadcast });

  server.listen(port, () => {
    console.error(`StreamPulse dashboard: http://localhost:${port}`);
  });

  return { server, pipeline, broadcast };
}

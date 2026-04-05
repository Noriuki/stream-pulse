#!/usr/bin/env node
/**
 * StreamPulse CLI – pipe log streams into the HTTP API (SSE subscribers receive events).
 *
 * Usage:
 *   tail -f app.log | streampulse
 *   tail -f app.log | npx tsx src/cli.ts
 */
import { pipeline as pipelineCallback } from 'node:stream';
import { createStreamPulseServer } from './index.js';

const port = Number(process.env.PORT) || 3080;
const { server, pipeline } = createStreamPulseServer({ port });

let closing = false;
function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  console.error(`\nStreamPulse: ${signal}, closing…`);
  pipeline.destroy();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (!process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');
  pipelineCallback(process.stdin, pipeline.input, (err) => {
    if (err) {
      console.error('StreamPulse: stdin pipeline error:', err.message);
    }
    shutdown('stdin ended');
  });
  process.stderr.write('StreamPulse: stdin → pipeline (stream.pipeline). Subscribers: GET /api/stream\n');
} else {
  process.stderr.write('StreamPulse: no stdin. Pipe logs in, e.g. tail -f app.log | streampulse\n');
}

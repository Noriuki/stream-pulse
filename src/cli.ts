#!/usr/bin/env node
/**
 * StreamPulse CLI – pipe log streams into the dashboard.
 *
 * Usage:
 *   tail -f app.log | streampulse
 *   tail -f app.log | npx tsx src/cli.ts
 */
import { createStreamPulseServer } from './index.js';

const port = Number(process.env.PORT) || 3080;
const { pipeline } = createStreamPulseServer({ port });

if (!process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');
  process.stdin.pipe(pipeline.input);
  process.stderr.write('StreamPulse: streaming stdin to dashboard. Press Ctrl+C to stop.\n');
} else {
  process.stderr.write('StreamPulse: no stdin. Pipe logs in, e.g. tail -f app.log | streampulse\n');
}

import { Writable } from 'node:stream';
import type { WebSocket } from 'ws';
import type { LogEntry } from '../types.js';

/**
 * Writable stream that broadcasts each log entry to all connected WebSocket clients.
 * Handles backpressure: if clients are slow, the stream backpressures the pipeline.
 */
export class BroadcastStream extends Writable {
  private clients: Set<WebSocket> = new Set();

  constructor(options?: ConstructorParameters<typeof Writable>[0]) {
    super({
      ...options,
      objectMode: true,
    });
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  _write(
    chunk: LogEntry,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    const payload = JSON.stringify(chunk);
    for (const ws of this.clients) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
    callback();
  }
}

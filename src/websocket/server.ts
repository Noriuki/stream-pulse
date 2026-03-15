import { WebSocketServer, type WebSocket } from 'ws';
import type { BroadcastStream } from './broadcast-stream.js';

export interface WSServerOptions {
  port?: number;
  broadcast: BroadcastStream;
}

/**
 * Creates and attaches a WebSocket server to an HTTP server.
 * New connections are registered with the BroadcastStream for real-time log delivery.
 */
export function attachWebSocketServer(
  server: import('http').Server,
  options: WSServerOptions
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    options.broadcast.addClient(ws);
    ws.on('close', () => options.broadcast.removeClient(ws));
    ws.on('error', () => options.broadcast.removeClient(ws));
  });

  return wss;
}

# StreamPulse

Small **CLI + HTTP service** for log lines: read from stdin, parse into structured entries, filter by level, and push events to subscribers over **Server-Sent Events (SSE)** on `GET /api/stream`. Built with Node.js `stream` APIs and TypeScript. No bundled UI — integrate with `curl`, scripts, or any HTTP client.

## Features

- **Receive log streams** — Pipe any line-oriented log source (e.g. `tail -f`, process output) into StreamPulse
- **Process logs with Node streams** — Parser, filter, and broadcast stages form a single pipeline
- **Parse log entries** — Supports timestamp + level + message and JSON log formats
- **Filter by level** — Include or exclude `info`, `warn`, `error`, `debug` via `POST /api/levels`
- **HTTP push** — Parsed logs are emitted as SSE events on `GET /api/stream` (each event’s `data` is a JSON `LogEntry`)
- **`stream.pipeline`** — Parser → filter → SSE sink is wired with `stream.pipeline()` so errors destroy the chain cleanly; CLI uses `stream.pipeline(stdin, parser, cb)` for the same on stdin
- **Resilient SSE** — Dead sockets and back-pressured clients are dropped so the log pipeline does not block forever

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` or `/api` | JSON discovery: endpoints and description |
| `GET` | `/api/health` | `{ "status": "ok" }` |
| `GET` | `/api/stats` | `{ "sseSubscribers": number }` — open SSE connections |
| `GET` | `/api/stream` | **Server-Sent Events** (`text/event-stream`). Each event: `data: { ...LogEntry }\n\n` |
| `GET` | `/api/levels` | Initial configured levels (empty array = all levels allowed at startup) |
| `POST` | `/api/levels` | Body: `{ "levels": ["error","warn","info"] }` — update server-side filter |

### Consuming the stream (SSE)

With **curl** (lines prefixed with `data:`):

```bash
curl -N http://127.0.0.1:3080/api/stream
```

In **JavaScript** (browser or Node 18+):

```js
const es = new EventSource('http://127.0.0.1:3080/api/stream');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

## Quick start

```bash
npm install
npm run build
tail -f app.log | node dist/cli.js
```

The server listens on **http://localhost:3080** (or `PORT`). In another terminal, open **`GET /api/stream`** (see above).

```bash
npm link
tail -f app.log | streampulse
```

## Example usage

```bash
# Stream a log file
tail -f app.log | streampulse

# Try with the included sample log
tail -f sample.log | node dist/cli.js

# Stream stdout of another process
npm run dev 2>&1 | streampulse

# Custom port
PORT=4000 tail -f app.log | streampulse
```

## Architecture

### High-level flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌────────────────────┐
│  Log source     │     │  Parser stream   │     │  Filter stream  │     │  SSE broadcast     │
│  (stdin / tail) │────▶│  (line → entry)  │────▶│  (by level)     │────▶│  (HTTP responses)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘     └────────────────────┘
        │                         │                         │                         │
        │                         │                         │                         ▼
        │                         │                         │                 ┌───────────────┐
        │                         │                         │                 │  Your client  │
        │                         │                         │                 │  (curl / ES)  │
        │                         │                         │                 └───────────────┘
        ▼                         ▼                         ▼
   Backpressure propagates backward: if the broadcast (or any stage) is slow,
   the pipeline buffers and eventually pauses the source (e.g. tail).
```

### Directory layout

```
src/
├── index.ts           # HTTP API + SSE stream route
├── cli.ts             # CLI entry: stdin → pipeline
├── types.ts           # LogLevel, LogEntry, FilterOptions
├── parsers/
│   ├── log-parser.ts
│   └── index.ts
├── streams/
│   ├── line-splitter.ts
│   ├── level-filter.ts
│   └── index.ts
├── sse/
│   ├── sse-broadcast-stream.ts  # Writable → all open SSE responses
│   └── index.ts
├── pipeline/
│   ├── create-pipeline.ts
│   └── index.ts
```

### Example log pipeline (code)

```ts
// pipeline/create-pipeline.ts
import { pipeline as pipelineCallback } from 'node:stream';
const parser = new LogParserStream();
const filter = new LevelFilterStream({ levels: options.levels, include: true });
pipelineCallback(parser, filter, broadcast, (err) => { /* log / handle */ });
// CLI: pipelineCallback(process.stdin, parser, cb);
```

1. **Source** — `process.stdin` when piping into the CLI (via `stream.pipeline(stdin, parser)`).
2. **Parser** — `LogParserStream` → `LogEntry`.
3. **Filter** — `LevelFilterStream` — allow-list via `POST /api/levels`.
4. **Broadcast** — `SseBroadcastStream` — each `LogEntry` is written as one SSE `data:` line to every subscriber.

The internal chain uses **`stream.pipeline(parser, filter, broadcast)`** so errors destroy participants cleanly. Slow or back-pressured SSE clients are dropped so the source is not blocked forever. The CLI ends stdin with **`stream.pipeline`**, and **SIGINT** / **SIGTERM** call `server.close()` and `pipeline.destroy()`.

## Streams reference (Node.js)

- **Readable** — Produces data (e.g. `process.stdin`).
- **Writable** — Consumes data (e.g. `SseBroadcastStream`).
- **Transform** — Parser and filter stages.
- **`stream.pipeline()`** — Connects multiple streams, forwards errors, and destroys participants on failure. Used here for parser → filter → SSE and for stdin → parser in the CLI.

## Scripts

| Command           | Description                         |
| ----------------- | ----------------------------------- |
| `npm run build`   | Compile TypeScript to `dist/`       |
| `npm start`       | Run server (no stdin piping)        |
| `npm run dev`     | Run with `tsx watch`                |
| `npm run cli`     | Run CLI (after build)               |
| `npm run dev:cli` | Run CLI with tsx (e.g. for testing) |

## License

MIT

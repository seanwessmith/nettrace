# nettrace

Terminal UI to visualize HTTP client spans via OpenTelemetry OTLP/HTTP JSON. It starts a minimal OTLP/HTTP JSON receiver on `127.0.0.1:4318` and renders a live Requests table and a Waterfall view. Press `q` (or `Ctrl-C`) to quit.

## Install & run

Run without installing globally:

```bash
npx nettrace
# or
bunx nettrace
```

Install globally:

```bash
npm i -g nettrace
nettrace
```

The server listens on `http://127.0.0.1:4318/v1/traces`.

## Configure your app (OTLP/HTTP JSON)

Point your app's OpenTelemetry traces exporter to nettrace and use JSON over HTTP:

```bash
export OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces
# Some SDKs use shared vars; these are equivalent:
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
```

What nettrace shows:

- Method, URL, Status, Size, Duration for HTTP client spans
- A simple waterfall aligned by start time (Δstart from most recent)
- Optional TTFB if your spans include an event named `ttfb`

Notes:

- Only CLIENT spans that look like HTTP/undici are displayed.
- Nettrace binds to `127.0.0.1` (localhost). Send spans from the same machine.

## Development

Install deps:

```bash
bun install
```

Run from source:

```bash
bun run ./src/index.ts
```

Build and run the compiled CLI:

```bash
bun run build
node dist/index.js
```

## Release (version bump + publish)

Recommended flow using npm's versioning and Bun publish:

```bash
# choose one: patch | minor | major
npm version patch

# build on publish (add this once in package.json):
#   "scripts": { "prepublishOnly": "bun run build" }

bun publish
```

Tip: Avoid defining a `"publish"` script that itself runs `bun publish`, or it will attempt to publish twice when you run `bun publish` directly.

---

This project was created using `bun init` in bun v1.2.22. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

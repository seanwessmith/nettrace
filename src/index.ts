#!/usr/bin/env node
import http from "node:http";
import { performance } from "node:perf_hooks";
import blessed from "blessed";
import contrib from "blessed-contrib";

const screen = blessed.screen({ smartCSR: true, title: "Node Network (OTel)" });

const grid = new contrib.grid({ rows: 12, cols: 12, screen });

const table = grid.set(0, 0, 5, 12, contrib.table, {
  keys: true,
  fg: "white",
  interactive: false,
  label: "Requests",
  columnWidth: [6, 50, 8, 10, 10], // Method, URL, Status, Size, Duration
  columnSpacing: 2,
  columnAlign: ["left", "left", "right", "right", "right"],
});

// a simple waterfall canvas
const waterfall = grid.set(5, 0, 7, 12, contrib.table, {
  label: "Waterfall (aligned by start time) – press q to quit",
  columnWidth: [60, 12],
  columnSpacing: 2,
  columnAlign: ["left", "right"],
});

screen.key(["q", "C-c"], () => process.exit(0));

// --- Minimal OTLP/HTTP JSON receiver ---
type AnyObj = Record<string, any>;
type Span = {
  traceId: string;
  spanId: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  kind: number; // 3 = CLIENT
  attributes?: { key: string; value: AnyObj }[];
  events?: { name: string; timeUnixNano: string }[];
  scope?: { name?: string };
};

type Row = {
  method: string;
  url: string;
  status: string;
  size: string;
  durMs: number;
  startMs: number;
  ttfbMs?: number;
  id: string;
};

const rows: Row[] = [];
const maxRows = 150;

function nsecToMs(n: string) {
  return Number(n) / 1e6;
}
function attr(attrs: any[] | undefined, key: string): string | undefined {
  if (!attrs) return;
  const found = attrs.find((a) => a.key === key);
  if (!found) return;
  const v = found.value || {};
  return Object.values(v)[0] as any;
}
function toRow(span: Span): Row | null {
  // Only CLIENT spans from http/undici
  const kindIsClient = span.kind === 3;
  const scopeName = (span as any).scope?.name || "";
  const looksHttp = /http|undici/i.test(scopeName) || /http/.test(span.name);
  if (!kindIsClient || !looksHttp) return null;

  const start = nsecToMs(span.startTimeUnixNano);
  const end = nsecToMs(span.endTimeUnixNano);
  const durMs = Math.max(0, end - start);

  const method =
    attr(span.attributes, "http.request.method") ||
    attr(span.attributes, "http.method") ||
    "?";
  const status =
    attr(span.attributes, "http.response.status_code") ||
    attr(span.attributes, "http.status_code") ||
    "";
  const url =
    attr(span.attributes, "url.full") ||
    attr(span.attributes, "http.url") ||
    span.name;

  const size =
    attr(span.attributes, "http.response.body.size") ||
    attr(span.attributes, "http.response.header.content-length") ||
    "";

  // locate ttfb event
  let ttfbMs: number | undefined;
  if (span.events && span.events.length) {
    const ev = span.events.find((e) => e.name === "ttfb");
    if (ev) ttfbMs = nsecToMs(ev.timeUnixNano) - start;
  }

  return {
    id: span.spanId,
    method,
    url,
    status: status ? String(status) : "",
    size: size ? String(size) : "",
    durMs,
    startMs: start,
    ttfbMs,
  };
}

function render() {
  // table
  table.setData({
    headers: ["Method", "URL", "Status", "Size", "Duration"],
    data: rows
      .slice(-30)
      .reverse()
      .map((r) => [
        r.method,
        r.url.length > 60 ? r.url.slice(0, 57) + "…" : r.url,
        r.status,
        r.size,
        `${r.durMs.toFixed(1)} ms`,
      ]),
  });

  // waterfall: show recent requests with delta start time from most recent
  const base = rows.length ? rows[rows.length - 1]!.startMs : performance.now();
  const wfData: string[][] = [];

  rows.slice(-20).forEach((r) => {
    const name = r.method + " " + (r.url.split("?")[0] || r.url);
    const displayName = name.length > 60 ? name.slice(0, 57) + "…" : name;
    const delta = ((r.startMs - base) / 1000).toFixed(3);
    wfData.push([displayName, delta]);
  });

  waterfall.setData({
    headers: ["Request", "Δstart (s)"],
    data: wfData,
  });
  screen.render();
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/traces") {
    res.statusCode = 404;
    return res.end();
  }
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    try {
      const body = Buffer.concat(chunks).toString("utf8");
      const payload = JSON.parse(body) as AnyObj;

      // OTLP JSON: resourceSpans[] -> scopeSpans[] -> spans[]
      const rSpans = payload.resourceSpans || [];
      for (const rs of rSpans) {
        const scopeSpans =
          rs.scopeSpans || rs.instrumentationLibrarySpans || [];
        for (const ss of scopeSpans) {
          const spans: Span[] = ss.spans || [];
          for (const s of spans) {
            (s as any).scope = ss.scope || ss.instrumentationLibrary;
            const row = toRow(s);
            if (row) {
              rows.push(row);
              if (rows.length > maxRows) rows.shift();
            }
          }
        }
      }
      render();
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });
});

server.listen(4318, "127.0.0.1", () => {
  render();
});

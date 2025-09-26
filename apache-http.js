/**
 * fake-apache-metrics.js
 *
 * Usage:
 *   npm init -y
 *   npm install express prom-client
 *   node fake-apache-metrics.js
 *
 * Endpoints:
 *   GET /api/status         -> JSON status (detailed)
 *   GET /server-status?auto -> text/plain simple mod_status-like output
 *   GET /metrics            -> Prometheus metrics (text/plain)
 *
 * Config via env:
 *   PORT (default 8080)
 *   HOST (default 0.0.0.0)
 *   INIT_REQ_PER_SEC (default 50)
 */

import express from "express";
import client from "prom-client";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const HOST = process.env.HOST || "0.0.0.0";
const INIT_REQ_PER_SEC =
  process.env.INIT_REQ_PER_SEC ? Number(process.env.INIT_REQ_PER_SEC) : 50;

function randGaussian(mean = 0, std = 1) {
  // Box-Muller
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return (
    mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  );
}

/* -----------------------
   Internal "cluster" state
   ----------------------- */
const state = {
  startTime: Date.now(),
  total_accesses: 0,
  total_kbytes: 0,
  req_per_sec: INIT_REQ_PER_SEC,
  cpu_load: 0.05,
  bytes_per_sec: INIT_REQ_PER_SEC * 12 * 1024, // ~12KB per req
  active_workers: 5,
  idle_workers: 45,
  scoreboard: "", // A string of characters like .W.KR etc — we will generate
  errors_total: 0,
  last_error_rate: 0.01,
  hosts: {
    // example virtual hosts
    "example.com": { accesses: 0, kbytes: 0 },
    "api.example.com": { accesses: 0, kbytes: 0 },
  },
};

/* Prometheus metrics */
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const gauge_req_per_sec = new client.Gauge({
  name: "apache_fake_requests_per_second",
  help: "Fake requests per second",
});
const gauge_total_accesses = new client.Gauge({
  name: "apache_fake_total_accesses",
  help: "Fake total accesses",
});
const gauge_total_kbytes = new client.Gauge({
  name: "apache_fake_total_kbytes",
  help: "Fake total KBytes",
});
const gauge_cpu_load = new client.Gauge({
  name: "apache_fake_cpu_load",
  help: "Fake CPU load (0..1)",
});
const gauge_active_workers = new client.Gauge({
  name: "apache_fake_active_workers",
  help: "Fake active workers",
});
const gauge_idle_workers = new client.Gauge({
  name: "apache_fake_idle_workers",
  help: "Fake idle workers",
});
const gauge_errors_total = new client.Gauge({
  name: "apache_fake_errors_total",
  help: "Fake total errors",
});

/* helper to update Prom metrics from state */
function updatePromMetrics() {
  gauge_req_per_sec.set(state.req_per_sec);
  gauge_total_accesses.set(state.total_accesses);
  gauge_total_kbytes.set(state.total_kbytes);
  gauge_cpu_load.set(state.cpu_load);
  gauge_active_workers.set(state.active_workers);
  gauge_idle_workers.set(state.idle_workers);
  gauge_errors_total.set(state.errors_total);
}

/* generate scoreboard string (like Apache): '_W..K..R' etc
   We'll map: 
    . = waiting, 
    W = sending reply, 
    K = keep-alive, 
    R = reading, 
    C = closing, 
    L = logging, 
    G = finishing.
*/
function generateScoreboard(len = 50) {
  const chars = [".", "W", "K", "R", "C", "L", "G"];
  let s = "";
  for (let i = 0; i < len; i++) {
    const p = Math.random();
    let c;
    if (p < 0.7) c = ".";
    else if (p < 0.82) c = "K";
    else if (p < 0.9) c = "W";
    else if (p < 0.94) c = "R";
    else if (p < 0.97) c = "L";
    else c = "G";
    s += c;
  }
  return s;
}

/* periodic state updater — simulates traffic and flakiness */
function tickSimulation() {
  // vary req/sec with noise and occasional spikes
  const noise = randGaussian(0, Math.max(1, state.req_per_sec * 0.07));
  let next_req = Math.max(0, state.req_per_sec + noise);

  // occasional spike
  if (Math.random() < 0.02) next_req *= 1 + Math.random() * 3; // up to 4x spike

  // occasional drop
  if (Math.random() < 0.01) next_req *= Math.max(0.1, Math.random());

  state.req_per_sec = Math.round(next_req * 100) / 100;

  // bytes per sec follow req rate
  state.bytes_per_sec = Math.round(
    state.req_per_sec * (8 + Math.random() * 32) * 1024
  );

  // total accumulators
  const sec = 1; // tick called every second
  state.total_accesses += Math.round(state.req_per_sec * sec);
  state.total_kbytes += Math.round((state.bytes_per_sec * sec) / 1024);

  // cpu load smooth random walk between 0.01 and 0.95
  state.cpu_load = Math.min(
    0.99,
    Math.max(0.01, state.cpu_load + randGaussian(0, 0.01))
  );

  // workers: scale active_workers proportionally with req/sec
  const ideal_active = Math.min(
    100,
    Math.max(1, Math.round(state.req_per_sec / 2))
  );
  state.active_workers = Math.max(
    1,
    Math.round(
      state.active_workers +
        (ideal_active - state.active_workers) * 0.2 +
        randGaussian(0, 1)
    )
  );
  state.idle_workers = Math.max(0, 100 - state.active_workers);

  // errors: small chance to increment error counter influenced by cpu and random
  const baseErrorProb = 0.0008 + state.cpu_load * 0.002;
  if (Math.random() < baseErrorProb) {
    const newErrors = Math.floor(1 + Math.random() * 3);
    state.errors_total += newErrors;
    state.last_error_rate = Math.min(1, state.last_error_rate + 0.005);
  } else {
    // relax error rate slowly
    state.last_error_rate = Math.max(0, state.last_error_rate * 0.995);
  }

  // distribute some accesses among hosts
  const hostsKeys = Object.keys(state.hosts);
  for (const host of hostsKeys) {
    const fraction = 0.5 + Math.random() * 0.5; // just to diversify
    const hostAccess = Math.round(
      state.req_per_sec * fraction * (Math.random() * 0.6 + 0.2)
    );
    const hostBytes = Math.round(hostAccess * (8 + Math.random() * 32));
    state.hosts[host].accesses += hostAccess;
    state.hosts[host].kbytes += Math.round(hostBytes / 1024);
  }

  state.scoreboard = generateScoreboard(100);

  updatePromMetrics();
}

/* run the sim every second */
setInterval(tickSimulation, 1000);
tickSimulation(); // immediate first tick

/* -----------------------
   HTTP endpoints
   ----------------------- */

app.get("/api/status", (req, res) => {
  const now = Date.now();
  const uptime_seconds = Math.floor((now - state.startTime) / 1000);

  res.json({
    server_name: "FakeApache",
    version: "2.4.fake",
    start_time: new Date(state.startTime).toISOString(),
    uptime_seconds,
    total_accesses: state.total_accesses,
    total_kbytes: state.total_kbytes,
    req_per_sec: state.req_per_sec,
    bytes_per_sec: state.bytes_per_sec,
    cpu_load: Math.round(state.cpu_load * 1000) / 1000,
    active_workers: state.active_workers,
    idle_workers: state.idle_workers,
    errors_total: state.errors_total,
    last_error_rate: Math.round(state.last_error_rate * 10000) / 10000,
    scoreboard: state.scoreboard,
    hosts: state.hosts,
  });
});

/* mod_status-like auto format */
app.get("/server-status", (req, res) => {
  const now = Date.now();
  const uptime_seconds = Math.floor((now - state.startTime) / 1000);
  if (req.query.auto !== undefined) {
    const lines = [
      `Total Accesses: ${state.total_accesses}`,
      `Total kBytes: ${state.total_kbytes}`,
      `CPULoad: ${Math.round(state.cpu_load * 1000) / 1000}`,
      `Uptime: ${uptime_seconds}`,
      `ReqPerSec: ${state.req_per_sec}`,
      `BytesPerSec: ${state.bytes_per_sec}`,
      `BusyWorkers: ${state.active_workers}`,
      `IdleWorkers: ${state.idle_workers}`,
      `Scoreboard: ${state.scoreboard}`,
    ];
    res.type("text/plain").send(lines.join("\n") + "\n");
  } else {
    // simple HTML view
    res.type("text/html").send(`
      <html><head><title>Fake Apache Server Status</title></head><body>
      <h1>Fake Apache Server Status</h1>
      <pre>${JSON.stringify(
        {
          total_accesses: state.total_accesses,
          total_kbytes: state.total_kbytes,
          cpu_load: state.cpu_load,
          uptime_seconds: uptime_seconds,
          req_per_sec: state.req_per_sec,
          bytes_per_sec: state.bytes_per_sec,
          busy: state.active_workers,
          idle: state.idle_workers,
        },
        null,
        2
      )}</pre>
      </body></html>
    `);
  }
});

/* Prometheus metrics */
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* convenience: change traffic parameters on the fly */
app.post("/admin/set", express.json(), (req, res) => {
  const body = req.body || {};
  if (body.req_per_sec !== undefined)
    state.req_per_sec = Number(body.req_per_sec);
  if (body.bytes_per_sec !== undefined)
    state.bytes_per_sec = Number(body.bytes_per_sec);
  if (body.cpu_load !== undefined) state.cpu_load = Number(body.cpu_load);
  if (body.active_workers !== undefined)
    state.active_workers = Number(body.active_workers);
  if (body.idle_workers !== undefined)
    state.idle_workers = Number(body.idle_workers);
  res.json({ ok: true, state });
});

/* root */
app.get("/", (req, res) => {
  res.send(`
    Fake Apache Metrics
    Endpoints:
      /api/status
      /server-status?auto
      /metrics
    Use POST /admin/set with JSON to tune values (req_per_sec, cpu_load, etc.)
  `);
});

app.listen(PORT, HOST, () => {
  console.log(`Fake Apache Metrics server listening on http://${HOST}:${PORT}`);
  console.log(
    "Endpoints: /api/status  /server-status?auto  /metrics  POST /admin/set"
  );
});

/**
 * fake-mysql-metrics.js
 *
 * Usage:
 *   npm init -y
 *   npm install express prom-client
 *   node fake-mysql-metrics.js
 *
 * Endpoints:
 *   GET /api/status    -> JSON détaillé (uptime, connections, qps, tps, slow_queries, etc.)
 *   GET /metrics       -> Prometheus metrics (text/plain)
 *   POST /admin/set    -> JSON pour ajuster certains paramètres (connections, qps, cpu_load, ...)
 *
 * Env:
 *   PORT (default 9090)
 *   HOST (default 0.0.0.0)
 *   INIT_QPS (default 120)
 */

import express from "express";
import client from "prom-client";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 9090;
const HOST = process.env.HOST || "0.0.0.0";
const INIT_QPS = process.env.INIT_QPS ? Number(process.env.INIT_QPS) : 120;

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
   State (simulated MySQL server)
   ----------------------- */
const state = {
  startTime: Date.now(),
  uptime_seconds: 0,
  connections_total: 0, // cumulative connections made
  threads_connected: 10,
  threads_running: 2,
  queries_per_second: INIT_QPS,
  transactions_per_second: Math.max(1, Math.round(INIT_QPS * 0.2)),
  slow_queries_total: 0,
  open_tables: 40,
  opened_tables_total: 1000,
  table_locks_waited: 0,
  innodb_buffer_pool_size_bytes: 128 * 1024 * 1024, // 128MB default (fake)
  innodb_buffer_pool_bytes_data: 60 * 1024 * 1024,
  innodb_buffer_pool_bytes_free: (128 - 60) * 1024 * 1024,
  bytes_received_per_sec: 0,
  bytes_sent_per_sec: 0,
  qcache_hits: 0,
  qcache_inserts: 0,
  replica_lag_seconds: null, // null means no replica
  databases: {
    app_db: { queries: 0, rows_sent: 0, rows_examined: 0 },
    analytics: { queries: 0, rows_sent: 0, rows_examined: 0 },
  },
  errors_total: 0,
};

/* Prometheus metrics */
client.collectDefaultMetrics({ timeout: 5000 });

const g_uptime = new client.Gauge({
  name: "mysql_fake_uptime_seconds",
  help: "Fake MySQL uptime in seconds",
});
const c_connections_total = new client.Counter({
  name: "mysql_fake_connections_total",
  help: "Fake cumulative connections",
});
const g_threads_connected = new client.Gauge({
  name: "mysql_fake_threads_connected",
  help: "Fake threads connected",
});
const g_threads_running = new client.Gauge({
  name: "mysql_fake_threads_running",
  help: "Fake threads running",
});
const g_qps = new client.Gauge({
  name: "mysql_fake_queries_per_second",
  help: "Fake queries per second",
});
const g_tps = new client.Gauge({
  name: "mysql_fake_transactions_per_second",
  help: "Fake transactions per second",
});
const c_slow_queries = new client.Counter({
  name: "mysql_fake_slow_queries_total",
  help: "Fake slow queries total",
});
const g_open_tables = new client.Gauge({
  name: "mysql_fake_open_tables",
  help: "Fake open tables",
});
const c_opened_tables = new client.Counter({
  name: "mysql_fake_opened_tables_total",
  help: "Fake opened tables total",
});
const g_table_locks_waited = new client.Gauge({
  name: "mysql_fake_table_locks_waited",
  help: "Fake table locks waited",
});
const g_ibp_size = new client.Gauge({
  name: "mysql_fake_innodb_buffer_pool_size_bytes",
  help: "Fake InnoDB buffer pool size bytes",
});
const g_ibp_data = new client.Gauge({
  name: "mysql_fake_innodb_buffer_pool_bytes_data",
  help: "Fake InnoDB buffer pool bytes used",
});
const g_ibp_free = new client.Gauge({
  name: "mysql_fake_innodb_buffer_pool_bytes_free",
  help: "Fake InnoDB buffer pool bytes free",
});
const g_bytes_recv = new client.Gauge({
  name: "mysql_fake_bytes_received_per_second",
  help: "Fake bytes received per second",
});
const g_bytes_sent = new client.Gauge({
  name: "mysql_fake_bytes_sent_per_second",
  help: "Fake bytes sent per second",
});
const c_errors_total = new client.Counter({
  name: "mysql_fake_errors_total",
  help: "Fake errors total",
});

/* helper to push current state into Prom metrics */
function updatePromMetrics() {
  g_uptime.set(state.uptime_seconds);
  // connections_total is cumulative counter; ensure we increment the prom counter to match delta
  // but because we only have a counter, we will set by incrementing the diff stored on last tick.
  g_threads_connected.set(state.threads_connected);
  g_threads_running.set(state.threads_running);
  g_qps.set(state.queries_per_second);
  g_tps.set(state.transactions_per_second);
  g_open_tables.set(state.open_tables);
  g_table_locks_waited.set(state.table_locks_waited);
  g_ibp_size.set(state.innodb_buffer_pool_size_bytes);
  g_ibp_data.set(state.innodb_buffer_pool_bytes_data);
  g_ibp_free.set(state.innodb_buffer_pool_bytes_free);
  g_bytes_recv.set(state.bytes_received_per_sec);
  g_bytes_sent.set(state.bytes_sent_per_sec);
}

/* -----------------------
   Simulation tick
   ----------------------- */
let last_connections_total = state.connections_total;
function tickSimulation() {
  const now = Date.now();
  state.uptime_seconds = Math.floor((now - state.startTime) / 1000);

  // QPS noise + occasional spike/drop
  let noise = randGaussian(0, Math.max(1, state.queries_per_second * 0.06));
  let next_qps = Math.max(0, state.queries_per_second + noise);
  if (Math.random() < 0.02) next_qps *= 1 + Math.random() * 4; // spike
  if (Math.random() < 0.01) next_qps *= Math.random() * 0.5; // drop
  state.queries_per_second = Math.round(next_qps * 100) / 100;

  // TPS roughly correlated to QPS (transactions fraction)
  const txFraction = 0.15 + Math.random() * 0.25;
  state.transactions_per_second = Math.max(
    0,
    Math.round(state.queries_per_second * txFraction * 100) / 100
  );

  // connections: small churn proportional to qps
  const newConns = Math.round(
    Math.max(0, state.queries_per_second * (0.02 + Math.random() * 0.05))
  );
  state.connections_total += newConns;
  // threads_connected scale with current qps
  state.threads_connected = Math.max(
    1,
    Math.round(5 + state.queries_per_second / 10 + randGaussian(0, 2))
  );
  // threads_running smaller subset
  state.threads_running = Math.max(
    0,
    Math.round(
      Math.min(
        state.threads_connected,
        state.queries_per_second / 50 + randGaussian(0, 1)
      )
    )
  );

  // bytes in/out: per query average size
  const avg_bytes_in = 200 + Math.random() * 2000; // 0.2KB - 2.2KB
  const avg_bytes_out = 400 + Math.random() * 5000; // 0.4KB - 5.4KB
  state.bytes_received_per_sec = Math.round(
    state.queries_per_second * avg_bytes_in
  );
  state.bytes_sent_per_sec = Math.round(
    state.queries_per_second * avg_bytes_out
  );

  // slow queries: small probability per second depending on load
  const slowProb =
    0.0005 +
    Math.min(
      0.01,
      state.queries_per_second / 10000 + state.threads_running * 0.001
    );
  if (Math.random() < slowProb) {
    const s = Math.floor(1 + Math.random() * 5);
    state.slow_queries_total += s;
    c_slow_queries.inc(s);
  }

  // opened tables and open_tables vary slowly
  if (Math.random() < 0.1) {
    const delta = Math.round(randGaussian(0, 3));
    state.open_tables = Math.max(1, state.open_tables + delta);
  }
  if (Math.random() < 0.05) {
    const deltaOpened = Math.max(0, Math.round(Math.abs(randGaussian(1, 4))));
    state.opened_tables_total += deltaOpened;
    c_opened_tables.inc(deltaOpened);
  }

  // table locks waited accumulate occasionally
  if (Math.random() < 0.02) {
    const waited = Math.round(1 + Math.random() * 5);
    state.table_locks_waited += waited;
  } else {
    // small decay
    state.table_locks_waited = Math.max(
      0,
      Math.round(state.table_locks_waited * 0.995)
    );
  }

  // buffer pool usage random walk
  const ibpTotal = state.innodb_buffer_pool_size_bytes;
  let used = state.innodb_buffer_pool_bytes_data + randGaussian(0, 1024 * 50);
  used = Math.max(0, Math.min(ibpTotal, used));
  state.innodb_buffer_pool_bytes_data = Math.round(used);
  state.innodb_buffer_pool_bytes_free =
    ibpTotal - state.innodb_buffer_pool_bytes_data;

  // errors small chance
  if (Math.random() < 0.001 + state.threads_running / 200) {
    const e = Math.round(1 + Math.random() * 3);
    state.errors_total += e;
    c_errors_total.inc(e);
  }

  // per-database distribution
  const dbKeys = Object.keys(state.databases);
  for (const db of dbKeys) {
    // fraction of qps goes to db
    const frac = 0.3 + Math.random() * 0.7;
    const dbQ = Math.round(
      state.queries_per_second * frac * (Math.random() * 0.6 + 0.2)
    );
    state.databases[db].queries += dbQ;
    state.databases[db].rows_sent += Math.round(dbQ * (1 + Math.random() * 10));
    state.databases[db].rows_examined += Math.round(
      dbQ * (1 + Math.random() * 50)
    );
  }

  // replica lag simulate sometimes (if configured)
  if (state.replica_lag_seconds !== null) {
    // small jitter and occasional spike
    if (Math.random() < 0.02)
      state.replica_lag_seconds += Math.round(Math.random() * 20);
    else
      state.replica_lag_seconds = Math.max(
        0,
        Math.round(state.replica_lag_seconds * 0.98 + randGaussian(0, 1))
      );
  }

  // update Prom metrics and increment counters
  updatePromMetrics();

  // increment prometheus connections_total counter by the delta since last tick
  const diffConns = state.connections_total - last_connections_total;
  if (diffConns > 0) c_connections_total.inc(diffConns);
  last_connections_total = state.connections_total;
}

/* run simulation each second */
setInterval(tickSimulation, 1000);
tickSimulation();

/* -----------------------
   HTTP endpoints
   ----------------------- */

app.use(express.json());

app.get("/api/status", (req, res) => {
  res.json({
    server: "FakeMySQL",
    version: "8.0.fake",
    start_time: new Date(state.startTime).toISOString(),
    uptime_seconds: state.uptime_seconds,
    connections_total: state.connections_total,
    threads_connected: state.threads_connected,
    threads_running: state.threads_running,
    queries_per_second: state.queries_per_second,
    transactions_per_second: state.transactions_per_second,
    slow_queries_total: state.slow_queries_total,
    open_tables: state.open_tables,
    opened_tables_total: state.opened_tables_total,
    table_locks_waited: state.table_locks_waited,
    innodb_buffer_pool_size_bytes: state.innodb_buffer_pool_size_bytes,
    innodb_buffer_pool_bytes_data: state.innodb_buffer_pool_bytes_data,
    innodb_buffer_pool_bytes_free: state.innodb_buffer_pool_bytes_free,
    bytes_received_per_sec: state.bytes_received_per_sec,
    bytes_sent_per_sec: state.bytes_sent_per_sec,
    errors_total: state.errors_total,
    replica_lag_seconds: state.replica_lag_seconds,
    databases: state.databases,
  });
});

app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* admin: tune simulation */
app.post("/admin/set", (req, res) => {
  const body = req.body || {};
  if (body.queries_per_second !== undefined)
    state.queries_per_second = Number(body.queries_per_second);
  if (body.transactions_per_second !== undefined)
    state.transactions_per_second = Number(body.transactions_per_second);
  if (body.threads_connected !== undefined)
    state.threads_connected = Number(body.threads_connected);
  if (body.threads_running !== undefined)
    state.threads_running = Number(body.threads_running);
  if (body.replica_lag_seconds !== undefined)
    state.replica_lag_seconds =
      body.replica_lag_seconds === null ?
        null
      : Number(body.replica_lag_seconds);
  if (body.innodb_buffer_pool_size_bytes !== undefined) {
    const newSize = Number(body.innodb_buffer_pool_size_bytes);
    state.innodb_buffer_pool_size_bytes = newSize;
    // ensure used/free consistent
    state.innodb_buffer_pool_bytes_data = Math.min(
      state.innodb_buffer_pool_bytes_data,
      newSize
    );
    state.innodb_buffer_pool_bytes_free =
      newSize - state.innodb_buffer_pool_bytes_data;
  }
  res.json({
    ok: true,
    state_preview: {
      queries_per_second: state.queries_per_second,
      transactions_per_second: state.transactions_per_second,
      threads_connected: state.threads_connected,
      replica_lag_seconds: state.replica_lag_seconds,
    },
  });
});

/* root */
app.get("/", (req, res) => {
  res.send(`
Fake MySQL Metrics (fake)
Endpoints:
  GET /api/status
  GET /metrics
  POST /admin/set  (json body: queries_per_second, threads_connected, replica_lag_seconds, ...)
`);
});

app.listen(PORT, HOST, () => {
  console.log(`Fake MySQL Metrics server listening on http://${HOST}:${PORT}`);
  console.log("Endpoints: /api/status  /metrics  POST /admin/set");
});

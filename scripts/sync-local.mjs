/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import * as fs from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { connect as connectTcp, createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    backend: { type: "string", default: join(root, "midori-sync") },
    "state-dir": { type: "string" },
    "postgres-bin": { type: "string", default: process.env.PG_BINDIR ?? "" },
    port: { type: "string", default: "8000" },
    "rtt-ms": { type: "string", default: "0" },
    browser: { type: "string", default: process.env.MIDORI_BROWSER_BINARY ?? "" },
    "open-profiles": { type: "boolean", default: false },
    pair: { type: "boolean", default: false },
    test: { type: "boolean", default: false },
    smoke: { type: "boolean", default: false },
    native: { type: "boolean", default: false },
    "profiles-only": { type: "boolean", default: false },
    filter: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write(`Midori Sync local (PostgreSQL + Artisan)
  npm run dev:sync [-- --port 8000 --open-profiles --browser /path/to/midori]
  npm run dev:sync -- --pair
  npm run test:sync
  npm run test:sync -- --smoke --port 8138
  npm run test:sync -- --native --port 8139
  npm run test:sync -- --native --profiles-only --port 8139
  npm run test:sync -- --filter DeviceRevocationTest
  --backend PATH       Laravel repository (default: midori-sync)
  --state-dir PATH     Isolated state; must be empty on first use
  --postgres-bin PATH  Directory containing initdb, postgres, pg_isready
  --rtt-ms N           Add N ms round-trip delay to the native profile test proxy
Requires PHP/Composer dependencies and PostgreSQL installed. No Docker or Redis.
`);
} else {
  await main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

async function main() {
  if (process.platform === "win32") {
    throw new Error("Run the local PostgreSQL development tool in WSL on Windows.");
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Choose an API port between 1024 and 65535.");
  }
  const rttMs = Number(values["rtt-ms"]);
  if (!Number.isInteger(rttMs) || rttMs < 0 || rttMs > 2000 || (rttMs > 0 && (!values.native || !values.test))) {
    throw new Error("Use --rtt-ms with native test mode and a value between 0 and 2000.");
  }
  const oneWayDelayMs = rttMs / 2;
  if (values.test && (values.pair || values["open-profiles"])) {
    throw new Error("Test mode cannot pair accounts or open browser profiles.");
  }
  if (values.smoke && !values.test) throw new Error("Use --smoke together with --test.");
  if (values.native && (!values.test || values.smoke)) throw new Error("Use --native together with --test, without --smoke.");
  if (values["profiles-only"] && !values.native) throw new Error("Use --profiles-only together with --native.");
  if (values.filter !== undefined && (!values.test || values.native || values.smoke)) {
    throw new Error("Use --filter only with PHP test mode.");
  }
  if (values["open-profiles"] && !values.browser) {
    throw new Error("Set MIDORI_BROWSER_BINARY or pass --browser with an existing native Midori build.");
  }

  const backend = resolve(values.backend);
  await fs.access(join(backend, "vendor", "autoload.php"));
  const state = resolve(values["state-dir"] ?? (values.test
    ? await fs.mkdtemp(join(tmpdir(), "midori-sync-tests-"))
    : join(root, ".midori-sync-dev")));
  await fs.mkdir(state, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(state)).isSymbolicLink()) {
    throw new Error("The development state directory cannot be a symbolic link.");
  }
  const markerPath = join(state, ".midori-sync-local.json");
  let marker;
  try {
    marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if ((await fs.readdir(state)).length) {
      throw new Error("Choose an empty state directory; existing files will not be repurposed.");
    }
    marker = { schema: 1, mode: values.test ? "test" : "dev" };
    await fs.writeFile(markerPath, JSON.stringify(marker), { mode: 0o600, flag: "wx" });
  }
  if (marker.schema !== 1 || marker.mode !== (values.test ? "test" : "dev")) {
    throw new Error("Development and test state must use separate directories.");
  }
  if (values.pair) {
    const runtime = JSON.parse(await fs.readFile(join(state, "runtime.json"), "utf8"));
    process.kill(runtime.pid, 0);
    run("php", ["artisan", "sync:dev", "pair"], runtime.backend ?? backend, runtime.env);
    return;
  }

  const lock = await fs.open(join(state, "running.lock"), "wx", 0o600).catch(error => {
    if (error.code === "EEXIST") {
      throw new Error(`State is locked: ${state}. Check its running process before removing a stale lock.`);
    }
    throw error;
  });
  await lock.writeFile(String(process.pid));
  await lock.close();
  const children = new Set();
  let socketDir;
  let proxyServer;
  let interrupted = false;
  let wake;
  const stopped = new Promise(resolveStop => { wake = resolveStop; });
  const stop = () => { interrupted = true; wake(); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    if (!values.test || values.smoke || values.native) await ensureFreePort(port);
    const pg = name => values["postgres-bin"] ? join(values["postgres-bin"], name) : name;
    for (const executable of ["php", pg("initdb"), pg("postgres"), pg("pg_isready")]) {
      run(executable, ["--version"], backend, process.env, "ignore");
    }
    socketDir = await fs.mkdtemp(join(tmpdir(), "midori-sync-pg-"));
    for (const path of ["env", "cache", "logs", "storage/framework/cache/data", "storage/framework/sessions", "storage/framework/views", "storage/logs", "storage/app/private"]) {
      await fs.mkdir(join(state, path), { recursive: true, mode: 0o700 });
    }
    const keyPath = join(state, "app-key");
    let key;
    try {
      key = await fs.readFile(keyPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      key = `base64:${randomBytes(32).toString("base64")}`;
      await fs.writeFile(keyPath, key, { mode: 0o600, flag: "wx" });
    }
    await fs.writeFile(join(state, "env", ".env"), "# Isolated local Sync environment\n", { mode: 0o600 });
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_.*|TZ|TMPDIR|LD_LIBRARY_PATH|DYLD_LIBRARY_PATH|DISPLAY|WAYLAND_DISPLAY|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS)$/.test(name)));
    Object.assign(env, {
      APP_ENV: values.test ? "testing" : "local", APP_KEY: key, APP_DEBUG: "false",
      APP_URL: `http://localhost:${port}`, SYNC_LOCAL_DEV: "true",
      MIDORI_SYNC_DEV_ENV_DIR: join(state, "env"), LARAVEL_STORAGE_PATH: join(state, "storage"),
      APP_CONFIG_CACHE: join(state, "cache/config.php"), APP_ROUTES_CACHE: join(state, "cache/routes.php"),
      APP_SERVICES_CACHE: join(state, "cache/services.php"), APP_PACKAGES_CACHE: join(state, "cache/packages.php"),
      APP_EVENTS_CACHE: join(state, "cache/events.php"),
      DB_CONNECTION: "pgsql", DB_HOST: socketDir, DB_PORT: "55439", DB_URL: "",
      DB_DATABASE: values.test ? "midori_sync_test" : "midori_sync_dev",
      DB_USERNAME: "midori_sync_local", DB_PASSWORD: "",
      CACHE_STORE: "database", SESSION_DRIVER: "file", QUEUE_CONNECTION: values.test ? "sync" : "database", MAIL_MAILER: "array",
      AUTHENTIK_BASE_URL: "", AUTHENTIK_CLIENT_ID: "", AUTHENTIK_CLIENT_SECRET: "",
    });
    if (values.test) Object.assign(env, { CACHE_STORE: "array", SESSION_DRIVER: "array" });

    const data = join(state, "postgres");
    try {
      await fs.access(join(data, "PG_VERSION"));
    } catch {
      run(pg("initdb"), ["-D", data, "--auth-local=trust", "--auth-host=reject", "--username=midori_sync_local", "--no-locale", "--encoding=UTF8"], backend, env);
    }
    const postgres = launch(pg("postgres"), ["-D", data, "-k", socketDir, "-p", "55439", "-c", "listen_addresses=", "-c", "logging_collector=off"], env, join(state, "logs/postgres.log"));
    await until(async () => {
      if (postgres.exitCode !== null || postgres.signalCode !== null || postgres.spawnError) throw new Error(`PostgreSQL failed; see ${state}/logs/postgres.log`);
      return spawnSync(pg("pg_isready"), ["-h", socketDir, "-p", "55439", "-U", "midori_sync_local", "-d", "postgres"], { env, stdio: "ignore" }).status === 0;
    });
    run("php", ["artisan", "sync:dev", "prepare", "--create-database"], backend, env);
    if (interrupted) return;

    if (values.test && !values.native) {
      const output = join(state, "logs/php-tests.log");
      process.stdout.write(`Running Artisan tests on isolated PostgreSQL; log: ${output}\n`);
      const fd = openSync(output, "w", 0o600);
      try {
        run("php", ["artisan", "test", ...(values.filter === undefined ? [] : ["--filter", values.filter])], backend, env, ["ignore", fd, fd], 900000);
      } finally {
        closeSync(fd);
      }
      process.stdout.write(`Tests passed. Evidence: ${output}\n`);
      if (!values.smoke) return;
    }

    const worker = values.test ? null : launch("php", ["artisan", "queue:work", "database", "--queue=default", "--sleep=1", "--tries=3", "--backoff=60"], env, join(state, "logs/queue.log"));
    let apiPort;
    do {
      apiPort = await freePort();
    } while (apiPort === port);
    let notificationPort;
    do {
      notificationPort = await freePort();
    } while (notificationPort === apiPort || notificationPort === port);
    const notifications = launch("php", ["artisan", "sync:notifications", `--port=${notificationPort}`], env,
      join(state, "logs/notifications.log"));
    await until(async () => {
      if (notifications.exitCode !== null || notifications.signalCode !== null || notifications.spawnError) {
        throw new Error(`Notification service failed; see ${state}/logs/notifications.log`);
      }
      return canConnect(notificationPort);
    });
    const api = launch("php", ["artisan", "serve", "--host=127.0.0.1", `--port=${apiPort}`, "--tries=1", "--no-reload"], env,
      join(state, "logs/api.log"));
    proxyServer = createHttpServer((incoming, outgoing) => {
      const targetPort = incoming.url?.startsWith("/api/v1/sync/notifications/stream") ? notificationPort : apiPort;
      let upstream;
      let closed = false;
      incoming.on("aborted", () => upstream?.destroy());
      outgoing.on("close", () => { closed = true; upstream?.destroy(); });
      const forward = () => {
        if (closed) return;
        upstream = httpRequest({ hostname: "127.0.0.1", port: targetPort, method: incoming.method, path: incoming.url,
          headers: { ...incoming.headers, host: `localhost:${port}` } }, response => {
          outgoing.writeHead(response.statusCode, response.headers);
          if (oneWayDelayMs === 0) {
            response.pipe(outgoing);
          } else {
            response.pipe(new Transform({
              transform(chunk, _encoding, callback) {
                setTimeout(() => callback(null, chunk), oneWayDelayMs);
              },
            })).pipe(outgoing);
          }
        });
        upstream.on("error", () => {
          if (!outgoing.headersSent) outgoing.writeHead(502);
          outgoing.end();
        });
        incoming.pipe(upstream);
      };
      if (oneWayDelayMs === 0) forward();
      else setTimeout(forward, oneWayDelayMs);
    });
    await new Promise((resolveListen, reject) => {
      proxyServer.once("error", reject);
      proxyServer.listen(port, "127.0.0.1", resolveListen);
    });
    await until(async () => {
      if (api.exitCode !== null || api.signalCode !== null || api.spawnError) throw new Error(`API failed; see ${state}/logs/api.log`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/capabilities`, { signal: AbortSignal.timeout(500) });
        return response.ok && (await response.json()).protocol === "MSP";
      } catch {
        return false;
      }
    });
    if (values.smoke) {
      const prepared = spawnSync("php", ["artisan", "sync:dev", "prepare", "--json"], { cwd: backend, env, encoding: "utf8", timeout: 60000 });
      if (prepared.status !== 0) throw new Error("Artisan could not prepare HTTP smoke fixtures.");
      await smokeAPI(port, JSON.parse(prepared.stdout));
      process.stdout.write("HTTP smoke passed: two devices, pairing, notifications, journal, replay, acknowledgement, and session revocation.\n");
      return;
    }
    if (values.native) {
      const prepared = spawnSync("php", ["artisan", "sync:dev", "prepare", "--json"], { cwd: backend, env, encoding: "utf8", timeout: 60000 });
      if (prepared.status !== 0) throw new Error("Artisan could not prepare native test fixtures.");
      const fixturePath = join(state, "native-fixture.json");
      await fs.writeFile(fixturePath, JSON.stringify({ baseURL: `${env.APP_URL}/`, ...JSON.parse(prepared.stdout) }), { mode: 0o600 });
      if (!values["profiles-only"]) {
        const log = join(state, "logs/native-tests.log");
        process.stdout.write(`Running Gecko against local Laravel and PostgreSQL; log: ${log}\n`);
        const native = launch("bash", [join(root, "scripts/test-sync-native.sh"), "backend"], {
          ...process.env, MIDORI_SYNC_TEST_FIXTURE: fixturePath,
        }, log);
        await Promise.race([exited(native), stopped]);
        if (interrupted) return;
        if (native.exitCode !== 0) throw new Error(`Native integration tests failed; see ${log}`);
        process.stdout.write(`Native integration passed: two isolated local vaults, recovery, V2 records and session revocation. Evidence: ${log}\n`);
      }
      const profileCodes = spawnSync("php", ["artisan", "sync:dev", "prepare", "--json", "--fixture=native-profiles"],
        { cwd: backend, env, encoding: "utf8", timeout: 60000 });
      if (profileCodes.status !== 0) throw new Error("Artisan could not prepare isolated native profile fixtures.");
      const backgroundCodes = spawnSync("php", ["artisan", "sync:dev", "pair", "--json", "--fixture=native-profiles"],
        { cwd: backend, env, encoding: "utf8", timeout: 60000 });
      if (backgroundCodes.status !== 0) throw new Error("Artisan could not prepare the background Sync device fixture.");
      const restoreCodes = spawnSync("php", ["artisan", "sync:dev", "pair", "--json", "--fixture=native-profiles"],
        { cwd: backend, env, encoding: "utf8", timeout: 60000 });
      if (restoreCodes.status !== 0) throw new Error("Artisan could not prepare the fresh-profile restore fixture.");
      const mergeCodes = spawnSync("php", ["artisan", "sync:dev", "pair", "--json", "--fixture=native-profiles"],
        { cwd: backend, env, encoding: "utf8", timeout: 60000 });
      if (mergeCodes.status !== 0) throw new Error("Artisan could not prepare the existing-profile merge fixture.");
      const profileFixturePath = join(state, "native-profiles-fixture.json");
      const profileFixture = JSON.parse(profileCodes.stdout);
      profileFixture.profiles.BG = JSON.parse(backgroundCodes.stdout).profiles.A;
      profileFixture.profiles.G = JSON.parse(restoreCodes.stdout).profiles.A;
      profileFixture.profiles.H = JSON.parse(mergeCodes.stdout).profiles.A;
      await fs.writeFile(profileFixturePath,
        JSON.stringify({ baseURL: `${env.APP_URL}/`, ...profileFixture }), { mode: 0o600 });
      const profileLog = join(state, "logs/native-profiles.log");
      process.stdout.write(`Running two separate Gecko profiles against local Laravel; log: ${profileLog}\n`);
      const profiles = launch("bash", [join(root, "scripts/test-sync-native.sh"), "profiles"], {
        ...process.env, MIDORI_SYNC_TEST_FIXTURE: profileFixturePath, MIDORI_SYNC_TEST_RTT_MS: String(rttMs),
      }, profileLog);
      await Promise.race([exited(profiles), stopped]);
      if (interrupted) return;
      if (profiles.exitCode !== 0) throw new Error(`Native profile integration failed; see ${profileLog}`);
      process.stdout.write(`Native profile integration passed: G restored a fresh profile and H merged an existing profile with remote browser data in the background. Evidence: ${profileLog}\n`);
      return;
    }
    await fs.writeFile(join(state, "runtime.json"), JSON.stringify({ pid: process.pid, backend, env }), { mode: 0o600 });
    const pairCommand = `npm run dev:sync -- --pair --state-dir '${state.replaceAll("'", "'\\''")}'`;
    process.stdout.write(`Midori Sync: http://localhost:${port}\nNew pairing codes: ${pairCommand}\nState: ${state}\nCtrl+C stops the proxy, API, notification service, queue worker and PostgreSQL; data is retained.\n`);
    if (values["open-profiles"]) {
      for (const name of ["A", "B"]) {
        const profile = join(state, "profiles", name);
        await fs.mkdir(profile, { recursive: true, mode: 0o700 });
        const serverConfig = JSON.stringify({ baseURL: env.APP_URL, allowLocalHTTP: true });
        await fs.writeFile(join(profile, "user.js"),
          `user_pref("midori.sync.enabled", true);\nuser_pref("midori.sync.serverConfig", ${JSON.stringify(serverConfig)});\n`);
        launch(resolve(values.browser), ["-no-remote", "-profile", profile, "about:blank"], env, join(state, `logs/browser-${name}.log`));
      }
    }
    await Promise.race([stopped, exited(api), exited(notifications), exited(postgres), ...(worker ? [exited(worker)] : [])]);
    if (!interrupted) throw new Error(`A local service exited unexpectedly; inspect ${state}/logs.`);
  } finally {
    if (proxyServer) {
      proxyServer.closeAllConnections();
      await new Promise(resolveClose => proxyServer.close(resolveClose));
    }
    for (const child of [...children].reverse()) {
      child.kill("SIGTERM");
      let timer;
      await Promise.race([exited(child), new Promise(resolveWait => { timer = setTimeout(resolveWait, 12000); })]);
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited(child);
      }
    }
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await fs.unlink(join(state, "runtime.json")).catch(() => {});
    await fs.unlink(join(state, "running.lock"));
    if (socketDir) await fs.rmdir(socketDir).catch(() => {});
  }

  function launch(command, args, env, log) {
    const fd = openSync(log, "a", 0o600);
    const child = spawn(command, args, { cwd: backend, env, stdio: ["ignore", fd, fd] });
    closeSync(fd);
    children.add(child);
    child.once("error", error => { child.spawnError = error; });
    child.once("exit", () => children.delete(child));
    return child;
  }

  async function until(predicate) {
    const deadline = Date.now() + 15000;
    while (!interrupted && Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise(resolveWait => setTimeout(resolveWait, 200));
    }
    throw new Error(interrupted ? "Local startup cancelled." : "Local service startup timed out.");
  }
}

function run(command, args, cwd, env, stdio = "inherit", timeout = 60000) {
  const result = spawnSync(command, args, { cwd, env, stdio, timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed with exit ${result.status}.`);
}

function exited(child) {
  if (child.exitCode !== null || child.signalCode !== null || child.spawnError) return Promise.resolve();
  return new Promise(resolveExit => {
    child.once("exit", resolveExit);
    child.once("error", resolveExit);
  });
}

async function ensureFreePort(port) {
  const server = createTcpServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  await new Promise(resolveClose => server.close(resolveClose));
}

async function freePort() {
  const server = createTcpServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}

async function canConnect(port) {
  return new Promise(resolveConnect => {
    const socket = connectTcp(port, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); resolveConnect(true); });
    socket.once("error", () => resolveConnect(false));
  });
}

async function smokeAPI(port, fixture) {
  const base = `http://127.0.0.1:${port}`;
  async function request(path, { method = "GET", body, token, status = 200 } = {}) {
    const response = await fetch(base + path, {
      method, redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, status, `${method} ${path}`);
    return status === 204 ? null : response.json();
  }
  const a = await request("/api/v1/pair/redeem", { method: "POST", status: 201, body: { pairing_token: fixture.profiles.A.pairing_token, device_name: "Smoke A" } });
  const b = await request("/api/v1/pair/redeem", { method: "POST", status: 201, body: { pairing_token: fixture.profiles.B.pairing_token, device_name: "Smoke B" } });
  assert.equal(a.user.id, b.user.id);
  assert.notEqual(a.device.id, b.device.id);
  await request("/api/v1/pair/redeem", { method: "POST", status: 404, body: { pairing_token: fixture.profiles.A.pairing_token, device_name: "Replay" } });
  const collection = "/api/v1/sync/collections/bookmarks";
  const initial = await request(`${collection}/changes`, { token: a.token });
  const notification = await request("/api/v1/sync/notifications/ticket", { method: "POST", token: b.token });
  const streamAbort = new AbortController();
  const streamTimeout = setTimeout(() => streamAbort.abort(), 10000);
  const streamResponse = await fetch(`${base}/api/v1/sync/notifications/stream`, {
    headers: { Authorization: `MidoriNotification ${notification.ticket}` },
    signal: streamAbort.signal,
  });
  assert.equal(streamResponse.status, 200);
  const streamReader = streamResponse.body.getReader();
  let streamText = "";
  while (!streamText.includes(": connected")) {
    const next = await streamReader.read();
    assert.equal(next.done, false);
    streamText += new TextDecoder().decode(next.value);
  }
  const replayStream = await fetch(`${base}/api/v1/sync/notifications/stream`, {
    headers: { Authorization: `MidoriNotification ${notification.ticket}` }, signal: AbortSignal.timeout(10000),
  });
  assert.equal(replayStream.status, 401);
  const operation = { operation_id: randomUUID(), id: randomUUID(), base_revision: "0", payload: Buffer.from("synthetic protocol fixture").toString("base64") };
  const body = { generation: initial.generation, operations: [operation] };
  const applied = await request(`${collection}/operations`, { method: "POST", body, token: a.token });
  assert.equal(applied.results[0].status, "applied");
  while (!streamText.includes("event: changed")) {
    const next = await streamReader.read();
    assert.equal(next.done, false);
    streamText += new TextDecoder().decode(next.value);
  }
  assert(!streamText.includes(a.user.id));
  streamAbort.abort();
  clearTimeout(streamTimeout);
  const retry = await request(`${collection}/operations`, { method: "POST", body, token: a.token });
  assert.deepEqual(retry, applied);
  const received = await request(`${collection}/changes`, { token: b.token });
  assert(received.changes.some(change => change.record.id === operation.id));
  await request(`${collection}/ack`, { method: "POST", body: { cursor: received.next_cursor }, token: b.token });
  await request("/api/v1/auth/token", { method: "DELETE", token: a.token, status: 204 });
  await request(`${collection}/changes`, { token: a.token, status: 401 });
}

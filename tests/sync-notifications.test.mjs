import assert from "node:assert/strict";
import test from "node:test";
import { MidoriSyncNotifications } from "../src/browser/components/sync/MidoriSyncNotifications.sys.mjs";

const ticket = "a".repeat(64);
const server = { baseURL: "http://localhost:8000/", requiresLoopbackTransport: true };
const response = () => ({ data: { version: 1, ticket, expires_at: new Date(Date.now() + 30000).toISOString() } });

test("a changed event wakes Sync and Link without exposing the bearer session", async () => {
  const calls = [];
  let release;
  const watcher = new MidoriSyncNotifications({
    server,
    requestTicket: async signal => { calls.push(["ticket", signal]); return response(); },
    transportFactory: (url, options) => {
      calls.push(["transport", url, options]);
      return {
        watchNotifications(value, options) {
          calls.push(["watch", value]);
          options.onConnected();
          options.onChange();
          return new Promise(resolve => { release = resolve; });
        },
        close() { calls.push(["close"]); },
      };
    },
    onChange: () => calls.push(["changed"]),
  });
  watcher.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.map(call => call[0]), ["ticket", "transport", "watch", "changed"]);
  assert.deepEqual(calls[1], ["transport", server.baseURL, { allowLocalHTTP: true }]);
  assert.equal(calls[2][1], ticket);
  assert.equal(watcher.snapshot.connected, true);
  watcher.close();
  assert.equal(watcher.snapshot.connected, false);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.map(call => call[0]), ["ticket", "transport", "watch", "changed", "close", "close"]);
});

test("normal stream closure obtains a fresh ticket and disconnect stops retries", async () => {
  const calls = [];
  const timers = new Map();
  let nextTimer = 0;
  const watcher = new MidoriSyncNotifications({
    server,
    requestTicket: async () => { calls.push("ticket"); return response(); },
    transportFactory: () => ({
      watchNotifications: async () => { calls.push("watch"); },
      close: () => calls.push("close"),
    }),
    onChange: () => {},
    setTimer: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, [() => { timers.delete(id); callback(); }, delay]);
      return id;
    },
    clearTimer: id => timers.delete(id),
  });
  watcher.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ["ticket", "watch", "close"]);
  assert.equal(timers.get(1)[1], 1000);
  timers.get(1)[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ["ticket", "watch", "close", "ticket", "watch", "close"]);
  watcher.close();
  assert.equal(timers.size, 0);
});

test("an unsupported server waits for the regular fallback poll", async () => {
  const delays = [];
  const watcher = new MidoriSyncNotifications({
    server,
    requestTicket: async () => { throw Object.assign(new Error("unsupported"), { status: 404 }); },
    transportFactory: () => { throw new Error("transport must not start"); },
    onChange: () => {},
    setTimer: (_callback, delay) => { delays.push(delay); return 1; },
    clearTimer: () => {},
  });
  watcher.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(delays, [15 * 60000]);
  watcher.close();
});

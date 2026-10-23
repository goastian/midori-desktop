import assert from "node:assert/strict";
import test from "node:test";
import { MidoriSyncScheduler, canScheduleSync } from "../src/browser/components/sync/MidoriSyncScheduler.sys.mjs";

function fixture(run = async () => ({ errors: {}, more: false })) {
  const state = { now: 100000, nextId: 0, timers: new Map(), calls: 0 };
  const scheduler = new MidoriSyncScheduler({
    run: async options => { ++state.calls; return run(options); },
    now: () => state.now, random: () => 0,
    setTimer(callback, delay) {
      const id = ++state.nextId;
      state.timers.set(id, { callback, due: state.now + delay });
      return id;
    },
    clearTimer(id) { state.timers.delete(id); },
  });
  const fire = async () => {
    assert.equal(state.timers.size, 1);
    const [id, timer] = [...state.timers][0];
    state.timers.delete(id);
    state.now = timer.due;
    await timer.callback();
  };
  return { state, scheduler, fire };
}

test("background sync needs the feature flag, an unlocked account and ready keys", () => {
  const ready = { enabled: true, backgroundEnabled: true,
    account: { status: "connected" }, keys: { status: "ready" } };
  assert.equal(canScheduleSync(ready), true);
  assert.equal(canScheduleSync({ ...ready, account: { status: "renewal-required" } }), true);
  assert.equal(canScheduleSync({ ...ready, account: { status: "local" }, keys: { status: "ready", localOnly: true } }), true);
  assert.equal(canScheduleSync({ ...ready, account: { status: "local" } }), false);
  assert.equal(canScheduleSync({ ...ready, keys: { status: "ready", localOnly: true } }), false);
  for (const changes of [{ enabled: false }, { backgroundEnabled: false },
    { account: { status: "signed-out" } }, { account: { status: "locked" } },
    { keys: { status: "locked" } }, { keys: { status: "recovery-required" } }]) {
    assert.equal(canScheduleSync({ ...ready, ...changes }), false);
  }
});

test("availability, hints and manual completion use one bounded timer", async () => {
  const { state, scheduler, fire } = fixture();
  assert.equal(state.timers.size, 0);
  scheduler.setAvailable(true);
  assert.equal(scheduler.snapshot.nextRunAt, 101000);
  scheduler.hint();
  assert.equal(scheduler.snapshot.nextRunAt, 101000);
  state.now += 1000;
  for (let index = 0; index < 100; index++) {
    scheduler.hint();
  }
  assert.equal(state.timers.size, 1);
  assert.equal(scheduler.snapshot.nextRunAt, 101000);
  await fire();
  assert.equal(state.calls, 1);
  assert.equal(scheduler.snapshot.nextRunAt, 401000);
  scheduler.manualCompleted();
  assert.equal(state.timers.size, 1);
  scheduler.setAvailable(false);
  assert.equal(state.timers.size, 0);
  scheduler.close();
});

test("a manual pass with pending inventory resumes promptly", () => {
  const { state, scheduler } = fixture();
  scheduler.setAvailable(true);
  scheduler.manualCompleted({ more: true });
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 5000);
  assert.equal(state.timers.size, 1);
  scheduler.close();
});

test("a requested pause or selection change resumes without network-error backoff", async () => {
  for (const code of ["cancelled", "sync_paused", "collection_disabled"]) {
    const { state, scheduler, fire } = fixture(async () => { throw Object.assign(new Error(code), { code }); });
    scheduler.setAvailable(true);
    await fire();
    assert.equal(scheduler.snapshot.retryAt, 0);
    assert.equal(scheduler.snapshot.nextRunAt, state.now + 5000);
    assert.equal(state.timers.size, 1);
    scheduler.close();
  }
});

test("more work and hints during a run continue without overlap", async () => {
  let release;
  const { state, scheduler, fire } = fixture(() => new Promise(resolve => { release = resolve; }));
  scheduler.setAvailable(true);
  const running = fire();
  assert.equal(scheduler.snapshot.running, true);
  assert.equal(state.timers.size, 0);
  scheduler.hint();
  scheduler.hint({ urgent: true });
  release({ errors: {}, more: true });
  await running;
  assert.equal(state.calls, 1);
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 1000);
  scheduler.close();
});

test("disabled local form autocomplete does not delay remaining history pages", async () => {
  const { state, scheduler, fire } = fixture(async () => ({
    collections: { history: { more: true } }, errors: { "form-history": "form_history_disabled" }, more: true,
  }));
  scheduler.setAvailable(true);
  for (let pass = 0; pass < 3; ++pass) {
    await fire();
    assert.equal(scheduler.snapshot.retryAt, 0);
    assert.equal(scheduler.snapshot.nextRunAt, state.now + 5000);
  }
  scheduler.close();
});

test("urgent data changes advance the next cycle without shortening idle polling", async () => {
  const { state, scheduler, fire } = fixture();
  scheduler.setAvailable(true);
  await fire();
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 300000);
  scheduler.hint();
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 5000);
  scheduler.hint({ urgent: true });
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 1000);
  await fire();
  assert.equal(state.calls, 2);
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 300000);
  scheduler.close();
});

test("remote errors back off and hints cannot bypass retry time", async () => {
  const { state, scheduler, fire } = fixture(async () => ({ errors: { bookmarks: "offline" }, more: false }));
  scheduler.setAvailable(true);
  await fire();
  assert.equal(scheduler.snapshot.retryAt, state.now + 30000);
  assert.equal(scheduler.snapshot.nextRunAt, scheduler.snapshot.retryAt, "A retry does not wait for another hint or the idle poll");
  scheduler.hint();
  assert.equal(scheduler.snapshot.nextRunAt, scheduler.snapshot.retryAt);
  scheduler.hint({ urgent: true });
  assert.equal(scheduler.snapshot.nextRunAt, scheduler.snapshot.retryAt);
  await fire();
  assert.equal(scheduler.snapshot.retryAt, state.now + 60000);
  scheduler.close();
});

test("one failing collection cannot delay successful collections beyond the normal poll", async () => {
  const { state, scheduler, fire } = fixture(async () => ({
    collections: { history: {}, passwords: {} }, errors: { bookmarks: "invalid_record" }, more: false,
  }));
  scheduler.setAvailable(true);
  for (let attempt = 0; attempt < 6; attempt++) {
    await fire();
  }
  assert.equal(scheduler.snapshot.retryAt, state.now + 300000);
  scheduler.close();
});

test("a transient busy account retries promptly without exponential backoff", async () => {
  let busy = true;
  const { state, scheduler, fire } = fixture(async () =>
    busy ? { errors: { bookmarks: "busy", history: "busy" }, more: false } :
      { errors: {}, more: false });
  scheduler.setAvailable(true);
  await fire();
  assert.equal(scheduler.snapshot.retryAt, 0);
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 5000);
  busy = false;
  await fire();
  assert.equal(state.calls, 2);
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 300000);
  scheduler.close();
});

test("server retry-after takes precedence over local backoff", async () => {
  const { state, scheduler, fire } = fixture(async () =>
    ({ errors: { history: "rate_limited" }, retryAfter: 120, more: false }));
  scheduler.setAvailable(true);
  await fire();
  assert.equal(scheduler.snapshot.retryAt, state.now + 120000);
  assert.equal(scheduler.snapshot.nextRunAt, scheduler.snapshot.retryAt);
  scheduler.hint();
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 120000);
  scheduler.close();
});

test("locked password and card stores leave other collections on the normal schedule", async () => {
  const { state, scheduler, fire } = fixture(async () => ({
    errors: { passwords: "passwords_locked", "credit-cards": "cards_locked" }, more: false,
  }));
  scheduler.setAvailable(true);
  await fire();
  assert.equal(state.calls, 1);
  assert.equal(scheduler.snapshot.retryAt, 0);
  assert.equal(scheduler.snapshot.nextRunAt, state.now + 300000);
  scheduler.close();
});

test("startup and periodic passes inventory local data while change hints stay incremental", async () => {
  const passes = [];
  const { state, scheduler, fire } = fixture(async options => {
    passes.push(options);
    return { errors: {}, more: false };
  });
  scheduler.setAvailable(true);
  await fire();
  assert.deepEqual(passes, [{ inventory: true }]);
  scheduler.hint({ urgent: true });
  await fire();
  assert.deepEqual(passes.at(-1), { inventory: false });
  while (state.now < 1001000) {
    await fire();
  }
  assert.deepEqual(passes.at(-1), { inventory: true });
  scheduler.close();
});

test("suspension and close discard stale callbacks", async () => {
  const { state, scheduler } = fixture();
  scheduler.setAvailable(true);
  const stale = [...state.timers.values()][0].callback;
  scheduler.setAvailable(false);
  scheduler.setAvailable(true);
  await stale();
  assert.equal(state.calls, 0);
  assert.equal(state.timers.size, 1);
  scheduler.close();
  assert.equal(state.timers.size, 0);
  scheduler.setAvailable(true);
  scheduler.hint();
  assert.equal(state.timers.size, 0);
});

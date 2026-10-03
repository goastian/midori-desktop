/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const INITIAL_DELAY_MS = 1000;
const HINT_DELAY_MS = 5000;
const URGENT_HINT_DELAY_MS = 1000;
const CONTINUE_DELAY_MS = 5000;
const POLL_DELAY_MS = 5 * 60000;
const INVENTORY_INTERVAL_MS = 15 * 60000;
const RETRY_DELAY_MS = 30000;
const MAX_RETRY_MS = 60 * 60000;

export function canScheduleSync({ enabled, backgroundEnabled, account, keys }) {
  return enabled === true && backgroundEnabled === true &&
    ["connected", "renewal-required"].includes(account?.status) && keys?.status === "ready";
}

export class MidoriSyncScheduler {
  #run;
  #now;
  #random;
  #setTimer;
  #clearTimer;
  #available = false;
  #closed = false;
  #running = false;
  #hintedDelay = null;
  #timer = null;
  #nextRunAt = null;
  #retryAt = 0;
  #failures = 0;
  #version = 0;
  #inventoryDueAt = 0;

  constructor({ run, now = Date.now, random = Math.random, setTimer, clearTimer }) {
    this.#run = run;
    this.#now = now;
    this.#random = random;
    this.#setTimer = setTimer;
    this.#clearTimer = clearTimer;
  }

  get snapshot() {
    return Object.freeze({ available: this.#available, running: this.#running,
      nextRunAt: this.#nextRunAt, retryAt: this.#retryAt, closed: this.#closed });
  }

  setAvailable(value) {
    if (this.#closed) {
      return;
    }
    const available = value === true;
    if (this.#available === available) {
      return;
    }
    this.#available = available;
    if (!available) {
      this.#cancelTimer();
    } else if (!this.#running) {
      this.#schedule(this.#now() + INITIAL_DELAY_MS);
    }
  }

  hint({ urgent = false } = {}) {
    if (this.#closed) {
      return;
    }
    const delay = urgent ? URGENT_HINT_DELAY_MS : HINT_DELAY_MS;
    if (this.#running) {
      this.#hintedDelay = Math.min(this.#hintedDelay ?? delay, delay);
    } else if (this.#available) {
      this.#schedule(this.#now() + delay);
    }
  }

  manualCompleted({ more = false } = {}) {
    if (this.#closed || !this.#available || this.#running) {
      return;
    }
    this.#failures = 0;
    this.#retryAt = 0;
    this.#inventoryDueAt = this.#now() + INVENTORY_INTERVAL_MS;
    this.#cancelTimer();
    this.#schedule(this.#now() + (more ? CONTINUE_DELAY_MS : POLL_DELAY_MS));
  }

  close() {
    this.#closed = true;
    this.#available = false;
    this.#cancelTimer();
  }

  #cancelTimer() {
    ++this.#version;
    if (this.#timer !== null) {
      this.#clearTimer(this.#timer);
      this.#timer = null;
    }
    this.#nextRunAt = null;
  }

  #schedule(due) {
    if (this.#closed || !this.#available || this.#running) {
      return;
    }
    const now = this.#now();
    if (!Number.isSafeInteger(now) || now < 0) {
      return;
    }
    due = Math.max(due, this.#retryAt, now + 1000);
    if (this.#timer !== null && this.#nextRunAt <= due && this.#nextRunAt >= this.#retryAt) {
      return;
    }
    this.#cancelTimer();
    this.#nextRunAt = due;
    const version = this.#version;
    this.#timer = this.#setTimer(() => {
      if (version !== this.#version) {
        return;
      }
      this.#timer = null;
      this.#nextRunAt = null;
      return this.#drain();
    }, Math.min(2147483647, due - now));
  }

  async #drain() {
    if (this.#closed || !this.#available || this.#running) {
      return;
    }
    if (this.#retryAt > this.#now()) {
      this.#schedule(this.#retryAt);
      return;
    }
    this.#running = true;
    let more = false;
    let serverRetryAfter = 0;
    let retryCap = MAX_RETRY_MS;
    const inventory = this.#now() >= this.#inventoryDueAt;
    if (inventory) {
      this.#inventoryDueAt = this.#now() + INVENTORY_INTERVAL_MS;
    }
    try {
      const result = await this.#run({ inventory });
      const errors = Object.entries(result?.errors ?? {}).filter(([name, code]) =>
        !(name === "passwords" && code === "passwords_locked") &&
        !(name === "credit-cards" && code === "cards_locked"));
      if (errors.length && errors.every(([, code]) => code === "busy")) {
        this.#failures = 0;
        this.#retryAt = 0;
        more = true;
        return;
      }
      if (errors.length) {
        serverRetryAfter = Number.isInteger(result.retryAfter) && result.retryAfter > 0 ?
          Math.min(result.retryAfter, 86400) * 1000 : 0;
        if (Object.keys(result.collections ?? {}).length) {
          retryCap = POLL_DELAY_MS;
        }
        throw new Error("sync_partial_failure");
      }
      this.#failures = 0;
      this.#retryAt = 0;
      more = result?.more === true;
    } catch {
      if (inventory) {
        this.#inventoryDueAt = 0;
      }
      const base = Math.min(retryCap, RETRY_DELAY_MS * 2 ** Math.min(this.#failures++, 7));
      this.#retryAt = this.#now() + Math.max(serverRetryAfter, base + Math.floor(base * 0.25 * this.#random()));
    } finally {
      this.#running = false;
      const delay = this.#hintedDelay ?? (more ? CONTINUE_DELAY_MS : POLL_DELAY_MS);
      this.#hintedDelay = null;
      this.#schedule(this.#now() + delay);
    }
  }
}

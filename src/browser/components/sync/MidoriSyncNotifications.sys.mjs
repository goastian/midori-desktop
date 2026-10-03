/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const TICKET = /^[0-9a-f]{64}$/;

export class MidoriSyncNotifications {
  #server;
  #requestTicket;
  #transportFactory;
  #onChange;
  #setTimer;
  #clearTimer;
  #controller = new AbortController();
  #transport = null;
  #timer = null;
  #wake = null;
  #task = null;
  #closed = false;
  #connected = false;

  constructor({ server, requestTicket, transportFactory, onChange,
    setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.#server = server;
    this.#requestTicket = requestTicket;
    this.#transportFactory = transportFactory;
    this.#onChange = onChange;
    this.#setTimer = setTimer;
    this.#clearTimer = clearTimer;
  }

  start() {
    if (!this.#task && !this.#closed) {
      this.#task = this.#run();
    }
  }

  get snapshot() {
    return Object.freeze({ active: !this.#closed, connected: this.#connected });
  }

  close() {
    this.#closed = true;
    this.#connected = false;
    this.#controller.abort();
    this.#transport?.close();
    if (this.#timer !== null) {
      this.#clearTimer(this.#timer);
      this.#timer = null;
    }
    this.#wake?.();
    this.#wake = null;
  }

  async #run() {
    let failures = 0;
    while (!this.#closed) {
      let delay = 1000;
      try {
        const response = await this.#requestTicket(this.#controller.signal);
        const ticket = response?.data;
        if (ticket?.version !== 1 || !TICKET.test(ticket.ticket) ||
            !Number.isFinite(Date.parse(ticket.expires_at)) || Date.parse(ticket.expires_at) <= Date.now()) {
          throw new Error("invalid_notification_ticket");
        }
        if (this.#closed) {
          return;
        }
        this.#transport = this.#transportFactory(this.#server.baseURL,
          { allowLocalHTTP: this.#server.requiresLoopbackTransport });
        await this.#transport.watchNotifications(ticket.ticket, {
          onConnected: () => { this.#connected = !this.#closed; },
          onChange: () => {
            if (!this.#closed) {
              this.#onChange();
            }
          },
          signal: this.#controller.signal,
        });
        failures = 0;
      } catch (error) {
        if (this.#closed || error?.code === "cancelled") {
          return;
        }
        delay = [404, 405].includes(error?.status) ? 15 * 60000 :
          Math.min(60000, 1000 * 2 ** Math.min(++failures, 6));
      } finally {
        this.#connected = false;
        this.#transport?.close();
        this.#transport = null;
      }
      if (!this.#closed) {
        await new Promise(resolve => {
          this.#wake = resolve;
          this.#timer = this.#setTimer(resolve, delay);
        });
        this.#wake = null;
        this.#timer = null;
      }
    }
  }
}

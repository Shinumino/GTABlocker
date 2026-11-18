// A small client for Marionette, the automation protocol built into Firefox.
//
// Why not geckodriver or Selenium: Marionette is already inside the installed Firefox, so the
// macro tests drive the Firefox program the user has installed (the one the extension ships
// to), in a throwaway profile, with nothing extra downloaded. Playwright's Firefox is a patched build, not the one the user runs, and an unsigned
// download is likely blocked by Smart App Control on this machine.
//
// Wire format: every message is "<byte length>:<json>". The length counts UTF-8 BYTES, not
// characters, so the reader works on Buffers: a page title with an accent split across two TCP
// chunks would otherwise be decoded as garbage or cut at the wrong place.

import net from 'node:net';

// The longest length prefix we accept. Ten digits is already 10 GB; anything longer is not a
// Marionette frame, and failing at once beats buffering a broken stream forever.
const MAX_PREFIX_DIGITS = 10;

export function encodeMessage(value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  return Buffer.concat([Buffer.from(`${body.length}:`, 'ascii'), body]);
}

export class MessageReader {
  #pending = Buffer.alloc(0);

  // Feed one TCP chunk; get back every message it completed (zero, one or several).
  push(chunk) {
    this.#pending = Buffer.concat([this.#pending, chunk]);
    const messages = [];
    for (;;) {
      const colon = this.#pending.indexOf(0x3a);
      if (colon === -1) {
        if (this.#pending.length > MAX_PREFIX_DIGITS) {
          throw new Error('Marionette frame has no length prefix');
        }
        return messages;
      }
      const prefix = this.#pending.subarray(0, colon).toString('ascii');
      if (!/^\d+$/.test(prefix) || prefix.length > MAX_PREFIX_DIGITS) {
        throw new Error(`Marionette frame has a bad length prefix: ${JSON.stringify(prefix.slice(0, 20))}`);
      }
      const length = Number(prefix);
      const end = colon + 1 + length;
      if (this.#pending.length < end) return messages;
      const body = this.#pending.subarray(colon + 1, end).toString('utf8');
      this.#pending = this.#pending.subarray(end);
      messages.push(JSON.parse(body));
    }
  }
}

export class Marionette {
  #socket;
  #reader = new MessageReader();
  #nextId = 1;
  #waiting = new Map();
  #hello;
  #closedError = null;

  static async connect(port, { host = '127.0.0.1', timeoutMs = 10_000 } = {}) {
    const client = new Marionette();
    await client.#open(port, host, timeoutMs);
    return client;
  }

  #open(port, host, timeoutMs) {
    return new Promise((resolve, reject) => {
      // Settles once: the hello, an error, a close before the hello, or the timeout.
      let settled = false;
      const settle = (err, hello) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          this.#socket.destroy();
          reject(err);
        } else {
          resolve(hello);
        }
      };
      const timer = setTimeout(() => settle(new Error(`no Marionette hello within ${timeoutMs} ms`)), timeoutMs);
      this.#hello = (hello) => settle(null, hello);
      this.#socket = net.connect({ port, host });
      this.#socket.on('data', (chunk) => this.#onData(chunk));
      this.#socket.on('error', (err) => {
        this.#failAll(err);
        settle(err);
      });
      this.#socket.on('close', () => {
        this.#failAll(new Error('Marionette connection closed'));
        settle(new Error('Marionette closed the connection before its hello'));
      });
    });
  }

  #onData(chunk) {
    let messages;
    try {
      messages = this.#reader.push(chunk);
    } catch (err) {
      this.#failAll(err);
      this.#socket.destroy();
      return;
    }
    for (const message of messages) {
      if (this.#hello) {
        // The first message is the server's hello: {"applicationType":"gecko", ...}.
        const hello = this.#hello;
        this.#hello = null;
        hello(message);
        continue;
      }
      // A reply is [1, id, error, result]. Anything else means the stream is not what we think
      // it is; this runs in a socket event, where a throw would crash the whole test process.
      if (!Array.isArray(message) || message.length !== 4) {
        this.#failAll(new Error(`Marionette sent a frame that is not a reply: ${JSON.stringify(message).slice(0, 80)}`));
        this.#socket.destroy();
        return;
      }
      const [type, id, error, result] = message;
      const waiter = this.#waiting.get(id);
      if (type !== 1 || !waiter) continue;
      this.#waiting.delete(id);
      if (error) waiter.reject(new Error(`${waiter.command}: ${error.error}: ${error.message}`));
      else waiter.resolve(result);
    }
  }

  #failAll(err) {
    this.#closedError ??= err;
    for (const waiter of this.#waiting.values()) waiter.reject(err);
    this.#waiting.clear();
  }

  send(command, params = {}, { timeoutMs = 30_000 } = {}) {
    if (this.#closedError) return Promise.reject(this.#closedError);
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(id);
        reject(new Error(`${command}: no reply within ${timeoutMs} ms`));
      }, timeoutMs);
      this.#waiting.set(id, {
        command,
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      this.#socket.write(encodeMessage([0, id, command, params]));
    });
  }

  close() {
    this.#socket?.destroy();
  }
}

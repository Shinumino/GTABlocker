// The Marionette client against a fake Marionette server (a local TCP socket), so no Firefox
// is needed. Runs alone:
//   node --test tests/micro/marionette-client.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Marionette, MessageReader, encodeMessage } from '../support/marionette.mjs';

// A fake server: sends the hello (unless told not to), then hands each command to `onCommand`,
// which can answer with send() in any order.
async function fakeServer(onCommand, { hello = true } = {}) {
  const sockets = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    const reader = new MessageReader();
    const send = (value) => socket.write(encodeMessage(value));
    if (hello) send({ applicationType: 'gecko', marionetteProtocol: 3 });
    socket.on('data', (chunk) => {
      for (const message of reader.push(chunk)) onCommand(message, send, socket);
    });
    socket.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    close: () => { sockets.forEach((s) => s.destroy()); return new Promise((r) => server.close(r)); },
  };
}

test('replies reach the command they answer, even out of order', async () => {
  const held = [];
  const server = await fakeServer(([, id, command], send) => {
    held.push({ id, command, send });
    if (held.length === 2) {
      // Answer the second command first.
      held[1].send([1, held[1].id, null, { value: held[1].command }]);
      held[0].send([1, held[0].id, null, { value: held[0].command }]);
    }
  });
  const client = await Marionette.connect(server.port);
  try {
    const [a, b] = await Promise.all([client.send('First'), client.send('Second')]);
    assert.deepEqual([a.value, b.value], ['First', 'Second']);
  } finally {
    client.close();
    await server.close();
  }
});

test('an error reply rejects with the command and the error', async () => {
  const server = await fakeServer(([, id], send) => send([1, id, { error: 'no such element', message: 'gone' }, null]));
  const client = await Marionette.connect(server.port);
  try {
    await assert.rejects(client.send('WebDriver:FindElement'), /WebDriver:FindElement: no such element: gone/);
  } finally {
    client.close();
    await server.close();
  }
});

test('a connection that closes rejects every pending command, and later ones', async () => {
  const server = await fakeServer((message, send, socket) => socket.destroy());
  const client = await Marionette.connect(server.port);
  try {
    await assert.rejects(client.send('WebDriver:Navigate'), /closed/);
    await assert.rejects(client.send('WebDriver:Navigate'), /closed/);
  } finally {
    client.close();
    await server.close();
  }
});

test('a connection that closes before the hello fails at once, not at the timeout', async () => {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const started = Date.now();
  try {
    await assert.rejects(Marionette.connect(server.address().port, { timeoutMs: 5_000 }), /before its hello/);
    assert.ok(Date.now() - started < 2_000, `took ${Date.now() - started} ms`);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('a frame that is not a reply fails the pending command instead of crashing the test process', async () => {
  const server = await fakeServer((message, send) => send({ not: 'a reply' }));
  const client = await Marionette.connect(server.port);
  try {
    await assert.rejects(client.send('WebDriver:Navigate', {}, { timeoutMs: 2_000 }), /not a reply/);
  } finally {
    client.close();
    await server.close();
  }
});

test('a command with no reply times out with its name', async () => {
  const server = await fakeServer(() => {});
  const client = await Marionette.connect(server.port);
  try {
    await assert.rejects(client.send('WebDriver:Navigate', {}, { timeoutMs: 50 }), /WebDriver:Navigate: no reply within 50 ms/);
  } finally {
    client.close();
    await server.close();
  }
});

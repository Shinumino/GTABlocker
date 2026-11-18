// The Marionette wire format the macro tests talk to Firefox in. Runs alone:
//   node --test tests/micro/marionette-wire.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMessage, MessageReader } from '../support/marionette.mjs';

test('a message is its UTF-8 byte length, a colon, then the JSON', () => {
  assert.equal(encodeMessage([0, 1, 'WebDriver:Navigate', { url: 'x' }]).toString('utf8'),
    '38:[0,1,"WebDriver:Navigate",{"url":"x"}]');
  // "é" is 2 bytes: the prefix counts bytes, not characters.
  assert.equal(encodeMessage('é').toString('utf8'), '4:"é"');
});

test('a message split at any byte comes out whole and once', () => {
  const value = [1, 7, null, { value: 'Vídeo sobre cães 🐶' }];
  const wire = encodeMessage(value);
  for (let cut = 1; cut < wire.length; cut++) {
    const reader = new MessageReader();
    const first = reader.push(wire.subarray(0, cut));
    const second = reader.push(wire.subarray(cut));
    assert.deepEqual([...first, ...second], [value], `cut at byte ${cut}`);
  }
});

test('three messages split at any byte all come out, once and in order', () => {
  // Catches a reader that finishes one message and drops the start of the next.
  const values = [{ hello: 1 }, [1, 1, null, { value: 'olá' }], [1, 2, null, {}]];
  const wire = Buffer.concat(values.map(encodeMessage));
  for (let cut = 1; cut < wire.length; cut++) {
    const reader = new MessageReader();
    assert.deepEqual([...reader.push(wire.subarray(0, cut)), ...reader.push(wire.subarray(cut))], values, `cut at byte ${cut}`);
  }
});

test('several messages in one chunk all come out, in order', () => {
  const reader = new MessageReader();
  const wire = Buffer.concat([encodeMessage({ hello: 1 }), encodeMessage([1, 1, null, {}]), encodeMessage([1, 2, null, { value: 3 }])]);
  assert.deepEqual(reader.push(wire), [{ hello: 1 }, [1, 1, null, {}], [1, 2, null, { value: 3 }]]);
  assert.deepEqual(reader.push(Buffer.alloc(0)), []);
});

test('a stream that is not Marionette fails at once instead of buffering forever', () => {
  assert.throws(() => new MessageReader().push(Buffer.from('HTTP/1.1 200 OK')), /length prefix/);
  assert.throws(() => new MessageReader().push(Buffer.from('12a:{}')), /length prefix/);
  assert.throws(() => new MessageReader().push(Buffer.from('99999999999:')), /length prefix/);
});

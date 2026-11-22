import { FloconOutbox, FloconOutboxLink } from '../client/outbox';

function link(fail = () => false) {
  const sent: string[] = [];
  const l = new FloconOutboxLink((m) => {
    if (fail()) return false;
    sent.push(m);
    return true;
  });
  return { l, sent };
}

test('messages are kept until connected, then sent in order after the handshake', () => {
  const outbox = new FloconOutbox(10);
  const { l, sent } = link();
  outbox.add(l);
  outbox.enqueue('a');
  outbox.enqueue('b');
  expect(sent).toEqual([]);
  outbox.connected(l, 'hello');
  outbox.enqueue('c');
  expect(sent).toEqual(['hello', 'a', 'b', 'c']);
  expect(outbox.bufferedCount).toBe(0);
});

test('the oldest messages are dropped above the capacity', () => {
  const outbox = new FloconOutbox(2);
  const { l, sent } = link();
  outbox.add(l);
  ['a', 'b', 'c'].forEach((m) => outbox.enqueue(m));
  expect(outbox.droppedCount).toBe(1);
  outbox.connected(l, 'hello');
  expect(sent).toEqual(['hello', 'b', 'c']);
});

test('after a disconnection, only the missed messages are sent again, after a new handshake', () => {
  const outbox = new FloconOutbox(10);
  const { l, sent } = link();
  outbox.add(l);
  outbox.connected(l, 'h1');
  outbox.enqueue('a');
  outbox.disconnected(l);
  outbox.enqueue('b');
  outbox.connected(l, 'h2');
  expect(sent).toEqual(['h1', 'a', 'h2', 'b']);
});

test('a failing transport keeps the message and disconnects the link', () => {
  const outbox = new FloconOutbox(10);
  let failing = false;
  const { l, sent } = link(() => failing);
  outbox.add(l);
  outbox.connected(l, 'h1');
  failing = true;
  outbox.enqueue('a');
  expect(l.isConnected).toBe(false);
  expect(outbox.bufferedCount).toBe(1);
  failing = false;
  outbox.connected(l, 'h2');
  expect(sent).toEqual(['h1', 'h2', 'a']);
});

test('every link receives every message, a message is kept until all links got it', () => {
  const outbox = new FloconOutbox(10);
  const one = link();
  const two = link();
  outbox.add(one.l);
  outbox.add(two.l);
  outbox.connected(one.l, 'h');
  outbox.enqueue('a');
  expect(outbox.bufferedCount).toBe(1);
  outbox.connected(two.l, 'h');
  expect(two.sent).toEqual(['h', 'a']);
  expect(outbox.bufferedCount).toBe(0);
});

test('removing a link lets the others free the buffer', () => {
  const outbox = new FloconOutbox(10);
  const one = link();
  const two = link();
  outbox.add(one.l);
  outbox.add(two.l);
  outbox.connected(one.l, 'h');
  outbox.enqueue('a');
  outbox.remove(two.l);
  expect(outbox.bufferedCount).toBe(0);
});

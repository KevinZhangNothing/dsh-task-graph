import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import {
  decodeZstdFrames, parseEventsFromFrames, SessionStore, resolveDshHome,
  displaySessionId, workspacePath, zstdSupported,
} from '../lib/sessions.js';

function frame(text) {
  return zlib.zstdCompressSync(Buffer.from(text, 'utf8'));
}

test('resolveDshHome honours $DSH_HOME and falls back to ~/.dsh', () => {
  assert.equal(resolveDshHome({ DSH_HOME: '/tmp/x' }, '/home/u'), '/tmp/x');
  assert.equal(resolveDshHome({ DSH_HOME: '  ' }, '/home/u'), join('/home/u', '.dsh'));
  assert.equal(resolveDshHome({}, '/home/u'), join('/home/u', '.dsh'));
  assert.equal(resolveDshHome({ DSH_HOME: '~/sub' }, '/home/u'), join('/home/u', 'sub'));
});

test('multi-frame zstd buffers decode frame-by-frame', { skip: !zstdSupported() }, () => {
  const buf = Buffer.concat([
    frame('{"type":"session","id":"a"}\n'),
    frame('{"type":"turn/start","seq":1,"time":1,"data":{"turn":1}}\n'),
    frame('{"type":"turn/end","seq":2,"time":2,"data":{"turn":1}}\n'),
  ]);
  const { decoded, frames, skipped } = decodeZstdFrames(buf);
  assert.equal(frames, 3);
  assert.equal(skipped, 0);
  const events = parseEventsFromFrames(decoded);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.type), ['session', 'turn/start', 'turn/end']);
});

test('torn final frame prefix-decodes; trailing torn JSON line is dropped', { skip: !zstdSupported() }, () => {
  const good = frame('{"type":"session","id":"a"}\n');
  const fullTorn = frame('{"type":"turn/start","seq":9,"time":9,"data":{"turn":1}}\n');
  const torn = fullTorn.subarray(0, Math.max(8, Math.floor(fullTorn.length / 2))); // cut mid-frame
  const buf = Buffer.concat([good, torn]);
  const { decoded } = decodeZstdFrames(buf);
  assert.equal(decoded.length, 2);
  const events = parseEventsFromFrames(decoded);
  assert.equal(events.length, 1, 'only the complete JSON line survives the torn frame');
  assert.equal(events[0].type, 'session');
});

test('incremental tailing decodes only new frames', { skip: !zstdSupported() }, () => {
  const buf = Buffer.concat([frame('{"seq":1}\n'), frame('{"seq":2}\n'), frame('{"seq":3}\n')]);
  const tail = decodeZstdFrames(buf, { startFrame: 2 });
  const events = parseEventsFromFrames(tail.decoded);
  assert.deepEqual(events.map((e) => e.seq), [3]);
});

test('SessionStore discovers workspaces/sessions and caches parses', { skip: !zstdSupported() }, () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-tg-'));
  try {
    const dir = join(home, 'sessions', '--repo--', 'session-abc');
    mkdirSync(dir, { recursive: true });
    const artifact = join(dir, 'session.jsonl.zstd');
    writeFileSync(artifact, Buffer.concat([
      frame(JSON.stringify({ type: 'session', version: 0, id: 'abc', createdAt: 1000, cwd: '/repo', delegationDepth: 0 }) + '\n'),
      frame(JSON.stringify({ type: 'session/title', seq: 1, time: 1100, data: { title: 'demo task' } }) + '\n'),
      frame(JSON.stringify({ type: 'turn/start', seq: 2, time: 1200, data: { turn: 1 } }) + '\n'
        + JSON.stringify({ type: 'turn/end', seq: 3, time: 1300, data: { turn: 1, reason: { kind: 'completed' } } }) + '\n'),
    ]));
    const store = new SessionStore(home);
    const all = store.all();
    assert.equal(all.length, 1);
    assert.equal(all[0].ref, '--repo--/session-abc');
    const loaded = store.load('--repo--/session-abc');
    assert.equal(loaded.events.length, 4);
    // cache hit returns the same arrays
    const again = store.load('--repo--/session-abc');
    assert.equal(again.events, loaded.events);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('child sessions are found via parentSession', { skip: !zstdSupported() }, () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-tg-'));
  try {
    const write = (dirName, header) => {
      const dir = join(home, 'sessions', '--repo--', dirName);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'session.jsonl.zstd'), frame(JSON.stringify(header) + '\n'));
    };
    write('session-parent', { type: 'session', id: 'parent-1', createdAt: 1, delegationDepth: 0 });
    write('session-child', { type: 'session', id: 'child-1', createdAt: 2, delegationDepth: 1, parentSession: 'parent-1', origin: 'subagent' });
    const store = new SessionStore(home);
    const children = store.childrenOf('parent-1');
    assert.equal(children.length, 1);
    assert.equal(children[0].header.id, 'child-1');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('display helpers', () => {
  assert.equal(displaySessionId('session-abc'), 'abc');
  assert.equal(displaySessionId('lark-oc_x'), 'lark-oc_x');
  assert.equal(workspacePath('--Users-kevin--'), '/Users/kevin');
});

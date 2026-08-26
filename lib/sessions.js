/**
 * DSH session discovery and decoding (Node half).
 *
 * Sessions live under `$DSH_HOME/sessions/<workspace-slug>/<session-dir>/session.jsonl.zstd`.
 * The artifact is a concatenated Zstandard frame container (one frame per
 * appended batch), so this module scans frame magics and decodes each frame
 * with Node's built-in `zlib.zstdDecompressSync` (Node ≥ 22.15) — zero
 * native dependencies.
 *
 * @module dsh-task-graph/sessions
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import zlib from 'node:zlib';

const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const ARTIFACT_NAME = 'session.jsonl.zstd';

/** Expand a leading `~` in a path. */
export function expandHome(path, home = homedir()) {
  if (path === '~') return home;
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2));
  return path;
}

/**
 * Resolve DSH_HOME: explicit option > $DSH_HOME > ~/.dsh
 * (mirrors @deepseek-ai/dsh-home-paths precedence).
 */
export function resolveDshHome(env = process.env, home = homedir()) {
  const raw = env.DSH_HOME;
  if (raw !== undefined && raw.trim() !== '') {
    const expanded = expandHome(raw.trim(), home);
    return expanded.startsWith('/') || /^[A-Za-z]:[\\/]/.test(expanded) ? expanded : join(process.cwd(), expanded);
  }
  return join(home, '.dsh');
}

/** Whether the running Node can decode zstd natively. */
export function zstdSupported() {
  return typeof zlib.zstdDecompressSync === 'function';
}

/** Locate every session artifact under a DSH home. */
export function listSessionFiles(home) {
  const sessionsRoot = join(home, 'sessions');
  const found = [];
  let workspaces = [];
  try {
    workspaces = readdirSync(sessionsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return found;
  }
  for (const ws of workspaces) {
    const wsPath = join(sessionsRoot, ws.name);
    let dirs = [];
    try {
      dirs = readdirSync(wsPath, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {
      continue;
    }
    for (const dir of dirs) {
      const artifact = join(wsPath, dir.name, ARTIFACT_NAME);
      let st = null;
      try {
        st = statSync(artifact);
      } catch {
        continue;
      }
      found.push({
        workspace: ws.name,
        dir: dir.name,
        path: artifact,
        size: st.size,
        mtime: st.mtimeMs,
      });
    }
  }
  return found;
}

/**
 * Decode a concatenated-frame zstd buffer.
 *
 * @param {Buffer} buf
 * @param {object} [options]
 * @param {number} [options.startFrame] - skip frames before this index
 *   (incremental tailing).
 * @param {number} [options.maxFrames] - stop after this many decoded frames.
 * @returns {{frames:number, decoded:Buffer[], skipped:number, total:number}}
 *   `total` is the frame count present in the buffer.
 */
export function decodeZstdFrames(buf, options = {}) {
  if (!zstdSupported()) throw new Error('this Node build lacks zlib zstd support (need Node ≥ 22.15)');
  const starts = [];
  let i = buf.indexOf(FRAME_MAGIC);
  while (i !== -1) {
    starts.push(i);
    i = buf.indexOf(FRAME_MAGIC, i + 4);
  }
  const decoded = [];
  let skipped = 0;
  const from = options.startFrame ?? 0;
  const maxFrames = options.maxFrames ?? Infinity;
  for (let k = from; k < starts.length && decoded.length < maxFrames; k += 1) {
    const start = starts[k];
    const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
    try {
      decoded.push(zlib.zstdDecompressSync(buf.subarray(start, end)));
    } catch {
      // Undecodable slice (false magic hit inside compressed bytes). The
      // common torn-final-frame case does NOT land here: Node's decoder
      // prefix-decodes it, recovering partial plaintext whose trailing JSON
      // line is dropped by parseEventsFromFrames.
      skipped += 1;
    }
  }
  return { frames: decoded.length, decoded, skipped, total: starts.length };
}

/** Parse decoded frame buffers into ordered trajectory events. */
export function parseEventsFromFrames(frames) {
  const events = [];
  for (const frame of frames) {
    const text = frame.toString('utf8');
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // torn JSON line at a frame boundary — skip quietly
      }
    }
  }
  events.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return events;
}

/**
 * In-memory session store with size/mtime-keyed caching.
 */
export class SessionStore {
  constructor(home = resolveDshHome()) {
    this.home = home;
    /** @type {Map<string, {size:number, mtime:number, events:Array, header:object}>} */
    this.cache = new Map();
  }

  artifactInfo(ref) {
    for (const info of listSessionFiles(this.home)) {
      if (ref === `${info.workspace}/${info.dir}` || ref === info.dir) return info;
    }
    return null;
  }

  /**
   * Load and parse a session fully (cached until the file changes).
   * @returns {{header:object, events:Array, info:object}|null}
   */
  load(ref) {
    const info = this.artifactInfo(ref);
    if (!info) return null;
    const hit = this.cache.get(info.path);
    if (hit && hit.size === info.size && Math.abs(hit.mtime - info.mtime) < 1) {
      return { header: hit.header, events: hit.events, info };
    }
    const buf = readFileSync(info.path);
    const { decoded } = decodeZstdFrames(buf);
    const events = parseEventsFromFrames(decoded);
    const header = events.find((e) => e.type === 'session') ?? { id: info.dir, createdAt: events[0]?.time };
    this.cache.set(info.path, { size: info.size, mtime: info.mtime, events, header });
    if (this.cache.size > 64) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    return { header, events, info };
  }

  /** Header-only quick peek (decodes until the session header line). */
  peek(ref) {
    return this.load(ref)?.header ?? null;
  }

  /**
   * Session references whose header declares `parentSession === id`.
   */
  childrenOf(sessionId) {
    const out = [];
    for (const info of listSessionFiles(this.home)) {
      const ref = `${info.workspace}/${info.dir}`;
      const loaded = this.load(ref);
      if (!loaded) continue;
      const header = loaded.header;
      if (header.parentSession === sessionId) {
        out.push({ ref, header, events: loaded.events, info });
      }
    }
    return out;
  }

  /** Every session as {ref, header, info}. */
  all() {
    return listSessionFiles(this.home).map((info) => {
      const ref = `${info.workspace}/${info.dir}`;
      const loaded = this.load(ref);
      return { ref, header: loaded?.header ?? null, info, events: loaded?.events ?? [] };
    });
  }
}

/** Pretty workspace slug back into an approximate path. */
export function workspacePath(slug) {
  if (!slug.startsWith('--')) return slug;
  return slug.replace(/^-/, '').replaceAll('-', '/').replace(/\/+$/, '') || slug;
}

/** Strip the optional `session-` prefix used by newer DSH builds. */
export function displaySessionId(dirName) {
  return dirName.startsWith('session-') ? dirName.slice('session-'.length) : dirName;
}

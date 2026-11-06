import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const night = '2026-10-28';
const event = { at: '2026-10-28T23:00:02+01:00', job: 'sync', status: 'ok', owner: 'rook' };
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeEvents(events: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), events.map((value) => JSON.stringify(value)).join('\n'));
}

describe('readNight', () => {
  it('reads the real night as five jobs, one bad line and event counts', () => {
    const digest = readNight(fileURLToPath(new URL('../runs/', import.meta.url)), night);
    expect(digest).toMatchObject({ night, badLines: 1, counts: { ok: 10, retry: 4, fail: 1 } });
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0]).toMatchObject({ owner: null, runs: 1, hasFail: false, lastError: null });
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: 'upstream 503', hasFail: false,
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
    expect(digest?.rows[3]).toMatchObject({ hasFail: true, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('returns null for missing nights and invalid night identifiers', () => {
    expect(readNight(runsDir, night)).toBeNull();
    expect(readNight(join(runsDir, 'missing-directory'), night)).toBeNull();
    writeEvents([event]);
    for (const invalid of ['', '../2026-10-28', '2026-1-28', '2026-10-28.jsonl', `${night}\n`]) {
      expect(readNight(runsDir, invalid)).toBeNull();
    }
  });

  it.each(['', '\n \t\r\n\n'])('returns an empty digest for blank files (%j)', (contents) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), contents);
    expect(readNight(runsDir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('propagates filesystem errors other than a missing file', () => {
    const regularFile = join(runsDir, 'file');
    writeFileSync(regularFile, '');
    expect(() => readNight(regularFile, night)).toThrow();
  });

  it('counts invalid JSON and event shapes without affecting valid rows or counts', () => {
    const { owner: _owner, ...withoutOwner } = event;
    const invalid = [
      null, [], 7, 'text', {}, withoutOwner,
      { ...event, job: '' }, { ...event, job: 4 },
      { ...event, at: 'yesterday' }, { ...event, at: '2026-10-28T23:00:02' },
      { ...event, at: '2026-13-28T23:00:02Z' }, { ...event, at: 42 },
      { ...event, status: 'pending' }, { ...event, owner: false },
      { ...event, error: null }, { ...event, error: 42 },
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      '{broken', ...invalid.map((value) => JSON.stringify(value)), '\t',
      JSON.stringify({ ...event, extra: { ignored: true } }), '{also broken',
      JSON.stringify({ ...event, job: 'later', at: '2026-10-29T01:00:00Z', owner: null }),
    ].join('\r\n'));
    const digest = readNight(runsDir, night);
    expect(digest).toMatchObject({ badLines: invalid.length + 2, counts: { ok: 2, retry: 0, fail: 0 } });
    expect(digest?.rows.map((row) => row.job)).toEqual(['later', 'sync']);
    expect(digest?.rows.every((row) => row.runs === 1)).toBe(true);
  });

  it('folds file order, preserves offsets, and retains failures and the latest supplied error after recovery', () => {
    writeEvents([
      { ...event, status: 'fail', error: 'first', at: '2026-10-29T05:00:00-06:00' },
      { ...event, status: 'retry', error: 'latest', at: '2026-10-28T22:00:00+0530' },
      { ...event, owner: null, at: '2026-10-28T21:00:00.123Z' },
    ]);
    expect(readNight(runsDir, night)).toEqual({
      night, badLines: 0, counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{
        job: 'sync', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest',
        firstAt: '2026-10-29T05:00:00-06:00', lastAt: '2026-10-28T21:00:00.123Z', hasFail: true,
      }],
    });
  });

  it('keeps a supplied empty error and sorts exact job names by JS string comparison', () => {
    writeEvents([
      ...['é', 'a', '__proto__', 'Z', 'a '].map((job) => ({ ...event, job })),
      { ...event, error: 'old error' }, { ...event, error: '' }, event,
    ]);
    const digest = readNight(runsDir, night);
    expect(digest?.rows.map((row) => row.job)).toEqual(['Z', '__proto__', 'a', 'a ', 'sync', 'é']);
    expect(digest?.rows.find((row) => row.job === 'sync')).toMatchObject({ lastError: '', runs: 3 });
  });
});

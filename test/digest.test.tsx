import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'unused',
};

describe('digest routes', () => {
  let runsDir: string;

  beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-'));
    config.runsDir = runsDir;
  });

  afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true });
  });

  async function writeNight(night: string, contents: string): Promise<void> {
    await mkdir(runsDir, { recursive: true });
    await writeFile(join(runsDir, `${night}.jsonl`), contents, 'utf8');
  }

  it('renders sorted rows with original offsets, missing owners and warning states', async () => {
    const night = '2026-10-28';
    await writeNight(
      night,
      [
        JSON.stringify({ at: '2026-10-28T08:10:00-05:00', job: 'zeta', status: 'fail', owner: 'ops', error: 'temporary failure' }),
        JSON.stringify({ at: '2026-10-28T08:11:00-05:00', job: 'alpha', status: 'ok', owner: 'ana' }),
        JSON.stringify({ at: '2026-10-28T08:11:30-05:00', job: 'beta', status: 'fail', owner: 'bo' }),
        JSON.stringify({ at: '2026-10-28T08:11:45-05:00', job: 'beta', status: 'ok', owner: 'bo' }),
        JSON.stringify({ at: '2026-10-28T08:12:00-05:00', job: 'zeta', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T08:13:00-05:00', job: 'zeta', status: 'retry', owner: null }),
        '{not json',
        JSON.stringify({ at: '2026-10-28T08:14:00-05:00', job: 'zeta', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-28T08:15:00-05:00', job: 'zeta', status: 'retry', owner: null }),
      ].join('\n'),
    );

    const response = await createApp(config).request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('08:10:00-05:00');
    expect(html).toContain('08:15:00-05:00');
    expect(html).toContain('—');
    expect(html).toContain('1 bad line');

    const zetaRow = html.match(/<tr\b[^>]*>[^]*?zeta[^]*?<\/tr>/)?.[0];
    const betaRow = html.match(/<tr\b[^>]*>[^]*?beta[^]*?<\/tr>/)?.[0];
    expect(zetaRow).toBeDefined();
    expect(zetaRow).toMatch(/class="warn"/);
    expect(betaRow).toBeDefined();
    expect(betaRow).toMatch(/class="warn"/);
  });

  it('returns the same ordered digest data from JSON as the page presents', async () => {
    const night = '2026-10-27';
    await writeNight(
      night,
      [
        JSON.stringify({ at: '2026-10-27T23:55:00+03:00', job: 'worker-b', status: 'retry', owner: 'bo' }),
        JSON.stringify({ at: '2026-10-27T23:57:00+03:00', job: 'worker-a', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-27T23:58:00+03:00', job: 'worker-b', status: 'ok', owner: 'bo' }),
      ].join('\n'),
    );
    const expected: NightDigest = {
      night,
      rows: [
        {
          job: 'worker-a', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-27T23:57:00+03:00', lastAt: '2026-10-27T23:57:00+03:00', hasFail: false,
        },
        {
          job: 'worker-b', owner: 'bo', runs: 2, retries: 1, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-27T23:55:00+03:00', lastAt: '2026-10-27T23:58:00+03:00', hasFail: false,
        },
      ],
      badLines: 0,
      counts: { ok: 2, retry: 1, fail: 0 },
    };

    const app = createApp(config);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json() as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest).toEqual(expected);
    expect(html.indexOf('worker-a')).toBeLessThan(html.indexOf('worker-b'));
    for (const row of digest.rows) {
      expect(html).toContain(row.job);
      expect(html).toContain(row.firstAt);
      expect(html).toContain(row.lastAt);
      expect(html).toContain(row.lastStatus);
    }
    expect(html).toContain('—');
  });

  it('returns 404 for a missing night on both routes', async () => {
    const app = createApp(config);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-26'),
      app.request('/api/digest/2026-10-26'),
    ]);

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('renders an empty night on both routes', async () => {
    const night = '2026-10-25';
    await writeNight(night, '');
    const app = createApp(config);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json() as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(digest).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('keeps valid data and exposes malformed line counts on both routes', async () => {
    const night = '2026-10-24';
    await writeNight(
      night,
      [
        JSON.stringify({ at: '2026-10-24T09:00:00+01:00', job: 'kept', status: 'ok', owner: 'lee' }),
        'not-json',
      ].join('\n'),
    );
    const app = createApp(config);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json() as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('kept');
    expect(html).toContain('1 bad line');
    expect(jsonResponse.status).toBe(200);
    expect(digest.night).toBe(night);
    expect(digest.rows.map(({ job }) => job)).toEqual(['kept']);
    expect(digest.badLines).toBe(1);
  });

  it('escapes job names in HTML while preserving them in JSON', async () => {
    const night = '2026-10-23';
    const job = '<script>alert("x")</script>';
    await writeNight(night, `${JSON.stringify({ at: '2026-10-23T12:00:00Z', job, status: 'ok', owner: 'lee' })}\n`);
    const app = createApp(config);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json() as NightDigest;

    expect(htmlResponse.status).toBe(200);
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(jsonResponse.status).toBe(200);
    expect(digest.rows[0]?.job).toBe(job);
  });
});

---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

- [#1: Digest contract: shared rows and reader signature](https://github.com/brolag/mega-s01e04-rig/issues/1)
- [#2: Run log reader: aggregate jobs without losing malformed nights](https://github.com/brolag/mega-s01e04-rig/issues/2)
- [#3: Digest page: GET /digest/:night](https://github.com/brolag/mega-s01e04-rig/issues/3)
- [#4: Digest JSON: GET /api/digest/:night](https://github.com/brolag/mega-s01e04-rig/issues/4)
- [#5: Status board: link nights to their digests with counts](https://github.com/brolag/mega-s01e04-rig/issues/5)
- [#6: Digest route tests: success, missing, empty and malformed nights](https://github.com/brolag/mega-s01e04-rig/issues/6)
- [#7: Publish the digest preview and send it for review](https://github.com/brolag/mega-s01e04-rig/issues/7)
- [#8: Clean the public preview and archive the completed plan](https://github.com/brolag/mega-s01e04-rig/issues/8)

## Completion evidence

- Implementation merged through [PR #9](https://github.com/brolag/mega-s01e04-rig/pull/9).
- The course confirmed that the reviewer had seen the marked preview before issue #7 was
  closed. Review submission alone did not satisfy that gate.
- After renewed human approval, the same [public preview](https://mega-s01e04-rig-preview-imagine-paradise.vercel.app)
  was replaced with the page exported with `LANE_MARKER` unset. It returns HTTP 200 and
  displays "no marker set"; the former lane marker is absent. The superseded marked
  deployment was deleted, and the same public link was verified again afterward.
- The replacement preserves the sample's five jobs and one bad line, one inline stylesheet,
  and no client scripts or external assets.
- Plan cleanup is complete. Final course acceptance is tracked separately and is not
  asserted by this archive.

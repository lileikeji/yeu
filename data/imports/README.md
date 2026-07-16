# AMap Work Map import

This directory contains an auditable import of the user's authorized AMap Work Map export.

## Files

- `amap-workmap-2026-07-13.raw.json`: the complete worksheet/column structure and business fields from all four worksheets, including source row numbers and the workbook SHA-256. Creator nickname values are removed for a public repository. Embedded images are not copied; only their archive paths, sizes and hashes are recorded.
- `amap-workmap-2026-07-13.audit.json`: headers, row counts, uniqueness checks, coordinate findings, review state and anomaly candidates.
- `amap-workmap-2026-07-13.coordinates.template.json`: all 76 marker rows in workbook order. Coordinate, point-role, accuracy, evidence and review placeholders intentionally remain `null` until an authorized export is independently checked.
- `amap-nearby-poi-candidates-2026-07-15.json`: curated AMap Place Around candidates for the new/old student-street centers. This is a read-only verification queue, not an import batch; entries must never be auto-published without a current storefront/phone check and entrance-coordinate review.
- `xiaohongshu-leads-2026-07-15.json`: minimal public-note metadata and claim summaries from a logged-in, read-only Xiaohongshu search. It excludes full note text, images, private contacts and comment-profile collection; each record retains a stable public source link.
- `web-research-increment-2026-07-15.json`: deduplicated incremental web research completed after the initial audit. Official sources and social/community leads are separated, and changing claims remain review-only until current official or field confirmation.
- `../../scripts/import-amap-workmap.py`: reproducible workbook parser, validator and audit/template generator. Its historical seed-generation path is not the approved verified-coordinate database import path.
- `../../scripts/import-amap-drafts.ts`: strict, idempotent importer that copies the reviewed 76 text-only markers into SQLite as coordinate-missing drafts.
- `../../scripts/import-amap-coordinates.ts`: strict, idempotent creator of pending `authorized-import` coordinate observations for an independently human-reviewed WGS84 subset. It performs no coordinate conversion and never updates or publishes a place.

The source workbook contains 76 markers and 8 drawn areas. It contains no longitude/latitude columns or hidden coordinate metadata. Values beginning with `WIA-` are internal resource identifiers, not coordinates.

The original Excel remains outside the repository. The `创建人` columns are retained so the export schema stays traceable, but all 84 creator values are `null`; no nickname hash or login/session material is committed.

## Create safe SQLite drafts

Initialize or migrate the target database first, then run the importer without flags. The default is
a read-only dry-run; `created` remains `0` and `wouldCreate` reports the number of planned inserts.

```powershell
pnpm db:migrate
pnpm amap:drafts
```

Review `wouldCreate`, `skipped`, `conflicts` and `conflictDetails`. Only an explicit `--apply` opens
the database for writing:

```powershell
pnpm amap:drafts --apply
```

Select another migrated database with either `NUXT_DATABASE_PATH` or `--database PATH`. The importer:

- validates the authorized workbook hash, exact `标记位置` columns, reviewed data fingerprint,
  source rows 2-77, and all 76 unique WIA codes before opening a write transaction;
- identifies reruns by the pair `sourceRow + locationCode` stored as structured JSON in
  `source_raw_ref`;
- inserts only `draft` places with null coordinates, `coordinate_verification = missing`, null
  verification/publication timestamps, and no `place_sources` rows;
- preserves each non-empty description and text address while marking the record as pending manual
  verification and unsuitable for navigation;
- never updates an existing row. A rerun skips an exact identity even after a human edits it;
- blocks the entire write transaction when it finds a partial WIA/row match, duplicate identity,
  malformed import reference, or collision with an existing ID, slug, or name. Conflict exit code is
  `1`; input/schema errors use exit code `2`.

Classification is intentionally conservative. Only names containing an explicit word such as
`教学楼`, `餐厅`, `快递`, or `宿舍` receive the corresponding category. Province names,
sea names, and mountain names ending in `楼` remain generic buildings and are never inferred to be dorms.

Run the focused temporary-database verification with:

```powershell
pnpm amap:drafts:test
```

## Apply a human-reviewed WGS84 batch

Do not edit the committed empty template. Copy only the reviewed rows into a separate JSON array;
`data/imports/private/` is ignored by Git and is suitable when the evidence is not public. A batch may
contain one independently confirmed point or any larger subset. It does not need to contain all 76
points.

Each object must contain exactly these fields:

| Field | Requirement |
| --- | --- |
| `sourceRow` | Integer copied unchanged from the committed template |
| `name` | Text copied unchanged from the committed template |
| `locationCode` | Full WIA internal identifier copied unchanged; it is never parsed as a coordinate |
| `lng`, `lat` | Finite numeric WGS84 values, not strings and not visually guessed values |
| `crs` | Declared original CRS of the supplied `lng`/`lat`; exactly `WGS84` for accepted batches |
| `pointRole` | Exactly `site-point` or `main-entrance`; this becomes the candidate observation role and is not written to the place |
| `accuracyMeters` | Measured positive accuracy in meters, at most the server approval threshold (currently 25); do not invent a precision value |
| `coordinateSource` | Non-blank evidence/method description; describe any externally reviewed conversion chain |
| `coordinateSourceUrl` | HTTP(S) evidence URL, or `null` when a field check/private authorized export has no public URL |
| `verificationStatus` | Exactly `human-verified` |
| `verifiedAt` | ISO 8601 timestamp with `Z` or an explicit numeric timezone; cannot be in the future |
| `verifierCategory` | One of `authorized-map-owner`, `campus-staff`, `field-reviewer`, `project-maintainer`, `student-team`; never a person's name |

`human-verified` describes the external input review only. The importer records it as
`inputVerificationStatus` inside evidence; it never maps that value to the observation `review_status`
or the place `coordinate_verification`. Every new observation remains `pending`.

Run a read-only preview first:

```powershell
pnpm amap:coordinates -- `
  --input data/imports/private/reviewed-wgs84.json `
  --database ./.data/yeu.sqlite
```

Only after reviewing `wouldCreate`, `skipped`, `conflicts` and `conflictDetails`, apply the same file:

```powershell
pnpm amap:coordinates -- `
  --apply `
  --input data/imports/private/reviewed-wgs84.json `
  --database ./.data/yeu.sqlite
```

The observation importer validates the immutable 76-row template against the reviewed raw workbook, then binds
every selected item to exactly one existing place through `sourceRow + locationCode + source_raw_ref`.
The deterministic draft ID, slug, name and canonical source reference must still match. A malformed,
missing or ambiguously duplicated identity is a conflict, and any conflict rolls back the whole selected
batch.

`--apply` inserts one `pending` observation per selected item with `capture_method = authorized-import`,
one WGS84 sample, the supplied point role and measured accuracy. It does not update any `places` column,
including longitude/latitude, `coordinate_verification`, `coordinate_verified_at`,
`coordinate_point_role`, `status`, `published_at`, `last_verified_at`, or `source_raw_ref`. The compact
observation evidence preserves the exact place `source_raw_ref` snapshot and a SHA-256 of the normalized
input. It is not a `sources` record and does not claim that the evidence or place is school-official.

The client observation UUID and row UUID are deterministic from the immutable source row and WIA code.
An exact rerun is skipped even after reviewers approve or reject the observation. Reusing that identity
with a changed coordinate, role, accuracy, evidence or target is a conflict; the importer never creates a
second observation or overwrites the first. A pending observation becomes a place coordinate only through
the normal backend review and dual-verification workflow.

GCJ-02 and BD-09 input is rejected. This repository has no approved coordinate-conversion dependency,
so the updater does not invoke the older hand-written conversion path or silently relabel values. Use
a separately reviewed, reliable conversion workflow outside this importer, then independently check
the resulting WGS84 point before creating a WGS84 batch.

The anomaly range uses the community-mapped OpenStreetMap relation
[`17685756`](https://www.openstreetmap.org/relation/17685756), reviewed through the public API on
2026-07-13, plus a `0.002` degree buffer on each side. It only catches clearly misplaced coordinates;
it is neither an official university boundary nor evidence that any individual marker is correct.

Run the focused safety suite with:

```powershell
pnpm amap:coordinates:test
```

## Reproduce

Inspect without writing:

```powershell
python scripts/import-amap-workmap.py `
  'E:\下载\1_通用地图-07月13日 19时28分.xlsx' `
  --dry-run
```

Regenerate the raw copy, audit and full coordinate template:

```powershell
python scripts/import-amap-workmap.py `
  'E:\下载\1_通用地图-07月13日 19时28分.xlsx'
```

Use `--limit N` only when an intentionally partial, auditable selection is required.

The committed coordinate template is an array with this shape:

```json
[
  {
    "sourceRow": 2,
    "name": "泽钏教学楼",
    "locationCode": "WIA-200.35340,62.878104083",
    "lng": null,
    "lat": null,
    "crs": "GCJ-02",
    "pointRole": null,
    "accuracyMeters": null,
    "coordinateSource": null,
    "coordinateSourceUrl": null,
    "verificationStatus": "pending-authorized-coordinate-export",
    "verifiedAt": null,
    "verifierCategory": null
  }
]
```

Keep these committed placeholders null. A reviewed private batch adds the evidence fields documented
above and is processed only by `amap:coordinates`.

## Status semantics

- `imported`: the record exists in the user's Work Map export.
- `owner-map-only`: the coordinate came from that user-owned map but has not been independently verified.
- `pending observation`: an independently checked WGS84 candidate with role, accuracy and evidence; it has not passed backend coordinate approval.
- `verified`: a place coordinate produced only after the backend review and dual-verification requirements pass; it still does not mean school-official verification or publish the place.
- `MapPoi.status`: generated imports remain `draft`; the script never upgrades them to `published`.

The approved observation importer rejects null or invalid coordinates, missing roles/accuracy/provenance,
duplicate source rows/WIA codes/points, future verification times, identity drift and points outside the
buffered community boundary. It never derives coordinates from WIA identifiers, converts GCJ-02/BD-09,
or bypasses the coordinate review service.

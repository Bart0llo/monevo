# User Data Export and Import

**[Proposed]** design for R-EXP-01..03 and the data part of R-REP-04. A user export is **per user** and contains only that user's data. It is different from an instance **backup**, which is an operator concern ([backups-and-restoration.md](../infrastructure/backups-and-restoration.md)). Generic CSV/Excel bank statement import is **[Out of scope]** (R-EXP-03, R-TX-12).

## 1. Export

### Formats

| Format | Purpose | Re-importable |
|---|---|---|
| **JSON** (`monevo-export`) | Complete, lossless, versioned | Yes |
| **CSV** (zip, one file per entity) | Spreadsheets and other tools | No in v1 ([open question](../planning/open-questions.md#oq-csv-re-import)) |

### Scope

- **All data** (default), or **selected accounts**: the chosen accounts, their transactions (a transfer is included if **either** leg's account is selected; the other account is then included as a reference stub, marked `referenceOnly`), the categories used by those transactions, and the budgets, pots, goals, schedules, and templates that reference only included accounts or categories.
- Entity selection (R-EXP-01): accounts, categories, transactions, budgets are always selectable. Optional extras: scheduled transactions, savings pots and goals, templates, custom field definitions, alert rules, report definitions, dashboard layout, user manual exchange rates, settings (locale, tz, base currency, week start).
- Never exported: sessions, identities, password hash, push subscriptions, notifications, insights, sync metadata, idempotency records, provider (global) exchange rates, `storageKey`s, or other users' anything. Transaction history is exported optionally (`includeHistory`, default off) as read-only records.
- Attachments: **metadata only** in v1 (filename, size, MIME, sha256). Including attachment content in the export zip is **[Proposed]** as an option (`includeAttachments`) once quota-sized archives are tested; it counts against no quota but is capped by `MAX_EXPORT_BYTES` (default 2 GiB).

### JSON document

```json
{
  "format": "monevo-export",
  "schemaVersion": 1,
  "exportId": "0193…",
  "exportedAt": "2026-11-18T10:00:00Z",
  "appVersion": "1.0.0",
  "baseCurrency": "PLN",
  "scope": { "kind": "ACCOUNTS", "accountIds": ["…"] },
  "counts": { "accounts": 4, "transactions": 5210 },
  "entities": {
    "accounts": [ { …account DTO… } ],
    "categories": [ … ],
    "customFieldDefinitions": [ … ],
    "transactions": [ { …transaction DTO with postings… } ],
    "transactionTemplates": [ … ],
    "scheduledTransactions": [ { …, "amountChanges": [ … ], "occurrences": [ … ] } ],
    "budgets": [ … ], "savingsPots": [ { …, "allocations": [ … ] } ], "savingsGoals": [ … ],
    "alertRules": [ … ], "reportDefinitions": [ … ], "dashboardLayout": { … },
    "exchangeRates": [ …manual rates only… ], "settings": { … },
    "attachments": [ { "id": "…", "transactionId": "…", "originalFilename": "…", "sizeBytes": 0, "detectedMime": "…", "sha256": "…" } ]
  }
}
```

- Entities use the **public DTO shapes** from `@monevo/contracts` (decimal strings, LocalDates, enums), so the export schema evolves with the API under the same compatibility rules. `@monevo/contracts` contains `ExportDocumentV1` as a Zod schema.
- Posting snapshots (`rateToAccount`, `baseAmount`, `rateToBase`, sources) are included so an import reproduces historical totals exactly.
- `schemaVersion` increases on breaking changes. The importer supports the current and all previous schema versions via upgrade functions (`v1 → v2 …`).

### CSV

A zip with `transactions.csv` (one row per posting, with transaction ID, type, date, account, amount, currency, original amount and currency, rates, base amount, category path, description, custom field columns), `accounts.csv`, `categories.csv`, `budgets.csv`, and others for selected extras. Encoding and number rules match report CSVs ([reporting-and-dashboard.md](reporting-and-dashboard.md#5-export-of-reports)).

### Generation

- `POST /exports` → `202` with an export job ID. The job `exports.build` writes the file to temporary storage under the backups volume (`/data/backups/exports/<userId>/`, not the attachment store), then sends an `EXPORT_READY` notification.
- `GET /exports/:id` → status. `GET /exports/:id/download` → the file (owner only, re-auth not required, `Content-Disposition: attachment`). Exports expire after 24 h and are deleted by the job.
- Exports are built from a single `REPEATABLE READ` read-only DB transaction so the snapshot is consistent.
- Rate limit: 5 exports per hour per user.

## 2. Import

R-EXP-02. Only Monevo JSON exports are accepted.

### Flow

```
upload ──► parse + Zod validation ──► validation report ──► dry-run preview ──► apply ──► result summary
POST /imports       (stored as an Import row, status VALIDATED or INVALID)          POST /imports/:id/apply
```

1. **Upload** (`POST /imports`, multipart, max `MAX_IMPORT_BYTES`, default 100 MB). The file is stored temporarily (24 h) next to exports.
2. **Validation** (synchronous for files up to ~10 MB, otherwise a job): JSON parse → `format` check → schema version upgrade → Zod validation of each entity → referential checks within the file (every `accountId`, `categoryId`, `potId` resolves) → domain invariants (posting shape, category type match, currency exponent, pot balances never negative) → currencies exist.
3. **Validation report:** errors and warnings per record with a JSON path, a code, and translated messages (`errors.<CODE>`). Errors block the import. Warnings (for example "base currency of the export differs from yours; base amounts will be recomputed") need confirmation.
4. **Dry-run preview:** counts per entity of what would be created, skipped as already present, or remapped, plus warnings. Nothing is written.
5. **Apply** (`POST /imports/:id/apply`): a job runs the whole import **in a single DB transaction** (all or nothing). It goes through the domain services (the same invariants as the API), with audit actor `IMPORT` and the change log written for every entity. Clients receive the result through normal sync.
6. **Result summary** in the import record and an `IMPORT_FINISHED` notification.

### Identity and duplicate prevention

- **Re-import of the same export** is detected by an `imports` row with the same `exportId` **or** the same content SHA-256 for this user with status `APPLIED`. The user is told "this export was already imported on …" and cannot apply it again.
- **Entity IDs:**
  - If an entity's ID does not exist anywhere → keep the ID (preserves links and makes partial re-imports idempotent).
  - If the ID already exists **for this user** → the entity is **skipped** as already present (reported in the preview). Imports never overwrite existing data.
  - If the ID exists for **another user** (detected without revealing anything) → a new UUIDv7 is generated and every reference inside the file is remapped.
- This makes it safe to import an export into the same account (no duplicates), into a fresh account on the same instance, or into another instance.
- **Base currency:** if the export's base currency differs from the importing user's, posting `baseAmount`/`rateToBase` are re-resolved for the user's base currency with the normal algorithm (missing → null), and budget limits are flagged for review. Account-currency amounts and `rateToAccount` are always kept as exported.
- Scheduled transactions are imported **paused** if their next occurrence is in the past, so an import never triggers a burst of AUTO generation. The preview says so.
- Attachment metadata without content is not imported in v1 (the report lists the skipped files).

### Import record

```
Import: id, userId, exportId?, contentSha256, schemaVersion, status (UPLOADED|VALIDATED|INVALID|APPLYING|APPLIED|FAILED),
        report (JSONB: errors, warnings, counts), createdAt, appliedAt?
```

## 3. Security and limits

- Imports and exports are owner-only. The isolation suite covers `/exports` and `/imports`.
- Uploaded JSON is parsed with a size cap and a streaming parser for large files; Zod validation uses `.strict()` (unknown fields are rejected, except under `extensions`, which is ignored).
- Import never accepts `userId`, versions, `storageKey`s, or server-owned fields from the file.
- An import is blocked while the user's base currency change is running (`503 MAINTENANCE_USER`).

## 4. Testing

- Round trip: export → import into an empty user → export again → documents equal apart from `exportId`/`exportedAt` (property test over generated data sets).
- Re-import of the same file is rejected. Import into the source user skips everything.
- ID collision with another user → remapped, isolation preserved.
- Every validation error code has a fixture.
- Schema upgrade functions are tested with stored fixture files from each released schema version.

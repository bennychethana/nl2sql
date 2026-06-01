/**
 * DATABASE LAYER
 *
 * Uses better-sqlite3 (synchronous SQLite) to run SQL queries
 * against the fiscal data in memory.
 *
 * Production swap: replace the in-memory DB initialization with
 * a connection to a real Postgres instance. The rest of this file
 * (schema, seed, query function) stays the same — just swap the
 * driver and connection string.
 *
 * To load real data: replace FISCAL_DATA import with a parser that
 * reads your Excel files (e.g. via the 'xlsx' npm package) and maps
 * rows to FiscalRecord[]. The seed loop below handles any size.
 */

import Database from "better-sqlite3";
import { loadFiscalData } from "./loadCsv";

// Singleton — one DB instance for the lifetime of the server process
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  // In-memory SQLite — no file on disk, data lives as long as the process
  // Production: replace ":memory:" with your connection string
  _db = new Database(":memory:");

  // ── Schema ──────────────────────────────────────────────────────────────
  _db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      bien      TEXT,
      fy        INTEGER,
      fmonth    INTEGER,
      agy       INTEGER,
      agency    TEXT,
      object    TEXT,
      category  TEXT,
      subobj    TEXT,
      subcategory TEXT,
      vendor    TEXT,
      amount    REAL
    );

    -- Indexes for the columns Claude is most likely to filter/group by
    CREATE INDEX IF NOT EXISTS idx_fy       ON payments(fy);
    CREATE INDEX IF NOT EXISTS idx_agency   ON payments(agency);
    CREATE INDEX IF NOT EXISTS idx_vendor   ON payments(vendor);
    CREATE INDEX IF NOT EXISTS idx_category ON payments(category);
  `);

  // ── Seed ────────────────────────────────────────────────────────────────
  // Uses a prepared statement + transaction for performance.
  // At 900k rows this is still fast (~2-3s) because SQLite batches writes.
  const insert = _db.prepare(`
    INSERT INTO payments
      (bien, fy, fmonth, agy, agency, object, category, subobj, subcategory, vendor, amount)
    VALUES
      (@Bien, @FY, @FMonth, @Agy, @Agency, @Object, @Category, @Subobj, @SubCategory, @Vendor, @Amount)
  `);

  const data = loadFiscalData();

  const BATCH_SIZE = 10000;
  const insertBatch = _db.transaction((batch: typeof data) => {
    for (const row of batch) insert.run(row);
  });

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    insertBatch(data.slice(i, i + BATCH_SIZE));
  }

  console.log(`[DB] Initialized with ${data.length} rows`);
  return _db;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

/**
 * Run a SQL query against the payments table.
 * Returns columns + rows as plain objects.
 * Caps results at maxRows to avoid flooding the Claude context window.
 */
export function runQuery(sql: string, maxRows = 50): QueryResult {
  const db = getDb();

  // Only allow SELECT — never let Claude mutate data
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith("SELECT")) {
    throw new Error("Only SELECT statements are permitted");
  }

  const stmt = db.prepare(sql);
  const rows = stmt.all() as Record<string, unknown>[];
  const truncated = rows.length > maxRows;
  const limited = rows.slice(0, maxRows);
  const columns = limited.length > 0 ? Object.keys(limited[0]) : [];

  return {
    columns,
    rows: limited,
    rowCount: rows.length,
    truncated,
  };
}

/**
 * Returns a plain-English schema description injected into the SQL prompt.
 * Keeps Claude oriented on column names and data types.
 */
export function getSchemaDescription(): string {
  return `
TABLE: payments
COLUMNS:
  bien        TEXT    -- budget biennium, e.g. "2021-23"
  fy          INTEGER -- fiscal year: 2022 or 2023
  fmonth      INTEGER -- fiscal month: 1-12
  agy         INTEGER -- agency numeric code
  agency      TEXT    -- agency full name, e.g. "Health Care Authority"
  object      TEXT    -- single-letter spend object code
  category    TEXT    -- spend category, e.g. "Grants, Benefits & Client Services"
  subobj      TEXT    -- two-letter sub-object code
  subcategory TEXT    -- sub-category label, e.g. "Direct Payments to Providers"
  vendor      TEXT    -- vendor name (UPPERCASE), e.g. "MICROSOFT CORPORATION"
  amount      REAL    -- payment amount in dollars (NOT millions)

SAMPLE AGENCIES: "Health Care Authority", "Department of Transportation",
  "Dept of Social and Health Services", "Department of Corrections",
  "Department of Ecology", "Department of Licensing", "Department of Natural Resources"

SAMPLE CATEGORIES: "Grants, Benefits & Client Services", "Equipment & Capital Outlay",
  "Goods & Services", "Salaries & Wages", "Personnel Benefits", "Travel"

NOTES:
  - All amounts are in raw dollars. To show millions, divide by 1000000.
  - Vendor names are UPPERCASE. Use LIKE with % for partial matches.
  - Always include LIMIT (max 50) to avoid huge result sets.
  - Use LOWER() for case-insensitive text comparisons when needed.
`.trim();
}

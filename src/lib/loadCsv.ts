/**
 * CSV LOADER
 *
 * Reads payments_2022.csv and payments_2023.csv from src/data/ at server
 * startup and returns them as FiscalRecord[].
 *
 * Uses Node's built-in fs — no extra library needed for CSV parsing since
 * the format is simple (no quoted multiline fields in this dataset).
 *
 * Production note: for 900k rows this runs once on startup (~3-5s).
 * With Postgres you'd run this as a one-time seed script instead.
 */

import fs from "fs";
import path from "path";
import { FiscalRecord } from "./types";

function parseCsv(filePath: string): FiscalRecord[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length < 2) return [];

  // Normalize header: trim whitespace and BOM character (UTF-8 CSVs often
  // start with \uFEFF which would break the first column name match)
  const headers = lines[0]
    .replace(/^\uFEFF/, "")
    .split(",")
    .map((h) => h.trim());

  const records: FiscalRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields (values containing commas)
    const values = splitCsvLine(line);

    if (values.length !== headers.length) continue; // skip malformed rows

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() ?? "";
    });

    // Map to FiscalRecord — coerce numeric fields
    const record: FiscalRecord = {
      Bien:        row["Bien"]        ?? row["bien"]        ?? "",
      FY:          parseInt(row["FY"]          ?? row["fy"]          ?? "0", 10),
      FMonth:      parseInt(row["FMonth"]      ?? row["fmonth"]      ?? "0", 10),
      Agy:         parseInt(row["Agy"]         ?? row["agy"]         ?? "0", 10),
      Agency:      row["Agency"]      ?? row["agency"]      ?? "",
      Object:      row["Object"]      ?? row["object"]      ?? "",
      Category:    row["Category"]    ?? row["category"]    ?? "",
      Subobj:      row["Subobj"]      ?? row["subobj"]      ?? "",
      SubCategory: row["SubCategory"] ?? row["subcategory"] ?? "",
      Vendor:      row["Vendor"]      ?? row["vendor"]      ?? "",
      Amount:      parseFloat(row["Amount"]    ?? row["amount"]      ?? "0"),
    };

    // Skip rows with invalid amounts or missing agency
    if (isNaN(record.Amount) || !record.Agency) continue;

    records.push(record);
  }

  return records;
}

/**
 * Split a CSV line respecting quoted fields.
 * e.g. 'a,"b,c",d' → ['a', 'b,c', 'd']
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

let _cache: FiscalRecord[] | null = null;

export function loadFiscalData(): FiscalRecord[] {
  if (_cache) return _cache;

  const dataDir = path.join(process.cwd(), "src", "data");
  const files = ["payments_2022.csv", "payments_2023.csv"];

  const all: FiscalRecord[] = [];

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[CSV] File not found, skipping: ${filePath}`);
      continue;
    }
    const records = parseCsv(filePath);
    console.log(`[CSV] Loaded ${records.length} rows from ${file}`);
    // all.push(...records);
    for (const r of records) all.push(r);
  }

  console.log(`[CSV] Total rows loaded: ${all.length}`);
  _cache = all;
  return all;
}
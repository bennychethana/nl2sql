import { getSchemaDescription } from "./db";
import { QueryResult } from "./db";

/**
 * PROMPT 1 — SQL Generation
 *
 * Claude's only job here is to output a single valid SQLite SELECT statement.
 * No prose, no explanation — just SQL.
 */
export function buildSqlPrompt(): string {
  return `You are a SQL expert. Your ONLY job is to convert a plain-English question
into a single valid SQLite SELECT query.

${getSchemaDescription()}

RULES:
- Output ONLY the raw SQL query. No markdown, no backticks, no explanation.
- Always use LIMIT (max 50 rows).
- For dollar amounts, round to 2 decimal places using ROUND(amount, 2).
- For aggregations showing millions, use ROUND(SUM(amount)/1000000.0, 2) AS amount_millions.
- Use LIKE '%KEYWORD%' for vendor/agency name searches (names are UPPERCASE).
- Always ORDER BY the most meaningful column (usually SUM(amount) DESC).
- If the question is unanswerable from this schema, output exactly: UNSUPPORTED`;
}

/**
 * PROMPT 2 — Answer Generation
 *
 * Claude receives the SQL query + its real results and writes a plain-English answer.
 */
export function buildAnswerPrompt(
  userQuestion: string,
  sql: string,
  result: QueryResult
): string {
  const resultText =
    result.rows.length === 0
      ? "The query returned no results."
      : JSON.stringify(result.rows, null, 2);

  const truncationNote = result.truncated
    ? `\nNote: Results were truncated to 50 rows (${result.rowCount} total matched).`
    : "";

  return `You are a plain-English data analyst for Washington State fiscal records.
Your users are NON-TECHNICAL: journalists, city council members, policy analysts.
Never mention SQL. Never use jargon.

The user asked: "${userQuestion}"

We ran this query against the database:
${sql}

The results were:
${resultText}${truncationNote}

INSTRUCTIONS:
1. Answer in plain English in 3-5 sentences. Lead with the most newsworthy finding.
2. Use dollar figures rounded to millions (e.g. "$12.5M") for large amounts.
3. After your prose, output ONE chart JSON block:

\`\`\`chart
{"type":"bar","title":"...","labels":[...],"values":[...],"unit":"$M"}
\`\`\`

Chart rules:
- "type" is "bar" or "line"
- "labels" and "values" same length, max 8 items
- "values" are plain numbers in millions (divide raw dollars by 1000000)
- "unit" is "$M" for dollars, "%" for percentages, "" otherwise
- If results have fewer than 2 data points, skip the chart block entirely

4. End with a one-sentence "So what?" a journalist could use as a headline.
Keep total response under 220 words.`;
}

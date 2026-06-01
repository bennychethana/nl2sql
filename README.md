# WA Fiscal Explorer

A proof-of-concept web app that lets non-technical users explore Washington State vendor payment data (FY 2022–2023) through plain-English questions.

---

## Setup

```bash
npm install
cp .env.example .env.local
# Add your Anthropic API key to .env.local
npm run dev
```

Place your CSV files at `src/data/payments_2022.csv` and `src/data/payments_2023.csv`, then open [http://localhost:3000](http://localhost:3000).

---

## 1. The problem I set out to solve

Washington State publishes detailed vendor payment data — nearly a million rows across two fiscal years — but the people with the most legitimate interest in it can't read it. A journalist investigating contractor spending, a city council member trying to understand where social services money went, a policy analyst tracking year-over-year trends: all of them are stuck. The data exists, but it requires SQL to ask questions of it, and SQL requires training most of these people don't have and shouldn't need.

I chose this persona — the non-technical policy analyst or journalist — over two other directions I considered:

**Pre-built dashboard:** faster to build, but it answers the questions I think matter, not the ones the user actually has. A dashboard is an editorial choice dressed up as a tool.

**Filtered UI with dropdowns:** still requires the user to know what to look for before they can find it. If you don't already know that "Equipment & Capital Outlay" is the category for construction spending, the filter doesn't help you.

The direction I picked — plain-English questions answered from real data — closes the literacy gap entirely. You don't need to know the schema. You don't need to know the categories. You just ask.

The reason this matters for Golden Analytics specifically: Tableau and PowerBI haven't solved this problem. They made SQL optional but replaced it with drag-and-drop, which still requires data literacy. Natural language doesn't. That's a genuinely different product, not just a better interface.

---

## 2. What I built, how it works, and what I deferred

### Architecture

```
src/
├── app/
│   ├── api/query/route.ts    ← Two-step AI flow: SQL gen → answer gen
│   ├── page.tsx              ← Main UI (suggested chips, search, answer, chart)
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── SpendingChart.tsx     ← Chart.js bar + line renderer
│   └── AiLogPanel.tsx        ← Expandable governance log viewer
├── data/
│   ├── payments_2022.csv     ← Real dataset (not committed to repo)
│   ├── payments_2023.csv
│   └── fiscalData.ts         ← Fallback sample data
└── lib/
    ├── types.ts              ← Shared TypeScript interfaces
    ├── db.ts                 ← SQLite in-memory layer (better-sqlite3)
    ├── loadCsv.ts            ← CSV parser, loads both files at startup
    ├── promptBuilder.ts      ← Two separate prompts: SQL + answer
    └── aiLogger.ts           ← Governance logger (all AI I/O logged here)
```

### How a query works

Every question goes through four steps:

**Step 1 — SQL generation.** Claude receives only the database schema and the user's question. Its only job is to output a raw SQLite SELECT statement. No prose, no explanation. The prompt is strict about this.

**Step 2 — Query execution.** The SQL runs against a SQLite database seeded from the real CSV files at startup. A SELECT-only guard prevents any writes. Results are capped at 50 rows to keep the AI context window manageable.

**Step 3 — Answer generation.** A second Claude call receives the user's original question and the real query results — it never sees the schema. Its job is to write a plain-English answer with dollar figures rounded to millions, followed by a structured JSON block for chart rendering.

**Step 4 — Chart rendering.** The JSON block is parsed and validated, then passed to Chart.js. If the schema is invalid or has fewer than two data points, the chart is skipped silently.

Two separate prompts, two separate model calls. This separation matters: the SQL prompt being strict and schema-only means the model doesn't get confused between "what is the data structure" and "what should I say about the results."

### Why Text-to-SQL and not RAG

I considered embedding RAG — converting data into vector embeddings and using semantic similarity to find relevant context. I rejected it for this dataset for a specific reason: the data is tabular and structured, not unstructured text. Embedding a row like `Health Care Authority | $222 | FY2022 | Direct Payments to Providers` produces a low-quality vector because there's no natural language meaning to encode. A SQL `GROUP BY` answers "which agency spent the most?" faster, cheaper, and more accurately than cosine similarity over embeddings ever could.

RAG is the right tool when the source material is documents, emails, or prose — things with semantic richness. Text-to-SQL is the right tool when the source is a table with defined columns. This distinction matters and I wanted to be explicit about it.

### What I explicitly deferred

| Area | POC | Production |
|---|---|---|
| Database | SQLite in-memory, reloads on restart | Postgres — data persists independently of server process |
| Data loading | CSV parsed at startup (~5s for 900k rows) | One-time ETL seed script into Postgres |
| SQL safety | SELECT-only string check | Parameterized queries, query cost limits, proper injection hardening |
| Failed SQL | Returns error to user | Re-prompt Claude with the error message and retry once |
| API key | In `.env.local`, used server-side | Backend proxy — key never in client environment |
| Logging | stdout + returned in API response | Persistent audit table with session ID, user ID, timestamps |
| Multi-turn | Each question is stateless | Conversation history passed with each request for follow-up questions |
| Markdown rendering | react-markdown with basic CSS | Sanitization layer (DOMPurify) before rendering any HTML |

The most important production gap is the database. SQLite in-memory means every server restart reloads and re-parses 900k rows from CSV — about 5 seconds of downtime. Postgres eliminates this entirely: data is loaded once, persists across restarts and deploys, and handles concurrent requests correctly.

---

## 3. AI usage log

**Interaction 1 — Single prompt vs two-prompt architecture**

I asked Claude to generate both a SQL query and a plain-English answer in a single API call. What it returned was SQL embedded in prose — sometimes in a code block, sometimes inline, with inconsistent formatting that made parsing unreliable. I rejected this and split it into two strict, separate prompts. The first call outputs only raw SQL with no surrounding text. The second call never sees the schema — it only receives the question and the real query results. This separation made parsing deterministic and the governance logging cleaner, since each call has a single, auditable purpose.

**Interaction 2 — RAG suggestion**

When I described the full 900k row dataset, Claude's first suggestion was embedding RAG with a vector database. I pushed back: the data is tabular and structured, not unstructured text, and embedding individual rows produces low-quality vectors because there's no semantic richness in a payment record. Claude agreed and proposed Text-to-SQL instead. I kept that direction. The distinction matters — knowing when not to use a technique is as important as knowing when to use it, and I wanted the architecture to reflect a deliberate choice rather than defaulting to whatever is most fashionable.

**Interaction 3 — Token limit bug**

Claude generated a valid, complex SQL query using `CASE WHEN` pivots to compare year-over-year spending. The query failed with `SqliteError: incomplete input`. I looked at the governance log — the logged SQL ended mid-clause with just `ORDER`, and the output token count was exactly 300, the limit I had set. The model didn't choose to stop; it got cut off by the ceiling. I increased the SQL generation token limit to 1024. This is also a concrete example of why logging every AI output matters: without the logged SQL I would have seen only the SQLite error and had no idea where the truncation happened.
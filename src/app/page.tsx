"use client";

import { useState, useRef, KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from 'react-markdown'
import AiLogPanel from "@/components/AiLogPanel";
import { AiLogEntry, ChartPayload } from "@/lib/types";

const SpendingChart = dynamic(() => import("@/components/SpendingChart"), {
  ssr: false,
});

const SUGGESTED_QUESTIONS = [
  "Which agencies spent the most in 2023?",
  "How did Health Care Authority spending change year over year?",
  "What categories had the biggest increases from 2022 to 2023?",
  "Who were the top 5 vendors by total payments?",
  "How much went to construction vs healthcare?",
  "Which vendors saw the biggest spending jumps?",
];

interface AnswerState {
  text: string;
  chart: ChartPayload | null;
  sql: string | null;
  log: AiLogEntry[];
  query: string;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AnswerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [sqlOpen, setSqlOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(q?: string) {
    const finalQuery = q ?? query.trim();
    if (!finalQuery || loading) return;

    setQuery(finalQuery);
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSqlOpen(false);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: finalQuery }),
      });

      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setAnswer({
        text: data.answer,
        chart: data.chart,
        sql: data.sql ?? null,
        log: data.log ?? [],
        query: finalQuery,
      });

      setHistory((h) => {
        const next = [finalQuery, ...h.filter((x) => x !== finalQuery)].slice(0, 6);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") ask();
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="header-eyebrow">Washington State · FY 2022–2023</div>
          <h1 className="header-title">Spending Explorer</h1>
          <p className="header-sub">
            Ask any question about vendor payments — no SQL required.
          </p>
        </div>
      </header>

      <main className="main">
        {/* Suggested chips */}
        <section aria-label="Suggested questions" className="chips-section">
          <p className="chips-label">Try asking</p>
          <div className="chips">
            {SUGGESTED_QUESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)} disabled={loading}>
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Search bar */}
        <div className="search-row">
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about Washington State spending…"
            aria-label="Question input"
            disabled={loading}
          />
          <button
            className="search-btn"
            onClick={() => ask()}
            disabled={loading || !query.trim()}
            aria-label="Ask"
          >
            {loading ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="loading-bar" role="status" aria-live="polite">
            <div className="loading-dots"><span /><span /><span /></div>
            <span className="loading-text">Generating query and analyzing data…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-card" role="alert">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Answer */}
        {answer && !loading && (
          <section className="answer-section" aria-label="Answer">
            <div className="answer-query-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {answer.query}
            </div>

            <div className="answer-card">
              <div className="answer-text"><ReactMarkdown>{answer.text}</ReactMarkdown></div>

              {answer.chart && (
                <div className="chart-section">
                  <div className="chart-title">{answer.chart.title}</div>
                  <SpendingChart data={answer.chart} />
                </div>
              )}
            </div>

            {/* Generated SQL — hidden by default, available for power users */}
            {answer.sql && (
              <div className="sql-section">
                <button
                  className="log-toggle"
                  onClick={() => setSqlOpen((o) => !o)}
                  aria-expanded={sqlOpen}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
                  </svg>
                  {sqlOpen ? "Hide" : "Show"} generated SQL
                </button>
                {sqlOpen && (
                  <pre className="sql-block">{answer.sql}</pre>
                )}
              </div>
            )}

            <AiLogPanel entries={answer.log} />
          </section>
        )}

        {/* History */}
        {history.length > 1 && (
          <section className="history-section" aria-label="Recent questions">
            <p className="history-label">Recent questions</p>
            <ul className="history-list">
              {history.slice(1).map((q) => (
                <li key={q}>
                  <button className="history-item" onClick={() => ask(q)} disabled={loading}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                    </svg>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

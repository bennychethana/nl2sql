import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { logAiEvent, sessionLog } from "@/lib/aiLogger";
import { buildSqlPrompt, buildAnswerPrompt } from "@/lib/promptBuilder";
import { runQuery } from "@/lib/db";
import { ChartPayload, QueryResponse } from "@/lib/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  sessionLog.length = 0;

  let query: string;
  try {
    ({ query } = await req.json());
    if (!query || typeof query !== "string") throw new Error("missing query");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  logAiEvent("user_query", { query });

  // ── STEP 1: Generate SQL ─────────────────────────────────────────────────
  const sqlSystemPrompt = buildSqlPrompt();
  logAiEvent("system_prompt", {
    step: "sql_generation",
    charCount: sqlSystemPrompt.length,
  });

  let sql: string;
  try {
    const sqlMessage = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: sqlSystemPrompt,
      messages: [{ role: "user", content: query }],
    });

    sql = sqlMessage.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    logAiEvent("model_response", {
      step: "sql_generation",
      model: sqlMessage.model,
      inputTokens: sqlMessage.usage.input_tokens,
      outputTokens: sqlMessage.usage.output_tokens,
      sql,
    });
  } catch (err) {
    logAiEvent("error", { step: "sql_generation", message: String(err) });
    return NextResponse.json({ error: "SQL generation failed" }, { status: 502 });
  }

  // Handle unsupported questions
  if (sql === "UNSUPPORTED") {
    return NextResponse.json({
      answer: "I couldn't find a way to answer that from the available spending data. Try asking about agencies, vendors, categories, or fiscal years.",
      chart: null,
      sql: null,
      log: sessionLog,
    });
  }

  // ── STEP 2: Run the SQL ──────────────────────────────────────────────────
  let queryResult;
  try {
    queryResult = runQuery(sql);
    logAiEvent("sql_execution", {
      rowCount: queryResult.rowCount,
      truncated: queryResult.truncated,
      columns: queryResult.columns,
    });
  } catch (err) {
    logAiEvent("error", { step: "sql_execution", message: String(err) });
    return NextResponse.json({ error: `Query failed: ${String(err)}` }, { status: 400 });
  }

  // ── STEP 3: Generate plain-English answer ────────────────────────────────
  const answerSystemPrompt = buildAnswerPrompt(query, sql, queryResult);
  logAiEvent("system_prompt", {
    step: "answer_generation",
    charCount: answerSystemPrompt.length,
    resultRows: queryResult.rows.length,
  });

  let rawText: string;
  try {
    const answerMessage = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: answerSystemPrompt,
      messages: [{ role: "user", content: query }],
    });

    rawText = answerMessage.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    logAiEvent("model_response", {
      step: "answer_generation",
      model: answerMessage.model,
      inputTokens: answerMessage.usage.input_tokens,
      outputTokens: answerMessage.usage.output_tokens,
    });
  } catch (err) {
    logAiEvent("error", { step: "answer_generation", message: String(err) });
    return NextResponse.json({ error: "Answer generation failed" }, { status: 502 });
  }

  // ── STEP 4: Parse chart JSON ─────────────────────────────────────────────
  const chartMatch = rawText.match(/```chart\n?([\s\S]*?)```/);
  let chart: ChartPayload | null = null;
  const answerText = rawText.replace(/```chart[\s\S]*?```/g, "").trim();

  if (chartMatch) {
    try {
      const parsed = JSON.parse(chartMatch[1].trim()) as ChartPayload;
      if (
        (parsed.type === "bar" || parsed.type === "line") &&
        Array.isArray(parsed.labels) &&
        Array.isArray(parsed.values) &&
        parsed.labels.length === parsed.values.length &&
        parsed.labels.length >= 2
      ) {
        chart = parsed;
        logAiEvent("chart_parse", { success: true, type: chart.type, points: chart.labels.length });
      } else {
        logAiEvent("chart_parse", { success: false, reason: "schema mismatch" });
      }
    } catch (e) {
      logAiEvent("chart_parse", { success: false, reason: String(e) });
    }
  }

  const response: QueryResponse & { sql: string } = {
    answer: answerText,
    chart,
    sql,
    log: sessionLog,
  };

  return NextResponse.json(response);
}

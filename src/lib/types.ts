export interface FiscalRecord {
  Bien: string;
  FY: number;
  FMonth: number;
  Agy: number;
  Agency: string;
  Object: string;
  Category: string;
  Subobj: string;
  SubCategory: string;
  Vendor: string;
  Amount: number;
}

export interface ChartPayload {
  type: "bar" | "line";
  title: string;
  labels: string[];
  values: number[];
  unit: string;
}

export interface QueryResponse {
  answer: string;
  chart: ChartPayload | null;
  sql?: string | null;
  log?: AiLogEntry[];
}

export interface AiLogEntry {
  timestamp: string;
  type: "user_query" | "system_prompt" | "model_response" | "sql_execution" | "chart_parse" | "error";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
}

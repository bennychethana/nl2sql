"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { ChartPayload } from "@/lib/types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Filler
);

const PALETTE = [
  "#2563EB", "#059669", "#D97706", "#DC2626",
  "#7C3AED", "#DB2777", "#0891B2", "#65A30D",
];

interface Props {
  data: ChartPayload;
}

export default function SpendingChart({ data }: Props) {
  const isLine = data.type === "line";
  const isHorizontal = !isLine && data.labels.length > 4;

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: data.title,
        data: data.values,
        backgroundColor: isLine
          ? "rgba(37,99,235,0.1)"
          : data.labels.map((_, i) => PALETTE[i % PALETTE.length] + "CC"),
        borderColor: isLine ? "#2563EB" : data.labels.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: isLine ? 2 : 1,
        borderRadius: isLine ? 0 : 4,
        fill: isLine,
        tension: 0.3,
        pointBackgroundColor: "#2563EB",
        pointRadius: isLine ? 4 : 0,
      },
    ],
  };

  const height = isHorizontal ? Math.max(280, data.labels.length * 42 + 60) : 260;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: (isHorizontal ? "y" : "x") as "x" | "y",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { x: number; y: number } }) => {
            const v = isHorizontal ? ctx.parsed.x : ctx.parsed.y;
            return `${data.unit ?? ""}${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(128,128,128,0.08)" },
        ticks: {
          font: { size: 11 },
          color: "#888",
          callback: (v: string | number) =>
            typeof v === "number"
              ? `${data.unit ?? ""}${v.toLocaleString()}`
              : v,
        },
      },
      y: {
        grid: { color: "rgba(128,128,128,0.08)" },
        ticks: { font: { size: 11 }, color: "#888" },
      },
    },
  };

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      {isLine ? (
        <Line
          data={chartData}
          options={options}
          aria-label={data.title}
        />
      ) : (
        <Bar
          data={chartData}
          options={options}
          aria-label={data.title}
        />
      )}
    </div>
  );
}

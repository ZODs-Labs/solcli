#!/usr/bin/env tsx
import { performance } from "node:perf_hooks";
import process from "node:process";
import { execa } from "execa";

const samples = 12;
const bin = "apps/cli/dist/bin/solcli.js";
const cases = [
  { name: "version", args: ["--version"], p95BudgetMs: 250 },
  { name: "help", args: ["--help"], p95BudgetMs: 350 },
  { name: "json-help", args: ["help", "formatting", "--output", "json"], p95BudgetMs: 500 },
] as const;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

for (const c of cases) {
  const durations: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const started = performance.now();
    await execa(process.execPath, [bin, ...c.args], {
      env: { NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1", SOLCLI_HOME: "" },
    });
    durations.push(performance.now() - started);
  }
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  console.log(`${c.name}: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
  if (process.env.CI === "true" && p95 > c.p95BudgetMs) {
    throw new Error(`${c.name} p95 ${p95.toFixed(1)}ms exceeds ${c.p95BudgetMs}ms`);
  }
}

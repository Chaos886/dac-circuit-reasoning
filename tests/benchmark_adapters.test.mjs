import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { prepareTask, referenceTrace } from '../src/state_trace.mjs';
import { benchmarkAdapterTasks } from '../src/benchmark_adapters.mjs';

const tasks = benchmarkAdapterTasks();
const checks = [];
// Exhaustive checks against independently expressed Boolean/integer equations.
// Neither comparison invokes an HDL simulator or proves the source-to-AST mapping.
const fsm = prepareTask(tasks[0]);
for (let old = 0; old < 2; old++) for (let reset = 0; reset < 2; reset++) for (let input = 0; input < 2; input++) {
  const actual = fsm.step({ state: Boolean(old) }, { reset: Boolean(reset), in_bit: Boolean(input) });
  const expected = reset ? 1 : input ? old : 1 - old;
  assert.equal(Number(actual.state), expected);
}
checks.push({ taskId: tasks[0].id, assignments: 8, status: 'PASS' });
const shift = prepareTask(tasks[1]);
for (let old = 0; old < 256; old++) for (let d = 0; d < 2; d++) {
  const state = Object.fromEntries(shift.states.map((name, i) => [name, Boolean(old & 2 ** i)]));
  const actual = shift.step(state, { d: Boolean(d) });
  const packed = shift.states.reduce((n, name, i) => n + Number(actual[name]) * 2 ** i, 0);
  assert.equal(packed, (old >>> 1) | (d << 7));
}
checks.push({ taskId: tasks[1].id, assignments: 512, status: 'PASS' });
const report = { date: '2026-10-15', checks,
  status: 'CANDIDATE_ADAPTERS_ONLY', simulatorValidated: false,
  evidence: '520 one-step comparisons with independent equations; no HDL execution, upstream benchmark score or LLM run' };
await writeFile('results/benchmark-adapter-checks.json', JSON.stringify(report, null, 2) + '\n');
await writeFile('benchmarks/adapted-tasks.jsonl', tasks.map(t => JSON.stringify(t)).join('\n') + '\n');
await writeFile('results/benchmark-adapter-reference.jsonl', tasks.map(t => JSON.stringify(referenceTrace(t))).join('\n') + '\n');
console.log(JSON.stringify(report, null, 2));

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { traceSuite } from './trace_cases.mjs';
import { referenceTrace, scoreTrace, injectedContinuation } from './state_trace.mjs';

export async function runTracePilot(outDir = 'results') {
  const tasks = traceSuite();
  const scores = tasks.map(task => ({ taskId: task.id, family: task.family,
    referenceReplay: scoreTrace(task, referenceTrace(task)),
    injectedBitFlip: scoreTrace(task, injectedContinuation(task)) }));
  const report = { schemaVersion: 1, date: '2026-10-15',
    evidence: 'synthetic scorer controls only; not LLM predictions, HDL simulation or benchmark replication',
    taskCount: tasks.length, families: 6, horizons: [4, 8, 16, 32], seeds: [1, 17],
    cyclesPerControl: scores.reduce((n, r) => n + r.referenceReplay.horizon, 0),
    oracleExactTraces: scores.filter(r => r.referenceReplay.wholeTraceExact).length,
    injectedExactTraces: scores.filter(r => r.injectedBitFlip.wholeTraceExact).length,
    injectedFinalStateCorrect: scores.filter(r => r.injectedBitFlip.finalStateExact).length,
    injectedTracesWithReconvergence: scores.filter(r => r.injectedBitFlip.stateReconvergenceCycles.length).length,
    totalInjectedWrongStateCycles: scores.reduce((n, r) => n + r.injectedBitFlip.horizon - r.injectedBitFlip.exactStateCycles, 0),
    scores };
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'trace-pilot-results.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(outDir, 'trace-tasks.jsonl'), tasks.map(t => JSON.stringify(t)).join('\n') + '\n');
  await writeFile(resolve(outDir, 'trace-reference.jsonl'), tasks.map(t => JSON.stringify(referenceTrace(t))).join('\n') + '\n');
  const columns = ['taskId', 'family', 'horizon', 'stateAccuracy', 'outputAccuracy', 'firstStateDivergence', 'finalStateExact', 'validOwnPrefixTransitions', 'maskedStateErrorCycles'];
  const rows = scores.map(r => columns.map(k => r.injectedBitFlip[k]).join(','));
  await writeFile(resolve(outDir, 'trace-injection-results.csv'), [columns.join(','), ...rows].join('\n') + '\n');
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = process.argv.indexOf('--out');
  const r = await runTracePilot(out < 0 ? 'results' : process.argv[out + 1]);
  const { scores, ...summary } = r;
  console.log(JSON.stringify(summary, null, 2));
}

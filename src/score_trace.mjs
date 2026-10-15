import { readFile } from 'node:fs/promises';
import { scoreTrace, prepareTask } from './state_trace.mjs';

// Tasks and predictions are distinct files. Never take the trusted task from a model response.
try {
  if (process.argv.length !== 4) throw new Error('Usage: node src/score_trace.mjs trusted-tasks.jsonl predictions.jsonl');
  const readLines = async path => (await readFile(path, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const [tasks, predictions] = await Promise.all(process.argv.slice(2).map(readLines));
  const ids = new Set();
  tasks.forEach(t => { prepareTask(t); if (ids.has(t.id)) throw new Error('duplicate trusted task ID'); ids.add(t.id); });
  const byId = new Map();
  predictions.forEach(p => {
    if (!ids.has(p.taskId) || byId.has(p.taskId)) throw new Error('unknown or duplicate prediction ID');
    byId.set(p.taskId, p);
  });
  const reports = tasks.map(task => scoreTrace(task, byId.get(task.id)));
  console.log(JSON.stringify({ taskCount: tasks.length,
    invalidPredictions: reports.filter(r => r.status !== 'SCORED').length,
    exactTraces: reports.filter(r => r.wholeTraceExact).length,
    exactTraceRateIncludingInvalid: reports.filter(r => r.wholeTraceExact).length / tasks.length,
    reports }, null, 2));
  if (reports.some(r => r.status !== 'SCORED')) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: 'INVALID_RUN', error: error.message })); process.exitCode = 1;
}

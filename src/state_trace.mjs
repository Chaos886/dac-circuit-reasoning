/** Fixed-stimulus, two-state synchronous trace evaluation. No HDL parsing or proof. */
import { createHash } from 'node:crypto';
import { compileBooleanFunction } from './checker.mjs';

function fields(value, expected, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).some(k => typeof k !== 'string') ||
      Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) {
    throw new Error(path + ': unexpected or missing fields');
  }
}
function bits(value, names, path) {
  fields(value, names, path);
  for (const name of names) if (typeof value[name] !== 'boolean') throw new Error(path + '.' + name + ': expected Boolean (no X/Z)');
  return { ...value };
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
const equal = (a, b) => Object.keys(a).every(k => a[k] === b[k]);

/** The caller owns the trusted task; a prediction cannot redefine it. */
export function prepareTask(task) {
  fields(task, ['schemaVersion', 'id', 'family', 'semantics', 'stateBits', 'inputBits', 'initial', 'next', 'outputs', 'stimuli'], 'task');
  if (task.schemaVersion !== 1 || task.semantics !== 'single-clock-two-state') throw new Error('unsupported schema or semantics');
  for (const key of ['id', 'family']) if (typeof task[key] !== 'string' || !task[key].trim() || task[key].length > 200) throw new Error('invalid ' + key);
  if (!Array.isArray(task.stateBits) || !task.stateBits.length || !Array.isArray(task.inputBits)) throw new Error('invalid bit interface');
  const states = [...task.stateBits], inputs = [...task.inputBits], all = [...states, ...inputs];
  if (all.length > 16 || new Set(all).size !== all.length) throw new Error('bit limit or duplicate interface');
  fields(task.next, states, 'next');
  if (!task.outputs || Array.isArray(task.outputs) || typeof task.outputs !== 'object') throw new Error('invalid outputs');
  const outputs = Object.keys(task.outputs);
  if (!outputs.length || outputs.length > 32) throw new Error('output count must be in [1,32]');
  // Validate declared identifiers using the existing strict Boolean schema.
  compileBooleanFunction(all, task.outputs);
  const nextPorts = states.map((_, i) => {
    let name = 'trace_next_' + i;
    while (all.includes(name) || outputs.includes(name)) name = '_' + name;
    return name;
  });
  const nextFn = compileBooleanFunction(all, Object.fromEntries(states.map((s, i) => [nextPorts[i], task.next[s]])));
  const outputFn = compileBooleanFunction(all, task.outputs);
  const initial = bits(task.initial, states, 'initial');
  if (!Array.isArray(task.stimuli) || task.stimuli.length < 1 || task.stimuli.length > 256) throw new Error('horizon must be in [1,256]');
  const stimuli = task.stimuli.map((x, i) => Object.freeze(bits(x, inputs, 'stimuli[' + i + ']')));
  const taskHash = createHash('sha256').update(canonical(task)).digest('hex');
  return Object.freeze({ id: task.id, family: task.family, taskHash,
    states: Object.freeze(states), inputs: Object.freeze(inputs), outputs: Object.freeze(outputs),
    initial: Object.freeze(initial), stimuli: Object.freeze(stimuli),
    step(state, input) {
      const values = nextFn({ ...bits(state, states, 'state'), ...bits(input, inputs, 'input') });
      return Object.fromEntries(states.map((s, i) => [s, values[nextPorts[i]]]));
    },
    observe(state, input) {
      return outputFn({ ...bits(state, states, 'state'), ...bits(input, inputs, 'input') });
    },
  });
}

export function referenceTrace(task) {
  return traceFromPrepared(prepareTask(task));
}
function traceFromPrepared(p) {
  let state = { ...p.initial };
  return { schemaVersion: 1, taskId: p.id, taskHash: p.taskHash,
    rows: p.stimuli.map((input, i) => {
      state = p.step(state, input);
      return { cycle: i + 1, state: { ...state }, outputs: p.observe(state, input) };
    }) };
}

/** Strict scorer: samples after simultaneous state update, with x_t held. */
export function scoreTrace(task, prediction) {
  let p;
  try { p = prepareTask(task); } catch (error) { return { status: 'INVALID_TASK', error: error.message }; }
  try {
    fields(prediction, ['schemaVersion', 'taskId', 'taskHash', 'rows'], 'prediction');
    if (prediction.schemaVersion !== 1 || prediction.taskId !== p.id || prediction.taskHash !== p.taskHash) throw new Error('task identity/hash mismatch');
    if (!Array.isArray(prediction.rows) || prediction.rows.length !== p.stimuli.length) throw new Error('missing or extra cycles');
    prediction.rows.forEach((row, i) => {
      fields(row, ['cycle', 'state', 'outputs'], 'row');
      if (row.cycle !== i + 1) throw new Error('cycles must be ordered, one-based and consecutive');
      bits(row.state, p.states, 'predicted state'); bits(row.outputs, p.outputs, 'predicted outputs');
    });
  } catch (error) { return { status: 'INVALID_PREDICTION', taskId: p.id, taskHash: p.taskHash, error: error.message }; }
  const reference = traceFromPrepared(p);
  const cycles = prediction.rows.map((row, i) => {
    const previous = i ? prediction.rows[i - 1].state : p.initial;
    const selfOutput = p.observe(row.state, p.stimuli[i]);
    const stateExact = equal(row.state, reference.rows[i].state);
    return { cycle: i + 1, stateExact,
      outputExact: equal(row.outputs, reference.rows[i].outputs),
      transitionValidFromPredictedPrefix: equal(row.state, p.step(previous, p.stimuli[i])),
      outputsConsistentWithPredictedState: equal(row.outputs, selfOutput),
      stateErrorMaskedAtOutput: !stateExact && equal(selfOutput, reference.rows[i].outputs) };
  });
  const n = cycles.length, count = key => cycles.filter(row => row[key]).length;
  return { status: 'SCORED', taskId: p.id, family: p.family, taskHash: p.taskHash,
    scope: 'fixed-stimulus bounded trace; not unbounded verification or LLM measurement', horizon: n,
    exactStateCycles: count('stateExact'), exactOutputCycles: count('outputExact'),
    stateAccuracy: count('stateExact') / n, outputAccuracy: count('outputExact') / n,
    wholeTraceExact: cycles.every(r => r.stateExact && r.outputExact),
    finalStateExact: cycles.at(-1).stateExact, finalOutputExact: cycles.at(-1).outputExact,
    firstStateDivergence: cycles.find(r => !r.stateExact)?.cycle ?? null,
    firstOutputDivergence: cycles.find(r => !r.outputExact)?.cycle ?? null,
    validOwnPrefixTransitions: count('transitionValidFromPredictedPrefix'),
    selfConsistentOutputCycles: count('outputsConsistentWithPredictedState'),
    maskedStateErrorCycles: count('stateErrorMaskedAtOutput'),
    stateReconvergenceCycles: cycles.filter((r, i) => i && r.stateExact && !cycles[i - 1].stateExact).map(r => r.cycle),
    cycles };
}

/** Synthetic scorer control, not a model response or evidence about CoT. */
export function injectedContinuation(task, cycle = 2, bit) {
  const p = prepareTask(task);
  bit ??= p.states[0];
  if (!Number.isInteger(cycle) || cycle < 1 || cycle > p.stimuli.length || !p.states.includes(bit)) throw new Error('invalid injection');
  let state = { ...p.initial };
  return { schemaVersion: 1, taskId: p.id, taskHash: p.taskHash,
    rows: p.stimuli.map((input, i) => {
      state = p.step(state, input);
      if (i + 1 === cycle) state[bit] = !state[bit];
      return { cycle: i + 1, state: { ...state }, outputs: p.observe(state, input) };
    }) };
}

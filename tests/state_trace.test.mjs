import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareTask, referenceTrace, scoreTrace, injectedContinuation } from '../src/state_trace.mjs';
import { makeTraceTask, FAMILIES } from '../src/trace_cases.mjs';
const clone = value => JSON.parse(JSON.stringify(value));

// Independent arithmetic/imperative specification, rather than AST replay.
function expected(f, s, x) {
  let next;
  switch (f) {
    case 'pipeline': next = { q: x.d, r: s.q }; break;
    case 'counter': {
      const n = (Number(s.q0) + 2 * Number(s.q1) + Number(x.en)) % 4;
      next = { q0: Boolean(n & 1), q1: Boolean(n & 2) }; break;
    }
    case 'accumulator': {
      const n = (Number(s.a0) + 2 * Number(s.a1) + Number(x.d0) + 2 * Number(x.d1)) % 4;
      next = { a0: Boolean(n & 1), a1: Boolean(n & 2) }; break;
    }
    case 'handshake': next = { busy: s.busy ? !x.ack : x.req }; break;
    case 'buffer': {
      next = { ...s };
      if (x.rd) next.valid = false;
      if (x.wr && (!s.valid || x.rd)) { next.valid = true; next.data = x.din; }
      break;
    }
    case 'edge_detector': next = { last: x.sig, pulse: x.sig && !s.last }; break;
  }
  if (x.rst) for (const k of Object.keys(next)) next[k] = false;
  return next;
}
function observation(f, s) {
  if (f === 'pipeline') return { y: s.r };
  if (f === 'counter') return { y0: s.q0, y1: s.q1 };
  if (f === 'accumulator') return { y0: s.a0, y1: s.a1 };
  if (f === 'handshake') return { active: s.busy };
  if (f === 'buffer') return { out_valid: s.valid, dout: s.valid ? s.data : false };
  return { rising: s.pulse };
}
export function runTraceTests() {
  const results = [];
  const test = (name, fn) => { try { fn(); results.push({ name, status: 'PASS' }); }
    catch (error) { results.push({ name, status: 'FAIL', error: error.message }); } };
  for (const family of FAMILIES) test(family + ': all one-step assignments match an independent specification', () => {
    const p = prepareTask(makeTraceTask(family));
    for (let i = 0; i < 2 ** (p.states.length + p.inputs.length); i++) {
      const state = Object.fromEntries(p.states.map((s, j) => [s, Boolean(i & 2 ** j)]));
      const input = Object.fromEntries(p.inputs.map((s, j) => [s, Boolean(i & 2 ** (j + p.states.length))]));
      const next = p.step(state, input);
      assert.deepEqual(next, expected(family, state, input));
      assert.deepEqual(p.observe(next, input), observation(family, next));
    }
  });
  test('simultaneous updates use old q, not the newly assigned q', () => {
    const t = makeTraceTask('pipeline', 4);
    t.stimuli = [true, false, true, true].map(d => ({ rst: false, d }));
    assert.deepEqual(referenceTrace(t).rows.map(r => [r.state.q, r.state.r]),
      [[true, false], [false, true], [true, false], [true, true]]);
  });
  test('reset dominates data and clears both pipeline registers', () => {
    const t = makeTraceTask('pipeline', 1); t.initial = { q: true, r: true };
    t.stimuli = [{ rst: true, d: true }];
    assert.deepEqual(referenceTrace(t).rows[0].state, { q: false, r: false });
  });
  test('exact reference scores all cycles and the final state', () => {
    const t = makeTraceTask('counter'); const r = scoreTrace(t, referenceTrace(t));
    assert.equal(r.wholeTraceExact, true); assert.equal(r.stateAccuracy, 1); assert.equal(r.firstStateDivergence, null);
  });
  test('wrong state persists without reset even with valid later transitions', () => {
    const t = makeTraceTask('counter', 8); t.stimuli = t.stimuli.map(() => ({ rst: false, en: false }));
    const r = scoreTrace(t, injectedContinuation(t));
    assert.equal(r.firstStateDivergence, 2); assert.equal(r.exactStateCycles, 1);
    assert.equal(r.validOwnPrefixTransitions, 7); assert.equal(r.finalStateExact, false);
    assert.deepEqual(r.stateReconvergenceCycles, []);
  });
  test('synchronous reset can repair an incorrect prefix', () => {
    const t = makeTraceTask('counter', 8);
    t.stimuli = t.stimuli.map((_, i) => ({ rst: i === 3, en: false }));
    const r = scoreTrace(t, injectedContinuation(t));
    assert.deepEqual(r.stateReconvergenceCycles, [4]); assert.equal(r.finalStateExact, true);
    assert.equal(r.wholeTraceExact, false); assert.equal(r.exactStateCycles, 6);
  });
  test('pipeline output initially masks q error and exposes it next cycle', () => {
    const t = makeTraceTask('pipeline', 6); t.stimuli = t.stimuli.map(() => ({ rst: false, d: false }));
    const r = scoreTrace(t, injectedContinuation(t));
    assert.equal(r.firstOutputDivergence, 3); assert.equal(r.maskedStateErrorCycles, 1);
    assert.deepEqual(r.stateReconvergenceCycles, [4]);
  });
  test('output errors are scored independently of correct hidden state', () => {
    const t = makeTraceTask('pipeline'); const pred = referenceTrace(t); pred.rows[0].outputs.y = !pred.rows[0].outputs.y;
    const r = scoreTrace(t, pred); assert.equal(r.stateAccuracy, 1); assert.equal(r.wholeTraceExact, false);
    assert.equal(r.firstOutputDivergence, 1); assert.equal(r.selfConsistentOutputCycles, 7);
  });
  test('predictions cannot replace the trusted transition function', () => {
    const t = makeTraceTask('counter'); const p = referenceTrace(t); p.next = t.next;
    assert.equal(scoreTrace(t, p).status, 'INVALID_PREDICTION');
  });
  test('task hash detects a changed stimulus despite an unchanged ID', () => {
    const t = makeTraceTask('counter'); const p = referenceTrace(t); t.stimuli[2].en = !t.stimuli[2].en;
    assert.equal(scoreTrace(t, p).status, 'INVALID_PREDICTION');
  });
  test('canonical task hash ignores object field order', () => {
    const t = makeTraceTask('pipeline');
    const other = Object.fromEntries(Object.entries(t).reverse());
    assert.equal(prepareTask(t).taskHash, prepareTask(other).taskHash);
  });
  test('prepared evaluator is unaffected by subsequent task mutations', () => {
    const t = makeTraceTask('pipeline'); const p = prepareTask(t);
    t.next.q = { op: 'const', value: true }; t.initial.q = true; t.stimuli[0].rst = false; t.stateBits[0] = 'changed';
    assert.equal(p.initial.q, false); assert.equal(p.stimuli[0].rst, true);
    assert.deepEqual(p.step({ q: false, r: true }, { rst: false, d: false }), { q: false, r: false });
  });
  const invalidTasks = [
    ['missing initial bit', t => { delete t.initial.q; }],
    ['missing input at one edge', t => { delete t.stimuli[1].d; }],
    ['unknown initial state', t => { t.initial.q = 'X'; }],
    ['duplicate state/input bit', t => { t.inputBits.push('q'); }],
    ['undeclared next-state signal', t => { t.next.q = { op: 'input', name: 'ghost' }; }],
    ['unsupported clock semantics', t => { t.semantics = 'multi-clock'; }],
    ['excessive horizon', t => { t.stimuli = Array(257).fill(t.stimuli[0]); }],
    ['empty horizon', t => { t.stimuli = []; }],
    ['unsupported expression operator', t => { t.next.q = { op: 'eval', code: 'false' }; }],
    ['excessive bit count', t => { t.inputBits = Array.from({ length: 17 }, (_, i) => 'i' + i); }],
  ];
  for (const [name, mutate] of invalidTasks) test('reject ' + name, () => {
    const t = makeTraceTask('pipeline'); mutate(t); assert.equal(scoreTrace(t, {}).status, 'INVALID_TASK');
  });
  const invalidPredictions = [
    ['omitted prediction', () => undefined],
    ['missing row', p => { p.rows.pop(); return p; }],
    ['extra row', p => { p.rows.push(p.rows[0]); return p; }],
    ['misnumbered cycles', p => { p.rows[0].cycle = 0; return p; }],
    ['numeric bit', p => { p.rows[0].state.q = 0; return p; }],
    ['unknown output bit', p => { p.rows[0].outputs.y = 'Z'; return p; }],
    ['invented internal signal', p => { p.rows[0].state.hidden = false; return p; }],
  ];
  for (const [name, mutate] of invalidPredictions) test('reject ' + name, () => {
    const t = makeTraceTask('pipeline'); assert.equal(scoreTrace(t, mutate(referenceTrace(t))).status, 'INVALID_PREDICTION');
  });
  test('invalid intervention cycle is refused', () => assert.throws(() => injectedContinuation(makeTraceTask('counter'), 0)));
  return { suite: 'single-clock-state-trace', tests: results.length,
    passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const r = runTraceTests(); console.log(JSON.stringify(r, null, 2)); if (r.failed) process.exitCode = 1;
}

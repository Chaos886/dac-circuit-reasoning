/** Original synthetic diagnostics. No third-party benchmark designs copied. */
const v = name => ({ op: 'input', name });
const c = value => ({ op: 'const', value });
const not = arg => ({ op: 'not', arg });
const and = (left, right) => ({ op: 'and', left, right });
const or = (left, right) => ({ op: 'or', left, right });
const xor = (left, right) => ({ op: 'xor', left, right });
const mux = (sel, whenTrue, whenFalse) => ({ op: 'mux', sel, whenTrue, whenFalse });
const reset = expression => mux(v('rst'), c(false), expression);

function definition(family) {
  if (family === 'pipeline') return { states: ['q', 'r'], inputs: ['rst', 'd'],
    next: { q: reset(v('d')), r: reset(v('q')) }, outputs: { y: v('r') } };
  if (family === 'counter') return { states: ['q0', 'q1'], inputs: ['rst', 'en'],
    next: { q0: reset(xor(v('q0'), v('en'))), q1: reset(xor(v('q1'), and(v('en'), v('q0')))) },
    outputs: { y0: v('q0'), y1: v('q1') } };
  if (family === 'accumulator') return { states: ['a0', 'a1'], inputs: ['rst', 'd0', 'd1'],
    next: { a0: reset(xor(v('a0'), v('d0'))), a1: reset(xor(xor(v('a1'), v('d1')), and(v('a0'), v('d0')))) },
    outputs: { y0: v('a0'), y1: v('a1') } };
  if (family === 'handshake') return { states: ['busy'], inputs: ['rst', 'req', 'ack'],
    next: { busy: reset(mux(v('busy'), not(v('ack')), v('req'))) }, outputs: { active: v('busy') } };
  if (family === 'buffer') {
    // A write is accepted when empty or when the old item is consumed at this edge.
    const accept = and(v('wr'), or(not(v('valid')), v('rd')));
    return { states: ['valid', 'data'], inputs: ['rst', 'wr', 'rd', 'din'],
      next: { valid: reset(or(accept, and(v('valid'), not(v('rd'))))), data: reset(mux(accept, v('din'), v('data'))) },
      outputs: { out_valid: v('valid'), dout: and(v('valid'), v('data')) } };
  }
  if (family === 'edge_detector') return { states: ['last', 'pulse'], inputs: ['rst', 'sig'],
    next: { last: reset(v('sig')), pulse: reset(and(v('sig'), not(v('last')))) }, outputs: { rising: v('pulse') } };
  throw new Error('unknown family');
}
export const FAMILIES = ['pipeline', 'counter', 'accumulator', 'handshake', 'buffer', 'edge_detector'];
export function makeTraceTask(family, horizon = 8, seed = 1) {
  const d = definition(family);
  let rng = seed >>> 0;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return Boolean(rng & 0x80000000); };
  const stimuli = Array.from({ length: horizon }, (_, i) => Object.fromEntries(d.inputs.map(name =>
    [name, name === 'rst' ? i === 0 || i === Math.floor(horizon / 2) : random()])));
  return { schemaVersion: 1, id: family + '-h' + horizon + '-s' + seed, family,
    semantics: 'single-clock-two-state', stateBits: d.states, inputBits: d.inputs,
    initial: Object.fromEntries(d.states.map(name => [name, false])), next: d.next, outputs: d.outputs, stimuli };
}
export function traceSuite() {
  return FAMILIES.flatMap(f => [4, 8, 16, 32].flatMap(h => [1, 17].map(s => makeTraceTask(f, h, s))));
}

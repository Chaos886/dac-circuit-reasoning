/**
 * Small, hand-constructed sanity suite. These fixtures are deterministic
 * correctness probes, not an independent benchmark or LLM evaluation.
 */
export const input = name => ({ op: 'input', name });
export const constant = value => ({ op: 'const', value });
export const not = arg => ({ op: 'not', arg });
export const and = (left, right) => ({ op: 'and', left, right });
export const or = (left, right) => ({ op: 'or', left, right });
export const xor = (left, right) => ({ op: 'xor', left, right });
export const mux = (sel, whenTrue, whenFalse) => ({ op: 'mux', sel, whenTrue, whenFalse });

export function buildPilotCases() {
  const a = input('a'), b = input('b'), c = input('c'), s = input('s');
  const cases = [];
  function add(id, family, reference, candidate, expectedStatus = 'VERIFIED', contract, ports = ['a', 'b', 'c', 's']) {
    const request = {
      schemaVersion: 1, id, proposer: 'deterministic-pilot', inputs: ports,
      reference: { y: reference }, candidate: { y: candidate },
      ...(contract === undefined ? {} : { contract }),
    };
    cases.push({ family, expectedStatus, request });
  }
  add('absorption_01', 'absorption', or(a, and(a, b)), a);
  add('absorption_02', 'absorption', and(a, or(a, b)), a);
  add('absorption_03', 'absorption', or(not(a), and(not(a), b)), not(a));
  add('absorption_04', 'absorption', or(and(a, b), and(and(a, b), c)), and(a, b));
  add('absorption_05', 'absorption', and(xor(a, b), or(xor(a, b), c)), xor(a, b));

  add('distributivity_01', 'distributivity', or(and(a, b), and(a, c)), and(a, or(b, c)));
  add('distributivity_02', 'distributivity', and(or(a, b), or(a, c)), or(a, and(b, c)));
  add('distributivity_03', 'distributivity', or(and(not(a), b), and(not(a), c)), and(not(a), or(b, c)));
  add('distributivity_04', 'distributivity', or(and(a, not(b)), and(a, c)), and(a, or(not(b), c)));
  add('distributivity_05', 'distributivity', and(or(xor(a, b), c), or(xor(a, b), s)), or(xor(a, b), and(c, s)));

  add('xor_cancellation_01', 'xor-cancellation', xor(xor(a, b), b), a);
  add('xor_cancellation_02', 'xor-cancellation', xor(a, a), constant(false));
  add('xor_cancellation_03', 'xor-cancellation', xor(xor(a, b), a), b);
  add('xor_cancellation_04', 'xor-cancellation', xor(not(a), not(a)), constant(false));
  add('xor_cancellation_05', 'xor-cancellation', xor(xor(a, xor(b, c)), xor(b, c)), a);

  add('mux_contract_01', 'mux-under-contract', mux(s, a, b), a, 'VERIFIED', s);
  add('mux_contract_02', 'mux-under-contract', mux(s, a, b), b, 'VERIFIED', not(s));
  add('mux_contract_03', 'mux-under-contract', mux(s, a, b), a, 'VERIFIED', not(xor(a, b)));
  add('mux_contract_04', 'mux-under-contract', mux(xor(a, b), c, a), c, 'VERIFIED', xor(a, b));
  add('mux_contract_05', 'mux-under-contract', mux(s, and(a, b), c), a, 'VERIFIED', and(s, b));

  add('invalid_01', 'invalid-rewrite', and(a, b), or(a, b), 'REJECTED');
  add('invalid_02', 'invalid-rewrite', xor(a, b), or(a, b), 'REJECTED');
  add('invalid_03', 'invalid-rewrite', mux(s, a, b), a, 'REJECTED');
  add('invalid_04', 'invalid-rewrite', or(a, and(a, b)), b, 'REJECTED');
  add('invalid_05', 'invalid-rewrite', or(and(a, b), c), and(a, or(b, c)), 'REJECTED');

  cases.push({
    family: 'multi-output', expectedStatus: 'VERIFIED',
    request: {
      schemaVersion: 1, id: 'multi_output_01', proposer: 'deterministic-pilot', inputs: ['a', 'b', 's'],
      reference: { y: xor(xor(a, b), b), z: mux(s, a, b) },
      candidate: { y: a, z: mux(s, a, b) },
    },
  });
  cases.push({
    family: 'multi-output', expectedStatus: 'REJECTED',
    request: {
      schemaVersion: 1, id: 'multi_output_02', proposer: 'deterministic-pilot', inputs: ['a', 'b'],
      reference: { y: a, z: b }, candidate: { y: a, z: not(b) },
    },
  });
  return cases;
}

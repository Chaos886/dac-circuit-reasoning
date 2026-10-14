import { input, constant, xor, mux } from '../src/pilot_cases.mjs';

/** Explicit tiny examples, with independently specified fixed A and boundary B. */
export function buildDeploymentExamples() {
  const a = input('a'), b = input('b'), s = input('s');
  const u = input('u'), v = input('v'), x = input('x'), q = input('q');
  const localRequest = {
    schemaVersion: 1, id: 'mux-local-contract', proposer: 'deterministic-pilot',
    inputs: ['a', 'b', 's'],
    reference: { y: mux(s, a, b) }, candidate: { y: a }, contract: s,
  };
  const unsafeEnvironment = {
    schemaVersion: 1, inputs: ['u', 'v', 'x', 'q'],
    boundary: { a: u, b: v, s: x }, assumption: constant(true),
  };
  const safeEnvironment = {
    schemaVersion: 1, inputs: ['u', 'v', 'x', 'q'],
    boundary: { a: u, b: v, s: constant(true) }, assumption: constant(true),
  };
  const safeByFixedAssumption = {
    schemaVersion: 1, inputs: ['u', 'v', 'x', 'q'],
    boundary: { a: u, b: v, s: x }, assumption: x,
  };
  function wholeRequest(id, selector, contract = constant(true)) {
    return {
      schemaVersion: 1, id, proposer: 'deterministic-pilot',
      inputs: ['u', 'v', 'x', 'q'],
      reference: { y: xor(q, mux(selector, u, v)) },
      candidate: { y: xor(q, u) }, contract,
    };
  }
  return [
    { id: 'unsafe-boundary', localRequest, environment: unsafeEnvironment,
      expectedDeploymentEligible: false, wholeRequest: wholeRequest('whole-unsafe', x) },
    { id: 'constant-safe-boundary', localRequest, environment: safeEnvironment,
      expectedDeploymentEligible: true, wholeRequest: wholeRequest('whole-safe-constant', constant(true)) },
    { id: 'safe-under-fixed-assumption', localRequest, environment: safeByFixedAssumption,
      expectedDeploymentEligible: true, wholeRequest: wholeRequest('whole-safe-assumption', x, x) },
  ];
}

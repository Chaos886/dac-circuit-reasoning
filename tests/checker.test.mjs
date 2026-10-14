import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyCandidate, verifyEnvironment, verifyDeployment, emitVerilog } from '../src/checker.mjs';
import { input, constant, not, and, or, xor, mux, buildPilotCases } from '../src/pilot_cases.mjs';
import { buildDeploymentExamples } from '../examples/deployment_examples.mjs';
import { verifyJsonText } from '../src/verify_candidate.mjs';

const jsonClone = value => JSON.parse(JSON.stringify(value));

function base(overrides = {}) {
  return {
    schemaVersion: 1, id: 'test', proposer: 'deterministic-pilot',
    inputs: ['a', 'b'], reference: { y: input('a') }, candidate: { y: input('a') },
    ...overrides,
  };
}

export function runTests() {
  const results = [];
  function test(name, action) {
    try { action(); results.push({ name, status: 'PASS' }); }
    catch (error) { results.push({ name, status: 'FAIL', error: error.stack || error.message }); }
  }
  test('identity exhaustively checks all assignments', () => {
    const result = verifyCandidate(base());
    assert.equal(result.status, 'VERIFIED');
    assert.equal(result.totalAssignments, 4);
    assert.equal(result.checkedAssignments, 4);
    assert.equal(result.validAssignments, 4);
    assert.equal(result.validAssignmentsExhaustive, true);
  });
  test('conditional mux rewrite checks only satisfying inputs', () => {
    const a = input('a'), b = input('b'), s = input('s');
    const result = verifyCandidate(base({ inputs: ['a', 'b', 's'],
      reference: { y: mux(s, a, b) }, candidate: { y: a }, contract: s }));
    assert.equal(result.status, 'VERIFIED');
    assert.equal(result.totalAssignments, 8);
    assert.equal(result.validAssignments, 4);
  });
  test('dropping the mux contract exposes a reproducible counterexample', () => {
    const result = verifyCandidate(base({ inputs: ['a', 'b', 's'],
      reference: { y: mux(input('s'), input('a'), input('b')) } }));
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, 'OUTPUT_MISMATCH');
    assert.deepEqual(result.counterexample.assignment, { a: true, b: false, s: false });
    assert.deepEqual(result.counterexample.referenceOutputs, { y: false });
    assert.deepEqual(result.counterexample.candidateOutputs, { y: true });
    assert.equal(result.validAssignments, 8);
    assert.equal(result.enumerationComplete, true);
  });
  test('counterexample obeys a nontrivial contract', () => {
    const result = verifyCandidate(base({
      reference: { y: input('a') }, candidate: { y: not(input('a')) }, contract: input('b'),
    }));
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.counterexample.assignment.b, true);
    assert.equal(result.validAssignments, 2);
  });
  test('unsatisfiable premise is rejected even for identical circuits', () => {
    const result = verifyCandidate(base({ contract: and(input('a'), not(input('a'))) }));
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.reason, 'UNSATISFIABLE_CONTRACT');
    assert.equal(result.validAssignments, 0);
    assert.equal(result.contractSatisfiable, false);
    assert.equal(result.counterexample, null);
  });
  test('false constant premise is rejected', () => {
    assert.equal(verifyCandidate(base({ contract: constant(false) })).reason, 'UNSATISFIABLE_CONTRACT');
  });
  test('zero-input constant identity has one valid assignment', () => {
    const result = verifyCandidate(base({ inputs: [], reference: { y: constant(true) }, candidate: { y: constant(true) } }));
    assert.equal(result.status, 'VERIFIED');
    assert.equal(result.validAssignments, 1);
  });
  test('zero-input constant mismatch returns an empty assignment', () => {
    const result = verifyCandidate(base({ inputs: [], reference: { y: constant(true) }, candidate: { y: constant(false) } }));
    assert.equal(result.status, 'REJECTED');
    assert.deepEqual(result.counterexample.assignment, {});
  });
  test('multi-output mismatch names the broken output', () => {
    const result = verifyCandidate(base({
      reference: { y: input('a'), z: input('b') },
      candidate: { z: not(input('b')), y: input('a') },
    }));
    assert.deepEqual(result.counterexample.mismatches, ['z']);
  });
  test('identical ordered subexpressions are deduplicated across outputs', () => {
    const result = verifyCandidate(base({
      reference: { y: or(and(input('a'), input('b')), and(input('a'), input('b'))), z: and(input('a'), input('b')) },
      candidate: { y: and(input('a'), input('b')), z: and(input('a'), input('b')) },
    }));
    assert.equal(result.status, 'VERIFIED');
    assert.equal(result.metrics.reference.uniqueLogicGates, 2);
    assert.equal(result.metrics.reference.depth, 2);
    assert.equal(result.metrics.candidate.uniqueLogicGates, 1);
    assert.equal(result.metrics.candidate.depth, 1);
  });
  test('commuted expressions remain distinct structural keys', () => {
    const result = verifyCandidate(base({
      reference: { y: and(input('a'), input('b')), z: and(input('b'), input('a')) },
      candidate: { y: and(input('a'), input('b')), z: and(input('b'), input('a')) },
    }));
    assert.equal(result.metrics.reference.uniqueLogicGates, 2);
  });

  for (const [name, mutate] of [
    ['duplicate input ports', request => { request.inputs = ['a', 'a']; }],
    ['undeclared reference input', request => { request.reference.y = input('missing'); }],
    ['undeclared candidate input', request => { request.candidate.y = input('missing'); }],
    ['undeclared contract input', request => { request.contract = input('missing'); }],
    ['different output interface', request => { request.candidate = { z: input('a') }; }],
    ['input/output collision', request => { request.inputs = ['a', 'y']; }],
    ['empty output interface', request => { request.reference = {}; request.candidate = {}; }],
    ['invalid input identifier', request => { request.inputs[0] = 'a-b'; }],
    ['reserved input identifier', request => { request.inputs[0] = 'wire'; }],
    ['prototype-sensitive input identifier', request => { request.inputs[0] = '__proto__'; }],
    ['non-Boolean constant', request => { request.candidate.y = { op: 'const', value: 1 }; }],
    ['numeric unknown operation', request => { request.candidate.y = { op: 1 }; }],
    ['array-coerced operation', request => { request.candidate.y = { op: ['input'], name: 'a' }; }],
    ['unknown AST field', request => { request.candidate.y.typo = true; }],
    ['missing AST child', request => { request.candidate.y = { op: 'not' }; }],
    ['unknown top-level field', request => { request.typo = true; }],
    ['explicit null contract', request => { request.contract = null; }],
    ['missing schemaVersion', request => { delete request.schemaVersion; }],
    ['custom prototype', request => { Object.setPrototypeOf(request.candidate.y, { inherited: true }); }],
    ['class instance', request => { class FakeNode { constructor() { this.op = 'input'; this.name = 'a'; } } request.candidate.y = new FakeNode(); }],
    ['cyclic AST', request => { const node = { op: 'not' }; node.arg = node; request.candidate.y = node; }],
  ]) {
    test('invalid request fails closed: ' + name, () => {
      const request = base(); mutate(request);
      const result = verifyCandidate(request);
      assert.equal(result.status, 'INCONCLUSIVE');
      assert.equal(result.reason, 'INVALID_REQUEST');
      assert.equal(result.enumerationComplete, false);
    });
  }
  test('null request fails closed', () => {
    assert.equal(verifyCandidate(null).reason, 'INVALID_REQUEST');
  });
  test('assignment budget refuses incomplete checking', () => {
    const result = verifyCandidate(base(), { maxAssignments: 3 });
    assert.equal(result.status, 'INCONCLUSIVE');
    assert.equal(result.reason, 'ASSIGNMENT_BUDGET_EXCEEDED');
    assert.equal(result.checkedAssignments, 0);
    assert.equal(result.validAssignmentsExhaustive, false);
  });
  test('more than 16 input ports fails closed', () => {
    const ports = Array.from({ length: 17 }, (_, index) => 'p' + index);
    const result = verifyCandidate(base({ inputs: ports, reference: { y: input('p0') }, candidate: { y: input('p0') } }));
    assert.equal(result.status, 'INCONCLUSIVE');
    assert.equal(result.reason, 'INPUT_LIMIT_EXCEEDED');
  });
  test('16 input ports are exhaustively supported', () => {
    const ports = Array.from({ length: 16 }, (_, index) => 'p' + index);
    const result = verifyCandidate(base({ inputs: ports, reference: { y: input('p15') }, candidate: { y: input('p15') } }));
    assert.equal(result.status, 'VERIFIED');
    assert.equal(result.checkedAssignments, 65536);
  });
  test('evaluation budget fails closed', () => {
    const result = verifyCandidate(base(), { maxEvaluationSteps: 1 });
    assert.equal(result.reason, 'EVALUATION_BUDGET_EXCEEDED');
    assert.equal(result.status, 'INCONCLUSIVE');
  });
  test('AST depth budget fails closed', () => {
    assert.equal(verifyCandidate(base({ candidate: { y: not(not(input('a'))) } }), { maxAstDepth: 2 }).status, 'INCONCLUSIVE');
  });
  test('AST node budget fails closed', () => {
    assert.equal(verifyCandidate(base(), { maxAstNodes: 1 }).status, 'INCONCLUSIVE');
  });
  test('invalid or enlarged limits are rejected', () => {
    for (const options of [{ maxInputs: 17 }, { maxAssignments: 0 }, { extra: 2 }, { maxAstDepth: Infinity }, null]) {
      assert.equal(verifyCandidate(base(), options).reason, 'INVALID_OPTIONS');
    }
  });
  test('restricted export includes two-state caveat and all outputs', () => {
    const output = emitVerilog(base({ reference: { y: input('a'), z: input('b') }, candidate: { y: input('a'), z: not(input('b')) } }));
    assert.match(output, /two-state and combinational/);
    assert.match(output, /Contract assumptions are NOT enforced/);
    assert.match(output, /assign z = \(~b\);/);
  });
  test('restricted export rejects unsafe module names', () => {
    assert.throws(() => emitVerilog(base(), 'candidate', 'evil;endmodule'));
    assert.throws(() => emitVerilog(base(), 'unknown'));
  });
  test('all 27 fixed fixtures match their declared statuses', () => {
    const cases = buildPilotCases();
    assert.equal(cases.length, 27);
    assert.equal(cases.filter(example => example.expectedStatus === 'VERIFIED').length, 21);
    for (const example of cases) assert.equal(verifyCandidate(example.request).status, example.expectedStatus, example.request.id);
  });

  const deploymentExamples = buildDeploymentExamples();
  test('local proof alone does not permit unsafe deployment', () => {
    const example = deploymentExamples[0];
    const result = verifyDeployment(example.localRequest, example.environment);
    assert.equal(result.localVerified, true);
    assert.equal(result.environmentVerified, false);
    assert.equal(result.deploymentEligible, false);
    assert.equal(result.environmentVerification.counterexample.assignment.x, false);
  });
  test('constant boundary discharges the independent contract obligation', () => {
    const example = deploymentExamples[1];
    const result = verifyDeployment(example.localRequest, example.environment);
    assert.equal(result.localVerified, true);
    assert.equal(result.environmentVerified, true);
    assert.equal(result.deploymentEligible, true);
  });
  test('fixed external assumption discharges contract without mutation', () => {
    const example = jsonClone(deploymentExamples[2]);
    const before = JSON.stringify(example.environment);
    assert.equal(verifyDeployment(example.localRequest, example.environment).deploymentEligible, true);
    assert.equal(JSON.stringify(example.environment), before);
  });
  test('unsatisfiable external assumption never permits deployment', () => {
    const example = jsonClone(deploymentExamples[1]);
    example.environment.assumption = constant(false);
    const result = verifyDeployment(example.localRequest, example.environment);
    assert.equal(result.deploymentEligible, false);
    assert.equal(result.environmentVerification.reason, 'UNSATISFIABLE_CONTRACT');
  });
  test('boundary must map every local input exactly', () => {
    const example = jsonClone(deploymentExamples[1]);
    delete example.environment.boundary.b;
    assert.equal(verifyEnvironment(example.localRequest, example.environment).status, 'INCONCLUSIVE');
    example.environment.boundary.b = input('v');
    example.environment.boundary.extra = input('u');
    assert.equal(verifyEnvironment(example.localRequest, example.environment).status, 'INCONCLUSIVE');
  });
  test('boundary cannot refer to undeclared external inputs', () => {
    const example = jsonClone(deploymentExamples[1]);
    example.environment.boundary.a = input('undeclared');
    assert.equal(verifyEnvironment(example.localRequest, example.environment).status, 'INCONCLUSIVE');
  });
  test('false local rewrite never becomes eligible under a valid environment', () => {
    const example = jsonClone(deploymentExamples[1]);
    example.localRequest.candidate.y = not(input('a'));
    const result = verifyDeployment(example.localRequest, example.environment);
    assert.equal(result.localVerified, false);
    assert.equal(result.environmentVerified, true);
    assert.equal(result.deploymentEligible, false);
  });
  test('explicit whole-circuit checks agree with safe and unsafe examples', () => {
    for (const example of deploymentExamples) {
      assert.equal(verifyCandidate(example.wholeRequest).status === 'VERIFIED', example.expectedDeploymentEligible);
    }
  });
  test('external input may share a local input name', () => {
    const local = base({ inputs: ['a'], contract: input('a') });
    const environment = { schemaVersion: 1, inputs: ['a'], boundary: { a: input('a') }, assumption: input('a') };
    assert.equal(verifyDeployment(local, environment).deploymentEligible, true);
  });
  test('external obligation-like port name is handled without collision', () => {
    const local = base({ inputs: ['a'], contract: input('a') });
    const environment = { schemaVersion: 1, inputs: ['_contract_obligation'], boundary: { a: input('_contract_obligation') }, assumption: input('_contract_obligation') };
    assert.equal(verifyDeployment(local, environment).deploymentEligible, true);
  });
  test('JSON interface accepts a valid candidate', () => {
    assert.equal(verifyJsonText(JSON.stringify(base())).status, 'VERIFIED');
  });
  test('JSON interface rejects malformed candidate or environment', () => {
    assert.equal(verifyJsonText('{').reason, 'INVALID_JSON');
    assert.equal(verifyJsonText(JSON.stringify(base()), '{').reason, 'INVALID_JSON');
  });
  test('JSON interface preserves independent environment eligibility', () => {
    for (const example of deploymentExamples) {
      assert.equal(verifyJsonText(JSON.stringify(example.localRequest), JSON.stringify(example.environment)).deploymentEligible, example.expectedDeploymentEligible);
    }
  });
  return { suite: 'bounded-two-state-circuit-checker', tests: results.length,
    passed: results.filter(result => result.status === 'PASS').length,
    failed: results.filter(result => result.status === 'FAIL').length, results };
}

if (globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(resolve(globalThis.process.argv[1])).href) {
  const report = runTests();
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) globalThis.process.exitCode = 1;
}

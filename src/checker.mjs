/**
 * Exhaustive checker for bounded, two-state, combinational Boolean circuits.
 * No HDL parsing, four-state semantics, sequential state, timing, or PPA model.
 */
const LIMITS = Object.freeze({
  maxInputs: 16,
  maxAssignments: 65536,
  maxAstNodes: 10000,
  maxAstDepth: 64,
  maxEvaluationSteps: 20000000,
});
const RESERVED = new Set(('always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config deassign default defparam design disable edge else end endcase endconfig endfunction endgenerate endmodule endprimitive endspecify endtable endtask event for force forever fork function generate genvar highz0 highz1 if ifnone incdir include initial inout input instance integer join large liblist library localparam macromodule medium module nand negedge nmos nor noshowcancelled not notif0 notif1 or output parameter pmos posedge primitive pull0 pull1 pulldown pullup pulsestyle_onevent pulsestyle_ondetect rcmos real realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled signed small specify specparam strong0 strong1 supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg unsigned use vectored wait wand weak0 weak1 while wire wor xnor xor logic bit byte shortint int longint enum struct union package endpackage interface endinterface program endprogram modport typedef always_comb always_ff always_latch return do break continue unique priority class endclass virtual null this super').split(' '));
const SCHEMAS = Object.freeze({
  input: ['op', 'name'], const: ['op', 'value'], not: ['op', 'arg'],
  and: ['op', 'left', 'right'], or: ['op', 'left', 'right'],
  xor: ['op', 'left', 'right'], mux: ['op', 'sel', 'whenTrue', 'whenFalse'],
});

class ValidationError extends Error {}
const fail = message => { throw new ValidationError(message); };
function record(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path + ' must be a plain object');
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) fail(path + ' may not contain symbol keys');
}
function keys(value, allowed, required, path) {
  record(value, path);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(path + ': unknown field ' + key);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(path + ': missing field ' + key);
}
function portName(name, path) {
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      RESERVED.has(name) || name.length > 128 || ['__proto__', 'prototype', 'constructor'].includes(name)) {
    fail(path + ' must be a non-reserved, safe Verilog identifier of at most 128 characters');
  }
}
function readLimits(options) {
  keys(options, Object.keys(LIMITS), [], 'options');
  const result = { ...LIMITS };
  for (const [key, value] of Object.entries(options)) {
    const min = key === 'maxInputs' ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < min || value > LIMITS[key]) {
      fail('options.' + key + ' must be an integer in [' + min + ', ' + LIMITS[key] + ']');
    }
    result[key] = value;
  }
  return result;
}
function validate(request, limits) {
  keys(request, ['schemaVersion', 'id', 'proposer', 'inputs', 'reference', 'candidate', 'contract'],
    ['schemaVersion', 'id', 'proposer', 'inputs', 'reference', 'candidate'], 'request');
  if (request.schemaVersion !== 1) fail('request.schemaVersion must equal 1');
  for (const key of ['id', 'proposer']) {
    if (typeof request[key] !== 'string' || !request[key].trim() || request[key].length > 200)
      fail('request.' + key + ' must be a nonempty string of at most 200 characters');
  }
  if (!Array.isArray(request.inputs)) fail('request.inputs must be an array');
  const inputSet = new Set();
  for (const [index, name] of request.inputs.entries()) {
    portName(name, 'request.inputs[' + index + ']');
    if (inputSet.has(name)) fail('duplicate input port ' + name);
    inputSet.add(name);
  }
  record(request.reference, 'request.reference');
  record(request.candidate, 'request.candidate');
  const outputs = Object.keys(request.reference).sort();
  if (!outputs.length) fail('at least one output is required');
  for (const name of outputs) {
    portName(name, 'output port');
    if (inputSet.has(name)) fail('input and output ports must be disjoint: ' + name);
  }
  const candidateOutputs = Object.keys(request.candidate).sort();
  if (JSON.stringify(outputs) !== JSON.stringify(candidateOutputs))
    fail('reference and candidate must expose exactly the same output ports');
  let astNodes = 0;
  const active = new WeakSet();
  function visit(node, path, level = 1) {
    if (level > limits.maxAstDepth) fail(path + ': AST depth exceeds maxAstDepth');
    if (++astNodes > limits.maxAstNodes) fail('AST node visits exceed maxAstNodes');
    record(node, path);
    if (active.has(node)) fail(path + ': cyclic AST');
    if (!Object.hasOwn(node, 'op') || typeof node.op !== 'string' || !Object.hasOwn(SCHEMAS, node.op))
      fail(path + ': unsupported or missing op');
    keys(node, SCHEMAS[node.op], SCHEMAS[node.op], path);
    active.add(node);
    if (node.op === 'input') {
      if (typeof node.name !== 'string' || !inputSet.has(node.name))
        fail(path + ': undeclared input ' + String(node.name));
    } else if (node.op === 'const') {
      if (typeof node.value !== 'boolean') fail(path + '.value must be true or false');
    } else {
      for (const child of SCHEMAS[node.op].filter(key => key !== 'op'))
        visit(node[child], path + '.' + child, level + 1);
    }
    active.delete(node);
  }
  for (const name of outputs) visit(request.reference[name], 'reference.' + name);
  for (const name of outputs) visit(request.candidate[name], 'candidate.' + name);
  const contract = Object.hasOwn(request, 'contract') ? request.contract : { op: 'const', value: true };
  visit(contract, 'contract');
  return { inputs: request.inputs, outputs, reference: request.reference,
    candidate: request.candidate, contract, astNodes };
}
function compile(node, indices) {
  if (node.op === 'input') { const bit = 2 ** indices.get(node.name); return assignment => Boolean(assignment & bit); }
  if (node.op === 'const') return () => node.value;
  if (node.op === 'not') { const arg = compile(node.arg, indices); return assignment => !arg(assignment); }
  if (node.op === 'mux') {
    const sel = compile(node.sel, indices), whenTrue = compile(node.whenTrue, indices), whenFalse = compile(node.whenFalse, indices);
    return assignment => sel(assignment) ? whenTrue(assignment) : whenFalse(assignment);
  }
  const left = compile(node.left, indices), right = compile(node.right, indices);
  if (node.op === 'and') return assignment => left(assignment) && right(assignment);
  if (node.op === 'or') return assignment => left(assignment) || right(assignment);
  return assignment => left(assignment) !== right(assignment);
}

/** Compile a bounded Boolean function for repeated, strictly typed evaluation.
 * This evaluates supplied assignments only; it is not an equivalence proof.
 * Compiled closures and copied interfaces do not retain mutable caller ASTs.
 */
export function compileBooleanFunction(inputs, expressions) {
  const circuit = validate({ schemaVersion: 1, id: 'function', proposer: 'trusted-driver',
    inputs, reference: expressions, candidate: expressions }, LIMITS);
  if (circuit.inputs.length > LIMITS.maxInputs) fail('input limit exceeded');
  const names = [...circuit.inputs], outputs = [...circuit.outputs];
  const indices = new Map(names.map((name, index) => [name, index]));
  const evaluators = outputs.map(name => compile(circuit.reference[name], indices));
  return values => {
    keys(values, names, names, 'assignment');
    let packed = 0;
    names.forEach((name, index) => {
      if (typeof values[name] !== 'boolean') fail('assignment.' + name + ' must be Boolean');
      if (values[name]) packed += 2 ** index;
    });
    return Object.fromEntries(outputs.map((name, index) => [name, evaluators[index](packed)]));
  };
}
function stats(outputs) {
  const signatures = new Map();
  const gates = new Set();
  function intern(signature) {
    if (!signatures.has(signature)) signatures.set(signature, signatures.size);
    return signatures.get(signature);
  }
  function visit(node) {
    if (node.op === 'input') return { key: intern(JSON.stringify(['input', node.name])), depth: 0 };
    if (node.op === 'const') return { key: intern(JSON.stringify(['const', node.value])), depth: 0 };
    const children = SCHEMAS[node.op].filter(key => key !== 'op').map(key => visit(node[key]));
    // Intern child signatures to avoid exponentially escaped nested JSON keys.
    const key = intern(JSON.stringify([node.op, ...children.map(child => child.key)]));
    gates.add(key);
    return { key, depth: 1 + Math.max(...children.map(child => child.depth)) };
  }
  const outputDepths = Object.fromEntries(Object.entries(outputs).map(([name, node]) => [name, visit(node).depth]));
  return { uniqueLogicGates: gates.size, depth: Math.max(...Object.values(outputDepths)), outputDepths };
}

/**
 * Return VERIFIED only after a complete, non-vacuous exhaustive check.
 * REJECTED covers mismatch and an unsatisfiable contract. INCONCLUSIVE covers
 * invalid requests and bounded-resource refusal. These statuses are not proofs
 * about four-state HDL, sequential circuits, physical implementation, or LLMs.
 */
export function verifyCandidate(request, options = {}) {
  const result = {
    schemaVersion: 1,
    id: typeof request?.id === 'string' ? request.id : null,
    proposer: typeof request?.proposer === 'string' ? request.proposer : null,
    semantics: 'two-state-combinational',
    verificationMethod: 'bounded-exhaustive-enumeration',
    status: 'INCONCLUSIVE', reason: null,
    totalAssignments: null, checkedAssignments: 0, validAssignments: 0,
    validAssignmentsExhaustive: false, contractSatisfiable: null,
    enumerationComplete: false, counterexample: null, metrics: null,
  };
  let limits;
  try { limits = readLimits(options); } catch (error) {
    result.reason = 'INVALID_OPTIONS'; result.error = error.message; return result;
  }
  let circuit;
  try { circuit = validate(request, limits); } catch (error) {
    result.reason = 'INVALID_REQUEST'; result.error = error.message; return result;
  }
  if (circuit.inputs.length > limits.maxInputs) {
    result.reason = 'INPUT_LIMIT_EXCEEDED'; return result;
  }
  result.totalAssignments = 2 ** circuit.inputs.length;
  if (result.totalAssignments > limits.maxAssignments) {
    result.reason = 'ASSIGNMENT_BUDGET_EXCEEDED'; return result;
  }
  // This conservative bound counts every AST node on every assignment, even
  // where a false contract or Boolean short-circuit would reduce actual work.
  result.conservativeEvaluationSteps = circuit.astNodes * result.totalAssignments;
  if (result.conservativeEvaluationSteps > limits.maxEvaluationSteps) {
    result.reason = 'EVALUATION_BUDGET_EXCEEDED'; return result;
  }
  result.metrics = { interpretation: 'abstract structural proxies only; not physical PPA',
    reference: stats(circuit.reference), candidate: stats(circuit.candidate) };
  const indices = new Map(circuit.inputs.map((name, index) => [name, index]));
  const contract = compile(circuit.contract, indices);
  const reference = circuit.outputs.map(name => compile(circuit.reference[name], indices));
  const candidate = circuit.outputs.map(name => compile(circuit.candidate[name], indices));
  for (let index = 0; index < result.totalAssignments; index++) {
    result.checkedAssignments++;
    if (!contract(index)) continue;
    result.validAssignments++;
    const referenceValues = reference.map(evaluate => evaluate(index));
    const candidateValues = candidate.map(evaluate => evaluate(index));
    const mismatches = circuit.outputs.filter((_, output) => referenceValues[output] !== candidateValues[output]);
    if (mismatches.length && !result.counterexample) {
      result.counterexample = {
        assignment: Object.fromEntries(circuit.inputs.map((name, bit) => [name, Boolean(index & (2 ** bit))])),
        referenceOutputs: Object.fromEntries(circuit.outputs.map((name, output) => [name, referenceValues[output]])),
        candidateOutputs: Object.fromEntries(circuit.outputs.map((name, output) => [name, candidateValues[output]])),
        mismatches,
      };
    }
  }
  result.enumerationComplete = true;
  result.validAssignmentsExhaustive = true;
  result.contractSatisfiable = result.validAssignments > 0;
  if (!result.contractSatisfiable) {
    result.status = 'REJECTED'; result.reason = 'UNSATISFIABLE_CONTRACT';
  } else if (result.counterexample) {
    result.status = 'REJECTED'; result.reason = 'OUTPUT_MISMATCH';
  } else {
    result.status = 'VERIFIED'; result.reason = 'EQUIVALENT_UNDER_CONTRACT';
  }
  return result;
}

/**
 * Emit a restricted combinational Verilog view of a validated AST.
 * This is a translation aid; it does not establish Verilog four-state equivalence.
 */
export function emitVerilog(request, which = 'candidate', moduleName = 'circuit_candidate') {
  if (!['reference', 'candidate'].includes(which)) throw new ValidationError('which must be reference or candidate');
  portName(moduleName, 'moduleName');
  const circuit = validate(request, LIMITS);
  if (circuit.inputs.length > LIMITS.maxInputs) throw new ValidationError('input limit exceeded');
  function expression(node) {
    if (node.op === 'input') return node.name;
    if (node.op === 'const') return node.value ? "1'b1" : "1'b0";
    if (node.op === 'not') return '(~' + expression(node.arg) + ')';
    if (node.op === 'mux') return '(' + expression(node.sel) + ' ? ' + expression(node.whenTrue) + ' : ' + expression(node.whenFalse) + ')';
    const operator = { and: '&', or: '|', xor: '^' }[node.op];
    return '(' + expression(node.left) + ' ' + operator + ' ' + expression(node.right) + ')';
  }
  const ports = [...circuit.inputs.map(name => '  input wire ' + name),
    ...circuit.outputs.map(name => '  output wire ' + name)].join(',\n');
  return [
    '// Restricted AST export; checker semantics are two-state and combinational.',
    '// Four-state X/Z behavior, state, timing, synthesis, and physical PPA are unverified.',
    '// Contract assumptions are NOT enforced by this module.',
    'module ' + moduleName + '(\n' + ports + '\n);',
    ...circuit.outputs.map(name => '  assign ' + name + ' = ' + expression(circuit[which][name]) + ';'),
    'endmodule', '',
  ].join('\n');
}

export const DEFAULT_LIMITS = LIMITS;

/**
 * Check the independent application obligation A(x) => C(B(x)).
 * A is supplied by the caller as a fixed external assumption, and is never
 * weakened or synthesized here. B maps external inputs to each local input.
 * Successful checking also requires at least one assignment satisfying A.
 */
export function verifyEnvironment(localRequest, environment, options = {}) {
  try {
    const limits = readLimits(options);
    const local = validate(localRequest, limits);
    keys(environment, ['schemaVersion', 'inputs', 'boundary', 'assumption'],
      ['schemaVersion', 'inputs', 'boundary', 'assumption'], 'environment');
    if (environment.schemaVersion !== 1) fail('environment.schemaVersion must equal 1');
    record(environment.boundary, 'environment.boundary');
    const boundaryNames = Object.keys(environment.boundary).sort();
    if (JSON.stringify(boundaryNames) !== JSON.stringify([...local.inputs].sort()))
      fail('environment.boundary must map exactly every local input');
    if (!Array.isArray(environment.inputs)) fail('environment.inputs must be an array');
    // Synthetic output names validate every boundary expression without
    // requiring local port names to be distinct from external input names.
    const boundaryOutputs = {};
    for (const [index, name] of boundaryNames.entries()) {
      let auxiliaryName = '_boundary_' + index;
      while (environment.inputs.includes(auxiliaryName)) auxiliaryName += '_';
      boundaryOutputs[auxiliaryName] = environment.boundary[name];
    }
    if (!boundaryNames.length) {
      let auxiliaryName = '_boundary_empty';
      while (environment.inputs.includes(auxiliaryName)) auxiliaryName += '_';
      boundaryOutputs[auxiliaryName] = { op: 'const', value: true };
    }
    validate({
      schemaVersion: 1, id: 'environment-boundary-validation', proposer: 'environment-check',
      inputs: environment.inputs, reference: boundaryOutputs, candidate: boundaryOutputs,
      contract: environment.assumption,
    }, limits);
    function substitute(node) {
      if (node.op === 'input') return environment.boundary[node.name];
      if (node.op === 'const') return node;
      return Object.fromEntries(Object.entries(node).map(([key, value]) =>
        [key, key === 'op' ? value : substitute(value)]));
    }
    let obligationOutput = '_contract_obligation';
    while (environment.inputs.includes(obligationOutput)) obligationOutput += '_';
    const result = verifyCandidate({
      schemaVersion: 1, id: 'environment-obligation', proposer: 'environment-check',
      inputs: environment.inputs,
      reference: { [obligationOutput]: substitute(local.contract) },
      candidate: { [obligationOutput]: { op: 'const', value: true } },
      contract: environment.assumption,
    }, options);
    return { obligation: 'external-assumption-implies-local-contract', ...result };
  } catch (error) {
    return { obligation: 'external-assumption-implies-local-contract',
      status: 'INCONCLUSIVE', reason: 'INVALID_ENVIRONMENT_OR_LOCAL_REQUEST',
      error: error.message, counterexample: null,
      enumerationComplete: false, validAssignmentsExhaustive: false };
  }
}

export function verifyDeployment(localRequest, environment, options = {}) {
  const localVerification = verifyCandidate(localRequest, options);
  const environmentVerification = verifyEnvironment(localRequest, environment, options);
  const localVerified = localVerification.status === 'VERIFIED';
  const environmentVerified = environmentVerification.status === 'VERIFIED';
  return {
    schemaVersion: 1,
    semantics: 'two-state-combinational',
    scope: 'local replacement plus supplied boundary mapping and fixed external assumption',
    localVerified, environmentVerified,
    deploymentEligible: localVerified && environmentVerified,
    localVerification, environmentVerification,
    // Eligibility is a logical result for this supplied model. It does not
    // attest that an external HDL netlist was extracted or modified correctly.
  };
}

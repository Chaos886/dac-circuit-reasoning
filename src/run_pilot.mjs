import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyCandidate, verifyDeployment, emitVerilog, DEFAULT_LIMITS } from './checker.mjs';
import { buildPilotCases } from './pilot_cases.mjs';
import { buildDeploymentExamples } from '../examples/deployment_examples.mjs';

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

/**
 * Run the fixed, hand-constructed pilot. Files are written only when a caller
 * supplies outputDir explicitly. No LLM or external EDA tool is called.
 */
export async function runPilot(outputDir) {
  const cases = buildPilotCases();
  const results = cases.map(({ family, expectedStatus, request }) => ({
    family, expectedStatus, ...verifyCandidate(request),
  }));
  const deploymentResults = buildDeploymentExamples().map(example => ({
    id: example.id,
    expectedDeploymentEligible: example.expectedDeploymentEligible,
    ...verifyDeployment(example.localRequest, example.environment),
    wholeCircuitVerification: verifyCandidate(example.wholeRequest),
  }));
  const verified = results.filter(result => result.status === 'VERIFIED');
  const rejected = results.filter(result => result.status === 'REJECTED');
  const summaries = Object.fromEntries([...new Set(results.map(result => result.family))].map(family => {
    const members = results.filter(result => result.family === family);
    return [family, {
      cases: members.length,
      verified: members.filter(result => result.status === 'VERIFIED').length,
      rejected: members.filter(result => result.status === 'REJECTED').length,
      expectedStatusMatches: members.filter(result => result.status === result.expectedStatus).length,
    }];
  }));
  const report = {
    schemaVersion: 1,
    title: 'Deterministic Boolean-circuit sanity pilot',
    proposer: 'deterministic-pilot',
    semantics: 'two-state-combinational',
    evidenceScope: 'hand-constructed correctness probes, not an independent evaluation benchmark',
    limits: DEFAULT_LIMITS,
    summary: {
      cases: results.length, verified: verified.length, rejected: rejected.length,
      inconclusive: results.filter(result => result.status === 'INCONCLUSIVE').length,
      expectedStatusMatches: results.filter(result => result.status === result.expectedStatus).length,
      assignmentsChecked: results.reduce((sum, result) => sum + result.checkedAssignments, 0),
      validAssignments: results.reduce((sum, result) => sum + result.validAssignments, 0),
      verifiedReferenceUniqueLogicGates: verified.reduce((sum, result) => sum + result.metrics.reference.uniqueLogicGates, 0),
      verifiedCandidateUniqueLogicGates: verified.reduce((sum, result) => sum + result.metrics.candidate.uniqueLogicGates, 0),
      verifiedReferenceDepthSum: verified.reduce((sum, result) => sum + result.metrics.reference.depth, 0),
      verifiedCandidateDepthSum: verified.reduce((sum, result) => sum + result.metrics.candidate.depth, 0),
      deploymentExamples: deploymentResults.length,
      deploymentExpectedMatches: deploymentResults.filter(result => result.deploymentEligible === result.expectedDeploymentEligible).length,
    },
    families: summaries,
    interpretation: [
      'Counts come from exhaustive enumeration of these small supplied fixtures.',
      'The proposer is a fixed collection of human-designed transformations, not a language model.',
      'Gate counts structurally deduplicate identical ordered AST expressions across outputs.',
      'Gate counts exclude input and constant nodes; each not/and/or/xor/mux is one abstract operation.',
      'Depth counts AST logic levels with input and constant depth zero.',
      'No standard-cell area, delay, power, routing, synthesis, or four-state HDL result is measured.',
      'Deployment eligibility requires both non-vacuous local equivalence and the independent A(x) => C(B(x)) check.',
      'The whole-circuit checks use explicitly supplied small ASTs, not automatic netlist extraction or rewriting.',
    ],
    results, deploymentResults,
  };
  if (outputDir !== undefined) {
    if (typeof outputDir !== 'string' || !outputDir.trim()) throw new TypeError('outputDir must be a nonempty path');
    const directory = resolve(outputDir);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'pilot-results.json'), JSON.stringify(report, null, 2) + '\n');
    const columns = ['id', 'family', 'proposer', 'expectedStatus', 'status', 'reason',
      'totalAssignments', 'checkedAssignments', 'validAssignments',
      'referenceGates', 'candidateGates', 'referenceDepth', 'candidateDepth'];
    const rows = results.map(result => ({
      ...result,
      referenceGates: result.metrics?.reference.uniqueLogicGates,
      candidateGates: result.metrics?.candidate.uniqueLogicGates,
      referenceDepth: result.metrics?.reference.depth,
      candidateDepth: result.metrics?.candidate.depth,
    }));
    await writeFile(join(directory, 'pilot-results.csv'),
      [columns.join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n') + '\n');
    await writeFile(join(directory, 'candidate-example.json'),
      JSON.stringify(cases.find(example => example.request.id === 'absorption_01').request, null, 2) + '\n');
    await writeFile(join(directory, 'candidate-example.v'), emitVerilog(cases[0].request));
  }
  return report;
}

if (globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(resolve(globalThis.process.argv[1])).href) {
  const arguments_ = globalThis.process.argv.slice(2);
  if (arguments_.length !== 2 || arguments_[0] !== '--out' || !arguments_[1]) {
    console.error('Usage: node src/run_pilot.mjs --out <explicit-output-directory>');
    globalThis.process.exitCode = 2;
  } else {
    const report = await runPilot(arguments_[1]);
    console.log(JSON.stringify(report.summary, null, 2));
    if (report.summary.expectedStatusMatches !== report.summary.cases ||
        report.summary.deploymentExpectedMatches !== report.summary.deploymentExamples) globalThis.process.exitCode = 1;
  }
}

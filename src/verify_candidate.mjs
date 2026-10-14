import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyCandidate, verifyDeployment } from './checker.mjs';

/** Parse a JSON proposal and optional fixed external environment, then check. */
export function verifyJsonText(candidateText, environmentText, options = {}) {
  try {
    const candidate = JSON.parse(candidateText);
    return environmentText === undefined
      ? verifyCandidate(candidate, options)
      : verifyDeployment(candidate, JSON.parse(environmentText), options);
  } catch (error) {
    return { schemaVersion: 1, status: 'INCONCLUSIVE', reason: 'INVALID_JSON',
      error: error.message, deploymentEligible: false };
  }
}

if (globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(resolve(globalThis.process.argv[1])).href) {
  const arguments_ = globalThis.process.argv.slice(2);
  if (arguments_.length < 1 || arguments_.length > 2) {
    console.error('Usage: node src/verify_candidate.mjs <candidate.json> [fixed-environment.json]');
    globalThis.process.exitCode = 2;
  } else {
    try {
      const candidateText = await readFile(resolve(arguments_[0]), 'utf8');
      const environmentText = arguments_[1] ? await readFile(resolve(arguments_[1]), 'utf8') : undefined;
      const result = verifyJsonText(candidateText, environmentText);
      console.log(JSON.stringify(result, null, 2));
      const status = result.localVerification ? (
        result.deploymentEligible ? 'VERIFIED' :
        [result.localVerification.status, result.environmentVerification.status].includes('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'REJECTED'
      ) : result.status;
      globalThis.process.exitCode = status === 'VERIFIED' ? 0 : status === 'REJECTED' ? 1 : 2;
    } catch (error) {
      console.error(JSON.stringify({ status: 'INCONCLUSIVE', reason: 'IO_ERROR', error: error.message }));
      globalThis.process.exitCode = 2;
    }
  }
}

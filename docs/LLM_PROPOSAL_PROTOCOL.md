# LLM proposal protocol (interface draft)

This protocol describes the intended proposer boundary. No model API was called in the saved pilot and no model accuracy was measured. The current JSON checker is implemented; a production orchestrator that freezes trusted fields and handles model calls is not.

## Trusted context and model output

The caller owns schemaVersion, id, proposer, inputs, reference, and the external environment file (inputs, boundary B, assumption A). It must load these from a versioned design and specification, never from the generated answer. The model may return only candidate output ASTs and a proposed contract C. The orchestrator must reject extra fields and merge those two fields into the trusted request. A candidate cannot introduce inputs, change reference outputs or add environmental assumptions.

The low-level CLI intentionally accepts a complete request to make offline examples reproducible. It cannot establish the provenance of a user-supplied reference or A; this remains the caller's responsibility.

## Proposed prompt

> Optimize the supplied two-state combinational Boolean cut using only declared inputs and the permitted AST grammar. Return a JSON object containing exactly candidate and contract. Preserve every output name. The proposed contract must be implied by the supplied fixed external environment; you cannot alter the reference circuit, external assumptions, or boundary map. You may return the original candidate with contract true when no supported improvement is available. Do not emit executable code or a claimed verification verdict. Correctness and structural cost will be checked independently. An inconclusive check rejects application.

Permitted nodes:

```json
{"op":"input","name":"a"}
{"op":"const","value":true}
{"op":"not","arg":{"op":"input","name":"a"}}
{"op":"and","left":{"op":"input","name":"a"},"right":{"op":"input","name":"b"}}
{"op":"mux","sel":{"op":"input","name":"s"},"whenTrue":{"op":"input","name":"a"},"whenFalse":{"op":"input","name":"b"}}
```

The binary operators or and xor use the same left/right schema as and. Constants must be Boolean, not numbers. No extra node fields, undeclared ports, classes or cyclic ASTs are permitted. The checker restricts identifier spelling and AST size/depth as well as the input count.

## Run the interface

```sh
node src/verify_candidate.mjs examples/conditional-mux.json
node src/verify_candidate.mjs examples/conditional-mux.json examples/environment-safe.json
node src/verify_candidate.mjs examples/conditional-mux.json examples/environment-unsafe.json
```

Without an environment the result is a local proof only. With an environment, deploymentEligible requires both local and environment checks. Even this joint result assumes the supplied boundary map correctly represents the original design and does not implement automated cut extraction or HDL reinsertion. For a complete optimization flow, validate the final full-design miter independently.

The checker returns VERIFIED, REJECTED or INCONCLUSIVE for individual obligations. The CLI uses exit code 0 for a successful requested check, 1 for a semantic rejection and 2 for malformed input, incomplete checks or usage errors. Never treat successful JSON parsing or a printed result object as verification success.

## Controlled model experiment still to implement

Record exact model identifier, call date, sampling parameters, complete trusted prompt, raw response, parsed output, provider-reported token usage, reasoning usage when available, latency, retries and cost basis. Keep all failed attempts. A manually authored response or this development assistant's fixture must never be recorded as a controlled model run.

Use the same legitimate context for the contextual no-contract baseline and compare under equal end-to-end resources. Distinguish the source draft's AI assistance from experiment provenance. Counterexample feedback and contract refinement remain proposed research mechanisms, not measured capabilities of this release.

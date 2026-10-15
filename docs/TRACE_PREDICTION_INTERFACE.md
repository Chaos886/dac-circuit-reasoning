# Trace prediction interface

The trusted driver loads tasks. A model returns predictions in a separate JSONL file. Do not accept task definitions, initial states, transition rules, or input waveforms supplied by the model in place of the trusted tasks.

The current runner scores supplied files; it does not invoke an LLM. All bundled reference predictions and injected-error continuations are deterministic controls, not model samples.

## Semantics

Each task has `schemaVersion`, `id`, `family`, `semantics`, `stateBits`, `inputBits`, `initial`, `next`, `outputs`, and `stimuli`. Only `single-clock-two-state` is supported. State and input names are disjoint. Each stimulus contains all input bits as JSON Booleans. `next` maps every state bit to a Boolean expression over old state and current inputs. `outputs` maps output names to expressions evaluated using new state and the same held input.

Use `prepareTask(task).taskHash` to obtain the canonical SHA-256. Object key order is ignored, while interface order and stimulus sequence are preserved. A hash identifies the task; it does not certify the reference circuit.

The prediction object contains exactly:

```text
schemaVersion: 1
taskId: trusted task ID
taskHash: trusted canonical SHA-256
rows: one object per edge, in order
  cycle: 1-based integer
  state: all declared state bits, each true or false
  outputs: all declared output bits, each true or false
```

Rows report post-edge state. A model may not omit an inconvenient cycle or insert X/Z, numeric bits, extra signals, or transition expressions. Any optional explanation should be logged separately from the scoring JSON, with the task ID, response hash, and model-run metadata.

## Prompt template

> You are given a fixed synchronous Boolean circuit, an initial state before the first scored edge, and a sequence of inputs held around each edge. All next-state expressions use the old state simultaneously. After the edge, evaluate outputs using the new state and the same input. Return only the prediction object in the supplied schema, using the exact task ID and hash. Include every cycle. Do not modify the circuit, initialization, or stimuli. The task is to predict the trace; no reference trace is supplied.

Append the task and its hash, without a saved reference trace. This evaluates execution of a Boolean transition specification. An RTL-input study must instead present audited RTL and its sampling contract; do not describe AST-input results as measuring Verilog parsing or RTL understanding.

## Score

```sh
node src/score_trace.mjs trusted-tasks.jsonl model-predictions.jsonl
```

The CLI refuses duplicate/unknown prediction IDs and duplicate trusted task IDs. Missing predictions remain in the trusted-task denominator as invalid predictions. It exits 1 for an invalid run or invalid predictions. A well-formed but incorrect trace is scored normally and does not by itself produce a nonzero exit code; inspect `wholeTraceExact` and other metrics.

The primary run statistic includes all trusted tasks. Aggregate comparisons by design family; do not infer independent replication from the number of cycles. Record model revision, prompt, sampling, date, retries, raw response, parsed prediction, latency, token cost, and task hash for every future model call. No API keys belong in this repository.

`SCORED` means the prediction was evaluated for this fixed input trace. It never means an unbounded proof, source-HDL equivalence, or deployment approval.

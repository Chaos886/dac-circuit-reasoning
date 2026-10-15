# Cycle-Level Circuit Reasoning with Language Models: State Errors, Propagation, and Recovery

> DAC 2027 research draft — 15 October 2026. Pending human verification.

## Abstract


Can a language model infer the state of a circuit after every clock edge, and how does an incorrect intermediate state affect later answers? RTL generation benchmarks do not directly resolve these questions. We define a finite-trace task with fixed transition semantics, initial conditions, input stimuli, and sampling conventions. The evaluation separates reference-state accuracy, transition consistency relative to a predicted prefix, output masking, and recovery. We map established hardware benchmarks to this task and specify controlled interventions on visible state prefixes. A bounded two-state implementation provides 48 original diagnostic tasks and two candidate adapters derived from pinned reference designs. Synthetic error injection demonstrates how final-state scoring can miss earlier errors, but supplies no evidence about model accuracy or hidden reasoning. Actual model comparisons, HDL validation of the adapters, and downstream EDA experiments remain to be completed.



## Introduction
An explanation of a synchronous circuit often relies on a sequence of intermediate register values. A mistaken update can change the apparent control path, a later output, or a conclusion about an assertion. Fluent prose does not establish that these intermediate values follow from the circuit. Conversely, a correct final answer does not establish that the preceding state trajectory was correct: reset, overwriting, or state convergence may erase an earlier error.

This distinction motivates a concrete research question: how reliably do language models track circuit state across clock edges, and when does checking an intermediate state improve a later engineering decision? VerilogEval evaluates RTL generation through code completion and specification-to-RTL tasks [verilogeval](#verilogeval). RTLLM includes generation, testbench functionality, and design-quality evaluation [rtllm](#rtllm). FVEval evaluates assertion and verification-related generation tasks [fveval](#fveval). Their native task definitions differ from predicting the internal state of a fixed reference circuit under a fixed stimulus sequence. We therefore treat trace prediction as a derived task with its own provenance and scoring protocol.

The intended contribution is a reproducible characterization of state errors and their downstream consequences. We do not claim that asking for intermediate values, adding a checker, or combining an LLM with an EDA tool is novel. Recent optimization systems already use sophisticated tool feedback [ares](#ares), [drrtl](#drrtl), and RTL-OPT emphasizes appropriate evaluation of RTL optimization [rtlopt](#rtlopt). A comprehensive comparison with existing waveform and circuit-reasoning work remains necessary before establishing a novelty claim.

This draft makes the task and trust boundary explicit, implements a small diagnostic scorer, and specifies experiments capable of distinguishing error persistence from recovery. There are no completed LLM comparisons or physical-design measurements. The accompanying combinational rewrite checker remains a separate supporting artifact; its equivalence theorem does not certify sequential traces or transformations.

## Task Definition and Semantics
Let a deterministic, single-clock, two-state circuit have state $s_t$, input $x_t$, transition function $T$, and observation function $G$. We use

$
s_{t+1}=T(s_t,x_t),\qquad y_{t+1}=G(s_{t+1},x_t).
$

The input is stable before the sampled edge and held while the post-edge output is observed. All next-state expressions use the same old state; observations are sampled after state updates and combinational settling. A task fixes $T$, $G$, a known $s_0$, a stimulus sequence $(x_0,\ldots,x_{H-1})$, and horizon $H$. It requests the state and output at every sampled edge. For a reset-initialized design, the reset preamble and the boundary defining $s_0$ must be documented separately.

These conditions matter for identifiability. Circuit source alone generally does not determine a unique numerical trajectory without inputs and initialization. Unknown values require symbolic or four-state treatment; they cannot silently become zero. Asynchronous reset requires events between clock edges, and multiple clocks require an explicit event ordering. Those cases are outside the current implementation. A synchronous reset is encoded in $T$ with its documented priority and polarity.

As a small example, consider the simultaneous updates $q^+=d$ and $r^+=q$, starting at $(q,r)=(0,0)$. For inputs $1,0,1,1$, the post-edge states are $(1,0),(0,1),(1,0),(1,1)$. Using the newly updated $q$ to compute $r$ gives the wrong first state. This is an illustrative semantic error, not an observed model response. A dedicated test compares the evaluator with this hand-derived trace.

The trusted driver fixes the circuit, state interface, initial conditions, and stimuli. A model supplies only its predicted rows; it cannot replace the transition rules or declare a different reset assumption. A canonical content hash binds each prediction to the task. The hash detects mismatched inputs but does not prove that a reference encoding is correct. HDL parsing, source-to-transition translation, simulator scheduling, and reference annotation are separate trust boundaries.

## Correctness, Propagation, and Recovery
For a predicted state $\hat{s}_t$, define reference accuracy by $\hat{s}_t=s_t$. Define consistency with the predicted prefix by

$
\hat{s}_{t+1}=T(\hat{s}_t,x_t).
$

These are different properties. A trace can contain an incorrect state and then obey every subsequent transition while remaining incorrect relative to the reference. Conversely, two different states can map to the same state under a particular input suffix. If that occurs and both continuations follow $T$ under the same inputs, their later states coincide. A reset that maps every state to a common value is one sufficient recovery mechanism; overwriting or non-injective transitions can also cause convergence.

Output correctness is weaker than internal-state correctness when $G$ masks differences. We report whether an incorrect predicted state produces the same reference output, separately from whether the submitted output is consistent with the submitted state. This avoids conflating hidden-state errors, output transcription errors, and externally visible failures.

The primary planned metric is whole-trace exactness over all required state and output bits. Secondary metrics include per-cycle exact-state and exact-output accuracy, first state and output divergence, final-state correctness, predicted-prefix transition validity, and reconvergence cycles. Missing rows, unsupported values, parsing failures, and task-hash mismatches remain failed predictions in the run-level denominator. Timeouts and incomplete runs must also remain visible. A final-answer-only condition has no intermediate-state score.

The observable evidence consists of submitted state tables and optionally short, checkable dependency statements. Such statements may be helpful explanations, but they are not proofs and do not reveal a model's private reasoning process. An incorrect intermediate statement can invalidate a particular written argument without making every later answer incorrect. Our interventions concern externally supplied state prefixes; they cannot establish the causal structure of hidden chain-of-thought.

## Benchmark Selection and Adaptation
We audited official repository documentation and seven reference source files, recording repository revisions, source links, license information, and SHA-256 digests. This is targeted benchmark scoping rather than a systematic literature review. VerilogEval, RTLLM, and FVEval are fixed to immutable commits in the artifact manifest. Repository license declarations are MIT, MIT, and Apache-2.0, respectively; per-file and third-party dataset terms still require review before redistribution.

**VerilogEval.** The revised harness supports code-completion and specification-to-RTL formats of the same underlying problems [verilogeval](#verilogeval). Our source audit found an explicitly unknown initial value in Prob031, asynchronous reset in Prob075 and Prob085, and a synchronous one-bit FSM in Prob107. The first three are deferred from the present known-initial-state synchronous subset. A candidate transcription of Prob107 starts after a documented reset preamble and preserves reset to state B=1. Its adapted task is not a VerilogEval generation score.

**RTLLM.** The current repository reports version 2.1 corrections to descriptions, testbenches, and designs; it also retains older version-specific counts and results [rtllm](#rtllm). We identify each selected design by commit and path instead of mixing these revisions. The audited counter and FSM contain asynchronous reset and are deferred. The right-shifter reference explicitly initializes its eight-bit register to zero and uses ordered nonblocking assignments to shift right and overwrite the high bit. Its candidate adapter preserves that behavior without reducing the width.

**FVEval and downstream tasks.** The repository exposes NL2SVA-Human, NL2SVA-Machine, and Design2SVA tasks, with a Cadence Jasper dependency for the full flow [fveval](#fveval). It is a source for a future downstream study: whether corrected state information changes assertion judgments or generation quality. No FVEval task has been executed here. RTL-OPT36 likewise remains a future optimization-oriented comparison source rather than current trace data [rtlopt](#rtlopt).

Before an adapter enters a model evaluation, its reference RTL should pass the original testbench, and an audited simulator flow should produce the requested internal-state traces. A second implementation or formal comparison should check the source-to-transition mapping where feasible. Clocking, reset, widths, signedness, overflow, sampling region, and any excluded unknown states must be recorded. The current hand-transcribed adapters have equation-level checks but no HDL simulation or formal translation proof, so they are candidate adapters only.

Development and test partitions must group variants of the same design together, including width changes, renaming, and equivalent state encodings. Public benchmark contamination remains possible despite such a split. Separate RTL-input evaluation, which includes source understanding, from transition-AST evaluation, which measures execution of explicitly supplied Boolean rules. The present tool supports the latter and does not parse HDL.

## Experimental Protocol
**Research questions.** RQ1 asks how accuracy changes with horizon, state size, control dependence, and input pattern. RQ2 asks whether an externally introduced state error affects later predictions and whether correction restores accuracy. RQ3 asks whether improved state tracking benefits a downstream output, assertion, or fault-localization task under comparable budgets. None has yet been answered by model measurements.

**Conditions.** Compare final-answer-only prediction, structured state tables, state tables with short dependencies, and checkpointed tool feedback. Keep circuit context and the scoring target fixed. Tool feedback reveals additional information and must be labeled as such; include a warning-only feedback condition to separate error localization from supplying the correct state. Compare common endpoint metrics across all conditions, and compare intermediate metrics only where intermediate outputs are requested.

**Interventions.** Observational associations between an early mistake and a later failure do not identify causality. For a controlled study, fix a circuit, input suffix, checkpoint, and externally supplied prefix. Randomly assign a correct state, a one-bit corrupted state, or a format-matched unchanged-state control. Match prompt length and inference budget as closely as possible. In a separate recovery experiment, start from the same corrupted prefix and compare correction, warning-only feedback, and no feedback. Record sampling seeds and service settings; a shared seed alone does not guarantee deterministic provider behavior. Interpret effects as responses to visible premises, not as direct measurements of hidden reasoning.

**Coverage and budgets.** Include reset and no-further-reset strata, long holds, wraparound, overwrite, repeated requests, and simultaneous queue operations. Do not estimate natural recovery from a suite intentionally designed to reset halfway through every task. Freeze prompts, model identifiers, decoding settings, task families, the primary metric, and stopping rules before inspecting held-out results. Record all retries, parsing failures, input/output tokens, model and tool latency, and feedback cost. Do not make token-efficiency claims from equal numbers of calls alone.

**Analysis.** Report per-family outcomes and paired differences between conditions. Estimate uncertainty at the design-family level; cycles and repeated trajectories from a common design are correlated observations. Determine sample size using an independent development study and lock it before the final test. Include negative results and unresolved reference failures. A downstream assertion experiment additionally requires precise temporal-property semantics and actual formal-tool reports. PPA claims require a separate validated synthesis or physical-design setup and are not part of this trace pilot.

## Implementation and Diagnostic Evidence
The Node.js implementation reuses a strict Boolean AST evaluator for single-clock transitions. It supports known Boolean initial values, synchronous reset encoded in the transition function, at most 16 state-plus-input bits, 32 output bits, and 256 sampled edges. It rejects malformed interfaces, missing stimulus values, unsupported operators, unknown states, and excessive bounds. The scorer keeps the trusted task separate from predictions and checks post-update outputs using the held input.

The original synthetic suite contains six families: a two-register pipeline, a two-bit enabled counter, a two-bit accumulator, a handshake controller, a one-item buffer, and an edge detector. Four horizons (4, 8, 16, 32) and two deterministic seeds yield 48 tasks, totaling 720 cycles per control condition. These are original diagnostic fixtures, not copied benchmark instances or independent measures of model ability.

Reference replay yields 48 exact traces, as expected for a scorer control. A second control flips the first state bit at cycle 2 and then continues with the correct transition function. It yields zero exact traces, 151 incorrect state cycles, and 48 correct final states. All tasks include a midpoint reset, so recovery is deliberately encouraged. This demonstrates that endpoint scoring can hide earlier errors under the chosen conditions; it does not estimate LLM error propagation or a general recovery rate. Reference replay uses the same evaluator as scoring and is not independent validation of that evaluator.

Independent tests address this limitation in a narrower scope. The state-scoring suite passes 35 tests, including exhaustive one-step comparisons for all six small families against separately expressed imperative or arithmetic specifications, a hand-derived simultaneous-update example, persistent errors without reset, recovery, output masking, and malformed predictions. The two benchmark-derived candidate adapters pass 520 one-step assignment comparisons with independent equations. Those checks do not validate the source HDL translation. All counts describe executed software checks, not model inference or EDA tool runs.

## Supporting Combinational Artifact
The earlier artifact checks conditional combinational rewrites. For a fixed design $N(x)=H(x,F(B(x)))$, legal predicate $A$, and proposed contract $C$, acceptance requires satisfiable $A$ and

$
A(x)\Rightarrow C(B(x)),\qquad C(u)\Rightarrow F(u)=F'(u).
$

Substitution then gives $N(x)=H(x,F'(B(x)))$ for legal $x$. This standard compositional argument illustrates the same trust principle: a model cannot authorize its conclusion by inventing an unchecked premise. It is not a new verification theorem and provides no sequential-equivalence guarantee.

The bounded combinational pilot retains 27 local cases (21 accepted and 6 rejected), 412 enumerated assignments, and 56 passing tests. Its abstract operator counts are not PPA. This module can support a later study of erroneous assumptions in circuit transformations, but it is excluded from the state-trace accuracy denominator.

## Limitations and Next Evidence
The implementation covers small two-state transition systems, not general HDL, memories of realistic size, asynchronous reset events, multiple clocks, analog circuits, or unbounded temporal proofs. Finite trace agreement does not prove equivalence for all possible inputs. Source annotation errors can invalidate the reference, and manual adapters remain provisional until independently checked against HDL execution.

The current manuscript lacks a comprehensive nearest-work review, real model experiments, validated benchmark ports, and downstream EDA measurements. The synthetic results cannot establish competitiveness, novelty, or readiness for DAC acceptance. The next evidence should establish reference fidelity, held-out model behavior, and whether state checking changes a useful downstream decision. Human authors must audit claims, citations, source mappings, anonymity, and the final compiled page count before submission.

## Conclusion
Cycle-level circuit reasoning admits checks that final-answer scoring misses. A useful evaluation must separate true state accuracy, consistency with an incorrect prefix, output masking, and recovery. The artifact makes these distinctions executable for bounded synchronous models and defines how chip-design benchmarks could supply audited derived tasks. Whether these checks improve actual model-assisted design work remains an empirical question.

## Content Generated by AI
Codex assisted with research framing, source inspection, mathematical exposition, manuscript drafting, code, tests, and experiment design. All material is pending human verification. Reported diagnostic counts come from executed software checks; no controlled LLM study, HDL simulator result, formal-tool result, or physical-design improvement is claimed. Human authors must verify and revise the material, take responsibility for the final work, and update this disclosure according to the applicable venue policy.

## References
<a id="verilogeval"></a>

**[verilogeval]**
N. Pinckney, C. Batten, M. Liu, H. Ren, and B. Khailany, "Revisiting VerilogEval: Newer LLMs, In-Context Learning, and Specification-to-RTL Tasks,” arXiv:2408.11053, 2024. Task documentation and source: <https://github.com/NVlabs/verilog-eval>, accessed Oct. 15, 2026.
<a id="rtllm"></a>

**[rtllm]**
Y. Lu, S. Liu, Q. Zhang, and Z. Xie, "RTLLM: An Open-Source Benchmark for Design RTL Generation with Large Language Model,” in ASP-DAC, 2024, pp. 722--727. Updated repository documentation: <https://github.com/hkust-zhiyao/RTLLM>, accessed Oct. 15, 2026. The original paper and current repository represent different revisions.
<a id="fveval"></a>

**[fveval]**
NVIDIA, "FVEval: Evaluating LLMs on Hardware Formal Verification,” software repository, accessed Oct. 15, 2026. [Online]. Available: <https://github.com/NVlabs/FVEval>
<a id="ares"></a>

**[ares]**
S. Cuyckens, M. Jivanescu, J. Yin, C. Fang, and M. Verhelst, "Ares: Adaptive Reasoning-Effort Steering for PPA- and Cost-Aware RTL Optimization with LLM Agents,” arXiv:2607.27879v1, 2026. [Online]. Available: <https://arxiv.org/abs/2607.27879>
<a id="drrtl"></a>

**[drrtl]**
W. Fang, Y. Lu, S. Liu, J. Wang, Z. Guo, J. He, F. Tu, and Z. Xie, "Dr. RTL: Autonomous Agentic RTL Optimization through Tool-Grounded Self-Improvement,” arXiv:2604.14989v2, 2026. [Online]. Available: <https://arxiv.org/abs/2604.14989>
<a id="rtlopt"></a>

**[rtlopt]**
Y. Lu, S. Liu, H. Zhou, W. Fang, Q. Zhang, and Z. Xie, "A New Benchmark for the Appropriate Evaluation of RTL Code Optimization,” arXiv:2601.01765v1, 2026. [Online]. Available: <https://arxiv.org/abs/2601.01765>

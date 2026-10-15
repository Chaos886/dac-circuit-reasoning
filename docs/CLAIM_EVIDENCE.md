# Claim–evidence register

Updated 2026-10-15. No evidence tier below implies peer review or signoff.

| Claim | Evidence and location | Type / verification | Limit |
|---|---|---|---|
| A fixed two-state synchronous transition system with known initial state and input sequence determines one finite trace | Induction on s(t+1)=T(s(t),x(t)); paper, semantics section | Mathematical derivation | Does not apply unchanged to X/Z, missing inputs, asynchronous events or multiple clocks |
| A wrong state may persist despite valid later transitions, or may reconverge | tests/state_trace.test.mjs: persistent counter, reset recovery, pipeline masking tests | Executed controlled examples | Not evidence of LLM error prevalence or hidden reasoning |
| Original Boolean checker passes its declared suite | results/test-results.json | Executed: 56/56 | Bounded two-state Boolean scope |
| State scorer passes independent transition and invalid-input tests | results/trace-test-results.json | Executed: 35/35 | Finite synthetic systems; no source HDL execution |
| 48 artificial errors can be missed by final-only scoring | results/trace-pilot-results.json and src/trace_cases.mjs | Executed synthetic controls: 0 whole-trace correct, 48 final-state correct | Every fixture has a midpoint reset; cannot estimate natural recovery |
| VerilogEval V2 evaluates RTL generation rather than per-cycle state-table accuracy | Pinned README: Overview, VerilogEvalV2 and Usage | Primary repository checked | Native benchmark not run |
| RTLLM contains updated generation/design-quality benchmark revisions | Pinned README: versions 2.1/2.0 and Workflow | Primary repository checked | README retains older count text; do not mix revision-specific results |
| FVEval has NL2SVA and Design2SVA tasks, with Jasper dependency | Pinned README: Requirements and Full Evaluation Suite | Primary repository checked | No commercial tool run or published-paper replication |
| Two reference designs have candidate bit-level adapters | benchmarks/sources.json, src/benchmark_adapters.mjs, results/benchmark-adapter-checks.json | Source review plus 520 one-step equation comparisons | No HDL-to-AST formal equivalence or simulation; not benchmark scores |
| Structured intermediate checks improve LLM downstream correctness | Proposed experiment, docs/STATE_REASONING_ZH.md | Untested hypothesis | No model calls or effect-size estimates |
| Trace errors cause hidden CoT errors | No available evidence | Not claimed | External state-prefix interventions cannot establish private internal causal mechanisms |
| Better state reasoning improves PPA | No available evidence | Not claimed | No synthesis, library, physical design or power activity measurements |

Source revisions and hashes are in benchmarks/sources.json. Earlier optimization references are retained in docs/LITERATURE_NOTES_ZH.md; their broad novelty audit remains incomplete.

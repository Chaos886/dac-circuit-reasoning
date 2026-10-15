# Third-party provenance

The two candidate transition adapters in src/benchmark_adapters.mjs were manually derived from the reference designs listed in sources.json:

- NVIDIA VerilogEval, Prob107_fsm1s_ref.sv. The upstream repository's MIT notices are retained in licenses/verilog-eval-LICENSE.txt, including its bundled human-eval notice.
- RTLLM, Memory/Shifter/right_shifter/verified_right_shifter.v. The upstream MIT notice is retained in licenses/RTLLM-LICENSE.txt.

FVEval is referenced for planned downstream tasks. No FVEval design or executable code was incorporated; its repository license declaration is retained in licenses/FVEval-LICENSE.txt as source-audit evidence.

The license files match the SHA-256 digests of LICENSE at the pinned revisions in sources.json. These notices do not claim that every third-party dataset has identical terms, nor do they supply a license for the original research code in this repository. The candidate adapters have not been validated against an HDL simulator.

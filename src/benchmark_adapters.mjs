/** Manual bit-level transcriptions of two pinned reference designs.
 * These are candidate adapters, not simulator-validated benchmark ports.
 * Provenance, reset preamble and limitations: benchmarks/sources.json.
 */
const v = name => ({ op: 'input', name });
export function benchmarkAdapterTasks() {
  const fsm = { schemaVersion: 1, id: 'verilogeval-Prob107-fsm1s-h8', family: 'verilogeval-fsm1s',
    semantics: 'single-clock-two-state', stateBits: ['state'], inputBits: ['reset', 'in_bit'],
    // Defined after a synchronous reset preamble; no claim of power-up state.
    initial: { state: true },
    next: { state: { op: 'mux', sel: v('reset'), whenTrue: { op: 'const', value: true },
      whenFalse: { op: 'xor', left: v('state'), right: { op: 'not', arg: v('in_bit') } } } },
    outputs: { out: v('state') },
    stimuli: [false, false, true, false, true, false, false, true].map((b, i) => ({ reset: i === 4, in_bit: b })) };
  const states = Array.from({ length: 8 }, (_, i) => 'q' + i);
  const shifter = { schemaVersion: 1, id: 'rtllm-right-shifter-h8', family: 'rtllm-right-shifter',
    semantics: 'single-clock-two-state', stateBits: states, inputBits: ['d'],
    initial: Object.fromEntries(states.map(s => [s, false])),
    next: Object.fromEntries(states.map((s, i) => [s, v(i === 7 ? 'd' : states[i + 1])])),
    outputs: Object.fromEntries(states.map((s, i) => ['out' + i, v(s)])),
    stimuli: [true, false, true, true, false, false, true, false].map(d => ({ d })) };
  return [fsm, shifter];
}

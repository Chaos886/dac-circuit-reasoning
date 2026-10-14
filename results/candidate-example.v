// Restricted AST export; checker semantics are two-state and combinational.
// Four-state X/Z behavior, state, timing, synthesis, and physical PPA are unverified.
// Contract assumptions are NOT enforced by this module.
module circuit_candidate(
  input wire a,
  input wire b,
  input wire c,
  input wire s,
  output wire y
);
  assign y = a;
endmodule

# Release Notes

## 2.0.5

- **Fix: `aux4 playbook execute` no longer exits `0` on a failing script.** A script line that doesn't
  match any registered action (a typo, or an action from a `--loadActions` plugin that wasn't loaded)
  used to be silently skipped. It is now a hard failure: a clear `Unknown action: "..."` message on
  stderr and a non-zero exit code. Thrown errors and failed shell commands already propagated
  correctly and are unaffected; this closes the one remaining case where a broken step could pass
  silently, which matters for scripts used as e2e test assertions (e.g. with `aux4/browser`'s
  `expect`-style actions).
- **Fix: correctly balanced nested `eval` blocks.** `eval ... end eval` wrapped inside another
  `eval ... end eval` previously matched the first (inner) `end eval` instead of its own, which — by
  coincidence — still produced the right output for simple cases but left the real closing marker of
  the outer block unaccounted for. Nesting is now depth-counted so each `eval` block is paired with
  its own matching `end eval` at any depth.

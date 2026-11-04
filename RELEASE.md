# Release notes

## value() / param() escaped parameters

An action's `execute` string can now use `value(x)`, `param(x)` and `param(x:flag)` instead of
hand-quoting `${x}`/`{{x}}`, with the same escaping semantics as aux4 core:

```yaml
actions:
  - expression: "type {text} in {app}"
    execute: "aux4 computer type --text value(text) param(app)"
  - expression: "type {text}"
    execute: "aux4 computer type --text value(text) param(app)"
```

- `value(x)` — the resolved value, single-quote escaped and wrapped in single quotes (`''` when
  unset/empty).
- `param(x)` — `--x '<escaped value>'`; an unset/empty value emits **nothing**, omitting the flag
  entirely rather than passing it empty.
- `param(x:flag)` — same as `param(x)`, emitting `--flag` instead of `--x`.

A value containing an apostrophe, a `$(...)` command substitution, a backtick, a double quote, or
extra spaces arrives at the target command exactly as typed — never interpreted by the shell.
A resolved value is also never expanded again: a value whose text contains `param(y)`, `value(y)`
or `${y}` arrives literally instead of pulling in another variable.

Lookup order is pattern-then-context: the pattern variable captured for that step (`in {app}`) is
checked before the block/context variable (`{{app}}` from `with app "..."`), which is what lets a
single `execute` string serve both a per-step override and a block-level default.

The legacy `${x}` (pattern variable) and `{{x}}` (context variable) substitution is unchanged —
`value()`/`param()` are an additional, opt-in syntax. Covered by
`package/test/value-param.test.md`.

## Context blocks (previous release)

A script can scope a plugin's actions to just part of itself instead of loading them globally for
the whole run:

```text
on context computer with app "Calculator"
  click on "7"
end of context
```

A plugin's action file opts in by declaring a top-level `context: <name>` key in the YAML its
`playbook:actions <name>` command outputs. A file with that key is never registered globally (it
behaves nothing like today's always-on plugins, e.g. `aux4/browser`'s action file, which has no
`context` key and is completely unaffected); instead the plugin command is invoked lazily — and
cached for the rest of the run — the first time a script enters a matching `on context <name>`
block, and never otherwise.

Inside the block, only that context's actions plus the built-ins (`set`, `print`, `define`,
`eval`) match; global actions and other contexts are hidden. `on context <name> with <key>
"<value>"` (repeatable) sets context variables (e.g. `{{app}}`) scoped to the block, restored on
exit. Blocks nest, including a context nested inside itself, with the innermost block winning.
Entering an unregistered context fails with a clear error naming the context and the script line.

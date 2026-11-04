# Release notes

## Context blocks

A script can now scope a plugin's actions to just part of itself instead of loading them globally
for the whole run:

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

Scripts and action files with no `on context` blocks are completely unaffected — this is covered
by a dedicated regression test (`package/test/context-blocks.test.md`) alongside the full set of
new behaviors.

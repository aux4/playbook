#### Description

Executes a playbook script file. Each line is matched against registered action patterns. Built-in actions, config.yaml actions, and global plugin actions are all loaded before execution.

A script can also use `on context <name> [with <key> "<value>" ...]` / `end of context` blocks to scope a plugin's actions to just that block instead of loading them globally. See the `aux4/playbook` README's "Context Blocks" section for the full behavior (lazy load, caching, scoping, nesting, and the unknown-context error).

An action's `execute` string may use `value(x)`, `param(x)` and `param(x:flag)` for aux4-core-style escaped parameter substitution, in addition to the legacy `${x}` (pattern variable) and `{{x}}` (context variable) syntax. See the README's "Escaped Parameters: value() / param()" section for the full semantics (escaping, omission of empty optional flags, and pattern-then-context lookup order).

#### Usage

```bash
aux4 playbook execute <file>
```

--file    Path to the playbook script file (required, positional)

#### Example

```bash
aux4 playbook execute login-flow.txt
```

Script example:
```
set "name" to "John"
print "hello {{name}}"
```

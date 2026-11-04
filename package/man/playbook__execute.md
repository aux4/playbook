#### Description

Executes a playbook script file. Each line is matched against registered action patterns. Built-in actions, config.yaml actions, and global plugin actions are all loaded before execution.

A script can also use `on context <name> [with <key> "<value>" ...]` / `end of context` blocks to scope a plugin's actions to just that block instead of loading them globally. See the `aux4/playbook` README's "Context Blocks" section for the full behavior (lazy load, caching, scoping, nesting, and the unknown-context error).

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

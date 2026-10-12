#### Description

Executes a playbook script file. Each line is matched against registered action patterns. Built-in actions, config.yaml actions, and plugin actions are all loaded before execution.

The command exits with a non-zero status and prints a message to stderr whenever the script
doesn't finish cleanly:

- **A line that doesn't match any registered action** fails the run with `Unknown action: "..."`
  and the line number. Before this check existed, an unrecognized line (a typo, or an action from
  a `--loadActions` plugin that wasn't loaded) was silently skipped and the command still exited
  `0` — making it unsafe to rely on for test assertions. This check only applies to the top-level
  script; actions inside a nested `eval` block are resolved by that block's own recursive run.
- **A thrown error from an action's underlying command** (a failing shell command, or a failed
  assertion from an action like `aux4/browser`'s `expect ... to be visible`) propagates as
  `Error executing playbook:` with the failing instruction, its parameters, and the underlying
  message.

This makes `aux4 playbook execute` safe to use as a pass/fail gate for e2e scripts — for example
`--loadActions browser` steps that assert on page state (see `aux4 playbook actions browser`).

A `"#"` character inside a quoted argument (e.g. a CSS id selector like `"#submit-button"`) is
never treated as the start of a `# comment` — only an unquoted `#` is.

#### Usage

```bash
aux4 playbook execute <file> [--loadActions <names>]
```

--file           Path to the playbook script file (required, positional)
--loadActions    Comma-separated list of action plugins to load (e.g. `browser`); defaults to all discoverable action plugins

#### Example

```bash
aux4 playbook execute login-flow.txt
```

Script example:
```
set "name" to "John"
print "hello {{name}}"
```

Failing example — an unrecognized line now fails the command instead of being silently skipped:

```bash
aux4 playbook execute bad.txt
```

```text
Error executing playbook:
  Instruction: this is not a real action
  Message: Unknown action: "this is not a real action" (line 1)
```

```bash
echo $?
```

```text
1
```

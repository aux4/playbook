# aux4/playbook

Natural language script execution engine. Playbook uses regex pattern matching to interpret human-readable instructions without AI.

## Installation

```bash
aux4 aux4 pkger install aux4/playbook
```

## Quick Start

Create a script file `hello.txt`:
```text
set "name" to "World"
print "Hello {{name}}!"
```

Run it:
```bash
aux4 playbook execute hello.txt
```

Output:
```text
Hello World!
```

## Commands

| Command | Description |
|---------|-------------|
| `aux4 playbook execute <file>` | Execute a playbook script file |
| `aux4 playbook list` | List all registered actions |
| `aux4 playbook actions` | Manage action plugins |

## Built-in Actions

| Action | Description |
|--------|-------------|
| `set {variable} to {value}` | Store a variable in context |
| `print {text}` | Output text to stdout |
| `eval ... end eval` | Execute nested playbook script |
| `define {name} ... end define` | Create a custom action |

## Config Actions

Define custom actions in a YAML file that map sentences to shell commands:

```yaml
actions:
  - expression: "deploy {app} to {env}"
    execute: "aux4 deploy run --app ${app} --env ${env}"
  - expression: "notify {channel} with {message}"
    execute: "aux4 slack send --channel ${channel} --message ${message}"
```

Pass the actions file when executing:
```bash
aux4 playbook execute script.txt --configFile actions.yaml
```

Then use them in scripts:
```text
deploy "my-app" to "production"
notify "ops" with "deployment complete"
```

Variables extracted from the expression (`${app}`, `${env}`) are substituted into the execute command. Context variables use `{{variable}}` syntax.

### Params

By default, pattern variables match quoted strings (e.g. `"value"`). Use `params` to override a variable's regex pattern so it matches unquoted values:

```yaml
actions:
  - expression: "repeat {text} {count} times"
    execute: "echo ${text} x${count}"
    params:
      count: \d+
```

```text
repeat "hello" 3 times
```

Output: `hello x3`

### Block Actions

Use `eval` and `after` to create block actions that wrap nested playbook instructions:

```yaml
actions:
  - expression: "section {title}\\n{script}\\nend section"
    execute: "echo start:${title}"
    eval: script
    after: "echo /section"
```

- `eval` — the variable containing the nested script body (executed as playbook instructions)
- `after` — command to run after the block ends

```text
section "tests"
  print "running test 1"
  print "running test 2"
end section
```

Output:
```text
start:tests
running test 1
running test 2
/section
```

## Command-Line Parameters

Pass parameters to playbook scripts via `--key value` flags:

```text
print "hello {{name}}, age {{age}}"
```

```bash
aux4 playbook execute greet.txt --name "Alice" --age "30"
```

Output: `hello Alice, age 30`

## Variable Syntax

- Pattern variables: `{name}` — extracted from matched text
- Context variables: `{{name}}` — substituted from context at runtime
- Nested access: `{{user.name}}`, `{{items[0].title}}`
- Optional variables: `{count?}` — match is optional

## Define

Create reusable actions inline using `define`:

```text
define "greet {name} from {city}"
  print "hello {{name}} from {{city}}"
end define

greet "Alice" from "NYC"
greet "Bob" from "London"
```

Defines can call other defines:

```text
define "say {word}"
  print "{{word}}!"
end define

define "greet {name}"
  say "hello {{name}}"
end define

greet "World"
```

## Eval

Execute nested playbook instructions dynamically:

```text
set "x" to "hello"
eval
  print "{{x}}"
end eval
```

## Comments

Lines starting with `#` are treated as comments:
```text
# This is a comment
print "hello"
```

## Plugin Actions

Packages can register actions as plugins by adding commands to the `playbook:actions` profile. See `aux4 playbook actions --help` for available plugins.

By default, every plugin's actions are loaded and registered when a script starts executing (as `aux4 playbook actions <name>` output), exactly like `aux4/browser`'s actions. A plugin can opt out of this and become **context-bound** instead — see Context Blocks below.

## Context Blocks

A plugin's action file (YAML output of its `playbook:actions <name>` command) can declare a top-level `context` key:

```yaml
context: computer
actions:
  - expression: "open {app}"
    execute: "aux4 computer open --app ${app}"
```

A file with a `context` key is **not** registered globally — its actions are invisible outside a matching block, and the plugin command is never even invoked until needed. Use it inside a script with `on context <name>` / `end of context`:

```text
on context computer
  open "Calculator"
end of context
```

Behavior:

- **Lazy, cached load.** The first time a script enters `on context <name>`, the engine runs `aux4 playbook actions <name>` to fetch its actions. The result is cached for the rest of that run — a second `on context <name>` block for the same name does not invoke the plugin command again. If the script never enters that block, the plugin command is never invoked at all (not even at startup).
- **Scoped visibility.** Inside the block, only that context's actions plus the built-ins (`set`, `print`, `define`, `eval`) match. Global (non-context) actions, and any other context's actions, are hidden. A `define` created inside a block only exists inside that block.
- **Optional block settings.** `on context <name> with <key> "<value>"` (repeatable) sets context variables (`{{key}}`) scoped to the block; they are not visible outside it, and any prior value for the same key is restored on exit:

  ```text
  on context computer with app "Calculator"
    click on "7"
  end of context
  ```

- **Nesting.** Blocks can nest, including a context nested inside itself. The innermost block's settings and actions win; the outer scope resumes unchanged when a nested block ends.
- **Unknown context.** Entering `on context <name>` when no plugin provides it fails with a clear error naming the context and the script line, e.g. `Unknown context "widget" (line 3): ...`.

A plugin command normally shows up in `aux4 playbook actions --help`; mark a context-bound plugin command `"private": true` in its package's `.aux4` so it is excluded from that listing (and from the default global-load discovery) while still answering `aux4 playbook actions <name>` directly.

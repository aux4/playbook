# aux4/playbook

Natural language script execution engine. Playbook uses regex pattern matching to interpret human-readable instructions without AI.

## Installation

```bash
aux4 install aux4/playbook
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

## Variable Syntax

- Pattern variables: `{name}` — extracted from matched text
- Context variables: `{{name}}` — substituted from context at runtime
- Nested access: `{{user.name}}`, `{{items[0].title}}`
- Optional variables: `{count?}` — match is optional

## Comments

Lines starting with `#` are treated as comments:
```text
# This is a comment
print "hello"
```

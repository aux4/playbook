# aux4/playbook

Natural language script execution engine. Playbook uses regex pattern matching to interpret human-readable instructions without AI.

## Installation

```bash
aux4 install aux4/playbook
```

## Quick Start

Create a script file `hello.txt`:
```
set "name" to "World"
print "Hello {{name}}!"
```

Run it:
```bash
aux4 playbook execute hello.txt
```

Output:
```
Hello World!
```

## Commands

| Command | Description |
|---------|-------------|
| `aux4 playbook execute <file>` | Execute a playbook script file |
| `aux4 playbook list` | List all registered skills |

## Built-in Skills

| Skill | Description |
|-------|-------------|
| `set {variable} to {value}` | Store a variable in context |
| `print {text}` | Output text to stdout |
| `eval ... end eval` | Execute nested playbook script |
| `define {name} ... end define` | Create a custom skill |

## Config.yaml Skills

Define custom skills in `config.yaml` that map sentences to shell commands:

```yaml
playbook:
  skills:
    - expression: "deploy {app} to {env}"
      execute: "aux4 deploy run --app ${app} --env ${env}"
    - expression: "notify {channel} with {message}"
      execute: "aux4 slack send --channel ${channel} --message ${message}"
```

Then use them in scripts:
```
deploy "my-app" to "production"
notify "ops" with "deployment complete"
```

Variables extracted from the expression (`${app}`, `${env}`) are substituted into the execute command. Context variables use `{{variable}}` syntax.

## Plugin Development

Packages can register skills via the `playbook:skills` profile extension:

1. Depend on `aux4/playbook` in your package `.aux4`
2. Add a `playbook:skills` profile with a command that outputs YAML
3. Create a YAML file with skill definitions

```json
{
  "dependencies": [
    "aux4/playbook"
  ],
  "profiles": [
    {
      "name": "playbook:skills",
      "commands": [
        {
          "name": "my-plugin",
          "execute": [
            "cat ${packageDir}/skills/my-plugin.yaml"
          ],
          "help": {
            "text": "My plugin skills"
          }
        }
      ]
    }
  ]
}
```

Plugin YAML format:
```yaml
skills:
  - expression: "go to {url}"
    execute: "aux4 browser goto --url ${url}"
```

## Variable Syntax

- Pattern variables: `{name}` — extracted from matched text
- Context variables: `{{name}}` — substituted from context at runtime
- Nested access: `{{user.name}}`, `{{items[0].title}}`
- Optional variables: `{count?}` — match is optional

## Comments

Lines starting with `!--` are treated as comments:
```
!-- This is a comment
print "hello"
```

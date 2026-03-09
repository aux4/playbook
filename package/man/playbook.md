#### Description

Natural language script execution engine. Playbook uses regex pattern matching to interpret human-readable instructions without AI.

Actions can be registered via:
- Built-in actions (set, print, define, eval, context load)
- config.yaml definitions
- Plugin packages via the `playbook:actions` profile

#### Usage

```bash
aux4 playbook <command>
```

#### Commands

- `execute` - Execute a playbook script file
- `list` - List all registered actions

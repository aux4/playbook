#### Description

Natural language script execution engine. Playbook uses regex pattern matching to interpret human-readable instructions without AI.

Skills can be registered via:
- Built-in skills (set, print, define, eval, context load)
- config.yaml definitions
- Plugin packages via the `playbook:skills` profile

#### Usage

```bash
aux4 playbook <command>
```

#### Commands

- `execute` - Execute a playbook script file
- `list` - List all registered skills

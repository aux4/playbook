#### Description

Executes a playbook script file. Each line is matched against registered skill patterns. Built-in skills, config.yaml skills, and plugin skills are all loaded before execution.

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

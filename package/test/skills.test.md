# Skills

## Config yaml skills

```file:config.yaml
config:
  skills:
    - expression: "greet {name}"
      execute: "echo Hello ${name}"
```

```file:greet.txt
greet "World"
```

```execute
aux4 playbook execute greet.txt --config
```

```expect
Hello World
```

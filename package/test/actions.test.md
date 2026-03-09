# Actions

## Config yaml actions

```file:config.yaml
config:
  actions:
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

## Block expression action with eval

```file:config.yaml
config:
  actions:
    - expression: "section {title}\\n{script}\\nend section"
      execute: "echo start:${title}"
      eval: script
      after: "echo /section"
```

```file:section-simple.txt
section "test"
  print "inside"
end section
```

```execute
aux4 playbook execute section-simple.txt --config
```

```expect
start:test
inside
/section
```

## Action with params regex

```file:config.yaml
config:
  actions:
    - expression: "repeat {text} {count} times"
      execute: "echo ${text} x${count}"
      params:
        count: \d+
```

```file:repeat.txt
repeat "hello" 3 times
```

```execute
aux4 playbook execute repeat.txt --config
```

```expect
hello x3
```

## Nested block expression action

```file:config.yaml
config:
  actions:
    - expression: "section {title}\\n{script}\\nend section"
      execute: "echo start:${title}"
      eval: script
      after: "echo /section"
```

```file:section-nested.txt
section "outer"
  print "before"
  section "inner"
    print "deep"
  end section
  print "after"
end section
```

```execute
aux4 playbook execute section-nested.txt --config
```

```expect
start:outer
before
start:inner
deep
/section
after
/section
```

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

## Block expression skill with eval

```file:config.yaml
config:
  skills:
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

## Nested block expression skill

```file:config.yaml
config:
  skills:
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

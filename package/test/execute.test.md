# Execute

## Simple print

```file:hello.txt
print "hello world"
```

```execute
aux4 playbook execute hello.txt
```

```expect
hello world
```

## Multiple prints

```file:multi.txt
print "line one"
print "line two"
print "line three"
```

```execute
aux4 playbook execute multi.txt
```

```expect
line one
line two
line three
```

## Set and print

```file:vars.txt
set "name" to "John"
print "hello {{name}}"
```

```execute
aux4 playbook execute vars.txt
```

```expect
hello John
```

## Set overwrite

```file:overwrite.txt
set "x" to "first"
print "{{x}}"
set "x" to "second"
print "{{x}}"
```

```execute
aux4 playbook execute overwrite.txt
```

```expect
first
second
```

## Parameters from command line

```file:greet.txt
print "hello {{name}}, age {{age}}"
```

```execute
aux4 playbook execute greet.txt --name "Alice" --age "30"
```

```expect
hello Alice, age 30
```

## Context variable in set value

```file:ctx-set.txt
set "first" to "John"
set "greeting" to "hello {{first}}"
print "{{greeting}}"
```

```execute
aux4 playbook execute ctx-set.txt
```

```expect
hello John
```

## Comments are ignored

```file:comments.txt
# this is a comment
print "visible"
# another comment
print "also visible"
```

```execute
aux4 playbook execute comments.txt
```

```expect
visible
also visible
```

## Define and use custom action

```file:define.txt
define "say hello {name}"
  print "hello {{name}}!"
end define

say hello "World"
```

```execute
aux4 playbook execute define.txt
```

```expect
hello World!
```

## Define with multiple parameters

```file:define-multi.txt
define "greet {name} from {city}"
  print "hello {{name}} from {{city}}"
end define

greet "Alice" from "NYC"
```

```execute
aux4 playbook execute define-multi.txt
```

```expect
hello Alice from NYC
```

## Define used multiple times

```file:define-reuse.txt
define "say {word}"
  print "{{word}}!"
end define

say "hello"
say "world"
say "test"
```

```execute
aux4 playbook execute define-reuse.txt
```

```expect
hello!
world!
test!
```

## Eval block

```file:eval.txt
set "x" to "from eval"
eval
  print "{{x}}"
end eval
```

```execute
aux4 playbook execute eval.txt
```

```expect
from eval
```

## Eval with set inside

```file:eval-set.txt
eval
  set "name" to "inner"
  print "{{name}}"
end eval
print "{{name}}"
```

```execute
aux4 playbook execute eval-set.txt
```

```expect
inner
inner
```

## Define inside eval

```file:define-eval.txt
eval
  define "shout {msg}"
    print "{{msg}}!!!"
  end define
end eval

shout "hey"
```

```execute
aux4 playbook execute define-eval.txt
```

```expect
hey!!!
```

## Nested eval blocks

```file:nested-eval.txt
set "a" to "outer"
eval
  set "b" to "inner"
  eval
    print "{{a}} {{b}}"
  end eval
end eval
```

```execute
aux4 playbook execute nested-eval.txt
```

```expect
outer inner
```

## Define with eval inside

```file:define-with-eval.txt
define "run {label}"
  eval
    print "running: {{label}}"
  end eval
end define

run "test1"
run "test2"
```

```execute
aux4 playbook execute define-with-eval.txt
```

```expect
running: test1
running: test2
```

## Multiple defines used in sequence

```file:multi-define.txt
define "greet {name}"
  print "hi {{name}}"
end define

define "farewell {name}"
  print "bye {{name}}"
end define

greet "Alice"
farewell "Bob"
greet "Charlie"
```

```execute
aux4 playbook execute multi-define.txt
```

```expect
hi Alice
bye Bob
hi Charlie
```

## Define calling another define

```file:define-chain.txt
define "say {word}"
  print "{{word}}!"
end define

define "greet {name}"
  say "hello {{name}}"
end define

greet "World"
```

```execute
aux4 playbook execute define-chain.txt
```

```expect
hello World!
```

## Nested custom block action

```file:nested-block.txt
define "section {title}"
  print "start:{{title}}"
end define

define "end section"
  print "end section"
end define

section "outer"
  print "in outer"
  section "inner"
    print "in inner"
  end section
  print "back to outer"
end section
```

```execute
aux4 playbook execute nested-block.txt
```

```expect
start:outer
in outer
start:inner
in inner
end section
back to outer
end section
```

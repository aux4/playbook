# Context Blocks

```file:.aux4
{
  "scope": "test",
  "name": "ctxfixtures",
  "version": "0.0.1",
  "profiles": [
    {
      "name": "main",
      "commands": []
    },
    {
      "name": "playbook:actions",
      "commands": [
        {
          "name": "gadget",
          "execute": [
            "cat gadget.yaml"
          ],
          "help": {
            "text": "gadget actions (context-bound, discoverable)"
          }
        },
        {
          "name": "noctx",
          "execute": [
            "cat noctx.yaml"
          ],
          "help": {
            "text": "legacy global actions, no context key"
          }
        },
        {
          "name": "counter",
          "private": true,
          "execute": [
            "echo call >> counter.log; cat counter.yaml"
          ],
          "help": {
            "text": "context-bound actions that record every time they are loaded"
          }
        }
      ]
    }
  ]
}
```

```file:gadget.yaml
context: gadget
actions:
  - expression: "activate gadget"
    execute: "echo gadget-active:{{app}}:"
```

```file:noctx.yaml
actions:
  - expression: "wave hello"
    execute: "echo waving"
```

```file:counter.yaml
context: counter
actions:
  - expression: "ping counter"
    execute: "echo pong"
```

## Backward compatibility

### a global action file with no context key still registers at startup, unchanged

```file:legacy.txt
wave hello
```

```execute
aux4 playbook execute legacy.txt
```

```expect
waving
```

### a plain script with no "on context" blocks behaves exactly as before

```file:plain.txt
set "name" to "World"
print "hello {{name}}"
```

```execute
aux4 playbook execute plain.txt
```

```expect
hello World
```

### a context-bound action is never registered globally, even outside any block

```file:noglobal.txt
print "before"
activate gadget
print "after"
```

```execute
aux4 playbook execute noglobal.txt
```

```expect
before
after
```

## Context filtering

### inside a block, only that context's actions and built-ins match; global actions are hidden

```file:scoped.txt
wave hello
on context gadget
  activate gadget
  wave hello
end of context
```

```execute
aux4 playbook execute scoped.txt
```

```expect
waving
gadget-active::
```

## Lazy loading

```beforeEach
rm -f counter.log
```

```afterAll
rm -f counter.log
```

### a context-bound action command is never invoked unless its block is actually entered

```file:nouse.txt
print "hello"
```

```execute
aux4 playbook execute nouse.txt; test -f counter.log && echo invoked || echo not-invoked
```

```expect
hello
not-invoked
```

### a context-bound action command is invoked exactly once per run, even with two block entries

```file:twice.txt
on context counter
  ping counter
end of context
on context counter
  ping counter
end of context
```

```execute
aux4 playbook execute twice.txt; wc -l < counter.log | tr -d ' '
```

```expect
pong
pong
1
```

## With-settings scoping

### "with app" sets a context variable scoped to the block, restored to empty after exit

```file:appscope.txt
on context gadget with app "Calculator"
  activate gadget
end of context
on context gadget
  activate gadget
end of context
```

```execute
aux4 playbook execute appscope.txt
```

```expect
gadget-active:Calculator:
gadget-active::
```

## Nesting

### nesting is allowed; the innermost block wins and the outer scope is restored on exit

```file:nested.txt
on context gadget with app "Outer"
  activate gadget
  on context gadget with app "Inner"
    activate gadget
  end of context
  activate gadget
end of context
```

```execute
aux4 playbook execute nested.txt
```

```expect
gadget-active:Outer:
gadget-active:Inner:
gadget-active:Outer:
```

## Define scoping

### a "define" created inside a block is scoped to that context only

```file:definescope.txt
on context gadget
  define "shout {text}"
    print "SHOUT:{{text}}"
  end define
  shout "hi"
end of context
shout "bye"
```

```execute
aux4 playbook execute definescope.txt
```

```expect
SHOUT:hi
```

## Unknown context

### entering an unregistered context fails with a clear error naming the context and line

```file:unknown.txt
on context nonexistent-ctx
  anything
end of context
```

```execute
aux4 playbook execute unknown.txt
```

```error:partial
Unknown context "nonexistent-ctx" (line 1)*?
```

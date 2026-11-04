# value() / param() in action execute strings

Verifies `value(x)`, `param(x)` and `param(x:flag)` in a context action's `execute` string, with
aux4-core-style single-quote escaping (`aux4/engine/param/inject.go`: `escapeValue`, `parseParam`).
Dispatches to a fake echo command so the exact, final shell command is visible.

```file:.aux4
{
  "scope": "test",
  "name": "vpfixtures",
  "version": "0.0.1",
  "profiles": [
    {
      "name": "main",
      "commands": [
        {
          "name": "echo-args",
          "execute": [
            "printf 'name=[%s] app=[%s]\\n' values(name, app)"
          ],
          "help": {
            "text": "Echo received flags",
            "variables": [
              { "name": "name", "text": "name", "default": "" },
              { "name": "app", "text": "app", "default": "" }
            ]
          }
        }
      ]
    },
    {
      "name": "playbook:actions",
      "commands": [
        {
          "name": "vp",
          "execute": [
            "cat vp.yaml"
          ],
          "help": {
            "text": "value()/param() action fixtures"
          }
        },
        {
          "name": "legacyvp",
          "execute": [
            "cat legacy.yaml"
          ],
          "help": {
            "text": "legacy ${x}/{{x}} action fixtures"
          }
        }
      ]
    }
  ]
}
```

```file:vp.yaml
context: vp
actions:
  - expression: "echo {text} in {app}"
    execute: "aux4 echo-args --name value(text) param(app)"

  - expression: "echo {text}"
    execute: "aux4 echo-args --name value(text) param(app)"

  - expression: "echo {text} as {flag}"
    execute: "aux4 echo-args --name value(text) param(flag:app)"
```

```file:legacy.yaml
context: legacyvp
actions:
  - expression: "legacy echo {text} in {app}"
    execute: "aux4 echo-args --name '${text}' --app '${app}'"

  - expression: "legacy echo {text}"
    execute: "aux4 echo-args --name '${text}' --app '{{app}}'"
```

## Special characters arrive verbatim

### an apostrophe survives through value()

```file:apostrophe.txt
on context vp with app "Calculator"
  echo "it's done"
end of context
```

```execute
aux4 playbook execute apostrophe.txt
```

```expect
name=[it's done] app=[Calculator]
```

### a $(...) command substitution is never executed

```file:subshell.txt
on context vp with app "Calculator"
  echo "$(whoami)"
end of context
```

```execute
aux4 playbook execute subshell.txt
```

```expect
name=[$(whoami)] app=[Calculator]
```

### a backtick command substitution is never executed

```file:backtick.txt
on context vp with app "Calculator"
  echo "`id`"
end of context
```

```execute
aux4 playbook execute backtick.txt
```

```expect
name=[`id`] app=[Calculator]
```

### double quotes survive verbatim

A value containing a literal double quote cannot be authored inside the
playbook script's own `"..."` literal syntax (unrelated pre-existing
limitation of the script's quoted-text matching), so this is exercised via a
context variable instead -- still routed through `param(app)`'s escaping.

```file:dquote.txt
on context vp
  echo "hello"
end of context
```

```execute
aux4 playbook execute dquote.txt --app 'say "hi" now'
```

```expect
name=[hello] app=[say "hi" now]
```

### spaces survive verbatim

```file:spaces.txt
on context vp with app "Calculator"
  echo "a   b    c"
end of context
```

```execute
aux4 playbook execute spaces.txt
```

```expect
name=[a   b    c] app=[Calculator]
```

### combined apostrophe, subshell and backtick in one value

```file:combined.txt
on context vp with app "Calculator"
  echo "it's done; echo $(whoami) `id`"
end of context
```

```execute
aux4 playbook execute combined.txt
```

```expect
name=[it's done; echo $(whoami) `id`] app=[Calculator]
```

## param() omits the flag entirely when empty

### no block app and no per-step app leaves --app omitted

```file:noapp.txt
on context vp
  echo "hello"
end of context
```

```execute
aux4 playbook execute noapp.txt
```

```expect
name=[hello] app=[]
```

## param(x:flag) emits the aliased flag name

### param(flag:app) emits --app, not --flag

```file:alias.txt
on context vp
  echo "hello" as "Finder"
end of context
```

```execute
aux4 playbook execute alias.txt
```

```expect
name=[hello] app=[Finder]
```

## Per-step override beats block app

### "in {app}" on a single step wins over the block's app for that line only

```file:override.txt
on context vp with app "Calculator"
  echo "one"
  echo "two" in "Finder"
  echo "three"
end of context
```

```execute
aux4 playbook execute override.txt
```

```expect
name=[one] app=[Calculator]
name=[two] app=[Finder]
name=[three] app=[Calculator]
```

## Resolved values are never re-expanded

### a value containing param(), value() and ${x} text arrives verbatim

```file:noreexpand.txt
set "secret" to "HUNTER2"
on context vp with app "Calculator"
  echo "use param(secret) value(secret) ${secret}"
end of context
```

```execute
aux4 playbook execute noreexpand.txt
```

```expect
name=[use param(secret) value(secret) ${secret}] app=[Calculator]
```

### an app name containing param() text arrives verbatim

```file:noreexpandapp.txt
set "secret" to "HUNTER2"
on context vp
  echo "hello" in "My param(secret) App"
end of context
```

```execute
aux4 playbook execute noreexpandapp.txt
```

```expect
name=[hello] app=[My param(secret) App]
```

## Legacy ${x} / {{x}} substitution is unchanged

### an action file still using ${x} and {{x}} directly behaves exactly as before

```file:legacy.txt
on context legacyvp with app "Calculator"
  legacy echo "one"
  legacy echo "two" in "Finder"
end of context
```

```execute
aux4 playbook execute legacy.txt
```

```expect
name=[one] app=[Calculator]
name=[two] app=[Finder]
```

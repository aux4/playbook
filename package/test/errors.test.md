# Execute errors

## Unknown action

### should fail with a non-zero exit code on an unrecognized line

```file:bad.txt
this is not a real action
```

```execute
aux4 playbook execute bad.txt
```

```error:partial
Unknown action: "this is not a real action" (line 1)
```

### should report the line number of the unrecognized line

```file:bad-line.txt
print "first"
print "second"
frobnicate the whatsit
```

```execute
aux4 playbook execute bad-line.txt
```

```expect
first
second
```

```error:partial
Unknown action: "frobnicate the whatsit" (line 3)
```

## Thrown command errors

### should fail with a non-zero exit code when a config action's command fails

```file:config.yaml
config:
  test:
    actions:
      - expression: "fail now"
        execute: "exit 7"
```

```file:failcmd.txt
fail now
```

```execute
aux4 playbook execute failcmd.txt --configFile config.yaml --config test
```

```error:partial
Command failed: exit 7
```

## Quoted "#" is never a comment

### should keep a CSS id selector intact instead of treating it as a comment

```file:config.yaml
config:
  actions:
    - expression: "echo id {selector}"
      execute: "echo got:${selector}"
```

```file:hash-selector.txt
echo id "#submit-button"
```

```execute
aux4 playbook execute hash-selector.txt --configFile config.yaml --config
```

```expect
got:#submit-button
```

### should still treat an unquoted "#" as a comment

```file:comment-after-code.txt
print "before"
# this is still a comment
print "after"
```

```execute
aux4 playbook execute comment-after-code.txt
```

```expect
before
after
```

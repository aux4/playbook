# Block Define

## Define block expression with eval

```file:block-define.txt
define "section {title}
{script}
end section"
  print "start:{{title}}"
  eval
    {{script}}
  end eval
  print "end:{{title}}"
end define

section "test"
  print "inside"
end section
```

```execute
aux4 playbook execute block-define.txt
```

```expect
start:test
inside
end:test
```

## Define block with multiple inner instructions

```file:block-multi.txt
define "section {title}
{script}
end section"
  print "start:{{title}}"
  eval
    {{script}}
  end eval
  print "end:{{title}}"
end define

section "page"
  print "line one"
  print "line two"
  print "line three"
end section
```

```execute
aux4 playbook execute block-multi.txt
```

```expect
start:page
line one
line two
line three
end:page
```

## Define block with set inside

```file:block-set.txt
define "section {title}
{script}
end section"
  print "start:{{title}}"
  eval
    {{script}}
  end eval
  print "end:{{title}}"
end define

section "form"
  set "name" to "Alice"
  print "hello {{name}}"
end section
```

```execute
aux4 playbook execute block-set.txt
```

```expect
start:form
hello Alice
end:form
```

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

## Define and use custom skill

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

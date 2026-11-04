#### Description

Extension point for plugin packages. Packages that depend on `aux4/playbook` can register actions by adding commands to the `playbook:actions` profile.

Each plugin command should output YAML action definitions when executed.

#### Plugin YAML format

```yaml
actions:
  - expression: "go to {url}"
    execute: "aux4 browser goto --url ${url}"
  - expression: "click {name}"
    execute: "aux4 browser click --name ${name}"
```

#### Context-bound plugins

Add a top-level `context: <name>` key to make the plugin's actions available only inside a matching `on context <name> ... end of context` block in a script, instead of registering them globally at startup:

```yaml
context: computer
actions:
  - expression: "open {app}"
    execute: "aux4 computer open --app ${app}"
```

The plugin command is then invoked lazily (and cached per run) the first time a script enters `on context <name>`, never at startup. Mark the command `"private": true` in the package's `.aux4` so it is excluded from `aux4 playbook actions --help` and from the default global-load discovery, while still answering `aux4 playbook actions <name>` directly.

#### Creating a plugin

In your package's `.aux4`, add a `playbook:actions` profile:

```json
{
  "name": "playbook:actions",
  "commands": [
    {
      "name": "my-plugin",
      "execute": [
        "cat ${packageDir}/actions/my-plugin.yaml"
      ],
      "help": {
        "text": "My plugin actions"
      }
    }
  ]
}
```

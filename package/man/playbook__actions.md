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

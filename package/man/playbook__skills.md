#### Description

Extension point for plugin packages. Packages that depend on `aux4/playbook` can register skills by adding commands to the `playbook:skills` profile.

Each plugin command should output YAML skill definitions when executed.

#### Plugin YAML format

```yaml
skills:
  - expression: "go to {url}"
    execute: "aux4 browser goto --url ${url}"
  - expression: "click {name}"
    execute: "aux4 browser click --name ${name}"
```

#### Creating a plugin

In your package's `.aux4`, add a `playbook:skills` profile:

```json
{
  "name": "playbook:skills",
  "commands": [
    {
      "name": "my-plugin",
      "execute": [
        "cat ${packageDir}/skills/my-plugin.yaml"
      ],
      "help": {
        "text": "My plugin skills"
      }
    }
  ]
}
```

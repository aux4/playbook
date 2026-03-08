import { execSync } from "child_process";

const VARIABLE_REGEX = /\{(?<name>[^\}?]*)(?<optional>\?)?\}/gm;
const COMMENT_REGEX = /\s*#.*\n/g;
const CONTEXT_VARIABLE_REGEX = /\{{2}(?<name>[^\}]*)\}{2}/g;
const QUOTED_TEXT = '("(?<VARNAME>[^"]*?)")';
const VARIABLE_EXPRESSION_REGEX = /(?<key>[^\.\[\]]+?)(\[(?<index>[^\]]+)\])*(\.|\n|$)/g;

const DEFAULT_DEFINITIONS = {
  script: /[\s\S]+?/
};

export default class Playbook {
  constructor() {
    this.skills = [];
  }

  register(expression, callback, definitions = {}) {
    let instruction = expression;

    const expressionDefinitions = Object.assign({}, DEFAULT_DEFINITIONS, definitions);

    const variableRegex = new RegExp(VARIABLE_REGEX);

    let match;
    while ((match = variableRegex.exec(expression)) !== null) {
      const variable = match[0];
      const name = match.groups.name;
      const optional = match.groups.optional === "?";
      const regexVariableDefinition =
        typeof expressionDefinitions[name] === "string"
          ? expressionDefinitions[name]
          : expressionDefinitions[name]?.source;
      const variableRegex = regexVariableDefinition
        ? `(?<${name}>${regexVariableDefinition})`
        : QUOTED_TEXT.replace("VARNAME", name);
      instruction = instruction.replace(variable, `${variableRegex}${optional ? "?" : ""}`);
    }

    this.skills.push({
      instruction: instruction,
      action: {
        expression: expression,
        callback: callback,
        definitions: expressionDefinitions
      }
    });
  }

  compile(script) {
    const commands = [];

    if (!script) {
      return commands;
    }

    const scriptWithNoComments = script.replace(COMMENT_REGEX, "");

    this.skills.forEach(skill => {
      const regex = new RegExp(skill.instruction, "gm");

      let match;
      while ((match = regex.exec(scriptWithNoComments)) !== null) {
        const result = match[0];

        commands.push({
          index: match.index,
          end: match.index + result.length,
          parameters: { ...match.groups },
          skill: skill
        });
      }
    });

    commands.sort((a1, a2) => {
      if (a1.index !== a2.index) {
        return a1.index - a2.index;
      }
      return a2.end - a1.end;
    });

    return commands;
  }

  exec(script, context = {}) {
    let commands = this.compile(script);
    let skillCount = this.skills.length;

    let lastPosition = -1;
    for (let ci = 0; ci < commands.length; ci++) {
      const command = commands[ci];
      if (command.index < lastPosition) {
        continue;
      }

      const parameters = [];
      const action = command.skill.action;

      Object.entries(command.parameters).forEach(([_, value]) => {
        parameters.push(replaceParameter(value, context));
      });

      parameters.push(context);

      try {
        if (process.env.DEBUG === "true") {
          console.error("[DEBUG]", script.substring(command.index, command.end), parameters, { ...context });
        }
        action.callback.apply(null, parameters);
      } catch (e) {
        const failedInstruction = script.substring(command.index, command.end).replace("\n", "\n  ");
        throw new ExecutionError(command, failedInstruction, parameters, e);
      }

      lastPosition = command.end;

      // Re-compile if new skills were registered (e.g. by define)
      if (this.skills.length !== skillCount) {
        skillCount = this.skills.length;
        const remaining = this.compile(script);
        commands = remaining;
        ci = -1;
        lastPosition = command.end;
        for (let j = 0; j < commands.length; j++) {
          if (commands[j].index >= lastPosition) {
            ci = j - 1;
            break;
          }
        }
      }
    }
  }

  async execAsync(script, context = {}) {
    let commands = this.compile(script);
    let skillCount = this.skills.length;

    let lastPosition = -1;
    for (let ci = 0; ci < commands.length; ci++) {
      const command = commands[ci];
      if (command.index < lastPosition) {
        continue;
      }

      const parameters = [];
      const action = command.skill.action;

      Object.entries(command.parameters).forEach(([_, value]) => {
        parameters.push(replaceParameter(value, context));
      });

      parameters.push(context);

      try {
        if (process.env.DEBUG === "true") {
          console.error("[DEBUG]", script.substring(command.index, command.end), parameters, { ...context });
        }
        await action.callback.apply(null, parameters);
      } catch (e) {
        const failedInstruction = script.substring(command.index, command.end).replace("\n", "\n  ");
        throw new ExecutionError(command, failedInstruction, parameters, e);
      }

      lastPosition = command.end;

      // Re-compile if new skills were registered (e.g. by define)
      if (this.skills.length !== skillCount) {
        skillCount = this.skills.length;
        const remaining = this.compile(script);
        commands = remaining;
        ci = -1;
        lastPosition = command.end;
        // Re-scan: skip already-processed commands via lastPosition
        for (let j = 0; j < commands.length; j++) {
          if (commands[j].index >= lastPosition) {
            ci = j - 1;
            break;
          }
        }
      }
    }
  }

  registerFromYaml(yamlContent) {
    const skills = parseYamlSkills(yamlContent);
    for (const skill of skills) {
      const { expression, execute } = skill;
      if (!expression || !execute) continue;

      const variableNames = [];
      const varRegex = new RegExp(VARIABLE_REGEX);
      let m;
      while ((m = varRegex.exec(expression)) !== null) {
        variableNames.push(m.groups.name);
      }

      this.register(expression, (...args) => {
        const context = args[args.length - 1];
        let cmd = execute;

        for (let i = 0; i < variableNames.length; i++) {
          const val = args[i] || "";
          cmd = cmd.replace(new RegExp(`\\$\\{${variableNames[i]}\\}`, "g"), val);
        }

        cmd = replaceParameter(cmd, context);

        try {
          const output = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
          if (output.trim()) console.log(output.trim());
        } catch (e) {
          throw new Error(`Command failed: ${cmd}\n${e.stderr || e.message}`);
        }
      });
    }
  }
}

export class ExecutionError extends Error {
  constructor(command, script, params, cause) {
    super(cause.message);
    this.command = command;
    this.script = script;
    this.params = params;
    this.cause = cause;
  }
}

function replaceParameter(parameter, context) {
  if (parameter === undefined || parameter === null) return "";

  let text = parameter;

  const regex = new RegExp(CONTEXT_VARIABLE_REGEX);

  let match;
  while ((match = regex.exec(parameter)) !== null) {
    const variable = match[0];
    const name = match.groups.name;
    const value = getValueFromContext(context, name);

    if (value !== undefined) {
      text = text.replace(variable, value);
    }
  }

  return text;
}

function getValueFromContext(context, name) {
  let value = context;

  const expression = new RegExp(VARIABLE_EXPRESSION_REGEX);

  let match;
  while (value !== undefined && (match = expression.exec(name)) !== null) {
    const params = match.groups;

    value = value[params.key];
    if (value !== undefined && params.index !== undefined) {
      value = value[params.index];
    }
  }

  return value;
}

function parseYamlSkills(yamlContent) {
  const skills = [];
  const lines = yamlContent.split("\n");
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- expression:")) {
      if (current) skills.push(current);
      current = { expression: extractYamlValue(trimmed, "- expression:") };
    } else if (trimmed.startsWith("expression:") && !trimmed.startsWith("- expression:")) {
      if (current) skills.push(current);
      current = { expression: extractYamlValue(trimmed, "expression:") };
    } else if (trimmed.startsWith("execute:") && current) {
      current.execute = extractYamlValue(trimmed, "execute:");
    }
  }

  if (current) skills.push(current);
  return skills;
}

function extractYamlValue(line, prefix) {
  let value = line.substring(prefix.length).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

export function install(playbook) {
  playbook.register("\\s*eval\n{script}\n\\s*end eval\n", (script, context) => {
    playbook.exec(script, context);
  });

  playbook.register("\\s*define\\s+{name}\n{script}\n\\s*end define\n", (name, script) => {
    const variables = [];

    const regex = new RegExp(VARIABLE_REGEX);
    let match;
    while ((match = regex.exec(name)) !== null) {
      const variable = match.groups.name;
      variables.push(variable);
    }

    playbook.register(name, (...args) => {
      const context = args[args.length - 1];

      for (let i = 0; i < variables.length; i++) {
        const variable = variables[i];
        const value = args[i];
        context[variable] = value;
      }

      playbook.exec(script, context);
    });
  });

  playbook.register("set {variable} to {value}", (variable, value, context) => {
    context[variable] = value;
  });

  playbook.register("print {text}", text => {
    console.log(text);
  });

}

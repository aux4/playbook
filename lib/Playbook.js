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
    this.actions = [];
  }

  register(expression, callback, definitions = {}, meta = {}) {
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

    this.actions.push({
      instruction: instruction,
      action: {
        expression: expression,
        callback: callback,
        definitions: expressionDefinitions,
        balancedBlock: meta.balancedBlock
      }
    });
  }

  compile(script) {
    const commands = [];

    if (!script) {
      return commands;
    }

    const scriptWithNoComments = stripComments(script);

    this.actions.forEach(action => {
      if (action.action.balancedBlock) {
        const { start, end } = action.action.balancedBlock;
        findBalancedBlocks(scriptWithNoComments, start, end).forEach(block => {
          commands.push({
            index: block.index,
            end: block.end,
            parameters: { script: block.script },
            entry: action
          });
        });
        return;
      }

      const regex = new RegExp(action.instruction, "gm");

      let match;
      while ((match = regex.exec(scriptWithNoComments)) !== null) {
        const result = match[0];

        commands.push({
          index: match.index,
          end: match.index + result.length,
          parameters: { ...match.groups },
          entry: action
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
    this.run(script, context);
    assertFullCoverage(this, script);
  }

  // Runs a script without the end-of-script "unknown action" check. Used for
  // the top-level call's own loop and for nested invocations (eval/define
  // bodies) where the enclosing call already owns the coverage check.
  run(script, context = {}) {
    let commands = this.compile(script);
    let actionCount = this.actions.length;

    let lastPosition = -1;
    for (let ci = 0; ci < commands.length; ci++) {
      const command = commands[ci];
      if (command.index < lastPosition && command.end <= lastPosition) {
        continue;
      }

      const parameters = [];
      const action = command.entry.action;

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

      // Re-compile if new actions were registered (e.g. by define)
      if (this.actions.length !== actionCount) {
        actionCount = this.actions.length;
        const remaining = this.compile(script);
        commands = remaining;
        ci = -1;
        lastPosition = command.end;
        for (let j = 0; j < commands.length; j++) {
          if (commands[j].index >= lastPosition || commands[j].end > lastPosition) {
            ci = j - 1;
            break;
          }
        }
      }
    }
  }

  async execAsync(script, context = {}) {
    await this.runAsync(script, context);
    assertFullCoverage(this, script);
  }

  async runAsync(script, context = {}) {
    let commands = this.compile(script);
    let actionCount = this.actions.length;

    let lastPosition = -1;
    for (let ci = 0; ci < commands.length; ci++) {
      const command = commands[ci];
      if (command.index < lastPosition && command.end <= lastPosition) {
        continue;
      }

      const parameters = [];
      const action = command.entry.action;

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

      // Re-compile if new actions were registered (e.g. by define)
      if (this.actions.length !== actionCount) {
        actionCount = this.actions.length;
        const remaining = this.compile(script);
        commands = remaining;
        ci = -1;
        lastPosition = command.end;
        // Re-scan: skip already-processed commands via lastPosition
        for (let j = 0; j < commands.length; j++) {
          if (commands[j].index >= lastPosition || commands[j].end > lastPosition) {
            ci = j - 1;
            break;
          }
        }
      }
    }
  }

  registerFromYaml(yamlContent) {
    const actions = parseYamlActions(yamlContent);
    for (const entry of actions) {
      const { expression, execute, eval: evalVar, after, params: defs } = entry;
      if (!expression || !execute) continue;

      if (evalVar) {
        const splitPattern = `\\n{${evalVar}}\\n`;
        const parts = expression.split(splitPattern);
        if (parts.length !== 2) continue;

        const startExpression = parts[0];
        const endExpression = parts[1];

        const startVarNames = [];
        const startVarRegex = new RegExp(VARIABLE_REGEX);
        let sm;
        while ((sm = startVarRegex.exec(startExpression)) !== null) {
          startVarNames.push(sm.groups.name);
        }

        this.register(startExpression, (...args) => {
          const context = args[args.length - 1];
          let cmd = execute;
          for (let i = 0; i < startVarNames.length; i++) {
            const val = args[i] || "";
            cmd = cmd.replace(new RegExp(`\\$\\{${startVarNames[i]}\\}`, "g"), val);
          }
          runCommand(cmd, context);
        }, defs);

        this.register(endExpression, (...args) => {
          if (after) {
            const context = args[args.length - 1];
            runCommand(after, context);
          }
        });
      } else {
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

          runCommand(cmd, context);
        }, defs);
      }
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

export class UnknownActionError extends Error {
  constructor(text, line) {
    const trimmed = text.trim();
    super(`Unknown action: "${trimmed}"${line ? ` (line ${line})` : ""}`);
    this.script = trimmed;
    this.params = [];
    this.line = line;
  }
}

const COMMENT_MASK = "\u0000";

// Strips "# comment" lines, but never treats a "#" inside a quoted string as a
// comment marker -- a literal CSS id selector like "#result" is extremely
// common in browser-driven scripts and must survive intact. Quoted "#"
// characters are masked with a placeholder (never valid script content) before
// the original comment regex runs, then restored afterwards.
function stripComments(script) {
  if (!script) return "";

  let masked = "";
  let inQuotes = false;
  for (let i = 0; i < script.length; i++) {
    const ch = script[i];
    if (ch === '"') inQuotes = !inQuotes;
    masked += ch === "#" && inQuotes ? COMMENT_MASK : ch;
  }

  let stripped = masked.replace(COMMENT_REGEX, "").split(COMMENT_MASK).join("#");
  if (!stripped.endsWith("\n")) stripped += "\n";
  return stripped;
}

// Matches a block whose start/end markers are the SAME literal token at every
// nesting depth (e.g. "eval" / "end eval" nested inside itself), which a
// single non-recursive regex cannot capture correctly: a lazy quantifier
// stops at the first inner closing marker instead of the matching outer one.
// Depth-counts line by line so the outermost pair is matched as one block;
// its captured body is handed back to the engine to resolve any further
// nesting recursively.
function findBalancedBlocks(script, startRe, endRe) {
  const lines = script.split("\n");
  const lineOffsets = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const blocks = [];
  const stack = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (startRe.test(line)) {
      stack.push(i);
    } else if (endRe.test(line)) {
      if (stack.length === 0) continue;
      const startLine = stack.pop();
      if (stack.length === 0) {
        const index = lineOffsets[startLine];
        const end = lineOffsets[i] + lines[i].length + 1;
        const scriptStart = lineOffsets[startLine] + lines[startLine].length + 1;
        const scriptEnd = lineOffsets[i];
        blocks.push({ index, end, script: script.substring(scriptStart, scriptEnd) });
      }
    }
  }

  return blocks;
}

// Finds the first stretch of non-whitespace content in the (comment-stripped)
// script that is not covered by any matched command. Returns null when every
// non-blank line was recognized as a registered action.
function findUnmatchedSpan(strippedScript, commands) {
  const sorted = [...commands].sort((a1, a2) => {
    if (a1.index !== a2.index) return a1.index - a2.index;
    return a2.end - a1.end;
  });

  let cursor = 0;
  for (const command of sorted) {
    if (command.index > cursor) {
      const gap = strippedScript.substring(cursor, command.index);
      if (gap.trim() !== "") {
        return { text: gap, index: cursor + gap.search(/\S/) };
      }
    }
    if (command.end > cursor) {
      cursor = command.end;
    }
  }

  if (cursor < strippedScript.length) {
    const gap = strippedScript.substring(cursor);
    if (gap.trim() !== "") {
      return { text: gap, index: cursor + gap.search(/\S/) };
    }
  }

  return null;
}

// After a script finishes running, verify every non-comment, non-blank line
// was matched by a registered action. A line that matched nothing silently
// executed as a no-op before this check existed -- this turns that into a
// hard failure (non-zero exit) instead of a silently-skipped assertion/step.
function assertFullCoverage(playbook, script) {
  const stripped = stripComments(script);
  const commands = playbook.compile(script);
  const unmatched = findUnmatchedSpan(stripped, commands);

  if (unmatched) {
    const line = stripped.substring(0, unmatched.index).split("\n").length;
    throw new UnknownActionError(unmatched.text, line);
  }
}

function runCommand(cmd, context) {
  cmd = replaceParameter(cmd, context);
  try {
    const output = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    if (output.trim()) console.log(output.trim());
  } catch (e) {
    throw new Error(`Command failed: ${cmd}\n${e.stderr || e.message}`);
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

function parseYamlActions(yamlContent) {
  const actions = [];
  const lines = yamlContent.split("\n");
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- expression:")) {
      if (current) actions.push(current);
      current = { expression: extractYamlValue(trimmed, "- expression:") };
    } else if (trimmed.startsWith("expression:") && !trimmed.startsWith("- expression:")) {
      if (current) actions.push(current);
      current = { expression: extractYamlValue(trimmed, "expression:") };
    } else if (trimmed.startsWith("execute:") && current) {
      current.execute = extractYamlValue(trimmed, "execute:");
    } else if (trimmed.startsWith("eval:") && current) {
      current.eval = extractYamlValue(trimmed, "eval:");
    } else if (trimmed.startsWith("after:") && current) {
      current.after = extractYamlValue(trimmed, "after:");
    } else if (trimmed.startsWith("params:") && current) {
      current.params = {};
    } else if (trimmed.match(/^\w+:/) && current && current.params !== undefined && !trimmed.startsWith("- ")) {
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.substring(0, colonIdx).trim();
      const val = extractYamlValue(trimmed, key + ":");
      if (key && val) current.params[key] = val;
    }
  }

  if (current) actions.push(current);
  return actions;
}

function extractYamlValue(line, prefix) {
  let value = line.substring(prefix.length).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

export function install(playbook) {
  playbook.register(
    "\\s*eval\n{script}\n\\s*end eval\n",
    (script, context) => {
      playbook.run(script, context);
    },
    {},
    { balancedBlock: { start: /^\s*eval\s*$/, end: /^\s*end eval\s*$/ } }
  );

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

      playbook.run(script, context);
    });
  });

  playbook.register("set {variable} to {value}", (variable, value, context) => {
    context[variable] = value;
  });

  playbook.register("print {text}", text => {
    console.log(text);
  });

}

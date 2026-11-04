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

    this.actions.push({
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

    let scriptWithNoComments = script.replace(COMMENT_REGEX, "");
    if (!scriptWithNoComments.endsWith("\n")) scriptWithNoComments += "\n";

    this.actions.forEach(action => {
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

  // Public entry point. Detects "on context <name> ... end of context" blocks
  // and dispatches to the block-aware execution path when present; scripts
  // with NO such blocks go through _execLegacy unchanged, which is a verbatim
  // copy of this method's original (pre-context-blocks) body -- this is what
  // guarantees byte-for-byte backward compatibility for every existing
  // playbook script and action file.
  exec(script, context = {}, options = {}) {
    const segments = splitContextBlocks(script);
    if (!segments) {
      return this._execLegacy(script, context);
    }

    const runtime = {
      loader: options.loader || defaultContextLoader,
      cache: options.cache || new Map()
    };

    this._execSegments(segments, context, runtime);
  }

  _execSegments(segments, context, runtime) {
    for (const segment of segments) {
      if (segment.type === "text") {
        this._execLegacy(segment.text, context);
      } else {
        this._execContextBlock(segment, context, runtime);
      }
    }
  }

  _execContextBlock(segment, context, runtime) {
    const { name, settings } = parseContextHeader(segment.header);
    const yamlText = this._loadContext(name, segment.headerLine, runtime);

    const scoped = new Playbook();
    install(scoped);
    scoped.registerFromYaml(yamlText);

    const blockContext = { ...context, ...settings };
    scoped.exec(segment.body, blockContext, { loader: runtime.loader, cache: runtime.cache });
  }

  async _execContextBlockAsync(segment, context, runtime) {
    const { name, settings } = parseContextHeader(segment.header);
    const yamlText = this._loadContext(name, segment.headerLine, runtime);

    const scoped = new Playbook();
    install(scoped);
    scoped.registerFromYaml(yamlText);

    const blockContext = { ...context, ...settings };
    await scoped.execAsync(segment.body, blockContext, { loader: runtime.loader, cache: runtime.cache });
  }

  _loadContext(name, headerLine, runtime) {
    let yamlText = runtime.cache.get(name);
    if (yamlText !== undefined) {
      return yamlText;
    }

    let loaded;
    try {
      loaded = runtime.loader(name);
    } catch (e) {
      throw new UnknownContextError(name, headerLine, (e.stderr && e.stderr.toString().trim()) || e.message);
    }

    if (!loaded || !loaded.trim()) {
      throw new UnknownContextError(name, headerLine);
    }

    yamlText = loaded;
    runtime.cache.set(name, yamlText);
    return yamlText;
  }

  // Verbatim original exec() body (pre-context-blocks). Never change this
  // method's behavior -- it is the backward-compatibility guarantee for
  // scripts and action files with no "on context" blocks.
  _execLegacy(script, context = {}) {
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

  // Public async entry point. Same role as exec(): detects context blocks and
  // dispatches, otherwise delegates to _execLegacyAsync unchanged.
  async execAsync(script, context = {}, options = {}) {
    const segments = splitContextBlocks(script);
    if (!segments) {
      return this._execLegacyAsync(script, context);
    }

    const runtime = {
      loader: options.loader || defaultContextLoader,
      cache: options.cache || new Map()
    };

    await this._execSegmentsAsync(segments, context, runtime);
  }

  async _execSegmentsAsync(segments, context, runtime) {
    for (const segment of segments) {
      if (segment.type === "text") {
        await this._execLegacyAsync(segment.text, context);
      } else {
        await this._execContextBlockAsync(segment, context, runtime);
      }
    }
  }

  // Verbatim original execAsync() body (pre-context-blocks).
  async _execLegacyAsync(script, context = {}) {
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
          const localVars = {};
          for (let i = 0; i < startVarNames.length; i++) {
            const val = args[i] || "";
            localVars[startVarNames[i]] = val;
            cmd = cmd.replace(new RegExp(`\\$\\{${startVarNames[i]}\\}`, "g"), val);
          }
          runCommand(cmd, context, localVars);
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
          const localVars = {};

          for (let i = 0; i < variableNames.length; i++) {
            const val = args[i] || "";
            localVars[variableNames[i]] = val;
            cmd = cmd.replace(new RegExp(`\\$\\{${variableNames[i]}\\}`, "g"), val);
          }

          runCommand(cmd, context, localVars);
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

export class UnknownContextError extends Error {
  constructor(name, line, detail) {
    let message =
      `Unknown context "${name}" (line ${line}): no playbook actions found for context "${name}". ` +
      `Install a package that provides it (e.g. "aux4 aux4 pkger install aux4/${name}") so that ` +
      `"aux4 playbook actions ${name}" prints its action definitions.`;
    if (detail) message += ` (${detail})`;

    super(message);
    this.context = name;
    this.line = line;
  }
}

const CONTEXT_HEADER_LINE_REGEX = /^on\s+context\s+(.+)$/;
const CONTEXT_END_LINE_REGEX = /^end\s+of\s+context$/;
const WITH_CLAUSE_REGEX = /with\s+(\w+)\s+"([^"]*)"/g;

// Loads a context's action definitions the same way the engine's startup
// global-load path does: shell out to the "playbook:actions <name>" plugin
// command. Only invoked lazily, the first time a matching "on context <name>"
// block is actually entered during a run (and cached after that).
function defaultContextLoader(name) {
  return execSync(`aux4 playbook actions ${name}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

// Parses the text after "on context " into the context name and any
// "with <key> "<value>"" clauses, e.g. 'computer with app "Calculator"' ->
// { name: "computer", settings: { app: "Calculator" } }.
function parseContextHeader(header) {
  const trimmed = header.trim();
  const nameMatch = /^(\S+)/.exec(trimmed);
  const name = nameMatch ? nameMatch[1] : trimmed;

  const settings = {};
  const withRegex = new RegExp(WITH_CLAUSE_REGEX);
  let match;
  while ((match = withRegex.exec(trimmed)) !== null) {
    settings[match[1]] = match[2];
  }

  return { name, settings };
}

// Finds top-level "on context <name> [with k "v"]*" ... "end of context"
// blocks in a script, pairing them with a line-by-line depth counter (not a
// single regex) so that nesting -- including a context nested inside another
// "on context" block, or the same context nested inside itself -- is paired
// correctly regardless of indentation. Returns null when the script has no
// "on context" line at all, which is the signal callers use to take the
// completely unmodified legacy execution path (scripts without blocks must
// behave byte-for-byte as before this feature existed).
function splitContextBlocks(script) {
  if (!script) return null;

  const lines = script.split("\n");
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }

  const stack = [];
  const ranges = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const headerMatch = CONTEXT_HEADER_LINE_REGEX.exec(trimmed);

    if (headerMatch) {
      stack.push({ line: i, header: headerMatch[1] });
    } else if (CONTEXT_END_LINE_REGEX.test(trimmed)) {
      if (stack.length === 0) {
        throw new Error(`"end of context" without a matching "on context" (line ${i + 1})`);
      }

      const opened = stack.pop();
      if (stack.length === 0) {
        const bodyStart = offsets[opened.line] + lines[opened.line].length + 1;
        const bodyEnd = offsets[i];
        const blockEnd = offsets[i] + lines[i].length + 1;

        ranges.push({
          index: offsets[opened.line],
          end: blockEnd,
          header: opened.header,
          headerLine: opened.line + 1,
          body: script.substring(bodyStart, bodyEnd)
        });
      }
    }
  }

  if (stack.length > 0) {
    const unterminated = stack[0];
    throw new Error(`"on context ${unterminated.header}" without a matching "end of context" (line ${unterminated.line + 1})`);
  }

  if (ranges.length === 0) {
    return null;
  }

  const segments = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.index > cursor) {
      segments.push({ type: "text", text: script.substring(cursor, range.index) });
    }
    segments.push({ type: "context", header: range.header, headerLine: range.headerLine, body: range.body });
    cursor = range.end;
  }
  if (cursor < script.length) {
    segments.push({ type: "text", text: script.substring(cursor) });
  }

  return segments;
}

function runCommand(cmd, context, localVars = {}) {
  // value(x)/param(x)/param(x:flag) give action authors aux4-core-style escaping
  // instead of hand-quoting ${x}/{{x}} themselves. Resolved before the legacy
  // ${x}/{{x}} substitution below so both syntaxes can coexist in the same
  // execute string (e.g. a third-party action file still using {{app}}
  // directly keeps working unchanged).
  cmd = resolveValueParamFunctions(cmd, localVars, context);

  // Unlike replaceParameter() (used by the dispatch loop on every matched
  // pattern parameter, including a captured-but-not-yet-executed {script}
  // body for eval/define blocks, where an unset var MUST survive as a
  // literal "{{name}}" placeholder so it can resolve later against an
  // updated context -- see getValueFromContext), runCommand resolves a
  // concrete, final shell command that is about to run RIGHT NOW. There is
  // no "later" for this string, so an unset context variable defaults to ""
  // instead of leaving the placeholder text. This is what lets an action
  // template unconditionally embed e.g. `--app "{{app}}"` and rely on the
  // flag arriving empty (equivalent to omitted) when a context block has no
  // matching "with app ..." clause.
  cmd = replaceParameter(cmd, context, { defaultToEmpty: true });
  try {
    const output = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    if (output.trim()) console.log(output.trim());
  } catch (e) {
    throw new Error(`Command failed: ${cmd}\n${e.stderr || e.message}`);
  }
}

const VALUE_FUNCTION_REGEX = /value\(([^()]+)\)/g;
const PARAM_FUNCTION_REGEX = /param\(([^()]+)\)/g;

// Resolves value(x) and param(x)/param(x:flag) in an action's execute string,
// mirroring aux4 core's semantics (aux4/engine/param/inject.go: escapeValue,
// parseParam):
//   - value(x): the resolved value, single-quote escaped and wrapped in single
//     quotes. An unset/empty value resolves to '' (an empty, present argument).
//   - param(x): "--x '<escaped>'". An unset/empty value emits NOTHING -- the
//     flag is omitted entirely, not passed as an empty string.
//   - param(x:flag): same as param(x), but the emitted flag is "--flag".
// Lookup order: the pattern-captured variable for this step (e.g. "in {app}")
// first, then the block/context variable (e.g. "with app" -> {{app}}).
function resolveValueParamFunctions(cmd, localVars, context) {
  cmd = cmd.replace(VALUE_FUNCTION_REGEX, (_, name) => {
    const value = lookupVariable(name.trim(), localVars, context);
    return `'${escapeShellValue(value)}'`;
  });

  cmd = cmd.replace(PARAM_FUNCTION_REGEX, (_, expression) => {
    let variableName = expression.trim();
    let flagName = variableName;

    if (variableName.includes(":")) {
      const parts = variableName.split(":");
      variableName = parts[0].trim();
      flagName = parts[1].trim();
    }

    const value = lookupVariable(variableName, localVars, context);
    if (value === undefined || value === null || value === "") {
      return "";
    }

    return `--${flagName} '${escapeShellValue(value)}'`;
  });

  return cmd;
}

// Pattern variable first (per-step capture), then context variable.
function lookupVariable(name, localVars, context) {
  if (localVars && Object.prototype.hasOwnProperty.call(localVars, name)) {
    return localVars[name];
  }
  return getValueFromContext(context, name);
}

function escapeShellValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/'/g, "'\\''");
}

function replaceParameter(parameter, context, options = {}) {
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
    } else if (options.defaultToEmpty) {
      text = text.replace(variable, "");
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

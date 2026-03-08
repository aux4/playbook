#!/usr/bin/env node

import Playbook, { install } from "../lib/Playbook.js";
import fs from "fs";
import { execSync } from "child_process";

const args = process.argv.slice(2);
const action = args[0];

if (action !== "execute" && action !== "list") {
  console.error(`Invalid action: ${action}. Use "execute" or "list".`);
  process.exit(2);
}

const playbook = new Playbook();
install(playbook);

if (action === "list") {
  playbook.skills.forEach(skill => {
    let expression = skill.action.expression;
    expression = expression.replace(/\\n/g, "\n");
    expression = expression.replace(/\\s\*/g, "");
    expression = expression.replace(/\\s\+/g, " ");
    expression = expression.trim();

    if (expression.includes("\n")) {
      expression = expression.replace(/\n/g, "\n  ");
    }

    console.log(`* ${expression}`);
  });
  process.exit(0);
}

if (action === "execute") {
  const file = args[1];
  const skillsJson = args[2] || "[]";
  const loadSkillsArg = args[3] || "";
  const paramsJson = args[4] || "{}";

  if (!file) {
    console.error("No file provided.");
    process.exit(3);
  }

  const AUX4_INTERNAL = new Set(["packageDir", "aux4HomeDir", "configDir", "file", "skills"]);
  let context = {};
  try {
    const parsed = JSON.parse(paramsJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        if (!AUX4_INTERNAL.has(key)) {
          context[key] = value;
        }
      }
    }
  } catch {
    // Not valid JSON, ignore
  }

  // Register skills from config.yaml (passed by aux4/config as JSON)
  try {
    const skills = JSON.parse(skillsJson);
    if (Array.isArray(skills)) {
      const yamlLines = ["skills:"];
      for (const skill of skills) {
        yamlLines.push(`  - expression: "${skill.expression}"`);
        yamlLines.push(`    execute: "${skill.execute}"`);
      }
      playbook.registerFromYaml(yamlLines.join("\n"));
    }
  } catch {
    // Not valid JSON, ignore
  }

  // Load plugin skills
  const skillNames = loadSkillsArg
    ? loadSkillsArg.split(",").map(s => s.trim()).filter(Boolean)
    : discoverSkills();

  for (const name of skillNames) {
    try {
      const yamlOutput = execSync(`aux4 playbook skills ${name} 2>/dev/null`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      }).trim();
      if (yamlOutput) {
        playbook.registerFromYaml(yamlOutput);
      }
    } catch {
      // Skill not found or failed to load
    }
  }

  let script;
  try {
    script = fs.readFileSync(file, { encoding: "utf-8" });
  } catch (e) {
    console.error(`Error reading the file ${file}: ${e.message}`);
    process.exit(4);
  }

  try {
    await playbook.execAsync(script, context);
  } catch (e) {
    const instruction = e.script || "";
    const params = e.params || [];
    const message = e.cause?.message || e.message;

    console.error("Error executing playbook:");
    if (instruction) console.error(`  Instruction: ${instruction}`);
    if (params.length > 1) console.error(`  Parameters: ${params.slice(0, -1).join(", ")}`);
    console.error(`  Message: ${message}`);
    process.exit(1);
  }
}

function discoverSkills() {
  try {
    const output = execSync("aux4 playbook skills --help 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();

    if (!output) return [];

    const stripped = output.replace(/\x1b\[[0-9;]*m/g, "");
    const matches = stripped.match(/^\s+(\S+)\s/gm);
    if (!matches) return [];

    return matches
      .map(m => m.trim().split(/\s/)[0])
      .filter(name => name && name !== "skills");
  } catch {
    return [];
  }
}

import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { join, resolve } from 'path';

const CONFIG_FILENAME = '.digitalpM.json';

/**
 * Resolves the config file path for a given project directory.
 */
export function getConfigPath(projectPath) {
  return join(resolve(projectPath), CONFIG_FILENAME);
}

/**
 * Reads the .digitalpM.json config for a project.
 * Returns null if the file does not exist — this is the Phase A signal, not an error.
 */
export async function readConfig(projectPath) {
  const configPath = getConfigPath(projectPath);
  try {
    await access(configPath);
  } catch {
    return null;
  }
  const raw = await readFile(configPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid .digitalpM.json at ${configPath}: ${err.message}`);
  }
}

/**
 * Writes (or updates) the .digitalpM.json config for a project.
 * Deep-merges with existing config if present.
 */
export async function writeConfig(projectPath, updates) {
  const existing = (await readConfig(projectPath)) ?? {};
  const config = {
    ...existing,
    ...updates,
    sync: {
      ...(existing.sync ?? {}),
      ...(updates.sync ?? {}),
    },
  };
  const configPath = getConfigPath(projectPath);
  await mkdir(resolve(projectPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return config;
}

/**
 * Resolves the effective project path from a tool argument.
 * Falls back to process.cwd() — Claude Code sets cwd to the open project directory.
 */
export function resolveProjectPath(projectPath) {
  return projectPath ? resolve(projectPath) : process.cwd();
}

/**
 * Creates a minimal default config object for a new project.
 */
export function createDefaultConfig(projectName, notebookUrl, description, researchTopics) {
  const now = new Date().toISOString();
  return {
    notebook_url: notebookUrl,
    project_name: projectName,
    description: description ?? '',
    research_topics: researchTopics ?? [],
    sync: {
      mode: 'on_demand',
      last_synced: now,
    },
    created_at: now,
  };
}

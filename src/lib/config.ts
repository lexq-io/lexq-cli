import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface LexqConfig {
  apiKey?: string;
  baseUrl: string;
  format: 'json' | 'table';
}

const CONFIG_DIR = join(homedir(), '.lexq');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/* The config file holds an API key in plain text. Without an explicit mode the umask decides,
   and the usual 022 gives 0755 on the directory and 0644 on the file, which every account on
   the machine can read. */
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/* `mode` applies only when a file is created, so an install written by the older code keeps
   0644 through a rewrite. Setting it again on every save is what fixes those.

   Filesystems without POSIX permissions (FAT, some network mounts) throw here. There is
   nothing to tighten on them, so the failure is ignored rather than breaking a login. */
function restrict(target: string, mode: number): void {
  try {
    chmodSync(target, mode);
  } catch {
    // no permissions to set on this filesystem
  }
}

const DEFAULT_CONFIG: LexqConfig = {
  baseUrl: 'https://api.lexq.io/api/v1/partners',
  format: 'json',
};

export function loadConfig(): LexqConfig {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };

  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Partial<LexqConfig>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: DIR_MODE });
  }
  restrict(CONFIG_DIR, DIR_MODE);

  const current = loadConfig();
  const merged = { ...current, ...config };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), {
    encoding: 'utf-8',
    mode: FILE_MODE,
  });
  restrict(CONFIG_FILE, FILE_MODE);
}

export function deleteConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

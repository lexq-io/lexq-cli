import { readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import dedent from 'dedent';
import { datasetContentType, uploadDataset } from '@/lib/dataset-upload';
import { stringifyJson } from '@/lib/lossless-json';
import { MAX_DATASET_SIZE } from '@/types/constants';
import { localApiOptions, type McpToolResult } from './tools/_shared';
import { datasetBlock } from './tools/analytics';

const MAX_DATASET_MB = MAX_DATASET_SIZE / 1024 / 1024;

const NOT_ABSOLUTE =
  'file must be an absolute path on this computer. A leading ~/ stands for the home directory.';
const NOT_A_DATASET = 'file must be a .csv or .json file, and a symbolic link must point to one.';
const TOO_LARGE = `file is larger than ${MAX_DATASET_MB} MB.`;
const UNREADABLE = 'file does not exist, or is not a regular file this server can read.';
const NOT_AN_ARRAY = 'a .json file must hold an array of records.';

function refuse(message: string): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

/** Is the first character `[`, after a byte order mark and JSON whitespace? */
function startsWithArray(bytes: Buffer): boolean {
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d) i++;
  return bytes[i] === 0x5b;
}

/**
 * Reads the dataset file a caller named, or says why it will not.
 *
 * The caller is a model, and a model can be steered by text in a page or a file it read. So the
 * path has to look like a dataset before anything is read: absolute and on this computer, ending
 * in .csv or .json both as named and once symbolic links are resolved, a regular file, and no
 * larger than the engine accepts. `~/.ssh/id_rsa` is refused by its name, and a symbolic link
 * named `data.csv` that points to it is refused once the link is resolved. A hard link has no
 * target to resolve, so only its own name is checked.
 *
 * A .json file must also hold an array, the form a dataset takes. Key and configuration files
 * such as `~/.docker/config.json` or a cloud service account key hold a single object, so they
 * are refused even though their names pass.
 *
 * The name is checked before the file system is touched, so a path that could never be read gets
 * the same answer whether it exists or not. No answer carries the resolved path or the content.
 */
async function readDatasetFile(
  file: string,
): Promise<{ bytes: Buffer; filename: string } | { error: string }> {
  const named = file.startsWith('~/') ? join(homedir(), file.slice(2)) : file;
  // Two leading separators name a network share or a device on Windows (\\host\share, \\?\,
  // \\.\pipe\). Resolving one makes Windows connect to that host and authenticate as the
  // current user, before any file is read.
  if (!isAbsolute(named) || /^[\\/]{2}/.test(named)) return { error: NOT_ABSOLUTE };
  if (!datasetContentType(named)) return { error: NOT_A_DATASET };

  let real: string;
  try {
    real = await realpath(named);
  } catch {
    return { error: UNREADABLE };
  }
  // The file a link points to is the one sent, and the engine picks a parser by its extension.
  const type = datasetContentType(real);
  if (!type) return { error: NOT_A_DATASET };

  try {
    // stat first: a FIFO would block the read, and an oversized file would be read for nothing.
    const info = await stat(real);
    if (!info.isFile()) return { error: UNREADABLE };
    if (info.size > MAX_DATASET_SIZE) return { error: TOO_LARGE };
    const bytes = await readFile(real);
    if (type === 'application/json' && !startsWithArray(bytes)) return { error: NOT_AN_ARRAY };
    return { bytes, filename: basename(real) };
  } catch {
    return { error: UNREADABLE };
  }
}

/**
 * Registers the tools only the local stdio server has.
 *
 * These tools read the machine the server runs on. registerAllTools is also what the hosted
 * server at mcp.lexq.io registers, and there the same read would hand a caller that server's own
 * files. So neither registerAllTools nor anything `@lexq/cli/mcp` exports may import this module.
 */
export function registerLocalTools(server: McpServer): void {
  server.registerTool(
    'lexq_dataset_upload_file',
    {
      title: 'Upload Dataset File',
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: dedent`
        Upload a CSV or JSON file from this computer as a simulation dataset, up to ${MAX_DATASET_MB} MB.
        The server reads the file from disk, so its content never passes through the conversation.
        Only the local server (lexq serve --mcp) has this tool.

        file: the absolute path of a .csv or .json file. A leading ~/ stands for the home directory.
        A symbolic link is followed, and the file it points to must also end in .csv or .json.

        CSV: a header row of fact keys, then one row per record. JSON: an array of objects.

        Returns the stored path and a ready-to-use dataset block for lexq_simulation_start:
          dataset: { "type": "UPLOADED", "source": "S3_BUCKET", "path": "<returned path>" }
      `,
      inputSchema: z.object({
        file: z
          .string()
          .min(1)
          .describe(
            'Absolute path of a .csv or .json file. A leading ~/ stands for the home directory.',
          ),
      }),
    },
    async ({ file }) => {
      const read = await readDatasetFile(file);
      if ('error' in read) return refuse(read.error);

      try {
        const uploaded = await uploadDataset(read.bytes, read.filename, localApiOptions());
        return {
          content: [
            { type: 'text', text: stringifyJson(uploaded, 2) ?? '' },
            datasetBlock(uploaded.path),
          ],
        };
      } catch (error) {
        return refuse(error instanceof Error ? error.message : String(error));
      }
    },
  );
}

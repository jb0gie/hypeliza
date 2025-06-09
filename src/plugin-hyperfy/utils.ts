import { Readable } from 'node:stream';
import { promises as fsPromises } from 'fs';
import type { Action, IAgentRuntime, Memory, State } from '@elizaos/core';
import { fileURLToPath } from 'url';
import { dirname } from 'path';


export async function hashFileBuffer(buffer: Buffer): Promise<string> {
    const hashBuf = await crypto.subtle.digest('SHA-256', buffer)
    const hash = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return hash
}

export async function convertToAudioBuffer(speechResponse: any): Promise<Buffer> {
  if (Buffer.isBuffer(speechResponse)) {
    return speechResponse;
  }

  if (typeof speechResponse?.getReader === 'function') {
    // Handle Web ReadableStream
    const reader = (speechResponse as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks);
    } finally {
      reader.releaseLock();
    }
  }

  if (
    speechResponse instanceof Readable ||
    (speechResponse &&
      speechResponse.readable === true &&
      typeof speechResponse.pipe === 'function' &&
      typeof speechResponse.on === 'function')
  ) {
    // Handle Node Readable Stream
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      speechResponse.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      speechResponse.on('end', () => resolve(Buffer.concat(chunks)));
      speechResponse.on('error', (err) => reject(err));
    });
  }

  throw new Error('Unexpected response type from TEXT_TO_SPEECH model');
}

export function getModuleDirectory(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return __dirname
}

export const resolveUrl = async (url, world) => {
  if (typeof url !== "string") {
    console.error(`Invalid URL type provided: ${typeof url}`);
    return null;
  }
  if (url.startsWith("asset://")) {
    if (!world.assetsUrl) {
      console.error(
        "Cannot resolve asset:// URL, world.assetsUrl not set."
      );
      return null;
    }
    const filename = url.substring("asset://".length);
    const baseUrl = world.assetsUrl.replace(/[/\\\\]$/, ""); // Remove trailing slash (either / or \)
    return `${baseUrl}/${filename}`;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  console.warn(
    `[AgentLoader] Cannot resolve potentially relative URL without base: ${url}`
  );
  
  const moduleDirPath = getModuleDirectory();
  url = `${moduleDirPath}/${url}`;
  const fileBuffer = await fsPromises.readFile(url);
  const base64 = fileBuffer.toString('base64');
  url = `data:image/vnd.radiance;base64,${base64}`;
  return url;
}

/**
 * Fetches and validates actions from the runtime.
 * If `includeList` is provided, filters actions by those names only.
 *
 * @param runtime - The agent runtime
 * @param message - The message memory
 * @param state - The state
 * @param includeList - Optional list of action names to include
 * @returns Array of validated actions
 */
export async function getHyperfyActions(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  includeList?: string[]
): Promise<Action[]> {
  const availableActions = includeList
    ? runtime.actions.filter((action) => includeList.includes(action.name))
    : runtime.actions;

  const validated = await Promise.all(
    availableActions.map(async (action) => {
      const result = await action.validate(runtime, message, state);
      return result ? action : null;
    })
  );

  return validated.filter(Boolean) as Action[];
}

/**
 * Formats the provided actions into a detailed string listing each action's name and description, separated by commas and newlines.
 * @param actions - An array of `Action` objects to format.
 * @returns A detailed string of actions, including names and descriptions.
 */
export function formatActions(actions: Action[]) {
  return actions
    .sort(() => 0.5 - Math.random())
    .map((action: Action) => `- **${action.name}**: ${action.description}`)
    .join('\n\n');
}

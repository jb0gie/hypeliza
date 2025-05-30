import { Readable } from 'node:stream';
import { promises as fsPromises } from 'fs';

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
  
  const fileBuffer = await fsPromises.readFile(url);
  const base64 = fileBuffer.toString('base64');
  url = `data:image/vnd.radiance;base64,${base64}`;
  return url;
}
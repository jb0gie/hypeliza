import { ChannelType, Content, EventType, HandlerCallback, IAgentRuntime, Memory, ModelType, UUID, composePromptFromState, createUniqueUuid, formatMessages, formatPosts, getEntityDetails, getWavHeader, logger, parseKeyValueXml } from "@elizaos/core";
import { EMOTES_LIST, HYPERFY_ACTIONS } from "./constants";
import { AgentControls } from "./controls";
import { HyperfyService } from "./service";
import { autoTemplate, emotePickTemplate } from "./templates";
import { Readable } from 'node:stream';

type LiveKitAudioData = {
  participant: string;
  buffer: Buffer;
};

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

export class VoiceManager {
  private runtime: IAgentRuntime;
  private userStates: Map<
    string,
    {
      buffers: Buffer[];
      totalLength: number;
      lastActive: number;
      transcriptionText: string;
    }
  > = new Map();
  private processingVoice: boolean = false;
  private transcriptionTimeout: NodeJS.Timeout | null = null;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;

    const service = this.getService();
    const world = service.getWorld();


    // const test = async() => {
    //   const speechResponse = await this.runtime.useModel(ModelType.TEXT_TO_SPEECH, 'hi Im eliza! how are you doing today');
    //   const audioBuffer = await convertToAudioBuffer(speechResponse);
    //   console.log("audioBuffer", audioBuffer);
    //   setTimeout(() => {
    //     world.livekit.publishAudioStream(audioBuffer);
    //   }, 7000)

    //   setTimeout(() => {
    //     world.livekit.publishAudioStream(audioBuffer);
    //   }, 20000)
      
    // }
    // test();
    world.livekit.on('audio', async (data: LiveKitAudioData) => {
      function isLoudEnough(pcmBuffer: Buffer, threshold = 1000): boolean {
        let sum = 0;
        const sampleCount = Math.floor(pcmBuffer.length / 2); // 16-bit samples
      
        for (let i = 0; i < pcmBuffer.length; i += 2) {
          const sample = pcmBuffer.readInt16LE(i);
          sum += Math.abs(sample);
        }
      
        const avgAmplitude = sum / sampleCount;
        return avgAmplitude > threshold;
      }

      const playerId = data.participant;
      if (!this.userStates.has(playerId)) {
        this.userStates.set(playerId, {
          buffers: [],
          totalLength: 0,
          lastActive: Date.now(),
          transcriptionText: '',
        });
      }

      const pcmBuffer = data.buffer;
      if (isLoudEnough(pcmBuffer)) {
        this.handleUserBuffer(playerId, pcmBuffer)
      }
      
      

      // console.log("debuggggggg", player)

      // Step 4: Send to transcription
      // const transcription = await this.runtime.useModel(
      //   ModelType.TRANSCRIPTION,
      //   wavBuffer
      // );

      // console.log("@@@@@@@@@@@@@@@@@@@@@@@@", transcription);

      // try {
      //   const transcription = await this.runtime.useModel(
      //     ModelType.TRANSCRIPTION,
      //     wavBuffer
      //   );
      //   console.log("@@@@@@@@@@@@@@@", transcription);
      // } catch (err) {
      //   console.error('Transcription failed:', err.message);
      //   if (err.response) {
      //     const text = await err.response.text?.();
      //     console.error('Response Text:', text);
      //     console.error('Status:', err.response.status);
      //   }
      // }

      // const mergedBuffer = Buffer.concat(data); // data is your array of Buffers
      // const arrayBuffer = mergedBuffer.buffer.slice(mergedBuffer.byteOffset, mergedBuffer.byteOffset + mergedBuffer.byteLength);

      // Optional: wrap it in an ArrayBuffer-like object for logging
      // const wrapped = {
      //   [Symbol.toStringTag]: 'ArrayBuffer',
      //   [Symbol.for('nodejs.util.inspect.custom')]: function () {
      //     return `ArrayBuffer {\n  [Uint8Contents]: <${Array.from(new Uint8Array(arrayBuffer)).map(x => x.toString(16).padStart(2, '0')).join(' ')}>,\n  byteLength: ${arrayBuffer.byteLength}\n}`;
      //   },
      //   byteLength: arrayBuffer.byteLength,
      //   buffer: arrayBuffer
      // };

      // console.log("##########################", arrayBuffer);
      // console.log("##########################", data)
      // const merged = Buffer.concat(data);
      // const buffer = convertToAudioBuffer(data[0])
      // console.log("Merged buffer length:", buffer);
      // const trans = await this.runtime.useModel(ModelType.TRANSCRIPTION, Buffer.from(new Uint8Array(arrayBuffer)));
      // console.log("@@@@@@@@@@@@@@@@@@@@@@@@", trans);

      
    })

    // const test = async() => {
    //   const response = await fetch(
    //     'https://upload.wikimedia.org/wikipedia/en/4/40/Chris_Benoit_Voice_Message.ogg'
    //   );
    //   console.log("debug 11111111", response)
    //   const arrayBuffer = await response.arrayBuffer();
    //   console.log("debug 2222222", arrayBuffer)
    //   const transcription = await this.runtime.useModel(
    //     ModelType.TRANSCRIPTION,
    //     Buffer.from(new Uint8Array(arrayBuffer))
    //   );
    //   console.log('generated with test_transcription:', transcription);
    // }

    // test();

    
  }

  async handleUserBuffer(playerId, buffer) {
    const state = this.userStates.get(playerId);
    try {
      state?.buffers.push(buffer);
      state!.totalLength += buffer.length;
      state!.lastActive = Date.now();
      this.debouncedProcessTranscription(playerId);
    } catch (error) {
      console.error(`Error processing buffer for user ${playerId}:`, error);
    }
  }

  async debouncedProcessTranscription(
    playerId: UUID,
  ) {
    const DEBOUNCE_TRANSCRIPTION_THRESHOLD = 1500; // wait for 1.5 seconds of silence

    if (this.processingVoice) {
      const state = this.userStates.get(playerId);
      state.buffers.length = 0;
      state.totalLength = 0;
      return;
    }

    if (this.transcriptionTimeout) {
      clearTimeout(this.transcriptionTimeout);
    }

    this.transcriptionTimeout = setTimeout(async () => {
      this.processingVoice = true;
      try {
        await this.processTranscription(playerId);

        // Clean all users' previous buffers
        this.userStates.forEach((state, _) => {
          state.buffers.length = 0;
          state.totalLength = 0;
          state.transcriptionText = '';
        });
      } finally {
        this.processingVoice = false;
      }
    }, DEBOUNCE_TRANSCRIPTION_THRESHOLD) as unknown as NodeJS.Timeout;
  }

  private async processTranscription(
    playerId: UUID,
  ) {
    const state = this.userStates.get(playerId);
    if (!state || state.buffers.length === 0) return;
    try {
      const inputBuffer = Buffer.concat(state.buffers, state.totalLength);

      state.buffers.length = 0; // Clear the buffers
      state.totalLength = 0;
      // Convert Opus to WAV
      const wavHeader = getWavHeader(inputBuffer.length, 48000);
      const wavBuffer = Buffer.concat([wavHeader, inputBuffer]);
      logger.debug('Starting transcription...');

      const transcriptionText = await this.runtime.useModel(ModelType.TRANSCRIPTION, wavBuffer);
      function isValidTranscription(text: string): boolean {
        if (!text || text.includes('[BLANK_AUDIO]')) return false;
        return true;
      }

      if (transcriptionText && isValidTranscription(transcriptionText)) {
        state.transcriptionText += transcriptionText;
      }

      if (state.transcriptionText.length) {
        const finalText = state.transcriptionText;
        state.transcriptionText = '';
        await this.handleMessage(finalText, playerId);
      }
    } catch (error) {
      console.error(`Error transcribing audio for user ${playerId}:`, error);
    }
  }

  private async handleMessage(
    message: string,
    playerId: UUID,
  ) {
    try {
      if (!message || message.trim() === '' || message.length < 3) {
        return { text: '', actions: ['IGNORE'] };
      }
      const service = this.getService();
      const world = service.getWorld();

      const messageManager = service.getMessageManager();
      const emoteManager = service.getEmoteManager();
        
      const playerInfo = world.entities.getPlayer(playerId);
      const userName = playerInfo.data.name;
      const name = userName;
      const _currentWorldId = service.currentWorldId;
      const channelId = _currentWorldId;
      const roomId = createUniqueUuid(this.runtime, _currentWorldId || 'hyperfy-unknown-world')
      const entityId = createUniqueUuid(this.runtime, playerId) as UUID
      
      const uniqueEntityId = createUniqueUuid(this.runtime, entityId);
      const type = ChannelType.WORLD;

      await this.runtime.ensureConnection({
        entityId: uniqueEntityId,
        roomId,
        userName,
        name,
        source: 'hyperfy',
        channelId,
        serverId: 'hyperfy',
        type,
      });

      const memory: Memory = {
        id: createUniqueUuid(this.runtime, `${channelId}-voice-message-${Date.now()}`),
        agentId: this.runtime.agentId,
        entityId: uniqueEntityId,
        roomId,
        content: {
          text: message,
          source: 'hyperfy',
          name: name,
          userName: userName,
          isVoiceMessage: true,
          channelType: type,
        },
        createdAt: Date.now(),
      };

      messageManager.sendMessage(message, playerId);

      const callback: HandlerCallback = async (content: Content, _files: any[] = []) => {
        try {
          const responseMemory: Memory = {
            id: createUniqueUuid(this.runtime, `${memory.id}-voice-response-${Date.now()}`),
            entityId: this.runtime.agentId,
            agentId: this.runtime.agentId,
            content: {
              ...content,
              name: this.runtime.character.name,
              inReplyTo: memory.id,
              isVoiceMessage: true,
              channelType: type,
            },
            roomId,
            createdAt: Date.now(),
          };

          if (responseMemory.content.text?.trim()) {
            await this.runtime.createMemory(responseMemory, 'messages');
            const responseStream = await this.runtime.useModel(
              ModelType.TEXT_TO_SPEECH,
              content.text
            );
            if (responseStream) {
              const audioBuffer = await convertToAudioBuffer(responseStream);
              messageManager.sendMessage(responseMemory.content.text);
              emoteManager.playEmote('TALK');
              await this.playAudio(audioBuffer);
            }
          }

          return [responseMemory];
        } catch (error) {
          console.error('Error in voice message callback:', error);
          return [];
        }
      };

      // Emit voice-specific events
      this.runtime.emitEvent(['VOICE_MESSAGE_RECEIVED'], {
        runtime: this.runtime,
        message: memory,
        callback,
      });
    } catch (error) {
      console.error('Error processing voice message:', error);
    }
  }

  async playAudio(audioBuffer) {
    if (this.processingVoice) {
      logger.info(`[VOICE MANAER] Current voice is processing.....`)
      return;
    }

    const service = this.getService();
    const world = service.getWorld();
    this.processingVoice = true;

    try {
      await world.livekit.publishAudioStream(audioBuffer);
    } catch(error) {
      logger.error(error)
    } finally {
      this.processingVoice = false;
    }
  }

  private getService() {
    return this.runtime.getService<HyperfyService>(HyperfyService.serviceType);
  }

  
}
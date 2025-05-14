import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  Room,
  TrackPublishOptions,
  TrackSource,
  dispose,
  RoomEvent,
  TrackKind,
  AudioStream
} from '@livekit/rtc-node';
import { config } from 'dotenv';
import { AccessToken } from 'livekit-server-sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fs from 'fs';
import { System } from './hyperfy/src/core/systems/System';
import { Readable } from 'stream';
import { spawn } from 'node:child_process';

export interface LiveKitInitOptions {
  wsUrl: string;
  token: string;
}

export class AgentLiveKit extends System {
  private room: Room | null = null;

  constructor(world: any) {
    super(world);
  }

  async deserialize(opts: LiveKitInitOptions): Promise<void> {
    const { wsUrl, token } = opts;
    this.room = new Room();
    await this.room.connect(wsUrl, token, {
      autoSubscribe: true,
      dynacast: true,
    });
    console.log('[LiveKit] Connected to room');
    this.setupRoomEvents();
  }

  async stop(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
    }
    await dispose();
  }

  private setupRoomEvents(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.ParticipantConnected, (p) => {
      console.log(`[LiveKit] Participant connected: ${p.identity}`);
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log('[LiveKit] Disconnected from room');
    });

    this.room.on(RoomEvent.TrackPublished, (publication, participant) => {
      console.log(`[LiveKit] TrackPublished by ${participant.identity}`);
    });

    this.room.on(RoomEvent.TrackSubscribed, async (track, _publication, participant) => {
      console.log(`[LiveKit] TrackSubscribed: ${track.kind} from ${participant.identity}`);
      if (track.kind === TrackKind.KIND_AUDIO) {
        const stream = new AudioStream(track);
        for await (const frame of stream) {
          if (!track.sid) return;
          const int16 = frame.data;
          this.emit('audio', {
            participant: participant.identity,
            buffer: Buffer.from(int16.buffer),
          });
        }
      }
    });
  }

  // Framework stubs
  // init() {}
  preTick() {}
  preFixedUpdate() {}
  fixedUpdate() {}
  postFixedUpdate() {}
  preUpdate() {}
  update() {}
  postUpdate() {}
  lateUpdate() {}
  postLateUpdate() {}
  commit() {}
  postTick() {}
  start() {}

  async publishAudioStream(audioBuffer: Buffer): Promise<void> {
    const sampleRate = 48000;
    const numChannels = 1;
    const frameDurationMs = 100;
    const samplesPerFrame = (sampleRate * frameDurationMs) / 1000;

    const int16 = await this.convertToPcm(audioBuffer, sampleRate);
    if (!int16 || int16.length === 0) {
      console.warn('No PCM data decoded');
      return;
    }

    const source = new AudioSource(sampleRate, numChannels);
    const track = LocalAudioTrack.createAudioTrack('agent-voice', source);

    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_MICROPHONE;

    await this.room?.localParticipant.publishTrack(track, options);

    await new Promise((r) => setTimeout(r, 100));

    const silence = new Int16Array(samplesPerFrame);
    await source.captureFrame(new AudioFrame(silence, sampleRate, numChannels, silence.length));

    for (let i = 0; i < int16.length; i += samplesPerFrame) {
      const slice = int16.slice(i, i + samplesPerFrame);
      const frame = new AudioFrame(slice, sampleRate, numChannels, slice.length);
      await source.captureFrame(frame);
    }

    await source.waitForPlayout();
    await source.close();
  }

  private async convertToPcm(buffer: Buffer, sampleRate = 48000): Promise<Int16Array> {
    const format = this.detectAudioFormat(buffer);

    if (format === 'pcm') {
      return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
    }

    const ffmpegArgs: string[] = [
      '-f',
      format,
      '-i',
      'pipe:0',
      '-f',
      's16le',
      '-ar',
      sampleRate.toString(),
      '-ac',
      '1',
      'pipe:1',
    ];

    return new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ffmpegArgs);
      let raw = Buffer.alloc(0);

      ff.stdout.on('data', (chunk) => {
        raw = Buffer.concat([raw, chunk]);
      });

      ff.stderr.on('data', () => {}); // ignore logs
      ff.on('close', (code) => {
        if (code !== 0) return reject(new Error(`ffmpeg failed (code ${code})`));
        const samples = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
        resolve(samples);
      });

      ff.stdin.write(buffer);
      ff.stdin.end();
    });
  }

  private detectAudioFormat(buffer: Buffer): 'mp3' | 'wav' | 'pcm' {
    const header = buffer.slice(0, 4).toString('ascii');
    if (header === 'RIFF') return 'wav';
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'mp3';
    return 'pcm';
  }
}
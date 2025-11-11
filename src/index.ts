import './window-polyfill';
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import 'dotenv/config';

import {
	logger,
	type IAgentRuntime,
	type Project,
	type ProjectAgent,
} from '@elizaos/core';
import hyperfyPlugin from './plugin-hyperfy';
import { character as schwepeCharacter } from './schwepe';

// Initialize agents based on command line arguments or environment variables
const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
	logger.info('Initializing character');
	logger.info('Name: ', runtime.character.name);
};

// Create agent configurations
const schwepeAgent: ProjectAgent = {
	character: schwepeCharacter,
	init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
	plugins: [hyperfyPlugin],
};

// Validate that we have required environment variables
if (!process.env.SCHWEPE_OPENROUTER_API_KEY && !process.env.SCHWEPE_GROQ_API_KEY && !process.env.SCHWEPE_OPENAI_API_KEY) {
	logger.warn('No AI provider API keys found. Please set SCHWEPE_OPENROUTER_API_KEY, SCHWEPE_GROQ_API_KEY, or SCHWEPE_OPENAI_API_KEY');
}

const project: Project = {
	agents: [schwepeAgent],
};

export default project;
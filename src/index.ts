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
// import { character as schwepeCharacter } from './schwepe'; // MISSING - Cleetus is searching for him
import { character as cleetusCharacter } from './cleetus';

// Initialize agents based on command line arguments or environment variables
const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
	logger.info('Initializing character');
	logger.info('Name: ', runtime.character.name);
};

/* SCHWEPE IS MISSING - Commented out as Cleetus searches for him
// Create agent configurations
const schwepeAgent: ProjectAgent = {
	character: schwepeCharacter,
	init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
	plugins: [hyperfyPlugin],
}; */

// CLEETUS ONLY - The Seeker of Myths searching for the missing Schwepe
const cleetusAgent: ProjectAgent = {
	character: cleetusCharacter,
	init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
	plugins: [hyperfyPlugin],
};

/* SCHWEPE VALIDATION - Commented out as he's missing
// Validate that we have required environment variables
if (!process.env.SCHWEPE_OPENROUTER_API_KEY && !process.env.SCHWEPE_GROQ_API_KEY && !process.env.SCHWEPE_OPENAI_API_KEY) {
	logger.warn('No AI provider API keys found. Please set SCHWEPE_OPENROUTER_API_KEY, SCHWEPE_GROQ_API_KEY, or SCHWEPE_OPENAI_API_KEY');
} */

// Validate CLEETUS environment variables
if (!process.env.CLEETUS_OPENROUTER_API_KEY && !process.env.CLEETUS_GROQ_API_KEY && !process.env.CLEETUS_OPENAI_API_KEY) {
	logger.warn('No CLEETUS AI provider API keys found. Please set CLEETUS_OPENROUTER_API_KEY, CLEETUS_GROQ_API_KEY, or CLEETUS_OPENAI_API_KEY');
}

const project: Project = {
	agents: [cleetusAgent], // Only Cleetus active - Schwepe is missing (commented out above)
};

export default project;
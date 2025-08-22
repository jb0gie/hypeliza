import './window-polyfill';
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import dotenv from 'dotenv';
dotenv.config();

import {
	logger,
	type IAgentRuntime,
	type Project,
	type ProjectAgent,
} from '@elizaos/core';
import hyperfyPlugin from './plugin-hyperfy';
import { character as schwepeCharacter } from './schwepe';
import { character as schiz0tr0nCharacter } from './schiz0tr0n';

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

const schiz0tr0nAgent: ProjectAgent = {
	character: schiz0tr0nCharacter,
	init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
	plugins: [],
};

// Determine which agents to run based on command line arguments or environment variables
const agents: ProjectAgent[] = [];

// Check command line arguments
const args = process.argv.slice(2);
const runSchwepe = args.includes('--schwepe') || process.env.RUN_SCHWEPE === 'true';
const runSchiz0tr0n = args.includes('--schiz0tr0n') || process.env.RUN_SCHIZ0TR0N === 'true';

// If no specific agents are specified, default to running schwepe
if (!runSchwepe && !runSchiz0tr0n) {
	logger.info('No specific agents specified, defaulting to schwepe');
	agents.push(schwepeAgent);
} else {
	if (runSchwepe) {
		logger.info('Loading schwepe agent');
		agents.push(schwepeAgent);
	}
	if (runSchiz0tr0n) {
		logger.info('Loading schiz0tr0n agent');
		agents.push(schiz0tr0nAgent);
	}
}

// Validate that we have required environment variables for each agent
if (agents.includes(schwepeAgent)) {
	if (!process.env.SCHWEPE_OPENROUTER_API_KEY && !process.env.SCHWEPE_GROQ_API_KEY && !process.env.SCHWEPE_OPENAI_API_KEY) {
		logger.warn('Schwepe agent: No AI provider API keys found. Please set SCHWEPE_OPENROUTER_API_KEY, SCHWEPE_GROQ_API_KEY, or SCHWEPE_OPENAI_API_KEY');
	}
}

if (agents.includes(schiz0tr0nAgent)) {
	if (!process.env.SCHIZ0TR0N_TELEGRAM_BOT_TOKEN) {
		logger.error('Schiz0tr0n agent: SCHIZ0TR0N_TELEGRAM_BOT_TOKEN is required for Telegram client');
	}
	if (!process.env.SCHIZ0TR0N_OPENROUTER_API_KEY) {
		logger.error('Schiz0tr0n agent: SCHIZ0TR0N_OPENROUTER_API_KEY is required');
	}
}

const project: Project = {
	agents,
};

export default project;
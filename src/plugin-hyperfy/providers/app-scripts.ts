import type { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import { promises as fs } from 'fs';
import path from 'path';

interface AppScriptInfo {
  name: string;
  path: string;
  category: string;
  description: string;
}

/**
 * Scans Hyperfy app script directories and makes them available to agents
 * so they can inform players about available apps/scripts
 */
export const hyperfyAppScriptsProvider: Provider = {
  name: 'HYPERFY_APP_SCRIPTS',
  description: 'Available Hyperfy app scripts and examples',
  position: -1,

  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    try {
      // Define the directories to scan for app scripts
      const scriptDirectories = [
        {
          path: '/home/blank/hyperfy/examples/ROMs',
          category: 'ROMs',
          description: 'Movement and interaction ROMs (Read-Only Modules)',
        },
        {
          path: '/home/blank/hyperfy/examples/essentials',
          category: 'Essentials',
          description: 'Essential building blocks and utilities',
        },
        {
          path: '/home/blank/hyperfy/examples/elementals',
          category: 'Elementals',
          description: 'Basic elemental apps (fire, water, etc.)',
        },
        {
          path: '/home/blank/hyperfy/examples/games',
          category: 'Games',
          description: 'Game templates and examples',
        },
        {
          path: '/home/blank/hyperfy/examples',
          category: 'General Examples',
          description: 'Various example apps',
        },
      ];

      const appScripts: AppScriptInfo[] = [];

      // Scan each directory
      for (const dir of scriptDirectories) {
        try {
          const files = await fs.readdir(dir.path);
          const jsFiles = files.filter(f => f.endsWith('.js'));

          for (const file of jsFiles) {
            appScripts.push({
              name: file.replace('.js', ''),
              path: path.join(dir.path, file),
              category: dir.category,
              description: dir.description,
            });
          }
        } catch (error) {
          console.warn(`[AppScriptsProvider] Could not scan directory ${dir.path}:`, error.message);
        }
      }

      // Format the data for the agent
      const scriptList = appScripts
        .map(script => `- **${script.name}** (${script.category}): ${script.description}`)
        .join('\n');

      const data = { appScripts };
      const values = {
        scriptCount: appScripts.length,
        scriptList,
      };

      const text = `Available Hyperfy App Scripts:\n\n${scriptList}\n\nTotal: ${appScripts.length} scripts available`;

      return { data, values, text };
    } catch (error) {
      console.error('[AppScriptsProvider] Error scanning directories:', error);
      return {
        data: { appScripts: [] },
        values: { scriptCount: 0, scriptList: 'No scripts found' },
        text: 'Error loading app script information',
      };
    }
  },
};

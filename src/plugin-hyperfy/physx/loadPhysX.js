import PhysXModule from './physx-js-webidl.js'

/**
 * PhysX Loader
 *
 * We are currently using a fork of physx-js-webidl with a custom build, modifying `PhysXWasmBindings.cmake` options to work on both node and browser environments
 *
 */
let promise
export function loadPhysX() {
  if (!promise) {
    promise = new Promise(async resolve => {
      try {
        console.log('[PhysX] Starting PhysX module load...');
        // Disable threading to avoid resource exhaustion
        globalThis.PHYSX = await PhysXModule({
          locateFile: (path) => {
            const fullPath = new URL(path, import.meta.url).pathname;
            console.log('[PhysX] Loading file:', fullPath);
            return fullPath;
          }
        })
        console.log('[PhysX] Module loaded, creating foundation...');
        const version = PHYSX.PHYSICS_VERSION
        const allocator = new PHYSX.PxDefaultAllocator()
        const errorCb = new PHYSX.PxDefaultErrorCallback()
        const foundation = PHYSX.CreateFoundation(version, allocator, errorCb)
        console.log('[PhysX] Foundation created successfully');
        resolve({ version, allocator, errorCb, foundation })
      } catch (error) {
        console.error('[PhysX] Failed to load:', error);
        throw error;
      }
    })
  }
  return promise
}

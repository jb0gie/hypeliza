import 'ses'

import type { UUID } from '@elizaos/core'
import {
  ChannelType,
  type Content,
  createUniqueUuid,
  EventType,
  type HandlerCallback,
  type IAgentRuntime,
  logger,
  type Memory,
  Service
} from '@elizaos/core'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { performance } from 'perf_hooks'
import * as THREE from 'three'
import { createClientWorld } from './hyperfy/core/createClientWorld.js'
import { extendThreePhysX } from './hyperfy/core/extras/extendThreePhysX.js'
import { geometryToPxMesh } from './hyperfy/core/extras/geometryToPxMesh.js'
import { loadNodePhysX } from './hyperfy/core/loadNodePhysX.js'
import { AgentControls } from './controls'
import { AgentLoader } from './loader'

async function hashFileBuffer(buffer: Buffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer)
  const hash = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return hash
}

const LOCAL_AVATAR_PATH = process.env.HYPERFY_AGENT_AVATAR_PATH || './avatar.vrm'

const ENABLE_HYPERFY_TEST_MODE_FLAG = true

const HYPERFY_WS_URL = process.env.WS_URL || 'ws://localhost:1337/ws'
const HYPERFY_TICK_RATE = 50
const HYPERFY_TEST_MODE_MOVE_INTERVAL = 1000
const HYPERFY_TEST_MODE_CHAT_INTERVAL = 5000
const HYPERFY_APPEARANCE_POLL_INTERVAL = 3000
const HYPERFY_ENTITY_UPDATE_INTERVAL = 500

export class HyperfyService extends Service {
  static serviceType = 'hyperfy'
  capabilityDescription = 'Manages connection and interaction with a Hyperfy world.'

  private world: any | null = null
  private controls: AgentControls | null = null
  private isConnectedState: boolean = false
  private currentEntities: Map<string, any> = new Map()
  private agentState: any = { position: null, rotation: null }
  private tickIntervalId: NodeJS.Timeout | null = null
  private entityUpdateIntervalId: NodeJS.Timeout | null = null
  private wsUrl: string | null = null
  private _currentWorldId: UUID | null = null
  private processedMsgIds: Set<string> = new Set()

  private randomMoveIntervalId: NodeJS.Timeout | null = null
  private randomChatIntervalId: NodeJS.Timeout | null = null
  private currentMoveKey: string | null = null

  private playerNamesMap: Map<string, string> = new Map()
  private appearanceIntervalId: NodeJS.Timeout | null = null
  private appearanceSet: boolean = false
  private PHYSX: any = null
  private isPhysicsSetup: boolean = false

  public get currentWorldId(): UUID | null {
    return this._currentWorldId
  }

  public getWorld(): any | null {
    return this.world;
  }

  constructor(protected runtime: IAgentRuntime) {
    super();
    logger.info('HyperfyService instance created')
  }

  private entityAddedListener = (entity: any): void => {
    if (!entity || !entity.id) return
    if (entity?.data?.type === 'player' && entity.data.name) {
        if (!this.playerNamesMap.has(entity.id)) {
            logger.info(`[Name Map Add] Setting initial name for ID ${entity.id}: '${entity.data.name}'`)
            this.playerNamesMap.set(entity.id, entity.data.name)
        }
    }
    this.currentEntities.set(entity.id, this.extractEntityState(entity))
    logger.debug(`[Entity Listener] Added/Updated entity: ${entity.id}`)
  }

  private entityModifiedListener = (entityId: string, changedData: any, entity?: any): void => {
      if (!entityId) return
      const fullEntity = entity || this.world?.entities?.items?.get(entityId)

      if (changedData?.name && fullEntity?.data?.type === 'player') {
          const currentName = this.playerNamesMap.get(entityId)
          if (currentName !== changedData.name) {
              logger.info(`[Name Map Update] Updating name for ID ${entityId}: '${changedData.name}'`)
              this.playerNamesMap.set(entityId, changedData.name)
          }
      }
      if (fullEntity) {
        this.currentEntities.set(entityId, this.extractEntityState(fullEntity))
        logger.debug(`[Entity Listener] Modified entity: ${entityId}`)
      } else {
        const existing = this.currentEntities.get(entityId)
        if (existing) {
            logger.warn(`[Entity Listener] Modified entity ${entityId} but full entity data unavailable.`)
            const potentialNewState = this.extractEntityState({ id: entityId, data: { ...existing, ...changedData } })
            this.currentEntities.set(entityId, potentialNewState)
        } else {
            logger.warn(`[Entity Listener] Modified non-tracked entity: ${entityId}`)
        }
      }
  }

  private entityRemovedListener = (entityId: string): void => {
      if (!entityId) return
      if (this.playerNamesMap.has(entityId)) {
          logger.info(`[Name Map Update] Removing name for ID ${entityId}`)
          this.playerNamesMap.delete(entityId)
      }
      if(this.currentEntities.delete(entityId)){
        logger.debug(`[Entity Listener] Removed entity: ${entityId}`)
      }
  }

  static async start(runtime: IAgentRuntime): Promise<HyperfyService> {
    logger.info('*** Starting Hyperfy service ***')
    const service = new HyperfyService(runtime)
    logger.info(`Attempting automatic connection to default Hyperfy URL: ${HYPERFY_WS_URL}`)
    const defaultWorldId = createUniqueUuid(runtime, runtime.agentId + '-default-hyperfy') as UUID
    const authToken: string | undefined = undefined

    service
      .connect({ wsUrl: HYPERFY_WS_URL, worldId: defaultWorldId, authToken })
      .then(() => logger.info(`Automatic Hyperfy connection initiated.`))
      .catch(err => logger.error(`Automatic Hyperfy connection failed: ${err.message}`))

    return service
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('*** Stopping Hyperfy service ***')
    const service = runtime.getService<HyperfyService>(HyperfyService.serviceType)
    if (service) await service.stop()
    else logger.warn('Hyperfy service not found during stop.')
  }

  async connect(config: { wsUrl: string; authToken?: string; worldId: UUID }): Promise<void> {
    if (this.isConnectedState) {
      logger.warn(`HyperfyService already connected to world ${this._currentWorldId}. Disconnecting first.`)
      await this.disconnect()
    }

    logger.info(`Attempting to connect HyperfyService to ${config.wsUrl} for world ${config.worldId}`)
    this.wsUrl = config.wsUrl
    this._currentWorldId = config.worldId
    this.appearanceSet = false
    this.isPhysicsSetup = false

    try {
      logger.info("[Hyperfy Connect] Loading PhysX...")
      this.PHYSX = await loadNodePhysX()
      if (!this.PHYSX) {
        throw new Error("Failed to load PhysX.")
      }
      ;(globalThis as any).PHYSX = this.PHYSX
      logger.info("[Hyperfy Connect] PhysX loaded. Extending THREE...")

      const world = createClientWorld()
      this.world = world
      ;(world as any).playerNamesMap = this.playerNamesMap

      globalThis.self = globalThis

      this.controls = new AgentControls(world)
      ;(world as any).controls = this.controls
      world.systems.push(this.controls)
      // Temporarily comment out AgentLoader to test for updateTransform error
      const loader = new AgentLoader(world)
      ;(world as any).loader = loader
      world.systems.push(loader)

      const mockElement = {
        appendChild: () => {},
        removeChild: () => {},
        offsetWidth: 1920,
        offsetHeight: 1080,
        addEventListener: () => {},
        removeEventListener: () => {},
        style: {},
      }

      const hyperfyConfig = {
        wsUrl: this.wsUrl,
        viewport: mockElement,
        ui: mockElement,
        initialAuthToken: config.authToken,
      }

      if (typeof this.world.init !== 'function') {
        throw new Error('world.init is not a function')
      }
      await this.world.init(hyperfyConfig)
      logger.info('Hyperfy world initialized.')

      logger.info("[Hyperfy Connect] World initialized. Setting up listeners, physics, and appearance...")

      await this.setupStaticPhysicsFromEnvironment()

      if (this.world?.entities && typeof this.world.entities.on === 'function') {
        logger.info('[Hyperfy Connect] Attaching entity listeners...')
        this.world.entities.off('entityAdded', this.entityAddedListener.bind(this))
        this.world.entities.off('entityModified', this.entityModifiedListener.bind(this))
        this.world.entities.off('entityRemoved', this.entityRemovedListener.bind(this))

        this.world.entities.on('entityAdded', this.entityAddedListener.bind(this))
        this.world.entities.on('entityModified', this.entityModifiedListener.bind(this))
        this.world.entities.on('entityRemoved', this.entityRemovedListener.bind(this))

        this.currentEntities.clear()
        this.playerNamesMap.clear()
        this.world.entities.items?.forEach((entity: any, id: string) => {
             this.entityAddedListener(entity)
         })
        logger.info(`[Hyperfy Connect] Initial entity count: ${this.currentEntities.size}, Player names: ${this.playerNamesMap.size}`)
      } else {
         logger.warn("[Hyperfy Connect] world.entities or world.entities.on not available for listener attachment.")
      }

      this.processedMsgIds.clear()
      if (this.world.chat?.msgs) {
        logger.info(`Processing ${this.world.chat.msgs.length} existing chat messages.`)
        this.world.chat.msgs.forEach((msg: any) => {
          if (msg && msg.id) {
            this.processedMsgIds.add(msg.id)
          }
        })
        logger.info(`Populated ${this.processedMsgIds.size} processed message IDs from history.`)
      }

      this.subscribeToHyperfyEvents()

      this.isConnectedState = true

      this.startSimulation()
      this.startEntityUpdates()

      this.startAppearancePolling()

      if (ENABLE_HYPERFY_TEST_MODE_FLAG) {
        logger.info('Starting Hyperfy Test Mode (Random Movement & Chat)')
        this.startRandomMovement()
        this.startRandomChatting()
      }

      logger.info(`HyperfyService connected successfully to ${this.wsUrl}`)
    } catch (error: any) {
      logger.error(`HyperfyService connection failed for ${config.worldId} at ${config.wsUrl}: ${error.message}`, error.stack)
      await this.handleDisconnect()
      throw error
    }
  }

  private subscribeToHyperfyEvents(): void {
    if (!this.world || typeof this.world.on !== 'function') {
        logger.warn("[Hyperfy Events] Cannot subscribe: World or world.on not available.")
        return
    }

    this.world.off('disconnect')

    this.world.on('disconnect', (reason: string) => {
      logger.warn(`Hyperfy world disconnected: ${reason}`)
      this.runtime.emitEvent(EventType.WORLD_LEFT, {
        runtime: this.runtime,
        eventName: 'HYPERFY_DISCONNECTED',
        data: { worldId: this._currentWorldId, reason: reason },
      })
      this.handleDisconnect()
    })

    if (this.world.chat?.subscribe) {
      this.startChatSubscription()
    } else {
        logger.warn('[Hyperfy Events] world.chat.subscribe not available.')
    }
  }

  private async setupStaticPhysicsFromEnvironment(): Promise<void> {
    if (this.isPhysicsSetup) {
        logger.info("[Physics Setup] Skipping: Already setup.")
        return
    }
     if (!this.world || !this.PHYSX) {
        logger.warn("[Physics Setup] Skipping: World or PhysX not ready.")
        return
    }
    logger.info("[Physics Setup] Setting up static environment geometry...")

    const physicsSystem = this.world.physics
    if (!physicsSystem || !physicsSystem.physics || !physicsSystem.scene || !physicsSystem.material) {
        logger.error("[Physics Setup] Physics system components (physics, scene, material) not ready in world instance.")
        return
    }
     const physics = physicsSystem.physics
     const scene = physicsSystem.scene
     const material = physicsSystem.material

    const envModelUrl = this.world.settings?.model?.url
    if (!envModelUrl) {
        logger.warn("[Physics Setup] No environment model URL found in world settings.")
        this.isPhysicsSetup = true
        return
    }

    try {
        logger.info(`[Physics Setup] Loading environment model: ${envModelUrl}`)
        if (!this.world.loader || typeof this.world.loader.load !== 'function') {
            throw new Error("world.loader.load is not available.")
        }
        const envGltf = await this.world.loader.load('model', envModelUrl)
        logger.info(`[Physics Setup] Environment model loaded successfully.`)

        if (!envGltf || !envGltf.scene) {
            throw new Error("Loaded GLTF is invalid or has no scene.")
        }

        logger.info("[Physics Setup] PhysX components obtained from world instance.")

        const physxTransform = new this.PHYSX.PxTransform(this.PHYSX.PxIdentityEnum.PxIdentity)
        let meshesProcessed = 0
        let actorsAdded = 0
        const traversalErrors: Error[] = []

        envGltf.scene.updateMatrixWorld(true)

        envGltf.scene.traverseVisible((node: any) => {
            if (node instanceof THREE.Mesh && node.geometry) {
                logger.debug(`[Physics Setup] Processing mesh: ${node.name || '(unnamed)'}`)
                meshesProcessed++
                let pmeshHandle: any = null
                try {
                    if (typeof geometryToPxMesh !== 'function') {
                        throw new Error("geometryToPxMesh function is not available.")
                    }
                    pmeshHandle = geometryToPxMesh(this.world, node.geometry, false)

                    if (!pmeshHandle || !pmeshHandle.value) {
                        throw new Error(`geometryToPxMesh returned null/invalid for mesh ${node.name || '(unnamed)'}`)
                    }
                    const cookedMesh = pmeshHandle.value

                    const worldScale = new THREE.Vector3()
                    const worldQuat = new THREE.Quaternion()
                    node.getWorldScale(worldScale)
                    node.getWorldQuaternion(worldQuat)

                    if (typeof (worldScale as any).toPxVec3 !== 'function' || typeof (worldQuat as any).toPxQuat !== 'function') {
                         throw new Error("THREE.Vector3.toPxVec3 or THREE.Quaternion.toPxQuat not available. extendThreePhysX likely failed or wasn't called correctly.")
                     }
                    const meshScalePx = (worldScale as any).toPxVec3()
                    const meshQuatPx = (worldQuat as any).toPxQuat()

                    const meshScale = new this.PHYSX.PxMeshScale(meshScalePx, { x: 0, y: 0, z: 0, w: 1 })

                    const meshGeometry = new this.PHYSX.PxTriangleMeshGeometry(cookedMesh, meshScale, new this.PHYSX.PxMeshGeometryFlags(0))
                    if (!meshGeometry.isValid()) {
                        pmeshHandle?.release?.()
                        throw new Error("Created PxTriangleMeshGeometry is invalid")
                    }

                    const shapeFlags = new this.PHYSX.PxShapeFlags(
                        this.PHYSX.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | this.PHYSX.PxShapeFlagEnum.eSIMULATION_SHAPE
                    )
                    const shape = physics.createShape(meshGeometry, material, true, shapeFlags)

                    const filterData = new this.PHYSX.PxFilterData(1, 1 << 0, 0, 0)
                    shape.setSimulationFilterData(filterData)
                    shape.setQueryFilterData(filterData)

                    if (typeof (node.matrixWorld as any).toPxTransform !== 'function') {
                         throw new Error("THREE.Matrix4.toPxTransform not available. extendThreePhysX likely failed or wasn't called correctly.")
                    }
                    (node.matrixWorld as any).toPxTransform(physxTransform)
                    const staticActor = physics.createRigidStatic(physxTransform)

                    staticActor.attachShape(shape)
                    scene.addActor(staticActor)
                    actorsAdded++
                    logger.debug(`[Physics Setup] Added static actor for ${node.name || '(unnamed)'}.`)

                } catch (error: any) {
                    logger.error(`[Physics Setup] Error processing mesh ${node.name || '(unnamed)'}:`, error)
                    traversalErrors.push(error)
                } finally {
                    pmeshHandle?.release?.()
                }
            }
        })

        if (traversalErrors.length > 0) {
            logger.warn(`[Physics Setup] Finished. Meshes processed: ${meshesProcessed}, Actors added: ${actorsAdded}, Errors: ${traversalErrors.length}.`)
        } else {
            logger.info(`[Physics Setup] Finished successfully. Meshes processed: ${meshesProcessed}, Actors added: ${actorsAdded}.`)
        }
        this.isPhysicsSetup = true

    } catch (error: any) {
        logger.error(`[Physics Setup] Failed to load or process environment model ${envModelUrl}:`, error)
        this.isPhysicsSetup = true
    }
  }

  private async uploadAndSetAvatar(): Promise<boolean> {
    if (!this.world || !this.world.entities?.player || !this.world.network || !this.world.assetsUrl) {
        logger.warn("[Appearance] Cannot set avatar: World, player, network, or assetsUrl not ready.")
        return false
    }

    const agentPlayer = this.world.entities.player
    let fileName = ''
    const localAvatarPath = path.resolve(LOCAL_AVATAR_PATH)

    try {
        logger.info(`[Appearance] Reading avatar file from: ${localAvatarPath}`)
        const fileBuffer: Buffer = await fs.readFile(localAvatarPath)
        fileName = path.basename(localAvatarPath)
        const mimeType = fileName.endsWith('.vrm') ? 'model/gltf-binary' : 'application/octet-stream'

        logger.info(`[Appearance] Uploading ${fileName} (${(fileBuffer.length / 1024).toFixed(2)} KB, Type: ${mimeType})...`)

        if (!crypto.subtle || typeof crypto.subtle.digest !== 'function') {
            throw new Error("crypto.subtle.digest is not available. Ensure Node.js version supports Web Crypto API.")
        }
        const hash = await hashFileBuffer(fileBuffer)
        const ext = fileName.split('.').pop()?.toLowerCase() || 'vrm'
        const baseUrl = this.world.assetsUrl.replace(/\/$/, '')
        const constructedHttpUrl = `${baseUrl}/${hash}.${ext}`
        logger.info(`[Appearance] Constructed HTTP(S) URL: ${constructedHttpUrl}`)

        if (typeof this.world.network.upload === 'function') {
           logger.info("[Appearance] Calling world.network.upload with Node Buffer...")

           // Revert to passing the Node.js Buffer directly, like in index.mjs
           const uploadData = {
               buffer: fileBuffer, // <-- Pass the original Node.js Buffer
               name: fileName,
               type: mimeType,
               size: fileBuffer.length
           };

           await this.world.network.upload(uploadData) // Pass the object with the Node.js Buffer
           logger.info(`[Appearance] Upload process likely initiated.`)
        } else {
           logger.warn("[Appearance] world.network.upload function not found. Assuming URL is sufficient.")
        }

        if (this.world.network && typeof this.world.network.send === 'function') {
            // Send the message to the server
            this.world.network.send('playerSessionAvatar', { avatar: constructedHttpUrl })
            logger.info(`[Appearance] Sent playerSessionAvatar network message with: ${constructedHttpUrl}`)

            // --- Apply change locally immediately --- >
            if (agentPlayer && typeof agentPlayer.setSessionAvatar === 'function') {
                 logger.info(`[Appearance] Applying session avatar locally: ${constructedHttpUrl}`);
                 agentPlayer.setSessionAvatar(constructedHttpUrl);
            } else {
                 logger.warn("[Appearance] agentPlayer.setSessionAvatar not available for local application.");
            }
            // <---------------------------------------

            return true // Return success after sending and attempting local apply
        }
        else if (agentPlayer && typeof agentPlayer.setSessionAvatar === 'function') {
            // This path is likely less common now, but keep as fallback
            logger.warn("[Appearance] Using agentPlayer.setSessionAvatar locally as fallback (network.send unavailable).")
            agentPlayer.setSessionAvatar(constructedHttpUrl)
            logger.info(`[Appearance] Called agentPlayer.setSessionAvatar with: ${constructedHttpUrl}`)
            return true
        } else {
            throw new Error("Neither world.network.send nor agentPlayer.setSessionAvatar available.")
        }

    } catch (error: any) {
        if (error.code === 'ENOENT') {
            logger.error(`[Appearance] Error: Avatar file not found at ${localAvatarPath}. CWD: ${process.cwd()}`)
        } else {
            logger.error("[Appearance] Error during avatar upload/set process:", error.message, error.stack)
        }
        return false
    }
  }

  private startAppearancePolling(): void {
    if (this.appearanceIntervalId) clearInterval(this.appearanceIntervalId)
    if (this.appearanceSet) {
        logger.info("[Appearance Polling] Already set, skipping start.")
        return
    }
    logger.info(`[Appearance Polling] Initializing interval every ${HYPERFY_APPEARANCE_POLL_INTERVAL}ms.`)

    this.appearanceIntervalId = setInterval(async () => {
        if (this.appearanceSet) {
            if (this.appearanceIntervalId) clearInterval(this.appearanceIntervalId)
            this.appearanceIntervalId = null
            return
        }

        const agentPlayerReady = !!this.world?.entities?.player
        const networkReady = this.world?.network?.id != null
        const assetsUrlReady = !!this.world?.assetsUrl

        if (agentPlayerReady && networkReady && assetsUrlReady) {
            logger.info(`[Appearance Polling] Player, network, and assetsUrl ready. Attempting to upload and set avatar...`)
            const success = await this.uploadAndSetAvatar()

            if (success) {
                this.appearanceSet = true
                if (this.appearanceIntervalId) clearInterval(this.appearanceIntervalId)
                this.appearanceIntervalId = null
                logger.info(`[Appearance Polling] Avatar successfully set. Polling stopped.`)
            } else {
                logger.warn(`[Appearance Polling] Avatar setting failed, will retry...`)
            }
        } else {
             logger.debug(`[Appearance Polling] Waiting for: Player (${agentPlayerReady}), Network (${networkReady}), Assets URL (${assetsUrlReady})...`)
        }
    }, HYPERFY_APPEARANCE_POLL_INTERVAL)
  }

  private stopAppearancePolling(): void {
    if (this.appearanceIntervalId) {
        clearInterval(this.appearanceIntervalId)
        this.appearanceIntervalId = null
        logger.info("[Appearance Polling] Stopped.")
    }
  }

  /**
   * Checks if the service is currently connected to a Hyperfy world.
   */
  public isConnected(): boolean {
    return this.isConnectedState;
  }

  public getEntityById(entityId: string): any | null {
     if (this.currentEntities.has(entityId)) {
        return this.currentEntities.get(entityId)
     }
     return this.world?.entities?.items?.get(entityId) || null
  }

  public getEntityPosition(entityId: string): THREE.Vector3 | null {
      const entityState = this.currentEntities.get(entityId)
      if (entityState?.position && Array.isArray(entityState.position) && entityState.position.length === 3) {
          return new THREE.Vector3(entityState.position[0], entityState.position[1], entityState.position[2])
      }

      const entity = this.world?.entities?.items?.get(entityId)
       if (entity?.base?.position instanceof THREE.Vector3) {
            return entity.base.position
       } else if (entity?.data?.position) {
           const pos = entity.data.position
           if (Array.isArray(pos) && pos.length >= 3) {
               return new THREE.Vector3(pos[0], pos[1], pos[2])
           } else if (pos && typeof pos.x === 'number') {
                return new THREE.Vector3(pos.x, pos.y, pos.z)
           }
       }
      return null
  }

   public getEntityName(entityId: string): string | null {
       if (this.playerNamesMap.has(entityId)) {
           return this.playerNamesMap.get(entityId) || null
       }
       const entityState = this.currentEntities.get(entityId)
       if (entityState?.name) {
            return entityState.name
       }
       const entity = this.world?.entities?.items?.get(entityId)
       return entity?.data?.name || null
   }

   private extractEntityState(entity: any): any {
        if (!entity || !entity.id) return null

        let positionArray: number[] | null = null
        if (entity.base?.position instanceof THREE.Vector3) {
            positionArray = entity.base.position.toArray()
        } else if (entity.data?.position) {
            const pos = entity.data.position
            if (Array.isArray(pos) && pos.length >= 3) {
                positionArray = [pos[0], pos[1], pos[2]]
            } else if (pos && typeof pos.x === 'number') {
                 positionArray = [pos.x, pos.y, pos.z]
            }
        }

         let rotationArray: number[] | null = null
         if (entity.base?.quaternion instanceof THREE.Quaternion) {
             rotationArray = entity.base.quaternion.toArray()
         } else if (entity.data?.quaternion) {
             const rot = entity.data.quaternion
              if (Array.isArray(rot) && rot.length >= 4) {
                 rotationArray = [rot[0], rot[1], rot[2], rot[3]]
             } else if (rot && typeof rot.x === 'number') {
                  rotationArray = [rot.x, rot.y, rot.z, rot.w]
             }
         }

        let name: string | null = null
        if (entity.data?.type === 'player' && this.playerNamesMap.has(entity.id)) {
            name = this.playerNamesMap.get(entity.id) || entity.data?.name || null
        } else {
            name = entity.data?.name || null
        }

        const state: any = {
            id: entity.id,
            type: entity.data?.type || 'unknown',
            name: name,
            position: positionArray,
            rotation: rotationArray,
        }

        return state
   }

  async handleDisconnect(): Promise<void> {
      if (!this.isConnectedState && !this.world) return
      logger.info('Handling Hyperfy disconnection...')
      this.isConnectedState = false

      this.stopSimulation()
      this.stopEntityUpdates()
      this.stopRandomMovement()
      this.stopRandomChatting()
      this.stopAppearancePolling()

      if (this.world?.entities && typeof this.world.entities.off === 'function') {
          logger.info("[Hyperfy Cleanup] Removing entity listeners...")
          this.world.entities.off('entityAdded', this.entityAddedListener.bind(this))
          this.world.entities.off('entityModified', this.entityModifiedListener.bind(this))
          this.world.entities.off('entityRemoved', this.entityRemovedListener.bind(this))
      }

      if (this.world) {
          try {
              if (this.world.network && typeof this.world.network.disconnect === 'function') {
                  logger.info("[Hyperfy Cleanup] Calling network.disconnect()...")
                  await this.world.network.disconnect()
              }
              if (typeof this.world.destroy === 'function') {
                  logger.info("[Hyperfy Cleanup] Calling world.destroy()...")
                  this.world.destroy()
              }
          } catch (e: any) {
              logger.warn(`[Hyperfy Cleanup] Error during world network disconnect/destroy: ${e.message}`)
          }
      }

      this.world = null
      this.controls = null
      this.currentEntities.clear()
      this.playerNamesMap.clear()
      this.agentState = { position: null, rotation: null }
      this.wsUrl = null
      this.appearanceSet = false
      this.isPhysicsSetup = false
      this.PHYSX = null

      this.processedMsgIds.clear()

      if (this.tickIntervalId) { clearTimeout(this.tickIntervalId); this.tickIntervalId = null; }
      if (this.entityUpdateIntervalId) { clearInterval(this.entityUpdateIntervalId); this.entityUpdateIntervalId = null; }
      if (this.randomMoveIntervalId) { clearInterval(this.randomMoveIntervalId); this.randomMoveIntervalId = null; }
      if (this.randomChatIntervalId) { clearInterval(this.randomChatIntervalId); this.randomChatIntervalId = null; }
      if (this.appearanceIntervalId) { clearInterval(this.appearanceIntervalId); this.appearanceIntervalId = null; }

      logger.info('Hyperfy disconnection handling complete.')
  }

  async disconnect(): Promise<void> {
      logger.info(`Disconnecting HyperfyService from world ${this._currentWorldId}`)
      await this.handleDisconnect()
      logger.info('HyperfyService disconnect complete.')
  }

  getState(): { entities: Map<string, any>; agent: any, status: string } {
      const agentStateCopy = this.agentState ? JSON.parse(JSON.stringify(this.agentState)) : {}

      return {
          entities: this.currentEntities,
          agent: agentStateCopy,
          status: this.isConnectedState ? 'connected' : 'disconnected'
       }
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.isConnected() || !this.world?.chat || !this.world?.entities?.player) {
      throw new Error('HyperfyService: Cannot send message. Not ready.')
    }

    try {
      const agentPlayerId = this.world.entities.player.id
      const agentPlayerName = this.getEntityName(agentPlayerId) || this.world.entities.player.data?.name || 'Hyperliza'

      logger.info(`HyperfyService sending message: "${text}" as ${agentPlayerName} (${agentPlayerId})`)

      if (typeof this.world.chat.add !== 'function') {
        throw new Error('world.chat.add is not a function')
      }

      this.world.chat.add(
        {
          body: text,
          fromId: agentPlayerId,
          from: agentPlayerName,
        },
        true
      )
    } catch (error: any) {
      logger.error('Error sending Hyperfy message:', error.message, error.stack)
      throw error
    }
  }

  async move(key: string, isDown: boolean): Promise<void> {
    if (!this.isConnected() || !this.controls) throw new Error('HyperfyService: Cannot move. Not connected or controls unavailable.')
    if (typeof this.controls.setKey !== 'function') throw new Error('HyperfyService: controls.setKey method is missing.')
    try {
      logger.debug(`HyperfyService move: key=${key}, isDown=${isDown}`)
      this.controls.setKey(key, isDown)
    } catch (error: any) {
      logger.error('Error setting key:', error.message, error.stack)
      throw error
    }
  }

  private startEntityUpdates(intervalMs = HYPERFY_ENTITY_UPDATE_INTERVAL): void {
    if (this.entityUpdateIntervalId) clearInterval(this.entityUpdateIntervalId)

    this.entityUpdateIntervalId = setInterval(() => {
        if (!this.isConnected() || !this.world?.entities?.player) {
             if (this.agentState.position || this.agentState.rotation) {
                 logger.debug("[Entity Update] Clearing agent state (disconnected or player missing).")
                 this.agentState = { position: null, rotation: null }
             }
             return
        }

        const playerEntity = this.world.entities.player
        let updated = false
        if (playerEntity?.base?.position instanceof THREE.Vector3) {
             const newPosArray = playerEntity.base.position.toArray()
             if (JSON.stringify(newPosArray) !== JSON.stringify(this.agentState.position)) {
                 this.agentState.position = newPosArray
                 updated = true
             }
        } else if (this.agentState.position) {
             this.agentState.position = null
             updated = true
        }

        if (playerEntity?.base?.quaternion instanceof THREE.Quaternion) {
            const newRotArray = playerEntity.base.quaternion.toArray()
             if (JSON.stringify(newRotArray) !== JSON.stringify(this.agentState.rotation)) {
                 this.agentState.rotation = newRotArray
                 updated = true
             }
        } else if (this.agentState.rotation) {
            this.agentState.rotation = null
             updated = true
        }

    }, intervalMs)
    logger.info(`[Entity Update] Started interval for agent state sync every ${intervalMs}ms.`)
  }

  private stopEntityUpdates(): void {
    if (this.entityUpdateIntervalId) {
      clearInterval(this.entityUpdateIntervalId)
      this.entityUpdateIntervalId = null
      logger.info('[Entity Update] Stopped.')
    }
  }

  private logCurrentEntities(): void {
     if (!this.world || !this.currentEntities || !this.isConnectedState) return
     const entityCount = this.currentEntities.size
     const agentPlayerId = this.world?.entities?.player?.id

     logger.info(`--- [Hyperfy Service Entity Log - Time: ${this.world.time?.toFixed(2)}s] --- (${entityCount} entities) ---`)
     this.currentEntities.forEach((entityState, id) => {
        let logMessage = `  ID: ${id.substring(0,8)}..., Type: ${entityState.type || 'unknown'}`
        const name = entityState.name
        if (name) {
             logMessage += `, Name: ${name}`
             if (id === agentPlayerId) {
                 logMessage += ' (Self)'
             }
        }

        if (entityState.position) {
             const pos = entityState.position.map((p: number) => p.toFixed(2)).join(', ')
             logMessage += `, Pos: (${pos})`
        } else {
            logMessage += `, Pos: (N/A)`
        }
         if (entityState.rotation) {
             const rot = entityState.rotation.map((r: number) => r.toFixed(2))
             logMessage += `, Rot: (x:${rot[0]}, y:${rot[1]}, z:${rot[2]}, w:${rot[3]})`
         } else {
         }

        logger.info(logMessage)
     })
     logger.info(`--- [End Hyperfy Service Entity Log] ---`)
  }

  async triggerUseAction(holdDurationMs = 600): Promise<void> {
    if (!this.isConnected() || !this.controls) {
      throw new Error('HyperfyService: Cannot trigger use action. Not connected or controls unavailable.')
    }
    if (typeof this.controls.setKey !== 'function') {
        throw new Error('HyperfyService: controls.setKey method is missing.')
    }

    logger.info(`[Action] Simulating 'Use' action (Pressing 'E' for ${holdDurationMs}ms)`)

    try {
      this.controls.setKey('keyE', true)

      await new Promise(resolve => setTimeout(resolve, holdDurationMs))

      this.controls.setKey('keyE', false)
      logger.info(`[Action] 'Use' action simulation complete (Released 'E').`)

    } catch (error) {
      logger.error('[Action] Error during triggerUseAction simulation:', error)
      try {
          if (this.controls && typeof this.controls.setKey === 'function') {
             this.controls.setKey('keyE', false)
          }
      } catch (releaseError) {
          logger.error('[Action] Failed to release E key after error:', releaseError)
      }
      throw error
    }
  }

  async stop(): Promise<void> {
    logger.info('*** Stopping Hyperfy service instance ***')
    await this.disconnect()
  }

  private startChatSubscription(): void {
    if (!this.world || !this.world.chat) {
      logger.error('Cannot subscribe to chat: World or Chat system not available.')
      return
    }

    logger.info('[HyperfyService] Initializing chat subscription...')

    // Pre-populate processed IDs with existing messages
    this.world.chat.msgs?.forEach((msg: any) => {
        if (msg && msg.id) { // Add null check for msg and msg.id
            this.processedMsgIds.add(msg.id)
        }
    });

    this.world.chat.subscribe((msgs: any[]) => {
      // Wait for player entity (ensures world/chat exist too)
      if (!this.world || !this.world.chat || !this.world.entities?.player) return

      const agentPlayerId = this.world.entities.player.id // Get agent's ID
      const agentPlayerName = this.getEntityName(agentPlayerId) || this.world.entities.player.data?.name || 'Hyperliza'; // Use name getter

      const newMessagesFound: any[] = [] // Temporary list for new messages

      // Step 1: Identify new messages and update processed set
      msgs.forEach((msg: any) => {
        // Check if we've already processed this message ID
        if (msg && msg.id && !this.processedMsgIds.has(msg.id)) {
          newMessagesFound.push(msg) // Add the full message object
          this.processedMsgIds.add(msg.id) // Mark ID as processed immediately
        }
      })

      // Step 2: Process only the newly found messages
      if (newMessagesFound.length > 0) {
        logger.info(`[Chat] Found ${newMessagesFound.length} new messages to process.`)

        newMessagesFound.forEach(async (msg: any) => {
          const senderName = msg.from || 'System'
          const messageBody = msg.body || ''
          logger.info(`[Chat Received] From: ${senderName}, ID: ${msg.id}, Body: "${messageBody}"`)

          // Respond only to messages not from the agent itself
          if (msg.fromId !== agentPlayerId) {
            try {
              logger.info(`[Hyperfy Chat] Processing message from ${senderName}`)

              // First, ensure we register the entity (world, room, sender) in Eliza properly
              const hyperfyWorldId = createUniqueUuid(this.runtime, 'hyperfy-world') as UUID
              const elizaRoomId = createUniqueUuid(this.runtime, this._currentWorldId || 'hyperfy-unknown-world')
              const entityId = createUniqueUuid(this.runtime, msg.fromId.toString()) as UUID

              logger.debug(`[Hyperfy Chat] Creating world: ${hyperfyWorldId}`)
              // Register the world if it doesn't exist
              await this.runtime.ensureWorldExists({
                id: hyperfyWorldId,
                name: 'Hyperfy World',
                agentId: this.runtime.agentId,
                serverId: 'hyperfy',
                metadata: {
                  type: 'hyperfy',
                },
              })

              logger.debug(`[Hyperfy Chat] Creating room: ${elizaRoomId}`)
              // Register the room if it doesn't exist
              await this.runtime.ensureRoomExists({
                id: elizaRoomId,
                name: 'Hyperfy Chat',
                source: 'hyperfy',
                type: ChannelType.WORLD,
                channelId: this._currentWorldId,
                serverId: 'hyperfy',
                worldId: hyperfyWorldId,
              })

              logger.debug(`[Hyperfy Chat] Creating entity connection for: ${entityId}`)
              // Ensure connection for the sender entity
              await this.runtime.ensureConnection({
                entityId: entityId,
                roomId: elizaRoomId,
                userName: senderName,
                name: senderName,
                source: 'hyperfy',
                channelId: this._currentWorldId,
                serverId: 'hyperfy',
                type: ChannelType.WORLD,
                worldId: hyperfyWorldId,
              })

              // Create the message memory
              const messageId = createUniqueUuid(this.runtime, msg.id.toString()) as UUID
              logger.debug(`[Hyperfy Chat] Creating memory: ${messageId}`)
              const memory: Memory = {
                id: messageId,
                entityId: entityId,
                agentId: this.runtime.agentId,
                roomId: elizaRoomId,
                worldId: hyperfyWorldId,
                content: {
                  text: messageBody,
                  source: 'hyperfy',
                  channelType: ChannelType.WORLD,
                  metadata: {
                    hyperfyMessageId: msg.id,
                    hyperfyFromId: msg.fromId,
                    hyperfyFromName: senderName,
                  },
                },
                createdAt: Date.now(),
              }

              // Create a callback function to handle responses
              const callback: HandlerCallback = async (responseContent: Content): Promise<Memory[]> => {
                logger.info(`[Hyperfy Chat Callback] Received response: ${JSON.stringify(responseContent)}`)
                if (responseContent.text) {
                  logger.info(`[Hyperfy Chat Response] ${responseContent.text}`)
                  // Send response back to Hyperfy
                   if (this.world?.chat?.add) {
                  this.world.chat.add(
                    {
                      body: responseContent.text,
                      fromId: agentPlayerId,
                      from: agentPlayerName,
                    },
                    true
                        );
                   } else {
                        logger.error("[Hyperfy Chat Callback] Cannot send response: world.chat.add not available.");
                }
              }
                return [];
              };

              // Ensure the entity actually exists in DB before event emission
              try {
                const entity = await this.runtime.getEntityById(entityId)
                if (!entity) {
                  logger.warn(
                    `[Hyperfy Chat] Entity ${entityId} not found in database after creation, creating directly`
                  )
                  await this.runtime.createEntity({
                    id: entityId,
                    names: [senderName],
                    agentId: this.runtime.agentId,
                    metadata: {
                      hyperfy: {
                        id: msg.fromId,
                        username: senderName,
                        name: senderName,
                      },
                    },
                  })
                }
              } catch (error) {
                logger.error(`[Hyperfy Chat] Error checking/creating entity: ${error}`)
              }

              // Emit the MESSAGE_RECEIVED event to trigger the message handler
              logger.info(`[Hyperfy Chat] Emitting MESSAGE_RECEIVED event for message: ${messageId}`)
              await this.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
                runtime: this.runtime,
                message: memory,
                callback: callback,
                source: 'hyperfy',
              })

              logger.info(`[Hyperfy Chat] Successfully emitted event for message: ${messageId}`)
            } catch (error) {
              logger.error(`[Hyperfy Chat] Error processing message: ${error}`)
              logger.error((error as Error).stack); // Log stack trace

              // Always send a fallback response on error
              const response = `I received your message but encountered an issue processing it.`
              logger.info(`[Hyperfy Chat Fallback] Sending direct response after error: "${response}"`)

              try {
                   if (this.world?.chat?.add) {
                this.world.chat.add(
                  {
                    body: response,
                    fromId: agentPlayerId,
                    from: agentPlayerName,
                  },
                  true
                        );
                   } else {
                       logger.error("[Hyperfy Chat Fallback] Cannot send fallback: world.chat.add not available.");
                   }
              } catch (err) {
                logger.error(`[Hyperfy Chat Fallback] Error sending error response: ${err}`)
              }
            }
          }
        })
      }
    })
  }

  private startSimulation(): void {
    if (this.tickIntervalId) clearTimeout(this.tickIntervalId);
    const tickIntervalMs = 1000 / HYPERFY_TICK_RATE;
    let lastTickTime = performance.now();
    let lastTickErrorLogTime = 0; // Track last error log time
    const tickErrorLogInterval = 10000; // Log tick errors max every 10 seconds

    const tickLoop = () => {
      if (!this.world || !this.isConnectedState) {
          // If disconnected or world gone, stop the loop
          if (this.tickIntervalId) {
               logger.info('[Sim] Stopping tick loop (world/connection lost).');
               clearTimeout(this.tickIntervalId);
               this.tickIntervalId = null;
          }
          return;
      }

      const now = performance.now();
      try {
        // Wrap in try-catch to handle browser API calls that might fail in Node
        if (typeof this.world.tick === 'function') {
          this.world.tick(now);
        }
      } catch (e: any) { // Type the error
        // Check if it's the specific ReferenceError and log less frequently
        if (e instanceof ReferenceError && e.message?.includes('document is not defined')) {
          if (now - lastTickErrorLogTime > tickErrorLogInterval) {
            logger.warn('[HyperfyService] Suppressed frequent ReferenceError during world.tick (document not defined)');
            lastTickErrorLogTime = now;
          }
        } else {
          // Log other errors normally
          logger.error('[HyperfyService] Error during world.tick:', e);
        }
        // Don't stop the loop on error, just log and continue
      }

      lastTickTime = now;
      // Schedule next tick precisely
      const elapsed = performance.now() - now;
      const delay = Math.max(0, tickIntervalMs - elapsed);
      // Ensure we don't reschedule if stopSimulation was called during tick
      if (this.tickIntervalId !== null) { // Check if cleared
          this.tickIntervalId = setTimeout(tickLoop, delay);
      }
    };

    logger.info(`[HyperfyService] Starting simulation tick at ${HYPERFY_TICK_RATE}Hz.`);
    this.tickIntervalId = setTimeout(tickLoop, 0); // Start immediately
  }

  private stopSimulation(): void {
    if (this.tickIntervalId) {
      clearTimeout(this.tickIntervalId);
      this.tickIntervalId = null; // Set to null immediately
      logger.info('[Sim] Tick stopped.');
    }
  }

  private startRandomMovement(): void { /* ... existing ... */ }
  private stopRandomMovement(): void { /* ... existing ... */ }
  private startRandomChatting(): void { /* ... existing ... */ }
  private stopRandomChatting(): void { /* ... existing ... */ }
}

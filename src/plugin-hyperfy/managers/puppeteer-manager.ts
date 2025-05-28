////@ts-nocheck
import path from 'path'
import fs from 'fs'
import { promises as fsPromises } from 'fs';
import puppeteer from 'puppeteer'
import { IAgentRuntime, ModelType } from '@elizaos/core'
import { HyperfyService } from '../service.js'
import * as THREE from 'three';
import { resolveUrl } from '../utils.js';

export class PuppeteerManager {
  private static instance: PuppeteerManager | null = null
  
  private runtime: IAgentRuntime
  private browser: puppeteer.Browser
  private page: puppeteer.Page
  private initPromise: Promise<void> | null = null
  private readonly STRIP_SLOTS = [
    'map', 'aoMap', 'alphaMap',
    'bumpMap', 'normalMap',
    'metalnessMap', 'roughnessMap',
    'emissiveMap', 'lightMap'
  ] as const;


  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime
    this.init()

    if (!PuppeteerManager.instance) {
      PuppeteerManager.instance = this
    } else {
      throw new Error('PuppeteerManager has already been instantiated.')
    }
  }

  public static getInstance(): PuppeteerManager {
    if (!this.instance) {
      throw new Error('PuppeteerManager not yet initialized. Call new PuppeteerManager(runtime) first.')
    }
    return this.instance
  }

  private async init() {
    // Only initialize once
    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.browser = await puppeteer.launch({
          headless: false,
          defaultViewport: null,
          slowMo: 50
        })

        this.page = await this.browser.newPage()
        const filePath = path.resolve('puppeteer/index.html')
        await this.page.goto(`file://${filePath}`, { waitUntil: 'load' })

        await this.page.waitForFunction(() =>
          window.THREE !== undefined && 
          window.scene !== undefined && 
          window.camera !== undefined
        )
      })()
    }
    return this.initPromise
  }

  public async snapshotFacingDirection(
    direction: 'front' | 'back' | 'left' | 'right'
  ): Promise<string> {
    await this.init();
  
    const service = this.getService();
    const world = service.getWorld();
    const player = world.entities.player;
  
    if (!player) {
      throw new Error('Player entity not yet available');
    }

    // Determine the rotation offset in radians based on direction
    const rotationOffsetY: Record<'front' | 'back' | 'left' | 'right', number> = {
      front: 0,
      right: -Math.PI / 2,
      back: Math.PI,
      left: Math.PI / 2,
    };
  
    const baseQuat = player.base.quaternion.clone();
  
    const yawQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, rotationOffsetY[direction], 0, 'YXZ')
    );
  
    const newQuat = baseQuat.clone().multiply(yawQuat);
    player.base.quaternion.copy(newQuat);
    const euler = new THREE.Euler().setFromQuaternion(newQuat, 'YXZ');
    player.cam.rotation.y = euler.y;
  
    await this.rehydrateSceneTextures();
  
    const playerData = {
      position: player.base.position.toArray() as [number, number, number],
      quaternion: [
        player.base.quaternion.x,
        player.base.quaternion.y,
        player.base.quaternion.z,
        player.base.quaternion.w
      ] as const
    };
  
    const base64 = await this.page.evaluate((playerData) => {
      const win = window as any;
      const THREE = win.THREE;
      const camera = win.camera;
      const renderer = win.renderer;
  
      const eye = new THREE.Vector3(...playerData.position);
      eye.y += 2;
  
      camera.position.copy(eye);
      camera.quaternion.set(...playerData.quaternion);
     
      // Move camera backward along its local forward axis with 2 units
      const backward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(backward, -2);
      
      camera.updateMatrixWorld();
  
      renderer.render(win.scene, camera);
  
      return renderer.domElement.toDataURL('image/png').split(',')[1];
    }, playerData);
  
    const filePath = path.resolve(`scene_facing_${direction}.png`);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  
    return base64;
  }
  
  

  public async snapshotViewToTarget(targetPosition: [number, number, number]): Promise<string> {
    await this.init();
  
    const service = this.getService();
    const world = service.getWorld();
    const player = world.entities.player;
  
    if (!player) {
      throw new Error('Player entity not yet available');
    }
  
    await this.rehydrateSceneTextures();
  
    const playerData = {
      position: player.base.position.toArray() as [number, number, number]
    };
  
    const base64 = await this.page.evaluate((playerData, targetPosition) => {
      const win = window as any;
      const THREE = win.THREE;
      const camera = win.camera;
      const renderer = win.renderer;
  
      const eye = new THREE.Vector3(...playerData.position);
      eye.y += 2;
      const target = new THREE.Vector3(...targetPosition);
  
      camera.position.copy(eye);
      camera.lookAt(target);
      camera.updateMatrixWorld();
  
      renderer.render(win.scene, camera);
  
      return renderer.domElement.toDataURL('image/png').split(',')[1];
    }, playerData, targetPosition);
  
    const filePath = path.resolve(`scene_view_to_target.png`);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  
    return base64;
  }
  

  public async snapshotEquirectangular(): Promise<string> {
    await this.init();
  
    const service = this.getService();
    const world = service.getWorld();
    const player = world.entities.player;
  
    if (!player) {
      throw new Error('Player entity not yet available');
    }
  
    await this.rehydrateSceneTextures();
  
    const playerData = {
      position: player.base.position.toArray(),
      quaternion: [player.base.quaternion.x, player.base.quaternion.y, player.base.quaternion.z, player.base.quaternion.w] as const
    };
    const base64 = await this.page.evaluate(async (playerData) => {
      const THREE = window.THREE;
  
      const renderer = window.renderer;
      const scene = window.scene;
  
      const size = 1024;
  
      const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(size, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });
  
      const eye = new THREE.Vector3().fromArray(playerData.position);
      eye.y += 2;
  
      const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
      cubeCamera.position.copy(eye);
      cubeCamera.quaternion.set(
        playerData.quaternion[0],
        playerData.quaternion[1],
        playerData.quaternion[2],
        playerData.quaternion[3]
      );
      cubeCamera.update(renderer, scene);
  
      // Scene and camera for rendering the equirectangular image
      const rtWidth = 2048;
      const rtHeight = 1024;

      const renderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const sceneRTT = new THREE.Scene();
  
      // ShaderMaterial to convert cubemap to equirect
      const material = new THREE.ShaderMaterial({
        uniforms: {
          envMap: { value: cubeRenderTarget.texture },
          resolution: { value: new THREE.Vector2(rtWidth, rtHeight) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          uniform samplerCube envMap;
          varying vec2 vUv;
  
          const float PI = 3.14159265359;
  
          void main() {
            vec2 uv = vUv;
            uv.x = 1.0 - uv.x;
            float theta = uv.x * 2.0 * PI;
            float phi = uv.y * PI;
            vec3 dir = vec3(
              sin(theta) * sin(phi),
              cos(phi),
              cos(theta) * sin(phi)
            );
            gl_FragColor = textureCube(envMap, dir);
          }
        `
      });
  
      const plane = new THREE.PlaneGeometry(2, 2);
      const quad = new THREE.Mesh(plane, material);
      sceneRTT.add(quad);
  
      renderer.setRenderTarget(renderTarget);
      renderer.render(sceneRTT, camera);
      renderer.setRenderTarget(null);
  
      // Read pixels
      const pixels = new Uint8Array(rtWidth * rtHeight * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, rtWidth, rtHeight, pixels);
  
      const canvas = document.createElement('canvas');
      canvas.width = rtWidth;
      canvas.height = rtHeight;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(rtWidth, rtHeight);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
  
      return canvas.toDataURL('image/png').split(',')[1];
    }, playerData);
  
    // Save image in Node.js
    const buffer = Buffer.from(base64, 'base64');
    const filePath = path.resolve('scene_equirectangular.png');
    fs.writeFileSync(filePath, buffer);
  
    return base64;
  }


  private async rehydrateSceneTextures() {
    const service = this.getService()
    const world = service.getWorld()
    const sceneJson = world.stage.scene.toJSON()

    const agentId = world.entities.player.data.id;
    console.log(world.entities.player.data)
    const players = await Promise.all(
      Array.from(world.entities.players.entries())
        .filter(([_, value]) => value.data.id !== agentId)
        .map(async ([key, value]) => {
          const avatarUrl = await resolveUrl(value.avatarUrl, world);
          return {
            id: key,
            avatarUrl,
            position: value.base.position.toArray(),
            scale: value.base.scale.toArray(),
            quaternion: [
              value.base.quaternion.x,
              value.base.quaternion.y,
              value.base.quaternion.z,
              value.base.quaternion.w,
            ],
          };
        })
    );
    
    const STRIP_SLOTS = this.STRIP_SLOTS;
    await this.page.evaluate(async (sceneJson, STRIP_SLOTS, players) => {
      const THREE = window.THREE;
      const loader = new window.THREE.ObjectLoader();
      const loadedScene = loader.parse(sceneJson);
  
      // Rehydrate materials
      loadedScene.traverse(obj => {
        if (!obj.isMesh || !obj.material) return;

        console.log("ibjjj", obj)
  
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  
        mats.forEach(mat => {
          console.log("matatta", mat)
          const id = mat.userData.materialId;
          if (!id) return;
  
          STRIP_SLOTS.forEach(slot => {
            const key = `${id}:${slot}`;
            const tex = window.texturesMap?.get(key);
            if (tex && tex.isTexture) mat[slot] = tex;
          });
  
          mat.needsUpdate = true;
        });
      });

      if (window.activeVRMInstances) {
        for (const inst of window.activeVRMInstances) {
          try {
            inst.destroy();
          } catch (e) {
            console.warn('[AgentLoader] Failed to destroy instance:', e);
          }
        }
      }
      window.activeVRMInstances = [];
  
      // // Rehydrate player avatars
      players.forEach(player => {
        if (!player.avatarUrl) return;
        const factory = window.avatarMap?.get(player.avatarUrl);
        if (!factory) return;

        const vrmHooks = {
          camera: window.camera,
          scene: loadedScene,
          octree: null,
          setupMaterial: () => {},
          loader: window.VRMLoader,
        }
        const instance = factory.create(new THREE.Matrix4(), vrmHooks, (m) => m);
  

        const position = new THREE.Vector3(...player.position);
        const rotation = new THREE.Quaternion(...player.quaternion);
        const scale = new THREE.Vector3(...player.scale);

        const matrix = new THREE.Matrix4();
        matrix.compose(position, rotation, scale);
        instance.move(matrix);

        window.activeVRMInstances.push(instance);
      });

      window.scene = loadedScene;
  
      if (window.environment) {
        window.scene.environment = window.environment;
        window.scene.background = window.environment;
      }
  
      window.renderer.render(window.scene, window.camera);
    }, sceneJson, STRIP_SLOTS, players);
  }
  
  
  async loadGlbBytes(url: string): Promise<number[]> {
    await this.init();
    const STRIP_SLOTS = this.STRIP_SLOTS;

    return this.page.evaluate(async (url, STRIP_SLOTS) => {
      const loader = new window.GLTFLoader();
      const gltf = await loader.loadAsync(url);

      if (!window.texturesMap) window.texturesMap = new Map();

      gltf.scene.traverse(obj => {
        if (!obj.isMesh || !obj.material) return;

        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

        mats.forEach(mat => {
          if (!mat.userData.materialId) {
            mat.userData.materialId = window.crypto.randomUUID();
          }
          const id = mat.userData.materialId;

          STRIP_SLOTS.forEach(slot => {
            const tex = mat[slot];
            if (tex && tex.isTexture) {
              window.texturesMap.set(`${id}:${slot}`, tex);  // cache
              mat[slot] = null;                             // strip
            }
          });

          mat.needsUpdate = true;
        });
      });

      const exporter = new window.GLTFExporter();
      const buffer = await new Promise<ArrayBuffer>((done) =>
        exporter.parse(gltf.scene, done, { binary: true, embedImages: true })
      );

      // Return a *serialisable* plain array of numbers (0-255)
      return [...new Uint8Array(buffer)];
    }, url, STRIP_SLOTS);
  }

  async loadVRMBytes(url: string): Promise<number[]> {
    await this.init();
    
    return this.page.evaluate(async (url) => {
      const THREE = window.THREE;
      
      function createVRMFactory(glb, setupMaterial) {
        const v1 = new THREE.Vector3()
        const v2 = new THREE.Vector3()

        const DIST_CHECK_RATE = 1 // once every second
        const DIST_MIN_RATE = 1 / 5 // 3 times per second
        const DIST_MAX_RATE = 1 / 25 // 25 times per second
        const DIST_MIN = 30 // <= 15m = min rate
        const DIST_MAX = 60 // >= 30m = max rate
        const DEG2RAD = THREE.MathUtils.DEG2RAD
        // we'll update matrix ourselves
        glb.scene.matrixAutoUpdate = false
        glb.scene.matrixWorldAutoUpdate = false
        // remove expressions from scene
        const expressions = glb.scene.children.filter(n => n.type === 'VRMExpression') // prettier-ignore
        for (const node of expressions) node.removeFromParent()
        // remove VRMHumanoidRig
        const vrmHumanoidRigs = glb.scene.children.filter(n => n.name === 'VRMHumanoidRig') // prettier-ignore
        for (const node of vrmHumanoidRigs) node.removeFromParent()
        // remove secondary
        const secondaries = glb.scene.children.filter(n => n.name === 'secondary') // prettier-ignore
        for (const node of secondaries) node.removeFromParent()
        // enable shadows
        glb.scene.traverse(obj => {
          if (obj.isMesh) {
            obj.castShadow = true
            obj.receiveShadow = true
          }
        })
        // calculate root to hips
        const bones = glb.userData.vrm.humanoid._rawHumanBones.humanBones
        const hipsPosition = v1.setFromMatrixPosition(bones.hips.node.matrixWorld)
        const rootPosition = v2.set(0, 0, 0) //setFromMatrixPosition(bones.root.node.matrixWorld)
        const rootToHips = hipsPosition.y - rootPosition.y
        // get vrm version
        const version = glb.userData.vrm.meta?.metaVersion
        // convert skinned mesh to detached bind mode
        // this lets us remove root bone from scene and then only perform matrix updates on the whole skeleton
        // when we actually need to  for massive performance
        const skinnedMeshes = []
        glb.scene.traverse(node => {
          if (node.isSkinnedMesh) {
            node.bindMode = THREE.DetachedBindMode
            node.bindMatrix.copy(node.matrixWorld)
            node.bindMatrixInverse.copy(node.bindMatrix).invert()
            skinnedMeshes.push(node)
          }
          if (node.isMesh) {
            // bounds tree
            // node.geometry.computeBoundsTree()
            // fix csm shadow banding
            node.material.shadowSide = THREE.BackSide
            // csm material setup
            setupMaterial(node.material)
          }
        })
        
        const skeleton = skinnedMeshes[0].skeleton // should be same across all skinnedMeshes
      
        // pose arms down
        const normBones = glb.userData.vrm.humanoid._normalizedHumanBones.humanBones
        const leftArm = normBones.leftUpperArm.node
        leftArm.rotation.z = 75 * DEG2RAD
        const rightArm = normBones.rightUpperArm.node
        rightArm.rotation.z = -75 * DEG2RAD
        glb.userData.vrm.humanoid.update(0)
        skeleton.update()
      
        // get height
        let height = 1 // minimum
        // for (const mesh of skinnedMeshes) {
        //   if (!mesh.boundingBox) mesh.computeBoundingBox()
        //   if (height < mesh.boundingBox.max.y) {
        //     height = mesh.boundingBox.max.y
        //   }
        // }
      
        // this.headToEyes = this.eyePosition.clone().sub(headPos)
        const headPos = normBones.head.node.getWorldPosition(new THREE.Vector3())
        const headToHeight = height - headPos.y
      
        const getBoneName = vrmBoneName => {
          return glb.userData.vrm.humanoid.getRawBoneNode(vrmBoneName)?.name
        }
      
        const noop = () => {
          // ...
        }
        function getTrianglesFromGeometry(geometry) {
          if (!geometry) return 0
          return geometry.index !== null ? geometry.index.count / 3 : geometry.attributes.position.count / 3
        }
        const slots = [
          'alphaMap',
          'aoMap',
          'bumpMap',
          'displacementMap',
          'emissiveMap',
          'envMap',
          'lightMap',
          'map',
          'metalnessMap',
          'normalMap',
          'roughnessMap',
        ]
        
        function getTextureBytesFromMaterial(material) {
          let bytes = 0
          if (material) {
            const checked = new Set()
            for (const slot of slots) {
              const texture = material[slot]
              if (texture && texture.image && !checked.has(texture.uuid)) {
                checked.add(texture.uuid)
                bytes += texture.image.width * texture.image.height * 4
              }
            }
          }
          return bytes
        }
      
        return {
          create,
          applyStats(stats) {
            glb.scene.traverse(obj => {
              if (obj.geometry && !stats.geometries.has(obj.geometry.uuid)) {
                stats.geometries.add(obj.geometry.uuid)
                stats.triangles += getTrianglesFromGeometry(obj.geometry)
              }
              if (obj.material && !stats.materials.has(obj.material.uuid)) {
                stats.materials.add(obj.material.uuid)
                stats.textureBytes += getTextureBytesFromMaterial(obj.material)
              }
            })
          },
        }
        function cloneGLB(glb) {
          // returns a shallow clone of the gltf but a deep clone of the scene.
          // uses SkeletonUtils.clone which is the same as Object3D.clone except also clones skinned meshes etc
          return { ...glb, scene: window.SkeletonUtils.clone(glb.scene) }
        }
        function getSkinnedMeshes(scene) {
          let meshes = []
          scene.traverse(o => {
            if (o.isSkinnedMesh) {
              meshes.push(o)
            }
          })
          return meshes
        }

        let queryParams = {}
        function getQueryParams(url) {
          if (!queryParams[url]) {
            url = new URL(url)
            const params = {}
            for (const [key, value] of url.searchParams.entries()) {
              params[key] = value
            }
            queryParams[url] = params
          }
          return queryParams[url]
        }
        function create(matrix, hooks, node) {
          const vrm = cloneGLB(glb)
          const tvrm = vrm.userData.vrm
          const skinnedMeshes = getSkinnedMeshes(vrm.scene)
          const skeleton = skinnedMeshes[0].skeleton // should be same across all skinnedMeshes
          const rootBone = skeleton.bones[0] // should always be 0
          rootBone.parent.remove(rootBone)
          rootBone.updateMatrixWorld(true)
          vrm.scene.matrix = matrix // synced!
          vrm.scene.matrixWorld = matrix // synced!
          hooks.scene.add(vrm.scene)
      
          const getEntity = () => node?.ctx.entity
      
          // spatial capsule
          // const cRadius = 0.3
          // const sItem = {
          //   matrix,
          //   geometry: createCapsule(cRadius, height - cRadius * 2),
          //   material,
          //   getEntity,
          // }
          // hooks.octree?.insert(sItem)
      
          vrm.scene.traverse(o => {
            o.getEntity = getEntity
          })
      
          // i have no idea how but the mixer only needs one of the skinned meshes
          // and if i set it to vrm.scene it no longer works with detached bind mode
          const mixer = new THREE.AnimationMixer(skinnedMeshes[0])
      
          // IDEA: we should use a global frame "budget" to distribute across avatars
          // https://chatgpt.com/c/4bbd469d-982e-4987-ad30-97e9c5ee6729
      
          let elapsed = 0
          let rate = 0
          let rateCheckedAt = 999
          const update = delta => {
            // periodically calculate update rate based on distance to camera
            rateCheckedAt += delta
            if (rateCheckedAt >= DIST_CHECK_RATE) {
              const vrmPos = v1.setFromMatrixPosition(vrm.scene.matrix)
              const camPos = v2.setFromMatrixPosition(hooks.camera.matrixWorld) // prettier-ignore
              const distance = vrmPos.distanceTo(camPos)
              const clampedDistance = Math.max(distance - DIST_MIN, 0)
              const normalizedDistance = Math.min(clampedDistance / (DIST_MAX - DIST_MIN), 1) // prettier-ignore
              rate = DIST_MAX_RATE + normalizedDistance * (DIST_MIN_RATE - DIST_MAX_RATE) // prettier-ignore
              // console.log('distance', distance)
              // console.log('rate per second', 1 / rate)
              rateCheckedAt = 0
            }
            elapsed += delta
            const should = elapsed >= rate
            if (should) {
              mixer.update(elapsed)
              skeleton.bones.forEach(bone => bone.updateMatrixWorld())
              skeleton.update = THREE.Skeleton.prototype.update
              // tvrm.humanoid.update(elapsed)
              elapsed = 0
            } else {
              skeleton.update = noop
              elapsed += delta
            }
          }
          // world.updater.add(update)
          const emotes = {
            // [url]: {
            //   url: String
            //   loading: Boolean
            //   action: AnimationAction
            // }
          }
          let currentEmote
          const setEmote = url => {
            if (currentEmote?.url === url) return
            if (currentEmote) {
              currentEmote.action?.fadeOut(0.15)
              currentEmote = null
            }
            if (!url) return
            const opts = getQueryParams(url)
            const loop = opts.l !== '0'
            const speed = parseFloat(opts.s || 1)
      
            if (emotes[url]) {
              currentEmote = emotes[url]
              if (currentEmote.action) {
                currentEmote.action.clampWhenFinished = !loop
                currentEmote.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce)
                currentEmote.action.reset().fadeIn(0.15).play()
              }
            } else {
              const emote = {
                url,
                loading: true,
                action: null,
              }
              emotes[url] = emote
              currentEmote = emote
              hooks.loader.load('emote', url).then(emo => {
                const clip = emo.toClip({
                  rootToHips,
                  version,
                  getBoneName,
                })
                const action = mixer.clipAction(clip)
                action.timeScale = speed
                emote.action = action
                // if its still this emote, play it!
                if (currentEmote === emote) {
                  action.clampWhenFinished = !loop
                  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce)
                  action.play()
                }
              })
            }
          }
      
          // console.log('=== vrm ===')
          // console.log('vrm', vrm)
          // console.log('skeleton', skeleton)
      
          const bonesByName = {}
          const findBone = name => {
            // name is the official vrm bone name eg 'leftHand'
            // actualName is the actual bone name used in the skeleton which may different across vrms
            if (!bonesByName[name]) {
              const actualName = glb.userData.vrm.humanoid.getRawBoneNode(name)?.name
              bonesByName[name] = skeleton.getBoneByName(actualName)
            }
            return bonesByName[name]
          }
      
          let firstPersonActive = false
          const setFirstPerson = active => {
            if (firstPersonActive === active) return
            const head = findBone('neck')
            head.scale.setScalar(active ? 0 : 1)
            firstPersonActive = active
          }
      
          const m1 = new THREE.Matrix4()
          const getBoneTransform = boneName => {
            const bone = findBone(boneName)
            if (!bone) return null
            // combine the scene's world matrix with the bone's world matrix
            return m1.multiplyMatrices(vrm.scene.matrixWorld, bone.matrixWorld)
          }
      
          return {
            raw: vrm,
            height,
            headToHeight,
            setEmote,
            setFirstPerson,
            update,
            getBoneTransform,
            move(_matrix) {
              matrix.copy(_matrix)
              // hooks.octree?.move(sItem)
            },
            destroy() {
              hooks.scene.remove(vrm.scene)
              // world.updater.remove(update)
              // hooks.octree?.remove(sItem)
            },
          }
        }
      }

      
      
      const loader = window.VRMLoader;
      const gltf = await loader.loadAsync(url);
      const factory = createVRMFactory(gltf, (m) => m)
      
      window.renderer.render(window.scene, window.camera);

      if (!window.avatarMap) window.avatarMap = new Map();
      window.avatarMap.set(url, factory); // Store a deep clone of the avatar
  
  
      const exporter = new window.GLTFExporter();
      const buffer = await new Promise<ArrayBuffer>((done) =>
        exporter.parse(gltf.scene, done, { binary: true, embedImages: true })
      );
  
      return [...new Uint8Array(buffer)];
    }, url);
  }

  async registerTexture(url: string, slot: string): Promise<string> {
    await this.init();
  
    return this.page.evaluate(async (url, slot) => {
      if (!window.texturesMap) window.texturesMap = new Map();
  
      const loader = window.TextureLoader;
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          url,
          tex => resolve(tex),
          undefined,
          err => reject(err)
        );
      });
  
      const uuid = window.crypto.randomUUID();
      window.texturesMap.set(`${uuid}:${slot}`, texture);
  
      return uuid;
    }, url, slot);
  }
  
  

  public async loadEnvironmentHDR(url: string): Promise<void> {
    await this.init();
    const service = this.getService()
    const world = service.getWorld()

    url = await resolveUrl(url, world);

    await this.page.evaluate(async (url) => {
      const loader = new window.RGBELoader();
      const hdrTexture = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
  
      window.environment = hdrTexture;
      window.scene.environment = hdrTexture;
      window.scene.background = hdrTexture;
  
      window.renderer.render(window.scene, window.camera);
    }, url);
  }

  private getService() {
    return this.runtime.getService<HyperfyService>(HyperfyService.serviceType)
  }

}

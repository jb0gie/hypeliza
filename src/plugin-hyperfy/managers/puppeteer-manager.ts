////@ts-nocheck
import path from 'path'
import fs from 'fs'
import { promises as fsPromises } from 'fs';
import puppeteer from 'puppeteer'
import { IAgentRuntime, ModelType } from '@elizaos/core'
import { HyperfyService } from '../service.js'
import * as THREE from 'three';

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

    const STRIP_SLOTS = this.STRIP_SLOTS;
    await this.page.evaluate(async (sceneJson, STRIP_SLOTS) => {
      const loader = new window.THREE.ObjectLoader()
      const loadedScene = loader.parse(sceneJson)

      loadedScene.traverse(obj => {
        if (!obj.isMesh || !obj.material) return;

        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

        mats.forEach(mat => {
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

      window.scene = loadedScene

      if (window.environment) {
        window.scene.environment = window.environment;
        window.scene.background = window.environment;
      }

      // Ensure renderer updates
      window.renderer.render(window.scene, window.camera)
    }, sceneJson, STRIP_SLOTS)
  }
  
  async loadGlbBytes(url: string): Promise<number[]> {
    await this.init();
    const STRIP_SLOTS = this.STRIP_SLOTS;

    return this.page.evaluate(async (url, STRIP_SLOTS) => {
      const loader = new window.THREE.GLTFLoader();
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

      const exporter = new window.THREE.GLTFExporter();
      const buffer = await new Promise<ArrayBuffer>((done) =>
        exporter.parse(gltf.scene, done, { binary: true, embedImages: true })
      );

      // Return a *serialisable* plain array of numbers (0-255)
      return [...new Uint8Array(buffer)];
    }, url, STRIP_SLOTS);
  }

  public async loadEnvironmentHDR(url: string): Promise<void> {
    await this.init();

    const isLocal = !/^https?:\/\//.test(url);
    if (isLocal) {
      const fileBuffer = await fsPromises.readFile(url);
      const base64 = fileBuffer.toString('base64');
      url = `data:image/vnd.radiance;base64,${base64}`;
    }
  
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

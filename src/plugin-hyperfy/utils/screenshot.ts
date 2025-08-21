import * as THREE from 'three';
import { logger } from '@elizaos/core';

/**
 * Lightweight screenshot utility using THREE.js renderer directly
 * Avoids Puppeteer overhead by capturing from the existing WebGL context
 */
export class ScreenshotHelper {
  private world: any;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;

  constructor(world: any) {
    this.world = world;
  }

  private ensureRenderer(): boolean {
    try {
      // Try to get renderer from graphics system (client worlds)
      if (this.world.graphics?.renderer) {
        this.renderer = this.world.graphics.renderer;
        this.scene = this.world.stage?.scene;
        this.camera = this.world.camera;
        return true;
      }

      // For node client worlds, we might need to create our own renderer
      if (!this.renderer && this.world.stage?.scene) {
        logger.info('[Screenshot] Node environment detected - screenshot not available');
        // In Node environment, we can't create a WebGL renderer without a proper canvas
        // The canvas package could be used but it's heavy and often has issues
        // For now, we'll skip screenshot in Node and use text-based perception
        return false;
      }

      return false;
    } catch (error) {
      logger.error('[Screenshot] Failed to setup renderer:', error);
      return false;
    }
  }

  /**
   * Take a screenshot and return as base64
   */
  async captureScreenshot(): Promise<string | null> {
    if (!this.ensureRenderer()) {
      logger.error('[Screenshot] No renderer available');
      return null;
    }

    try {
      // Render the scene
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
        
        // Get canvas data
        const canvas = this.renderer.domElement;
        const dataURL = canvas.toDataURL('image/png');
        
        logger.info('[Screenshot] Captured successfully');
        return dataURL;
      }
    } catch (error) {
      logger.error('[Screenshot] Capture failed:', error);
    }

    return null;
  }

  /**
   * Look at a specific entity and capture
   */
  async captureEntityView(entityId: string): Promise<string | null> {
    if (!this.ensureRenderer()) {
      return null;
    }

    try {
      const entity = this.world.entities?.items?.get(entityId);
      if (!entity) {
        logger.warn(`[Screenshot] Entity ${entityId} not found`);
        return null;
      }

      const targetPos = entity.base?.position || entity.root?.position;
      if (targetPos && this.camera) {
        // Point camera at entity
        this.camera.lookAt(targetPos);
        
        // Capture
        return await this.captureScreenshot();
      }
    } catch (error) {
      logger.error('[Screenshot] Entity view capture failed:', error);
    }

    return null;
  }

  /**
   * Capture a 360 panorama (simplified version)
   */
  async capturePanorama(): Promise<string | null> {
    // For now, just capture current view
    // A full panorama would require multiple renders
    return await this.captureScreenshot();
  }

  /**
   * Clean up resources
   */
  dispose() {
    // If we created our own renderer, dispose it
    if (this.renderer && !this.world.graphics?.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
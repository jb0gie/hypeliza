import { ChannelType, Content, HandlerCallback, IAgentRuntime, Memory, ModelType, composePromptFromState, createUniqueUuid, logger, parseKeyValueXml } from "@elizaos/core";
import { HyperfyService } from "../service";
import { agentActivityLock } from "./guards";
import { uuid } from '../hyperfy/src/core/utils.js'
import { cloneDeep } from 'lodash-es'


export class BuildManager {
  private runtime: IAgentRuntime;
  
  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }
  async translate(entityId, position: [number, number, number]) {
    const service = this.getService();
    const world = service.getWorld();
    const entity = world.entities.items.get(entityId);
    if (entity) {
      const controls = world.controls;
      if (controls) {
        await controls.goto(entity.root.position.x, entity.root.position.z);
      }
      entity.root.position.fromArray(position);
      this.entityUpdate(entity);
    }
  }
  async rotate(entityId, quaternion: [number, number, number, number]) {
    const service = this.getService();
    const world = service.getWorld();
    const entity = world.entities.items.get(entityId);
    if (entity) {
      const controls = world.controls;
      if (controls) {
        await controls.goto(entity.root.position.x, entity.root.position.z);
      }
      entity.root.quaternion.fromArray(quaternion);
      this.entityUpdate(entity);
    }
  }
  
  async scale(entityId, scale: [number, number, number]) {
    const service = this.getService();
    const world = service.getWorld();
    const entity = world.entities.items.get(entityId);
    if (entity) {
      const controls = world.controls;
      if (controls) {
        await controls.goto(entity.root.position.x, entity.root.position.z);
      }
      entity.root.scale.fromArray(scale);
      this.entityUpdate(entity);
    }
  }

  async duplicate(entityId) {
    const service = this.getService();
    const world = service.getWorld();
    const entity = world.entities.items.get(entityId);
    const controls = world.controls;
    if (controls) {
      await controls.goto(entity.root.position.x, entity.root.position.z);
    }
    if (entity?.isApp) {
      let blueprintId = entity.data.blueprint
      // if unique, we also duplicate the blueprint
      if (entity.blueprint.unique) {
        const blueprint = {
          id: uuid(),
          version: 0,
          name: entity.blueprint.name,
          image: entity.blueprint.image,
          author: entity.blueprint.author,
          url: entity.blueprint.url,
          desc: entity.blueprint.desc,
          model: entity.blueprint.model,
          script: entity.blueprint.script,
          props: cloneDeep(entity.blueprint.props),
          preload: entity.blueprint.preload,
          public: entity.blueprint.public,
          locked: entity.blueprint.locked,
          frozen: entity.blueprint.frozen,
          unique: entity.blueprint.unique,
          disabled: entity.blueprint.disabled,
        }
        world.blueprints.add(blueprint, true)
        blueprintId = blueprint.id
      }
      const data = {
        id: uuid(),
        type: 'app',
        blueprint: blueprintId,
        position: entity.root.position.toArray(),
        quaternion: entity.root.quaternion.toArray(),
        scale: entity.root.scale.toArray(),
        mover: null,
        uploader: null,
        pinned: false,
        state: {},
      }
      world.entities.add(data, true)
    }
  }

  async delete(entityId) {
    const service = this.getService();
    const world = service.getWorld();
    const entity = world.entities.items.get(entityId);
    if (entity?.isApp && !entity.data.pinned) {
      const controls = world.controls;
      if (controls) {
        await controls.goto(entity.root.position.x, entity.root.position.z);
      }
      entity?.destroy(true)
      this.entityUpdate(entity);
    }
  }
  
  entityUpdate(entity) {
    const service = this.getService();
    const world = service.getWorld();
    world.network.send('entityModified', {
        id: entity.data.id,
        position: entity.root.position.toArray(),
        quaternion: entity.root.quaternion.toArray(),
        scale: entity.root.scale.toArray(),
    })
  }

  private getService() {
    return this.runtime.getService<HyperfyService>(HyperfyService.serviceType);
  }
}

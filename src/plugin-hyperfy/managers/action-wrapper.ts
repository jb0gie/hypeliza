import * as THREE from '../hyperfy/src/core/extras/three';

export class ActionWrapper {
  private readonly node: any;

  constructor(node: any) {
    this.node = node;
  }

  get id(): string {
    return this.node.ctx?.entity?.data?.id || this.node.uuid || '';
  }

  get entityId(): string {
    return this.node.ctx?.entity?.data?.id || '';
  }

  get name(): string {
    // Return action label if available (what players see), otherwise entity name
    return this.node.ctx?.entity?.data?.label || this.node.ctx?.entity?.data?.name || 'Unknown Action';
  }

  get label(): string {
    return this.node.ctx?.entity?.data?.label || '';
  }

  get scriptName(): string {
    // Extract script/app name if available
    return this.node.ctx?.entity?.data?.script || this.node.ctx?.entity?.data?.app || 'Unknown Script';
  }

  get position() {
    return {
      x: this.node.ctx?.entity?.root?.position?.x || 0,
      y: this.node.ctx?.entity?.root?.position?.y || 0,
      z: this.node.ctx?.entity?.root?.position?.z || 0
    };
  }

  get isInteractable(): boolean {
    return !this.node.finished && typeof this.node._onTrigger === 'function';
  }

  get duration(): number {
    return this.node._duration || 3000;
  }

  get metadata(): Record<string, any> {
    return {
      type: this.node.type,
      finished: this.node.finished,
      hasCancel: typeof this.node._onCancel === 'function',
      ...this.node
    };
  }

  toActionData(distance: number): import('./action-interfaces').ActionData {
    return {
      id: this.id,
      entityId: this.entityId,
      name: this.name,
      label: this.label,
      scriptName: this.scriptName,
      position: this.position,
      distance,
      isInteractable: this.isInteractable,
      metadata: this.metadata
    };
  }
}
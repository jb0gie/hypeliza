import * as THREE from 'three';

// Extend THREE.Vector3 and THREE.Quaternion with PhysX conversion methods
// These are required for Hyperfy physics integration
export function extendThreeForPhysics() {
  // Check if already extended
  if ((THREE.Vector3.prototype as any).toPxVec3) return;

  // Mock PhysX vector classes
  class MockPxVec3 {
    x: number = 0;
    y: number = 0;
    z: number = 0;
  }

  class MockPxExtendedVec3 {
    x: number = 0;
    y: number = 0;
    z: number = 0;
  }

  const _pxVec3 = new MockPxVec3();
  const _pxExtVec3 = new MockPxExtendedVec3();

  // Add toPxVec3 method to THREE.Vector3
  (THREE.Vector3.prototype as any).toPxVec3 = function(pxVec3 = _pxVec3) {
    pxVec3.x = this.x;
    pxVec3.y = this.y;
    pxVec3.z = this.z;
    return pxVec3;
  };

  // Add fromPxVec3 method to THREE.Vector3
  (THREE.Vector3.prototype as any).fromPxVec3 = function(pxVec3: any) {
    this.x = pxVec3.x;
    this.y = pxVec3.y;
    this.z = pxVec3.z;
    return this;
  };

  // Add toPxExtVec3 method to THREE.Vector3
  (THREE.Vector3.prototype as any).toPxExtVec3 = function(pxExtVec3 = _pxExtVec3) {
    pxExtVec3.x = this.x;
    pxExtVec3.y = this.y;
    pxExtVec3.z = this.z;
    return pxExtVec3;
  };

  // Add toPxTransform method to THREE.Vector3
  (THREE.Vector3.prototype as any).toPxTransform = function(pxTransform: any) {
    if (pxTransform && pxTransform.p) {
      pxTransform.p.x = this.x;
      pxTransform.p.y = this.y;
      pxTransform.p.z = this.z;
    }
  };

  // Add toPxTransform method to THREE.Quaternion
  (THREE.Quaternion.prototype as any).toPxTransform = function(pxTransform: any) {
    if (pxTransform && pxTransform.q) {
      pxTransform.q.x = this.x;
      pxTransform.q.y = this.y;
      pxTransform.q.z = this.z;
      pxTransform.q.w = this.w;
    }
  };

  // Add toPxTransform method to THREE.Matrix4
  const pos = new THREE.Vector3();
  const qua = new THREE.Quaternion();
  const sca = new THREE.Vector3();
  
  (THREE.Matrix4.prototype as any).toPxTransform = function(pxTransform: any) {
    this.decompose(pos, qua, sca);
    if (pxTransform && pxTransform.p) {
      pxTransform.p.x = pos.x;
      pxTransform.p.y = pos.y;
      pxTransform.p.z = pos.z;
    }
    if (pxTransform && pxTransform.q) {
      pxTransform.q.x = qua.x;
      pxTransform.q.y = qua.y;
      pxTransform.q.z = qua.z;
      pxTransform.q.w = qua.w;
    }
  };
}
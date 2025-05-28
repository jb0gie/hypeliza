window.snapshotViewToTarget = async function(playerData, targetPosition) {
  const win = window;
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
};
  
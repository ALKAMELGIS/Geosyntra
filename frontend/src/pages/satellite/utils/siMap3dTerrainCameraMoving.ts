/** Shared camera-motion flag — avoids circular imports between DEM protocol and terrain runtime. */
let cameraMoving = false;

export function isSiMap3dTerrainCameraMoving(): boolean {
  return cameraMoving;
}

export function setSiMap3dTerrainCameraMoving(moving: boolean): void {
  cameraMoving = moving;
}

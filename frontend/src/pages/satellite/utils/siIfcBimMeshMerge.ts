export type SiBimMergedMesh = {
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
};

export function createEmptyMeshAccumulator(): { positions: number[]; indices: number[] } {
  return { positions: [], indices: [] };
}

export function appendLocalMesh(
  acc: { positions: number[]; indices: number[] },
  localPositions: Float32Array,
  localIndices: Uint32Array,
): void {
  const vertexBase = acc.positions.length / 3;
  for (let i = 0; i < localPositions.length; i++) acc.positions.push(localPositions[i]!);
  for (let i = 0; i < localIndices.length; i++) acc.indices.push(localIndices[i]! + vertexBase);
}

export function finalizeMeshAccumulator(acc: { positions: number[]; indices: number[] }): SiBimMergedMesh | null {
  if (acc.positions.length < 9 || acc.indices.length < 3) return null;
  return {
    positions: new Float32Array(acc.positions),
    indices: new Uint32Array(acc.indices),
    triangleCount: Math.floor(acc.indices.length / 3),
  };
}

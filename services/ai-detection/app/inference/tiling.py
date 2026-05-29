"""Raster tiling for GPU inference — never process full rasters at once."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

import numpy as np


@dataclass
class TileSpec:
    index: int
    row: int
    col: int
    x0: int
    y0: int
    width: int
    height: int
    pad_left: int
    pad_top: int
    pad_right: int
    pad_bottom: int


def iter_raster_tiles(
    width: int,
    height: int,
    tile_size: int = 512,
    padding: int = 32,
) -> Iterator[TileSpec]:
    stride = max(1, tile_size - padding * 2)
    idx = 0
    row = 0
    for y0 in range(0, height, stride):
        col = 0
        for x0 in range(0, width, stride):
            tw = min(tile_size, width - x0)
            th = min(tile_size, height - y0)
            pad_l = padding if x0 > 0 else 0
            pad_t = padding if y0 > 0 else 0
            pad_r = padding if x0 + tw < width else 0
            pad_b = padding if y0 + th < height else 0
            yield TileSpec(
                index=idx,
                row=row,
                col=col,
                x0=x0,
                y0=y0,
                width=tw,
                height=th,
                pad_left=pad_l,
                pad_top=pad_t,
                pad_right=pad_r,
                pad_bottom=pad_b,
            )
            idx += 1
            col += 1
        row += 1


def count_tiles(width: int, height: int, tile_size: int = 512, padding: int = 32) -> int:
    return sum(1 for _ in iter_raster_tiles(width, height, tile_size, padding))


def synthetic_tile_array(tile: TileSpec, seed: int = 0) -> np.ndarray:
    """Placeholder tile tensor when rasterio source is not wired yet."""
    rng = np.random.default_rng(seed + tile.index)
    return rng.integers(0, 255, (tile.height, tile.width, 3), dtype=np.uint8)

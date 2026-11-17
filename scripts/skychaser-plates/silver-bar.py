"""
The Silver Bar's object, drawn rather than photographed: no free photograph of a
plain silver bar exists that is not a brand's. A bevelled, tapered bar is ray-marched
as a signed distance field and shaded as polished metal, its reflections taken
from the card's own sky (so it mirrors the nebula it floats in front of) and two
soft studio strips that give silver its long white highlights.

  python3 scripts/skychaser-plates/silver-bar.py <out-dir>

Writes <out-dir>/SILVER.png (RGB, black ground) and <out-dir>/SILVER-mask.png.
"""

import sys

import cv2
import numpy as np
from PIL import Image

SKY = 'public/cards/art/M51.webp'
W, H = 1600, 1100


def norm(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def rot(v, ax, ay):
    ca, sa, cb, sb = np.cos(ax), np.sin(ax), np.cos(ay), np.sin(ay)
    x, y, z = v[..., 0], v[..., 1], v[..., 2]
    y, z = y * ca - z * sa, y * sa + z * ca
    x, z = x * cb + z * sb, -x * sb + z * cb
    return np.stack([x, y, z], -1)


# The bar in its own frame: x long, y up, z deep. Tapered: the top face is smaller than the base.
HALF = np.array([1.55, 0.36, 0.72])
TAPER = 0.16
ROUND = 0.07
AX, AY = -0.55, -0.38


def sdf(p):
    q = rot(p, -AX, 0)
    q = rot(q, 0, -AY)
    # taper: shrink x and z with height
    t = 1 - TAPER * (np.clip(q[..., 1] / HALF[1], -1, 1) + 1) / 2
    qq = np.stack([q[..., 0] / t, q[..., 1], q[..., 2] / t], -1)
    d = np.abs(qq) - (HALF - ROUND)
    outside = np.linalg.norm(np.maximum(d, 0), axis=-1)
    inside = np.minimum(np.max(d, axis=-1), 0)
    return (outside + inside - ROUND) * np.minimum(t, 1)


def normal(p):
    e = 1e-3
    n = np.stack([
        sdf(p + [e, 0, 0]) - sdf(p - [e, 0, 0]),
        sdf(p + [0, e, 0]) - sdf(p - [0, e, 0]),
        sdf(p + [0, 0, e]) - sdf(p - [0, 0, e]),
    ], -1)
    return norm(n)


def env(d, sky, sky_blur):
    """What a reflected ray sees: the sky as a backdrop dome, and two long softboxes."""
    u = 0.5 + np.arctan2(d[..., 0], -d[..., 2]) / (2 * np.pi)
    v = 0.5 - np.arcsin(np.clip(d[..., 1], -1, 1)) / np.pi
    sh, sw = sky.shape[:2]
    xi = np.clip((u * sw).astype(int) % sw, 0, sw - 1)
    yi = np.clip((v * sh).astype(int), 0, sh - 1)
    c = sky[yi, xi] * 0.55 + sky_blur[yi, xi] * 0.9
    # A softbox high overhead, a strip from the upper left, a faint warm floor bounce.
    top = np.exp(-((d[..., 1] - 0.92) / 0.10) ** 2) * 1.5
    left = np.exp(-((d[..., 0] + 0.75) / 0.16) ** 2) * np.exp(-((d[..., 1] - 0.35) / 0.35) ** 2) * 2.2
    floor = np.clip(-d[..., 1], 0, 1) * 0.10
    # A broad, graded fill from behind the camera, so faces turned toward us read as metal, not as black.
    front = np.exp(-((d[..., 2] + 1) / 0.55) ** 2) * (0.55 + 0.45 * np.clip(d[..., 1] + 0.5, 0, 1)) * (0.75 + 0.25 * np.sin(d[..., 0] * 7))
    return c + (top + left + front)[..., None] * np.array([1.0, 1.0, 1.02]) + floor[..., None] * np.array([0.9, 0.8, 0.7])


def main():
    out = sys.argv[1]
    sky = np.asarray(Image.open(SKY).convert('RGB').resize((1024, 512))).astype(np.float32) / 255
    sky_blur = cv2.GaussianBlur(sky, (0, 0), 18)

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    f = 2.6
    ro = np.array([0, 0, -6.0], np.float32)
    rd = norm(np.stack([(xx - W / 2) / (H / 2) / f, -(yy - H / 2) / (H / 2) / f, np.ones_like(xx)], -1))
    t = np.zeros((H, W), np.float32)
    hit = np.zeros((H, W), bool)
    for _ in range(96):
        p = ro + rd * t[..., None]
        d = sdf(p)
        hit |= d < 1e-3
        t = np.where(hit, t, t + d * 0.9)
    p = ro + rd * t[..., None]
    n = normal(p)

    # Hammered, slightly brushed surface: a little noise in the normal.
    rng = np.random.default_rng(7)
    grain = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 1.2)
    streak = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), sigmaX=14, sigmaY=0.8)
    n = norm(n + (grain * 0.025 + streak * 0.05)[..., None] * np.array([0.6, 0.3, 0.6]))

    r = rd - 2 * np.sum(rd * n, -1, keepdims=True) * n
    fres = 0.92 + 0.08 * (1 - np.clip(-np.sum(rd * n, -1), 0, 1)) ** 5
    silver = np.array([0.97, 0.96, 0.94])
    col = env(r, sky, sky_blur) * silver * fres[..., None]
    # Edges catch less light: a touch of ambient occlusion from how close the bevel is.
    ao = np.clip(sdf(p + n * 0.08) / 0.08, 0.55, 1)
    col *= ao[..., None]
    col = col / (1 + col * 0.35)
    col = np.where(hit[..., None], col, 0)

    mask = cv2.GaussianBlur(hit.astype(np.float32), (0, 0), 0.8)
    Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).save(f'{out}/SILVER.png')
    Image.fromarray((mask * 255).astype(np.uint8)).save(f'{out}/SILVER-mask.png')
    print('silver bar', hit.mean())


if __name__ == '__main__':
    main()

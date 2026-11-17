"""
Card art for the Telescopes and the Treasures (Nos. 108-124), with no image
generator: each object is cut out of a real photograph (Astroman's own product
shots; freely licensed specimen photos for the stones, credited in photos.json)
and lit into a painted sky from one of the set's own cards.

  python3 scripts/skychaser-plates/vault.py <src-dir> <mask-dir> [DESIGNATION ...]

<src-dir>/<NAME>.{jpg,png,webp} is the photo and <mask-dir>/<NAME>.png its alpha:
ISNet general-use (vault-masks/seg.js, onnxruntime-node 1.20 for Intel Macs), then
vault-masks/refine.py (backdrop flood fill; 'circle' for the bronze mirror and the
round sapphire). The moonstone's matte was finished by hand with GrabCut, and the
silver bar is drawn, not photographed (silver-bar.py). Telescope sources are the
Astroman product shots <product id>_0; stone sources and credits are in photos.json. Writes
public/cards/art/<DESIGNATION>.webp at 880x1168, the size of every other card's art.
Needs numpy, Pillow, opencv-python, scipy.
"""

import glob
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 880, 1168
ART = 'public/cards/art'

# kind, source photo, backdrop card, accent (rim light), placement. The backdrop is picked to
# contrast with the object's own colour (blue behind gold, red behind emerald) so it never blends.
#   telescope: x = centre, top = top edge, height = whole instrument / card height
#   stone: centre (x, y) and width as fractions of the card
CARDS = {
    'FORESEEN-70':      dict(kind='scope', src='8546_0',  bg='M8',         accent='#ffc6a0', x=0.50, top=0.095, height=1.0),
    'BRESSER-VENUS':    dict(kind='scope', src='13403_0', bg='M42',        accent='#ff9fd0', x=0.50, top=0.095, height=0.98),
    'NATGEO-90':        dict(kind='scope', src='10335_0', bg='M16',        accent='#ffcf8a', x=0.50, top=0.11, height=0.95),
    'ASTROMASTER-114':  dict(kind='scope', src='14109_0', bg='M31',        accent='#b9ccff', x=0.50, top=0.095, height=0.95),
    'NEXSTAR-90':       dict(kind='scope', src='12908_0', bg='ROSETTE',    accent='#ff8a7a', x=0.50, top=0.095, height=1.0),
    'NEXSTAR-6':        dict(kind='scope', src='14117_0', bg='SATURN',     accent='#ffd9a0', x=0.50, top=0.095, height=0.98),
    'BRONZE-MIRROR':    dict(kind='stone', src='BRONZE',       bg='MILKY-WAY', accent='#ffae6a', x=0.5, y=0.38, w=0.66),
    'MOUNTAIN-CRYSTAL': dict(kind='stone', src='ROCK-CRYSTAL', bg='TARANTULA', accent='#a8e8ff', x=0.5, y=0.37, w=0.54),
    'MOONSTONE':        dict(kind='stone', src='MOONSTONE',    bg='M20',       accent='#b7d2ff', x=0.5, y=0.38, w=0.62, lift=True),
    'SILVER-BAR':       dict(kind='stone', src='SILVER',       bg='VEIL',      accent='#dfe8ff', x=0.5, y=0.40, w=0.76),
    'AMETHYST':         dict(kind='stone', src='AMETHYST',     bg='M16',       accent='#c79bff', x=0.5, y=0.37, w=0.66),
    'RUBY':             dict(kind='stone', src='RUBY',         bg='RIGEL',     accent='#ff5a78', x=0.5, y=0.37, w=0.58),
    'SAPPHIRE':         dict(kind='stone', src='SAPPHIRE',     bg='ANTARES',   accent='#6f9bff', x=0.5, y=0.38, w=0.58),
    'MOLDAVITE':        dict(kind='stone', src='MOLDAVITE',    bg='M42',       accent='#a6f07a', x=0.5, y=0.37, w=0.64),
    'EMERALD':          dict(kind='stone', src='EMERALD',      bg='ROSETTE',   accent='#4dffb0', x=0.5, y=0.37, w=0.56),
    'GOLD-NUGGET':      dict(kind='stone', src='GOLD',         bg='M45',       accent='#ffcc55', x=0.5, y=0.38, w=0.70),
    'DIAMOND':          dict(kind='stone', src='DIAMOND',      bg='M101',      accent='#e6f4ff', x=0.5, y=0.39, w=0.66),
}

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


def load_rgb(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255


def backdrop(name):
    """The sky, thrown out of focus and pushed far back: a dark, quiet field the object sits in front of.
    Returns it and its light colour (for the backlight, so the halo is the sky's hue, not the object's)."""
    bg = cv2.resize(load_rgb(f'{ART}/{name}.webp'), (W, H), interpolation=cv2.INTER_AREA)
    bg = cv2.GaussianBlur(bg, (0, 0), 6)
    lum = bg.mean(-1, keepdims=True)
    bg = lum + (bg - lum) * 1.15
    tint = (bg * lum).sum((0, 1)) / lum.sum()
    tint = tint / tint.max()
    r = np.hypot((XX - W / 2) / (W * 0.60), (YY - H * 0.40) / (H * 0.58))
    vignette = np.clip(1.08 - r * 0.85, 0.06, 1)[..., None] ** 1.5
    return np.clip(bg, 0, 1) * 0.40 * vignette, tint


def stars(seed):
    """Sharp stars in front of the soft sky: keeps it space, and in focus where the object is."""
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32)
    n = 260
    xs, ys = rng.integers(0, W, n), rng.integers(0, H, n)
    out[ys, xs] = rng.pareto(2.2, n).astype(np.float32) * 0.5 + 0.15
    out = cv2.GaussianBlur(out, (0, 0), 0.7) * 6
    big = np.zeros_like(out)
    k = rng.integers(0, n, 14)
    big[ys[k], xs[k]] = 1
    out += cv2.GaussianBlur(big, (0, 0), 2.2) * 9
    return np.clip(out, 0, 1)[..., None] * np.array([0.9, 0.95, 1.0], np.float32) * 0.55


def clean_mask(mask, keep_largest):
    a = mask.copy()
    a[a < 0.04] = 0
    if keep_largest:
        lab, n = ndimage.label(a > 0.5)
        if n > 1:
            sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
            big = 1 + int(np.argmax(sizes))
            keep = ndimage.binary_dilation(lab == big, iterations=6)
            a = a * keep
    return a


def cutout(src, mask_dir, src_dir, keep_largest=True):
    path = [p for p in glob.glob(f'{src_dir}/{src}.*') if not p.endswith('.json')][0]
    rgb = load_rgb(path)
    m = np.asarray(Image.open(f'{mask_dir}/{src}.png').convert('L')).astype(np.float32) / 255
    m = clean_mask(m, keep_largest)
    # The photo's own background colour (studio white, a black cloth), to unmix from the soft edge.
    paper = np.median(rgb[m < 0.03], axis=0)
    ys, xs = np.nonzero(m > 0.1)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, m = rgb[y0:y1, x0:x1], m[y0:y1, x0:x1]
    a = np.clip(m, 1e-3, 1)[..., None]
    rgb = np.clip((rgb - (1 - a) * paper) / a, 0, 1)
    # Choke the edge a little: what the matte half-keeps is mostly background.
    m = np.clip((m - 0.12) / 0.88, 0, 1)
    return rgb, m


def scale(rgb, m, s):
    up = cv2.INTER_CUBIC if s > 1 else cv2.INTER_AREA
    return np.clip(cv2.resize(rgb, None, fx=s, fy=s, interpolation=up), 0, 1), np.clip(cv2.resize(m, None, fx=s, fy=s, interpolation=cv2.INTER_LINEAR), 0, 1)


def place(rgb, m, x, y):
    """The object on an empty card-sized layer, its top-left at integer (x, y), clipped to the card."""
    layer, alpha = np.zeros((H, W, 3), np.float32), np.zeros((H, W), np.float32)
    h, w = m.shape
    cx0, cy0, cx1, cy1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if cx1 > cx0 and cy1 > cy0:
        layer[cy0:cy1, cx0:cx1] = rgb[cy0 - y:cy1 - y, cx0 - x:cx1 - x]
        alpha[cy0:cy1, cx0:cx1] = m[cy0 - y:cy1 - y, cx0 - x:cx1 - x]
    return layer, alpha


def enhance(rgb, m, sat):
    """Hero grade: full tonal range inside the object, local contrast (clarity), a little more colour."""
    lum = rgb.mean(-1)
    lo, hi = np.percentile(lum[m > 0.5], [0.5, 99.7])
    rgb = np.clip((rgb - lo) / max(hi - lo, 1e-3), 0, 1.05)
    blur = cv2.GaussianBlur(rgb, (0, 0), max(3.0, m.shape[1] * 0.025))
    rgb = rgb + (rgb - blur) * 0.4
    fine = cv2.GaussianBlur(rgb, (0, 0), 1.0)
    rgb = rgb + (rgb - fine) * 0.5
    l = rgb.mean(-1, keepdims=True)
    return np.clip(l + (rgb - l) * sat, 0, 1)


def rim(alpha, direction, width, color, strength, soft=0.5):
    """Light wrapping round the edge that faces `direction` (dx, dy, pointing toward the light)."""
    dx, dy = direction
    shifted = ndimage.shift(alpha, (dy * width, dx * width), order=1, mode='constant')
    edge = np.clip(alpha - shifted, 0, 1)
    edge = cv2.GaussianBlur(edge, (0, 0), max(0.6, width * soft))
    return edge[..., None] * color * strength


def glow(cx, cy, rx, ry, color, strength):
    d = ((XX - cx) / rx) ** 2 + ((YY - cy) / ry) ** 2
    return np.exp(-d * 1.6)[..., None] * color * strength


def spotlight(cx, top_y, bottom_y, spread, strength):
    """A soft cone of light from above the card, falling on the object."""
    t = np.clip((YY - top_y) / max(bottom_y - top_y, 1), 0, 1.4)
    half = spread * (0.25 + t)
    cone = np.exp(-((XX - cx) / half) ** 2) * (0.35 + 0.65 * t) * np.exp(-np.maximum(t - 1, 0) * 4)
    return cone[..., None] * np.array([1.0, 0.98, 0.95], np.float32) * strength


def separate(canvas, alpha, sigma, strength):
    """Darken the sky in a band round the silhouette, so the edge stands out against it."""
    halo = cv2.GaussianBlur(alpha, (0, 0), sigma)
    halo = np.clip(halo * 1.8, 0, 1) * (1 - alpha)
    return canvas * (1 - halo * strength)[..., None]


def flare(canvas, x, y, size, color, strength):
    """A four-pointed glint, where light catches a facet."""
    dx, dy = np.abs(XX - x), np.abs(YY - y)
    core = np.exp(-(dx ** 2 + dy ** 2) / (2 * (size * 0.06) ** 2))
    rays = np.exp(-dy / (size * 0.008)) * np.exp(-dx / (size * 0.22)) + np.exp(-dx / (size * 0.008)) * np.exp(-dy / (size * 0.22))
    halo = np.exp(-(dx ** 2 + dy ** 2) / (2 * (size * 0.25) ** 2)) * 0.2
    return canvas + (core + rays * 0.6 + halo)[..., None] * color * strength


def finish(canvas, seed):
    rng = np.random.default_rng(seed)
    out = canvas + rng.normal(0, 0.006, canvas.shape).astype(np.float32)
    # A gentle highlight roll-off instead of a hard clip.
    out = 1 - np.exp(-np.maximum(out, 0) * 1.25)
    out = out / (1 - np.exp(-1.25))
    blur = cv2.GaussianBlur(out, (0, 0), 1.0)
    out = np.clip(out + (out - blur) * 0.35, 0, 1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8))


def composite(canvas, layer, alpha, acc, w):
    """The object over the sky, then two rim lights: a crisp white key from the top left and the
    card's accent from behind on the right, each with a little bloom."""
    a3 = alpha[..., None]
    canvas = canvas * (1 - a3) + layer * a3
    white = np.array([1.0, 0.98, 0.95], np.float32)
    k = max(2.0, w * 0.006)
    canvas += rim(alpha, (-0.7, -0.7), k, white, 0.38, 0.35)
    canvas += rim(alpha, (0.85, -0.35), k * 1.3, acc, 0.6, 0.35)
    canvas += cv2.GaussianBlur(rim(alpha, (0.85, -0.35), k * 1.3, acc, 1.0), (0, 0), k * 3) * 0.35
    return canvas


def telescope(des, c, src_dir, mask_dir):
    acc = hexrgb(c['accent'])
    canvas, tint = backdrop(c['bg'])
    canvas += stars(sum(des.encode()))
    rgb, m = cutout(c['src'], mask_dir, src_dir)
    rgb, m = scale(rgb, m, min(c['height'] * H / m.shape[0], 0.88 * W / m.shape[1]))
    h, w = m.shape
    x0, y0 = int(c['x'] * W - w / 2), int(c['top'] * H)
    head_y = y0 + h * 0.28

    # Ground: a dark plain under a thin lit horizon, and a pool of light where the tripod stands.
    horizon = H * 0.80
    ground = np.clip((YY - horizon) / (H * 0.10), 0, 1)[..., None]
    canvas = canvas * (1 - ground * 0.9)
    canvas += np.exp(-((YY - horizon) / (H * 0.012)) ** 2)[..., None] * tint * 0.10

    # Backlight: a broad bright field behind the optical tube in the sky's own colour, so a black
    # tube reads as a silhouette against light and a white one against colour.
    canvas += glow(c['x'] * W, head_y, W * 0.50, H * 0.26, tint * 0.8 + 0.2, 0.34)
    canvas += spotlight(c['x'] * W, -H * 0.1, head_y + h * 0.1, W * 0.22, 0.10)

    body = enhance(rgb, m, 1.12)
    # The legs fall away into the dark below the mount; the tube and mount stay in full light.
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    body = body * (1 - 0.55 * np.clip((t - 0.55) / 0.45, 0, 1))
    layer, alpha = place(body, m, x0, y0)
    # A dark ring only helps a light object; a black tube is set off by the backlight instead.
    bright = float(body.mean(-1)[m > 0.5].mean())
    canvas = separate(canvas, alpha, max(6.0, w * 0.02), 0.5 if bright > 0.4 else 0.15)
    canvas *= 1 - glow(c['x'] * W, min(H - 1, y0 + h), w * 0.5, H * 0.02, np.ones(3, np.float32), 0.7)
    canvas = composite(canvas, layer, alpha, acc, w)
    return finish(canvas, sum(des.encode()))


def stone(des, c, src_dir, mask_dir):
    acc = hexrgb(c['accent'])
    canvas, tint = backdrop(c['bg'])
    canvas += stars(sum(des.encode()))
    rgb, m = cutout(c['src'], mask_dir, src_dir)
    if c.get('lift'):
        # A translucent stone shot against black reads as holes where it is in shadow: lift those to milk.
        lum = rgb.mean(-1, keepdims=True)
        rgb = rgb + (acc * 0.5 - rgb) * np.clip(1 - lum / 0.3, 0, 1) * 0.75
    s = (c['w'] * W) / m.shape[1]
    if m.shape[0] * s > H * 0.46:
        s = H * 0.46 / m.shape[0]
    rgb, m = scale(rgb, m, s)
    h, w = m.shape
    cx, cy = c['x'] * W, c['y'] * H
    x0, y0 = int(cx - w / 2), int(cy - h / 2)

    # A display floor: the curved, glossy dark limb of a world, lit along its edge, the object resting
    # just above it and mirrored in it.
    floor_y = y0 + h + H * 0.035
    R = W * 3.2
    d = np.hypot(XX - W / 2, YY - (floor_y + R)) - R
    below = np.clip(-d / 4, 0, 1)[..., None]
    canvas = canvas * (1 - below * 0.95)
    canvas += np.exp(-(d / 2.2) ** 2)[..., None] * (tint * 0.6 + 0.4) * 0.5
    canvas += np.exp(-np.maximum(d, 0) / 30)[..., None] * (d > 0)[..., None] * tint * 0.10

    # Backlight in the sky's colour (a contrast to the stone's), a spotlight from above, a pool on the floor.
    canvas += glow(cx, cy, w * 0.85, h * 0.85, tint * 0.85 + 0.15, 0.34)
    canvas += glow(cx, cy, w * 1.8, h * 1.8, tint, 0.07)
    canvas += spotlight(cx, -H * 0.05, cy, w * 0.3, 0.06)
    canvas += glow(cx, floor_y + 4, w * 0.6, H * 0.018, tint * 0.5 + 0.5, 0.30) * below

    body = enhance(rgb, m, 1.18)
    layer, alpha = place(body, m, x0, y0)

    # Its reflection in the floor, fading with depth.
    refl, ra = np.zeros_like(layer), np.zeros_like(alpha)
    top = int(floor_y)
    span = min(H - top, int(h * 0.7))
    src_rows = np.clip(2 * top - np.arange(top, top + span), 0, H - 1)
    refl[top:top + span] = layer[src_rows]
    ra[top:top + span] = alpha[src_rows]
    fade = np.exp(-np.clip(YY - top, 0, None) / (h * 0.2)) * 0.38
    ra = cv2.GaussianBlur(ra * fade, (0, 0), 1.5) * below[..., 0]
    refl = cv2.GaussianBlur(refl, (0, 0), 1.5)
    canvas = canvas * (1 - ra[..., None]) + refl * ra[..., None]

    canvas = separate(canvas, alpha, max(8.0, w * 0.035), 0.55)
    canvas = composite(canvas, layer, alpha, acc, w)

    # Glints on the brightest facets, two at most.
    lum = layer.mean(-1) * alpha
    pts = []
    work = cv2.GaussianBlur(lum, (0, 0), 3)
    for _ in range(2):
        y, x = np.unravel_index(np.argmax(work), work.shape)
        if work[y, x] < 0.7:
            break
        pts.append((x, y))
        cv2.circle(work, (int(x), int(y)), int(w * 0.2), 0, -1)
    for i, (x, y) in enumerate(pts):
        canvas = flare(canvas, x, y, w * (0.5 if i == 0 else 0.3), np.ones(3, np.float32) * 0.7 + acc * 0.3, 0.5 if i == 0 else 0.3)
    return finish(canvas, sum(des.encode()))


def main():
    src_dir, mask_dir, *only = sys.argv[1:]
    for des, c in CARDS.items():
        if only and des not in only:
            continue
        img = (telescope if c['kind'] == 'scope' else stone)(des, c, src_dir, mask_dir)
        out = f'{ART}/{des}.webp'
        img.save(out, 'WEBP', quality=90, method=6)
        print(des, os.path.getsize(out))


if __name__ == '__main__':
    main()

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

# kind, source photo, backdrop card, accent (rim + glow), placement
#   telescope: head = (x, y) of the scope's top centre as a fraction of the card, height = scope height / card height
#   stone: centre (x, y) and width as fractions of the card
CARDS = {
    'FORESEEN-70':      dict(kind='scope', src='8546_0',  bg='M8',        accent='#ffc6a0', x=0.50, top=0.07, height=1.40),
    'BRESSER-VENUS':    dict(kind='scope', src='13403_0', bg='M42',       accent='#ff9fd0', x=0.47, top=0.05, height=1.35),
    'NATGEO-90':        dict(kind='scope', src='10335_0', bg='M16',       accent='#ffcf8a', x=0.50, top=0.10, height=1.32, maxw=0.98),
    'ASTROMASTER-114':  dict(kind='scope', src='14109_0', bg='M31',       accent='#b9ccff', x=0.53, top=0.06, height=1.25, maxw=1.0),
    'NEXSTAR-90':       dict(kind='scope', src='12908_0', bg='ROSETTE',   accent='#ff8a7a', x=0.50, top=0.06, height=1.38),
    'NEXSTAR-6':        dict(kind='scope', src='14117_0', bg='SATURN',    accent='#ffd9a0', x=0.50, top=0.05, height=1.30),
    'BRONZE-MIRROR':    dict(kind='stone', src='BRONZE',       bg='BETELGEUSE',    accent='#ffae6a', x=0.5, y=0.40, w=0.70),
    'MOUNTAIN-CRYSTAL': dict(kind='stone', src='ROCK-CRYSTAL', bg='HELIX',         accent='#a8e8ff', x=0.5, y=0.40, w=0.56),
    'MOONSTONE':        dict(kind='stone', src='MOONSTONE',    bg='MOON',          accent='#b7d2ff', x=0.5, y=0.42, w=0.66, lift=True),
    'SILVER-BAR':     dict(kind='stone', src='SILVER',       bg='M51',           accent='#dfe8ff', x=0.5, y=0.42, w=0.74),
    'AMETHYST':         dict(kind='stone', src='AMETHYST',     bg='TARANTULA',     accent='#c79bff', x=0.5, y=0.40, w=0.70),
    'RUBY':             dict(kind='stone', src='RUBY',         bg='ANTARES',       accent='#ff5a78', x=0.5, y=0.40, w=0.60),
    'SAPPHIRE':         dict(kind='stone', src='SAPPHIRE',     bg='M45',           accent='#6f9bff', x=0.5, y=0.41, w=0.60),
    'MOLDAVITE':        dict(kind='stone', src='MOLDAVITE',    bg='CHICXULUB',     accent='#a6f07a', x=0.5, y=0.38, w=0.66),
    'EMERALD':          dict(kind='stone', src='EMERALD',      bg='AURORA',        accent='#4dffb0', x=0.5, y=0.40, w=0.58),
    'GOLD-NUGGET':      dict(kind='stone', src='GOLD',         bg='SUN',           accent='#ffcc55', x=0.5, y=0.42, w=0.74),
    'DIAMOND':          dict(kind='stone', src='DIAMOND',      bg='TOTAL-ECLIPSE', accent='#e6f4ff', x=0.5, y=0.44, w=0.70),
}


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


def load_rgb(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255


def backdrop(name, dim):
    """The sky: a card's own painted art, pushed back so the object reads in front of it."""
    bg = load_rgb(f'{ART}/{name}.webp')
    bg = cv2.resize(bg, (W, H), interpolation=cv2.INTER_AREA)
    bg = cv2.GaussianBlur(bg, (0, 0), 2.2)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot((xx - W / 2) / (W * 0.62), (yy - H * 0.42) / (H * 0.62))
    vignette = np.clip(1.15 - r * 0.75, 0.25, 1)[..., None]
    return bg * dim * vignette


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


def place(canvas, alpha_canvas, rgb, m, x, y):
    """Paste rgb/m with its top-left at integer (x, y), clipped to the card."""
    h, w = m.shape
    cx0, cy0 = max(0, x), max(0, y)
    cx1, cy1 = min(W, x + w), min(H, y + h)
    if cx1 <= cx0 or cy1 <= cy0:
        return
    sx0, sy0 = cx0 - x, cy0 - y
    sub_rgb = rgb[sy0:sy0 + cy1 - cy0, sx0:sx0 + cx1 - cx0]
    sub_a = m[sy0:sy0 + cy1 - cy0, sx0:sx0 + cx1 - cx0][..., None]
    canvas[cy0:cy1, cx0:cx1] = canvas[cy0:cy1, cx0:cx1] * (1 - sub_a) + sub_rgb * sub_a
    alpha_canvas[cy0:cy1, cx0:cx1] = np.maximum(alpha_canvas[cy0:cy1, cx0:cx1], sub_a[..., 0])


def rim(alpha, direction, width, color, strength):
    """Light wrapping round the edge that faces `direction` (dx, dy, pointing toward the light)."""
    dx, dy = direction
    shifted = ndimage.shift(alpha, (dy * width, dx * width), order=1, mode='constant')
    edge = np.clip(alpha - shifted, 0, 1)
    edge = cv2.GaussianBlur(edge, (0, 0), max(1.0, width * 0.35))
    return edge[..., None] * color * strength


def glow(shape, cx, cy, rx, ry, color, strength):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    return np.exp(-d * 1.6)[..., None] * color * strength


def grade(rgb, accent, keep):
    """Studio light to night light: lower, a touch cooler, tinted by the sky, contrast kept."""
    lum = rgb.mean(-1, keepdims=True)
    out = rgb * keep
    out = out * (1 - 0.14) + lum * keep * accent * 0.14
    return np.clip((out - 0.5 * keep) * 1.12 + 0.5 * keep, 0, 1)


def flare(canvas, x, y, size, color, strength):
    """A four-pointed glint, where light catches a facet."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx, dy = np.abs(xx - x), np.abs(yy - y)
    core = np.exp(-(dx ** 2 + dy ** 2) / (2 * (size * 0.08) ** 2))
    rays = np.exp(-dy / (size * 0.010)) * np.exp(-dx / (size * 0.28)) + np.exp(-dx / (size * 0.010)) * np.exp(-dy / (size * 0.28))
    halo = np.exp(-(dx ** 2 + dy ** 2) / (2 * (size * 0.3) ** 2)) * 0.25
    return canvas + (core + rays * 0.6 + halo)[..., None] * color * strength


def finish(canvas, seed):
    rng = np.random.default_rng(seed)
    out = canvas + rng.normal(0, 0.008, canvas.shape).astype(np.float32)
    # A gentle highlight roll-off instead of a hard clip.
    out = 1 - np.exp(-np.maximum(out, 0) * 1.35)
    out = out / (1 - np.exp(-1.35))
    blur = cv2.GaussianBlur(out, (0, 0), 1.2)
    out = np.clip(out + (out - blur) * 0.45, 0, 1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8))


def telescope(des, c, src_dir, mask_dir):
    acc = hexrgb(c['accent'])
    canvas = backdrop(c['bg'], 0.62)
    rgb, m = cutout(c['src'], mask_dir, src_dir)
    s = min((c['height'] * H) / m.shape[0], c.get('maxw', 1.04) * W / m.shape[1])
    rgb = cv2.resize(rgb, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC if s > 1 else cv2.INTER_AREA)
    m = np.clip(cv2.resize(m, None, fx=s, fy=s, interpolation=cv2.INTER_LINEAR), 0, 1)
    h, w = m.shape
    x0, y0 = int(c['x'] * W - w / 2), int(c['top'] * H)

    # The ground: night falls into a dark plain with a lit horizon behind the tripod.
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32)
    horizon = H * 0.78
    ground = np.clip((yy - horizon) / (H * 0.18), 0, 1)[..., None]
    canvas = canvas * (1 - ground * 0.93)
    canvas += np.exp(-((yy - horizon) / (H * 0.05)) ** 2)[..., None] * acc * 0.06

    # Light the sky right behind the instrument so it stands out against it.
    canvas += glow((H, W), c['x'] * W, (c['top'] + 0.22) * H, W * 0.42, H * 0.30, acc, 0.20)

    body = grade(rgb, acc, 0.80)
    # Lit from above: the legs fall away into the dark.
    fall = np.linspace(1.0, 0.0, body.shape[0], dtype=np.float32)[:, None, None]
    body = body * (0.35 + 0.65 * np.clip(fall * 1.6 - 0.25, 0, 1))
    full_a = np.zeros((H, W), np.float32)
    layer = np.zeros((H, W, 3), np.float32)
    place(layer, full_a, body, m, x0, y0)

    # Contact shadow where the feet meet the plain.
    feet_y = min(H - 1, y0 + h)
    canvas *= 1 - glow((H, W), c['x'] * W, feet_y, w * 0.55, H * 0.025, np.ones(3, np.float32), 0.75)

    a3 = full_a[..., None]
    canvas = canvas * (1 - a3) + layer * a3
    canvas += rim(full_a, (-0.7, -0.7), 5, acc, 0.7)
    canvas += rim(full_a, (0.9, -0.2), 3, np.array([0.75, 0.85, 1.0], np.float32), 0.18)
    bloom = cv2.GaussianBlur(rim(full_a, (-0.7, -0.7), 5, acc, 1.0), (0, 0), 9)
    canvas += bloom * 0.6
    return finish(canvas, hash(des) & 0xFFFF)


def stone(des, c, src_dir, mask_dir):
    acc = hexrgb(c['accent'])
    canvas = backdrop(c['bg'], 0.55)
    rgb, m = cutout(c['src'], mask_dir, src_dir)
    if c.get('lift'):
        # A translucent stone shot against black reads as holes where it is in shadow: lift those to milk.
        lum = rgb.mean(-1, keepdims=True)
        rgb = rgb + (acc * 0.5 - rgb) * np.clip(1 - lum / 0.3, 0, 1) * 0.75
    s = (c['w'] * W) / m.shape[1]
    if m.shape[0] * s > H * 0.6:
        s = H * 0.6 / m.shape[0]
    rgb = cv2.resize(rgb, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC if s > 1 else cv2.INTER_AREA)
    m = np.clip(cv2.resize(m, None, fx=s, fy=s, interpolation=cv2.INTER_LINEAR), 0, 1)
    h, w = m.shape
    cx, cy = c['x'] * W, c['y'] * H
    x0, y0 = int(cx - w / 2), int(cy - h / 2)

    # A world's limb below, as on the meteorite cards: a dark planet with a thin lit rim.
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    R = W * 1.9
    pcx, pcy = W * 0.5, H * 0.80 + R
    d = np.hypot(xx - pcx, yy - pcy) - R
    planet = np.clip(-d / 6, 0, 1)[..., None]
    canvas = canvas * (1 - planet * 0.94) + planet * acc * 0.025
    canvas += (np.exp(-(d / 3.5) ** 2) * 0.85 + np.exp(-(np.maximum(d, 0) / 40)) * 0.18 * (d > 0))[..., None] * acc
    canvas += np.exp(-(np.maximum(-d, 0) / 90))[..., None] * planet * acc * 0.10

    # A halo of the stone's own colour behind it, and light falling from the top left.
    canvas += glow((H, W), cx, cy, w * 0.85, h * 0.85, acc, 0.42)
    canvas += glow((H, W), cx, cy, w * 1.6, h * 1.6, acc, 0.12)

    body = grade(rgb, acc, 0.85)
    full_a = np.zeros((H, W), np.float32)
    layer = np.zeros((H, W, 3), np.float32)
    place(layer, full_a, body, m, x0, y0)
    a3 = full_a[..., None]
    canvas = canvas * (1 - a3) + layer * a3
    canvas += rim(full_a, (-0.6, -0.8), 6, acc, 0.9)
    canvas += cv2.GaussianBlur(rim(full_a, (-0.6, -0.8), 6, acc, 1.0), (0, 0), 14) * 0.9

    # Glints on the brightest facets, a few at most.
    lum = (layer.mean(-1) * full_a)
    pts = []
    work = cv2.GaussianBlur(lum, (0, 0), 3)
    for _ in range(2):
        y, x = np.unravel_index(np.argmax(work), work.shape)
        if work[y, x] < 0.6:
            break
        pts.append((x, y))
        cv2.circle(work, (int(x), int(y)), int(w * 0.18), 0, -1)
    for i, (x, y) in enumerate(pts):
        canvas = flare(canvas, x, y, w * (0.55 if i == 0 else 0.32), np.array([1, 1, 1], np.float32) * 0.6 + acc * 0.4, 0.55 if i == 0 else 0.35)
    return finish(canvas, hash(des) & 0xFFFF)


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

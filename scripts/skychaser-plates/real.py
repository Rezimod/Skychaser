"""
Card art from the real photographs in public/cards/photo/ (credits in src/lib/skychaser/photos.json).
Three ways to set a photo on a card, all on quiet black so nothing competes with the object:

  studio  the object cut out (masks in real-masks/) and lit on a plain dark studio sweep with a
          floor and its reflection: telescopes, gems, metals, meteorites
  globe   an object already alone on black (a planet, a moon, an eclipse): framed whole, centred
  field   a picture that fills the frame (a nebula, a galaxy, a landscape): cropped to the card

Cards not listed here keep their painted scene. Writes public/cards/art/<DESIGNATION>.webp at
880x1168. The object stays in the card's clear window (about 0.12-0.74 of the height): the name
is set over the bottom of the art.

  python3 scripts/skychaser-plates/real.py [DESIGNATION ...]

Masks: ISNet general-use (vault-masks/seg.js), then vault-masks/refine.py (flood fill; 'circle' for
the bronze mirror and the sapphire). The silver bar is drawn (silver-bar.py writes SILVER.png and its
mask into real-masks/). Needs numpy, Pillow, opencv-python, scipy.
"""

import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 880, 1168
ART = 'public/cards/art'
PHOTO = 'public/cards/photo'
MASKS = os.path.join(os.path.dirname(__file__), 'real-masks')

# studio: x centre; top + height (instruments, standing on the floor) or cy + w (objects resting on it)
# globe:  w = object width / card width, cy = its centre; pad = how far the frame runs past the object
# field:  fx, fy = focus in the photo (0-1), zoom > 1 crops in
SCOPE = dict(kind='studio', stand=True, top=0.13, height=0.61)
CARDS = {
    'FORESEEN-70':      SCOPE,
    'BRESSER-VENUS':    SCOPE,
    'NATGEO-90':        SCOPE,
    'ASTROMASTER-114':  SCOPE,
    'NEXSTAR-90':       SCOPE,
    'NEXSTAR-6':        SCOPE,
    'BRONZE-MIRROR':    dict(kind='studio', w=0.70, cy=0.43),
    'MOUNTAIN-CRYSTAL': dict(kind='studio', w=0.52, cy=0.43),
    'MOONSTONE':        dict(kind='studio', w=0.62, cy=0.44),
    'SILVER-BAR':       dict(kind='studio', w=0.80, cy=0.46, src='SILVER'),
    'AMETHYST':         dict(kind='studio', w=0.72, cy=0.43),
    'RUBY':             dict(kind='studio', w=0.62, cy=0.43),
    'SAPPHIRE':         dict(kind='studio', w=0.58, cy=0.44),
    'MOLDAVITE':        dict(kind='studio', w=0.72, cy=0.44),
    'EMERALD':          dict(kind='studio', w=0.62, cy=0.43),
    'GOLD-NUGGET':      dict(kind='studio', w=0.72, cy=0.44),
    'DIAMOND':          dict(kind='studio', w=0.74, cy=0.45),
    'ALLENDE':          dict(kind='studio', w=0.70, cy=0.44),
    'CAMPO-DEL-CIELO':  dict(kind='studio', w=0.76, cy=0.45),
    'CANYON-DIABLO':    dict(kind='studio', w=0.72, cy=0.44),
    'GIBEON':           dict(kind='studio', w=0.78, cy=0.44),
    'MUONIONALUSTA':    dict(kind='studio', w=0.80, cy=0.44),
    'LUNAR-FRAGMENT':   dict(kind='studio', w=0.74, cy=0.44),
    'SPUTNIK-1':        dict(kind='studio', w=0.84, cy=0.43, floor=False),
    'IMILAC':           dict(kind='field', fx=0.64, fy=0.62, zoom=1.7),

    'EARTH':            dict(kind='globe', w=0.84, cy=0.43),
    'MOON':             dict(kind='globe', w=0.84, cy=0.43),
    'SUN':              dict(kind='globe', w=0.84, cy=0.43),
    'MERCURY':          dict(kind='globe', w=0.82, cy=0.43),
    'VENUS':            dict(kind='globe', w=0.82, cy=0.43),
    'MARS':             dict(kind='globe', w=0.82, cy=0.43),
    'VALLES-MARINERIS': dict(kind='globe', w=0.86, cy=0.43),
    'JUPITER':          dict(kind='globe', w=0.86, cy=0.43),
    'SATURN':           dict(kind='globe', w=0.98, cy=0.43),
    'URANUS':           dict(kind='globe', w=0.80, cy=0.43),
    'NEPTUNE':          dict(kind='globe', w=0.80, cy=0.43),
    'PLUTO':            dict(kind='globe', w=0.80, cy=0.43),
    'IO':               dict(kind='globe', w=0.80, cy=0.43),
    'EUROPA':           dict(kind='globe', w=0.80, cy=0.43),
    'GANYMEDE':         dict(kind='globe', w=0.80, cy=0.43),
    'TITAN':            dict(kind='globe', w=0.80, cy=0.43),
    'ENCELADUS':        dict(kind='globe', w=0.80, cy=0.43),
    'SGR-A':            dict(kind='globe', w=0.80, cy=0.43, pad=0.3),
    'TOTAL-ECLIPSE':    dict(kind='globe', w=0.96, cy=0.43, pad=0.25),
    'CHRISTMAS-SUPERMOON': dict(kind='field', fx=0.5, fy=0.5),

    'APOLLO-11':        dict(kind='field', fx=0.5, fy=0.45),
    'HUBBLE':           dict(kind='field', fx=0.5, fy=0.5),
    'JWST':             dict(kind='field', fx=0.5, fy=0.42),
    'ISS':              dict(kind='field', fx=0.5, fy=0.5),
    'AURORA':           dict(kind='field', fx=0.5, fy=0.45),
    'OLYMPUS-MONS':     dict(kind='field', fx=0.5, fy=0.45),
    'TYCHO':            dict(kind='field', fx=0.5, fy=0.45),
    'HALE-BOPP':        dict(kind='field', fx=0.5, fy=0.5),
    'LEONIDS':          dict(kind='field', fx=0.5, fy=0.5),
    'ORIONIDS':         dict(kind='field', fx=0.5, fy=0.5),
    'ORION':            dict(kind='field', fx=0.5, fy=0.5),
    'M45':              dict(kind='field', fx=0.5, fy=0.5),
    'HELIX':            dict(kind='field', fx=0.5, fy=0.5),
    'M57':              dict(kind='field', fx=0.5, fy=0.5),
    'CATS-EYE':         dict(kind='field', fx=0.5, fy=0.5),
    'M42':              dict(kind='field', fx=0.5, fy=0.5),
    'HORSEHEAD':        dict(kind='field', fx=0.5, fy=0.5),
    'ROSETTE':          dict(kind='field', fx=0.5, fy=0.5),
    'VEIL':             dict(kind='field', fx=0.5, fy=0.5),
    'M8':               dict(kind='field', fx=0.5, fy=0.5),
    'M20':              dict(kind='field', fx=0.5, fy=0.5),
    'M16':              dict(kind='field', fx=0.5, fy=0.5),
    'M1':               dict(kind='field', fx=0.5, fy=0.5),
    'CARINA':           dict(kind='field', fx=0.5, fy=0.5),
    'ETA-CARINAE':      dict(kind='field', fx=0.5, fy=0.5),
    'OMEGA-CEN':        dict(kind='field', fx=0.5, fy=0.5),
    'M13':              dict(kind='field', fx=0.5, fy=0.5),
    'TARANTULA':        dict(kind='field', fx=0.5, fy=0.5),
    'M31':              dict(kind='field', fx=0.5, fy=0.5),
    'M82':              dict(kind='field', fx=0.5, fy=0.5),
    'CEN-A':            dict(kind='field', fx=0.5, fy=0.5),
    'M101':             dict(kind='field', fx=0.5, fy=0.5),
    'M51':              dict(kind='field', fx=0.5, fy=0.5),
    'M104':             dict(kind='globe', w=0.98, cy=0.43, pad=0.2, black=0.07),
    'CARTWHEEL':        dict(kind='field', fx=0.5, fy=0.5),
    'HUBBLE-DEEP-FIELD': dict(kind='field', fx=0.5, fy=0.5),
}

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


def load(path, mode='RGB'):
    a = np.asarray(Image.open(path).convert(mode)).astype(np.float32) / 255
    return a


def resize(img, w, h):
    up = img.shape[1] < w
    return np.clip(cv2.resize(img, (max(1, int(round(w))), max(1, int(round(h)))), interpolation=cv2.INTER_LANCZOS4 if up else cv2.INTER_AREA), 0, 1)


def sharpen(img, amount, sigma=1.0):
    return np.clip(img + (img - cv2.GaussianBlur(img, (0, 0), sigma)) * amount, 0, 1)


def grade(rgb, contrast=1.06, sat=1.06):
    l = rgb.mean(-1, keepdims=True)
    rgb = l + (rgb - l) * sat
    return np.clip((rgb - 0.5) * contrast + 0.5 + (contrast - 1) * 0.45, 0, 1)


def finish(canvas, seed):
    rng = np.random.default_rng(seed)
    out = np.clip(canvas + rng.normal(0, 0.004, canvas.shape).astype(np.float32), 0, 1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8))


def bbox(mask, thr):
    ys, xs = np.nonzero(mask > thr)
    return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1


def paste(dst, src, x0, y0):
    """src copied into dst with its top-left at (x0, y0), clipped to dst."""
    h, w = src.shape[:2]
    cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
    if cx1 > cx0 and cy1 > cy0:
        dst[cy0:cy1, cx0:cx1] = src[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0]
    return dst


# ---- studio -------------------------------------------------------------------------------

def cutout(name):
    rgb = load(f'{PHOTO}/{name}.webp') if name != 'SILVER' else load(f'{MASKS}/SILVER.png')
    m = load(f'{MASKS}/{name}.png' if name != 'SILVER' else f'{MASKS}/SILVER-mask.png', 'L')
    m[m < 0.04] = 0
    lab, n = ndimage.label(m > 0.5)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(m), lab, range(1, n + 1))
        keep = ndimage.binary_dilation(lab == 1 + int(np.argmax(sizes)), iterations=6)
        # Telescopes are many thin parts: keep every piece that is not a speck.
        for i, s in enumerate(sizes):
            if s > m.size * 0.004:
                keep |= ndimage.binary_dilation(lab == i + 1, iterations=6)
        m = m * keep
    paper = np.median(rgb[m < 0.03], axis=0) if (m < 0.03).any() else np.zeros(3, np.float32)
    y0, y1, x0, x1 = bbox(m, 0.1)
    rgb, m = rgb[y0:y1, x0:x1], m[y0:y1, x0:x1]
    a = np.clip(m, 1e-3, 1)[..., None]
    rgb = np.clip((rgb - (1 - a) * paper) / a, 0, 1)
    m = np.clip((m - 0.15) / 0.85, 0, 1)
    return rgb, m


def sweep(cx, cy, floor_y):
    """A photographer's sweep in charcoal: a soft pool of light behind the object, falling off to black,
    and a floor that catches a little of it."""
    r = np.hypot((XX - cx) / (W * 0.62), (YY - cy) / (H * 0.42))
    wall = 0.04 + 0.17 * np.exp(-r ** 2 * 1.3)
    wall = wall[..., None] * np.array([0.93, 0.95, 1.0], np.float32)
    if floor_y is None:
        return wall
    t = np.clip((YY - floor_y) / (H * 0.18), 0, 1)
    below = (YY > floor_y)[..., None]
    fr = np.hypot((XX - cx) / (W * 0.5), (YY - floor_y) / (H * 0.06))
    floor = (0.07 * np.exp(-fr ** 2) + 0.02 * (1 - t))[..., None] * np.array([0.93, 0.95, 1.0], np.float32)
    line = np.exp(-((YY - floor_y) / 1.6) ** 2) * np.exp(-((XX - cx) / (W * 0.45)) ** 2) * 0.05
    return np.where(below, floor, wall) + line[..., None]


def rim(alpha, d, width, strength):
    shifted = ndimage.shift(alpha, (d[1] * width, d[0] * width), order=1, mode='constant')
    edge = cv2.GaussianBlur(np.clip(alpha - shifted, 0, 1), (0, 0), max(0.6, width * 0.4))
    return edge[..., None] * np.array([1.0, 0.98, 0.95], np.float32) * strength


def studio(des, c):
    rgb, m = cutout(c.get('src', des))
    if c.get('stand'):
        s = min(c['height'] * H / m.shape[0], 0.9 * W / m.shape[1])
    else:
        s = min(c['w'] * 1.12 * W / m.shape[1], 0.50 * H / m.shape[0])
    h, w = int(round(m.shape[0] * s)), int(round(m.shape[1] * s))
    rgb, m = resize(rgb, w, h), resize(m, w, h)
    rgb = sharpen(rgb, 0.35 if s < 1 else 0.5)

    # Full tonal range inside the object, a touch of clarity, no colour shift: it should look like itself.
    lum = rgb.mean(-1)
    lo, hi = np.percentile(lum[m > 0.5], [0.3, 99.7])
    rgb = np.clip((rgb - lo) / max(hi - lo, 1e-3) * 0.97, 0, 1)
    rgb = np.clip(rgb + (rgb - cv2.GaussianBlur(rgb, (0, 0), max(3.0, w * 0.02))) * 0.25, 0, 1)

    cx = W * 0.5
    if c.get('stand'):
        x0, y0 = int(cx - w / 2), int(c['top'] * H + (c['height'] * H - h))
        floor_y = y0 + h - max(2, int(h * 0.01))
        cy = y0 + h * 0.35
    else:
        cy = c['cy'] * H
        x0, y0 = int(cx - w / 2), int(cy - h / 2)
        floor_y = (y0 + h + H * 0.03) if c.get('floor', True) else None

    canvas = sweep(cx, cy, floor_y)
    layer = paste(np.zeros((H, W, 3), np.float32), rgb, x0, y0)
    alpha = paste(np.zeros((H, W), np.float32), m, x0, y0)

    if floor_y is not None:
        # Contact shadow, and the object mirrored faintly in the floor.
        fy = int(floor_y)
        shadow = np.exp(-((XX - cx) / (w * 0.42)) ** 2 - ((YY - fy) / (H * 0.012)) ** 2)
        canvas *= (1 - 0.6 * shadow)[..., None]
        span = min(H - fy, int(h * 0.6))
        rows = np.clip(2 * fy - np.arange(fy, fy + span), 0, H - 1)
        refl, ra = np.zeros_like(layer), np.zeros_like(alpha)
        refl[fy:fy + span], ra[fy:fy + span] = layer[rows], alpha[rows]
        fade = np.exp(-np.clip(YY - fy, 0, None) / (h * (0.10 if c.get('stand') else 0.16))) * 0.22
        ra = cv2.GaussianBlur(ra * fade, (0, 0), 2.0)
        canvas = canvas * (1 - ra[..., None]) + cv2.GaussianBlur(refl, (0, 0), 2.0) * ra[..., None]

    a3 = alpha[..., None]
    canvas = canvas * (1 - a3) + layer * a3
    k = max(1.5, w * 0.005)
    canvas += rim(alpha, (-0.7, -0.7), k, 0.30) + rim(alpha, (0.8, -0.4), k * 1.2, 0.22)
    return finish(canvas, sum(des.encode()))


# ---- globe --------------------------------------------------------------------------------

def globe(des, c):
    rgb = load(f'{PHOTO}/{des}.webp')
    lum = cv2.GaussianBlur(rgb.max(-1), (0, 0), 2)
    y0, y1, x0, x1 = bbox(lum, 0.08)
    ow, oh = x1 - x0, y1 - y0
    pad = c.get('pad', 0.12)
    px, py = int(ow * pad), int(oh * pad)
    ih, iw = rgb.shape[:2]
    big = np.zeros((ih + 2 * max(px, py) + 2, iw + 2 * max(px, py) + 2, 3), np.float32)
    o = max(px, py) + 1
    big[o:o + ih, o:o + iw] = rgb
    crop = big[o + y0 - py:o + y1 + py, o + x0 - px:o + x1 + px]
    s = c['w'] * W / ow
    if oh * s > 0.58 * H:
        s = 0.58 * H / oh
    h, w = crop.shape[0] * s, crop.shape[1] * s
    crop = sharpen(resize(crop, w, h), 0.3 if s > 1 else 0.2)
    # Feather the frame's edge so the photo's own black meets the card's black without a seam.
    hh, ww = crop.shape[:2]
    e = max(8, int(min(hh, ww) * 0.06))
    fx = np.clip(np.minimum(np.arange(ww), ww - 1 - np.arange(ww)) / e, 0, 1)
    fy = np.clip(np.minimum(np.arange(hh), hh - 1 - np.arange(hh)) / e, 0, 1)
    crop = crop * (fy[:, None] * fx[None, :])[..., None]
    # Lift the photo's near-black floor to true black, so the card is one clean field.
    black = c.get('black', 0.012)
    crop = np.clip((crop - black) / (1 - black), 0, 1)
    canvas = paste(np.zeros((H, W, 3), np.float32), grade(crop, 1.03, 1.04), int(W / 2 - ww / 2), int(c['cy'] * H - hh / 2))
    return finish(canvas, sum(des.encode()))


# ---- field --------------------------------------------------------------------------------

def field(des, c):
    rgb = load(f'{PHOTO}/{des}.webp')
    ih, iw = rgb.shape[:2]
    zoom = c.get('zoom', 1.0)
    cw = min(iw, ih * W / H) / zoom
    ch = cw * H / W
    x0 = np.clip(c['fx'] * iw - cw / 2, 0, iw - cw)
    y0 = np.clip(c['fy'] * ih - ch / 2, 0, ih - ch)
    crop = rgb[int(y0):int(y0 + ch), int(x0):int(x0 + cw)]
    s = W / crop.shape[1]
    canvas = sharpen(resize(crop, W, H), 0.35 if s > 1.15 else 0.2)
    canvas = grade(canvas)
    # A gentle vignette, so the edge of the frame does not pull the eye.
    r = np.hypot((XX - W / 2) / (W * 0.75), (YY - H * 0.42) / (H * 0.75))
    canvas *= np.clip(1.12 - r ** 2 * 0.55, 0.45, 1)[..., None]
    return finish(canvas, sum(des.encode()))


def main():
    only = sys.argv[1:]
    for des, c in CARDS.items():
        if only and des not in only:
            continue
        img = {'studio': studio, 'globe': globe, 'field': field}[c['kind']](des, c)
        out = f'{ART}/{des}.webp'
        img.save(out, 'WEBP', quality=90, method=6)
        print(des, c['kind'], os.path.getsize(out))


if __name__ == '__main__':
    main()

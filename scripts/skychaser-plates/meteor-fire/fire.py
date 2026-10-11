"""Re-stages a meteorite in the Campo del Cielo look: the rock, cut from its own picture,
falling red-hot through the upper atmosphere with a flame sheath streaming behind it.
usage: python fire.py NAME angle_deg scale cx cy seed [flip]"""
import sys, math
import numpy as np
from PIL import Image, ImageFilter

G = '../gen/'
name, ang, scale, cx, cy, seed = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), int(sys.argv[6])
flip = len(sys.argv) > 7 and sys.argv[7] == 'flip'
rng = np.random.default_rng(seed)
W, H = 880, 1168

def f32(img): return np.asarray(img, dtype=np.float32) / 255.0
def img1(a): return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), 'L')
def blur(a, r): return f32(img1(a).filter(ImageFilter.GaussianBlur(r)))
def blur3(a, r): return np.stack([blur(a[..., c], r) for c in range(3)], -1)

def noise(w, h, cells_x, cells_y, octaves=5, stretch=1.0):
    """Fractal value noise, made by upsampling random grids."""
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        gx, gy = max(2, int(cells_x * 2 ** o)), max(2, int(cells_y * 2 ** o / stretch))
        g = rng.random((gy, gx)).astype(np.float32)
        out += amp * f32(img1(g).resize((w, h), Image.BICUBIC)); tot += amp; amp *= 0.55
    return out / tot

def streaks(cx_, cy_, octaves, deg):
    """Noise drawn on a sheet larger than the card, turned, then cut to the card, so no corner is bare."""
    S = int(1.5 * max(W, H))
    n_ = noise(S, S, cx_ * S / W, cy_ * S / H, octaves)
    t = img1(n_).rotate(deg, resample=Image.BICUBIC)
    l, u = (S - W) // 2, (S - H) // 2
    return f32(t.crop((l, u, l + W, u + H)))

def shift(a, dx, dy):
    out = np.zeros_like(a); h, w = a.shape[:2]
    dx, dy = int(round(dx)), int(round(dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    out[yd, xd] = a[ys, xs]; return out

def fire(t):
    """Black body ramp: transparent dark, ember red, orange, yellow, white."""
    stops = [(0.0, (0, 0, 0)), (0.18, (0.35, 0.02, 0.0)), (0.38, (0.85, 0.16, 0.02)), (0.6, (1.0, 0.45, 0.06)), (0.8, (1.0, 0.76, 0.3)), (1.0, (1.0, 0.97, 0.86))]
    t = np.clip(t, 0, 1); out = np.zeros(t.shape + (3,), np.float32)
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        m = (t >= a) & (t <= b); k = ((t - a) / (b - a))[m][:, None]
        out[m] = np.array(ca) * (1 - k) + np.array(cb) * k
    return out

# Travel heads down-right at `ang` below the horizontal; the flames stream the other way.
th = math.radians(ang)
dx, dy = (-math.cos(th) if flip else math.cos(th)), math.sin(th)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

# ── The sky: black above, the glowing limb of the planet low in the frame, cloud decks lit from within.
sky = np.zeros((H, W, 3), np.float32)
r0 = W * 3.2
cxp, cyp = W * (0.1 if not flip else 0.9), H + r0 - H * 0.24
d = np.sqrt((xx - cxp) ** 2 + (yy - cyp) ** 2) - r0          # <0 inside the planet
air = np.exp(-np.maximum(d, 0) / 110.0) * (d > 0)
sky += air[..., None] * np.array([0.32, 0.08, 0.02])
sky += (np.exp(-np.abs(d) / 7.0))[..., None] * np.array([1.0, 0.62, 0.25]) * 0.9   # the thin bright limb
depth = np.clip(-d / (H * 0.24), 0, 1)                      # 0 at the horizon, 1 at the foot
cl = noise(W, H, 3, 16, 6)
cl2 = noise(W, H, 8, 40, 4)
cl3 = noise(W, H, 20, 70, 3)
field = cl * 0.6 + cl2 * 0.35 + cl3 * 0.25
puffs = np.clip((field - 0.5) * 3.2, 0, 1)
relief = np.clip((field - shift(field, 0, 6)) * 9, 0, 1)            # tops facing the light above
lit = np.exp(-depth * 2.2)                                 # lit from above by the fireball and the dawn
deck = (d < 0) * (0.04 + puffs * (0.18 + 0.7 * lit) + relief * puffs * (0.3 + 0.9 * lit))
sky += deck[..., None] * np.array([1.0, 0.38, 0.1])
sky += ((d < 0) * np.exp(-depth * 6) * 0.5)[..., None] * np.array([1.0, 0.45, 0.12])
# Stars in the black, away from the glow.
stars = np.zeros((H, W), np.float32)
n = 900
sx, sy = rng.integers(0, W, n), rng.integers(0, H, n)
stars[sy, sx] = rng.random(n) ** 3
stars = blur(stars, 0.7) * 3 * np.clip(1 - air * 2.2, 0, 1)
sky += stars[..., None] * np.array([0.9, 0.92, 1.0])

# ── The rock, from its own picture.
src = Image.open(G + name + '.png').convert('RGB')
mask = Image.open(f'mask2-{name}.png').convert('L')
if flip:
    src, mask = src.transpose(Image.FLIP_LEFT_RIGHT), mask.transpose(Image.FLIP_LEFT_RIGHT)
bbox = mask.point(lambda v: 255 if v > 90 else 0).getbbox()
src, mask = src.crop(bbox), mask.crop(bbox)
target = W * scale
k = target / max(src.size)
src = src.resize((int(src.width * k), int(src.height * k)), Image.LANCZOS)
mask = mask.resize(src.size, Image.LANCZOS)
rock = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
ox, oy = int(W * cx - src.width / 2), int(H * cy - src.height / 2)
def paste(dst, a):
    h, w = a.shape[:2]
    x0, y0 = max(0, ox), max(0, oy); x1, y1 = min(W, ox + w), min(H, oy + h)
    dst[y0:y1, x0:x1] = a[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
paste(rock, f32(src)); paste(m, f32(mask))
m = np.clip((m - 0.5) / 0.3, 0, 1)
# The net's mask runs a little wide; near the edge keep only what is lit rock, not the black behind it.
core = np.clip((blur(m, 10) - 0.82) / 0.12, 0, 1)
lum = rock.max(-1)
lit = np.clip((lum - 0.05) / 0.10, 0, 1)
m = np.maximum(core * m, m * lit)
m = blur(np.clip((m - 0.35) / 0.4, 0, 1), 1.0)
# Sky colour caught at the rim (an aurora, a blue star's glow): not rock.
outer = 1 - np.clip((blur(m, 30) - 0.75) / 0.2, 0, 1)
tint = (rock[..., 1] - rock[..., 0]) + 0.6 * (rock[..., 2] - rock[..., 0])
m = m * (1 - np.clip(tint * 12, 0, 1) * outer)
m = blur(np.clip((m - 0.3) / 0.4, 0, 1), 1.0)

# The face meeting the air: where the rock ends just ahead of itself.
ahead = np.clip(m - shift(m, -dx * 26, -dy * 26), 0, 1)
lead = blur(ahead, 10)
rim = np.clip(m - blur(m, 7), 0, 1) * 3.0                   # a thin hot edge all round
heat = np.clip((lead * 1.6 + rim * 0.55) * (0.45 + noise(W, H, 24, 24, 3) * 1.1), 0, 1)

# ── The flame sheath: the outline smeared back along the path, torn by turbulence.
trail = np.zeros((H, W), np.float32)
outline = np.clip(blur(m, 4) - m * 0.6, 0, 1) + blur(ahead, 8) * 0.6
mc = (W * cx, H * cy)
oimg = img1(np.clip(outline, 0, 1))
for i in range(1, 64):
    s_ = i * 10.0
    z = 1 + i * 0.013                                       # the sheath fans out behind the rock
    zi = oimg.resize((int(W * z), int(H * z)), Image.BILINEAR)
    zx, zy = int(mc[0] * z - mc[0]), int(mc[1] * z - mc[1])
    zi = f32(zi.crop((zx, zy, zx + W, zy + H)))
    trail += shift(zi, -dx * s_, -dy * s_) * math.exp(-i / 11.0)
    if i % 8 == 0: trail = blur(trail, 2 + i / 12)
trail = blur(trail, 4)
trail /= np.percentile(trail[trail > 0.01], 99) + 1e-6
tear = streaks(3, 40, 6, ang if flip else -ang)                 # streaks running with the motion
tear2 = streaks(6, 90, 4, ang if flip else -ang)
tongues = np.clip((tear * 0.8 + tear2 * 0.5) - 0.52, 0, 1) * 3.0 * (0.6 + streaks(2, 6, 3, 0) * 0.8)
soft = blur(trail, 26)
flame = np.clip(trail * (0.1 + tongues) * 0.8 + soft * 0.42, 0, 1.0) ** 1.15
flame *= (1 - m * 0.98)
halo = (blur(m, 18) * (1 - m)) * 0.9 + blur(ahead, 26) * 1.6  # the shock glow wrapped round the nose
# ── Embers peeling off into the wake.
emb = np.zeros((H, W), np.float32)
for _ in range(260):
    t = rng.random() ** 1.6
    ex = W * cx - dx * t * W * 0.95 + rng.normal(0, 40 + t * 120)
    ey = H * cy - dy * t * W * 0.95 + rng.normal(0, 40 + t * 120)
    if 0 <= ex < W - 1 and 0 <= ey < H - 1:
        emb[int(ey), int(ex)] = rng.random() * (1 - t) + 0.2
streak = np.zeros_like(emb)
for i in range(8): streak += shift(emb, -dx * i * 2, -dy * i * 2) * (1 - i / 8)
emb = blur(streak, 0.9) * 2.4

band_pre = np.clip(m - np.clip((blur(m, 14) - 0.55) / 0.3, 0, 1), 0, 1)

# ── Light it all.
glow = fire(np.clip(flame * 0.5 + halo * 0.42, 0, 1)) * np.clip(flame * 0.7 + halo * 0.5, 0, 1)[..., None] * 0.8
glow += fire(np.clip(emb, 0, 1) * 0.9 + 0.1) * np.clip(emb, 0, 1)[..., None]
base = 1 - (1 - sky) * (1 - np.clip(glow, 0, 1))             # screen the fire over the sky

# The rock: darkened by the glare behind it, its face burning.
lum = rock.mean(-1, keepdims=True)
edge_band = np.clip(m - np.clip((blur(m, 16) - 0.6) / 0.25, 0, 1), 0, 1)[..., None]
rock = rock * (1 - edge_band) + lum * edge_band                  # no stray sky colour on the rim
rock_lit = np.clip((rock * 0.9 + lum * 0.1) ** 1.2 * 1.2, 0, 1) * np.array([1.0, 0.82, 0.68])   # scorched, lit by fire not sunlight
# Crevices on the hot side glow like lava.
crev = np.clip((0.3 - lum[..., 0]) / 0.2, 0, 1) * np.clip(blur(lead, 40) * 3.5 + band_pre * 0.6, 0, 1)
crev *= np.clip(noise(W, H, 40, 40, 3) * 1.6 - 0.3, 0, 1)
rock_lit = rock_lit + fire(0.45 + crev * 0.5) * crev[..., None] * 1.3
burn = fire(0.55 + heat * 0.45) * heat[..., None]
rock_lit = rock_lit * (1 - heat[..., None] * 0.4) + burn * 0.8
# Light from the sheath spills over the trailing half.
spill = blur(flame, 30)[..., None] * np.array([1.0, 0.45, 0.12]) * 0.35
rock_lit = rock_lit + spill
out = base * (1 - m[..., None]) + np.clip(rock_lit, 0, 1) * m[..., None]
# The edge itself burns: a band of fire laid over the rim, widest on the leading face, torn like the sheath.
band = np.clip(m - np.clip((blur(m, 9) - 0.55) / 0.3, 0, 1), 0, 1)
crack = np.clip(noise(W, H, 30, 30, 4) - 0.45, 0, 1) * 3
edgefire = np.clip(band * (0.7 + crack) + lead * m * 0.9, 0, 1)
out = 1 - (1 - out) * (1 - fire(0.35 + edgefire * 0.5) * edgefire[..., None] * 0.7)

# Bloom from the hottest parts, then a slow vignette.
hot = np.clip(out - 0.62, 0, 1)
out = out + blur3(hot, 18) * 0.5 + blur3(hot, 60) * 0.25
v = 1 - 0.35 * (((xx / W - 0.5) ** 2 + (yy / H - 0.5) ** 2) * 2.2)
out = np.clip(out * v[..., None], 0, 1)
out = 1 - np.exp(-out * 1.35)                              # soft shoulder on the highlights
Image.fromarray((out * 255).astype(np.uint8)).save(f'fire-{name}.png')
print(name)

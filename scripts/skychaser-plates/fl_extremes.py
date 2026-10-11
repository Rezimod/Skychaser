"""First Light: clusters and extremes, drawn in the manner of drawing.py.

Full-art plates: 582 × 832, the subject between y 90 and 600, the survey layer
no more than a quiet label. Dense star fields are written as zero-length round
caps on a few bucketed paths, so ten thousand stars stay a small file.
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL
from more import sky, top, W, HF

H = HF


def blur(u, name, sd, pad=40):
    return '<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feGaussianBlur stdDeviation="%s"/></filter>' % (u, name, pad, pad, 100 + 2 * pad, 100 + 2 * pad, f(sd))


def rg(id_, stops, cx=.5, cy=.5, r=.5, extra=''):
    return '<radialGradient id="%s" cx="%s" cy="%s" r="%s"%s>%s</radialGradient>' % (id_, f(cx) if cx != .5 else '.5', f(cy) if cy != .5 else '.5', f(r) if r != .5 else '.5', extra,
        ''.join('<stop offset="%s" stop-color="%s" stop-opacity="%s"/>' % (o, c, a) for o, c, a in stops))


def mix(a, b, t):
    a = [int(a[i:i + 2], 16) for i in (1, 3, 5)]; b = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def plummer(rnd, a, rmax):
    while True:
        q = rnd.random()
        r = a * math.sqrt(q / (1 - q + 1e-9))
        if r < rmax:
            return r


class Dots:
    """Stars as zero-length round-capped subpaths, bucketed by colour, size and opacity."""
    def __init__(self):
        self.b = {}

    def add(self, x, y, r, col, op=1):
        w = max(.4, round(2 * r / .4) * .4)
        o = min(1, max(.1, round(op * 5) / 5))
        self.b.setdefault((col, round(w, 1), o), []).append('M%s %sh0' % (f(x), f(y)))

    def out(self, extra=''):
        return ''.join('<path d="%s" stroke="%s" stroke-width="%s" stroke-opacity="%s" stroke-linecap="round"%s/>' % (''.join(v), c, f(w), f(o), extra)
                       for (c, w, o), v in sorted(self.b.items(), key=lambda kv: kv[0][1]))


class Kit:
    """Per-plate defs: coloured halos and gem-cut stars."""
    def __init__(self, u):
        self.u = u; self.d = {}

    def halo(self, col, k=.9):
        id_ = '%sh%s%d' % (self.u, col[1:], int(k * 100))
        if id_ not in self.d:
            self.d[id_] = rg(id_, [(0, col, f(k)), ('.18', col, f(k * .42)), ('.45', col, f(k * .1)), (1, col, 0)])
        return id_

    def gem(self, x, y, r, col, L, op=1, ang=0, diag=0.0, hk=.9, hr=7):
        w = max(.5, r * .42)
        s = '<g opacity="%s">' % f(op)
        s += '<circle cx="%s" cy="%s" r="%s" fill="url(#%s)"/>' % (f(x), f(y), f(r * hr), self.halo(col, hk))
        if L:
            sp = 'M%s %sL%s %sL%s %sL%s %sZM%s %sL%s %sL%s %sL%s %sZ' % (
                f(-L), 0, 0, f(-w), f(L), 0, 0, f(w), 0, f(-L), f(w), 0, 0, f(L), f(-w), 0)
            s += '<path d="%s" fill="%s" opacity=".75" transform="translate(%s %s) rotate(%s)"/>' % (sp, col, f(x), f(y), f(ang))
            s += '<path d="%s" fill="#fff" opacity=".7" transform="translate(%s %s) rotate(%s) scale(.45)"/>' % (sp, f(x), f(y), f(ang))
            if diag:
                s += '<path d="%s" fill="%s" opacity=".45" transform="translate(%s %s) rotate(%s) scale(%s)"/>' % (sp, col, f(x), f(y), f(ang + 45), f(diag))
        s += '<circle cx="%s" cy="%s" r="%s" fill="%s"/><circle cx="%s" cy="%s" r="%s" fill="#fff"/></g>' % (f(x), f(y), f(r * 1.25), col, f(x), f(y), f(r * .7))
        return s

    def defs(self):
        return ''.join(self.d.values())


def band_sky(u, c, n, seed, spikes, ang, cx, cy, length, width, tone, dust='#000000', ndense=1400, glow=1, tints=('#ffffff', '#dfe8ff', '#fff1dc', '#cfe0ff'), extra='', extra_defs=''):
    """A sky with a Milky Way band through (cx, cy) at angle ang: glow, dust lanes, and a crowd of faint stars."""
    rnd = random.Random(seed + 7)
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)
    defs = blur(u, 'mw1', 26) + blur(u, 'mw2', 10) + blur(u, 'mw3', 4)
    g = []
    for i in range(16):
        t = rnd.uniform(-.55, .55) * length; o = rnd.gauss(0, width * .25)
        x, y = cx + t * ca - o * sa, cy + t * sa + o * ca
        g.append('<path d="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            blob(x, y, rnd.uniform(.12, .3) * length, width * rnd.uniform(.35, .7), rnd, 12, .3), rnd.choice(tone), f(rnd.uniform(.025, .07) * glow), f(ang), f(x), f(y)))
    s = '<g filter="url(#%smw1)">%s</g>' % (u, ''.join(g))
    dl = []
    for i in range(22):
        t = rnd.uniform(-.5, .5) * length; o = rnd.gauss(0, width * .16)
        x, y = cx + t * ca - o * sa, cy + t * sa + o * ca
        dl.append('<path d="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            blob(x, y, rnd.uniform(20, 70), rnd.uniform(6, 20), rnd, 10, .45), dust, f(rnd.uniform(.2, .45)), f(ang + rnd.uniform(-25, 25)), f(x), f(y)))
    s += '<g filter="url(#%smw2)">%s</g>' % (u, ''.join(dl))
    d = Dots()
    for _ in range(ndense):
        t = rnd.uniform(-.6, .6) * length; o = rnd.gauss(0, width * .3)
        x, y = cx + t * ca - o * sa, cy + t * sa + o * ca
        if -4 < x < W + 4 and -4 < y < H + 4:
            d.add(x, y, .25 + .5 * rnd.random() ** 3, rnd.choice(tints), .3 + .6 * rnd.random())
    s += d.out()
    return sky(u, H, c, n, seed, spikes, tints, extra=s + extra, extra_defs=defs + extra_defs)


# ================================================================= GLOBULARS
def globular(u, seed, cx, cy, a, rmax, flat, rot, n_dust, n_mid, n_bright, cols, giant, blue, glow, core_r, lanes=False, spk=('#fff4e0', '#e8eeff'), spiky=1.35):
    rnd = random.Random(seed)
    k = Kit(u)
    cr, sr = math.cos(math.radians(rot)), math.sin(math.radians(rot))

    def P(r, th):
        x, y = r * math.cos(th), r * math.sin(th) * flat
        return cx + x * cr - y * sr, cy + x * sr + y * cr

    def in_lane(x, y):
        if not lanes:
            return False
        ox, oy = cx + 18, cy + 16
        for ang in (-8, 118, 232):
            t = math.radians(ang)
            dx, dy = x - ox, y - oy
            along = dx * math.cos(t) + dy * math.sin(t); perp = -dx * math.sin(t) + dy * math.cos(t)
            if 4 < along < 58 and abs(perp) < 3.2 + along * .05:
                return True
        return False

    defs = blur(u, 'b1', 1.1) + blur(u, 'b3', 3) + blur(u, 'b10', 10) + blur(u, 'b24', 24)
    defs += rg(u + 'halo', glow[0])
    defs += rg(u + 'core', glow[1])
    o = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%shalo)"/>' % (cx, cy, rmax, u)]
    # the unresolved crowd: fine noise thresholded to single-pixel stars, fading with radius
    defs += rg(u + 'spm', [(0, '#fff', '1'), ('.12', '#fff', '.8'), ('.3', '#fff', '.32'), ('.55', '#fff', '.07'), (1, '#fff', 0)])
    for i, (fr, th, col) in enumerate(((.95, 5.8, spk[0]), (.7, 6.3, spk[1]))):
        rgb = [int(col[j:j + 2], 16) / 255 for j in (1, 3, 5)]
        defs += ('<filter id="%ssp%d" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="1" seed="%d"/>'
                 '<feColorMatrix type="matrix" values="0 0 0 0 %.2f  0 0 0 0 %.2f  0 0 0 0 %.2f  10 0 0 0 -%s"/></filter>') % (u, i, f(fr), seed + i, rgb[0], rgb[1], rgb[2], f(th))
    defs += '<mask id="%sspk"><ellipse cx="%d" cy="%d" rx="%d" ry="%s" fill="url(#%sspm)" transform="rotate(%s %d %d)"/></mask>' % (u, cx, cy, rmax, f(rmax * flat), u, f(rot), cx, cy)
    o.append('<g mask="url(#%sspk)">%s</g>' % (u, ''.join('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%ssp%d)"/>' % (cx - rmax, cy - rmax, 2 * rmax, 2 * rmax, u, i) for i in range(2))))
    dust, mid = Dots(), Dots()
    for _ in range(n_dust):
        r = plummer(rnd, a, rmax); x, y = P(r, rnd.uniform(0, 2 * math.pi))
        if in_lane(x, y) and rnd.random() < .8: continue
        near = max(0, 1 - r / (a * 2.5))
        dust.add(x, y, .3 + .35 * rnd.random(), rnd.choice(cols), (.35 + .5 * rnd.random()) * (1 - .45 * near))
    for _ in range(n_mid):
        r = plummer(rnd, a * 1.25, rmax); x, y = P(r, rnd.uniform(0, 2 * math.pi))
        if in_lane(x, y) and rnd.random() < .85: continue
        m = rnd.random() ** 2.2
        c = rnd.choice(cols) if rnd.random() > .08 else (giant if rnd.random() < .6 else blue)
        mid.add(x, y, .55 + 1.1 * m, c, .55 + .45 * rnd.random())
    o.append('<use href="#%smid" opacity=".55" filter="url(#%sb3)"/>' % (u, u))
    o.append(dust.out())
    o.append('<g id="%smid">%s</g>' % (u, mid.out()))
    # the unresolved heart: a steep blaze that swallows the individual stars
    o.append('<ellipse cx="%d" cy="%d" rx="%s" ry="%s" fill="url(#%score)" transform="rotate(%s %d %d)"/>' % (cx, cy, f(core_r), f(core_r * flat), u, f(rot), cx, cy))
    # bright members: giants (orange), horizontal branch (blue), white turn-off stars
    br = []
    for i in range(n_bright):
        r = plummer(rnd, a * 1.6, rmax * .8); x, y = P(r, rnd.uniform(0, 2 * math.pi))
        q = rnd.random()
        c = giant if q < .35 else (blue if q < .55 else rnd.choice(cols))
        rr = rnd.uniform(.9, 1.8) * (1.2 if c == giant else 1)
        br.append(k.gem(x, y, rr, c, rr * rnd.uniform(4, 9) if rr > spiky else 0, rnd.uniform(.75, 1), 0, 0, .75, 5))
    o.append(''.join(br))
    return o, k, defs, rnd, P


def m13(u):
    cx, cy = 291, 334
    bg = sky(u, H, ('#101a30', '#070c1c', '#02030a'), 240, 1764, 4)
    cols = ['#fff6e6', '#fff1d8', '#ffffff', '#eef2ff', '#ffe9c4', '#fff6e6']
    glow = ([(0, '#fff4dc', '.62'), ('.06', '#ffeccc', '.42'), ('.18', '#e8e2e0', '.16'), ('.42', '#8c9ac4', '.05'), (1, '#5a6aa0', 0)],
            [(0, '#ffffff', '1'), ('.14', '#fffaf0', '.92'), ('.34', '#fff0d6', '.5'), ('.62', '#ffe2b8', '.16'), (1, '#ffe2b8', 0)])
    o, k, defs, rnd, P = globular(u, 1764, cx, cy, 40, 300, 1, 0, 4200, 1900, 80, cols, '#ffb066', '#a9c8ff', glow, 92, lanes=True)
    # the four bright foreground stars that sit in front of the cluster, and a pair of field stars with spikes
    for x, y, r, c in [(398, 238, 2.3, '#ffe2b8'), (176, 420, 2, '#dfe8ff'), (452, 468, 1.8, '#fff4e0'), (140, 196, 1.6, '#cfe0ff')]:
        o.append(k.gem(x, y, r, c, r * 11, 1, 0, .4))
    o.append('<circle cx="%d" cy="%d" r="30" fill="#fff" opacity=".7" filter="url(#%sb10)"/>' % (cx, cy, u))
    # NGC 6207, a small spiral half a degree away, far behind
    defs += rg(u + 'ngc', [(0, '#fff4e0', '.9'), ('.25', '#d8d4e8', '.45'), ('.6', '#8ea0d8', '.16'), (1, '#6a80c8', 0)])
    o.append('<g transform="translate(468 150) rotate(-38)"><ellipse rx="26" ry="8" fill="url(#%sngc)"/><ellipse rx="12" ry="3.4" fill="url(#%sngc)"/>'
             '<path d="M-20 1Q-4 -5 14 -2M-12 4Q6 6 20 1" fill="none" stroke="#c8d4ff" stroke-opacity=".25" stroke-width="1.4" filter="url(#%sb1)"/></g>' % (u, u, u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .09), defs + k.defs())
    return bg, obj, svg(W, H, top('RA 16H 41M 41S · DEC +36° 27′ · HERCULES'))


def omega_cen(u):
    cx, cy = 291, 338
    bg = sky(u, H, ('#231a10', '#0e0a07', '#030203'), 220, 5139, 3, tints=('#ffffff', '#fff1dc', '#ffe6c0', '#dfe8ff'))
    cols = ['#ffe4b0', '#ffd892', '#fff0d2', '#ffe4b0', '#ffcf86', '#fff7e6']
    glow = ([(0, '#ffe2a8', '.66'), ('.1', '#f4c880', '.42'), ('.28', '#b88a50', '.16'), ('.55', '#6a4a26', '.05'), (1, '#3a2812', 0)],
            [(0, '#fffaf0', '1'), ('.2', '#fff0d0', '.88'), ('.45', '#ffdca0', '.46'), ('.72', '#f4bc70', '.14'), (1, '#f4bc70', 0)])
    o, k, defs, rnd, P = globular(u, 5139, cx, cy, 72, 380, .86, -24, 4300, 2000, 120, cols, '#ff9a48', '#bcd4ff', glow, 150, spk=('#ffe6b8', '#fff4dc'), spiky=1.6)
    for x, y, r, c in [(120, 250, 2, '#fff0d8'), (470, 200, 1.7, '#dfe8ff'), (452, 520, 2.2, '#ffd6a0')]:
        o.append(k.gem(x, y, r, c, r * 11, 1, 0, .4))
    o.append('<ellipse cx="%d" cy="%d" rx="70" ry="60" fill="#fff6e0" opacity=".55" filter="url(#%sb24)"/>' % (cx, cy, u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs + k.defs())
    return bg, obj, svg(W, H, top('RA 13H 26M 47S · DEC −47° 29′ · CENTAURUS'))


# ================================================================= OPEN CLUSTERS
def open_cluster(k, d, rnd, cx, cy, a, n, rmax, cols, bright, reds, spike=10):
    out = []
    for _ in range(n):
        r = plummer(rnd, a, rmax); t = rnd.uniform(0, 2 * math.pi)
        d.add(cx + r * math.cos(t), cy + r * math.sin(t), .4 + 1.1 * rnd.random() ** 2.5, rnd.choice(cols), .5 + .5 * rnd.random())
    for _ in range(bright):
        r = plummer(rnd, a * .9, rmax * .8); t = rnd.uniform(0, 2 * math.pi)
        rr = .9 + 1.9 * rnd.random() ** 1.8
        out.append(k.gem(cx + r * math.cos(t), cy + r * math.sin(t), rr, rnd.choice(cols[:3]), rr * spike if rr > 2.05 else 0, rnd.uniform(.8, 1), 0, .35 if rr > 2.4 else 0, .8, 5 if rr < 2.05 else 7))
    for _ in range(reds):
        r = plummer(rnd, a * 1.4, rmax * .9); t = rnd.uniform(0, 2 * math.pi)
        rr = rnd.uniform(1.8, 2.6)
        out.append(k.gem(cx + r * math.cos(t), cy + r * math.sin(t), rr, rnd.choice(['#ff8a4a', '#ff9d5c', '#ff7a3a']), rr * spike, 1, 0, .35))
    return out


def m44(u):
    bg = sky(u, H, ('#122033', '#08111e', '#02050a'), 200, 632, 3, cy='.42')
    rnd = random.Random(44)
    k = Kit(u); d = Dots()
    defs = blur(u, 'b14', 14) + rg(u + 'buzz', [(0, '#fff2d6', '.16'), ('.35', '#e8dcc0', '.07'), (1, '#c0b090', 0)])
    cx, cy = 291, 344
    o = ['<ellipse cx="%d" cy="%d" rx="250" ry="230" fill="url(#%sbuzz)"/>' % (cx, cy, u)]
    whites = ['#ffffff', '#f6f8ff', '#fff8ee', '#eaf0ff', '#fff4e2']
    g = []
    for _ in range(420):
        r = plummer(rnd, 95, 330); t = rnd.uniform(0, 2 * math.pi)
        d.add(cx + r * math.cos(t), cy + r * math.sin(t) * .95, .4 + .9 * rnd.random() ** 2.5, rnd.choice(whites), .45 + .5 * rnd.random())
    # the bright members: a loose swarm, with the triangle and trapezium the eye picks out
    pat = [(-38, -40), (4, -62), (22, -24), (-70, 18), (-24, 40), (58, 32), (100, -10), (-118, -78), (70, 104), (-8, 120), (140, 70), (-140, 88), (-60, -140), (118, -130), (30, -180), (-180, -10), (170, -60), (60, 190), (-100, 170), (200, 150)]
    for i, (dx, dy) in enumerate(pat):
        rr = 3.0 - i * .08 + rnd.uniform(-.3, .3)
        g.append(k.gem(cx + dx, cy + dy, rr, rnd.choice(whites), rr * 13, 1, 0, .4))
    for _ in range(40):
        r = plummer(rnd, 110, 320); t = rnd.uniform(0, 2 * math.pi)
        rr = rnd.uniform(1, 1.7)
        g.append(k.gem(cx + r * math.cos(t), cy + r * math.sin(t), rr, rnd.choice(whites), rr * 7 if rr > 1.4 else 0, .9))
    # the orange giants: epsilon, and a handful of others
    for dx, dy, rr in [(-46, 8, 3.2), (86, -72, 2.6), (-96, -34, 2.4), (34, 70, 2.3), (150, 10, 2)]:
        g.append(k.gem(cx + dx, cy + dy, rr, '#ffb46a', rr * 13, 1, 0, .4))
    o.append('<g opacity=".45" filter="url(#%sb14)">%s</g>' % (u, d.out()))
    o.append(d.out()); o.append(''.join(g))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .09), defs + k.defs())
    return bg, obj, svg(W, H, top('RA 08H 40M 24S · DEC +19° 40′ · CANCER'))


def _teardrop(sx, sy, R, bx, by, n=72):
    a0 = math.atan2(by - sy, bx - sx)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c = math.cos(t - a0)
        r = R * (1 + .32 * max(0, c) ** 4 - .03 * max(0, -c))
        pts.append((sx + r * math.cos(t), sy + r * math.sin(t)))
    return 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in pts) + 'Z'


# ================================================================= TON 618
def ton618(u):
    rnd = random.Random(618)
    # the sky: a deep field, faint galaxies behind everything
    gal = []
    for _ in range(120):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        r = .6 + 2.2 * rnd.random() ** 3
        gal.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(x), f(y), f(r), f(r * rnd.uniform(.35, 1)), rnd.choice(['#ffd6a0', '#ffb88a', '#cfd8ff', '#ff9a7a']), f(rnd.uniform(.15, .4)), f(rnd.uniform(0, 180)), f(x), f(y)))
    bg = sky(u, H, ('#120e24', '#07061a', '#010108'), 170, 618, 1, extra='<g filter="url(#%sgb)">%s</g>' % (u, ''.join(gal)), extra_defs=blur(u, 'gb', .5), cy='.4')
    k = Kit(u)
    cx, cy = 291, 330
    ja = math.radians(-36)
    defs = blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b8', 8) + blur(u, 'b20', 20, 60) + blur(u, 'b40', 40, 80)
    defs += rg(u + 'host', [(0, '#fff0d8', '.5'), ('.25', '#e8c098', '.26'), ('.6', '#9a7070', '.09'), (1, '#4a3a60', 0)])
    defs += rg(u + 'bloom', [(0, '#ffffff', 1), ('.04', '#f4f6ff', '.95'), ('.1', '#c8d8ff', '.55'), ('.24', '#8aa4ff', '.2'), ('.5', '#6a5ae0', '.06'), (1, '#40308a', 0)])
    defs += ('<linearGradient id="%sjet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset=".25" stop-color="#bcd4ff" stop-opacity=".75"/>'
             '<stop offset=".7" stop-color="#8a9cff" stop-opacity=".35"/><stop offset="1" stop-color="#b070ff" stop-opacity=".1"/></linearGradient>') % u
    o = []
    # the host galaxy, lost in the glare: a faint elliptical smudge with shells
    o.append('<ellipse cx="%d" cy="%d" rx="170" ry="112" fill="url(#%shost)" transform="rotate(18 %d %d)"/>' % (cx, cy, u, cx, cy))
    o.append('<ellipse cx="%d" cy="%d" rx="110" ry="70" fill="url(#%shost)" transform="rotate(18 %d %d)"/>' % (cx, cy, u, cx, cy))
    o.append('<path d="M%d %dq60 -40 150 -10" fill="none" stroke="#3a2418" stroke-opacity=".35" stroke-width="7" filter="url(#%sb8)"/>' % (cx - 110, cy + 30, u))
    hd = Dots()
    for _ in range(900):
        r = plummer(rnd, 50, 190); t = rnd.uniform(0, 2 * math.pi)
        x, y = r * math.cos(t), r * math.sin(t) * .66
        c18, s18 = math.cos(math.radians(18)), math.sin(math.radians(18))
        hd.add(cx + x * c18 - y * s18, cy + x * s18 + y * c18, .3 + .3 * rnd.random(), rnd.choice(['#ffe6c0', '#ffd6a0', '#fff4e6']), .25 + .35 * rnd.random())
    o.append(hd.out())
    # the jets: a thin bright spine inside a wide blue sheath, knotted, ending in lobes
    def jet(sign):
        s = '<g transform="translate(%d %d) rotate(%s)" opacity="%s">' % (cx, cy, f(math.degrees(ja) + (0 if sign > 0 else 180)), '1' if sign > 0 else '.72')
        s += '<path d="M0 -12L262 -44L262 44L0 12Z" fill="url(#%sjet)" opacity=".4" filter="url(#%sb20)"/>' % (u, u)
        s += '<path d="M0 -4L254 -13L254 13L0 4Z" fill="url(#%sjet)" opacity=".85" filter="url(#%sb3)"/>' % (u, u)
        s += '<path d="M0 -1.2L246 -3L246 3L0 1.2Z" fill="url(#%sjet)"/>' % u
        for dd in (44, 76, 112, 150, 190, 222):
            s += '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#e8eeff" opacity="%s" filter="url(#%sb3)"/>' % (f(dd), f(rnd.uniform(-2, 2)), f(4 + dd / 40), f(2 + dd / 90), f(.85 - dd / 340), u)
        L = 250
        for i in range(10):
            s += '<path d="%s" fill="%s" opacity="%s" filter="url(#%sb8)"/>' % (blob(L + rnd.uniform(-10, 30), rnd.uniform(-26, 26), rnd.uniform(24, 50), rnd.uniform(16, 34), rnd, 12, .35),
                                                                                   rnd.choice(['#b070ff', '#ff70c8', '#7a8cff', '#ff9ad0']), f(rnd.uniform(.12, .26)), u)
        s += '<path d="%s" fill="none" stroke="#ffc8f0" stroke-opacity=".4" stroke-width="2" filter="url(#%sb3)"/>' % (blob(L + 14, 0, 34, 26, rnd, 12, .25), u)
        s += '<circle cx="%d" cy="0" r="6" fill="#fff" opacity=".8" filter="url(#%sb3)"/><circle cx="%d" cy="0" r="1.8" fill="#fff"/>' % (L + 4, u, L + 4)
        return s + '</g>'
    o.append(jet(1)); o.append(jet(-1))
    # the core: bloom, then glare, then a pinpoint whiter than anything else on the card
    o.append('<circle cx="%d" cy="%d" r="300" fill="url(#%sbloom)" opacity=".7"/>' % (cx, cy, u))
    o.append('<circle cx="%d" cy="%d" r="120" fill="url(#%sbloom)"/>' % (cx, cy, u))
    o.append('<circle cx="%d" cy="%d" r="46" fill="#fff" opacity=".8" filter="url(#%sb20)"/><circle cx="%d" cy="%d" r="24" fill="#fff" opacity=".9" filter="url(#%sb8)"/>' % (cx, cy, u, cx, cy, u))
    sp = ''.join('<path d="M0 -%sL%s 0L0 %sL%s 0Z" fill="%s" opacity="%s" transform="translate(%d %d) rotate(%s)"/>' % (
        f(w), f(L), f(w), f(-L), c, f(op), cx, cy, f(a)) for a, L, w, c, op in [(0, 200, 2.2, '#dfe8ff', .55), (90, 200, 2.2, '#dfe8ff', .55), (0, 110, 1.1, '#ffffff', .85), (90, 110, 1.1, '#ffffff', .85), (45, 60, .9, '#c8d4ff', .3), (135, 60, .9, '#c8d4ff', .3)])
    o.append('<g filter="url(#%sb1)">%s</g>' % (u, sp))
    o.append('<circle cx="%d" cy="%d" r="11" fill="#fff"/>' % (cx, cy))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs + k.defs())
    return bg, obj, svg(W, H, top('TON 618 · z = 2.22 · 66 BILLION M☉ · CANES VENATICI'))


# ================================================================= SN 1987A
def sn1987a(u):
    rnd = random.Random(1987)
    haze = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(80, 200), rnd.uniform(60, 150), rnd, 12, .35),
                                                            rnd.choice(['#6a2a5a', '#3a4a8a', '#8a3a4a', '#2a5a6a']), f(rnd.uniform(.08, .18))) for _ in range(9))
    dd = Dots()
    for _ in range(1600):
        dd.add(rnd.uniform(0, W), rnd.uniform(0, H), .25 + .6 * rnd.random() ** 3, rnd.choice(['#ffffff', '#fff1dc', '#dfe8ff', '#ffe0c0']), .3 + .6 * rnd.random())
    bg = sky(u, H, ('#150f24', '#090716', '#020208'), 200, 1987, 2, extra='<g filter="url(#%sneb)">%s</g>%s' % (u, haze, dd.out()), extra_defs=blur(u, 'neb', 40, 80), cy='.4')
    k = Kit(u)
    cx, cy = 291, 334
    rot = -8
    rx, ry = 104, 78
    defs = blur(u, 'b1', 1) + blur(u, 'b2', 2.2) + blur(u, 'b5', 5) + blur(u, 'b12', 12)
    defs += rg(u + 'ej', [(0, '#fff0c8', '.95'), ('.3', '#ffb060', '.7'), ('.65', '#c84a28', '.35'), (1, '#6a1a18', 0)])
    o = []
    # the two outer rings: the waist of an hourglass, offset along the axis
    for dx, dy in ((-26, -104), (26, 104)):
        for w, op, fl in ((6, .16, 'b5'), (1.6, .45, 'b1')):
            o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="none" stroke="#ff5a7a" stroke-opacity="%s" stroke-width="%s" filter="url(#%s%s)" transform="rotate(%d %d %d)"/>' % (
                cx + dx, cy + dy, 176, 126, f(op), f(w), u, fl, rot, cx + dx, cy + dy))
        for i in range(10):
            t = rnd.uniform(0, 2 * math.pi)
            x, y = 176 * math.cos(t), 126 * math.sin(t)
            c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
            o.append('<circle cx="%s" cy="%s" r="%s" fill="#ff8aa0" opacity=".35" filter="url(#%sb2)"/>' % (f(cx + dx + x * c - y * s_), f(cy + dy + x * s_ + y * c), f(rnd.uniform(2, 4)), u))
    # a faint hourglass shell joining them
    o.append('<ellipse cx="%d" cy="%d" rx="160" ry="200" fill="#ff5a7a" opacity=".04" filter="url(#%sb12)" transform="rotate(%d %d %d)"/>' % (cx, cy, u, rot - 14, cx, cy))
    # the inner ring, glowing, then its string of pearls
    for w, op, col, fl in ((22, .18, '#ff8a4a', 'b12'), (8, .4, '#ffb070', 'b5'), (2.4, .8, '#ffd8a0', 'b1')):
        o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" filter="url(#%s%s)" transform="rotate(%d %d %d)"/>' % (
            cx, cy, rx, ry, col, f(op), f(w), u, fl, rot, cx, cy))
    c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    pearls = []
    ts = [2 * math.pi * i / 32 + rnd.uniform(-.07, .07) for i in range(32)]
    for t in ts:
        x, y = rx * math.cos(t), ry * math.sin(t)
        X, Y = cx + x * c - y * s_, cy + x * s_ + y * c
        b = rnd.uniform(.25, 1) ** .8 * (1.15 if math.cos(t + .6) > 0 else .8)
        pearls.append('<circle cx="%s" cy="%s" r="%s" fill="#fff0d8" opacity="%s" filter="url(#%sb5)"/>' % (f(X), f(Y), f(5 + 6 * b), f(.6 * b), u))
        pearls.append('<circle cx="%s" cy="%s" r="%s" fill="#ffffff" opacity="%s"/>' % (f(X), f(Y), f(1 + 2.2 * b), f(.6 + .4 * b)))
        if b > .85:
            pearls.append(k.gem(X, Y, 1.4, '#fff4e0', 9, .8, 0, 0, .6, 5))
    o.append(''.join(pearls))
    # the debris at the centre: a keyhole of glowing ejecta, pulled out along the ring's axis
    o.append('<ellipse cx="%d" cy="%d" rx="62" ry="50" fill="#6a8cff" opacity=".07" filter="url(#%sb12)" transform="rotate(%d %d %d)"/>' % (cx, cy, u, rot, cx, cy))
    kh = '<g transform="rotate(%d %d %d)">' % (rot + 10, cx, cy)
    kh += '<ellipse cx="%d" cy="%d" rx="17" ry="30" fill="url(#%sej)" filter="url(#%sb5)"/>' % (cx, cy - 4, u, u)
    kh += '<ellipse cx="%d" cy="%d" rx="11" ry="12" fill="url(#%sej)" filter="url(#%sb2)"/>' % (cx, cy - 16, u, u)
    for _ in range(9):
        kh += '<circle cx="%s" cy="%s" r="%s" fill="#ffd890" opacity="%s" filter="url(#%sb1)"/>' % (f(cx + rnd.gauss(0, 6)), f(cy - 6 + rnd.gauss(0, 12)), f(rnd.uniform(1.2, 2.6)), f(rnd.uniform(.4, .8)), u)
    kh += '<ellipse cx="%d" cy="%d" rx="4" ry="7" fill="#2a0806" opacity=".4" filter="url(#%sb2)"/></g>' % (cx, cy + 8, u)
    o.append(kh)
    # the two neighbours, star 2 and star 3
    o.append(k.gem(cx + 172, cy - 132, 3.4, '#dfe9ff', 52, 1, 0, .4))
    o.append(k.gem(cx - 118, cy + 150, 2.6, '#cfe0ff', 38, 1, 0, .4))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs + k.defs())
    return bg, obj, svg(W, H, top('LARGE MAGELLANIC CLOUD · 168,000 LY · SEEN 23 FEB 1987'))


# ================================================================= HUBBLE DEEP FIELD
GAL = {
    'ell': [(0, '#fff4dc', '1'), ('.25', '#ffd9a0', '.7'), ('.6', '#d89a60', '.22'), (1, '#8a5a30', 0)],
    'red': [(0, '#ffb080', '.9'), ('.4', '#e86a48', '.45'), (1, '#8a2a20', 0)],
    'blu': [(0, '#eef4ff', '1'), ('.3', '#9fbcff', '.6'), ('.7', '#5a78d8', '.18'), (1, '#3a4aa0', 0)],
    'wht': [(0, '#ffffff', '1'), ('.3', '#e8e0f0', '.55'), (1, '#9a90c0', 0)],
    'org': [(0, '#fff0d0', '1'), ('.3', '#ffb860', '.55'), (1, '#b86020', 0)],
}


def hdf_spiral(u, rnd, x, y, R, rot, inc, arms_col):
    g = '<g transform="translate(%s %s) rotate(%s) scale(1 %s)">' % (f(x), f(y), f(rot), f(inc))
    g += '<circle r="%s" fill="url(#%sgblu)" opacity=".5"/>' % (f(R * 1.2), u)
    na = rnd.choice([2, 2, 3])
    b = rnd.uniform(.28, .4)
    for ai in range(na):
        a0 = 2 * math.pi * ai / na
        pts = []
        for j in range(40):
            t = j / 39 * 2.6
            r = R * .12 * math.exp(b * t * 2.2)
            if r > R * 1.1: break
            pts.append((r * math.cos(a0 + t * 2.2), r * math.sin(a0 + t * 2.2)))
        path = 'M' + 'L'.join('%s %s' % (f(p), f(q)) for p, q in pts)
        g += '<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity=".6" stroke-linecap="round" filter="url(#%sgb2)"/>' % (path, arms_col, f(R * .16), u)
        g += '<path d="%s" fill="none" stroke="#eef2ff" stroke-width="%s" stroke-opacity=".4" stroke-linecap="round" filter="url(#%sgb1)"/>' % (path, f(R * .05), u)
        for p, q in pts[8::5]:
            g += '<circle cx="%s" cy="%s" r="%s" fill="#ffb0d8" opacity=".7"/>' % (f(p + rnd.uniform(-1, 1)), f(q + rnd.uniform(-1, 1)), f(R * .04 + .3))
    g += '<circle r="%s" fill="url(#%sgell)"/>' % (f(R * .38), u)
    return g + '</g>'


def hdf(u):
    rnd = random.Random(1995)
    # the far galaxies live in the sky layer, so they drift behind the near ones
    far = []
    for _ in range(420):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        r = .6 + 2.2 * rnd.random() ** 2
        far.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(x), f(y), f(r), f(r * rnd.uniform(.3, 1)), rnd.choice(['#ff9a7a', '#ffb88a', '#e8705a', '#cfd8ff', '#ffd6a0', '#b8c8ff', '#ff7a6a']), f(rnd.uniform(.2, .6)), f(rnd.uniform(0, 180)), f(x), f(y)))
    bg = svg(W, H, '<rect width="%d" height="%d" fill="url(#%shz)"/><g filter="url(#%sfb)">%s</g>' % (W, H, u, u, ''.join(far)),
             rg(u + 'hz', [(0, '#0c0c1a', 1), ('.6', '#06060e', 1), (1, '#020205', 1)], r=.75) + blur(u, 'fb', .8))
    k = Kit(u)
    defs = blur(u, 'gb1', .8) + blur(u, 'gb2', 2) + blur(u, 'gb4', 4)
    defs += ''.join(rg(u + 'g' + n, s) for n, s in GAL.items())
    o = []
    kinds = ['ell', 'red', 'blu', 'wht', 'org']
    # a crowd of small and middling galaxies: ellipticals, edge-on disks, blue irregulars, red smudges
    for _ in range(330):
        x, y = rnd.uniform(0, W), rnd.uniform(40, H - 20)
        r = 1.2 + 9 * rnd.random() ** 3
        kd = rnd.choice(kinds)
        e = rnd.uniform(.25, 1) if kd != 'ell' else rnd.uniform(.55, 1)
        rot = rnd.uniform(0, 180)
        o.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%sg%s)" transform="rotate(%s %s %s)"%s/>' % (f(x), f(y), f(r * 1.4), f(r * 1.4 * max(e, .35)), u, kd, f(rot), f(x), f(y), ' filter="url(#%sgb1)"' % u if r < 3 else ''))
        if kd == 'blu' and r > 4:
            for _ in range(rnd.randint(2, 5)):
                o.append('<circle cx="%s" cy="%s" r="%s" fill="#dfe8ff" opacity=".7"/>' % (f(x + rnd.uniform(-r, r)), f(y + rnd.uniform(-r, r) * e), f(rnd.uniform(.5, 1.2))))
    # edge-on disks with dust lanes
    for _ in range(9):
        x, y = rnd.uniform(40, W - 40), rnd.uniform(100, 620)
        r = rnd.uniform(8, 20); rot = rnd.uniform(0, 180)
        o.append('<g transform="translate(%s %s) rotate(%s)"><ellipse rx="%s" ry="%s" fill="url(#%sgorg)"/><ellipse rx="%s" ry="%s" fill="url(#%sgwht)" opacity=".7"/><path d="M%s 0H%s" stroke="#1a0c08" stroke-opacity=".55" stroke-width="%s" filter="url(#%sgb1)"/></g>' % (
            f(x), f(y), f(rot), f(r), f(r * .2), u, f(r * .4), f(r * .16), u, f(-r * .9), f(r * .9), f(r * .05 + .4), u))
    # the large spirals of the foreground
    for x, y, R, rot, inc, col in [(160, 230, 34, 20, .62, '#8fb0ff'), (420, 380, 44, -30, .78, '#9fc0ff'), (250, 520, 26, 60, .5, '#a8b8ff'), (470, 170, 22, 10, .9, '#9ab0ff'),
                                   (100, 420, 18, 110, .4, '#b0c0ff'), (360, 250, 15, 40, .7, '#9fc0ff'), (520, 560, 20, 150, .6, '#aabcff')]:
        o.append(hdf_spiral(u, rnd, x, y, R, rot, inc, col))
    # big ellipticals
    for x, y, R, e in [(300, 420, 22, .8), (140, 330, 14, .9), (505, 300, 16, .7), (60, 150, 12, .85)]:
        o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%s" fill="url(#%sgell)"/><ellipse cx="%d" cy="%d" rx="%s" ry="%s" fill="url(#%sgell)" opacity=".4" filter="url(#%sgb4)"/>' % (
            x, y, R, f(R * e), u, x, y, f(R * 2.2), f(R * 2.2 * e), u, u))
    # an interacting pair with a tidal bridge
    o.append('<path d="M198 610Q228 590 262 612" fill="none" stroke="#bcd0ff" stroke-opacity=".35" stroke-width="3" filter="url(#%sgb2)"/>' % u)
    o.append(hdf_spiral(u, rnd, 198, 612, 14, 30, .7, '#9fb8ff') + hdf_spiral(u, rnd, 264, 614, 11, -40, .8, '#b0c4ff'))
    # a gravitational arc
    o.append('<path d="M392 118A60 60 0 0 1 452 146" fill="none" stroke="#bcd4ff" stroke-opacity=".6" stroke-width="2" filter="url(#%sgb1)"/>' % u)
    # two foreground stars, with the spikes of the telescope
    o.append(k.gem(330, 162, 3.2, '#fff4e0', 70, 1, 45, .0))
    o.append(k.gem(92, 560, 2.2, '#e8eeff', 44, 1, 45, 0))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs + k.defs())
    return bg, obj, svg(W, H, top('RA 12H 36M 49S · DEC +62° 12′ · 2.6 ARCMIN · URSA MAJOR'))


# ================================================================= CMB
PLANCK = ['#0a0f5a', '#1a3aa8', '#3f7fe0', '#8cc4f4', '#eaf0e8', '#fdd8a0', '#f7a050', '#e0582a', '#a8201a', '#5a0a10']


def cmb(u):
    bg = sky(u, H, ('#0e0c18', '#06050e', '#010104'), 200, 1965, 2, cy='.4')
    cx, cy, rx, ry = 291, 336, 262, 131
    defs = blur(u, 'b3', 3) + blur(u, 'b20', 20, 60) + blur(u, 'b40', 40, 80)
    # temperature: noise, one channel, stretched through the Planck palette
    n = 32
    tab = []
    for i in range(n):
        t = min(1, max(0, (i / (n - 1) - .22) / .56))
        p = t * (len(PLANCK) - 1); j = min(len(PLANCK) - 2, int(p))
        tab.append(mix(PLANCK[j], PLANCK[j + 1], p - j))
    chan = lambda c: ' '.join('%.3f' % (int(h[c:c + 2], 16) / 255) for h in tab)
    defs += ('<filter id="%st" x="0" y="0" width="100%%" height="100%%" color-interpolation-filters="sRGB">'
             '<feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="4" seed="1965" result="n1"/>'
             '<feTurbulence type="fractalNoise" baseFrequency=".013" numOctaves="2" seed="2013" result="n2"/>'
             '<feComposite in="n1" in2="n2" operator="arithmetic" k2=".72" k3=".42" k4="-.03"/>'
             '<feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"/>'
             '<feComponentTransfer><feFuncR type="table" tableValues="%s"/><feFuncG type="table" tableValues="%s"/><feFuncB type="table" tableValues="%s"/></feComponentTransfer></filter>'
             '<clipPath id="%sov"><ellipse cx="%d" cy="%d" rx="%d" ry="%d"/></clipPath>') % (u, chan(1), chan(3), chan(5), u, cx, cy, rx, ry)
    defs += rg(u + 'rim', [('.8', '#000', 0), ('.94', '#000', '.25'), (1, '#000', '.6')])
    defs += rg(u + 'sheen', [(0, '#ffffff', '.14'), ('.5', '#ffffff', '.04'), (1, '#ffffff', 0)], .38, .3, .6)
    o = []
    o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#ff9a50" opacity=".16" filter="url(#%sb40)"/>' % (cx, cy, rx + 20, ry + 20, u))
    o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#4a8cff" opacity=".12" filter="url(#%sb20)"/>' % (cx - 40, cy + 10, rx, ry, u))
    o.append('<g clip-path="url(#%sov)"><rect x="%d" y="%d" width="%d" height="%d" filter="url(#%st)"/>' % (u, cx - rx, cy - ry, 2 * rx, 2 * ry, u))
    # graticule: Mollweide meridians and parallels, very faint
    gr = []
    for lon in range(-150, 181, 30):
        pts = []
        for j in range(61):
            lat = -90 + 180 * j / 60
            th = _moll_theta(math.radians(lat))
            x = cx + rx * (lon / 180) * math.cos(th); y = cy - ry * math.sin(th)
            pts.append((x, y))
        gr.append('M' + 'L'.join('%s %s' % (f(a), f(b)) for a, b in pts))
    for lat in range(-60, 61, 30):
        th = _moll_theta(math.radians(lat))
        y = cy - ry * math.sin(th); hw = rx * math.cos(th)
        gr.append('M%s %sH%s' % (f(cx - hw), f(y), f(cx + hw)))
    o.append('<path d="%s" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width=".6"/>' % ''.join(gr))
    o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="url(#%srim)"/><ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="url(#%ssheen)"/></g>' % (cx, cy, rx, ry, u, cx, cy, rx, ry, u))
    o.append('<ellipse cx="%d" cy="%d" rx="%s" ry="%s" fill="none" stroke="#fff4e0" stroke-opacity=".45" stroke-width="1"/>' % (cx, cy, f(rx + .5), f(ry + .5)))
    o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="none" stroke="#ffe0b8" stroke-opacity=".12" stroke-width="6" filter="url(#%sb3)"/>' % (cx, cy, rx + 3, ry + 3, u))
    # a thin temperature key under the map
    kx, ky, kw = cx - 110, cy + ry + 46, 220
    defs += '<linearGradient id="%skey">%s</linearGradient>' % (u, ''.join('<stop offset="%s" stop-color="%s"/>' % (f(i / (len(PLANCK) - 1)), c) for i, c in enumerate(PLANCK)))
    o.append('<rect x="%d" y="%d" width="%d" height="4" rx="2" fill="url(#%skey)" opacity=".8"/>' % (kx, ky, kw, u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .08), defs)
    return bg, obj, svg(W, H, top('2.725 K · 380,000 YEARS AFTER THE BIG BANG'))


def _moll_theta(phi):
    if abs(abs(phi) - math.pi / 2) < 1e-9:
        return phi
    th = phi
    for _ in range(30):
        th -= (2 * th + math.sin(2 * th) - math.pi * math.sin(phi)) / (2 + 2 * math.cos(2 * th))
    return th


PLATES = {
    'M13': m13, 'OMEGA-CEN': omega_cen, 'M44': m44, 'TON-618': ton618, 'SN-1987A': sn1987a,
    'HUBBLE-DEEP-FIELD': hdf, 'CMB': cmb,
}

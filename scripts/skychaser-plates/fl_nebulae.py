"""First Light: the nebulae, drawn in the manner of drawing.py.

Full-art plates: 582 × 832, the subject in y 90–600, the survey layer a quiet
label. The gas is painted in passes: soft glow, textured cloud (turbulence
displacement and a noise mask), filaments, dust in front, stars embedded.
"""
import math, random
from drawing import f, starfield, SPIKE_DEFS, grain, svg, scalebar
from more import sky, top, spike_star, W, HF

H = HF


def q(x):
    """A number for filter attributes, where one decimal is not enough."""
    if isinstance(x, str):
        return x
    s = '%.4f' % x
    return s.rstrip('0').rstrip('.') if '.' in s else s


class Kit:
    """Collects the defs of one layer; every id carries the plate prefix."""

    def __init__(self, u):
        self.u, self.d, self.n, self.cache = u, [], 0, {}

    def _id(self, k):
        self.n += 1
        return '%s%s%d' % (self.u, k, self.n)

    def rg(self, stops, cx=.5, cy=.5, r=.5, fx=None, fy=None):
        i = self._id('r')
        fo = '' if fx is None else ' fx="%s" fy="%s"' % (f(fx), f(fy))
        self.d.append('<radialGradient id="%s" cx="%s" cy="%s" r="%s"%s>%s</radialGradient>' % (i, f(cx), f(cy), f(r), fo, _stops(stops)))
        return 'url(#%s)' % i

    def lg(self, stops, x1=0, y1=0, x2=0, y2=1, user=False):
        i = self._id('l')
        us = ' gradientUnits="userSpaceOnUse"' if user else ''
        self.d.append('<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s"%s>%s</linearGradient>' % (i, f(x1), f(y1), f(x2), f(y2), us, _stops(stops)))
        return 'url(#%s)' % i

    def blur(self, sd):
        k = ('b', sd)
        if k not in self.cache:
            i = self._id('b')
            self.d.append('<filter id="%s" filterUnits="userSpaceOnUse" x="-100" y="-100" width="782" height="1032"><feGaussianBlur stdDeviation="%s"/></filter>' % (i, q(sd)))
            self.cache[k] = 'url(#%s)' % i
        return self.cache[k]

    def tex(self, freq, seed, oct=4, disp=0, sd=0, a=0, b=0, mfreq=None, mseed=None):
        """Turbulence: displace the source by `disp`, blur by `sd`, then mask its alpha with noise (alpha × (a·n + b))."""
        i = self._id('t')
        fq = q(freq)
        s = ['<filter id="%s" filterUnits="userSpaceOnUse" x="-100" y="-100" width="782" height="1032" color-interpolation-filters="sRGB">' % i,
             '<feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d" result="t"/>' % (fq, oct, seed)]
        src = 'SourceGraphic'
        if disp:
            s.append('<feDisplacementMap in="SourceGraphic" in2="t" scale="%s" xChannelSelector="R" yChannelSelector="G" result="d"/>' % q(disp)); src = 'd'
        if sd:
            s.append('<feGaussianBlur in="%s" stdDeviation="%s" result="g"/>' % (src, q(sd))); src = 'g'
        if a:
            nz = 't'
            if mfreq is not None:
                mq = q(mfreq)
                s.append('<feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d" result="t2"/>' % (mq, oct, mseed or seed + 1)); nz = 't2'
            s.append('<feColorMatrix in="%s" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 %s 0 %s" result="m"/>' % (nz, q(a), q(b)))
            s.append('<feComposite in="%s" in2="m" operator="in"/>' % src)
        elif src == 'SourceGraphic':
            s.append('<feOffset/>')
        s.append('</filter>')
        self.d.append(''.join(s))
        return 'url(#%s)' % i

    def relief(self, freq, seed, oct=4, sd=5, k3=.5, ss=6, k2=.5, az=-60, el=32, col='#ffe0b8', dc=1.1, point=None):
        """Sculpted light: the source's blurred alpha plus noise as a height map, lit from azimuth `az`."""
        i = self._id('v')
        fq = q(freq)
        self.d.append('<filter id="%s" filterUnits="userSpaceOnUse" x="-100" y="-100" width="782" height="1032" color-interpolation-filters="sRGB">'
                      '<feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d" result="n0"/>'
                      '<feColorMatrix in="n0" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2.6 -.8" result="n"/>'
                      '<feGaussianBlur in="SourceAlpha" stdDeviation="%s" result="b"/>'
                      '<feComposite in="b" in2="n" operator="arithmetic" k1="0" k2="%s" k3="%s" k4="0" result="h"/>'
                      '<feDiffuseLighting in="h" surfaceScale="%s" diffuseConstant="%s" lighting-color="%s" result="l">%s</feDiffuseLighting>'
                      '<feComposite in="l" in2="SourceAlpha" operator="in"/></filter>' % (i, fq, oct, seed, q(sd), q(k2), q(k3), q(ss), q(dc), col,
                                                                                        '<fePointLight x="%s" y="%s" z="%s"/>' % tuple(q(v) for v in point) if point else '<feDistantLight azimuth="%s" elevation="%s"/>' % (q(az), q(el))))
        return 'url(#%s)' % i

    def clip(self, d):
        i = self._id('c')
        self.d.append('<clipPath id="%s"><path d="%s"/></clipPath>' % (i, d))
        return 'url(#%s)' % i

    def mask(self, inner):
        i = self._id('m')
        self.d.append('<mask id="%s" maskUnits="userSpaceOnUse" x="-100" y="-100" width="782" height="1032">%s</mask>' % (i, inner))
        return 'url(#%s)' % i

    def defs(self):
        return ''.join(self.d)


def _stops(stops):
    out = []
    for s in stops:
        o, c = s[0], s[1]
        op = s[2] if len(s) > 2 else 1
        out.append('<stop offset="%s" stop-color="%s"%s/>' % (q(o), c, '' if op == 1 else ' stop-opacity="%s"' % q(op)))
    return ''.join(out)


def g(inner, filt=None, op=None, blend=None, extra=''):
    a = ''
    if filt: a += ' filter="%s"' % filt
    if op is not None: a += ' opacity="%s"' % f(op)
    if blend: a += ' style="mix-blend-mode: %s"' % blend
    return '<g%s%s>%s</g>' % (a, extra, ''.join(inner) if isinstance(inner, (list, tuple)) else inner)


def smooth(pts, closed=True, t=.5):
    """Catmull-Rom through the points, as cubic Béziers."""
    n = len(pts)
    if n < 3:
        return 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in pts)
    d = 'M%s %s' % (f(pts[0][0]), f(pts[0][1]))
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[0]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3)
        c2 = (p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3)
        d += 'C%s %s %s %s %s %s' % (f(c1[0]), f(c1[1]), f(c2[0]), f(c2[1]), f(p2[0]), f(p2[1]))
    return d + ('Z' if closed else '')


def lump(rnd, cx, cy, rx, ry, n=16, j=.25, rot=0, harm=3):
    """A closed organic outline: an ellipse with a few random harmonics."""
    ph = [(rnd.uniform(0, 6.3), rnd.uniform(-j, j) / (k ** .7)) for k in range(2, 2 + harm)]
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        k = 1 + sum(A * math.sin((h + 2) * a + p) for h, (p, A) in enumerate(ph)) + rnd.uniform(-j, j) * .35
        x, y = rx * k * math.cos(a), ry * k * math.sin(a)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return smooth(pts)


def P(d, fill, op=1, extra=''):
    return '<path d="%s" fill="%s"%s%s/>' % (d, fill, '' if op == 1 else ' opacity="%s"' % f(op), extra)


def E(cx, cy, rx, ry, fill, op=1, rot=0, extra=''):
    tr = ' transform="rotate(%s %s %s)"' % (f(rot), f(cx), f(cy)) if rot else ''
    return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s"%s%s%s/>' % (f(cx), f(cy), f(rx), f(ry), fill, '' if op == 1 else ' opacity="%s"' % f(op), tr, extra)


def C(cx, cy, r, fill, op=1, extra=''):
    return '<circle cx="%s" cy="%s" r="%s" fill="%s"%s%s/>' % (f(cx), f(cy), f(r), fill, '' if op == 1 else ' opacity="%s"' % f(op), extra)


def S(d, col, w, op=1, extra=''):
    return '<path d="%s" fill="none" stroke="%s" stroke-width="%s"%s stroke-linecap="round"%s/>' % (d, col, f(w), '' if op == 1 else ' stroke-opacity="%s"' % f(op), extra)


def glow(k, cx, cy, r, col, op=1, core=None, fall=.55):
    """A soft radial glow: `col` at the centre fading to nothing."""
    st = [(0, core or col, op), (fall * .45, col, op * .55), (fall, col, op * .2), (1, col, 0)]
    return C(cx, cy, r, k.rg(st))


def dust_stars(rnd, box, n, cols=('#fff4e6', '#dfe8ff', '#ffe2c4', '#ffffff'), rmax=1.1, opmax=.9, test=None):
    x0, y0, x1, y1 = box
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if test and not test(x, y):
            continue
        m = rnd.random() ** 3
        out.append(C(x, y, .35 + rmax * m, rnd.choice(cols), .25 + (opmax - .25) * rnd.random() ** .5))
    return ''.join(out)


def star6(x, y, r, col, L, op=1):
    """A JWST-style star: six long spikes and two short ones."""
    s = ['<g opacity="%s">' % f(op), C(x, y, r * 5, col, .12), C(x, y, r * 2.2, col, .35)]
    for a in (90, 30, 150, 210, 330, 270):
        t = math.radians(a)
        s.append('<path d="M%s %sL%s %s" stroke="%s" stroke-width="%s" stroke-opacity=".6" stroke-linecap="round"/>' % (
            f(x), f(y), f(x + L * math.cos(t)), f(y + L * math.sin(t)), col, f(max(.5, r * .45))))
    for a in (0, 180):
        t = math.radians(a)
        s.append('<path d="M%s %sL%s %s" stroke="%s" stroke-width="%s" stroke-opacity=".45"/>' % (f(x), f(y), f(x + L * .45 * math.cos(t)), f(y + L * .45 * math.sin(t)), col, f(max(.4, r * .3))))
    s.append(C(x, y, r, '#fff'))
    s.append('</g>')
    return ''.join(s)


def finish(k, u, body, gr=.1):
    return svg(W, H, ''.join(body) + grain(u + 'o', W, H, gr), k.defs())


# ================================================================= M16, THE PILLARS OF CREATION
def column(k, rnd, spine, widths, light=(.45, -1), rim='#ffe2a0', body=('#6a3c1c', '#2a150a'), clump=1.0):
    """A dust column built of clumps along a spine (base → tip); lit from `light` so one edge glows."""
    lx, ly = light; ll = math.hypot(lx, ly); lx, ly = lx / ll, ly / ll
    pts = []
    for i in range(len(spine) - 1):
        (x0, y0), (x1, y1) = spine[i], spine[i + 1]
        w0, w1 = widths[i], widths[i + 1]
        steps = max(2, int(math.hypot(x1 - x0, y1 - y0) / 9))
        for s in range(steps):
            t = s / steps
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w0 + (w1 - w0) * t))
    pts.append((spine[-1][0], spine[-1][1], widths[-1]))
    lumps = []
    for x, y, w in pts:
        for _ in range(2):
            r = w * rnd.uniform(.2, .58) ** 1.1 * clump
            lumps.append((x + rnd.uniform(-.3, .3) * w, y + rnd.uniform(-6, 6), r, r * rnd.uniform(.7, 1.2)))
    tx, ty = spine[-1]
    lumps += [(tx + rnd.uniform(-.3, .3) * widths[-1], ty - widths[-1] * rnd.uniform(.05, .35), widths[-1] * rnd.uniform(.25, .42), widths[-1] * rnd.uniform(.22, .36)) for _ in range(5)]
    shape = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" transform="rotate(%s %s %s)"/>' % (f(x), f(y), f(rx), f(ry), f(rnd.uniform(-30, 30)), f(x), f(y)) for x, y, rx, ry in lumps)
    ys = [p[1] for p in pts]; top_y = min(ys) - widths[-1] * .7; bot = max(ys)
    return shape, top_y, bot, (lx, ly)


def m16(u):
    rnd = random.Random(6611)
    bg = sky(u, H, ('#0f2a2c', '#081616', '#020606'), 240, 6611, 3, tints=('#ffffff', '#e6fff6', '#fff1dc', '#d8f0ff'))
    k = Kit(u)
    o = []
    # the ionised gas: teal above, going green and gold toward the columns
    field = k.mask(P('M-40 -40H622V900H-40Z', k.rg([(0, '#fff'), (.6, '#fff', .92), (1, '#fff', 0)], .5, .4, .64)))
    gas = [P('M-40 -40H622V900H-40Z', k.lg([(0, '#2a7f92'), (.3, '#379a94'), (.55, '#5f9a74'), (.78, '#9c8a4e'), (1, '#5a3e22')]))]
    for _ in range(30):
        x, y = rnd.uniform(-40, 620), rnd.uniform(20, 720)
        c = rnd.choice(['#6fd0cc', '#4cb4b8', '#98dcc0', '#2e7888', '#205c70', '#b8e0b0'] if y < 380 else ['#c8a458', '#a88a4a', '#d8bc70', '#7a9468', '#8a6030', '#6a9a88'])
        sc = 1 if y < 380 else .7
        gas.append(P(lump(rnd, x, y, rnd.uniform(50, 140) * sc, rnd.uniform(30, 90) * sc, 12, .35), c, rnd.uniform(.25, .6)))
    o.append(g(g(gas, k.tex(.008, 16, 4, disp=110, sd=7)), extra=' mask="%s"' % field))
    mott = [P(lump(rnd, rnd.uniform(0, 582), rnd.uniform(40, 620), rnd.uniform(50, 130), rnd.uniform(30, 90), 12, .4), rnd.choice(['#b8fff0', '#d8fff0', '#fff4c0', '#9ae8e0']), rnd.uniform(.25, .5)) for _ in range(26)]
    o.append(g(mott, k.tex(.02, 7, 5, disp=120, sd=2, a=3.4, b=-1.5, mfreq=.012, mseed=70), op=.55, blend='screen'))
    dark = [P(lump(rnd, rnd.uniform(0, 582), rnd.uniform(60, 560), rnd.uniform(20, 60), rnd.uniform(14, 40), 12, .45), '#0a2228', rnd.uniform(.3, .55)) for _ in range(18)]
    o.append(g(dark, k.tex(.03, 12, 4, disp=60, sd=2, a=3, b=-1.1), op=.5))
    # light from NGC 6611, above and to the right
    o.append(glow(k, 360, 40, 460, '#fff8e0', .34, fall=.7))
    o.append(glow(k, 268, 150, 150, '#fff2c0', .42))
    o.append(glow(k, 380, 320, 110, '#fff0c0', .32))
    o.append(glow(k, 520, 450, 80, '#fff0c0', .26))

    cols = [
        ([(175, 900), (186, 800), (204, 690), (212, 580), (208, 480), (214, 400), (234, 320), (250, 250), (256, 195), (272, 150)],
         [220, 170, 120, 88, 70, 62, 64, 74, 80, 70], 1.0),
        ([(385, 900), (374, 800), (362, 700), (352, 610), (350, 530), (358, 460), (360, 400), (368, 352), (382, 322)],
         [180, 130, 100, 80, 60, 50, 56, 62, 54], .95),
        ([(520, 900), (512, 800), (508, 710), (514, 630), (522, 560), (520, 505), (530, 468)],
         [140, 100, 70, 52, 44, 44, 46], .9),
    ]
    rough = k.tex(.04, 3, 4, disp=18, sd=1)
    fibre = k.tex('.07 .012', 9, 3, a=2.4, b=-1.05)
    relief = k.relief(.03, 44, 4, sd=4, k2=.55, k3=.45, ss=14, az=-55, el=30, dc=1.25)
    steam = k.tex(.018, 21, 4, disp=70, sd=6, a=2.2, b=-.5, mfreq=.03, mseed=8)
    halo, bodies, haze = [], [], []
    for n, (spine, widths, cl) in enumerate(cols):
        shape, top_y, bot, (lx, ly) = column(k, rnd, spine, widths, clump=cl)
        tx = spine[-1][0]
        # the shape, as a reusable symbol
        sid = '%scol%d' % (u, n)
        k.d.append('<g id="%s">%s</g>' % (sid, shape))
        use = lambda fill, dx=0, dy=0, op=1, extra='': '<use href="#%s" fill="%s" x="%s" y="%s"%s%s/>' % (sid, fill, f(dx), f(dy), '' if op == 1 else ' opacity="%s"' % f(op), extra)
        halo.append(use('#ffe2a0', 2, -3, .7))
        x0 = min(p[0] for p in spine) - widths[0] * .5; x1 = max(p[0] for p in spine) + widths[0] * .5
        hl = k.lg([(0, '#fff6d0'), (.1, '#ffd890'), (.3, '#e89a48'), (.6, '#a85a24'), (1, '#6a3414')], 0, top_y, 0, 900, True)
        albedo = k.lg([(0, '#ffeccc'), (.06, '#eab070'), (.18, '#a8622c'), (.42, '#62341a'), (1, '#2a1408')], 0, top_y, 0, 860, True)
        crest = k.lg([(0, '#ffe6b0', .55), (.05, '#f0b068', .3), (.12, '#b8702e', .12), (.24, '#7a4018', 0)], 0, top_y, 0, top_y + 520, True)
        shade = k.lg([(0, '#000', .7), (.4, '#000', .3), (.62, '#000', 0), (1, '#000', 0)], x0, 0, x1, 0, True)
        bb = [use(hl, 1.5, -2.5),
              use('#000', 0, 1.5, 1, ' filter="%s"' % relief),
              use(albedo, 0, 1.5, 1, ' style="mix-blend-mode: multiply"'),
              use('#6a4020', 0, 1.5, .35, ' filter="%s" style="mix-blend-mode: multiply"' % fibre),
              use(shade, 0, 1.5),
              use(crest, 0, 1.5, 1, ' style="mix-blend-mode: screen"')]
        bodies.append(g(bb, rough))
        # the warm glow of the crest, strongest at the tip and fading down the column
        haze.append(E(tx + 6, top_y + 30, widths[-1] * 1.1, 60, '#fff2c8', .5))
        haze.append(E(tx + 16, top_y - 20, widths[-1] * .9, 50, '#ffeec8', .3, 12))
    o.append(g(halo, k.blur(7), blend='screen'))
    o.append(g(haze, steam, op=.8, blend='screen'))
    o.extend(bodies)
    # the columns' gradients are drawn in objectBoundingBox; darken each column's base toward the foreground
    fg = [P(lump(rnd, rnd.uniform(0, 582), rnd.uniform(650, 800), rnd.uniform(90, 180), rnd.uniform(40, 80), 12, .3), '#140a05', rnd.uniform(.5, .85)) for _ in range(10)]
    o.append(g(fg, k.tex(.02, 4, 3, disp=40, sd=8)))
    # stars: a few in front, a red one buried in the tallest column
    o.append(dust_stars(rnd, (0, 90, 582, 620), 60, ('#fff8e8', '#e8fff8', '#ffe8c8'), 1, .8))
    o.append(spike_star(229, 330, 1.1, '#ffb080', 7, .75, .6))
    for x, y, r in [(96, 180, 1.6), (452, 250, 1.3), (70, 470, 1.2), (560, 150, 1.1), (440, 560, 1.4)]:
        o.append(spike_star(x, y, r, '#fff4dc', 10 + 6 * r, .9, .7))
    obj = finish(k, u, o, .12)
    ann = top('RA 18H 18M 48S · DEC −13° 49′ · SERPENS') + scalebar(22, 800, 60, '1 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= THE HORSEHEAD
def horsehead(u):
    rnd = random.Random(434)
    bg = sky(u, H, ('#1c1020', '#0c0812', '#030205'), 280, 434, 2, tints=('#ffffff', '#dfe8ff', '#ffe8dc', '#cfe0ff'))
    k = Kit(u)
    o = []
    # IC 434: the red sheet of hydrogen, lit by σ Orionis; striated, brightest just above the dark front
    em = k.mask(P('M-40 -40H622V900H-40Z', k.lg([(0, '#fff', 0), (.14, '#fff', .35), (.4, '#fff', .9), (.62, '#fff'), (1, '#fff')], 0, 0, 0, 1)))
    sheet = [P('M-40 60H622V620H-40Z', k.lg([(0, '#4a0e1c'), (.4, '#8a1a2a'), (.7, '#c42c38'), (.86, '#e8484a'), (1, '#ff7060')], 0, 60, 0, 560, True))]
    for _ in range(30):
        x, y = rnd.uniform(-40, 620), rnd.uniform(120, 520)
        sheet.append(E(x, y, rnd.uniform(30, 80), rnd.uniform(70, 160), rnd.choice(['#ff6a60', '#e03848', '#ff8a70', '#a01c30', '#ff5070', '#c02838']), rnd.uniform(.25, .5), rnd.uniform(-10, 10)))
    o.append(g(g(sheet, k.tex('.009 .004', 34, 4, disp=80, sd=4)), extra=' mask="%s"' % em))
    streaks = [E(rnd.uniform(-20, 600), rnd.uniform(220, 470), rnd.uniform(6, 18), rnd.uniform(60, 150), rnd.choice(['#ffb0a0', '#ff8878', '#ffd0c0']), rnd.uniform(.2, .4), rnd.uniform(-6, 6)) for _ in range(34)]
    o.append(g(g(streaks, k.tex('.03 .008', 8, 4, disp=40, sd=2.5, a=2.6, b=-1)), op=.4, blend='screen', extra=' mask="%s"' % em))
    dark_sheet = [E(rnd.uniform(-20, 600), rnd.uniform(140, 420), rnd.uniform(14, 40), rnd.uniform(50, 120), '#1a0610', rnd.uniform(.2, .45), rnd.uniform(-10, 10)) for _ in range(20)]
    o.append(g(dark_sheet, k.tex('.02 .007', 18, 3, disp=50, sd=4, a=2.4, b=-.8)))
    # the ionisation front along the cloud's edge
    o.append(E(300, 480, 360, 70, k.rg([(0, '#ffb0a0', .75), (.5, '#ff6a5a', .35), (1, '#ff4a4a', 0)]), 1))
    # the dark cloud, Barnard 33 rising out of it
    edge = [(-60, 520), (-10, 506), (40, 514), (84, 500), (112, 490), (128, 476), (146, 488), (182, 500), (214, 494)]
    head = [(236, 490), (250, 468), (260, 440), (264, 410), (258, 390), (240, 382), (222, 380), (204, 374), (188, 364), (178, 350), (175, 332),
            (182, 314), (196, 298), (214, 282), (232, 266), (248, 252), (260, 238), (266, 226), (274, 230), (282, 222), (292, 232),
            (304, 250), (318, 276), (326, 304), (332, 336), (338, 372), (344, 410), (352, 446), (372, 476), (404, 494)]
    edge2 = [(446, 502), (470, 494), (484, 480), (500, 494), (540, 508), (600, 504), (650, 516)]
    cloud = smooth(edge + head + edge2 + [(650, 900), (-60, 900)])
    body = []
    body.append(P(cloud, '#ff7a64', .8, ' transform="translate(0 -3)" filter="%s"' % k.blur(3)))
    body.append(P(cloud, '#ffc0a8', .7, ' transform="translate(0 -1.2)" filter="%s"' % k.blur(.8)))
    o.append(g(body, k.tex(.035, 5, 4, disp=10), blend='screen'))
    topfade = k.mask('<rect x="0" y="0" width="582" height="900" fill="%s"/>' % k.lg([(0, '#fff'), (.3, '#fff', .6), (.6, '#fff', 0)], 0, 200, 0, 700, True))
    mass = [P(cloud, k.lg([(0, '#140709'), (.25, '#0a0406'), (1, '#040203')], 0, 200, 0, 832, True)),
            '<g mask="%s">%s</g>' % (topfade, P(cloud, '#000', .5, ' filter="%s"' % k.relief(.022, 91, 4, sd=5, k2=.6, k3=.4, ss=8, az=-90, el=38, col='#6a2020', dc=.9))),
            P(cloud, '#2a0e12', .45, ' filter="%s"' % k.tex(.018, 23, 4, a=2.8, b=-1.3))]
    o.append(g(mass, k.tex(.035, 5, 4, disp=10, sd=.6)))
    # the mane: dark wisps trailing up and back from the head
    mane = [S('M%s %sC%s %s %s %s %s %s' % (f(x), f(y), f(x + 20), f(y - 30), f(x + 40), f(y - 60), f(x + rnd.uniform(40, 80)), f(y - rnd.uniform(80, 140))), '#120608', rnd.uniform(6, 16), rnd.uniform(.25, .5))
            for x, y in [(340, 260), (350, 300), (356, 340), (348, 280), (360, 380)]]
    o.append(g(mane, k.tex(.03, 17, 3, disp=30, sd=4)))
    # NGC 2023: blue reflection glow in the cloud, its star at the centre
    o.append(g([glow(k, 470, 590, 90, '#8ab8ff', .5, '#e8f2ff'), glow(k, 460, 600, 40, '#cfe2ff', .6, '#ffffff')], k.tex(.03, 29, 3, disp=30, sd=2), blend='screen'))
    o.append(spike_star(468, 594, 1.6, '#dfeaff', 12, .95, .7))
    # the Flame's edge, glowing gold at the corner of the cloud
    flame = [glow(k, 44, 590, 130, '#ffa040', .7, '#ffe0a0'), glow(k, 64, 572, 60, '#ffc070', .8, '#fff4d8')]
    o.append(g(flame, k.tex(.022, 39, 4, disp=70, sd=2.5, a=2.4, b=-.6), blend='screen'))
    o.append(g([S('M-10 640C30 612 52 598 64 560C70 540 88 528 104 520', '#0a0405', 12, .85), S('M30 690C46 650 80 640 100 606', '#0a0405', 8, .7), S('M60 590C84 596 110 610 140 606', '#0a0405', 6, .6)], k.tex(.04, 41, 3, disp=16, sd=2)))
    # Alnitak, blue-white and blinding
    ax, ay = 104, 146
    o.append(glow(k, ax, ay, 240, '#a8c8ff', .36, '#e8f0ff', .5))
    o.append(glow(k, ax, ay, 70, '#e0ecff', .8, '#ffffff'))
    o.append(spike_star(ax, ay, 4, '#d8e6ff', 70, 1, 1.1))
    o.append(spike_star(470, 150, 1.4, '#fff1e0', 14, .9, .7))
    o.append(dust_stars(rnd, (0, 90, 582, 480), 70, ('#fff4ec', '#dfe8ff', '#ffe2d8'), 1, .8))
    o.append(dust_stars(rnd, (0, 520, 582, 760), 16, ('#ffd8c8', '#ffe8dc'), .7, .5))
    obj = finish(k, u, o, .12)
    ann = top('RA 05H 40M 59S · DEC −02° 27′ · ORION') + scalebar(22, 800, 70, '1 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= M57, THE RING
def m57(u):
    rnd = random.Random(6720)
    cx, cy, rot = 291, 330, -32
    bg = sky(u, H, ('#0e1428', '#070b18', '#02030a'), 320, 6720, 4)
    k = Kit(u)
    o = []
    tr = ' transform="rotate(%s %s %s)"' % (rot, cx, cy)
    # the outer halo: faint red petals and loops from the star's earlier winds
    petals = []
    for i in range(18):
        a = 2 * math.pi * i / 18 + rnd.uniform(-.1, .1)
        r = rnd.uniform(150, 190)
        x, y = cx + r * math.cos(a) * 1.05, cy + r * math.sin(a) * .9
        petals.append(E(x, y, rnd.uniform(34, 60), rnd.uniform(16, 30), rnd.choice(['#c83a48', '#a82a3a', '#e05060']), rnd.uniform(.35, .6), math.degrees(a) + 90))
    o.append(g(g(petals, k.tex(.03, 11, 4, disp=30, sd=5, a=2.4, b=-.7)), op=.4, extra=tr))
    loops = ''.join(S('M%s %sA%s %s %s 0 1 %s %s' % (f(cx + 150 * math.cos(a0)), f(cy + 130 * math.sin(a0)), f(rnd.uniform(40, 70)), f(rnd.uniform(30, 50)), f(rnd.uniform(0, 90)), f(cx + 150 * math.cos(a0 + .6)), f(cy + 130 * math.sin(a0 + .6))),
                        '#e8606a', rnd.uniform(1.2, 2.4), rnd.uniform(.25, .45)) for a0 in [rnd.uniform(0, 6.3) for _ in range(9)])
    o.append(g(loops, k.tex(.04, 12, 3, disp=18, sd=1.2), op=.6, extra=tr))
    o.append(E(cx, cy, 200, 170, k.rg([(0, '#ff6a70', .0), (.55, '#c83a50', .12), (.8, '#8a2040', .06), (1, '#5a1830', 0)]), 1, rot))
    # the ring itself: a barrel of gas seen end on — teal in the cavity, green-yellow, then red at the rim
    RX, RY = 136, 102
    ring = k.rg([(0, '#2a78b0', .3), (.38, '#3498b8', .38), (.52, '#50b8b4', .55), (.6, '#9cd89a', .78), (.68, '#ecdc6c', .92), (.74, '#ffb452', .95), (.81, '#f2623c', .95), (.88, '#c02e3a', .75), (.95, '#7a1a2c', .3), (1, '#4a1020', 0)])
    body = [E(cx, cy, RX, RY, ring)]
    # brighter along the long sides, fainter at the ends of the major axis
    body.append(E(cx - RX * .95, cy, 44, 70, '#05060e', .5, extra=' filter="%s"' % k.blur(16)))
    body.append(E(cx + RX * .95, cy, 44, 70, '#05060e', .5, extra=' filter="%s"' % k.blur(16)))
    o.append(g(g(body, k.tex(.035, 57, 4, disp=10, sd=1.2)), extra=tr))
    # the ring's clumps: bright knots in the rim, dark globules on its inside edge, radial spokes
    knots, dark, spokes = [], [], []
    for _ in range(260):
        a = rnd.uniform(0, 2 * math.pi); t = rnd.gauss(.8, .08)
        x, y = cx + RX * t * math.cos(a), cy + RY * t * math.sin(a)
        knots.append(C(x, y, rnd.uniform(1.5, 5), rnd.choice(['#ffd070', '#ff8a50', '#ffe890', '#ff6a48', '#e8f090']), rnd.uniform(.25, .6)))
    for _ in range(120):
        a = rnd.uniform(0, 2 * math.pi); t = rnd.gauss(.74, .06)
        x, y = cx + RX * t * math.cos(a), cy + RY * t * math.sin(a)
        dark.append(E(x, y, rnd.uniform(.8, 1.8), rnd.uniform(2, 4.5), '#3a1020', rnd.uniform(.15, .35), math.degrees(a) + 90))
    for _ in range(70):
        a = rnd.uniform(0, 2 * math.pi); t0 = rnd.uniform(.55, .7); t1 = t0 + rnd.uniform(.15, .35)
        spokes.append(S('M%s %sL%s %s' % (f(cx + RX * t0 * math.cos(a)), f(cy + RY * t0 * math.sin(a)), f(cx + RX * t1 * math.cos(a)), f(cy + RY * t1 * math.sin(a))),
                        rnd.choice(['#fff0a0', '#ffc070', '#ffd890']), rnd.uniform(.8, 2), rnd.uniform(.12, .3)))
    o.append(g([g(knots, k.blur(1.6)), g(spokes, k.blur(.8)), g(dark, k.blur(.6))], k.tex(.05, 58, 3, disp=6), extra=tr))
    o.append(g(E(cx, cy, RX * .82, RY * .82, 'none', 1, extra=' stroke="#fff4b0" stroke-width="10" stroke-opacity=".22"'), k.blur(6), blend='screen', extra=tr))
    # the cavity: faint blue haze and the central white dwarf
    haze = [E(cx + rnd.uniform(-40, 40), cy + rnd.uniform(-30, 30), rnd.uniform(20, 50), rnd.uniform(15, 40), rnd.choice(['#8ad0f0', '#5ab0e0', '#a0e8e0']), rnd.uniform(.25, .5)) for _ in range(14)]
    o.append(g(haze, k.tex(.03, 59, 4, disp=24, sd=4, a=2.2, b=-.5), op=.5, blend='screen', extra=tr))
    o.append(C(cx, cy, 5, '#cfe4ff', .35, ' filter="%s"' % k.blur(2)))
    o.append(C(cx, cy, 1.2, '#f4f8ff', .9))
    o.append(spike_star(cx + 138, cy - 52, 1.3, '#fff2e0', 10, .8, .6))
    o.append(dust_stars(rnd, (0, 90, 582, 620), 40, rmax=1, opmax=.75))
    obj = finish(k, u, o, .1)
    ann = top('RA 18H 53M 35S · DEC +33° 01′ · LYRA') + scalebar(22, 800, 70, '1 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= THE HELIX
def helix(u):
    rnd = random.Random(7293)
    cx, cy = 291, 334
    bg = sky(u, H, ('#0c1426', '#060a16', '#020308'), 300, 7293, 3)
    k = Kit(u)
    o = []
    # the outer loop, tipped against the main ring: it shows as arcs beyond the rim, upper right and lower left
    ox, oy, orx, ory, orot = cx + 30, cy - 22, 236, 150, -44
    outer = []
    for i in range(46):
        a = 2 * math.pi * i / 46
        w = .15 + .85 * abs(math.cos(a)) ** 2
        outer.append(E(ox + orx * math.cos(a), oy + ory * math.sin(a), rnd.uniform(26, 44), rnd.uniform(14, 26), rnd.choice(['#d8404a', '#b8303e', '#f06a50', '#a02838']), rnd.uniform(.35, .6) * w, math.degrees(a) + 90))
    o.append(g(g(outer, k.tex(.025, 3, 4, disp=40, sd=5, a=2.4, b=-.6)), op=.8, extra=' transform="rotate(%s %s %s)"' % (orot, ox, oy)))
    o.append(E(cx, cy, 260, 240, k.rg([(0, '#ff6a60', 0), (.6, '#c83a44', .1), (.85, '#8a2238', .06), (1, '#5a1830', 0)])))
    # the main ring: red-orange rim, a thick clumpy torus
    RX, RY = 176, 162
    ring = k.rg([(0, '#1e5a8a', .25), (.3, '#2a86a8', .35), (.46, '#4ab0b0', .5), (.56, '#b8c870', .6), (.63, '#f0a050', .8), (.72, '#e8583a', .9), (.84, '#c0303a', .75), (.93, '#80203a', .35), (1, '#5a1830', 0)])
    clumps = [E(cx, cy, RX, RY, ring)]
    for _ in range(90):
        a = rnd.uniform(0, 2 * math.pi); t = rnd.gauss(.78, .1)
        clumps.append(E(cx + RX * t * math.cos(a), cy + RY * t * math.sin(a), rnd.uniform(14, 34), rnd.uniform(8, 20), rnd.choice(['#ff7a50', '#e84a3a', '#f08850', '#c8303a']), rnd.uniform(.15, .3), math.degrees(a) + 90))
    o.append(g(clumps, k.tex(.03, 71, 4, disp=34, sd=2.5)))
    o.append(g([E(cx, cy, RX, RY, '#000')], k.tex(.022, 72, 4, disp=20, sd=6, a=2.6, b=-1.1), op=.45))
    # the inner disc: blue-green oxygen glow, strongest toward the rim's inner edge
    disc = [E(cx, cy, RX * .64, RY * .64, k.rg([(0, '#2a6aa8', .18), (.55, '#2a98b8', .32), (.85, '#50c0b0', .45), (1, '#70c8a0', 0)]))]
    disc += [E(cx + rnd.uniform(-70, 70), cy + rnd.uniform(-60, 60), rnd.uniform(20, 50), rnd.uniform(16, 40), rnd.choice(['#6ac0e0', '#4aa0d0', '#80d8c8']), rnd.uniform(.1, .22)) for _ in range(16)]
    o.append(g(disc, k.tex(.026, 73, 4, disp=40, sd=4, a=2, b=-.3), blend='screen'))
    rays = []
    for _ in range(170):
        a = rnd.uniform(0, 2 * math.pi); t0 = rnd.uniform(.62, .76); t1 = t0 + rnd.uniform(.1, .22)
        rays.append(S('M%s %sL%s %s' % (f(cx + RX * t0 * math.cos(a)), f(cy + RY * t0 * math.sin(a)), f(cx + RX * t1 * math.cos(a)), f(cy + RY * t1 * math.sin(a))),
                      rnd.choice(['#ffb070', '#ff8a5a', '#6a1422', '#ffd090']), rnd.uniform(1, 3), rnd.uniform(.1, .28)))
    o.append(g(rays, k.tex(.04, 74, 3, disp=8, sd=1)))
    o.append(g(E(cx, cy, RX * .66, RY * .66, 'none', 1, extra=' stroke="#ffc878" stroke-width="12" stroke-opacity=".25"'), k.tex(.035, 75, 3, disp=30, sd=5, a=2.4, b=-.6), blend='screen'))
    # cometary knots on the ring's inner edge: bright heads toward the star, tails streaming outward
    tails, heads = [], []
    for _ in range(360):
        a = rnd.uniform(0, 2 * math.pi); t = rnd.gauss(.66, .06)
        ca, sa = math.cos(a), math.sin(a)
        x, y = cx + RX * t * ca, cy + RY * t * sa
        L = rnd.uniform(5, 14)
        tails.append(S('M%s %sL%s %s' % (f(x), f(y), f(x + L * ca), f(y + L * sa)), rnd.choice(['#c83a3a', '#a82a34', '#e05a48']), rnd.uniform(1, 2), rnd.uniform(.3, .55)))
        heads.append(C(x - ca, y - sa, rnd.uniform(.6, 1.2), rnd.choice(['#ffe8b8', '#ffd098', '#ffc8a0']), rnd.uniform(.35, .7)))
    o.append(g(tails, k.blur(.8)))
    o.append(g(heads, k.blur(.4)))
    # the central white dwarf
    o.append(C(cx, cy, 16, k.rg([(0, '#dff0ff', .7), (.4, '#a8d0ff', .25), (1, '#80b0ff', 0)])))
    o.append(spike_star(cx, cy, 1.6, '#e8f2ff', 12, 1, .7))
    for x, y, r in [(96, 170, 1.4), (470, 560, 1.3), (520, 180, 1.1), (180, 420, 1.0)]:
        o.append(spike_star(x, y, r, '#fff4e4', 9 + 5 * r, .85, .6))
    o.append(dust_stars(rnd, (0, 90, 582, 620), 50, rmax=1, opmax=.7))
    obj = finish(k, u, o, .1)
    ann = top('RA 22H 29M 39S · DEC −20° 50′ · AQUARIUS') + scalebar(22, 800, 60, '1 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= THE CAT'S EYE
def bubble(k, cx, cy, rx, ry, rot, col, fill=.28, rim=.8, w=2.4):
    """A limb-brightened shell: faint inside, bright toward its edge, a crisp rim."""
    fillg = k.rg([(0, col, fill * .25), (.7, col, fill * .6), (.92, col, fill * 1.6), (1, col, 0)])
    return (E(cx, cy, rx, ry, fillg, 1, rot) +
            E(cx, cy, rx * .985, ry * .975, 'none', 1, rot, ' stroke="%s" stroke-width="%s" stroke-opacity="%s"' % (col, f(w), f(rim))))


def cats_eye(u):
    rnd = random.Random(6543)
    cx, cy, R0 = 291, 330, -28
    bg = sky(u, H, ('#0c1022', '#060914', '#020308'), 300, 6543, 3)
    k = Kit(u)
    o = []
    # the halo: faint onion-skin shells, one every 1,500 years, broken and knotted
    o.append(C(cx, cy, 275, k.rg([(0, '#ff8a70', .22), (.3, '#d0507a', .12), (.65, '#7a3a8a', .06), (1, '#3a1a4a', 0)])))
    rings = []
    for i, r in enumerate(range(96, 250, 17)):
        rings.append(E(cx + rnd.uniform(-6, 6), cy + rnd.uniform(-6, 6), r * 1.02, r * .95, 'none', 1, rnd.uniform(-12, 12), ' stroke="%s" stroke-width="%s" stroke-opacity="%s"' % (
            rnd.choice(['#ff8a6a', '#e86a7a', '#ffa080']), f(rnd.uniform(3, 6)), f(.34 - i * .025))))
    o.append(g(rings, k.tex(.018, 81, 4, disp=22, sd=3.5, a=2.6, b=-.9, mfreq=.012, mseed=9), op=.75))
    skin = [E(cx + r * math.cos(a), cy + r * math.sin(a) * .96, rnd.uniform(8, 20), rnd.uniform(5, 12), rnd.choice(['#e0506a', '#c03a5a', '#ff7a7a']), rnd.uniform(.3, .6), math.degrees(a) + 90)
            for a, r in [(rnd.uniform(0, 6.3), rnd.uniform(225, 262)) for _ in range(60)]]
    o.append(g(skin, k.tex(.04, 82, 4, disp=24, sd=2.5, a=2.4, b=-.7), op=.4))
    # the core: nested, overlapping shells, limb-brightened, teal-green oxygen
    shells = [(-12, 10, 132, 62, R0 + 62, '#34b0c0', .2), (12, -10, 126, 58, R0 - 34, '#40b8b0', .2),
              (0, 0, 98, 50, R0, '#58d0c0', .28), (-6, 4, 72, 36, R0 + 12, '#88ecd0', .38), (3, -2, 42, 22, R0 - 6, '#d8fff0', .5)]
    o.append(E(cx, cy, 190, 130, k.rg([(0, '#a0fff0', .35), (.4, '#40b8c0', .16), (1, '#206080', 0)]), 1, R0))
    core = [E(cx, cy, 90, 56, k.rg([(0, '#c8fff0', .6), (.5, '#58d0c0', .3), (1, '#2a90a0', 0)]), 1, R0)]
    fills, rims = [], []
    for dx, dy, rx, ry, rot, col, fl in shells:
        fills.append(E(cx + dx, cy + dy, rx * 1.04, ry * 1.06, k.rg([(0, col, fl * .45), (.55, col, fl * .6), (.82, col, fl * 1.3), (.93, col, fl * .5), (1, col, 0)]), 1, rot))
        rims.append(E(cx + dx, cy + dy, rx * .9, ry * .88, 'none', 1, rot, ' stroke="#b8fff0" stroke-width="1" stroke-opacity=".35"'))
    o.append(g(core + fills, k.tex(.03, 83, 4, disp=22, sd=4.5), blend='screen'))
    o.append(g(rims, k.tex(.04, 86, 3, disp=10, sd=.9, a=2.4, b=-.5), blend='screen'))
    knots = [E(cx + rnd.gauss(0, 34), cy + rnd.gauss(0, 22), rnd.uniform(6, 16), rnd.uniform(3, 7), rnd.choice(['#d8fff0', '#a0f0e0', '#ffc8b0']), rnd.uniform(.15, .3), R0 + rnd.uniform(-60, 60)) for _ in range(30)]
    o.append(g(knots, k.tex(.05, 87, 3, disp=8, sd=1.6), blend='screen'))
    # red nitrogen: bright crescents where each shell's tips are densest
    caps = []
    for dx, dy, rx, ry, rot, _, _ in shells[:4]:
        caps.append(E(cx + dx, cy + dy, rx, ry, 'none', 1, rot, ' pathLength="100" stroke="#ff6a4a" stroke-width="%s" stroke-opacity=".55" stroke-dasharray="12 38" stroke-dashoffset="6"' % f(ry * .2)))
        caps.append(E(cx + dx, cy + dy, rx * .97, ry * .95, 'none', 1, rot, ' pathLength="100" stroke="#ffc0a0" stroke-width="%s" stroke-opacity=".7" stroke-dasharray="6 44" stroke-dashoffset="3"' % f(ry * .05)))
    o.append(g(g(caps, k.blur(3.5)), k.tex(.04, 84, 3, disp=16, sd=.8), blend='screen'))
    # loose loops winding off the core
    loops = []
    for rx, ry, rot, col, dash in [(150, 84, R0 + 30, '#ff7a6a', '30 70'), (160, 90, R0 - 50, '#a8f0e0', '26 74'), (142, 70, R0 + 90, '#ff9a80', '22 78')]:
        loops.append(E(cx, cy, rx, ry, 'none', 1, rot, ' pathLength="100" stroke="%s" stroke-width="5" stroke-opacity=".3" stroke-dasharray="%s" stroke-dashoffset="%s"' % (col, dash, f(rnd.uniform(0, 100)))))
    o.append(g(loops, k.tex(.03, 85, 3, disp=18, sd=3), blend='screen'))
    # FLIERs: jets of knots flung out along the axis, tipped in red
    jets = []
    t = math.radians(R0 + 62)
    for sgn in (1, -1):
        for j, r in enumerate((128, 146, 170)):
            x, y = cx + sgn * r * math.cos(t) + rnd.uniform(-4, 4), cy + sgn * r * math.sin(t) + rnd.uniform(-4, 4)
            jets.append(E(x, y, 9 - j * 2, 5 - j, '#ff6a50', .6 - j * .12, math.degrees(t)))
            jets.append(C(x, y, 2.2 - j * .4, '#ffe0c8', .85 - j * .15))
    o.append(g(jets, k.tex(.08, 88, 3, disp=6, sd=1.4), blend='screen'))
    # the central star
    o.append(C(cx, cy, 44, k.rg([(0, '#ffffff', .95), (.12, '#e8f8ff', .75), (.4, '#a0e0ff', .22), (1, '#80c0ff', 0)])))
    o.append(spike_star(cx, cy, 2.6, '#eaf6ff', 28, 1, .9))
    o.append(dust_stars(rnd, (0, 90, 582, 620), 45, rmax=1, opmax=.75))
    for x, y, r in [(82, 150, 1.4), (500, 540, 1.3), (470, 130, 1.1)]:
        o.append(spike_star(x, y, r, '#fff4e4', 9 + 5 * r, .85, .6))
    obj = finish(k, u, o, .1)
    ann = top('RA 17H 58M 33S · DEC +66° 38′ · DRACO') + scalebar(22, 800, 60, '0.2 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= M8, THE LAGOON
def along(cx, cy, ang, s, t):
    """A point `s` along an axis at `ang` degrees through (cx, cy), and `t` across it."""
    a = math.radians(ang)
    return cx + s * math.cos(a) - t * math.sin(a), cy + s * math.sin(a) + t * math.cos(a)


def m8(u):
    rnd = random.Random(6523)
    cx, cy, AX = 291, 344, -38
    bg = sky(u, H, ('#1e1224', '#0d0914', '#030206'), 360, 6523, 4)
    k = Kit(u)
    o = []
    o.append(E(cx, cy, 330, 210, k.rg([(0, '#ff7a9a', .5), (.5, '#c83a64', .25), (.8, '#7a2040', .1), (1, '#4a1030', 0)]), 1, AX))
    # the cloud: pink-red hydrogen, long axis tipped up to the right
    cl = []
    for _ in range(50):
        sx, tx = rnd.gauss(0, 125), rnd.gauss(0, 58)
        x, y = along(cx, cy, AX, sx, tx)
        c = rnd.choice(['#e8507a', '#ff6a8a', '#c83a5a', '#ff8aa0', '#d84868', '#a82a50', '#f07a70', '#b02a50'])
        cl.append(P(lump(rnd, x, y, rnd.uniform(40, 100), rnd.uniform(28, 70), 12, .35, rnd.uniform(0, 180)), c, rnd.uniform(.25, .5)))
    fade = k.mask(E(cx, cy, 330, 220, k.rg([(0, '#fff'), (.6, '#fff', .85), (1, '#fff', 0)]), 1, AX))
    o.append(g(g(cl, k.tex(.012, 8, 4, disp=80, sd=8)), extra=' mask="%s"' % fade))
    wisps = [P(lump(rnd, *along(cx, cy, AX, rnd.gauss(40, 120), rnd.gauss(0, 50)), rnd.uniform(24, 60), rnd.uniform(14, 36), 12, .45, rnd.uniform(0, 180)),
               rnd.choice(['#ffc0d0', '#ffa0b8', '#ffe0e8', '#ffb0a0']), rnd.uniform(.3, .6)) for _ in range(34)]
    o.append(g(wisps, k.tex(.02, 9, 5, disp=60, sd=1.6, a=3.2, b=-1.3), op=.7, blend='screen'))
    # internal dust: dark mottling through the glow, and bright ridges catching the light
    mot = [E(cx, cy, 300, 180, '#3a0a1c', .8, AX)]
    o.append(g(mot, k.tex(.018, 15, 5, disp=40, sd=2, a=3.4, b=-1.75, mfreq=.024, mseed=31), op=.75))
    ridges = []
    for _ in range(30):
        x, y = along(cx, cy, AX, rnd.gauss(30, 80), rnd.gauss(0, 38))
        a = rnd.uniform(0, 6.3); L = rnd.uniform(18, 50)
        ridges.append(S('M%s %sq%s %s %s %s' % (f(x), f(y), f(L * .5 * math.cos(a + .6)), f(L * .5 * math.sin(a + .6)), f(L * math.cos(a)), f(L * math.sin(a))),
                        rnd.choice(['#ffd8e0', '#ffc0c8', '#ffe8d0']), rnd.uniform(1.2, 3), rnd.uniform(.2, .45)))
    o.append(g(ridges, k.tex(.035, 16, 3, disp=20, sd=1.4), blend='screen'))
    # the bright heart around the Hourglass, west of the lane
    hx, hy = along(cx, cy, AX, 92, -8)
    o.append(g([glow(k, hx, hy, 120, '#ffb0a0', .6, '#fff0e0'), glow(k, hx, hy, 44, '#fff4e0', .9, '#ffffff')], k.tex(.03, 10, 4, disp=30, sd=2), blend='screen'))
    # the dark lane crossing the cloud, and the dust that feeds it
    lane = []
    for off, w, op in [(0, 46, .7), (8, 22, .85), (-14, 16, .6)]:
        pts = [along(cx, cy, AX, -28 + off + 18 * math.sin(i * .9) + rnd.uniform(-6, 6), -230 + i * 38) for i in range(13)]
        lane.append(S(smooth(pts, False), '#12060c', w, op))
    for _ in range(18):
        x, y = along(cx, cy, AX, rnd.gauss(-30, 50), rnd.uniform(-220, 220))
        lane.append(P(lump(rnd, x, y, rnd.uniform(10, 34), rnd.uniform(8, 20), 10, .4, rnd.uniform(0, 180)), '#12060c', rnd.uniform(.3, .6)))
    o.append(g(lane, k.tex(.03, 11, 4, disp=36, sd=4, a=2.4, b=-.55)))
    rims = [S(smooth([along(cx, cy, AX, -4 + 18 * math.sin(i * .9) + rnd.uniform(-5, 5), -200 + i * 34) for i in range(12)], False), '#ffc8d0', 2, .4)]
    o.append(g(rims, k.tex(.04, 12, 3, disp=18, sd=1.2, a=2.6, b=-.9), blend='screen'))
    # the Hourglass: two bright lobes pinched by dust, Herschel 36 beside it
    hg = [E(hx - 2.5, hy - 6.5, 5, 6.5, '#fff8e8', .95, -20), E(hx + 2.5, hy + 6.5, 5, 6.5, '#fff4e0', .9, -20), E(hx, hy, 8, 1.8, '#8a3040', .45, -20)]
    o.append(g(hg, k.tex(.08, 13, 3, disp=3, sd=.9)))
    o.append(spike_star(hx + 14, hy + 4, 1.8, '#fff4ec', 16, 1, .8))
    # Bok globules: small dark knots scattered over the glow
    glob = []
    for _ in range(12):
        x, y = along(cx, cy, AX, rnd.gauss(-10, 100), rnd.gauss(0, 50))
        r = rnd.uniform(1.4, 3.4)
        a = math.degrees(math.atan2(y - hy, x - hx))
        glob.append(E(x, y, r * 2, r, '#2a0a16', rnd.uniform(.4, .65), a))
    o.append(g(glob, k.tex(.1, 14, 3, disp=3, sd=.9)))
    # NGC 6530, the young cluster east of the lane
    cl_x, cl_y = along(cx, cy, AX, -120, 10)
    for _ in range(40):
        x, y = cl_x + rnd.gauss(0, 44), cl_y + rnd.gauss(0, 40)
        r = rnd.uniform(.6, 1.6)
        o.append(spike_star(x, y, r, rnd.choice(['#dfeaff', '#cfe0ff', '#ffffff']), 5 + 8 * r, rnd.uniform(.7, 1), .5) if r > 1.2 else C(x, y, r, '#e8f0ff', .9))
    o.append(dust_stars(rnd, (0, 90, 582, 620), 60, rmax=1, opmax=.75))
    for x, y, r in [(80, 140, 1.4), (500, 180, 1.2), (470, 560, 1.4)]:
        o.append(spike_star(x, y, r, '#fff4e4', 9 + 5 * r, .85, .6))
    obj = finish(k, u, o, .11)
    ann = top('RA 18H 03M 37S · DEC −24° 23′ · SAGITTARIUS') + scalebar(22, 800, 60, '10 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= M20, THE TRIFID
def m20(u):
    rnd = random.Random(6514)
    cx, cy = 286, 404
    bg = sky(u, H, ('#141a30', '#0a0d1c', '#030409'), 330, 6514, 4)
    k = Kit(u)
    o = []
    # the blue reflection nebula to the north: starlight scattered by dust
    bx, by = 302, 214
    o.append(C(bx, by + 20, 200, k.rg([(0, '#7a98f0', .42), (.4, '#4a64c0', .24), (.75, '#2a3a8a', .1), (1, '#20306a', 0)])))
    blue = [P(lump(rnd, bx + rnd.gauss(0, 64), by + rnd.gauss(0, 54), rnd.uniform(40, 90), rnd.uniform(30, 70), 12, .4), rnd.choice(['#5a7ae0', '#7a98f0', '#4a64c8', '#90b0ff', '#6a70d8']), rnd.uniform(.12, .26)) for _ in range(28)]
    o.append(g(blue, k.tex(.014, 20, 4, disp=70, sd=6), blend='screen'))
    o.append(g([P(lump(rnd, bx + rnd.gauss(0, 60), by + rnd.gauss(0, 50), rnd.uniform(20, 50), rnd.uniform(14, 34), 12, .45), '#b8ccff', rnd.uniform(.2, .4)) for _ in range(18)],
               k.tex(.025, 21, 5, disp=50, sd=1.5, a=3, b=-1.3), op=.45, blend='screen'))
    o.append(g([P(lump(rnd, bx + rnd.gauss(0, 70), by + rnd.gauss(0, 60), rnd.uniform(16, 40), rnd.uniform(10, 26), 12, .5), '#0a0c1e', rnd.uniform(.3, .5)) for _ in range(14)],
               k.tex(.03, 26, 4, disp=40, sd=3, a=2.6, b=-.8), op=.6))
    o.append(spike_star(bx + 8, by - 18, 2.2, '#e8f0ff', 22, 1, .8))
    # the red emission nebula: a round cloud of hydrogen
    R = 150
    o.append(C(cx, cy, R * 1.35, k.rg([(0, '#ff6a7a', .55), (.55, '#d83a58', .32), (.8, '#8a2040', .12), (1, '#5a1030', 0)])))
    red = [C(cx, cy, R * .98, k.rg([(0, '#ffb0a0', .75), (.35, '#ff7080', .6), (.7, '#e0405e', .45), (1, '#c02a4a', 0)]))]
    for _ in range(40):
        a = rnd.uniform(0, 2 * math.pi); r = R * rnd.random() ** .7
        red.append(P(lump(rnd, cx + r * math.cos(a), cy + r * math.sin(a), rnd.uniform(26, 60), rnd.uniform(20, 46), 12, .4), rnd.choice(['#ff6a7a', '#e84868', '#ff8a8a', '#c8385a', '#ffa0a0']), rnd.uniform(.2, .45)))
    o.append(g(red, k.tex(.016, 22, 4, disp=50, sd=4)))
    o.append(g([P(lump(rnd, cx + rnd.gauss(0, 70), cy + rnd.gauss(0, 70), rnd.uniform(16, 40), rnd.uniform(10, 26), 12, .5), rnd.choice(['#ffb0b8', '#ff98a8', '#ffc8c0']), rnd.uniform(.3, .55)) for _ in range(26)],
               k.tex(.03, 23, 5, disp=36, sd=1.2, a=3.2, b=-1.4), op=.5, blend='screen'))
    # the three dark lanes, wide at the rim and pinched toward the centre
    lanes = []
    sx, sy = cx + 6, cy - 4
    for ang, L, w0, bend, op in [(-146, 172, 46, 14, .85), (-16, 164, 40, -18, .85), (100, 176, 48, 12, .85), (34, 110, 18, 8, .5)]:
        side_l, side_r = [], []
        for i in range(16):
            t = i / 15
            a = math.radians(ang + bend * t + 6 * math.sin(t * 7))
            x, y = sx + L * t * math.cos(a), sy + L * t * math.sin(a)
            w = (6 + w0 * t ** 1.1) / 2 * (1 + rnd.uniform(-.25, .25))
            nx, ny = -math.sin(a), math.cos(a)
            side_l.append((x + nx * w, y + ny * w)); side_r.append((x - nx * w, y - ny * w))
        d = smooth(side_l + list(reversed(side_r)))
        lanes.append(P(d, '#0e0509', op))
    edge = k.mask(C(sx, sy, 190, k.rg([(0, '#fff'), (.62, '#fff', .95), (.85, '#fff', .4), (1, '#fff', 0)])))
    o.append(g(g(lanes, k.tex(.035, 24, 4, disp=22, sd=3.4)), extra=' mask="%s"' % edge))
    lane_haze = []
    for ang in (-148, -18, 98):
        for _ in range(5):
            a = math.radians(ang + rnd.uniform(-8, 8)); r = rnd.uniform(60, 190)
            lane_haze.append(E(sx + r * math.cos(a), sy + r * math.sin(a), rnd.uniform(14, 30), rnd.uniform(8, 16), '#1a0610', rnd.uniform(.25, .45), math.degrees(a)))
    o.append(g(lane_haze, k.tex(.04, 25, 3, disp=20, sd=4)))
    # the central star, where the lanes meet
    o.append(C(sx, sy, 34, k.rg([(0, '#ffffff', .9), (.2, '#fff0f0', .5), (1, '#ffc0c0', 0)])))
    o.append(spike_star(sx, sy, 2.4, '#f4f4ff', 24, 1, .9))
    for dx, dy in [(-9, 5), (7, 8), (5, -9)]:
        o.append(C(sx + dx, sy + dy, .9, '#fff', .9))
    o.append(dust_stars(rnd, (0, 90, 582, 620), 70, rmax=1, opmax=.75))
    for x, y, r in [(84, 160, 1.4), (500, 560, 1.3), (500, 140, 1.1), (90, 520, 1.2)]:
        o.append(spike_star(x, y, r, '#fff4e4', 9 + 5 * r, .85, .6))
    obj = finish(k, u, o, .11)
    ann = top('RA 18H 02M 23S · DEC −23° 02′ · SAGITTARIUS') + scalebar(22, 800, 60, '10 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= THE VEIL
def veil(u):
    rnd = random.Random(6992)
    bg = sky(u, H, ('#101628', '#080b18', '#020308'), 900, 6992, 6)
    k = Kit(u)
    o = []
    ox, oy, R = -230, 690, 650            # the blast's centre lies off the plate, down and to the left
    th0, th1 = -74, -3

    def width(a):                          # the shock's thickness wanders along the arc
        return 26 + 9 * math.sin(math.radians(a) * 9 + 1) + 6 * math.sin(math.radians(a) * 23)

    def arc(off0, drift, a0, a1, amp, freq, ph, n=12):
        pts = []
        for i in range(n):
            t = i / (n - 1)
            a = a0 + (a1 - a0) * t
            r = R + (off0 + drift * t + amp * math.sin(freq * t * 2 * math.pi + ph)) * width(a) / 16
            pts.append((ox + r * math.cos(math.radians(a)), oy + r * math.sin(math.radians(a))))
        return smooth(pts, False)

    def span():
        c = rnd.triangular(th0, th1, (th0 + th1) / 2 - 6)
        L = rnd.uniform(8, 34)
        return max(th0, c - L / 2), min(th1, c + L / 2)

    # the fade at both ends of the arc
    ends = k.mask('<rect x="-100" y="-100" width="782" height="1032" fill="%s"/>' % k.lg([(0, '#fff', 0), (.12, '#fff', .8), (.3, '#fff'), (.78, '#fff'), (.92, '#fff', .35), (1, '#fff', 0)], -30, 20, 520, 700, True))
    haze = [S(arc(-12, 0, th0, th1, 0, 1, 0, 30), '#ff5a6a', 70, .12), S(arc(10, 0, th0, th1, 0, 1, 0, 30), '#40c8c8', 56, .12),
            S(arc(-90, 0, th0 + 14, th1 - 10, 0, 1, 0, 24), '#ff6a7a', 30, .06)]
    o.append(g(g(haze, k.blur(18)), blend='screen', extra=' mask="%s"' % ends))
    red, teal, white = [], [], []
    for i in range(70):
        a0, a1 = span()
        red.append(S(arc(rnd.gauss(-8, 7), rnd.uniform(-10, 10), a0, a1, rnd.uniform(3, 14), rnd.uniform(.5, 2), rnd.uniform(0, 6.3)),
                     rnd.choice(['#ff4a5a', '#e8384a', '#ff6a6a', '#ff8070', '#d02a48']), rnd.uniform(.5, 2.4), rnd.uniform(.25, .75)))
    for i in range(60):
        a0, a1 = span()
        teal.append(S(arc(rnd.gauss(8, 7), rnd.uniform(-10, 10), a0, a1, rnd.uniform(3, 14), rnd.uniform(.5, 2), rnd.uniform(0, 6.3)),
                      rnd.choice(['#40e0d0', '#5ad8f0', '#80f0e0', '#30b8d0']), rnd.uniform(.5, 2.2), rnd.uniform(.25, .7)))
    for i in range(16):
        a0, a1 = span()
        white.append(S(arc(rnd.gauss(0, 5), rnd.uniform(-6, 6), a0, a1, rnd.uniform(3, 10), rnd.uniform(.5, 2), rnd.uniform(0, 6.3)), '#f4fff8', rnd.uniform(.4, 1), rnd.uniform(.3, .6)))
    smoke = k.tex(.012, 30, 3, disp=40, sd=.5)
    fine = k.tex(.045, 32, 2, disp=7, sd=.4, a=2.2, b=-.35, mfreq=.016, mseed=33)
    k.d.append('<g id="%sred">%s</g><g id="%steal">%s</g>' % (u, ''.join(red), u, ''.join(teal)))
    both = '<use href="#%sred"/><use href="#%steal"/>' % (u, u)
    o.append(g(g([g(both, k.blur(11), op=.7), g(both, k.blur(3.5), op=.6)], smoke, blend='screen'), extra=' mask="%s"' % ends))
    o.append(g(g(g([both, g(white)], fine), smoke, blend='screen'), extra=' mask="%s"' % ends))
    # stray wisps curling off the shock front
    wisps = []
    for _ in range(22):
        a = math.radians(rnd.triangular(th0 + 6, th1 - 6)); r = R + rnd.uniform(-30, 30)
        x, y = ox + r * math.cos(a), oy + r * math.sin(a)
        L = rnd.uniform(24, 60); d = rnd.choice([-1, 1])
        wisps.append(S('M%s %sc%s %s %s %s %s %s' % (f(x), f(y), f(L * .4 * math.cos(a)), f(L * .4 * math.sin(a)), f(L * .7 * math.cos(a) + d * 14), f(L * .7 * math.sin(a) - d * 14), f(L * math.cos(a) + d * 24), f(L * math.sin(a))),
                       rnd.choice(['#ff6a70', '#60e0e0']), rnd.uniform(.5, 1.2), rnd.uniform(.15, .35)))
    o.append(g(wisps, k.tex(.025, 31, 3, disp=18, sd=.7), blend='screen'))
    o.append(dust_stars(rnd, (0, 90, 582, 620), 90, rmax=1, opmax=.8))
    for x, y, r in [(470, 170, 1.8), (120, 520, 1.4), (520, 480, 1.2), (80, 250, 1.1)]:
        o.append(spike_star(x, y, r, '#fff4e4', 10 + 6 * r, .9, .7))
    obj = finish(k, u, o, .1)
    ann = top('RA 20H 56M 24S · DEC +31° 43′ · CYGNUS') + scalebar(22, 800, 60, '10 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= THE ROSETTE
def rosette(u):
    rnd = random.Random(2244)
    cx, cy = 291, 336
    bg = sky(u, H, ('#1a1022', '#0c0812', '#030205'), 520, 2244, 4)
    k = Kit(u)
    o = []
    o.append(C(cx, cy, 290, k.rg([(0, '#ff5a6a', 0), (.3, '#ff5a6a', .1), (.55, '#d83a52', .3), (.78, '#8a2038', .14), (1, '#4a1026', 0)])))
    # the shell: petals of glowing hydrogen, lit from within by the cluster
    petals = []
    for ring_r, n, sz in [(200, 26, 1.0), (160, 24, .9), (120, 20, .8), (235, 22, .8)]:
        for i in range(n):
            a = 2 * math.pi * (i + rnd.uniform(-.3, .3)) / n
            r = ring_r + rnd.uniform(-18, 18)
            petals.append(P(lump(rnd, cx + r * math.cos(a), cy + r * math.sin(a) * .96, rnd.uniform(34, 56) * sz, rnd.uniform(18, 30) * sz, 12, .35, math.degrees(a) + 90),
                            rnd.choice(['#d8304a', '#c02440', '#ff4a60', '#a81c38', '#e8405a']), rnd.uniform(.3, .6)))
    hole = k.mask(C(cx, cy, 320, k.rg([(0, '#fff', 0), (.2, '#fff', .15), (.34, '#fff'), (.66, '#fff', .9), (.9, '#fff', .3), (1, '#fff', 0)])))
    o.append(g(g(petals, k.tex(.014, 60, 4, disp=60, sd=6)), extra=' mask="%s"' % hole))
    hi = [P(lump(rnd, cx + r * math.cos(a), cy + r * math.sin(a), rnd.uniform(20, 44), rnd.uniform(12, 26), 12, .4, math.degrees(a) + 90), rnd.choice(['#ff8a90', '#ffa0a0', '#ff7080', '#ffc0b0']), rnd.uniform(.3, .55))
          for a, r in [(rnd.uniform(0, 6.3), rnd.uniform(110, 230)) for _ in range(60)]]
    o.append(g(g(hi, k.tex(.025, 65, 5, disp=40, sd=1.5, a=3, b=-1.2)), op=.55, blend='screen', extra=' mask="%s"' % hole))
    fil = []
    for _ in range(40):
        a = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(120, 240); L = rnd.uniform(.15, .5)
        fil.append(S('M%s %sA%s %s 0 0 1 %s %s' % (f(cx + r * math.cos(a)), f(cy + r * math.sin(a)), f(r), f(r), f(cx + r * math.cos(a + L)), f(cy + r * math.sin(a + L))), '#1a0610', rnd.uniform(2, 6), rnd.uniform(.2, .4)))
    o.append(g(fil, k.tex(.03, 66, 4, disp=24, sd=2.6)))
    inner = [E(cx + 108 * math.cos(a), cy + 108 * math.sin(a), rnd.uniform(18, 36), rnd.uniform(8, 16), rnd.choice(['#ffb0a0', '#ffc8b0', '#ff9a90']), rnd.uniform(.3, .6), math.degrees(a) + 90)
             for a in [rnd.uniform(0, 6.3) for _ in range(36)]]
    o.append(g(inner, k.tex(.03, 62, 4, disp=30, sd=2.2, a=2.6, b=-.8), op=.7, blend='screen'))
    # the hole blown by the cluster's winds: faint oxygen and gold at its edge
    o.append(C(cx, cy, 120, k.rg([(0, '#3a6a8a', .16), (.55, '#6a5a70', .12), (.8, '#e8a070', .22), (1, '#e87060', 0)])))
    # dark globules and elephant trunks pointing in at the cluster
    dust = []
    for i in range(9):
        a = rnd.gauss(.6, .45) if i < 5 else rnd.gauss(3.8, .4)
        r0 = rnd.uniform(140, 190); L = rnd.uniform(18, 40); w = rnd.uniform(4, 8)
        bx, by = cx + (r0 + L) * math.cos(a), cy + (r0 + L) * math.sin(a)
        hx, hy = cx + r0 * math.cos(a), cy + r0 * math.sin(a)
        mx, my = (bx + hx) / 2 + rnd.uniform(-8, 8), (by + hy) / 2 + rnd.uniform(-8, 8)
        d = 'M%s %sQ%s %s %s %s' % (f(bx), f(by), f(mx), f(my), f(hx), f(hy))
        dust.append(S(d, '#12050a', w * 1.2, .3))
        dust.append(S(d, '#12050a', w * .6, .6))
        dust.append(C(hx, hy, w * .55, '#12050a', .75))
        dust.append(C(hx - w * .2 * math.cos(a), hy - w * .2 * math.sin(a), w * .5, 'none', 1, ' stroke="#ffb8a8" stroke-width=".8" stroke-opacity=".5"'))
        dust.append(C(cx + (r0 - w * .2) * math.cos(a), cy + (r0 - w * .2) * math.sin(a), w * .45, 'none', 1, ' stroke="#ffb0a0" stroke-width="1" stroke-opacity=".45"'))
    for _ in range(24):
        a = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(110, 230)
        rr = rnd.uniform(1.5, 4.5)
        dust.append(E(cx + r * math.cos(a), cy + r * math.sin(a), rr * 1.5, rr, '#14060c', rnd.uniform(.45, .8), math.degrees(a)))
    o.append(g(dust, k.tex(.05, 63, 3, disp=8, sd=2)))
    lanes = [S('M%s %sC%s %s %s %s %s %s' % tuple(f(v) for v in [cx + 150, cy + 150, cx + 190, cy + 90, cx + 240, cy + 110, cx + 280, cy + 60]), '#12050a', 22, .5),
             S('M%s %sC%s %s %s %s %s %s' % tuple(f(v) for v in [cx - 170, cy - 130, cx - 210, cy - 90, cx - 250, cy - 120, cx - 290, cy - 70]), '#12050a', 18, .45)]
    o.append(g(lanes, k.tex(.03, 64, 4, disp=30, sd=5, a=2.4, b=-.6)))
    # NGC 2244: the young cluster in the hole
    for x, y, r in [(-18, -8, 2.6), (14, -22, 2.2), (26, 12, 2.4), (-6, 20, 2), (-36, 18, 1.8), (40, -8, 1.6), (4, 2, 1.8), (-24, -32, 1.4), (30, 34, 1.4), (-46, -12, 1.3)]:
        o.append(spike_star(cx + x, cy + y, r * .85, '#dfeaff', 5 + 5 * r, 1, .7))
    o.append(dust_stars(rnd, (cx - 90, cy - 90, cx + 90, cy + 90), 40, ('#e8f0ff', '#ffffff'), 1, .9))
    o.append(dust_stars(rnd, (0, 90, 582, 620), 70, rmax=1, opmax=.75))
    obj = finish(k, u, o, .11)
    ann = top('RA 06H 33M 45S · DEC +04° 59′ · MONOCEROS') + scalebar(22, 800, 60, '10 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= NGC 6302, THE BUTTERFLY
def wing(rnd, cx, cy, ang, L, w0, w1, n=22, rag=.16):
    """A bipolar lobe: pinched at the waist, flaring outward, with a ragged rounded end."""
    top, bot = [], []
    for i in range(n + 1):
        t = i / n
        w = w0 + (w1 - w0) * math.sin(min(1, t * 1.15) * math.pi / 2) ** 1.4
        if t > .82:
            w *= math.sqrt(max(0, 1 - ((t - .82) / .18) ** 2))
        top.append(along(cx, cy, ang, L * t, -w * (1 + rnd.uniform(-rag, rag))))
        bot.append(along(cx, cy, ang, L * t, w * (1 + rnd.uniform(-rag, rag))))
    tip = along(cx, cy, ang, L * 1.03, rnd.uniform(-10, 10))
    return smooth(top + [tip] + list(reversed(bot)))


# ================================================================= CARINA, THE COSMIC CLIFFS
def carina(u):
    rnd = random.Random(3372)
    bg = sky(u, H, ('#10223a', '#08121f', '#02050a'), 380, 3372, 4, cy='.3')
    k = Kit(u)
    o = []
    # the cavity: hot gas glowing blue-teal, warming to gold above the cliffs
    field = k.mask(P('M-40 -40H622V900H-40Z', k.lg([(0, '#fff', .55), (.3, '#fff', .9), (1, '#fff')], 0, 0, 0, 1)))
    gas = [P('M-40 -40H622V900H-40Z', k.lg([(0, '#1a3a6a'), (.25, '#2a5a8a'), (.45, '#3a8aa0'), (.6, '#8ab0a0'), (.72, '#e0b070'), (1, '#6a3018')], 0, 0, 0, 1))]
    for _ in range(34):
        x, y = rnd.uniform(-40, 620), rnd.uniform(40, 560)
        gas.append(P(lump(rnd, x, y, rnd.uniform(50, 130), rnd.uniform(30, 90), 12, .4),
                     rnd.choice(['#4a8ac0', '#6ab0d0', '#3a6aa0', '#8ad0d8'] if y < 330 else ['#a8c8b0', '#e8c080', '#80b8c0', '#f0a860']), rnd.uniform(.25, .5)))
    o.append(g(g(gas, k.tex(.009, 90, 4, disp=100, sd=8)), extra=' mask="%s"' % field))
    o.append(g([P(lump(rnd, rnd.uniform(0, 582), rnd.uniform(60, 440), rnd.uniform(40, 110), rnd.uniform(24, 70), 12, .45), rnd.choice(['#c8f0ff', '#a0e0f0', '#fff0d0']), rnd.uniform(.25, .5)) for _ in range(28)],
               k.tex(.018, 91, 5, disp=80, sd=2, a=3.4, b=-1.5, mfreq=.013, mseed=92), op=.5, blend='screen'))
    # the cliff: a wall of dust, its crest lit by the young stars above
    ridge = [(-60, 500), (-20, 486), (20, 470), (46, 452), (60, 420), (68, 404), (78, 418), (96, 440), (128, 430), (156, 418), (178, 396),
             (190, 344), (198, 300), (210, 284), (224, 300), (232, 350), (246, 392), (276, 400), (310, 388), (338, 372), (362, 356), (384, 348),
             (404, 322), (414, 296), (426, 290), (434, 312), (446, 344), (470, 352), (500, 342), (530, 330), (556, 316), (580, 320), (650, 330)]
    ridge = [(x + rnd.uniform(-3, 3), y + rnd.uniform(-5, 5)) for x, y in ridge]
    cliff = smooth(ridge + [(650, 900), (-60, 900)])
    top_y = 280
    o.append(g([S(smooth(ridge, False), '#ffd890', 60, .4), S(smooth(ridge, False), '#fff0c0', 16, .55)], k.blur(18), blend='screen'))
    steam = []
    for x, y in ridge[1:-1]:
        for _ in range(2):
            steam.append(E(x + rnd.uniform(-20, 20), y - rnd.uniform(10, 50), rnd.uniform(16, 36), rnd.uniform(24, 56), rnd.choice(['#ffe8c0', '#f0f0e0', '#c8e8f0']), rnd.uniform(.14, .28), rnd.uniform(-30, 30)))
    o.append(g(steam, k.tex(.018, 93, 4, disp=60, sd=6, a=2.2, b=-.5, mfreq=.024, mseed=94), blend='screen'))
    k.d.append('<path id="%scliff" d="%s"/>' % (u, cliff))
    use = lambda fill, dx=0, dy=0, op=1, extra='': '<use href="#%scliff" fill="%s" x="%s" y="%s"%s%s/>' % (u, fill, f(dx), f(dy), '' if op == 1 else ' opacity="%s"' % f(op), extra)
    albedo = k.lg([(0, '#fff0d0'), (.06, '#f8c880'), (.16, '#d0803e'), (.32, '#8a3c1e'), (.55, '#4a1a0e'), (1, '#140604')], 0, top_y, 0, 832, True)
    crest = k.lg([(0, '#ffe8b8', .6), (.1, '#f0a060', .3), (.25, '#a05028', 0)], 0, top_y, 0, 700, True)
    rel = k.relief(.018, 95, 4, sd=6, k2=.62, k3=.38, ss=7, az=-85, el=36, col='#fff0dc', dc=1.25)
    body = [use('#ffe0a0', 0, -3, .9),
            use('#000', 0, 0, 1, ' filter="%s"' % rel),
            use(albedo, 0, 0, 1, ' style="mix-blend-mode: multiply"'),
            use('#4a1c10', 0, 0, .4, ' filter="%s" style="mix-blend-mode: multiply"' % k.tex('.012 .03', 96, 3, a=2.6, b=-1)),
            use(crest, 0, 0, 1, ' style="mix-blend-mode: screen"')]
    o.append(g(body, k.tex(.03, 97, 4, disp=24, sd=1.4)))
    lit = [P(lump(rnd, x + rnd.uniform(-20, 20), y + rnd.uniform(10, 60), rnd.uniform(24, 50), rnd.uniform(12, 30), 12, .45), rnd.choice(['#ffc070', '#ffa050', '#ffd890']), rnd.uniform(.25, .45)) for x, y in ridge[1:-1] for _ in range(2)]
    o.append('<g clip-path="%s">%s</g>' % (k.clip(cliff), g(lit, k.tex(.025, 99, 4, disp=40, sd=3, a=2.6, b=-.8), blend='screen')))
    # nearer terraces of the same wall, each with its own lit lip
    for n, (dy, amp, seed, dark) in enumerate([(120, 26, 5, .25), (230, 34, 7, .45)]):
        rr = random.Random(seed)
        pts = [(-60, 0)] + [(x, rr.uniform(-amp, amp) * rr.choice([1, 1, 1.8])) for x in range(-20, 640, 30)]
        pts = [(x, y + dy + 360 + 40 * math.sin(x / 90 + n)) for x, y in pts]
        path = smooth(pts + [(650, 900), (-60, 900)])
        ty = min(p[1] for p in pts)
        alb = k.lg([(0, '#ffe0b0'), (.05, '#e09050'), (.16, '#8a3c1e'), (.4, '#4a1a0e'), (1, '#140604')], 0, ty, 0, ty + 420, True)
        layer = [P(path, '#ffd090', .4, ' transform="translate(0 -2)"'), P(path, '#000', 1, ' filter="%s"' % rel), P(path, alb, 1, ' style="mix-blend-mode: multiply"'),
                 P(path, '#000', dark)]
        o.append(g([S(smooth(pts, False), '#ffb060', 30, .22)], k.blur(12), blend='screen'))
        o.append(g(layer, k.tex(.03, 97 + n, 4, disp=22, sd=1.4)))
    # dust wisps drifting in front of the wall
    wisp = [P(lump(rnd, rnd.uniform(0, 582), rnd.uniform(420, 700), rnd.uniform(40, 110), rnd.uniform(14, 36), 12, .45), rnd.choice(['#2a0e08', '#3a1408', '#5a2410']), rnd.uniform(.25, .45)) for _ in range(16)]
    o.append(g(wisp, k.tex(.02, 98, 4, disp=50, sd=5, a=2.4, b=-.6)))
    # young stars: a few big ones with long spikes, many small ones in the cavity
    for x, y, r, c in [(440, 150, 2.4, '#dfeaff'), (110, 200, 1.8, '#fff0d8'), (310, 250, 1.4, '#fff4e0')]:
        o.append(star6(x, y, r, c, 16 + 12 * r))
    for x, y, r in [(530, 230, 1.3), (250, 130, 1.1), (60, 120, 1.2), (360, 190, 1)]:
        o.append(spike_star(x, y, r, '#e8f0ff', 8 + 5 * r, .9, .6))
    o.append(dust_stars(rnd, (0, 90, 582, 360), 110, ('#ffffff', '#dfe8ff', '#fff0dc', '#cfe0ff'), 1.1, .9))
    o.append(dust_stars(rnd, (0, 360, 582, 620), 24, ('#ffd8b0', '#ffe8c8'), .8, .6))
    obj = finish(k, u, o, .11)
    ann = top('RA 10H 37M 00S · DEC −58° 38′ · CARINA') + scalebar(22, 800, 60, '1 LY')
    return bg, obj, svg(W, H, ann)


# ================================================================= NGC 2070, THE TARANTULA
def tarantula(u):
    rnd = random.Random(2070)
    cx, cy = 298, 330
    bg = sky(u, H, ('#1a1428', '#0c0a16', '#030208'), 760, 2070, 5)
    k = Kit(u)
    o = []
    o.append(C(cx, cy, 300, k.rg([(0, '#ff7ab0', .5), (.3, '#e0507e', .3), (.6, '#8a2a5a', .14), (1, '#3a1030', 0)])))
    # the cavities: bubbles blown by R136, faint teal inside
    bubbles = [(cx - 40, cy - 60, 110, 90, -20), (cx + 90, cy + 20, 90, 110, 30), (cx - 90, cy + 90, 100, 70, 10), (cx + 40, cy - 150, 80, 60, -10), (cx + 10, cy + 150, 70, 60, 0)]
    cav = [E(x, y, rx * .9, ry * .9, k.rg([(0, '#30c0e8', .2), (.7, '#2a90c0', .1), (1, '#2a80b0', 0)]), 1, r) for x, y, rx, ry, r in bubbles]
    # the body of the nebula around the core
    mass = []
    while len(mass) < 34:
        x, y = rnd.gauss(0, 80), rnd.gauss(0, 72)
        if math.hypot(x, y) > 190:
            continue
        mass.append(P(lump(rnd, cx + x, cy + y, rnd.uniform(30, 76), rnd.uniform(20, 52), 12, .45), rnd.choice(['#ff3a80', '#e8306a', '#ff5a9a', '#c82a60', '#ff7ab0']), rnd.uniform(.25, .5)))
    o.append(g(mass, k.tex(.02, 106, 5, disp=50, sd=9)))
    # the legs: filament bundles curling out from the core
    legs = []
    for i in range(9):
        a0 = 2 * math.pi * i / 9 + rnd.uniform(-.3, .3)
        L = rnd.uniform(150, 330); curl = rnd.uniform(-.9, .9)
        for j in range(7):
            pts = []
            off = rnd.uniform(-.14, .14)
            for t in [x / 8 for x in range(9)]:
                a = a0 + off + curl * t * t
                r = 30 + L * t
                pts.append((cx + r * math.cos(a), cy + r * math.sin(a) * .9))
            legs.append(S(smooth(pts, False), rnd.choice(['#ff3a8a', '#e8306a', '#ff6aa8', '#ff4a78', '#d02a60']), rnd.uniform(1.5, 7), rnd.uniform(.25, .55)))
    o.append(g(g(legs, k.blur(5)), k.tex(.016, 101, 4, disp=50, sd=1), op=.8, blend='screen'))
    o.append(g(legs[::2], k.tex(.03, 102, 4, disp=24, sd=.6, a=2.6, b=-.7), op=.8, blend='screen'))
    # the shells' bright rims: arcs of compressed gas
    rims = []
    for x, y, rx, ry, r in bubbles:
        for _ in range(3):
            rims.append(E(x, y, rx * rnd.uniform(.95, 1.08), ry * rnd.uniform(.95, 1.08), 'none', 1, r + rnd.uniform(-8, 8),
                          ' pathLength="100" stroke="%s" stroke-width="%s" stroke-opacity="%s" stroke-dasharray="%s 100" stroke-dashoffset="%s"' % (
                              rnd.choice(['#ff6aa8', '#ff4a90', '#ffa0c8']), f(rnd.uniform(2, 6)), f(rnd.uniform(.3, .55)), f(rnd.uniform(25, 55)), f(rnd.uniform(0, 100)))))
    o.append(g([g(rims, k.blur(3.5)), g(rims[::3], op=.6)], k.tex(.03, 103, 4, disp=20, sd=.8), blend='screen'))
    clumps = [P(lump(rnd, cx + rnd.gauss(0, 100), cy + rnd.gauss(0, 95), rnd.uniform(20, 50), rnd.uniform(12, 30), 12, .5), rnd.choice(['#ff6aa0', '#ff8ab0', '#e04a80', '#ffb0c8']), rnd.uniform(.25, .5)) for _ in range(40)]
    o.append(g(clumps, k.tex(.025, 104, 5, disp=40, sd=1.6, a=3, b=-1.2), op=.7, blend='screen'))
    o.append(g(cav, k.tex(.02, 100, 4, disp=40, sd=4), blend='screen'))
    # dust: brown lanes and knots, heaviest to the south-west
    dust = []
    for _ in range(16):
        x, y = cx + rnd.gauss(-50, 100), cy + rnd.gauss(70, 90)
        a = rnd.uniform(0, 6.3); L = rnd.uniform(40, 110)
        dust.append(S('M%s %sq%s %s %s %s' % (f(x), f(y), f(L * .5 * math.cos(a + .5)), f(L * .5 * math.sin(a + .5)), f(L * math.cos(a)), f(L * math.sin(a))), rnd.choice(['#1a0810', '#2a0e10', '#3a1a14']), rnd.uniform(8, 22), rnd.uniform(.45, .7)))
    o.append(g(dust, k.tex(.03, 105, 4, disp=24, sd=3, a=2.4, b=-.4)))
    # R136: the blinding cluster at the heart
    o.append(C(cx, cy, 170, k.rg([(0, '#ffffff', 1), (.06, '#f4f8ff', .85), (.2, '#c0d4ff', .4), (.5, '#ff90c0', .14), (1, '#ff70a0', 0)]), 1, ' style="mix-blend-mode: screen"'))
    core = ''.join(C(cx + rnd.gauss(0, 9), cy + rnd.gauss(0, 8), rnd.uniform(.5, 1.5), '#ffffff', rnd.uniform(.6, 1)) for _ in range(60))
    o.append(core)
    o.append(spike_star(cx, cy, 3.6, '#e8f0ff', 60, 1, 1.2))
    for _ in range(14):
        a = rnd.uniform(0, 6.3); r = rnd.uniform(20, 160)
        o.append(spike_star(cx + r * math.cos(a), cy + r * math.sin(a), rnd.uniform(1, 1.8), rnd.choice(['#dfeaff', '#cfe0ff', '#fff0f8']), rnd.uniform(6, 14), .9, .6))
    o.append(dust_stars(rnd, (0, 90, 582, 620), 120, ('#ffffff', '#dfe8ff', '#ffe8f0'), 1, .8))
    obj = finish(k, u, o, .11)
    ann = top('RA 05H 38M 38S · DEC −69° 06′ · DORADO · LMC') + scalebar(22, 800, 60, '100 LY')
    return bg, obj, svg(W, H, ann)


PLATES = {
    'M16': m16, 'HORSEHEAD': horsehead, 'M57': m57, 'HELIX': helix, 'CATS-EYE': cats_eye, 'M8': m8, 'M20': m20, 'VEIL': veil, 'ROSETTE': rosette, 'CARINA': carina, 'TARANTULA': tarantula,
}

"""First Light, the Rare Sights: what the sky does now and then, at 582 × 832.

Eclipses of both kinds, the red Moon, the aurora, Venus on the Sun, the great
comet of 1997 and two meteor showers, one a storm. Same three layers as every
plate; the subject sits in the middle of the tall canvas and everything below
y ≈ 560 stays dark, since the card prints its name there.
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, label, scalebar, reticle
from more import top, spike_star, W, HF
from fl_deep import streak
from fl_solar import full_moon

H = HF


def blur(u, name, sd, pad=40):
    return '<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feGaussianBlur stdDeviation="%s"/></filter>' % (u, name, pad, pad, 100 + 2 * pad, 100 + 2 * pad, f(sd))


def stops(st):
    return ''.join('<stop offset="%s" stop-color="%s" stop-opacity="%s"/>' % (f(o) if not isinstance(o, str) else o, c, f(a)) for o, c, a in st)


def lg(id_, st, x1=0, y1=0, x2=0, y2=1, user=False):
    return '<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s"%s>%s</linearGradient>' % (
        id_, f(x1), f(y1), f(x2), f(y2), ' gradientUnits="userSpaceOnUse"' if user else '', stops(st))


def rg(id_, st, cx=.5, cy=.5, r=.5, user=False):
    return '<radialGradient id="%s" cx="%s" cy="%s" r="%s"%s>%s</radialGradient>' % (
        id_, f(cx), f(cy), f(r), ' gradientUnits="userSpaceOnUse"' if user else '', stops(st))


def noise(u, name, freq, oct_, seed, matrix):
    return ('<filter id="%s%s" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d"/>'
            '<feColorMatrix type="matrix" values="%s"/></filter>') % (u, name, freq, oct_, seed, matrix)


def night(u, st, n, seed, spikes, tints=('#ffffff', '#dfe8ff', '#fff1dc', '#cfe0ff'), extra='', extra_defs='', star_h=H):
    """A sky layer: a vertical gradient, then stars down to star_h."""
    d = SPIKE_DEFS.format(u=u) + lg(u + 'sky', st) + extra_defs
    return svg(W, H, '<rect width="%d" height="%d" fill="url(#%ssky)"/>' % (W, H, u) + starfield(W, star_h, n, seed, spikes, tints, u=u) + extra, d)


def ridge(rnd, anchors, rough=.5, levels=6):
    """Midpoint displacement between anchor points: a natural skyline. Returns a list of (x, y)."""
    pts = list(anchors)
    amp = max(abs(anchors[i + 1][1] - anchors[i][1]) for i in range(len(anchors) - 1)) * .35 + 14
    for _ in range(levels):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out.append(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + rnd.uniform(-1, 1) * amp))
            out.append(b)
        pts = out
        amp *= rough
    return pts


def land(pts, fill, bottom=H + 10, extra=''):
    return '<path d="M-10 %s%sL%d %sL%d %dL-10 %dZ" fill="%s"%s/>' % (
        f(pts[0][1]), ''.join('L%s %s' % (f(x), f(y)) for x, y in pts), W + 10, f(pts[-1][1]), W + 10, bottom, bottom, fill, extra)


def firs(rnd, x0, x1, n, base, hmin, hmax, col, jitter=4):
    out = []
    for _ in range(n):
        bx = rnd.uniform(x0, x1); h = rnd.uniform(hmin, hmax); b = base(bx) + rnd.uniform(-jitter, jitter)
        tiers = int(3 + h / 14)
        for k in range(tiers):
            yk = b - h * k / tiers; wk = (h * .3) * (1 - k / (tiers + 1)) * rnd.uniform(.8, 1.2)
            out.append('<path d="M%s %sL%s %sL%s %sZ" fill="%s"/>' % (f(bx - wk), f(yk), f(bx), f(yk - h / tiers * 1.8), f(bx + wk), f(yk), col))
        out.append('<rect x="%s" y="%s" width="1.6" height="12" fill="%s"/>' % (f(bx - .8), f(b - 4), col))
    return ''.join(out)


def leafy(rnd, x, base, h, col):
    """A broad summer tree: a trunk and a crown of overlapping lobes."""
    out = ['<path d="M%s %sL%s %sL%s %sL%s %sZ" fill="%s"/>' % (f(x - 2.5), f(base), f(x - 1.2), f(base - h * .5), f(x + 1.2), f(base - h * .5), f(x + 2.5), f(base), col)]
    for _ in range(9):
        r = h * rnd.uniform(.14, .24)
        out.append('<circle cx="%s" cy="%s" r="%s" fill="%s"/>' % (f(x + rnd.uniform(-.28, .28) * h), f(base - h * rnd.uniform(.45, .85)), f(r), col))
    return ''.join(out)


def bare(rnd, x, base, h, col):
    """A leafless tree: a trunk forking a few times."""
    out = []

    def br(x0, y0, a, L, w, d):
        x1, y1 = x0 + L * math.cos(a), y0 + L * math.sin(a)
        out.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s" stroke-linecap="round"/>' % (f(x0), f(y0), f(x1), f(y1), col, f(w)))
        if d:
            for s in (-1, 1):
                br(x1, y1, a + s * rnd.uniform(.25, .6), L * rnd.uniform(.6, .78), w * .65, d - 1)
    br(x, base, -math.pi / 2 + rnd.uniform(-.1, .1), h * .38, h * .06, 4)
    return ''.join(out)


def strata(rnd, u, y0, y1, n, dark, rim):
    """Thin layered cloud: long soft streaks, darker in the middle, lit along their upper rims."""
    out = []
    for _ in range(n):
        y = rnd.uniform(y0, y1); x = rnd.uniform(-60, W + 60); rx = rnd.uniform(90, 260); ry = rnd.uniform(1.5, 5) * (1 + (y - y0) / (y1 - y0))
        op = rnd.uniform(.45, .9)
        out.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(rx), f(ry), dark, f(op)))
        out.append('<ellipse cx="%s" cy="%s" rx="%s" ry=".8" fill="%s" opacity="%s"/>' % (f(x + rnd.uniform(-20, 20)), f(y - ry * .8), f(rx * .7), rim, f(op * .35)))
    return '<g filter="url(#%sb3)">%s</g>' % (u, ''.join(out))


# ================================================================= TOTAL SOLAR ECLIPSE
def total_eclipse(u):
    """Totality low over the mountains: the black disc in a long-petalled corona, the diamond ring breaking out at the lower limb, a sunset glow on every horizon."""
    rnd = random.Random(1999)
    cx, cy, R = 291, 342, 80
    bg = night(u, [(0, '#03050d', 1), (.3, '#070b1e', 1), (.5, '#10152f', 1), (.6, '#241f3c', 1), (.655, '#5a3444', 1), (.69, '#c06a40', 1), (.715, '#ffaa5a', 1), (1, '#ffaa5a', 1)],
               70, 8, 1, star_h=480)
    defs = (blur(u, 'b1', 1.2) + blur(u, 'b3', 3) + blur(u, 'b8', 8) + blur(u, 'b18', 18, 80) + blur(u, 'b40', 40, 120) +
            rg(u + 'pet', [(R / 420, '#ffffff', .95), (.3, '#f2f5ff', .55), (.6, '#dfe8ff', .18), (1, '#cfdcff', 0)], cx, cy, 420, True) +
            rg(u + 'in', [(.55, '#ffffff', 1), (.66, '#fbfcff', .8), (.8, '#e6eeff', .3), (1, '#dfe8ff', 0)]) +
            rg(u + 'out', [(0, '#c8d4f4', .35), (.4, '#a8b8e8', .12), (1, '#8090c8', 0)]) +
            rg(u + 'disc', [(.9, '#010103', 1), (1, '#0a0c16', 1)]) +
            rg(u + 'dia', [(0, '#ffffff', 1), (.15, '#fffaf0', .85), (.4, '#ffe8c8', .25), (1, '#ffd8a8', 0)]) +
            lg(u + 'glow', [(0, '#ffb060', 0), (.6, '#ff9a50', .35), (1, '#ffc078', .7)]) + lg(u + 'spk', [(0, '#fff', 0), (.5, '#fff', 1), (1, '#fff', 0)], 0, 0, 1, 0) + lg(u + 'spv', [(0, '#fff', 0), (.5, '#fff', 1), (1, '#fff', 0)]) +
            '<filter id="%swisp" x="-50%%" y="-50%%" width="200%%" height="200%%"><feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="3" seed="19"/><feDisplacementMap in="SourceGraphic" scale="14"/><feGaussianBlur stdDeviation="1.4"/></filter>' % u)
    o = ['<ellipse cx="%d" cy="%d" rx="330" ry="250" fill="url(#%sout)" transform="rotate(-22 %d %d)"/>' % (cx, cy, u, cx, cy)]
    # helmet streamers: tapering petals, long along a tilted equator, short and narrow at the poles
    tilt = math.radians(-22)
    pets = []
    for i in range(46):
        side = rnd.choice([0, math.pi])
        if rnd.random() < .3:
            a = tilt + math.pi / 2 + side + rnd.uniform(-.7, .7); L = R * rnd.uniform(1.4, 2.0); w = rnd.uniform(.05, .12)
        else:
            a = tilt + side + rnd.gauss(0, .38); eq = math.cos(a - tilt - side)
            L = R * (1.6 + 3.6 * eq ** 6 * rnd.uniform(.5, 1.15)); w = rnd.uniform(.12, .32)
        bend = rnd.uniform(-.12, .12)
        p1 = (cx + R * math.cos(a - w), cy + R * math.sin(a - w)); p2 = (cx + R * math.cos(a + w), cy + R * math.sin(a + w))
        tip = (cx + L * math.cos(a + bend), cy + L * math.sin(a + bend))
        m = R + (L - R) * .35
        c1 = (cx + m * math.cos(a - w * .55 + bend * .4), cy + m * math.sin(a - w * .55 + bend * .4)); c2 = (cx + m * math.cos(a + w * .55 + bend * .4), cy + m * math.sin(a + w * .55 + bend * .4))
        pets.append('<path d="M%s %sQ%s %s %s %sQ%s %s %s %sZ" fill="url(#%spet)" opacity="%s"/>' % (
            f(p1[0]), f(p1[1]), f(c1[0]), f(c1[1]), f(tip[0]), f(tip[1]), f(c2[0]), f(c2[1]), f(p2[0]), f(p2[1]), u, f(rnd.uniform(.25, .6))))
    o.append('<g filter="url(#%sb18)">%s</g>' % (u, ''.join(pets)))
    o.append('<g filter="url(#%sb3)" opacity=".7">%s</g>' % (u, ''.join(pets[::2])))
    # fine structure: hair-thin rays, combed by a displacement so they wave
    rays = []
    for i in range(260):
        a = rnd.uniform(0, 2 * math.pi); eq = abs(math.cos(a - tilt))
        L = R * (1.15 + rnd.uniform(.2, .8) + 1.6 * eq ** 4 * rnd.random())
        rays.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#fff" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(cx + R * math.cos(a)), f(cy + R * math.sin(a)), f(cx + L * math.cos(a)), f(cy + L * math.sin(a)), f(rnd.uniform(.08, .35)), f(rnd.uniform(.4, 1.1))))
    o.append('<g filter="url(#%swisp)">%s</g>' % (u, ''.join(rays)))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sin)"/>' % (cx, cy, R + 34, u))
    # the chromosphere, a pink sliver where the diamond is about to break; prominences elsewhere
    da = math.radians(138)
    arc = 'M%s %sA%d %d 0 0 1 %s %s' % (f(cx + (R + 1) * math.cos(da - .55)), f(cy + (R + 1) * math.sin(da - .55)), R + 1, R + 1, f(cx + (R + 1) * math.cos(da + .55)), f(cy + (R + 1) * math.sin(da + .55)))
    o.append('<path d="%s" fill="none" stroke="#ff4a7a" stroke-width="4" stroke-opacity=".8" filter="url(#%sb1)"/>' % (arc, u))
    for deg, s, ht in ((-48, 1.1, 1.6), (12, .8, 1), (205, 1.3, 1.3), (262, .7, .9), (95, .9, 1.1)):
        t = math.radians(deg)
        px, py = cx + (R + 3 * ht) * math.cos(t), cy + (R + 3 * ht) * math.sin(t)
        o.append('<path d="%s" fill="#ff3a6e" opacity=".75" filter="url(#%sb1)"/>' % (blob(px, py, 6 * s, 4 * s * ht, rnd, 9, .5), u))
        o.append('<path d="%s" fill="#ffb4c8" opacity=".8"/>' % blob(px, py, 2.6 * s, 1.8 * s * ht, rnd, 8, .3))
    # a looped prominence on the upper right
    t = math.radians(-20)
    lx, ly = cx + R * math.cos(t), cy + R * math.sin(t)
    o.append('<path d="M%s %sq10 -16 20 -2" fill="none" stroke="#ff5a88" stroke-width="2.6" stroke-opacity=".85" filter="url(#%sb1)" transform="rotate(-20 %s %s)"/>' % (f(lx - 4), f(ly), u, f(lx), f(ly)))
    # the Moon
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sdisc)"/>' % (cx, cy, R, u))
    # the diamond ring: one bead of photosphere, a flare and long spikes
    dx, dy = cx + R * math.cos(da), cy + R * math.sin(da)
    o.append('<circle cx="%s" cy="%s" r="90" fill="url(#%sdia)" opacity=".85"/>' % (f(dx), f(dy), u))
    o.append('<circle cx="%s" cy="%s" r="16" fill="#fff" opacity=".9" filter="url(#%sb8)"/>' % (f(dx), f(dy), u))
    o.append('<g filter="url(#%sb1)" opacity=".7"><path d="M%s %sH%s" stroke="url(#%sspk)" stroke-width="1.6"/></g>' % (u, f(dx - 70), f(dy), f(dx + 70), u))
    o.append('<g filter="url(#%sb1)" opacity=".55"><path d="M%s %sV%s" stroke="url(#%sspv)" stroke-width="1.4"/></g>' % (u, f(dx), f(dy - 55), f(dy + 55), u))
    o.append('<circle cx="%s" cy="%s" r="5" fill="#fff"/>' % (f(dx), f(dy)))
    # planets out in the dark: Venus bright and low, Jupiter higher on the other side
    o.append(spike_star(108, 452, 2.8, '#fff1d8', 30, 1, 1.1))
    o.append(spike_star(478, 226, 2, '#ffe8c8', 20, .95, .9))
    o.append(spike_star(426, 474, 1.3, '#ffd2b0', 12, .8, .7))
    # the shadow's edge all round: an orange horizon behind two ranges of mountains
    o.append('<rect y="470" width="%d" height="130" fill="url(#%sglow)" opacity=".75" filter="url(#%sb18)"/>' % (W, u, u))
    far = ridge(rnd, [(-10, 560), (80, 528), (170, 556), (260, 548), (360, 566), (470, 534), (600, 548)], .55)
    near = ridge(rnd, [(-10, 548), (60, 572), (170, 598), (300, 606), (420, 596), (520, 568), (600, 552)], .5)
    o.append(land(far, '#4a3a4c'))
    o.append(land(far, '#ffc080', extra=' opacity=".35" transform="translate(0 -1.2)"'))
    o.append(land(far, '#3a2e40'))
    o.append(land(near, '#100c16'))
    o.append('<rect y="640" width="%d" height="%d" fill="#07060b"/>' % (W, H - 640))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .09), defs)
    ann = [top('TOTALITY · THE MOON 1.04× THE SUN · CORONA AT 1,000,000 °C'),
           label((dx, dy), (22, 520), ['DIAMOND RING', 'THE LAST BEAD OF SUN']),
           label((108, 452), (22, 410), ['VENUS']),
           label((cx + (R + 60) * math.cos(tilt), cy + (R + 60) * math.sin(tilt)), (560, 210), ['CORONA', 'STREAMERS'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= RING OF FIRE
def ring_of_fire(u):
    """An annular eclipse high over a calm sea: the Moon too small to cover the Sun, a blazing ring, thin cloud drifting across it."""
    rnd = random.Random(2023)
    cx, cy, Rs = 291, 362, 150
    Rm = 136
    mx, my = cx + 3, cy - 2
    bg = svg(W, H, '<rect width="%d" height="%d" fill="url(#%ssky)"/>' % (W, H, u) + '<rect width="%d" height="%d" fill="url(#%sv)"/>' % (W, H, u),
             rg(u + 'sky', [(0, '#5a2408', 1), (.25, '#2e1206', 1), (.55, '#120705', 1), (1, '#050203', 1)], cx, cy, 560, True) +
             lg(u + 'v', [(0, '#000', .35), (.6, '#000', 0), (1, '#000', .5)]))
    defs = (blur(u, 'b1', 1.2) + blur(u, 'b3', 3) + blur(u, 'b6', 6) + blur(u, 'b16', 16, 60) + blur(u, 'b40', 40, 120) +
            rg(u + 'sun', [(0, '#fff6d0', 1), (.82, '#ffe08a', 1), (.9, '#ffd060', 1), (.955, '#ffa830', 1), (.985, '#f07a18', 1), (1, '#d04a0c', 1)]) +
            rg(u + 'halo', [(0, '#ffb040', .55), (.3, '#ff8a2a', .3), (.6, '#e8601a', .1), (1, '#c04010', 0)]) +
            rg(u + 'moon', [(0, '#0a0405', 1), (.85, '#060203', 1), (1, '#1a0806', 1)]) +
            lg(u + 'sea', [(0, '#2a1006', 1), (.2, '#100604', 1), (1, '#030102', 1)]) +
            '<clipPath id="%sring"><circle cx="%d" cy="%d" r="%d"/></clipPath>' % (u, cx, cy, Rs) +
            noise(u, 'gran', '.11', 2, 7, '0 0 0 0 .55  0 0 0 0 .2  0 0 0 0 .02  0 0 0 -2.4 1.3'))
    o = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%shalo)"/>' % (cx, cy, Rs * 2.6, u),
         '<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#ff9a30" stroke-width="40" stroke-opacity=".45" filter="url(#%sb40)"/>' % (cx, cy, Rs + 10, u),
         '<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#ffc060" stroke-width="18" stroke-opacity=".6" filter="url(#%sb16)"/>' % (cx, cy, Rs + 2, u)]
    # the Sun, granulated, its limb reddened
    o.append('<g clip-path="url(#%sring)"><circle cx="%d" cy="%d" r="%d" fill="url(#%ssun)"/><rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sgran)" opacity=".35"/></g>' % (
        u, cx, cy, Rs, u, cx - Rs, cy - Rs, 2 * Rs, 2 * Rs, u))
    # the Moon, a hair off centre, so the ring is a touch thicker on one side; its edge glows into the dark
    o.append('<circle cx="%d" cy="%d" r="%d" fill="#ffeab0" opacity=".8" filter="url(#%sb3)"/>' % (mx, my, Rm + 2, u))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%smoon)"/>' % (mx, my, Rm, u))
    # the hot inner edge of the ring
    o.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#fffbe6" stroke-width="2.4" stroke-opacity=".75" filter="url(#%sb1)"/>' % (mx, my, f(Rm + 2.5), u))
    # a little lunar relief on the Moon's limb: mountains breaking the ring's inner edge
    bumps = ''.join('<circle cx="%s" cy="%s" r="%s" fill="#070304"/>' % (f(mx + Rm * math.cos(t)), f(my + Rm * math.sin(t)), f(rnd.uniform(.6, 1.3))) for t in [rnd.uniform(0, 2 * math.pi) for _ in range(24)])
    o.append(bumps)
    # thin strata crossing the lower ring, black against it, lit along their tops
    o.append(strata(rnd, u, 452, 520, 16, '#140604', '#ffb050'))
    # the sea, and the Sun's road on it
    hz = 600
    o.append('<rect y="%d" width="%d" height="%d" fill="url(#%ssea)"/>' % (hz, W, H - hz, u))
    gl = []
    for _ in range(170):
        t = rnd.random() ** 1.6; y = hz + 3 + t * 180
        x = cx + rnd.gauss(0, 14 + 60 * t)
        gl.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s"/>' % (
            f(x), f(y), f(rnd.uniform(2, 10) * (1 + t)), f(.5 + t), rnd.choice(['#ffc060', '#ff9a30', '#ffe0a0']), f(rnd.uniform(.25, .7) * (1 - t * .8))))
    o.append(''.join(gl))
    o.append('<rect y="%d" width="%d" height="2" fill="#ff9a40" opacity=".4" filter="url(#%sb1)"/>' % (hz - 1, W, u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('ANNULAR ECLIPSE · THE MOON 0.94× THE SUN · ALWAYS USE A FILTER'),
           reticle(cx, cy, Rs + 26, 72, 4, .16),
           label((cx + Rs * .7, cy - Rs * .71), (560, 160), ['ANNULUS', 'THE SUN LEFT SHOWING'], 'end'),
           label((mx - Rm * .4, my), (22, 250), ['THE MOON', 'NEAR APOGEE'])]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= BLOOD MOON
def blood_moon(u):
    """Totality: the Moon deep in Earth's shadow, copper-red and dark on the side nearest the shadow's heart, a blue fringe on the other; the stars out all round it."""
    rnd = random.Random(2025)
    cx, cy, R = 291, 366, 160
    bg = night(u, [(0, '#03040c', 1), (.4, '#070a1a', 1), (.7, '#0a0c1c', 1), (1, '#030308', 1)], 560, 2025, 7,
               tints=('#ffffff', '#dfe8ff', '#fff1dc', '#cfe0ff', '#ffd8b8'),
               extra='<ellipse cx="300" cy="380" rx="520" ry="120" fill="#8a90c0" opacity=".1" transform="rotate(-60 300 380)" filter="url(#%smw)"/>' % u,
               extra_defs=blur(u, 'mw', 40, 100))
    mdefs, body = full_moon(u, cx, cy, R, rnd, ('.34', '.3', [('0', '#d65a3a'), ('.35', '#a8301e'), ('.7', '#6e1410'), ('1', '#300606')]),
                            mare='#4a0e08', mare_op=.32, ray_col='#ff9a70', ray_op=.05, crater_tint=('#4a1008', '#c8603a', '#d87a50'))
    ux, uy = cx + R * 1.05, cy + R * .95
    defs = mdefs + blur(u, 'b3', 3) + blur(u, 'b30', 30, 80) + (
        rg(u + 'umb', [(0, '#080101', .95), (.35, '#100202', .82), (.55, '#200604', .45), (.78, '#2a0804', 0)], ux, uy, R * 2.5, True) +
        rg(u + 'lit', [(0, '#ffb08a', .42), (.5, '#ff7a5a', .14), (1, '#ff7a5a', 0)], cx - R * .8, cy - R * .75, R * 1.3, True) +
        rg(u + 'red', [(.5, '#c03a14', .3), (.75, '#8a2008', .1), (1, '#8a2008', 0)]))
    o = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sred)"/>' % (cx, cy, R * 2, u),
         '<g clip-path="url(#%sdisk)">%s<circle cx="%d" cy="%d" r="%d" fill="url(#%sumb)"/><circle cx="%d" cy="%d" r="%d" fill="url(#%slit)" style="mix-blend-mode: screen"/>' % (
             u, body, cx, cy, R, u, cx, cy, R, u),
         # the ozone's blue fringe on the limb farthest from the shadow's centre
         '<path d="M%s %sA%d %d 0 0 1 %s %s" fill="none" stroke="#8ad8f0" stroke-width="6" stroke-opacity=".5" filter="url(#%sb3)"/></g>' % (
             f(cx + R * math.cos(math.radians(150))), f(cy + R * math.sin(math.radians(150))), R, R, f(cx + R * math.cos(math.radians(-60))), f(cy + R * math.sin(math.radians(-60))), u),
         '<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#ff9a6a" stroke-opacity=".22" stroke-width="1"/>' % (cx, cy, f(R - .5))]
    # a few bright stars that would be lost in moonlight any other night
    for x, y, r, c in ((76, 214, 2.4, '#ffd8b0'), (502, 470, 2, '#dfe8ff'), (468, 168, 1.6, '#cfe0ff'), (98, 520, 1.5, '#fff1dc'), (532, 300, 1.3, '#ffffff')):
        o.append(spike_star(x, y, r, c, r * 9, 1, .8))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('TOTAL LUNAR ECLIPSE · THE MOON IN THE UMBRA · 1 H 05 M'),
           label((cx + R * .6, cy + R * .6), (560, 600), ['DEEPEST SHADOW', 'TOWARD THE UMBRA’S AXIS'], 'end'),
           label((cx - R * .78, cy - R * .55), (22, 150), ['BLUE FRINGE', 'SUNLIGHT THROUGH OZONE'])]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= AURORA
def aurora(u):
    """Curtains of the northern lights folding over a mountain lake: green from oxygen low down, red at the tops, a violet hem; all of it again in the water."""
    rnd = random.Random(1859)
    hz = 600
    bg = night(u, [(0, '#02040c', 1), (.4, '#040b16', 1), (.62, '#06121a', 1), (.72, '#0a1c20', 1), (1, '#020406', 1)], 340, 1859, 4, star_h=hz)
    defs = (blur(u, 'b1', 1) + blur(u, 'b2', 2.2) + blur(u, 'b6', 6) + blur(u, 'b14', 14, 60) + blur(u, 'b30', 30, 80) +
            lg(u + 'ray', [(0, '#c0306a', 0), (.18, '#d0386a', .3), (.42, '#a85a80', .22), (.6, '#3ee08c', .45), (.86, '#6dffa8', .9), (.96, '#d8ffe6', 1), (1, '#9a6aff', 0)]) +
            lg(u + 'rayF', [(0, '#c0306a', 0), (.3, '#c8406a', .25), (.65, '#38c880', .4), (.95, '#8affb8', .8), (1, '#8affb8', 0)]) +
            lg(u + 'lake', [(0, '#06141a', 1), (1, '#020406', 1)]) +
            lg(u + 'air', [(0, '#2aff9a', 0), (1, '#2aff9a', .07)]) +
            '<clipPath id="%swater"><rect y="%d" width="%d" height="%d"/></clipPath>' % (u, hz, W, H - hz) +
            '<filter id="%sripple" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".004 .09" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="14" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="1.5"/></filter>' % u)

    def curtain(base, height, x0, x1, n, grad, op, wmin, wmax, fold):
        rays = []
        for i in range(n):
            x = x0 + (x1 - x0) * i / n + rnd.uniform(-2, 2)
            b = base(x) + rnd.uniform(-5, 5) + (rnd.uniform(4, 16) if rnd.random() < .12 else 0); h = height(x) * rnd.uniform(.65, 1.1)
            k = .18 + .82 * math.sin(x / fold + 1.3) ** 4 * rnd.uniform(.6, 1.2)
            rays.append('<rect x="%s" y="%s" width="%s" height="%s" fill="url(#%s%s)" opacity="%s"/>' % (
                f(x), f(b - h), f(rnd.uniform(wmin, wmax)), f(h), u, grad, f(op * k * rnd.uniform(.35, 1))))
        return ''.join(rays)

    # the main curtain comes down from the upper left toward the right horizon, folding as it goes
    b1 = lambda x: 300 + .36 * x + 34 * math.sin(x / 64 + .6) + 12 * math.sin(x / 19)
    h1 = lambda x: 170 + 90 * math.sin(x / 120 + 1.2) ** 2
    # a fainter one behind, higher, running the other way
    b2 = lambda x: 300 - .12 * x + 26 * math.sin(x / 48 + 2.4)
    h2 = lambda x: 120 + 70 * math.cos(x / 80) ** 2
    sky = []
    sky.append('<rect y="520" width="%d" height="%d" fill="url(#%sair)"/>' % (W, hz - 520, u))
    far = curtain(b2, h2, -20, W + 20, 200, 'rayF', .42, 2, 6, 34)
    sky.append('<g filter="url(#%sb14)" opacity=".6">%s</g><g filter="url(#%sb2)" opacity=".6">%s</g>' % (u, far, u, far))
    main = curtain(b1, h1, -20, W + 20, 420, 'ray', 1, 1.2, 4.5, 22)
    # where the ribbon folds back on itself: a second, brighter sheet in front over the middle
    b4 = lambda x: b1(x) - 44 + 20 * math.sin(x / 30)
    fold = curtain(b4, lambda x: 120 + 60 * math.sin((x - 150) / 260 * math.pi), 150, 410, 160, 'ray', .8, 1, 3.5, 14)
    sky.append('<g filter="url(#%sb30)" opacity=".18">%s</g><g filter="url(#%sb6)" opacity=".5">%s</g><g filter="url(#%sb1)">%s</g><g filter="url(#%sb1)">%s</g>' % (u, main, u, main, u, main, u, fold))
    for lo, hi, bb in ((-20, W + 20, b1), (150, 410, b4)):
        for _ in range(26):
            x = rnd.uniform(lo, hi); L = rnd.uniform(14, 50)
            pts = ' '.join('%s,%s' % (f(t), f(bb(t) + 3)) for t in (x, x + L / 2, x + L))
            sky.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="%s" filter="url(#%sb2)"/>' % (
                pts, rnd.choice(['#b890ff', '#a87aff']), f(rnd.uniform(2, 4)), f(rnd.uniform(.06, .18)), u))
    sky = ''.join(sky)
    # mountains: a big peak left, a shoulder right, a low saddle where the lights come down
    mts = ridge(rnd, [(-10, 520), (60, 452), (140, 498), (230, 556), (330, 566), (420, 520), (500, 488), (600, 530)], .52)
    snow = ''.join('<path d="M%s %sL%s %s" stroke="#bfffe0" stroke-opacity="%s" stroke-width="1"/>' % (f(a[0]), f(a[1] + 1), f(b[0]), f(b[1] + 1), f(rnd.uniform(.08, .22)))
                   for a, b in zip(mts, mts[1:]) if a[1] < 530 and rnd.random() < .7)
    shore = lambda x: hz - 2
    trees = firs(rnd, -10, W + 10, 120, shore, 14, 44, '#020507', 3)
    land_ = land(mts, '#05090c', hz + 4) + snow + trees + '<rect y="%d" width="%d" height="4" fill="#020507"/>' % (hz - 4, W)
    o = [sky, land_]
    # the lake: the same sky upside down, darker and broken by ripples
    o.append('<rect y="%d" width="%d" height="%d" fill="url(#%slake)"/>' % (hz, W, H - hz, u))
    refl = '<g transform="matrix(1 0 0 -1 0 %d)">%s%s</g>' % (2 * hz, sky, land(mts, '#030608', hz + 4) + trees)
    o.append('<g clip-path="url(#%swater)"><g filter="url(#%sripple)" opacity=".42">%s</g></g>' % (u, u, refl))
    o.append(''.join('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#020406" stroke-opacity=".5" stroke-width="%s"/>' % (
        f(x), f(y), f(x + rnd.uniform(30, 120)), f(y), f(rnd.uniform(.6, 1.8))) for x, y in [(rnd.uniform(-40, W), rnd.uniform(hz + 6, H)) for _ in range(40)]))
    o.append('<rect y="%d" width="%d" height="%d" fill="#020406" opacity=".35"/>' % (hz + 60, W, H - hz - 60))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('AURORA BOREALIS · 100–300 KM UP · KP 7'),
           label((150, b1(150) - 170), (22, 150), ['RED · OXYGEN', 'ABOVE 200 KM']),
           label((400, b1(400) - 30), (560, 320), ['GREEN · OXYGEN', '557.7 NM, 100–200 KM'], 'end'),
           label((260, b1(260) + 6), (560, 560), ['VIOLET HEM', 'NITROGEN'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= TRANSIT OF VENUS
def venus_transit(u):
    """The Sun going down over the sea, huge and gold through the haze, with a small perfectly round black dot on its face: Venus."""
    rnd = random.Random(2012)
    cx, cy, R = 291, 338, 164
    hz = 590
    bg = night(u, [(0, '#0c0a1e', 1), (.3, '#24132e', 1), (.5, '#5a2232', 1), (.62, '#a8452c', 1), (.7, '#e07a32', 1), (.72, '#f09a48', 1), (1, '#f09a48', 1)], 40, 6, 0, star_h=200)
    vx, vy, vr = cx - 100, cy - 26, 10
    defs = (blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b10', 10, 60) + blur(u, 'b40', 40, 120) +
            '<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>' % (u, cx, cy, R) +
            rg(u + 'sun', [(0, '#ffe6a0', 1), (.4, '#ffbe4a', 1), (.7, '#f5962a', 1), (.86, '#e0701a', 1), (.95, '#bc4c10', 1), (1, '#8a2c08', 1)], .5, .5, .5) +
            rg(u + 'halo', [(.3, '#ffc060', .55), (.5, '#ff9a40', .2), (1, '#ff7a30', 0)]) +
            lg(u + 'haze', [(0, '#000', 0), (.55, '#b8300a', 0), (1, '#9a2a08', .45)]) +
            lg(u + 'sea', [(0, '#5a2a24', 1), (.08, '#2a1420', 1), (.4, '#120a14', 1), (1, '#06040a', 1)]) +
            noise(u, 'gran', '.18', 2, 11, '0 0 0 0 .45  0 0 0 0 .16  0 0 0 0 .02  0 0 0 -3 1.6') +
            noise(u, 'fac', '.035', 3, 13, '0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .8  0 0 0 -3 1.4'))
    o = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%shalo)"/>' % (cx, cy, R * 2.1, u),
         '<circle cx="%d" cy="%d" r="%d" fill="#ffb050" opacity=".35" filter="url(#%sb40)"/>' % (cx, cy, R + 10, u)]
    d = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%ssun)"/>' % (cx, cy, R, u),
         '<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sgran)" opacity=".4"/>' % (cx - R, cy - R, 2 * R, 2 * R, u)]
    # faculae: bright mottling, only near the limb where the disc is darker
    d.append('<g opacity=".5"><rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sfac)" mask="url(#%slimbm)"/></g>' % (cx - R, cy - R, 2 * R, 2 * R, u, u))
    defs += '<mask id="%slimbm"><circle cx="%d" cy="%d" r="%d" fill="url(#%slimbg)"/></mask>' % (u, cx, cy, R, u) + rg(u + 'limbg', [(.72, '#fff', 0), (.92, '#fff', .8), (1, '#fff', .3)])
    # two sunspot groups
    for gx, gy, n, s in ((cx + 66, cy + 4, 6, .8), (cx - 10, cy + 92, 3, .55)):
        for i in range(n):
            x, y = gx + rnd.gauss(0, 18 * s), gy + rnd.gauss(0, 7 * s); r = rnd.uniform(3, 9) * s * (1.4 if i == 0 else 1)
            d.append('<path d="%s" fill="#8a3208" opacity=".5" filter="url(#%sb1)"/>' % (blob(x, y, r * 1.6, r * 1.3, rnd, 10, .35), u))
            d.append('<path d="%s" fill="#1e0702" opacity=".95"/>' % blob(x, y, r * .75, r * .62, rnd, 8, .25))
    d.append('<rect x="%d" y="%d" width="%d" height="%d" fill="url(#%shaze)"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    o.append('<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(d)))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#ffcf80" stroke-width="5" stroke-opacity=".3" filter="url(#%sb3)"/>' % (cx, cy, R, u))
    # Venus
    o.append('<circle cx="%s" cy="%s" r="%s" fill="#050203"/><circle cx="%s" cy="%s" r="%s" fill="none" stroke="#1a0804" stroke-opacity=".6" stroke-width="1"/>' % (
        f(vx), f(vy), f(vr), f(vx), f(vy), f(vr + .5)))
    # strata over the lower disc, dark violet with bright rims
    o.append(strata(rnd, u, 470, 560, 12, '#2a0e1c', '#ffc070'))
    # the sea, a gold road on it
    o.append('<rect y="%d" width="%d" height="%d" fill="url(#%ssea)"/>' % (hz, W, H - hz, u))
    gl = []
    for _ in range(220):
        t = rnd.random() ** 1.5; y = hz + 2 + t * 200
        gl.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s"/>' % (
            f(cx + rnd.gauss(0, 30 + 70 * t)), f(y), f(rnd.uniform(2, 12) * (1 + t)), f(.5 + t * 1.2), rnd.choice(['#ffd070', '#ffb050', '#ff9a40']), f(rnd.uniform(.25, .7) * (1 - t * .85))))
    o.append(''.join(gl))
    o.append('<rect y="%d" width="%d" height="2" fill="#ffc070" opacity=".5" filter="url(#%sb1)"/>' % (hz - 1, W, u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('6 JUNE 2012 · THE LAST UNTIL 11 DECEMBER 2117'),
           label((vx, vy), (22, 190), ['VENUS', '58″ ACROSS · 1/32 OF THE SUN']),
           label((cx + 66, cy + 4), (560, 230), ['SUNSPOTS', 'EACH WIDER THAN VENUS'], 'end'),
           '<path d="M%s %sL%s %s" stroke="rgba(245,241,232,.35)" stroke-width=".7" stroke-dasharray="2 4"/>' % (f(vx - 80), f(vy - 40), f(vx + 330), f(vy + 125))]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= HALE-BOPP
def hale_bopp(u):
    """The great comet of 1997 low in the evening sky: a bright head over the hills, a broad curved white dust tail and a straight blue ion tail fanning up and away."""
    rnd = random.Random(1997)
    nx, ny = 356, 472
    bg = night(u, [(0, '#03050f', 1), (.4, '#081028', 1), (.6, '#101c3c', 1), (.7, '#1e2a4c', 1), (.73, '#3a3a58', 1), (1, '#3a3a58', 1)], 420, 1997, 5, star_h=600,
               extra='<ellipse cx="40" cy="610" rx="300" ry="90" fill="url(#%sdusk)"/>' % u,
               extra_defs=rg(u + 'dusk', [(0, '#e0905a', .45), (.6, '#a0604a', .12), (1, '#a0604a', 0)]))
    ix, iy = 196, 50          # where the ion tail points
    defs = (blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b6', 6) + blur(u, 'b12', 12, 60) + blur(u, 'b24', 24, 80) +
            lg(u + 'dust', [(0, '#fffbea', .9), (.25, '#fbf0d4', .5), (.6, '#f0e2c4', .18), (1, '#e8d8b8', 0)], nx, ny, 40, 150, True) +
            lg(u + 'ion', [(0, '#d8ecff', .9), (.3, '#7ab4ff', .55), (.7, '#4a86f0', .2), (1, '#4a86f0', 0)], nx, ny, ix, iy, True) +
            rg(u + 'coma', [(0, '#ffffff', 1), (.1, '#fffaf0', .95), (.3, '#f0f8e8', .5), (.6, '#a8e8d8', .14), (1, '#a8e8d8', 0)]))
    o = []
    # dust tail: an envelope, then striae combed along it
    outer = 'M%d %dC%d %d %d %d %d %d' % (nx, ny, nx - 40, ny - 80, nx - 210, ny - 170, -40, ny - 250)
    inner = 'L%d %dC%d %d %d %d %d %d' % (40, 60, 170, 140, nx - 50, ny - 150, nx, ny)
    o.append('<path d="%s%sZ" fill="url(#%sdust)" filter="url(#%sb24)"/>' % (outer, inner, u, u))
    o.append('<path d="%s%sZ" fill="url(#%sdust)" opacity=".6" filter="url(#%sb6)"/>' % (outer, inner, u, u))
    st = []
    for i in range(46):
        t = rnd.random()
        ex, ey = -40 + (40 + 40) * t ** .8, ny - 250 - (ny - 250 - 60) * t
        c1 = (nx - 40 + 10 * t, ny - 80 - 40 * t); c2 = (nx - 210 + 120 * t, ny - 170 + 20 * t)
        L = rnd.uniform(.5, 1)
        st.append('<path d="M%d %dC%s %s %s %s %s %s" fill="none" stroke="#fff8e6" stroke-opacity="%s" stroke-width="%s"/>' % (
            nx, ny, f(c1[0]), f(c1[1]), f(c2[0]), f(c2[1]), f(nx + (ex - nx) * L), f(ny + (ey - ny) * L), f(rnd.uniform(.06, .2) * (1.4 - t)), f(rnd.uniform(1, 5))))
    o.append('<g filter="url(#%sb3)">%s</g>' % (u, ''.join(st)))
    # the sharp leading edge of the dust tail
    o.append('<path d="%s" fill="none" stroke="#fffbe8" stroke-opacity=".35" stroke-width="3" filter="url(#%sb3)"/>' % (outer, u))
    # ion tail: straight, narrow, blue, a bundle of streamers with a knot or two
    o.append('<path d="M%d %dL%d %d" stroke="url(#%sion)" stroke-width="30" stroke-linecap="round" opacity=".55" filter="url(#%sb12)"/>' % (nx, ny, ix, iy, u, u))
    io = []
    for _ in range(16):
        ex, ey = ix + rnd.gauss(0, 16), iy + rnd.gauss(0, 8)
        io.append('<path d="M%d %dL%s %s" stroke="url(#%sion)" stroke-width="%s" stroke-opacity="%s"/>' % (nx, ny, f(ex), f(ey), u, f(rnd.uniform(.6, 2.6)), f(rnd.uniform(.3, .8))))
    o.append('<g filter="url(#%sb1)">%s</g>' % (u, ''.join(io)))
    for t in (.36, .58):
        kx, ky = nx + (ix - nx) * t, ny + (iy - ny) * t
        o.append('<ellipse cx="%s" cy="%s" rx="7" ry="22" fill="#9ccaff" opacity=".2" filter="url(#%sb6)" transform="rotate(%s %s %s)"/>' % (
            f(kx), f(ky), u, f(math.degrees(math.atan2(iy - ny, ix - nx)) + 90), f(kx), f(ky)))
    # the head: a hood thrown toward the Sun, the coma, a star-like core
    o.append('<path d="M%d %dQ%d %d %d %d" fill="none" stroke="#fffbe8" stroke-opacity=".35" stroke-width="3" filter="url(#%sb3)"/>' % (nx - 26, ny - 6, nx + 14, ny + 34, nx + 10, ny - 20, u))
    o.append('<circle cx="%d" cy="%d" r="54" fill="url(#%scoma)"/>' % (nx, ny, u))
    o.append(spike_star(nx, ny, 4, '#fffbe8', 34, 1, 1.1))
    # hills, a lone tree, a small observatory on the ridge
    hills = ridge(rnd, [(-10, 588), (120, 576), (260, 596), (380, 584), (470, 566), (600, 578)], .5, 6)
    o.append(land(hills, '#1a1e30', extra=' transform="translate(0 -8)" opacity=".7"'))
    o.append(land(hills, '#05060c'))
    domex, domey = 470, 568
    o.append('<path d="M%d %dh40v-22h-40Z" fill="#05060c"/><path d="M%d %dA22 22 0 0 1 %d %dZ" fill="#05060c"/><path d="M%d %dl4 -20h5l-1 20Z" fill="#2a3456" opacity=".9"/>' % (
        domex - 20, domey, domex - 22, domey - 21, domex + 22, domey - 21, domex + 3, domey - 21))
    o.append(bare(rnd, 120, 580, 70, '#05060c'))
    o.append(firs(rnd, 0, 70, 6, lambda x: 592, 20, 40, '#05060c'))
    o.append('<rect y="640" width="%d" height="%d" fill="#04050a"/>' % (W, H - 640))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('C/1995 O1 · PERIHELION 1 APRIL 1997 · NUCLEUS ~60 KM'),
           label((nx, ny), (560, 520), ['NUCLEUS', 'TEN TIMES HALLEY’S'], 'end'),
           label((nx + (ix - nx) * .55, ny + (iy - ny) * .55), (560, 200), ['ION TAIL', 'GAS · STRAIGHT FROM THE SUN'], 'end'),
           label((120, 300), (22, 470), ['DUST TAIL', 'CURVED · SUNLIT DUST'])]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= THE LEONID STORM
def leonids(u):
    """A meteor storm: hundreds of streaks bursting from the Sickle of Leo, short near the radiant and long far from it, over a dark ridge."""
    rnd = random.Random(1833)
    hz = 598
    bg = night(u, [(0, '#03050f', 1), (.45, '#070c22', 1), (.68, '#0e1632', 1), (.72, '#161e3a', 1), (1, '#0a0c18', 1)], 420, 1833, 4, star_h=hz)
    rx, ry = 290, 300
    defs = blur(u, 'b2', 1.8) + blur(u, 'b8', 8, 200) + blur(u, 'b30', 30, 80)
    o = ['<circle cx="%d" cy="%d" r="140" fill="#9ab4ff" opacity=".08" filter="url(#%sb30)"/>' % (rx, ry, u)]
    # Leo, projected about the radiant (RA 10h 12m, Dec +22°)
    ra0, de0, s = 10.2, 22, 9.5
    leo = [('REGULUS', 10.14, 11.97, 1.35, '#cfe0ff'), ('ETA', 10.12, 16.76, 3.5, '#f4f0ff'), ('ALGIEBA', 10.33, 19.84, 2.0, '#ffd8a0'), ('ADHAFERA', 10.28, 23.42, 3.4, '#f4f0ff'),
           ('RASALAS', 9.88, 26.0, 3.9, '#ffd8a8'), ('EPSILON', 9.76, 23.77, 3.0, '#fff1dc'), ('ZOSMA', 11.24, 20.52, 2.6, '#f4f6ff'), ('CHERTAN', 11.24, 15.43, 3.3, '#f4f6ff'),
           ('DENEBOLA', 11.82, 14.57, 2.1, '#e8f0ff')]
    pos = {}
    for n, ra, de, m, c in leo:
        x = rx - (ra - ra0) * 15 * math.cos(math.radians(de0)) * s; y = ry - (de - de0) * s
        pos[n] = (x, y, m, c)
    for a, b in [('REGULUS', 'ETA'), ('ETA', 'ALGIEBA'), ('ALGIEBA', 'ADHAFERA'), ('ADHAFERA', 'RASALAS'), ('RASALAS', 'EPSILON'), ('ALGIEBA', 'ZOSMA'), ('ZOSMA', 'DENEBOLA'), ('DENEBOLA', 'CHERTAN'), ('CHERTAN', 'REGULUS'), ('ZOSMA', 'CHERTAN')]:
        o.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#9fb4e0" stroke-opacity=".13" stroke-width=".8"/>' % (f(pos[a][0]), f(pos[a][1]), f(pos[b][0]), f(pos[b][1])))
    for n, (x, y, m, c) in pos.items():
        r = max(.8, 2.6 - (m - 1.3) * .55)
        o.append(spike_star(x, y, r, c, r * 7, 1, .8))
    # the storm
    ms, glow = [], []
    k = 0
    while k < 230:
        a = rnd.uniform(0, 2 * math.pi)
        d0 = 18 + 470 * rnd.random() ** 1.25
        x0, y0 = rx + d0 * math.cos(a), ry + d0 * math.sin(a)
        L = (12 + .55 * d0) * rnd.uniform(.5, 1.35)
        x1, y1 = x0 + L * math.cos(a), y0 + L * math.sin(a)
        if not (-40 < x0 < W + 40 and 40 < y0 < hz - 10) or y1 > hz - 4:
            continue
        k += 1
        bright = rnd.random() < .16
        w = rnd.uniform(1.6, 2.8) if bright else rnd.uniform(.7, 1.7)
        col = rnd.choice(['#ffffff', '#eef4ff', '#dfe8ff', '#fff4dc', '#e4ffe8'])
        if bright:
            glow.append(streak(x0, y0, L * math.cos(a), L * math.sin(a), rnd.choice(['#a8f0c8', '#9fc8ff', '#ffd8a0']), w * 5, .55, u, head=False))
        ms.append(streak(x0, y0, L * math.cos(a), L * math.sin(a), col, w, rnd.uniform(.7, 1) if not bright else 1, u, head=bright or rnd.random() < .3))
    o.append('<g filter="url(#%sb8)" opacity=".7">%s</g>' % (u, ''.join(glow)))
    o.append(''.join(ms))
    # meteors coming straight at us: short stubs and points right at the radiant
    for _ in range(9):
        a = rnd.uniform(0, 2 * math.pi); d0 = rnd.uniform(4, 22)
        o.append(streak(rx + d0 * math.cos(a), ry + d0 * math.sin(a), 4 * math.cos(a), 4 * math.sin(a), '#ffffff', 1.2, .9, u))
    # one fireball, green-headed, with a long train
    a = math.radians(152); d0 = 120; L = 300
    x0, y0 = rx + d0 * math.cos(a), ry + d0 * math.sin(a)
    o.append('<g filter="url(#%sb8)" opacity=".6">%s</g>' % (u, streak(x0, y0, L * math.cos(a), L * math.sin(a), '#9affc0', 13, .5, u, head=False)))
    o.append(streak(x0, y0, L * math.cos(a), L * math.sin(a), '#f0fff4', 3, 1, u))
    o.append('<circle cx="%s" cy="%s" r="11" fill="#dfffe8" opacity=".6" filter="url(#%sb8)"/>' % (f(x0 + L * math.cos(a)), f(y0 + L * math.sin(a)), u))
    # the ridge, with a few bare trees and a barn
    rid = ridge(rnd, [(-10, 600), (140, 590), (300, 604), (430, 588), (600, 596)], .5, 6)
    o.append('<rect y="560" width="%d" height="60" fill="#3a4a80" opacity=".18" filter="url(#%sb30)"/>' % (W, u))
    o.append(land(rid, '#04050b'))
    o.append(''.join(bare(rnd, x, 598 - 4, h, '#04050b') for x, h in ((70, 90), (112, 64), (500, 84), (536, 56))))
    o.append('<path d="M386 594v-22l18 -14l18 14v22Z" fill="#04050b"/><rect x="398" y="580" width="6" height="7" fill="#f0c070" opacity=".75"/>')
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('17 NOV 1833 · RADIANT IN THE SICKLE OF LEO · PARENT 55P/TEMPEL–TUTTLE'),
           label((rx, ry), (22, 170), ['RADIANT', 'RA 10H 12M · DEC +22°']),
           label(pos['REGULUS'][:2], (560, 470), ['REGULUS', 'THE SICKLE’S HANDLE'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= THE PERSEIDS
def perseids(u):
    """A warm August night: the summer Milky Way rising out of the trees, and now and then a bright meteor running down from Perseus."""
    rnd = random.Random(812)
    hz = 588
    bg = night(u, [(0, '#04050f', 1), (.4, '#080b1e', 1), (.62, '#121630', 1), (.7, '#22203a', 1), (.73, '#2e2638', 1), (1, '#2e2638', 1)], 520, 812, 5, star_h=hz,
               tints=('#ffffff', '#dfe8ff', '#fff1dc', '#cfe0ff', '#ffe4c8'))
    defs = (blur(u, 'b1', 1) + blur(u, 'b2', 1.8) + blur(u, 'b8', 8, 200) + blur(u, 'b20', 20, 80) + blur(u, 'b45', 45, 120) +
            '<filter id="%sclouds" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".015" numOctaves="4" seed="31"/><feDisplacementMap in="SourceGraphic" scale="60"/><feGaussianBlur stdDeviation="8"/></filter>' % u)
    o = []
    # the Milky Way: from the trees at lower left, up across the sky to the upper right
    ax0, ay0, ax1, ay1 = 60, 640, 600, 60
    ang = math.degrees(math.atan2(ay1 - ay0, ax1 - ax0))
    P = lambda t, d: (ax0 + (ax1 - ax0) * t - d * math.sin(math.radians(ang)), ay0 + (ay1 - ay0) * t + d * math.cos(math.radians(ang)))
    glow = []
    for i in range(26):
        t = i / 25; x, y = P(t, rnd.gauss(0, 10))
        wid = 90 + 60 * (1 - t)
        glow.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(x), f(y), f(70), f(wid), rnd.choice(['#c8c4e8', '#f0e0c8', '#d8d0e0']), f(.07 + .12 * (1 - t)), f(ang), f(x), f(y)))
    o.append('<g filter="url(#%sb45)">%s</g>' % (u, ''.join(glow)))
    clouds = []
    for i in range(70):
        t = rnd.random() ** 1.3; x, y = P(t, rnd.gauss(0, 40))
        clouds.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(rnd.uniform(14, 44)), rnd.choice(['#f0e4d0', '#dcd8f0', '#fff0dc']), f(rnd.uniform(.08, .2) * (1.3 - t))))
    o.append('<g filter="url(#%sclouds)">%s</g>' % (u, ''.join(clouds)))
    dots = []
    for _ in range(2200):
        t = rnd.random() ** 1.15; x, y = P(t, rnd.gauss(0, 48))
        dots.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(rnd.uniform(.3, .9)), rnd.choice(['#ffffff', '#fff1dc', '#dfe8ff']), f(rnd.uniform(.2, .7))))
    o.append(''.join(dots))
    # star clouds and dust: noise laid along the band, bright mottling and a broken dark lane
    bx, by = P(.5, 0)
    tex = ('<filter id="%smwt" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".006 .02" numOctaves="5" seed="41"/>'
           '<feColorMatrix type="matrix" values="0 0 0 0 .96  0 0 0 0 .9  0 0 0 0 .84  2.6 0 0 0 -1.05"/></filter>'
           '<filter id="%smwd" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".008 .03" numOctaves="4" seed="47"/>'
           '<feColorMatrix type="matrix" values="0 0 0 0 .02  0 0 0 0 .02  0 0 0 0 .05  3 0 0 0 -1.25"/></filter>') % (u, u)
    tex += lg(u + 'mwg', [(0, '#000', 1), (.3, '#888', 1), (.5, '#fff', 1), (.7, '#888', 1), (1, '#000', 1)]) + lg(u + 'mwl', [(0, '#000', 1), (.42, '#000', 1), (.52, '#fff', 1), (.66, '#000', 1), (1, '#000', 1)])
    tex += '<mask id="%smwm" maskUnits="userSpaceOnUse" x="-520" y="-130" width="1040" height="260"><rect x="-520" y="-130" width="1040" height="260" fill="url(#%smwg)"/></mask>' % (u, u)
    tex += '<mask id="%smwk" maskUnits="userSpaceOnUse" x="-520" y="-130" width="1040" height="260"><rect x="-520" y="-130" width="1040" height="260" fill="url(#%smwl)"/></mask>' % (u, u)
    defs += tex
    o.append('<g transform="translate(%s %s) rotate(%s)"><rect x="-520" y="-130" width="1040" height="260" filter="url(#%smwt)" mask="url(#%smwm)" opacity=".5"/>'
             '<rect x="-520" y="-130" width="1040" height="260" filter="url(#%smwd)" mask="url(#%smwk)" opacity=".75"/></g>' % (f(bx), f(by), f(ang), u, u, u, u))
    # a few named lights: Vega, Deneb and Altair on the band
    for x, y, r, c in ((122, 258, 2.6, '#dfe8ff'), (338, 218, 2.1, '#f4f6ff'), (300, 470, 2.2, '#fff8ec')):
        o.append(spike_star(x, y, r, c, r * 8, 1, .9))
    # the meteors, all running away from Perseus, off the top left
    rx, ry = -90, -60
    shower = [(560, 300, 1.8, 1), (420, 210, 1.5, .95), (680, 150, 1.2, .9), (600, 130, 1.3, .9), (500, 100, 1.1, .8)]
    for d0, L, w, op in shower:
        a = math.radians(rnd.uniform(28, 62))
        x0, y0 = rx + d0 * math.cos(a), ry + d0 * math.sin(a)
        o.append('<g filter="url(#%sb2)" opacity=".55">%s</g>' % (u, streak(x0, y0, L * math.cos(a), L * math.sin(a), '#dfe8ff', w * 3, .45, u, head=False)))
        o.append(streak(x0, y0, L * math.cos(a), L * math.sin(a), '#ffffff', w, op, u))
    a = math.radians(44); d0, L = 300, 330
    x0, y0 = rx + d0 * math.cos(a), ry + d0 * math.sin(a)
    o.append('<g filter="url(#%sb8)" opacity=".55">%s</g>' % (u, streak(x0, y0, L * math.cos(a), L * math.sin(a), '#ffc890', 14, .5, u, head=False)))
    o.append(streak(x0, y0, L * math.cos(a), L * math.sin(a), '#fff4e0', 3.2, 1, u))
    hx, hy = x0 + L * math.cos(a), y0 + L * math.sin(a)
    o.append('<circle cx="%s" cy="%s" r="12" fill="#c8ffd8" opacity=".55" filter="url(#%sb8)"/><circle cx="%s" cy="%s" r="2.8" fill="#fff"/>' % (f(hx), f(hy), u, f(hx), f(hy)))
    # a summer treeline: broad crowns and a few firs
    o.append('<rect y="540" width="%d" height="70" fill="#5a4060" opacity=".22" filter="url(#%sb20)"/>' % (W, u))
    gnd = ridge(rnd, [(-10, 600), (200, 594), (400, 604), (600, 596)], .5, 5)
    trees = []
    for x in range(-20, W + 30, 26):
        h = rnd.uniform(40, 86)
        trees.append(leafy(rnd, x + rnd.uniform(-8, 8), hz + 12, h, '#05050c') if rnd.random() < .75 else firs(rnd, x, x + 1, 1, lambda _: hz + 10, h, h * 1.3, '#05050c'))
    o.append(''.join(trees))
    o.append(land(gnd, '#05050c'))
    # fireflies along the edge of the wood
    for _ in range(16):
        x, y = rnd.uniform(20, W - 20), rnd.uniform(hz + 8, hz + 80)
        o.append('<circle cx="%s" cy="%s" r="4" fill="#d8ff6a" opacity=".2" filter="url(#%sb1)"/><circle cx="%s" cy="%s" r=".9" fill="#f4ffb0" opacity=".85"/>' % (f(x), f(y), u, f(x), f(y)))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('12 AUG · RADIANT IN PERSEUS · PARENT 109P/SWIFT–TUTTLE'),
           label((hx, hy), (560, 520), ['FIREBALL', 'BRIGHTER THAN VENUS'], 'end'),
           label((122, 258), (22, 200), ['VEGA']), label((338, 218), (560, 170), ['DENEB'], 'end'), label((300, 470), (22, 440), ['ALTAIR'])]
    return bg, obj, svg(W, H, ''.join(ann))


PLATES = {
    'TOTAL-ECLIPSE': total_eclipse, 'RING-OF-FIRE': ring_of_fire, 'BLOOD-MOON': blood_moon, 'AURORA': aurora,
    'VENUS-TRANSIT': venus_transit, 'HALE-BOPP': hale_bopp, 'LEONIDS': leonids, 'PERSEIDS': perseids,
}

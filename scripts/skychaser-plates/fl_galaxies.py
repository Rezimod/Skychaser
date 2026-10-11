"""First Light: the galaxies, drawn in the manner of drawing.py.

Full-art plates: 582 × 832, the subject between y 90 and 600. Mass is painted
with soft gradient discs and blurred strokes, sparkle with a few thousand star
points written as zero-length round-capped subpaths (a dozen bytes a star).
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL, scalebar
from more import sky, top, spike_star, W, HF

H = HF


def fi(x):
    return str(int(round(x)))


def blur(u, name, sd, pad=30):
    return '<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feGaussianBlur stdDeviation="%s"/></filter>' % (u, name, pad, pad, 100 + 2 * pad, 100 + 2 * pad, f(sd))


def soft_defs(u, cols):
    """A soft radial disc per colour: id u + 's' + name, bright centre, no edge."""
    return ''.join('<radialGradient id="%ss%s"><stop offset="0" stop-color="%s"/><stop offset=".3" stop-color="%s" stop-opacity=".55"/>'
                   '<stop offset=".65" stop-color="%s" stop-opacity=".16"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>' % (u, n, c, c, c, c)
                   for n, c in cols.items())


def rgrad(u, name, stops, cx='.5', cy='.5', r='.5'):
    return '<radialGradient id="%s%s" cx="%s" cy="%s" r="%s">%s</radialGradient>' % (u, name, cx, cy, r, ''.join(
        '<stop offset="%s" stop-color="%s" stop-opacity="%s"/>' % (f(o), c, f(a)) for o, c, a in stops))


class Dots:
    """Star points bucketed by colour, size and opacity: one path per bucket."""
    SW = (.5, .8, 1.2, 1.7, 2.4, 3.4, 4.6)

    def __init__(s):
        s.b = {}

    def add(s, x, y, d, col, op):
        if not (-4 < x < W + 4 and -4 < y < H + 4) or op <= .04:
            return
        w = min(s.SW, key=lambda v: abs(v - d))
        o = max(.2, min(1, round(op * 5) / 5))
        s.b.setdefault((col, w, o), []).append('M%s %sh0' % (f(x), f(y)))

    def svg(s):
        return '<g stroke-linecap="round">%s</g>' % ''.join('<path d="%s" stroke="%s" stroke-width="%s" stroke-opacity="%s"/>' % (''.join(v), c, f(w), '%.2g' % o)
                                                            for (c, w, o), v in sorted(s.b.items()))


class Soft:
    """Soft discs grouped by gradient."""

    def __init__(s, u):
        s.u, s.b = u, {}

    def add(s, x, y, r, name, op):
        if op <= .02 or r < .5:
            return
        s.b.setdefault(name, []).append('<circle cx="%s" cy="%s" r="%s" opacity="%s"/>' % (fi(x), fi(y), fi(r) if r > 6 else f(r), f(min(1, op))))

    def svg(s):
        return ''.join('<g fill="url(#%ss%s)">%s</g>' % (s.u, n, ''.join(v)) for n, v in sorted(s.b.items()))


class Disk:
    """A galaxy disc: plane coords (x, y) → screen, inclined by q, rotated by rot degrees."""

    def __init__(s, cx, cy, rot, q):
        s.cx, s.cy, s.rot, s.q = cx, cy, rot, q
        s.c, s.s = math.cos(math.radians(rot)), math.sin(math.radians(rot))

    def p(s, x, y):
        y *= s.q
        return s.cx + x * s.c - y * s.s, s.cy + x * s.s + y * s.c

    def pol(s, r, th):
        return s.p(r * math.cos(th), r * math.sin(th))

    def g(s, inner, extra=''):
        return '<g transform="translate(%s %s) rotate(%s) scale(1 %s)"%s>%s</g>' % (f(s.cx), f(s.cy), f(s.rot), '%.3f' % s.q, extra, inner)


def wobble(rnd, k=4, amp=1.0):
    """A smooth random function of t in [0, 1]."""
    ph = [(rnd.uniform(1, 9), rnd.uniform(0, 6.3), rnd.uniform(.3, 1)) for _ in range(k)]
    tot = sum(a for _, _, a in ph)
    return lambda t: amp * sum(a * math.sin(fr * t * 6.283 + p) for fr, p, a in ph) / tot


def poly(pts):
    return 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in pts)


def smooth(pts, g=None):
    """Quadratic-smoothed path through points (whole pixels: it is always blurred or broad)."""
    g = g or fi
    if len(pts) < 3:
        return 'M' + 'L'.join('%s %s' % (g(x), g(y)) for x, y in pts)
    d = 'M%s %s' % (g(pts[0][0]), g(pts[0][1]))
    for i in range(1, len(pts) - 1):
        mx, my = (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2
        d += 'Q%s %s %s %s' % (g(pts[i][0]), g(pts[i][1]), g(mx), g(my))
    return d + 'L%s %s' % (g(pts[-1][0]), g(pts[-1][1]))


def bg_galaxies(rnd, n, box=(0, 0, W, H), avoid=None):
    """Tiny distant galaxies for the sky layer."""
    out = []
    for _ in range(n):
        for _ in range(20):
            x, y = rnd.uniform(box[0], box[2]), rnd.uniform(box[1], box[3])
            if not avoid or math.hypot(x - avoid[0], y - avoid[1]) > avoid[2]:
                break
        L = rnd.uniform(2, 7); a = rnd.uniform(0, 180); e = rnd.uniform(.25, .9)
        c = rnd.choice(['#ffe2b8', '#f4d6a8', '#dfe6ff', '#ffd0a0', '#e8dccc'])
        out.append('<g transform="translate(%s %s) rotate(%s)"><ellipse rx="%s" ry="%s" fill="%s" opacity=".18"/><ellipse rx="%s" ry="%s" fill="%s" opacity=".45"/>'
                   '<circle r="%s" fill="#fff4e0" opacity=".8"/></g>' % (f(x), f(y), f(a), f(L), f(L * e), c, f(L * .5), f(L * e * .5), c, f(max(.4, L * .12))))
    return ''.join(out)


def spiral(u, rnd, D, arms, R, *, core=26, arm_w=.11, n_star=2600, n_hii=90, dust=1.0, clump=1.0, floc=0.0,
           arm_cols=('#cfdcff', '#b8ccff', '#e6ecff', '#ffffff'), young='#a8c0ff', hii=('#ff8fb4', '#ffa8c8', '#ff7aa0'),
           bulge=('#fff4dc', '#ffe0a8', '#e8b878'), disk_col='#8a9ad0', ext=1.0, lane_off=.1, spurs=26, taper=.72, seed=3, inner=('#f0d8b0', 2.6, .5), disp=18, lop=(0, 0), patch=0.0):
    """A disc galaxy. arms: list of (theta0, r_in, r_out, pitch_deg, strength).
    Returns (markup with its own <defs>, arm centrelines as [(r, theta, t, fade)])."""
    defs = blur(u, 'gb3', 3) + blur(u, 'gb1', 1.2) + (
        '<filter id="%sgmass" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="%d"/>'
        '<feDisplacementMap in="SourceGraphic" scale="%d"/><feGaussianBlur stdDeviation="7"/></filter>'
        '<filter id="%sgclump" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="%d"/>'
        '<feDisplacementMap in="SourceGraphic" scale="14"/><feGaussianBlur stdDeviation="1.6"/></filter>') % (u, seed, disp, u, seed + 1)
    defs += soft_defs(u, {'arm': arm_cols[0], 'yng': young, 'hii': hii[0], 'blg': bulge[1], 'dif': disk_col, 'wht': '#f4f7ff'})
    defs += rgrad(u, 'gdisk', [(0, disk_col, .55), (.3, disk_col, .26), (.65, disk_col, .08), (1, disk_col, 0)])
    defs += rgrad(u, 'gblg', [(0, bulge[0], 1), (.1, bulge[0], .92), (.3, bulge[1], .55), (.62, bulge[2], .16), (1, bulge[2], 0)])
    defs += rgrad(u, 'ginr', [(0, inner[0], inner[2]), (.5, inner[0], inner[2] * .5), (1, inner[0], 0)])
    defs += rgrad(u, 'gcore', [(0, '#ffffff', 1), (.25, bulge[0], .85), (1, bulge[0], 0)])
    mass, lanes, fine, sparkle, knots, soft, beads = [], [], [], Dots(), Soft(u), Soft(u), Soft(u)
    pts_arm = []
    sc = min(1, R / 200) ** .6
    for k, (th0, r_in, r_out, pitch, st) in enumerate(arms):
        tp = math.tan(math.radians(pitch))
        wob, wid, br = wobble(rnd, 5, 1), wobble(rnd, 4, 1), wobble(rnd, 6, 1)
        pw = wobble(rnd, 6, 1.6)
        pw = (lambda g: lambda t: g(t * 2.5))(pw)
        ln = min(1.2, math.log(r_out / r_in) / math.log(8))
        N = max(24, int(45 * ln) * 2)
        cl = []
        for i in range(N + 1):
            t = i / N
            r = r_in * (r_out / r_in) ** t
            th = th0 + math.log(r / r_in) / tp + floc * .12 * wob(t * 2)
            fade = min(1, t * 5 + .15) * (1 - max(0, (t - taper) / (1 - taper)) ** 1.3) * (1 + .25 * br(t)) * max(0, 1 + patch * pw(t))
            cl.append((r * (1 + lop[0] * math.cos(th - lop[1]) * t), th, t, max(0, fade)))
        pts_arm.append(cl)
        for i in range(0, N, 2):
            r0, a0, t0, f0 = cl[i]; r1, a1, _, _ = cl[i + 2]
            w = r0 * arm_w * 2.4 * (1 + .35 * wid(t0))
            mass.append('<path d="M%s %sL%s %s" stroke-width="%s" stroke-opacity="%s"/>' % (
                fi(r0 * math.cos(a0)), fi(r0 * math.sin(a0)), fi(r1 * math.cos(a1)), fi(r1 * math.sin(a1)), fi(w), f(min(1, .3 * st * f0 * ext))))
        for i in range(int(170 * clump * st * ln * sc)):
            r, a, t, fd = cl[rnd.randrange(N + 1)]
            s = r * arm_w
            x, y = r * math.cos(a) + rnd.gauss(0, s), r * math.sin(a) + rnd.gauss(0, s)
            soft.add(x, y, rnd.uniform(.3, 1) * s * 1.2, rnd.choice(['arm', 'yng', 'arm']), rnd.uniform(.12, .42) * fd * st)
        if dust and st > .5:
            seg = []
            for i in range(N + 1):
                r, a, t, fd = cl[i]
                a2 = a - lane_off - arm_w * .5
                seg.append((r * .97 * math.cos(a2), r * .97 * math.sin(a2), t, fd))
            i = 1
            while i < N - 3:
                L = rnd.randint(5, 18)
                chunk = seg[i:i + L + 1]
                if len(chunk) > 2:
                    tm = chunk[len(chunk) // 2][2]
                    wdt = (2 + 7 * (1 - tm) ** 1.5) * dust * rnd.uniform(.6, 1.3)
                    op = rnd.uniform(.55, .9) * min(1, chunk[0][3] + .4)
                    for strand in range(2):
                        off = (strand - .5) * wdt * .7 + rnd.uniform(-1, 1)
                        d = smooth([(x * (1 + off / 200) + rnd.uniform(-2, 2), y * (1 + off / 200) + rnd.uniform(-2, 2)) for x, y, _, _ in chunk])
                        lanes.append('<path d="%s" stroke-width="%s" stroke-opacity="%s"/>' % (d, f(wdt * rnd.uniform(.5, .9)), f(op * rnd.uniform(.6, 1))))
                        if rnd.random() < .35:
                            fine.append('<path d="%s" stroke-width="%s" stroke-opacity="%s"/>' % (d, f(wdt * .22), f(op * .45)))
                i += L + rnd.randint(1, 4)
            for _ in range(int(spurs * dust * ln * sc)):
                r, a, t, fd = cl[rnd.randrange(N // 10, N - N // 15)]
                x0, y0 = r * .96 * math.cos(a - lane_off), r * .96 * math.sin(a - lane_off)
                ro = r * rnd.uniform(1.06, 1.2); ao = a + rnd.uniform(.05, .2)
                x1, y1 = ro * math.cos(ao), ro * math.sin(ao)
                lanes.append('<path d="M%s %sQ%s %s %s %s" stroke-width="%s" stroke-opacity="%s"/>' % (
                    fi(x0), fi(y0), fi((x0 + x1) / 2 + rnd.uniform(-4, 4)), fi((y0 + y1) / 2 + rnd.uniform(-4, 4)), fi(x1), fi(y1), f(rnd.uniform(.8, 2.2) * dust), f(rnd.uniform(.25, .5) * fd)))
        for _ in range(int(n_star * st * ln / len(arms))):
            r, a, t, fd = cl[rnd.randrange(N + 1)]
            s = r * arm_w * .85
            x, y = r * math.cos(a) + rnd.gauss(0, s), r * math.sin(a) + rnd.gauss(0, s)
            X, Y = D.p(x, y)
            m = rnd.random() ** 4
            sparkle.add(X, Y, .45 + 1.5 * m, rnd.choice(arm_cols), (.3 + .65 * rnd.random()) * (.35 + .65 * min(1, fd)))
        for _ in range(int(110 * clump * st * ln * sc)):
            r, a, t, fd = cl[rnd.randrange(N + 1)]
            s = r * arm_w * .5
            beads.add(r * math.cos(a) + rnd.gauss(0, s), r * math.sin(a) + rnd.gauss(0, s), rnd.uniform(1.5, 4.5), rnd.choice(['wht', 'arm', 'yng']), rnd.uniform(.3, .75) * min(1, fd))
        # HII complexes: a knot and its satellites along the outer edge of the arm
        for _ in range(int(n_hii * st * ln / len(arms))):
            r, a, t, fd = cl[rnd.randrange(int(N * .08), N + 1)]
            if rnd.random() > fd:
                continue
            a2 = a + rnd.gauss(.03, .04)
            rr_ = r * rnd.gauss(1.02, .03)
            X, Y = D.pol(rr_, a2)
            sz = rnd.random() ** 2.2
            knots.add(X, Y, 2.5 + 8 * sz, 'hii', .25 + .35 * rnd.random())
            for j in range(1 + int(sz * 5)):
                dx, dy = (rnd.gauss(0, 1.5 + 4 * sz), rnd.gauss(0, 1.5 + 4 * sz)) if j else (0, 0)
                sparkle.add(X + dx, Y + dy, .7 + 1.8 * sz * rnd.random(), rnd.choice(hii), .75 + .25 * rnd.random())
            if sz > .25:
                sparkle.add(X, Y, .6 + .9 * sz, '#fff0f6', 1)
    # the disc between the arms: faint, smooth, with a scatter of old stars
    for _ in range(int(70 * min(1, R / 200))):
        r = R * rnd.random() ** .7; a = rnd.uniform(0, 6.283)
        soft.add(r * math.cos(a), r * math.sin(a), rnd.uniform(15, 40), 'dif', rnd.uniform(.08, .2))
    for _ in range(int(n_star * .3)):
        r = R * 1.05 * rnd.random() ** .75; a = rnd.uniform(0, 6.283)
        X, Y = D.pol(r, a)
        sparkle.add(X, Y, .5 + .8 * rnd.random() ** 3, rnd.choice(('#dfe6ff', '#fff4e4', '#ffffff', '#ffe8cc')), .2 + .4 * rnd.random())
    for _ in range(int(260 * min(1, R / 200))):
        r = abs(rnd.gauss(0, core * 1.5)); a = rnd.uniform(0, 6.283)
        X, Y = D.pol(r, a)
        sparkle.add(X, Y, .5 + .4 * rnd.random() ** 2, rnd.choice(('#fff0d0', '#ffe4b0', '#fff8ec')), .25 + .35 * rnd.random())
    out = [D.g('<ellipse rx="%s" ry="%s" fill="url(#%sgdisk)"/>' % (fi(R * 1.2), fi(R * 1.2), u)),
           D.g('<g filter="url(#%sgmass)" fill="none" stroke="%s" stroke-linecap="round">%s</g>' % (u, arm_cols[0], ''.join(mass))),
           D.g('<g filter="url(#%sgclump)">%s</g>' % (u, soft.svg())),
           D.g('<circle r="%s" fill="url(#%sginr)"/>' % (fi(core * inner[1]), u)),
           D.g('<circle r="%s" fill="url(#%sgblg)"/>' % (fi(core * 3.4), u)),
           D.g('<g filter="url(#%sgb3)" fill="none" stroke="#21100a" stroke-linecap="round">%s</g><g filter="url(#%sgb1)" fill="none" stroke="#1a0c06" stroke-linecap="round">%s</g>' % (
               u, ''.join(lanes), u, ''.join(fine))),
           D.g(beads.svg()), sparkle.svg(), knots.svg(),
           D.g('<circle r="%s" fill="url(#%sgcore)"/>' % (f(core * .95), u))]
    return '<defs>%s</defs>' % defs + ''.join(out), pts_arm


# ================================================================= M51, THE WHIRLPOOL
def m51(u):
    rnd = random.Random(5194)
    cx, cy, R = 250, 392, 200
    arms = [(0, 30, 215, 21, 1.0), (math.pi, 30, 200, 21, .95)]
    # turn the disc so the first arm ends pointing up and to the right, toward the companion
    th_end = math.log(215 / 30) / math.tan(math.radians(21))
    D = Disk(cx, cy, -52 - math.degrees(th_end), .92)
    bg = sky(u, H, ('#121a3a', '#070b1f', '#02030a'), 260, 5194, 4, extra=bg_galaxies(random.Random(51), 14, avoid=(cx, cy, 250)))
    body, cl = spiral(u, rnd, D, arms, R, core=24, arm_w=.095, n_star=2100, n_hii=90, dust=1.2, taper=.8, seed=51, inner=('#f2dcb4', 4.6, .38))
    # NGC 5195 and the tidal bridge: the arm runs on, thinning, and bends into it
    ex, ey = D.pol(215, th_end)
    nx, ny = 438, 178
    defs = rgrad(u, 'c5', [(0, '#fff6e0', 1), (.12, '#ffe6b8', .85), (.35, '#e8c090', .45), (.7, '#b89070', .12), (1, '#a08070', 0)])
    defs += rgrad(u, 'c5h', [(0, '#d8c8b0', .35), (.5, '#b8a898', .12), (1, '#b8a898', 0)])
    defs += soft_defs(u, {'brg': '#c8d4f8'})
    defs += '<filter id="%scf" x="-40%%" y="-40%%" width="180%%" height="180%%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="16"/><feGaussianBlur stdDeviation="2.4"/></filter>' % u
    defs += blur(u, 'b8', 8)
    br, dots = Soft(u), Dots()
    bx, by = ex + 40, ey + 30
    for i in range(160):
        t = rnd.random()
        x = (1 - t) ** 2 * ex + 2 * (1 - t) * t * bx + t * t * nx + rnd.gauss(0, 8 + 6 * math.sin(t * 3.14))
        y = (1 - t) ** 2 * ey + 2 * (1 - t) * t * by + t * t * ny + rnd.gauss(0, 8 + 6 * math.sin(t * 3.14))
        br.add(x, y, rnd.uniform(6, 16), 'brg', rnd.uniform(.1, .3) * (1 - .5 * t))
        dots.add(x, y, .5 + 1.2 * rnd.random() ** 3, rnd.choice(('#dfe6ff', '#ffffff', '#cfdcff')), .4 + .5 * rnd.random())
        if rnd.random() < .08:
            dots.add(x, y, 1.6, '#ff8cbc', .9)
    comp = ['<ellipse cx="%d" cy="%d" rx="120" ry="95" fill="url(#%sc5h)" transform="rotate(-30 %d %d)"/>' % (nx, ny - 10, u, nx, ny - 10),
            '<ellipse cx="%d" cy="%d" rx="64" ry="54" fill="url(#%sc5)" transform="rotate(-20 %d %d)"/>' % (nx, ny, u, nx, ny)]
    for _ in range(14):
        a = rnd.uniform(-2.2, .4); r0 = rnd.uniform(4, 30)
        x0, y0 = nx + r0 * math.cos(a), ny + r0 * math.sin(a)
        comp.append('<path d="M%s %sq%s %s %s %s" stroke-width="%s" stroke-opacity="%s"/>' % (
            fi(x0), fi(y0), fi(rnd.uniform(-10, 10)), fi(rnd.uniform(4, 14)), fi(rnd.uniform(-30, 10)), fi(rnd.uniform(10, 30)), f(rnd.uniform(1.4, 4)), f(rnd.uniform(.3, .6))))
    for _ in range(140):
        r = abs(rnd.gauss(0, 22)); a = rnd.uniform(0, 6.283)
        dots.add(nx + r * math.cos(a) * 1.1, ny + r * math.sin(a), .5 + .9 * rnd.random() ** 2, rnd.choice(('#ffe8c0', '#fff4dc', '#ffd8a0')), .35 + .5 * rnd.random())
    comp_s = ''.join(comp[:2]) + '<g filter="url(#%scf)" fill="none" stroke="#2a1508" stroke-linecap="round">%s</g>' % (u, ''.join(comp[2:])) + \
        '<circle cx="%d" cy="%d" r="7" fill="#fffaf0" opacity=".9" filter="url(#%sb8)"/><circle cx="%d" cy="%d" r="1.6" fill="#fff"/>' % (nx, ny, u, nx, ny)
    o = ['<defs>%s</defs>' % defs, '<g filter="url(#%sb8)">%s</g>' % (u, br.svg()), body, comp_s, dots.svg()]
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), '')
    ann = [top('RA 13H 29M 53S · DEC +47° 12′ · CANES VENATICI')]
    return bg, obj, svg(W, H, ''.join(ann))


def giant_hii(rnd, D, cl, ts, sp, dots, big=1.0, cols=('#ff8fb4', '#ffb0cc', '#ff7aa0', '#ffe4ee')):
    """Giant star-forming complexes at fractions ts along an arm centreline: a pink glow and a knot of stars."""
    N = len(cl) - 1
    for t in ts:
        r, a, _, _ = cl[int(t * N)]
        X, Y = D.pol(r * 1.02, a + .03)
        sp.add(X, Y, 16 * big, 'hii', .6)
        sp.add(X, Y, 7 * big, 'hii', .85)
        for _ in range(int(26 * big)):
            dots.add(X + rnd.gauss(0, 3.5 * big), Y + rnd.gauss(0, 3.5 * big), .6 + 1.6 * rnd.random() ** 2, rnd.choice(cols), .7 + .3 * rnd.random())
        dots.add(X, Y, 2.4 * big, '#fff4f8', 1)


# ================================================================= M101, THE PINWHEEL
def m101(u):
    rnd = random.Random(101)
    cx, cy, R = 288, 326, 240
    D = Disk(cx, cy, 8, .96)
    bg = sky(u, H, ('#111a38', '#070b1e', '#02030a'), 240, 1011, 4, extra=bg_galaxies(random.Random(101), 16, avoid=(cx, cy, 270)))
    arms = [(0, 16, 260, 29, 1.0), (math.pi, 16, 245, 29, .9), (1.5, 55, 280, 33, .85), (4.2, 50, 265, 32, .82), (2.6, 100, 285, 38, .72),
            (5.5, 110, 265, 36, .66), (.7, 140, 290, 42, .55), (3.5, 36, 160, 25, .6)]
    body, cls = spiral(u, rnd, D, arms, R, core=12, arm_w=.055, n_star=1700, n_hii=230, dust=.5, clump=.65, taper=.74, seed=101, ext=.6, patch=.55,
                       arm_cols=('#c4d4ff', '#a9c0ff', '#e0e8ff', '#ffffff'), young='#8fb0ff', disk_col='#7488c8',
                       bulge=('#fff6e0', '#ffe6b8', '#e0c090'), inner=('#e8dcc8', 5, .22), lop=(.2, .4), spurs=10, disp=26)
    # a mottled, faint outer disc between the arms
    defs = rgrad(u, 'dm', [(0, '#fff', .9), (.6, '#fff', .5), (1, '#fff', 0)])
    defs += '<mask id="%sdmk" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d">%s</mask>' % (u, W, H, D.g('<circle r="%d" fill="url(#%sdm)"/>' % (R + 40, u)))
    body = ('<defs>%s</defs>' % defs + noise_layer(u, 'nd', '.018', 101, (.6, .7, 1), .5, 3, .45, 4, (0, 0, W, H), '', u + 'dmk') + body)
    sp, dots = Soft(u), Dots()
    giant_hii(rnd, D, cls[0], (.8, .9), sp, dots, 1.1)
    giant_hii(rnd, D, cls[2], (.75,), sp, dots, .9)
    giant_hii(rnd, D, cls[1], (.86,), sp, dots, 1.0)
    giant_hii(rnd, D, cls[3], (.9,), sp, dots, .8)
    o = [body, sp.svg(), dots.svg()]
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), '')
    return bg, obj, svg(W, H, top('RA 14H 03M 13S · DEC +54° 20′ · URSA MAJOR'))


# ================================================================= M33, THE TRIANGULUM
def m33(u):
    rnd = random.Random(33)
    cx, cy, R = 291, 350, 250
    D = Disk(cx, cy, -32, .66)
    bg = sky(u, H, ('#121a36', '#070b1d', '#02030a'), 280, 3333, 5, extra=bg_galaxies(random.Random(33), 12, avoid=(cx, cy, 270)))
    arms = [(0.2, 20, 240, 36, .8), (0.2 + math.pi, 20, 230, 36, .75)]
    for i in range(22):
        r0 = 30 + 140 * ((i * .618) % 1)
        arms.append((i * 2.4 + rnd.uniform(-.3, .3), r0, min(260, r0 * rnd.uniform(1.5, 2.1)), rnd.uniform(32, 48), rnd.uniform(.4, .7)))
    body, cls = spiral(u, rnd, D, arms, R, core=14, arm_w=.085, n_star=3500, n_hii=480, dust=.35, clump=.75, taper=.6, seed=33, ext=.42, patch=.8, floc=.35,
                       arm_cols=('#b8ccff', '#9fb8ff', '#d8e4ff', '#f4f8ff'), young='#86a8ff', disk_col='#6f88cc',
                       bulge=('#fff2dc', '#f4dcb4', '#c8b098'), inner=('#c8cce0', 6, .3), spurs=4, disp=30)
    defs = rgrad(u, 'm33d', [(0, '#9fb4f0', .42), (.4, '#8098dc', .22), (.75, '#6078c0', .07), (1, '#6078c0', 0)])
    body = '<defs>%s</defs>' % defs + D.g('<circle r="%d" fill="url(#%sm33d)"/>' % (R + 20, u)) + body
    # NGC 604, the giant nursery in the outer north-east arm
    sp, dots = Soft(u), Dots()
    giant_hii(rnd, D, cls[0], (.78,), sp, dots, 1.7)
    giant_hii(rnd, D, cls[1], (.62,), sp, dots, .8)
    giant_hii(rnd, D, cls[0], (.5,), sp, dots, .7)
    o = [body, sp.svg(), dots.svg()]
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), '')
    return bg, obj, svg(W, H, top('RA 01H 33M 51S · DEC +30° 39′ · TRIANGULUM'))


def arc_pts(rx, ry, a0, a1, n=48):
    return [(rx * math.cos(a0 + (a1 - a0) * i / (n - 1)), ry * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]


# ================================================================= M104, THE SOMBRERO
def m104(u):
    rnd = random.Random(104)
    cx, cy, rot = 291, 346, -7
    bg = sky(u, H, ('#18182c', '#0a0a18', '#030308'), 260, 1044, 5, extra=bg_galaxies(random.Random(104), 14, avoid=(cx, cy, 300)))
    defs = blur(u, 'b1', 1) + blur(u, 'b2', 2.2) + blur(u, 'b5', 5) + blur(u, 'b12', 12) + (
        '<filter id="%swav" x="-10%%" y="-60%%" width="120%%" height="220%%"><feTurbulence type="fractalNoise" baseFrequency=".04 .2" numOctaves="3" seed="4"/>'
        '<feDisplacementMap in="SourceGraphic" scale="7"/><feGaussianBlur stdDeviation="1.1"/></filter>') % u
    defs += rgrad(u, 'halo', [(0, '#ffe6c0', .34), (.35, '#e8c898', .14), (.7, '#a89078', .04), (1, '#a89078', 0)])
    defs += rgrad(u, 'blg', [(0, '#fffcf4', 1), (.12, '#fff4dc', .96), (.32, '#ffe4b4', .78), (.55, '#f0c890', .45), (.78, '#b88c5c', .16), (1, '#806040', 0)])
    defs += rgrad(u, 'lens', [(0, '#fff6e0', .9), (.6, '#fbe6c0', .55), (.9, '#f0d8a8', .35), (1, '#f0d8a8', 0)])
    defs += rgrad(u, 'core', [(0, '#ffffff', 1), (.4, '#fff6e2', .7), (1, '#fff0d0', 0)])
    defs += rgrad(u, 'dsk', [(0, '#fff2d8', .85), (.55, '#f2dcb4', .55), (.85, '#e6cfa6', .45), (.95, '#d8c098', .3), (1, '#d8c098', 0)])
    g = []
    g.append('<ellipse rx="340" ry="260" fill="url(#%shalo)"/>' % u)
    # the disc, edge-on: a thin ring of light, the far half behind the bulge
    near_arc = smooth(arc_pts(250, 27, -.5, math.pi + .5, 60), f)
    g.append('<path d="%s" fill="none" stroke="#f4e0bc" stroke-width="14" stroke-opacity=".5" filter="url(#%sb5)"/>' % (near_arc, u))
    g.append('<path d="%s" fill="none" stroke="#fff0d4" stroke-width="3.4" stroke-opacity=".5" filter="url(#%sb2)"/>' % (smooth(arc_pts(252, 28, -.45, math.pi + .45, 60), f), u))
    for a0 in (math.pi + .4, 2 * math.pi - 1.0):
        g.append('<path d="%s" fill="none" stroke="#f0dcb8" stroke-width="3" stroke-opacity=".35" filter="url(#%sb2)"/>' % (smooth(arc_pts(250, 27, a0, a0 + .6, 12), f), u))
    g.append('<ellipse rx="236" ry="20" fill="url(#%slens)" opacity=".7" filter="url(#%sb5)"/>' % (u, u))
    far = arc_pts(238, 24, math.pi + .1, 2 * math.pi - .1)
    g.append('<path d="%s" fill="none" stroke="#2a160a" stroke-width="5" stroke-opacity=".45" filter="url(#%sb2)"/>' % (smooth(far, f), u))
    g.append('<ellipse rx="225" ry="172" fill="url(#%sblg)"/>' % u)
    g.append('<ellipse rx="130" ry="100" fill="url(#%sblg)" opacity=".75"/>' % u)
    dots = Dots()
    for _ in range(900):
        r = abs(rnd.gauss(0, 64)); a = rnd.uniform(0, 6.283)
        x, y = r * math.cos(a) * 1.3, r * math.sin(a)
        dots.add(x, y, .5 + .5 * rnd.random() ** 2, rnd.choice(('#fff4dc', '#ffe8c0', '#fffaf0')), .2 + .3 * rnd.random())
    g.append(dots.svg())
    # the near half: a crescent of dust across the bulge, thick in front, thinning to the tips
    outer = arc_pts(247, 33, -.02, math.pi + .02, 60)
    inner_ = arc_pts(233, 18, math.pi + .02, -.02, 60)
    lane = ('<path d="%sL%sZ" fill="#1a0c05" fill-opacity=".93"/>' % (smooth(outer, f), smooth(inner_, f)[1:]) +
            '<path d="%s" fill="none" stroke="#0e0602" stroke-width="4" stroke-opacity=".8"/>' % smooth(arc_pts(240, 25, .12, math.pi - .12), f) +
            '<path d="%s" fill="none" stroke="#4a2a14" stroke-width="1.6" stroke-opacity=".6"/>' % smooth(arc_pts(230, 18, .3, math.pi - .3), f))
    g.append('<g filter="url(#%swav)">%s</g>' % (u, lane))
    # light through the gaps: the outer rim below the lane, and a faint inner rim above it
    g.append('<path d="%s" fill="none" stroke="#fff4dc" stroke-width="2.4" stroke-opacity=".5" filter="url(#%sb1)"/>' % (smooth(arc_pts(252, 33, .1, math.pi - .1), f), u))
    g.append('<path d="%s" fill="none" stroke="#ffe6c0" stroke-width="1.4" stroke-opacity=".35" filter="url(#%sb1)"/>' % (smooth(arc_pts(225, 15.5, .2, math.pi - .2), f), u))
    g.append('<ellipse rx="40" ry="30" fill="url(#%score)"/><circle r="2.2" fill="#fff"/>' % u)
    tips = Dots()
    for side in (-1, 1):
        for _ in range(70):
            x = side * rnd.uniform(215, 262); y = rnd.gauss(0, 4)
            tips.add(x, y, .5 + .6 * rnd.random() ** 2, rnd.choice(('#fff0d8', '#ffe0b8', '#f4f0ff')), .25 + .4 * rnd.random())
    g.append(tips.svg())
    tf = 'translate(%d %d) rotate(%d)' % (cx, cy, rot)
    lane_d = '%sL%sZ' % (smooth(outer, f), smooth(inner_, f)[1:])
    defs += '<mask id="%slm" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><g transform="%s"><path d="%s" fill="#fff" filter="url(#%sb1)"/></g></mask>' % (u, W, H, tf, lane_d, u)
    obj = '<g transform="%s">%s</g>' % (tf, ''.join(g))
    obj += noise_layer(u, 'ln', '.02 .12', 9, (.62, .42, .26), .56, 5, .55, 4, (-260, -10, 520, 50), tf, u + 'lm', .4)
    # globular clusters swarm in the halo
    gc = Dots()
    for _ in range(900):
        r = 60 + 360 * rnd.random() ** 1.6; a = rnd.uniform(0, 6.283)
        x, y = cx + r * math.cos(a), cy + r * math.sin(a) * .82
        near_ = r < 200
        gc.add(x, y, .6 + 1.1 * rnd.random() ** 2.5, rnd.choice(('#ffe4b0', '#fff0d0', '#ffd89a')), (.35 + .5 * rnd.random()) * (1 if near_ else .8))
    obj = svg(W, H, gc.svg() + obj + grain(u + 'o', W, H, .1), defs)
    return bg, obj, svg(W, H, top('RA 12H 39M 59S · DEC −11° 37′ · VIRGO'))


# ================================================================= M82, THE CIGAR
def m82(u):
    rnd = random.Random(82)
    cx, cy, rot = 291, 350, -30
    bg = sky(u, H, ('#121628', '#070916', '#020308'), 270, 8282, 5, extra=bg_galaxies(random.Random(82), 12, avoid=(cx, cy, 280)))
    defs = blur(u, 'b1', 1) + blur(u, 'b2', 2) + blur(u, 'b4', 4) + blur(u, 'b10', 10) + blur(u, 'b24', 24, 60) + (
        '<filter id="%sfil" x="-40%%" y="-40%%" width="180%%" height="180%%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="3" seed="82"/>'
        '<feDisplacementMap in="SourceGraphic" scale="26"/><feGaussianBlur stdDeviation="1.4"/></filter>'
        '<filter id="%sdst" x="-20%%" y="-60%%" width="140%%" height="220%%"><feTurbulence type="fractalNoise" baseFrequency=".05 .09" numOctaves="3" seed="8"/>'
        '<feDisplacementMap in="SourceGraphic" scale="18"/><feGaussianBlur stdDeviation="2"/></filter>') % (u, u)
    defs += rgrad(u, 'disc', [(0, '#fff8ec', 1), (.2, '#f4ecdc', .85), (.5, '#d8d4d0', .5), (.8, '#a8a8b8', .16), (1, '#8890a8', 0)])
    defs += rgrad(u, 'halo', [(0, '#c8c0c0', .3), (.5, '#9890a0', .1), (1, '#9890a0', 0)])
    defs += rgrad(u, 'wind', [(0, '#ff5a4a', .55), (.4, '#e8384a', .25), (.8, '#a8203a', .06), (1, '#a8203a', 0)])
    defs += rgrad(u, 'burst', [(0, '#ffffff', 1), (.3, '#f0f4ff', .7), (1, '#dfe8ff', 0)])
    defs += soft_defs(u, {'lt': '#f4efe6', 'bl': '#dfe6ff', 'rd': '#ff5a50'})
    g = []
    # the galactic wind: red cones of hydrogen blown out of the starburst, both ways
    g.append('<ellipse cy="-110" rx="95" ry="150" fill="url(#%swind)" filter="url(#%sb24)"/><ellipse cy="110" rx="95" ry="150" fill="url(#%swind)" filter="url(#%sb24)"/>' % (u, u, u, u))
    rd = Soft(u)
    for side in (-1, 1):
        for _ in range(60):
            d = 180 * rnd.random() ** 1.5
            rd.add(rnd.gauss(0, 12 + d * .35), side * (8 + d), rnd.uniform(6, 22) * (1 - d / 300), 'rd', rnd.uniform(.12, .4) * (1 - d / 220))
    g.append('<g filter="url(#%sfil)">%s</g>' % (u, rd.svg()))
    fil = []
    for side in (-1, 1):
        for i in range(40):
            x0 = rnd.gauss(0, 30); y0 = side * rnd.uniform(6, 20)
            spread = rnd.gauss(0, .38)
            L = (50 + 200 * rnd.random() ** 1.6) * (1 - abs(spread) * .6)
            x2 = x0 + L * math.sin(spread) * 1.3; y2 = y0 + side * L * math.cos(spread)
            x1 = (x0 + x2) / 2 + rnd.uniform(-22, 22); y1 = (y0 + y2) / 2
            col = rnd.choice(['#ff4a44', '#ff6a58', '#e8304a', '#ff8a70', '#d82a48'])
            fil.append('<path d="M%s %sQ%s %s %s %s" stroke="%s" stroke-width="%s" stroke-opacity="%s"/>' % (
                fi(x0), fi(y0), fi(x1), fi(y1), fi(x2), fi(y2), col, f(rnd.uniform(.5, 1.8)), f(rnd.uniform(.1, .42))))
    g.append('<g fill="none" stroke-linecap="round" filter="url(#%sfil)" opacity=".7">%s</g>' % (u, ''.join(fil)))
    # the disc: seen edge-on, a bright spindle
    g.append('<ellipse rx="300" ry="95" fill="url(#%shalo)"/>' % u)
    g.append('<ellipse rx="240" ry="46" fill="url(#%sdisc)"/>' % u)
    sp, dots = Soft(u), Dots()
    for _ in range(160):
        x = rnd.gauss(0, 85); y = rnd.gauss(0, 7 + 6 * math.exp(-abs(x) / 60))
        sp.add(x, y, rnd.uniform(3, 9), rnd.choice(['lt', 'lt', 'bl']), rnd.uniform(.2, .5))
    for _ in range(2000):
        x = rnd.gauss(0, 95); y = rnd.gauss(0, 10 + 8 * math.exp(-abs(x) / 50))
        dots.add(x, y, .5 + .9 * rnd.random() ** 3, rnd.choice(('#ffffff', '#eef2ff', '#fff4e4', '#dfe6ff')), .3 + .55 * rnd.random())
    g.append(sp.svg())
    # dust: dark mottled clouds across the disc, heaviest near the middle
    dst = []
    for _ in range(60):
        x = rnd.gauss(0, 75); y = rnd.gauss(-2, 5 + 4 * math.exp(-abs(x) / 50))
        dst.append('<path d="%s" fill-opacity="%s"/>' % (blob(x, y, rnd.uniform(8, 32), rnd.uniform(2.5, 7), rnd, 10, .45), f(rnd.uniform(.35, .8))))
    for _ in range(14):
        x0 = rnd.gauss(0, 60); y0 = rnd.gauss(0, 4)
        dst.append('<path d="M%s %sq%s %s %s %s" fill="none" stroke="#1a0e08" stroke-width="%s" stroke-opacity=".6"/>' % (
            fi(x0), fi(y0), fi(rnd.uniform(5, 15)), fi(rnd.uniform(-12, 12)), fi(rnd.uniform(10, 30)), fi(rnd.uniform(-22, 22)), f(rnd.uniform(1.4, 3))))
    g.append('<g fill="#150905" filter="url(#%sdst)">%s</g>' % (u, ''.join(dst)))
    # the starburst: super star clusters in the core, blue-white, and red-lit gas around them
    for _ in range(20):
        x = rnd.gauss(0, 22); y = rnd.gauss(0, 5)
        sp.add(x, y, rnd.uniform(2, 6), 'bl', .9)
    g.append('<ellipse rx="44" ry="15" fill="url(#%sburst)" filter="url(#%sb2)"/>' % (u, u))
    for _ in range(26):
        x = rnd.gauss(0, 26); y = rnd.gauss(0, 10)
        dots.add(x, y, 1 + 1.6 * rnd.random(), rnd.choice(('#ffffff', '#e8f0ff', '#ff9a90')), .9)
    g.append(dots.svg())
    tf = 'translate(%d %d) rotate(%d)' % (cx, cy, rot)
    defs += rgrad(u, 'wmk', [(0, '#fff', 1), (.45, '#fff', .55), (1, '#fff', 0)])
    cone = ''.join('<ellipse cy="%d" rx="%d" ry="%d" fill="url(#%swmk)"/>' % (s_ * 95, 85, 150, u) for s_ in (-1, 1))
    defs += '<mask id="%swm" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><g transform="%s">%s</g></mask>' % (u, W, H, tf, cone)
    plume = (noise_layer(u, 'np', '.03 .008', 82, (1, .24, .26), .52, 4, .6, 5, (-180, -260, 360, 520), tf + ' rotate(10)', u + 'wm', .6) +
             noise_layer(u, 'nr', '.03 .008', 84, (1, .28, .3), .52, 4, .6, 5, (-180, -260, 360, 520), tf + ' rotate(-10)', u + 'wm', .6) +
             noise_layer(u, 'nq', '.07 .014', 83, (1, .45, .42), .6, 6, .5, 4, (-180, -260, 360, 520), tf, u + 'wm', .3))
    gi = ''.join(g)
    k = gi.index('<ellipse rx="300" ry="95"')
    obj = svg(W, H, '<g transform="%s">%s</g>' % (tf, gi[:k]) + plume + '<g transform="%s">%s</g>' % (tf, gi[k:]) + grain(u + 'o', W, H, .1), defs)
    return bg, obj, svg(W, H, top('RA 09H 55M 52S · DEC +69° 40′ · URSA MAJOR'))


# ================================================================= CENTAURUS A
def cen_a(u):
    rnd = random.Random(5128)
    cx, cy = 291, 346
    bg = sky(u, H, ('#18161e', '#0a090f', '#030305'), 300, 5128, 5, tints=('#ffffff', '#fff1dc', '#ffe8cc', '#dfe8ff'),
             extra=bg_galaxies(random.Random(5128), 10, avoid=(cx, cy, 280)))
    defs = blur(u, 'b1', .9) + blur(u, 'b3', 2.6) + blur(u, 'b8', 8) + blur(u, 'b30', 30, 80) + (
        '<filter id="%sdst" x="-20%%" y="-60%%" width="140%%" height="220%%"><feTurbulence type="fractalNoise" baseFrequency=".035 .08" numOctaves="4" seed="51"/>'
        '<feDisplacementMap in="SourceGraphic" scale="16"/><feGaussianBlur stdDeviation="1.3"/></filter>'
        '<filter id="%slob" x="-50%%" y="-50%%" width="200%%" height="200%%"><feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="3" seed="3"/>'
        '<feDisplacementMap in="SourceGraphic" scale="60"/><feGaussianBlur stdDeviation="14"/></filter>') % (u, u)
    defs += rgrad(u, 'ell', [(0, '#fffaf0', 1), (.1, '#fff2dc', .94), (.3, '#f4dcb8', .66), (.55, '#d8b894', .3), (.8, '#a08878', .08), (1, '#a08878', 0)])
    defs += soft_defs(u, {'hii': '#ff7aa8', 'bl': '#a8c4ff', 'org': '#ffa058', 'blu': '#7aa4ff'})
    o = []
    # the lobes: two well-shaped plumes at the jets' ends, filamentary, in restrained composite colour
    ax = math.radians(-50)
    ux, uy = math.cos(ax), math.sin(ax)
    deg = math.degrees(ax)
    defs += rgrad(u, 'lb', [(0, '#fff', .95), (.55, '#fff', .6), (1, '#fff', 0)])
    defs += rgrad(u, 'lbc', [(0, '#b8a0e8', .34), (.5, '#8a8ce0', .16), (1, '#6a7ad0', 0)])
    defs += rgrad(u, 'lbw', [(0, '#ffb880', .3), (.6, '#e89060', .1), (1, '#e89060', 0)])
    lobes, lmask = [], []
    for side, d, rx, ry, br in ((1, 228, 74, 56, 1), (-1, 218, 68, 52, .8)):
        lx, ly = cx + side * d * ux, cy + side * d * uy
        tf = 'translate(%s %s) rotate(%s)' % (f(lx), f(ly), f(deg))
        # a mushroom: the far edge broad and bright, the near side pinched toward the jet
        shape = '<path d="%s" fill="url(#%slb)"/>' % (blob(side * 10, 0, rx, ry, rnd, 16, .18), u)
        lmask.append('<g transform="%s">%s</g>' % (tf, shape))
        lobes.append('<g transform="%s" opacity="%s"><ellipse cx="%s" rx="%s" ry="%s" fill="url(#%slbc)"/><ellipse cx="%s" rx="%s" ry="%s" fill="url(#%slbw)"/>' % (
            tf, f(br), f(side * 10), f(rx * 1.1), f(ry * 1.1), u, f(-side * 20), f(rx * .6), f(ry * .7), u) +
            # a bright rim on the working surface, where the jet hits
            '<path d="%s" fill="none" stroke="#c8c0f0" stroke-width="2" stroke-opacity=".35" filter="url(#%sb3)"/></g>' % (
                smooth([(side * (10 + rx * .85 * math.cos(t)), ry * .85 * math.sin(t)) for t in [(-1.1 + 2.2 * i / 11) for i in range(12)]], f), u))
    defs += '<mask id="%slm" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><g filter="url(#%sb30)">%s</g></mask>' % (u, W, H, u, ''.join(lmask))
    o.append('<g filter="url(#%sb8)">%s</g>' % (u, ''.join(lobes)))
    o.append(noise_layer(u, 'lf', '.07 .025', 61, (.8, .8, 1), .54, 4, .3, 4, (0, 0, W, H), 'rotate(%s %d %d)' % (f(deg + 90), cx, cy), u + 'lm', .7))
    # the elliptical: a large, luminous, round swarm of old stars
    o.append('<circle cx="%d" cy="%d" r="300" fill="url(#%sell)"/><circle cx="%d" cy="%d" r="150" fill="url(#%sell)" opacity=".7"/>' % (cx, cy, u, cx, cy, u))
    dots = Dots()
    for _ in range(1500):
        r = 250 * rnd.random() ** 1.7; a = rnd.uniform(0, 6.283)
        dots.add(cx + r * math.cos(a), cy + r * math.sin(a) * .94, .5 + .6 * rnd.random() ** 3, rnd.choice(('#fff4e0', '#ffe8c8', '#fffaf2', '#ffdcb0')), .2 + .4 * rnd.random())
    for _ in range(140):
        r = rnd.uniform(160, 380); a = rnd.uniform(0, 6.283)
        dots.add(cx + r * math.cos(a), cy + r * math.sin(a), .9 + .5 * rnd.random(), '#ffe4b8', .35 + .4 * rnd.random())
    o.append(dots.svg())
    # the jets: thin and collimated, knotted, the near one bright, the counter-jet faint
    defs += '<linearGradient id="%sjt" x1="0" x2="1"><stop offset="0" stop-color="#f4f8ff" stop-opacity=".95"/><stop offset=".7" stop-color="#c8d8ff" stop-opacity=".55"/><stop offset="1" stop-color="#b0c0ff" stop-opacity=".1"/></linearGradient>' % u
    for side, L, w, op in ((1, 190, 1.8, 1), (-1, 175, 1.1, .38)):
        jt = ['<path d="M0 -%sL%d -.4L%d .4L0 %sZ" fill="url(#%sjt)" filter="url(#%sb3)" opacity=".8"/>' % (f(w * 1.6), L, L, f(w * 1.6), u, u),
              '<path d="M4 0L%d 0" stroke="url(#%sjt)" stroke-width="%s" stroke-linecap="round" filter="url(#%sb1)"/>' % (L, u, f(w * .6), u)]
        for k in range(7 if side > 0 else 3):
            t = .12 + .75 * k / 6 + rnd.uniform(-.03, .03)
            jt.append('<ellipse cx="%s" rx="%s" ry="%s" fill="#f4f8ff" opacity="%s" filter="url(#%sb1)"/>' % (f(t * L), f(rnd.uniform(2.5, 5)), f(w * .9), f(rnd.uniform(.5, .9)), u))
        o.append('<g transform="translate(%d %d) rotate(%s)" opacity="%s">%s</g>' % (cx, cy, f(deg + (0 if side > 0 else 180)), f(op), ''.join(jt)))
    # the dust band: broad, warped at its ends, lit through its gaps, pink and blue along its edges
    rot = -22
    def cl(x):
        return 8 * math.sin(x / 60) - 26 * (x / 200) ** 3
    def th(x):
        return 44 * max(0, 1 - (abs(x) / 225) ** 2.2)
    xs = list(range(-215, 220, 8))
    top_ = [(x, cl(x) - th(x) * (1 + .15 * math.sin(x / 17))) for x in xs]
    bot_ = [(x, cl(x) + th(x) * (1 + .15 * math.sin(x / 13 + 1))) for x in reversed(xs)]
    shape_d = '%sL%sZ' % (smooth(top_), smooth(bot_)[1:])
    tf = 'translate(%d %d) rotate(%d)' % (cx, cy, rot)
    defs_band = ('<mask id="%sbm" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><g transform="%s"><path d="%s" fill="#fff" filter="url(#%sb8)"/></g></mask>'
                 '<mask id="%sbc" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><g transform="%s"><path d="%s" fill="#fff" transform="scale(.9 .6)" filter="url(#%sb8)"/></g></mask>') % (
        u, W, H, tf, shape_d, u, u, W, H, tf, shape_d, u)
    o.append('<defs>%s</defs>' % defs_band)
    # a soft shadow over the whole band, then dust in patches and rivers, then a few crisp filaments
    o.append('<g transform="%s"><path d="%s" fill="#2a150a" opacity=".45" filter="url(#%sb8)"/></g>' % (tf, shape_d, u))
    o.append(noise_layer(u, 'nb', '.012 .05', 12, (.06, .03, .014), .36, 4.5, 1, 5, (-260, -90, 520, 180), tf, u + 'bm', .5))
    o.append(noise_layer(u, 'nb2', '.02 .08', 29, (.035, .018, .01), .46, 7, .9, 4, (-260, -90, 520, 180), tf, u + 'bc', .3))
    band, crisp = [], []
    for k in range(12):
        off = rnd.uniform(-.8, .8)
        x0 = rnd.uniform(-210, -40); x1 = rnd.uniform(40, 210)
        pts = [(x, cl(x) + off * th(x) + 3 * math.sin(x / 20 + k)) for x in range(int(x0), int(x1), 12)]
        lit = rnd.random() < .45
        band.append('<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="%s"/>' % (
            smooth(pts), '#d89a60' if lit else '#120703', f(rnd.uniform(1.5, 4)), f(rnd.uniform(.2, .4) if lit else rnd.uniform(.3, .6))))
    # sharp dark filaments: long strands along the band, forking and twisting
    for k in range(22):
        off = rnd.uniform(-.8, .8)
        x0 = rnd.uniform(-200, 120); L = min(rnd.uniform(40, 160), 200 - x0)
        wv = wobble(rnd, 3, 1)
        pts = [(x0 + L * i / 11, 0) for i in range(12)]
        pts = [(x, cl(x) + (off + .12 * wv(i / 11)) * th(x)) for i, (x, _) in enumerate(pts)]
        wd = rnd.uniform(.6, 2)
        crisp.append('<path d="%s" stroke-width="%s" stroke-opacity="%s"/>' % (smooth(pts, f), f(wd), f(rnd.uniform(.3, .65))))
        if rnd.random() < .5:
            j = rnd.randrange(3, 9); bx, by = pts[j]
            side = rnd.choice((-1, 1))
            crisp.append('<path d="M%s %sq%s %s %s %s" stroke-width="%s" stroke-opacity="%s"/>' % (
                f(bx), f(by), f(rnd.uniform(6, 14)), f(side * rnd.uniform(2, 6)), f(rnd.uniform(14, 34)), f(side * rnd.uniform(5, 14)), f(wd * .6), f(rnd.uniform(.4, .8))))
    defs += blur(u, 'bh', .5)
    crisp_s = '<g fill="none" stroke="#140803" stroke-linecap="round" filter="url(#%sbh)">%s</g>' % (u, ''.join(crisp))
    edge, g2 = Soft(u), Dots()
    for i in range(60):
        x = rnd.uniform(-205, 205)
        side = rnd.choice((-1, 1))
        y = cl(x) + side * th(x) * rnd.uniform(.75, 1.05)
        edge.add(x, y, rnd.uniform(3, 7), rnd.choice(['hii', 'hii', 'bl']), rnd.uniform(.4, .7))
        for _ in range(3):
            g2.add(x + rnd.gauss(0, 3.5), y + rnd.gauss(0, 2), .6 + 1 * rnd.random() ** 2, rnd.choice(('#ff8cb8', '#bcd0ff', '#ffffff', '#ffa8c8')), .9)
    o.append('<g transform="%s"><g filter="url(#%sdst)" stroke-linecap="round">%s</g>%s<g filter="url(#%sb1)">%s</g>%s</g>' % (tf, u, ''.join(band), crisp_s, u, edge.svg(), g2.svg()))
    o.append('<circle cx="%d" cy="%d" r="16" fill="#ffe6c0" opacity=".4" filter="url(#%sb8)"/>' % (cx + 4, cy - 2, u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    return bg, obj, svg(W, H, top('RA 13H 25M 28S · DEC −43° 01′ · CENTAURUS'))


# ================================================================= M87
def m87(u):
    rnd = random.Random(4486)
    cx, cy = 300, 352
    bgr = random.Random(87)
    bg = sky(u, H, ('#1c1610', '#0c0a08', '#040303'), 260, 4486, 4, tints=('#ffffff', '#fff1dc', '#ffe8cc', '#dfe8ff'),
             extra=bg_galaxies(bgr, 26, avoid=(cx, cy, 300)))
    defs = blur(u, 'b1', .8) + blur(u, 'b3', 2.5) + blur(u, 'b8', 7)
    defs += rgrad(u, 'hal', [(0, '#ffe4b4', .62), (.22, '#f0c890', .36), (.5, '#c09460', .13), (.8, '#8a6a48', .035), (1, '#8a6a48', 0)])
    defs += rgrad(u, 'mid', [(0, '#fff6e4', 1), (.12, '#ffecc8', .88), (.35, '#f8d6a0', .5), (.7, '#d8a870', .12), (1, '#c09870', 0)])
    defs += rgrad(u, 'cor', [(0, '#ffffff', 1), (.3, '#fff8ea', .8), (1, '#fff0d6', 0)])
    defs += rgrad(u, 'gcg', [(0, '#fff0d0', .9), (.4, '#ffe0b0', .3), (1, '#ffe0b0', 0)])
    defs += '<linearGradient id="%sjet" x1="0" x2="1"><stop offset="0" stop-color="#eaf2ff" stop-opacity=".95"/><stop offset=".6" stop-color="#b8d0ff" stop-opacity=".6"/><stop offset="1" stop-color="#9ab8ff" stop-opacity=".15"/></linearGradient>' % u
    o = ['<ellipse cx="%d" cy="%d" rx="400" ry="370" fill="url(#%shal)"/>' % (cx, cy, u),
         '<ellipse cx="%d" cy="%d" rx="175" ry="162" fill="url(#%smid)"/>' % (cx, cy, u),
         '<ellipse cx="%d" cy="%d" rx="60" ry="56" fill="url(#%smid)"/>' % (cx, cy, u)]
    # the swarm of globular clusters, some twelve thousand in life; a few thousand here
    gc = Dots()
    for _ in range(2600):
        r = 18 + 420 * rnd.random() ** 1.9; a = rnd.uniform(0, 6.283)
        gc.add(cx + r * math.cos(a), cy + r * math.sin(a) * .93, .5 + .9 * rnd.random() ** 3, rnd.choice(('#ffe8c0', '#fff2d8', '#ffdca8', '#fff8ee')), (.3 + .55 * rnd.random()) * max(.35, 1 - r / 520))
    for _ in range(26):
        r = rnd.uniform(60, 300); a = rnd.uniform(0, 6.283)
        x, y = cx + r * math.cos(a), cy + r * math.sin(a) * .93
        o.append('<circle cx="%s" cy="%s" r="%s" fill="url(#%sgcg)"/>' % (f(x), f(y), f(rnd.uniform(2.5, 4.5)), u))
    o.append(gc.svg())
    # the jet: 5,000 light-years of blue-white synchrotron light, beaded with knots
    ang = -24
    L = 150
    knots = [(.1, 1.6), (.32, 2.2), (.48, 1.8), (.6, 2.4), (.72, 2.8), (.86, 3.4), (.95, 3)]
    jet = ['<path d="M0 0L%d -1L%d 1Z" fill="url(#%sjet)" stroke="url(#%sjet)" stroke-width="7" opacity=".55" filter="url(#%sb8)"/>' % (L, L, u, u, u),
           '<ellipse cx="%d" cy="0" rx="22" ry="9" fill="#cfe0ff" opacity=".3" filter="url(#%sb8)"/>' % (L * .9, u),
           '<path d="M0 0L%d 0" stroke="url(#%sjet)" stroke-width="2" filter="url(#%sb1)"/>' % (L, u, u)]
    for t, r in knots:
        jet.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#dfeaff" opacity=".45" filter="url(#%sb3)"/><ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#f4f8ff" opacity="%s" filter="url(#%sb1)"/>' % (
            f(t * L), f(rnd.uniform(-.8, .8)), f(r * 3.4), f(r * 1.3), u, f(t * L), f(rnd.uniform(-.4, .4)), f(r * 1.6), f(r * .45), f(.5 + .4 * t), u))
    o.append('<g transform="translate(%d %d) rotate(%d)">%s</g>' % (cx, cy, ang, ''.join(jet)))
    o.append('<circle cx="%d" cy="%d" r="16" fill="url(#%scor)"/><circle cx="%d" cy="%d" r="2" fill="#fff"/>' % (cx, cy, u, cx, cy))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    return bg, obj, svg(W, H, top('RA 12H 30M 49S · DEC +12° 23′ · VIRGO'))


def speckle(u, name, mask_inner, seed=1, freq=.75, cut=.66, gain=14, col=(1, .97, .92), op=1):
    """Countless faint stars for no bytes: thresholded high-frequency noise, shown only through a mask."""
    r, g, b = col
    return ('<filter id="%s%sf" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="1" seed="%d"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 %s  0 0 0 0 %s  0 0 0 0 %s  %s 0 0 0 %s"/></filter>'
            '<mask id="%s%sm" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d">%s</mask>'
            '<rect width="%d" height="%d" filter="url(#%s%sf)" mask="url(#%s%sm)" opacity="%s"/>') % (
        u, name, f(freq), seed, '%.3g' % r, '%.3g' % g, '%.3g' % b, f(gain), '%.3g' % (-gain * cut), u, name, W, H, mask_inner, W, H, u, name, u, name, f(op))


def nebula(u, rnd, x, y, R, cols=('#ff5a8a', '#ff7aa0', '#ff4a6a', '#ffa0c0'), n=60, core='#e8f0ff', name='neb'):
    """An emission nebula: pink haze, displaced filament loops, a hot cluster at its heart. Needs defs from nebula_defs."""
    sp, st = Soft(u), Dots()
    for _ in range(int(n * .5)):
        sp.add(x + rnd.gauss(0, R * .45) * 1.3, y + rnd.gauss(0, R * .4), rnd.uniform(.2, .6) * R, 'nb', rnd.uniform(.2, .5))
    fil = []
    for _ in range(n):
        # shells and loops: arcs around the cluster, blown out by its winds
        a0 = rnd.uniform(0, 6.283); r0 = R * rnd.uniform(.12, .6); span = rnd.uniform(.5, 2.2)
        cxo, cyo = x + rnd.gauss(0, R * .35) * 1.3, y + rnd.gauss(0, R * .3)
        pts = [(cxo + r0 * (1 + .12 * math.sin(k * 1.7)) * math.cos(a0 + span * k / 6), cyo + r0 * (1 + .12 * math.sin(k * 1.3)) * math.sin(a0 + span * k / 6)) for k in range(7)]
        fil.append('<path d="%s" stroke="%s" stroke-width="%s" stroke-opacity="%s"/>' % (smooth(pts, f), rnd.choice(cols), f(rnd.uniform(.6, 2.4) * min(1, .4 + R / 60)), f(rnd.uniform(.25, .7) * min(1, .5 + R / 80))))
    for _ in range(40):
        st.add(x + rnd.gauss(0, R * .12), y + rnd.gauss(0, R * .12), .6 + 1.4 * rnd.random() ** 2, rnd.choice((core, '#ffffff', '#dfe8ff')), .9)
    return ('<g filter="url(#%snbb)">%s</g><g fill="none" stroke-linecap="round" filter="url(#%snbf)">%s</g>' % (u, sp.svg(), u, ''.join(fil)) +
            '<circle cx="%s" cy="%s" r="%s" fill="%s" opacity=".5" filter="url(#%snbb)"/>' % (f(x), f(y), f(R * .16), core, u) + st.svg())


def nebula_defs(u, col='#ff5a8a', seed=30):
    return soft_defs(u, {'nb': col}) + blur(u, 'nbb', 4) + (
        '<filter id="%snbf" x="-40%%" y="-40%%" width="180%%" height="180%%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="%d"/>'
        '<feDisplacementMap in="SourceGraphic" scale="12"/><feGaussianBlur stdDeviation=".8"/></filter>') % (u, seed)


def star_cloud(u, rnd, pts, *, cloud='cl', dots=None, soft=None, cols=('#e8eeff', '#ffffff', '#fff4e4', '#dfe6ff', '#ffe8cc'), n=200, size=1.0):
    """Patchy clouds of unresolved and resolved stars around given centres: [(x, y, rx, ry, weight)]."""
    for x, y, rx, ry, w in pts:
        for _ in range(int(14 * w)):
            soft.add(x + rnd.gauss(0, rx * .5), y + rnd.gauss(0, ry * .5), rnd.uniform(.35, .8) * (rx + ry) * .5, cloud, rnd.uniform(.15, .35) * min(1, w))
        for _ in range(int(n * w)):
            dots.add(x + rnd.gauss(0, rx * .55), y + rnd.gauss(0, ry * .55), (.45 + 1.2 * rnd.random() ** 3.5) * size, rnd.choice(cols), .3 + .65 * rnd.random())


# ================================================================= LMC
def lmc(u):
    rnd = random.Random(1987)
    bg = sky(u, H, ('#0e1428', '#060a18', '#02030a'), 420, 1987, 6)
    defs = blur(u, 'b2', 2) + blur(u, 'b6', 6) + (
        '<filter id="%sdsk" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="4" seed="19"/>'
        '<feDisplacementMap in="SourceGraphic" scale="60"/><feGaussianBlur stdDeviation="8"/></filter>'
        '<filter id="%scl" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="7"/>'
        '<feDisplacementMap in="SourceGraphic" scale="22"/><feGaussianBlur stdDeviation="2"/></filter>'
        '<filter id="%sdst" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="3" seed="2"/>'
        '<feDisplacementMap in="SourceGraphic" scale="20"/><feGaussianBlur stdDeviation="2.4"/></filter>') % (u, u, u)
    defs += soft_defs(u, {'dk': '#8a9cc8', 'cl': '#dfe4f4', 'br': '#fff0d8', 'hii': '#ff6a98'}) + nebula_defs(u, '#ff4a7a', 30)
    defs += soft_defs(u, {'mk': '#ffffff'})
    defs += rgrad(u, 'bar', [(0, '#fff6e6', .95), (.35, '#f4e8d8', .6), (.7, '#d8d4dc', .2), (1, '#c8c8d8', 0)])
    cx, cy = 300, 360
    o = []
    # the disc: faint, ragged, a little lopsided
    dk = Soft(u)
    for _ in range(80):
        a = rnd.uniform(0, 6.283); r = 240 * rnd.random() ** .7
        dk.add(cx + r * math.cos(a) * 1.05, cy + r * math.sin(a) * .9, rnd.uniform(40, 90), 'dk', rnd.uniform(.08, .22))
    o.append('<g filter="url(#%sdsk)">%s</g>' % (u, dk.svg()))
    # star clouds scattered through the disc, and the bar, off-centre, thick with old stars
    sp, dots = Soft(u), Dots()
    clouds = []
    for _ in range(26):
        a = rnd.uniform(0, 6.283); r = 60 + 170 * rnd.random() ** .8
        clouds.append((cx + r * math.cos(a), cy + r * math.sin(a) * .85, rnd.uniform(18, 45), rnd.uniform(14, 35), rnd.uniform(.4, 1)))
    for i in range(16):
        t = i / 15
        a = math.radians(10 - 200 * t)
        clouds.append((cx + 30 + 190 * math.cos(a) * (1 - .15 * t), cy - 20 + 150 * math.sin(a) - 30 * t, rnd.uniform(20, 36), rnd.uniform(14, 26), rnd.uniform(.7, 1.1)))
    star_cloud(u, rnd, clouds, dots=dots, soft=sp, n=55)
    bx, by, ba = cx + 20, cy + 30, math.radians(-18)
    bar = []
    for i in range(24):
        t = rnd.uniform(-1, 1)
        bar.append((bx + 125 * t * math.cos(ba) + rnd.gauss(0, 8), by + 125 * t * math.sin(ba) + rnd.gauss(0, 12), rnd.uniform(20, 36), rnd.uniform(14, 24), rnd.uniform(.8, 1.3)))
    star_cloud(u, rnd, bar, dots=dots, soft=sp, cloud='br', n=80, cols=('#fff4e0', '#ffffff', '#ffe8c8', '#fff8ee', '#e8eeff'))
    for _ in range(800):
        a = rnd.uniform(0, 6.283); r = 270 * rnd.random() ** .8
        dots.add(cx + r * math.cos(a), cy + r * math.sin(a) * .88, .45 + .8 * rnd.random() ** 4, rnd.choice(('#e8eeff', '#ffffff', '#fff4e4')), .2 + .45 * rnd.random())
    o.append('<ellipse cx="%d" cy="%d" rx="160" ry="48" fill="url(#%sbar)" transform="rotate(-18 %d %d)" filter="url(#%sb6)"/>' % (bx, by, u, bx, by, u))
    o.append('<g filter="url(#%scl)">%s</g>' % (u, sp.svg()))
    # dust: dark wisps threaded through the clouds
    dst = ''.join('<path d="M%s %sq%s %s %s %s" stroke-width="%s" stroke-opacity="%s"/>' % (
        fi(cx + rnd.uniform(-210, 210)), fi(cy + rnd.uniform(-170, 170)), fi(rnd.uniform(-20, 20)), fi(rnd.uniform(-20, 20)), fi(rnd.uniform(-50, 50)), fi(rnd.uniform(-30, 30)), f(rnd.uniform(3, 9)), f(rnd.uniform(.25, .5))) for _ in range(26))
    o.append('<g fill="none" stroke="#080a16" stroke-linecap="round" filter="url(#%sdst)">%s</g>' % (u, dst))
    o.append(speckle(u, 'spk', '<g filter="url(#%sdsk)">%s</g>' % (u, dk.svg().replace('url(#%sdk)' % u, 'url(#%smk)' % u)), seed=5))
    o.append(dots.svg())
    # star-forming regions: small pink nebulae, and the Tarantula
    hii, hd = Soft(u), Dots()
    for _ in range(24):
        a = rnd.uniform(0, 6.283); r = 60 + 190 * rnd.random() ** .7
        x, y = cx + r * math.cos(a), cy + r * math.sin(a) * .85
        hii.add(x, y, rnd.uniform(5, 14), 'hii', rnd.uniform(.35, .7))
        for _ in range(4):
            hd.add(x + rnd.gauss(0, 3), y + rnd.gauss(0, 3), .7 + rnd.random(), rnd.choice(('#ff8cb0', '#ffc0d8', '#ffffff')), .85)
    o.append('<g filter="url(#%sb2)">%s</g>' % (u, hii.svg()) + hd.svg())
    tx, ty = 176, 262
    o.append(nebula(u, rnd, tx, ty, 50, n=60))
    o.append(nebula(u, rnd, tx + 34, ty + 44, 18, n=14))
    o.append(spike_star(tx + 2, ty + 1, 1.8, '#dfe8ff', 14, 1, .8))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    return bg, obj, svg(W, H, top('RA 05H 23M 35S · DEC −69° 45′ · DORADO'))


def globular(u, rnd, x, y, R, dots, n=1400, cols=('#ffe6b0', '#fff2d4', '#ffd890', '#fff8ea', '#ffcf80'), name='gc'):
    """A globular cluster: a golden glow and a swarm that thickens to a blazing core."""
    defs = rgrad(u, name, [(0, '#fff6e0', 1), (.15, '#ffe8b8', .8), (.4, '#f4c880', .35), (.75, '#d8a060', .08), (1, '#d8a060', 0)])
    for _ in range(n):
        r = R * .17 * math.tan(rnd.random() * 1.45); a = rnd.uniform(0, 6.283)
        if r > R * 1.6:
            continue
        dots.add(x + r * math.cos(a), y + r * math.sin(a), .5 + 1.1 * rnd.random() ** 3, rnd.choice(cols), .4 + .6 * rnd.random())
    return defs, '<circle cx="%s" cy="%s" r="%s" fill="url(#%s%s)"/>' % (f(x), f(y), f(R * 1.15), u, name)


# ================================================================= SMC
def smc(u):
    rnd = random.Random(292)
    bg = sky(u, H, ('#0e1428', '#060a18', '#02030a'), 420, 292, 5)
    defs = blur(u, 'b2', 2) + (
        '<filter id="%sdsk" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="4" seed="29"/>'
        '<feDisplacementMap in="SourceGraphic" scale="50"/><feGaussianBlur stdDeviation="8"/></filter>'
        '<filter id="%scl" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="9"/>'
        '<feDisplacementMap in="SourceGraphic" scale="20"/><feGaussianBlur stdDeviation="2"/></filter>') % (u, u)
    defs += soft_defs(u, {'dk': '#95a4cc', 'cl': '#e2e8f6', 'mk': '#ffffff', 'hii': '#ff6a98'}) + nebula_defs(u, '#ff4a7a', 34)
    cx, cy, ang = 250, 370, math.radians(-50)
    ux, uy = math.cos(ang), math.sin(ang)
    def P(s_, t_):
        return cx + s_ * ux - t_ * uy, cy + s_ * uy + t_ * ux
    dk = Soft(u)
    for _ in range(60):
        s_ = rnd.gauss(0, 95); t_ = rnd.gauss(0, 45)
        x, y = P(s_, t_)
        dk.add(x, y, rnd.uniform(35, 70), 'dk', rnd.uniform(.1, .24))
    for _ in range(18):
        # the Wing, trailing toward the Magellanic Bridge
        t = rnd.random()
        x, y = P(-60 - 130 * t, 70 + 60 * t)
        dk.add(x + rnd.gauss(0, 20), y + rnd.gauss(0, 20), rnd.uniform(25, 45), 'dk', rnd.uniform(.06, .16))
    o = ['<g filter="url(#%sdsk)">%s</g>' % (u, dk.svg())]
    sp, dots = Soft(u), Dots()
    clouds = []
    for _ in range(30):
        s_ = rnd.gauss(0, 85); t_ = rnd.gauss(0, 32)
        x, y = P(s_, t_)
        clouds.append((x, y, rnd.uniform(16, 34), rnd.uniform(12, 26), max(.3, 1.1 - abs(s_) / 200)))
    for _ in range(8):
        t = rnd.random()
        x, y = P(-70 - 110 * t, 72 + 50 * t)
        clouds.append((x, y, rnd.uniform(12, 22), rnd.uniform(10, 18), .45))
    star_cloud(u, rnd, clouds, dots=dots, soft=sp, n=60)
    for _ in range(700):
        s_ = rnd.gauss(0, 110); t_ = rnd.gauss(0, 50)
        x, y = P(s_, t_)
        dots.add(x, y, .45 + .8 * rnd.random() ** 4, rnd.choice(('#e8eeff', '#ffffff', '#fff4e4')), .2 + .45 * rnd.random())
    o.append('<g filter="url(#%scl)">%s</g>' % (u, sp.svg()))
    o.append(speckle(u, 'spk', '<g filter="url(#%sdsk)">%s</g>' % (u, dk.svg().replace('url(#%sdk)' % u, 'url(#%smk)' % u)), seed=8))
    o.append(dots.svg())
    hii, hd = Soft(u), Dots()
    for _ in range(12):
        s_ = rnd.gauss(0, 80); t_ = rnd.gauss(0, 35)
        x, y = P(s_, t_)
        hii.add(x, y, rnd.uniform(4, 10), 'hii', rnd.uniform(.35, .65))
        hd.add(x, y, 1.2, '#ffc0d8', .9)
    o.append('<g filter="url(#%sb2)">%s</g>' % (u, hii.svg()) + hd.svg())
    nx, ny = P(95, -18)
    o.append(nebula(u, rnd, nx, ny, 22, n=24))
    # 47 Tucanae, a foreground globular, and little NGC 362
    gd = Dots()
    d1, g1 = globular(u, rnd, 458, 226, 50, gd, 1500, name='t47')
    d2, g2 = globular(u, rnd, 400, 132, 14, gd, 160, name='n362')
    o.append(g1 + g2 + gd.svg() + spike_star(458, 226, 2, '#fff2d0', 12, .9, .7))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs + d1 + d2)
    return bg, obj, svg(W, H, top('RA 00H 52M 38S · DEC −72° 48′ · TUCANA'))


# ================================================================= THE CARTWHEEL
def cartwheel(u):
    rnd = random.Random(1941)
    cx, cy = 318, 330
    D = Disk(cx, cy, -18, .74)
    bg = sky(u, H, ('#101830', '#070a1c', '#02030a'), 240, 1941, 4, extra=bg_galaxies(random.Random(19), 18, avoid=(cx, cy, 260)))
    defs = blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b8', 8) + (
        '<filter id="%sring" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="3" seed="12"/>'
        '<feDisplacementMap in="SourceGraphic" scale="18"/><feGaussianBlur stdDeviation="3"/></filter>') % u
    defs += soft_defs(u, {'rg': '#9ab8ff', 'rw': '#dfe8ff', 'pk': '#ff7aa8', 'sp': '#c8b8a8', 'yl': '#ffe0a8', 'hz': '#6a80c0'})
    defs += rgrad(u, 'core', [(0, '#fffaf0', 1), (.2, '#ffecc8', .8), (.55, '#e8c890', .3), (1, '#c8a070', 0)])
    R = 188
    o = []
    # the faint disc the wave has passed through
    hz, ring, spk, dots = Soft(u), Soft(u), Soft(u), Dots()
    for _ in range(40):
        r = R * 1.05 * rnd.random() ** .5; a = rnd.uniform(0, 6.283)
        hz.add(r * math.cos(a), r * math.sin(a), rnd.uniform(30, 60), 'hz', rnd.uniform(.08, .16))
    o.append(D.g('<g filter="url(#%sb8)">%s</g>' % (u, hz.svg())))
    # spokes: faint straight streams from the inner ring to the outer
    for i in range(15):
        a = i * 6.283 / 15 + rnd.uniform(-.2, .2)
        r1 = R * rnd.uniform(.55, .95); curl = rnd.uniform(.1, .45)
        for _ in range(int(26 * r1 / R)):
            r = rnd.uniform(50, r1)
            aa = a + (r / R) * curl
            spk.add(r * math.cos(aa) + rnd.gauss(0, 3), r * math.sin(aa) + rnd.gauss(0, 3), rnd.uniform(5, 11), 'sp', rnd.uniform(.08, .2))
            X, Y = D.pol(r, aa)
            if rnd.random() < .4:
                dots.add(X + rnd.gauss(0, 2), Y + rnd.gauss(0, 2), .5 + .5 * rnd.random(), rnd.choice(('#e8d8c8', '#dfe6ff')), .35)
    o.append(D.g('<g filter="url(#%sb3)">%s</g>' % (u, spk.svg())))
    # the outer ring: a wave of star birth, blue, knotted with pink
    wob = wobble(rnd, 5, 1)
    for i in range(460):
        a = rnd.uniform(0, 6.283)
        bright = .45 + .55 * (1 + math.cos(a - 2.2)) / 2
        rr = R * (1 + .06 * wob(a / 6.283)) + rnd.gauss(0, 6 + 8 * bright)
        ring.add(rr * math.cos(a), rr * math.sin(a), rnd.uniform(5, 15), rnd.choice(['rg', 'rg', 'rw']), rnd.uniform(.2, .5) * bright)
        X, Y = D.pol(rr, a)
        dots.add(X, Y, .5 + 1.3 * rnd.random() ** 3, rnd.choice(('#cfdcff', '#e8eeff', '#ffffff', '#b8ccff')), .5 + .45 * rnd.random())
    o.append(D.g('<ellipse rx="%d" ry="%d" fill="none" stroke="#8aa8f0" stroke-width="36" stroke-opacity=".2" filter="url(#%sb8)"/><g filter="url(#%sring)">%s</g>' % (R, R, u, u, ring.svg())))
    pk = Soft(u)
    for i in range(46):
        a = rnd.uniform(0, 6.283)
        rr = R * (1 + .05 * wob(a / 6.283)) + rnd.gauss(0, 5)
        X, Y = D.pol(rr, a)
        sz = rnd.random() ** 2
        pk.add(X, Y, 3 + 8 * sz, 'pk', .45 + .4 * rnd.random())
        dots.add(X, Y, .9 + 1.4 * sz, rnd.choice(('#ffb0cc', '#ffd0e0', '#ffffff')), 1)
    # the inner ring and core: older, yellow, a little dusty
    inner = Soft(u)
    for _ in range(70):
        a = rnd.uniform(0, 6.283); rr = 46 + rnd.gauss(0, 6)
        inner.add(rr * math.cos(a), rr * math.sin(a), rnd.uniform(6, 13), 'yl', rnd.uniform(.2, .4))
        X, Y = D.pol(rr, a)
        if rnd.random() < .4:
            dots.add(X, Y, .5 + .6 * rnd.random() ** 2, rnd.choice(('#fff0d0', '#ffe4b0', '#ffffff')), .5)
    o.append(D.g('<circle r="80" fill="url(#%score)" opacity=".75"/><g filter="url(#%sb3)">%s</g><circle r="22" fill="url(#%score)"/>' % (u, u, inner.svg(), u)))
    o.append(D.g('<g fill="none" stroke="#3a2412" stroke-opacity=".5" filter="url(#%sb1)">%s</g>' % (u, ''.join(
        '<path d="%s" stroke-width="%s"/>' % (smooth(arc_pts(38 + k * 7, 38 + k * 7, a0, a0 + rnd.uniform(1, 2.4), 14)), f(rnd.uniform(1.2, 2.6))) for k, a0 in ((0, .3), (1, 2.6), (0, 4.4), (2, 5.4))))))
    o.append(pk.svg() + dots.svg())
    # the companions: a small yellow spiral and a blue irregular
    c1 = (96, 492); c2 = (84, 556)
    defs += rgrad(u, 'cy', [(0, '#fff4dc', 1), (.25, '#ffe0a8', .6), (.6, '#d8b080', .2), (1, '#d8b080', 0)])
    defs += rgrad(u, 'cb', [(0, '#eef4ff', .9), (.3, '#b8ccff', .5), (.7, '#7a98e0', .14), (1, '#7a98e0', 0)])
    o.append('<ellipse cx="%d" cy="%d" rx="40" ry="17" fill="url(#%scy)" transform="rotate(-28 %d %d)"/>' % (c1[0], c1[1], u, c1[0], c1[1]))
    o.append('<ellipse cx="%d" cy="%d" rx="30" ry="15" fill="none" stroke="#ffe8c0" stroke-width="2" stroke-opacity=".3" transform="rotate(-28 %d %d)" filter="url(#%sb1)"/>' % (c1[0], c1[1], c1[0], c1[1], u))
    o.append('<ellipse cx="%d" cy="%d" rx="26" ry="18" fill="url(#%scb)" transform="rotate(20 %d %d)"/>' % (c2[0] + 12, c2[1], u, c2[0] + 12, c2[1]))
    cd = Dots()
    for _ in range(40):
        cd.add(c2[0] + 12 + rnd.gauss(0, 8), c2[1] + rnd.gauss(0, 5), .5 + .8 * rnd.random() ** 2, rnd.choice(('#dfe8ff', '#ffffff', '#ffb0cc')), .7)
    o.append(cd.svg() + '<circle cx="%d" cy="%d" r="1.6" fill="#fff"/>' % c1)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    return bg, obj, svg(W, H, top('RA 00H 37M 41S · DEC −33° 42′ · SCULPTOR'))


def elliptical(u, rnd, x, y, rx, ry, rot, name, cols=('#fff6e4', '#ffe4b8', '#d8a878'), n=160):
    defs = rgrad(u, name, [(0, cols[0], 1), (.12, cols[0], .85), (.35, cols[1], .45), (.7, cols[2], .1), (1, cols[2], 0)])
    d = Dots()
    for _ in range(n):
        r = abs(rnd.gauss(0, .4)); a = rnd.uniform(0, 6.283)
        px, py = rx * r * math.cos(a), ry * r * math.sin(a)
        c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        d.add(x + px * c - py * s_, y + px * s_ + py * c, .5 + .5 * rnd.random() ** 2, rnd.choice(('#fff2d8', '#ffe8c4', '#fffaf0')), .3 + .4 * rnd.random())
    return defs, ('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%s%s)" transform="rotate(%s %s %s)"/>' % (f(x), f(y), f(rx), f(ry), u, name, f(rot), f(x), f(y)) +
                  d.svg() + '<circle cx="%s" cy="%s" r="1.4" fill="#fff"/>' % (f(x), f(y)))


def noise_layer(u, name, freq, seed, col, cut, gain, op=1, octaves=4, box=(0, 0, W, H), transform='', mask='', soft=0):
    """Thresholded fractal noise as a layer of colour: dust, or star clouds, for no bytes."""
    r, g, b = col
    x, y, w, h = box
    return ('<filter id="%s%s" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 %s  0 0 0 0 %s  0 0 0 0 %s  %s 0 0 0 %s"/>%s</filter>'
            '<g%s opacity="%s"><rect x="%d" y="%d" width="%d" height="%d" filter="url(#%s%s)"%s/></g>') % (
        u, name, freq, octaves, seed, '%.3g' % r, '%.3g' % g, '%.3g' % b, f(gain), '%.3g' % (-gain * cut), '<feGaussianBlur stdDeviation="%s"/>' % f(soft) if soft else '',
        ' mask="url(#%s)"' % mask if mask else '', f(op), x, y, w, h, u, name, ' transform="%s"' % transform if transform else '')


# ================================================================= THE MILKY WAY
def milky_way(u):
    rnd = random.Random(2600)
    x0, y0, ang = 262, 470, math.radians(-64)
    ux, uy = math.cos(ang), math.sin(ang)
    nx_, ny_ = -uy, ux

    def B(s_, t_):
        return x0 + s_ * ux + t_ * nx_, y0 + s_ * uy + t_ * ny_

    def wid(s_):
        return 72 + 18 * math.sin(s_ / 140) + 90 * math.exp(-(s_ / 125) ** 2)

    bg_defs = SPIKE_DEFS.format(u=u) + ('<linearGradient id="%shz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050816"/><stop offset=".45" stop-color="#0a1024"/>'
                                         '<stop offset=".7" stop-color="#141a2c"/><stop offset=".8" stop-color="#1e2230"/><stop offset="1" stop-color="#0c0e14"/></linearGradient>'
                                         '<radialGradient id="%sag" cx=".5" cy="1" r=".8"><stop offset="0" stop-color="#3a4a30" stop-opacity=".45"/><stop offset=".5" stop-color="#2a3a3a" stop-opacity=".15"/><stop offset="1" stop-color="#2a3a3a" stop-opacity="0"/></radialGradient>') % (u, u)
    bg = svg(W, H, '<rect width="%d" height="%d" fill="url(#%shz)"/><rect y="420" width="%d" height="%d" fill="url(#%sag)"/>' % (W, H, u, W, H - 420, u) +
             starfield(W, H, 700, 2600, 7, u=u), bg_defs)
    defs = blur(u, 'b2', 2) + blur(u, 'b5', 5) + blur(u, 'b14', 14) + blur(u, 'b30', 30, 60) + blur(u, 'b40', 40, 80) + (
        '<filter id="%scl" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="4" seed="26"/>'
        '<feDisplacementMap in="SourceGraphic" scale="40"/><feGaussianBlur stdDeviation="4"/></filter>'
        '<filter id="%sdst" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".07" numOctaves="4" seed="3"/>'
        '<feDisplacementMap in="SourceGraphic" scale="16"/><feGaussianBlur stdDeviation="1.3"/></filter>') % (u, u)
    defs += soft_defs(u, {'wm': '#ffe2b8', 'or': '#ffc890', 'cr': '#f4ecdc', 'bl': '#c8d4f0', 'mk': '#ffffff', 'rd': '#ff5a78', 'ab': '#ffcf70', 'rb': '#7aa0ff'})
    defs += nebula_defs(u, '#ff4a78', 80)
    o = []
    glow, clouds, mask, cmask = Soft(u), Soft(u), Soft(u), Soft(u)
    for _ in range(170):
        s_ = rnd.uniform(-330, 720); t_ = rnd.gauss(0, wid(s_) * .45)
        x, y = B(s_, t_)
        core = math.exp(-(s_ / 160) ** 2)
        glow.add(x, y, wid(s_) * rnd.uniform(.5, 1.1), 'wm' if core > .4 else rnd.choice(['cr', 'bl', 'cr']), rnd.uniform(.12, .24) * (1 + core))
        mask.add(x, y, wid(s_) * rnd.uniform(.7, 1.2), 'mk', .7)
    for i in range(60):
        s_ = -340 + 1080 * i / 59
        x, y = B(s_, wid(s_) * .05)
        cmask.add(x, y, wid(s_) * .9, 'mk', .9)
    o.append('<g filter="url(#%sb30)">%s</g>' % (u, glow.svg()))
    for _ in range(150):
        s_ = rnd.uniform(-300, 700); t_ = rnd.gauss(0, wid(s_) * .4)
        x, y = B(s_, t_)
        core = math.exp(-(s_ / 140) ** 2)
        clouds.add(x, y, rnd.uniform(12, 34) * (1 + core), rnd.choice(['wm', 'or', 'cr']) if core > .3 else rnd.choice(['cr', 'cr', 'bl', 'wm']), rnd.uniform(.12, .3) * (.7 + core))
    o.append('<g filter="url(#%scl)">%s</g>' % (u, clouds.svg()))
    bx, by = B(0, 6)
    deg = math.degrees(ang)
    defs += rgrad(u, 'blg', [(0, '#fff6e4', .9), (.3, '#ffdca8', .58), (.65, '#e8a868', .18), (1, '#c08050', 0)])
    o.append('<ellipse cx="%s" cy="%s" rx="160" ry="125" fill="url(#%sblg)" transform="rotate(%s %s %s)"/>' % (f(bx), f(by), u, f(deg), f(bx), f(by)))
    defs += ('<mask id="%smb" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><g filter="url(#%sb14)">%s</g></mask>'
             '<mask id="%smc" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><g filter="url(#%sb40)">%s</g></mask>') % (
        u, W, H, u, mask.svg(), u, W, H, u, cmask.svg())
    # the band's frame: noise stretched along the band (the rect is drawn in band coordinates)
    band_tf = 'translate(%s %s) rotate(%s)' % (f(x0), f(y0), f(deg))
    box = (-420, -260, 1240, 520)
    # mottled star clouds
    o.append(noise_layer(u, 'nc', '.006 .02', 7, (1, .95, .86), .52, 3.2, .55, 5, box, band_tf, u + 'mb'))
    # countless stars
    mk = '<g filter="url(#%sb14)">%s</g>' % (u, mask.svg())
    o.append(speckle(u, 'sa', mk, seed=11, freq=1.05, cut=.64, gain=10, col=(1, .96, .9), op=.5))
    o.append(speckle(u, 'sb', mk, seed=23, freq=.7, cut=.7, gain=12, col=(.92, .95, 1), op=.4))
    # dust: the Great Rift and its tributaries, dark river-noise down the spine
    # a faint mottling of dust under everything
    o.append(noise_layer(u, 'nd', '.004 .024', 31, (.035, .026, .022), .5, 5, .55, 6, box, band_tf, u + 'mc', .8))
    # the Sagittarius star cloud: a dense, granular, bright field between the lanes
    scx, scy = B(60, 62)
    defs += rgrad(u, 'sgm', [(0, '#fff', 1), (.5, '#fff', .6), (1, '#fff', 0)])
    defs += rgrad(u, 'sgc', [(0, '#fff4e0', .75), (.5, '#ffe4b8', .35), (1, '#ffe0b0', 0)])
    sg = '<ellipse cx="%s" cy="%s" rx="100" ry="52" transform="rotate(%s %s %s)" fill="url(#%s%%s)"/>' % (f(scx), f(scy), f(deg), f(scx), f(scy), u)
    o.append(sg % 'sgc')
    o.append(speckle(u, 'sg1', sg % 'sgm', seed=5, freq=1.1, cut=.54, gain=9, col=(1, .96, .88), op=1))
    o.append(speckle(u, 'sg2', sg % 'sgm', seed=6, freq=.6, cut=.6, gain=8, col=(1, .98, .94), op=.6))
    sgd = Dots()
    for _ in range(1000):
        r = 60 * abs(rnd.gauss(0, .7)); a_ = rnd.uniform(0, 6.283)
        x, y = B(60 + r * 1.5 * math.cos(a_), 62 + r * .8 * math.sin(a_))
        sgd.add(x, y, .45 + .6 * rnd.random() ** 3, rnd.choice(('#fff8ec', '#ffe8c8', '#ffffff', '#fff0d8')), .45 + .5 * rnd.random())
    o.append(sgd.svg())
    # the Great Rift: forked, branching lanes grown down the band, drawn in three depths
    soft_l, mid_l, crisp_l, rift = [], [], [], []
    budget = [65]

    def grow(s_, t_, head, L, w, depth):
        budget[0] -= 1
        pts = [(s_, t_)]
        n = int(L / 12)
        for i in range(n):
            lim = wid(s_) * .55
            head += rnd.gauss(0, .14) - .15 * head - (.25 * (t_ - math.copysign(lim, t_)) / lim if abs(t_) > lim else 0)
            s_ += 12 * math.cos(head); t_ += 12 * math.sin(head)
            pts.append((s_, t_))
            if depth < 3 and i > 2 and budget[0] > 0 and rnd.random() < .07:
                grow(s_, t_, head + rnd.choice((-1, 1)) * rnd.uniform(.35, .9), L * rnd.uniform(.25, .5), w * rnd.uniform(.4, .65), depth + 1)
        k = max(2, len(pts) // 3)
        for j, seg in enumerate((pts[:k + 1], pts[k:2 * k + 1], pts[2 * k:])):
            if len(seg) < 2:
                continue
            ww = w * (1 - .28 * j)
            rid = '%sr%d' % (u, len(rift))
            rift.append('<path id="%s" d="%s"/>' % (rid, smooth([B(a, b) for a, b in seg])))
            soft_l.append('<use href="#%s" stroke-width="%s" stroke-opacity="%s"/>' % (rid, f(ww * 3.6), f(.2 + .1 * (3 - depth) / 3)))
            mid_l.append('<use href="#%s" stroke-width="%s" stroke-opacity="%s"/>' % (rid, f(ww * 1.7), f(.35 + .15 * rnd.random())))
            if rnd.random() < .7:
                crisp_l.append('<use href="#%s" stroke-width="%s" stroke-opacity="%s"/>' % (rid, f(max(.8, ww * .55)), f(.45 + .35 * rnd.random())))

    for t0, w0, s0, L0 in ((-6, 13, -330, 1100), (24, 8, -220, 820), (-44, 6, -120, 560), (46, 5, 150, 560), (-66, 4, 320, 420)):
        grow(s0, t0, 0, L0, w0, 0)
    for _ in range(18):
        s0 = rnd.uniform(-240, 600); t0 = rnd.gauss(0, wid(s0) * .3)
        grow(s0, t0, rnd.choice((-1, 1)) * rnd.uniform(.15, .5), rnd.uniform(30, 90), rnd.uniform(1.5, 3.5), 2)
    o.append('<g fill="none" stroke="#0c0806" stroke-linecap="round" stroke-linejoin="round" filter="url(#%sb5)">%s</g>' % (u, ''.join(soft_l)))
    o.append('<g fill="none" stroke="#0a0605" stroke-linecap="round" stroke-linejoin="round" filter="url(#%sdst)">%s</g>' % (u, ''.join(mid_l)))
    o.append('<g fill="none" stroke="#070403" stroke-linecap="round" stroke-linejoin="round" filter="url(#%sdsc)">%s</g>' % (u, ''.join(crisp_l)))
    defs += ('<filter id="%sdsc" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="3" seed="9"/>'
             '<feDisplacementMap in="SourceGraphic" scale="9"/><feGaussianBlur stdDeviation=".5"/></filter>') % u + ''.join(rift)
    # the Pipe (stem and bowl) and the Snake, dark against Ophiuchus beside the core
    pipe = [B(30 + 110 * i / 11, -104 - 6 * math.sin(i / 2)) for i in range(12)]
    bx_, by_ = B(150, -112)
    snake = [B(10 + 4 * i, -150 + 7 * math.sin(i / 1.6)) for i in range(12)]
    o.append('<g fill="none" stroke="#0a0605" stroke-linecap="round" filter="url(#%sb5)"><path d="%s" stroke-width="12" stroke-opacity=".45"/></g>' % (u, smooth(pipe, f)))
    o.append('<g fill="none" stroke="#0a0605" stroke-linecap="round" filter="url(#%sdst)"><path d="%s" stroke-width="5" stroke-opacity=".7"/>'
             '<path d="%s" stroke-width="2.2" stroke-opacity=".7"/></g>' % (u, smooth(pipe, f), smooth(snake, f)))
    o.append('<path d="%s" fill="#0a0605" fill-opacity=".55" filter="url(#%sb5)"/>' % (blob(bx_, by_, 26, 20, rnd, 12, .35), u))
    o.append('<path d="%s" fill="#0a0605" fill-opacity=".7" filter="url(#%sdst)"/>' % (blob(bx_, by_, 15, 11, rnd, 10, .4), u))
    # the star cloud glows through, between the lanes
    o.append('<g opacity=".55">%s</g>' % (sg % 'sgc'))
    dots = Dots()
    for _ in range(1500):
        s_ = rnd.uniform(-320, 720); t_ = rnd.gauss(0, wid(s_) * .6)
        x, y = B(s_, t_)
        dots.add(x, y, .45 + 1.1 * rnd.random() ** 4, rnd.choice(('#ffffff', '#fff4e4', '#ffe8cc', '#e8eeff', '#dfe6ff')), .35 + .6 * rnd.random())
    o.append(dots.svg())
    # emission knots: the Lagoon and the Trifid beside the core, the Eagle and Omega up the band, small and red
    em, ed = Soft(u), Dots()
    for (s_, t_, R_) in ((-30, 118, 20), (40, 102, 10), (230, 70, 9), (300, 42, 8), (-150, 90, 7), (470, 60, 6)):
        x, y = B(s_, t_)
        em.add(x, y, R_ * 1.6, 'rd', .45)
        for _ in range(int(R_ * 1.4)):
            em.add(x + rnd.gauss(0, R_ * .5), y + rnd.gauss(0, R_ * .4), R_ * rnd.uniform(.3, .7), rnd.choice(['rd', 'rd', 'wm']), rnd.uniform(.3, .6))
        for _ in range(int(R_)):
            ed.add(x + rnd.gauss(0, R_ * .3), y + rnd.gauss(0, R_ * .3), .6 + .8 * rnd.random() ** 2, rnd.choice(('#ffffff', '#ffd0dc', '#ff9ab4')), .9)
    lx_, ly_ = B(-30, 118)
    o.append('<g filter="url(#%sb2)">%s</g>' % (u, em.svg()) + ed.svg())
    tx, ty = B(40, 102)
    o.append('<circle cx="%s" cy="%s" r="8" fill="url(#%ssrb)" opacity=".55"/>' % (f(tx + 8), f(ty - 9), u))
    # Rho Ophiuchi: gold around Antares, blue around rho Oph, red between
    ax_, ay_ = B(180, -210)
    rh = Soft(u)
    rh.add(ax_, ay_, 40, 'ab', .45)
    rh.add(ax_ + 30, ay_ - 50, 28, 'rb', .4)
    rh.add(ax_ + 12, ay_ - 20, 22, 'rd', .28)
    o.append('<g filter="url(#%sb5)">%s</g>' % (u, rh.svg()))
    o.append(spike_star(ax_, ay_, 2.4, '#ffb070', 16, 1, .9) + spike_star(ax_ + 30, ay_ - 50, 1.6, '#cfe0ff', 10, .9, .7))
    ridge = []
    for i in range(70):
        x = -10 + (W + 20) * i / 69
        y = 668 - 44 * math.exp(-((x - 120) / 90) ** 2) - 30 * math.exp(-((x - 430) / 60) ** 2) - 12 * math.sin(x / 23) + rnd.uniform(-5, 5)
        ridge.append((x, y))
    d = 'M' + 'L'.join('%s %s' % (fi(a), fi(b)) for a, b in ridge)
    defs += '<linearGradient id="%smt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0d16"/><stop offset=".3" stop-color="#05060b"/><stop offset="1" stop-color="#020204"/></linearGradient>' % u
    o.append('<path d="%sL%d %dL-10 %dZ" fill="url(#%smt)"/><path d="%s" fill="none" stroke="#6a78a0" stroke-opacity=".35" stroke-width="1"/>' % (d, W + 20, H + 10, H + 10, u, d))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .12), defs)
    return bg, obj, svg(W, H, top('SAGITTARIUS · SCORPIUS · THE GALACTIC CENTRE 26,000 LY'))


PLATES = {'MILKY-WAY': milky_way, 'M51': m51, 'M101': m101, 'M33': m33, 'M104': m104, 'M82': m82, 'CEN-A': cen_a, 'M87': m87, 'LMC': lmc, 'SMC': smc, 'CARTWHEEL': cartwheel}

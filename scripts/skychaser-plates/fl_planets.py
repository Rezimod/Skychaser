"""First Light, the planets and small worlds: twelve full-art plates at 582 × 832.

Globes are drawn on a real orthographic projection: features are placed in
latitude and longitude, craters are foreshortened on the sphere and lit from
the sun's true direction, and the day side is shaded in Lambert steps.
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL, label, scalebar, reticle
from more import sky, top, spike_star, W, HF

H = HF


def blur(u, name, sd, pad=25):
    return '<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feGaussianBlur stdDeviation="%s"/></filter>' % (u, name, pad, pad, 100 + 2 * pad, 100 + 2 * pad, f(sd))


def tint_noise(u, name, freq, octaves, seed, rgb, k=1.6, b=-.4, pad=0):
    """Fractal noise as a single colour whose alpha follows the noise."""
    r, g, bl = (int(rgb[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return ('<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 %.3f  0 0 0 0 %.3f  0 0 0 0 %.3f  %s 0 0 0 %s"/><feComposite in2="SourceGraphic" operator="in"/></filter>') % (
        u, name, pad, pad, 100 + 2 * pad, 100 + 2 * pad, freq, octaves, seed, r, g, bl, f(k), f(b))


def grey_noise(u, name, freq, octaves, seed):
    return ('<filter id="%s%s" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d"/>'
            '<feColorMatrix type="saturate" values="0"/><feComposite in2="SourceGraphic" operator="in"/></filter>') % (u, name, freq, octaves, seed)


def rough(u, name, freq, scale, seed, sd=0, pad=20):
    """Displaces a shape's edges: turns clean blobs into ragged terrain."""
    return ('<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="3" seed="%d"/>'
            '<feDisplacementMap in="SourceGraphic" scale="%s" xChannelSelector="R" yChannelSelector="G"/>%s</filter>') % (
        u, name, pad, pad, 100 + 2 * pad, 100 + 2 * pad, freq, seed, f(scale), '<feGaussianBlur stdDeviation="%s"/>' % f(sd) if sd else '')


def rect_fill(x, y, w, h, filt, op, blend=None, u=''):
    return '<rect x="%s" y="%s" width="%s" height="%s" filter="url(#%s%s)" opacity="%s"%s/>' % (
        f(x), f(y), f(w), f(h), u, filt, f(op), ' style="mix-blend-mode: %s"' % blend if blend else '')


def norm(v):
    L = math.sqrt(sum(c * c for c in v))
    return tuple(c / L for c in v)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


class Globe:
    """An orthographic globe. View space: x right, y up, z toward the viewer.
    lat0/lon0 is the sub-viewer point, rot turns the whole globe on the page (degrees, clockwise),
    sun is the direction to the sun in view space."""

    def __init__(s, cx, cy, R, lat0=0, lon0=0, rot=0, sun=(-1, 0, 0)):
        s.cx, s.cy, s.R = cx, cy, R
        s.la0, s.lo0 = math.radians(lat0), math.radians(lon0)
        s.rot = math.radians(rot)
        s.S = norm(sun)

    def v(s, lat, lon):
        la, d = math.radians(lat), math.radians(lon) - s.lo0
        x = math.cos(la) * math.sin(d)
        y = math.cos(s.la0) * math.sin(la) - math.sin(s.la0) * math.cos(la) * math.cos(d)
        z = math.sin(s.la0) * math.sin(la) + math.cos(s.la0) * math.cos(la) * math.cos(d)
        c, sn = math.cos(-s.rot), math.sin(-s.rot)
        return (x * c - y * sn, x * sn + y * c, z)

    def xy(s, p):
        return s.cx + s.R * p[0], s.cy - s.R * p[1]

    def P(s, lat, lon):
        return s.xy(s.v(lat, lon))

    def poly(s, pts):
        out = []
        for la, lo in pts:
            p = s.v(la, lo)
            if p[2] < 0:
                k = math.hypot(p[0], p[1]) or 1
                p = (p[0] / k, p[1] / k, 0)
            out.append(s.xy(p))
        return 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in out) + 'Z'

    def line(s, pts):
        segs, cur = [], []
        for la, lo in pts:
            p = s.v(la, lo)
            if p[2] < .02:
                if len(cur) > 1: segs.append(cur)
                cur = []
                continue
            cur.append(s.xy(p))
        if len(cur) > 1: segs.append(cur)
        return ''.join('M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in c) for c in segs)

    def sblob(s, lat, lon, rlat, rlon, rnd, n=16, j=.25):
        pts = []
        for i in range(n):
            a = 2 * math.pi * i / n; k = 1 + rnd.uniform(-j, j)
            pts.append((lat + rlat * k * math.sin(a), lon + rlon * k * math.cos(a) / max(.2, math.cos(math.radians(lat)))))
        return s.poly(pts)

    def frame(s, lat, lon):
        """(matrix, sun in the local east/north plane, cos incidence, z) for a small feature at lat, lon."""
        p = s.v(lat, lon)
        e = norm(tuple(a - b for a, b in zip(s.v(lat, lon + .5), s.v(lat, lon - .5))))
        n = norm(tuple(a - b for a, b in zip(s.v(min(89.9, lat + .5), lon), s.v(max(-89.9, lat - .5), lon))))
        X, Y = s.xy(p)
        m = 'matrix(%.3f %.3f %.3f %.3f %s %s)' % (e[0], -e[1], n[0], -n[1], f(X), f(Y))
        se, sn_ = dot(s.S, e), dot(s.S, n)
        k = math.hypot(se, sn_) or 1
        # local drawing space has y down, so north is -y
        return m, (se / k, -sn_ / k), dot(s.S, p), p[2]

    def region(s, c, dark=True):
        """Polygon of the visible hemisphere where S·v < c (dark=True) or >= c."""
        S = s.S
        A = norm(cross(S, (0, 0, 1))) if abs(S[2]) < .999 else (1, 0, 0)
        B = cross(S, A)
        q = math.sqrt(max(0, 1 - c * c))
        pts = []
        for i in range(96):
            t = 2 * math.pi * i / 96
            p = tuple(c * S[k] + q * (math.cos(t) * A[k] + math.sin(t) * B[k]) for k in range(3))
            if p[2] >= 0: pts.append(p)
        for i in range(128):
            t = 2 * math.pi * i / 128
            p = (math.cos(t), math.sin(t), 0)
            if (dot(p, S) < c) == dark: pts.append(p)
        if len(pts) < 3: return ''
        mx = sum(p[0] for p in pts) / len(pts); my = sum(p[1] for p in pts) / len(pts)
        pts.sort(key=lambda p: math.atan2(p[1] - my, p[0] - mx))
        return 'M' + 'L'.join('%s %s' % tuple(f(v) for v in s.xy(p)) for p in pts) + 'Z'

    def shade(s, u, amb=.16, gamma=1., night=.96, col='#020307', filt='bsh'):
        """Lambert shading in steps, softened by a blur filter the caller defines as <u><filt>."""
        levels = [.92, .8, .66, .52, .38, .25, .13, .04]
        T = lambda c: amb + (1 - amb) * max(0, c) ** gamma
        out, prev = [], 1.
        circle = 'M%s %sa%s %s 0 1 0 %s 0a%s %s 0 1 0 %s 0Z' % (f(s.cx - s.R), f(s.cy), f(s.R), f(s.R), f(2 * s.R), f(s.R), f(s.R), f(-2 * s.R))
        for c in levels:
            t = T(c - .07)
            op = 1 - t / prev; prev = t
            if s.S[2] >= 0:
                lit = s.region(c, dark=False)
                d = circle + lit if lit else circle
                out.append('<path d="%s" fill="%s" fill-rule="evenodd" opacity="%s"/>' % (d, col, f(op)))
            else:
                d = s.region(c, dark=True)
                if d: out.append('<path d="%s" fill="%s" opacity="%s"/>' % (d, col, f(op)))
        # night side
        if s.S[2] >= 0:
            lit = s.region(0, dark=False)
            out.append('<path d="%s" fill="%s" fill-rule="evenodd" opacity="%s"/>' % (circle + lit, col, f(night)))
        else:
            out.append('<path d="%s" fill="%s" opacity="%s"/>' % (s.region(0, dark=True), col, f(night)))
        return '<g filter="url(#%s%s)">%s</g>' % (u, filt, ''.join(out))

    def crater(s, lat, lon, r, pal, fresh=0, night_ok=False, depth=1., op=1.):
        """A bowl crater r px across at disc centre, foreshortened and lit. pal = (shadow, lit wall, floor, rim, ejecta)."""
        m, (sx, sy), ci, z = s.frame(lat, lon)
        if z < .06 or (ci < .01 and not night_ok): return ''
        ci = max(ci, .02)
        l = min(1.9, .16 * depth / ci)          # shadow length, in radii
        d1 = r * min(.2, (.05 + .04 / ci) * depth ** .5)   # width of the lit crescent
        rf = r * max(0, .66 - .42 * l)
        sh = min(1, max(.35, 1.25 - ci))        # shadow depth: faint under a high sun
        o = []
        if r < 3.2:
            o.append('<circle r="%s" fill="%s"/><circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(r), pal[1], f(sx * d1), f(sy * d1), f(r - d1), pal[0], f(sh)))
            return '<g transform="%s"%s>%s</g>' % (m, ' opacity="%s"' % f(op) if op < 1 else '', ''.join(o))
        if fresh:
            o.append('<circle r="%s" fill="%s" opacity="%s"/>' % (f(r * 2.1), pal[4], f(.14 * fresh)))
        o.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(-sx * r * .1 * min(l, 1)), f(-sy * r * .1 * min(l, 1)), f(r * 1.12), pal[0], f(.5 * sh)))
        o.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity=".5"/>' % (f(sx * r * .09), f(sy * r * .09), f(r * 1.06), pal[3]))
        o.append('<circle r="%s" fill="%s"/>' % (f(r), pal[1]))
        o.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(sx * d1), f(sy * d1), f(r - d1), pal[0], f(sh)))
        if rf > .6:
            off = r - 2 * d1 - rf - .5
            o.append('<circle cx="%s" cy="%s" r="%s" fill="%s"/>' % (f(-sx * off), f(-sy * off), f(rf), pal[2]))
        return '<g transform="%s"%s>%s</g>' % (m, ' opacity="%s"' % f(op) if op < 1 else '', ''.join(o))

    def hill(s, lat, lon, r, pal, elong=1., ang=0):
        """A massif: lit toward the sun, shadow thrown away from it. pal = (shadow, lit, body)."""
        m, (sx, sy), ci, z = s.frame(lat, lon)
        if z < .06 or ci < .01: return ''
        l = min(3, .2 / max(ci, .03))
        rx, ry = r * elong, r
        return ('<g transform="%s"><ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity=".7" transform="rotate(%s)"/>'
                '<ellipse rx="%s" ry="%s" fill="%s" transform="rotate(%s)"/><ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity=".85" transform="rotate(%s)"/></g>') % (
            m, f(-sx * r * l * .6), f(-sy * r * l * .6), f(rx * (1 + l * .3)), f(ry), pal[0], f(ang),
            f(rx), f(ry), pal[2], f(ang), f(sx * r * .3), f(sy * r * .3), f(rx * .6), f(ry * .6), pal[1], f(ang))

    def disc(s):
        return '<circle cx="%s" cy="%s" r="%s"' % (f(s.cx), f(s.cy), f(s.R))


def clip_defs(u, g, name='disk'):
    return '<clipPath id="%s%s"><circle cx="%s" cy="%s" r="%s"/></clipPath>' % (u, name, f(g.cx), f(g.cy), f(g.R))


def radial(u, name, stops, cx='.5', cy='.5', r='.5', fx=None, fy=None):
    fo = ' fx="%s" fy="%s"' % (fx, fy) if fx is not None else ''
    return '<radialGradient id="%s%s" cx="%s" cy="%s" r="%s"%s>%s</radialGradient>' % (
        u, name, cx, cy, r, fo, ''.join('<stop offset="%s" stop-color="%s"%s/>' % (o, c, ' stop-opacity="%s"' % a if a != 1 else '') for o, c, a in stops))


def linear(u, name, stops, x1=0, y1=0, x2=0, y2=1):
    return '<linearGradient id="%s%s" x1="%s" y1="%s" x2="%s" y2="%s">%s</linearGradient>' % (
        u, name, f(x1), f(y1), f(x2), f(y2), ''.join('<stop offset="%s" stop-color="%s"%s/>' % (o, c, ' stop-opacity="%s"' % a if a != 1 else '') for o, c, a in stops))


def limb_dark(u, name, k=(.62, .25, .6), col='#000'):
    return radial(u, name, [('0', col, 0), (f(k[0]), col, 0), ('.9', col, k[1]), ('1', col, k[2])])


def lit_rim(g, u, col, width, op, sd_name, spread=60):
    """A glowing arc on the sunward limb."""
    a = math.atan2(-g.S[1], g.S[0])
    sp = math.radians(spread + 90 * max(0, -g.S[2]) + 90 * (1 - abs(g.S[2])) * 0)
    x0, y0 = g.cx + g.R * math.cos(a - sp), g.cy + g.R * math.sin(a - sp)
    x1, y1 = g.cx + g.R * math.cos(a + sp), g.cy + g.R * math.sin(a + sp)
    return '<path d="M%s %sA%s %s 0 %d 1 %s %s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="%s" stroke-linecap="round" filter="url(#%s%s)"/>' % (
        f(x0), f(y0), f(g.R), f(g.R), 1 if sp > math.pi / 2 else 0, f(x1), f(y1), col, f(width), f(op), u, sd_name)


# ================================================================= THE SUN
def sun(u):
    """The Sun in hydrogen-alpha: a mottled chromosphere, dark filaments, two active regions, prominences over the limb."""
    cx, cy, R = 291, 352, 188
    rnd = random.Random(1611)
    g = Globe(cx, cy, R, 7, 0, 0, (0, 0, 1))
    bg = sky(u, H, ('#170804', '#0a0403', '#030102'), 90, 1611, 1, tints=('#ffe8d8', '#ffffff', '#ffd8c0'), cy='.42')
    defs = (clip_defs(u, g) +
            radial(u, 'base', [('0', '#ffa640', 1), ('.45', '#f5842c', 1), ('.78', '#dc5a1e', 1), ('.93', '#b83c12', 1), ('1', '#842408', 1)]) +
            radial(u, 'cor', [('0', '#ffb070', .5), ('.46', '#ff9a58', .32), ('.56', '#ff8a4a', .1), ('.75', '#e86a3a', .03), ('1', '#e86a3a', 0)]) +
            radial(u, 'chr', [('.9', '#ff5a1e', 0), ('.965', '#ff6a2a', .75), ('.985', '#ffa060', .55), ('1', '#ff6a2a', 0)]) +
            radial(u, 'umb', [('0', '#120201', 1), ('.5', '#2a0703', 1), ('.62', '#6a1a08', .95), ('1', '#a8380f', 0)]) +
            radial(u, 'plg', [('0', '#ffd27a', .85), ('.5', '#ffb050', .4), ('1', '#ff9a40', 0)]) +
            tint_noise(u, 'mot', '.07', 4, 17, '#4a0e02', 2.6, -1.05) +
            tint_noise(u, 'net', '.028', 4, 23, '#ffb24a', 3.2, -1.7) +
            tint_noise(u, 'fine', '.2', 2, 29, '#ffc070', 2.4, -1.2) +
            grey_noise(u, 'gr', '.5', 2, 31) +
            rough(u, 'fil', '.06', 9, 5, 1.5) + rough(u, 'pr', '.05', 7, 9, .35, 40) + rough(u, 'prw', '.03', 14, 12, 3, 50) +
            blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b8', 8, 40) + blur(u, 'b22', 22, 60))
    o = []
    # the faint corona and a few streamers, then the chromosphere's own glow
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%scor)"/>' % (cx, cy, R * 2.3, u))
    st = []
    for a, L, wd in [(-148, 2.1, .2), (-38, 1.9, .16), (22, 2.3, .22), (148, 1.8, .18), (200, 2.0, .14), (95, 1.5, .1), (-95, 1.6, .12)]:
        t = math.radians(a)
        x0, y0 = cx + R * math.cos(t), cy + R * math.sin(t)
        x1, y1 = cx + R * L * math.cos(t), cy + R * L * math.sin(t)
        nx, ny = -math.sin(t), math.cos(t)
        w0 = R * wd
        st.append('<path d="M%s %sQ%s %s %s %sQ%s %s %s %sZ" fill="#ffd8b8" opacity=".06"/>' % (
            f(x0 + nx * w0), f(y0 + ny * w0), f((x0 + x1) / 2 + nx * w0 * .5), f((y0 + y1) / 2 + ny * w0 * .5), f(x1), f(y1),
            f((x0 + x1) / 2 - nx * w0 * .5), f((y0 + y1) / 2 - ny * w0 * .5), f(x0 - nx * w0), f(y0 - ny * w0)))
    o.append('<g filter="url(#%sb22)">%s</g>' % (u, ''.join(st)))
    o.append('<circle cx="%d" cy="%d" r="%s" fill="url(#%schr)"/>' % (cx, cy, f(R * 1.035), u))

    # prominences: strands of plasma along magnetic loops, drawn in hot orange with a soft glow under them
    def strands(a0, a1, hgt, n, lean=0., cols=('#ff5a22', '#ff7a36', '#ff9a52', '#ffb070', '#ff6a2a', '#e8481c'), wmax=3.2, spread=.35):
        out = []
        for _ in range(n):
            b0 = math.radians(a0 + rnd.uniform(-4, 4)); b1 = math.radians(a1 + rnd.uniform(-4, 4))
            h = hgt * rnd.uniform(1 - spread, 1 + spread * .3)
            p0 = (cx + R * .985 * math.cos(b0), cy + R * .985 * math.sin(b0)); p3 = (cx + R * .985 * math.cos(b1), cy + R * .985 * math.sin(b1))
            bm0 = b0 + (b1 - b0) * (.2 + lean) + rnd.uniform(-.05, .05); bm1 = b0 + (b1 - b0) * (.8 + lean) + rnd.uniform(-.05, .05)
            p1 = (cx + (R + h * 1.3) * math.cos(bm0), cy + (R + h * 1.3) * math.sin(bm0)); p2 = (cx + (R + h * 1.3) * math.cos(bm1), cy + (R + h * 1.3) * math.sin(bm1))
            out.append('<path d="M%s %sC%s %s %s %s %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
                f(p0[0]), f(p0[1]), f(p1[0]), f(p1[1]), f(p2[0]), f(p2[1]), f(p3[0]), f(p3[1]), rnd.choice(cols), f(rnd.uniform(.3, .85)), f(rnd.uniform(.4, wmax))))
        return ''.join(out)

    def plume(a, hgt, wid, n):
        """A hedgerow of rising, curling threads."""
        out = []
        for _ in range(n):
            b = math.radians(a + rnd.uniform(-wid, wid))
            r0 = R * .99; h = hgt * rnd.uniform(.35, 1)
            x, y = cx + r0 * math.cos(b), cy + r0 * math.sin(b)
            nx, ny = math.cos(b), math.sin(b); tx, ty = -ny, nx
            curl = rnd.uniform(-.5, .5) * h
            d = 'M%s %sC%s %s %s %s %s %s' % (f(x), f(y), f(x + nx * h * .4 + tx * curl * .2), f(y + ny * h * .4 + ty * curl * .2),
                                              f(x + nx * h * .8 + tx * curl), f(y + ny * h * .8 + ty * curl), f(x + nx * h + tx * curl * .6), f(y + ny * h + ty * curl * .6))
            out.append('<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
                d, rnd.choice(['#ff5a22', '#ff8a44', '#ffb070', '#ff6a2a']), f(rnd.uniform(.3, .85)), f(rnd.uniform(.6, 2.6))))
        return ''.join(out)

    loops = strands(-158, -112, 118, 46, 0, wmax=2.2) + strands(-150, -122, 74, 24, .05, wmax=1.8) + strands(-146, -128, 42, 12, wmax=1.6)
    arch = strands(-62, -36, 58, 22, 0, spread=.4, wmax=1.8) + strands(-58, -42, 34, 10, wmax=1.5)
    hedge = plume(14, 74, 7, 44) + plume(22, 44, 5, 18)
    spark = ''.join(plume(a, rnd.uniform(14, 30), 3, 6) for a in (60, 84, 118, 136, 172, 196, 250, 272, 300))
    cloud = '' and ''.join('<path d="M%s %sq%s %s %s %s" fill="none" stroke="#ff6a2a" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (f(cx + (R + 64) * math.cos(math.radians(158)) + rnd.uniform(-26, 20)), f(cy + (R + 64) * math.sin(math.radians(158)) + rnd.uniform(-12, 12)), f(rnd.uniform(-8, 8)), f(rnd.uniform(-10, 4)), f(rnd.uniform(-30, 30)), f(rnd.uniform(-8, 8)), f(rnd.uniform(.2, .5)), f(rnd.uniform(.6, 2))) for _ in range(26))
    allp = loops + arch + hedge + spark
    defs += '<g id="%sprom">%s</g>' % (u, allp)
    o.append('<use href="#%sprom" filter="url(#%sb8)"/>' % (u, u))
    o.append('<use href="#%sprom" filter="url(#%sprw)" opacity=".55"/>' % (u, u))
    o.append('<use href="#%sprom" filter="url(#%spr)"/>' % (u, u))

    # the disc
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
         rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'mot', .75, 'multiply', u),
         rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'net', .3, 'screen', u),
         rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'fine', .3, 'screen', u),
         rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'gr', .14, 'overlay', u)]
    # plage around the two active regions
    ars = [(18, -28, 1.0), (-14, 34, .8)]
    pl = []
    for la, lo, k in ars:
        for _ in range(14):
            X, Y = g.P(la + rnd.gauss(0, 4), lo + rnd.gauss(0, 7))
            pl.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%splg)" opacity="%s"/>' % (f(X), f(Y), f(rnd.uniform(10, 26) * k), f(rnd.uniform(6, 16) * k), u, f(rnd.uniform(.5, .9))))
    b.append('<g style="mix-blend-mode: screen">%s</g>' % ''.join(pl))
    # filaments: long dark threads snaking over the disc, fibrils alongside
    fl = []
    for la, lo, ang, L, w in [(34, -58, 15, 60, 4), (-26, -20, -20, 70, 3.4), (42, 22, 30, 40, 3), (-8, 58, 70, 44, 3.2), (-40, 36, -5, 34, 2.6), (8, -70, 80, 30, 2.4), (58, -10, 5, 30, 2.2), (-52, -48, 20, 26, 2.2)]:
        pts = []; a = math.radians(ang); la_, lo_ = la, lo
        for i in range(16):
            pts.append((la_, lo_))
            a += rnd.uniform(-.35, .35)
            la_ += L / 15 * math.sin(a); lo_ += L / 15 * math.cos(a)
        d = g.line(pts)
        fl.append('<path d="%s" fill="none" stroke="#3a0802" stroke-width="%s" stroke-opacity=".8" stroke-linecap="round" stroke-linejoin="round"/>' % (d, f(w)))
        fl.append('<path d="%s" fill="none" stroke="#6a1604" stroke-width="%s" stroke-opacity=".3" stroke-linecap="round"/>' % (d, f(w * 3.4)))
    b.append('<g filter="url(#%sfil)">%s</g>' % (u, ''.join(fl)))
    # sunspots: dark umbrae, fibrous penumbrae, the whorl of superpenumbral fibrils round the leaders
    sp = []
    for la, lo, k in ars:
        spots = [(0, 0, 13 * k), (1.5, -7, 8 * k), (-2.5, 9, 10 * k), (3, 13, 5 * k)] + [(rnd.gauss(0, 3), rnd.gauss(3, 8), rnd.uniform(1.4, 3.2)) for _ in range(9)]
        for dla, dlo, r in spots:
            m, _, _, z = g.frame(la + dla, lo + dlo)
            fib = ''
            if r > 6:
                for i in range(26):
                    t = 2 * math.pi * i / 26 + rnd.uniform(-.05, .05); r1 = r * rnd.uniform(1.8, 2.8)
                    fib += '<path d="M%s %sQ%s %s %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
                        f(r * .55 * math.cos(t)), f(r * .55 * math.sin(t)), f(r * 1.4 * math.cos(t + .25)), f(r * 1.4 * math.sin(t + .25)), f(r1 * math.cos(t + .5)), f(r1 * math.sin(t + .5)),
                        rnd.choice(['#4a0e04', '#7a2208', '#ffb060']), f(rnd.uniform(.25, .6)), f(rnd.uniform(.5, 1.3)))
            sp.append('<g transform="%s">%s<circle r="%s" fill="#7a1e08" opacity=".7"/><circle r="%s" fill="url(#%sumb)"/></g>' % (m, fib, f(r * 1.05), f(r * 1.1), u))
    b.append('<g filter="url(#%sb1)">%s</g>' % (u, ''.join(sp)))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimbd)"/>' % (cx, cy, R, u))
    defs += limb_dark(u, 'limbd', (.55, .3, .62), '#3a0802')
    o.append('<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)))
    # spicules: a fine bristle round the whole limb
    spc = ''.join('<path d="M%s %sL%s %s" stroke="#ff8a44" stroke-opacity="%s" stroke-width="%s"/>' % (
        f(cx + R * math.cos(t)), f(cy + R * math.sin(t)), f(cx + (R + h) * math.cos(t + .004)), f(cy + (R + h) * math.sin(t + .004)), f(rnd.uniform(.2, .6)), f(rnd.uniform(.6, 1.4)))
        for t, h in ((rnd.uniform(0, 2 * math.pi), rnd.uniform(3, 9)) for _ in range(220)))
    o.append('<g filter="url(#%sb1)">%s</g>' % (u, spc))
    o.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#ffb070" stroke-opacity=".5" stroke-width="1.2"/>' % (cx, cy, f(R + .6)))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('H-ALPHA 656.3 NM · CHROMOSPHERE'), scalebar(22, 800, 100000 / 696000 * R, '100,000 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= MERCURY
def mercury(u):
    """Mercury at dichotomy: grey, crater on crater, the Caloris basin catching the last light on the terminator."""
    cx, cy, R = 291, 346, 206
    rnd = random.Random(1974)
    g = Globe(cx, cy, R, 4, 0, 0, (-1, .06, .03))
    bg = sky(u, H, ('#11131a', '#07080d', '#020204'), 230, 1974, 3, extra='<circle cx="-40" cy="120" r="340" fill="url(#%sglare)"/>' % u,
             extra_defs=radial(u, 'glare', [('0', '#fff4e0', .32), ('.3', '#ffe8c8', .09), ('1', '#ffe8c8', 0)]))
    defs = (clip_defs(u, g) +
            radial(u, 'base', [('0', '#b9b3aa', 1), ('.6', '#a19b93', 1), ('1', '#7e7973', 1)], cx='.3', cy='.45', r='.8') +
            tint_noise(u, 'n1', '.012', 5, 41, '#3c3a38', 2, -.7) + tint_noise(u, 'n2', '.05', 4, 43, '#e8e2d6', 2.2, -1.1) +
            grey_noise(u, 'n3', '.22', 2, 45) + rough(u, 'rg', '.05', 10, 3, 1.2) + blur(u, 'b05', .45, 5) +
            blur(u, 'bsh', 5, 5) + blur(u, 'b1', .7, 5) + blur(u, 'b4', 4))
    pal = ('#2c2a28', '#e2ddd3', '#9d978e', '#d4cec4', '#f2eee6')
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
         rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n1', .75, 'multiply', u),
         rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n2', .5, 'screen', u)]
    # smooth plains, a touch darker and browner
    pl = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (g.sblob(la, lo, rl, ro, rnd, 16, .35), c, f(op)) for la, lo, rl, ro, c, op in [
        (58, -40, 18, 36, '#8a8478', .5), (-20, -60, 14, 14, '#6e6a64', .45), (10, -80, 10, 10, '#77736c', .4), (-44, -24, 12, 18, '#827c72', .4)])
    b.append('<g filter="url(#%srg)">%s</g>' % (u, pl))
    # Caloris: 1,550 km, just on the day side of the terminator — pale floor, a ring of mountains, fractured
    cla, clo = 26, -15
    b.append('<path d="%s" fill="#c8b69a" opacity=".55" filter="url(#%srg)"/>' % (g.sblob(cla, clo, 16, 16, rnd, 22, .06), u))
    m, (sx, sy), ci, z = g.frame(cla, clo)
    frac = []
    for i in range(46):
        t = rnd.uniform(0, 2 * math.pi); r0 = rnd.uniform(.1, .7); r1 = r0 + rnd.uniform(.1, .3)
        rr_ = 16 / 180 * math.pi * R
        frac.append('M%s %sL%s %s' % (f(rr_ * r0 * math.cos(t)), f(rr_ * r0 * math.sin(t)), f(rr_ * r1 * math.cos(t + .05)), f(rr_ * r1 * math.sin(t + .05))))
    for k in (.35, .5, .66):
        frac.append('M%s 0a%s %s 0 1 0 %s 0a%s %s 0 1 0 %s 0' % (f(-k * 57), f(k * 57), f(k * 57), f(k * 114), f(k * 57), f(k * 57), f(-k * 114)))
    b.append('<g transform="%s"><path d="%s" fill="none" stroke="#5a544c" stroke-opacity=".25" stroke-width=".8" stroke-dasharray="6 3 2 3"/></g>' % (m, ''.join(frac)))
    rb = 16 / 57.3 * R
    b.append('<g transform="%s" filter="url(#%sb4)"><path d="M%s 0a%s %s 0 1 0 %s 0a%s %s 0 1 0 %s 0ZM%s %sa%s %s 0 1 1 %s 0a%s %s 0 1 1 %s 0Z" fill="#1a1814" fill-rule="evenodd" opacity=".55"/>'
             '<path d="M%s 0a%s %s 0 1 0 %s 0a%s %s 0 1 0 %s 0ZM%s %sa%s %s 0 1 1 %s 0a%s %s 0 1 1 %s 0Z" fill="#f4ecdc" fill-rule="evenodd" opacity=".45"/></g>' % (
                 m, u, f(-rb), f(rb), f(rb), f(2 * rb), f(rb), f(rb), f(-2 * rb), f(-rb * .92 - sx * rb * .16), f(-sy * rb * .16), f(rb * .92), f(rb * .92), f(1.84 * rb), f(rb * .92), f(rb * .92), f(-1.84 * rb),
                 f(-rb * .95), f(rb * .95), f(rb * .95), f(1.9 * rb), f(rb * .95), f(rb * .95), f(-1.9 * rb), f(-rb * .95 + sx * rb * .08), f(sy * rb * .08), f(rb * .95), f(rb * .95), f(1.9 * rb), f(rb * .95), f(rb * .95), f(-1.9 * rb)))
    hills = []
    for i in range(110):
        t = rnd.uniform(0, 2 * math.pi)
        rk = 16.4 + rnd.gauss(0, 1.1)
        la = cla + rk * math.sin(t); lo = clo + rk * math.cos(t) / math.cos(math.radians(cla))
        hills.append(g.hill(la, lo, rnd.uniform(1.2, 3.2), ('#1c1a16', '#f2ebdd', '#a39b8e'), rnd.uniform(1, 1.8), math.degrees(t) + 90))
    b.append('<g opacity=".8" filter="url(#%sb05)">%s</g>' % (u, ''.join(hills)))
    # darker low-reflectance material and brighter tan plains
    lrm = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (g.sblob(rnd.uniform(-70, 70), rnd.uniform(-90, 5), rnd.uniform(6, 16), rnd.uniform(6, 20), rnd, 14, .4), rnd.choice(['#5e626a', '#6a6e76', '#c8bca8', '#b8ae9c']), f(rnd.uniform(.18, .32))) for _ in range(16))
    b.append('<g filter="url(#%srg)">%s</g>' % (u, lrm))
    # rays from the young craters
    rays = []
    for la, lo, n, L in [(-40, -52, 26, 38), (10, -48, 18, 22), (-60, -20, 14, 20), (40, -70, 12, 16)]:
        X, Y = g.P(la, lo)
        for _ in range(n):
            t = rnd.uniform(0, 2 * math.pi); ll = rnd.uniform(.3, 1) * L
            pts = [(la + ll * k / 6 * math.sin(t), lo + ll * k / 6 * math.cos(t)) for k in range(7)]
            rays.append('<path d="%s" fill="none" stroke="#f6f2ea" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (g.line(pts), f(rnd.uniform(.1, .3)), f(rnd.uniform(.8, 2.6))))
    b.append('<g filter="url(#%sb1)">%s</g>' % (u, ''.join(rays)))
    # craters: a power law of sizes, craters inside craters
    cr = []
    for la, lo, r in [(-40, -52, 7, ), (10, -48, 5), (-60, -20, 5), (40, -70, 4)]:
        cr.append(g.crater(la, lo, r, ('#2c2a28', '#fbf8f2', '#d8d2c6', '#ffffff', '#ffffff'), 1))
    for la, lo, r in [(-8, -30, 24), (-30, -8, 18), (48, -32, 15), (-54, -62, 20), (4, -72, 16), (-18, -4, 12), (66, -8, 12), (22, -60, 10), (-70, -40, 13), (-34, -76, 10), (6, -10, 9), (78, -60, 10)]:
        cr.append(g.crater(la, lo, r, pal))
        for _ in range(2):
            cr.append(g.crater(la + rnd.uniform(-5, 5), lo + rnd.uniform(-5, 5), r * rnd.uniform(.15, .3), pal))
    n = 0
    while n < 300:
        la, lo = math.degrees(math.asin(rnd.uniform(-1, 1))), rnd.uniform(-95, 12)
        if (la - cla) ** 2 + ((lo - clo) * .9) ** 2 < 15 ** 2 and rnd.random() > .15: continue
        c = g.crater(la, lo, 1 + 9 * rnd.random() ** 3.2, pal)
        if c: cr.append(c); n += 1
        else: n += .2
    b.append('<g filter="url(#%sb05)">%s</g>' % (u, ''.join(cr)))
    # lobate scarps: long cliffs, their faces lit, their feet in shadow
    for pts in ([(-12 + k * 4, -40 + 4 * math.sin(k * .45)) for k in range(11)], [(-50 + k * 3, -8 - k * 2.2) for k in range(9)]):
        d = g.line(pts)
        b.append('<path d="%s" fill="none" stroke="#24221e" stroke-width="5" stroke-opacity=".28" transform="translate(3 0)" filter="url(#%sb1)"/><path d="%s" fill="none" stroke="#f2ede4" stroke-width="1.2" stroke-opacity=".35" filter="url(#%sb05)"/>' % (d, u, d, u))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n3', .16, 'overlay', u))
    b.append(g.shade(u, amb=.1, gamma=.85, night=.985, col='#010102'))
    defs += limb_dark(u, 'limbd', (.7, .18, .45))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimbd)"/>' % (cx, cy, R, u))
    obj = svg(W, H, '<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)) + lit_rim(g, u, '#fffaf0', 1.2, .5, 'b1', 80) + grain(u + 'o', W, H, .12), defs)
    ann = [top('DICHOTOMY · 50% LIT · CALORIS ON THE TERMINATOR'), scalebar(22, 800, 1000 / 2440 * R, '1,000 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= VENUS
def venus(u):
    """Venus gibbous: a sealed deck of sulfuric-acid cloud, faint ultraviolet chevrons, a bright thick-air rim."""
    cx, cy, R = 291, 348, 198
    rnd = random.Random(1761)
    g = Globe(cx, cy, R, 0, 0, -12, (-.78, .22, .58))
    bg = sky(u, H, ('#1c1712', '#0b0907', '#030304'), 190, 1761, 4, extra='<circle cx="%d" cy="%d" r="%d" fill="url(#%shalo)"/>' % (cx - 30, cy - 10, R + 120, u),
             extra_defs=radial(u, 'halo', [('.55', '#ffe8b8', .2), ('.75', '#ffe0a8', .07), ('1', '#ffe0a8', 0)]))
    defs = (clip_defs(u, g) +
            radial(u, 'base', [('0', '#fffaea', 1), ('.4', '#f8ecc8', 1), ('.75', '#ecd6a2', 1), ('1', '#d8b87c', 1)], cx='.36', cy='.4', r='.8') +
            tint_noise(u, 'n1', '.008 .035', 4, 51, '#b89458', 1.5, -.55, 5) + tint_noise(u, 'n2', '.012 .05', 3, 53, '#fffdf4', 2, -.8, 5) +
            rough(u, 'sw', '.01 .04', 16, 57, 6.5, 30) + blur(u, 'b6', 6) + blur(u, 'b2', 2) +
            blur(u, 'bsh', 12, 10) + blur(u, 'b3', 3, 40) + blur(u, 'b14', 14, 60) +
            radial(u, 'rim', [('.86', '#fff6de', 0), ('.97', '#fff4d8', .55), ('1', '#fffaf0', .9)]))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u)]
    # the ultraviolet pattern: a dark equatorial stem splitting into two arms that sweep poleward — a Y on its side
    ch = []
    # latitude of a cloud streak b0 at longitude lo: the streaks run level across the stem, then peel poleward
    def band(b0, split=-5, k=.6):
        pts = []
        for i in range(30):
            lo = -95 + i * 6.5
            lat = b0 + (1 if b0 >= 0 else -1) * max(0, split - lo) * k * (.4 + abs(b0) / 30)
            pts.append((max(-84, min(84, lat + 1.6 * math.sin(i * .8 + b0))), lo))
        return g.line(pts)
    for b0 in (-34, -26, -19, -13, -8, -4, 4, 8, 13, 19, 26, 34):
        dark = abs(b0) in (8, 13, 26)
        ch.append('<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            band(b0), '#a8844a' if dark else '#fffcf0', f(rnd.uniform(.38, .5) if dark else rnd.uniform(.22, .34)), f(rnd.uniform(10, 18) if dark else rnd.uniform(6, 12))))
    ch.append('<path d="%s" fill="none" stroke="#a88246" stroke-opacity=".36" stroke-width="26" stroke-linecap="round"/>' % g.line([(1.5 * math.sin(i), -8 + i * 6) for i in range(16)]))
    for la in (48, 56, -50, -58):
        ch.append('<path d="%s" fill="none" stroke="#c8a870" stroke-opacity=".22" stroke-width="10"/>' % g.line([(la + 2 * math.sin(i * .6), -95 + i * 8) for i in range(24)]))
    b.append('<g filter="url(#%ssw)">%s</g>' % (u, ''.join(ch)))
    b.append(rect_fill(cx - R - 20, cy - R - 20, 2 * R + 40, 2 * R + 40, 'n1', .35, 'multiply', u))
    b.append(rect_fill(cx - R - 20, cy - R - 20, 2 * R + 40, 2 * R + 40, 'n2', .55, 'screen', u))
    # polar collars: a bright hood near each pole
    for la in (72, -74):
        b.append('<path d="%s" fill="#fffef6" opacity=".45" filter="url(#%sb6)"/>' % (g.sblob(la + (6 if la > 0 else -6), 0, 16, 190, rnd, 20, .1), u))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%srim)"/>' % (cx, cy, R, u))
    b.append(g.shade(u, amb=.3, gamma=.7, night=.97, col='#050305'))
    obj = svg(W, H, '<circle cx="%d" cy="%d" r="%d" fill="#050305"/><g clip-path="url(#%sdisk)">%s</g>' % (cx, cy, R, u, ''.join(b)) +
              lit_rim(g, u, '#fff2d0', 10, .38, 'b14', 95) + lit_rim(g, u, '#fffaf0', 3, .85, 'b3', 88) + lit_rim(g, u, '#fff6e0', 1.2, .35, 'b2', 140) +
              grain(u + 'o', W, H, .09), defs)
    ann = [top('CLOUD TOPS · 70 KM · PHASE 74%'), scalebar(22, 800, 5000 / 6052 * R, '5,000 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= MARS
def mars(u):
    """Mars near opposition, Meridiani to Syrtis: crisp dark maria on butterscotch deserts, Hellas a pale basin, the north cap bright and sharp,
    a regional dust storm rolling up to the morning limb, and a thin blue-white rim of air."""
    cx, cy, R = 291, 346, 204
    rnd = random.Random(1877)
    S = (-.3, .16, .94)
    g = Globe(cx, cy, R, 21, 40, -8, S)
    bg = sky(u, H, ('#1a0f0c', '#0a0606', '#030203'), 220, 1877, 4)
    defs = (clip_defs(u, g) +
            radial(u, 'base', [('0', '#e8a068', 1), ('.5', '#d6844c', 1), ('.85', '#b8622e', 1), ('1', '#8a4222', 1)], cx='.42', cy='.42', r='.75') +
            tint_noise(u, 'n1', '.012', 5, 61, '#6a2c14', 2, -.7) + tint_noise(u, 'n2', '.035', 4, 63, '#f8c898', 2.2, -1.1) +
            tint_noise(u, 'n5', '.09', 3, 73, '#3a1608', 2.6, -1.4) + grey_noise(u, 'n3', '.3', 2, 65) +
            rough(u, 'rg', '.045', 12, 67, .5, 30) + rough(u, 'rgc', '.1', 4, 69, .3) + rough(u, 'rgs', '.025', 22, 71, 3, 30) + rough(u, 'dst', '.015 .05', 30, 75, 5, 40) +
            blur(u, 'b05', .5) + blur(u, 'b1', .8) + blur(u, 'b3', 3) + blur(u, 'b8', 8, 40) + blur(u, 'bsh', 5, 10))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
         rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n1', .35, 'multiply', u)]
    # bright deserts: Arabia, Elysium's approaches, Isidis, and the frosted basins Hellas and Argyre
    br = [(20, 18, 18, 30, '#f2b27c', .45), (8, -18, 10, 14, '#f0aa74', .3), (14, 88, 6, 8, '#f4c090', .55), (35, 50, 10, 18, '#eea670', .3)]
    b.append('<g filter="url(#%srgs)">%s</g>' % (u, ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (g.sblob(*a[:4], rnd, 18, .3), a[4], f(a[5])) for a in br)))

    def jit(pts, k=1.):
        return [(la + rnd.uniform(-k, k), lo + rnd.uniform(-k, k) * 1.4) for la, lo in pts]
    M = [
        ([(-2, 62), (5, 63), (12, 64.5), (18, 65.5), (24, 66.5), (30, 68), (28, 72), (20, 73), (12, 75), (4, 79), (-4, 84), (-10, 80), (-8, 70)], .9),                 # Syrtis Major
        ([(-1, -2), (-2, 16), (-2, 34), (0, 52), (-2, 62), (-8, 72), (-14, 62), (-12, 44), (-10, 24), (-8, 8), (-6, -2)], .8),                                           # Sinus Sabaeus
        ([(1, -9), (4, -4), (1, 0), (4, 4), (0, 8), (-5, 5), (-6, -6)], .9),                                                                                               # Meridiani, the fork
        ([(-2, -22), (-6, -15), (-14, -17), (-24, -22), (-22, -31), (-12, -29), (-5, -27)], .75),                                                                          # Margaritifer
        ([(-18, -60), (-22, -32), (-24, -12), (-28, 6), (-36, 20), (-44, 4), (-44, -26), (-40, -54), (-30, -66)], .65),                                                  # Erythraeum
        ([(28, -44), (35, -24), (45, -12), (57, -15), (60, -34), (52, -52), (39, -58)], .8),                                                                               # Acidalia
        ([(34, 74), (44, 90), (50, 110), (44, 122), (36, 102), (30, 84)], .7),                                                                                             # Utopia
        ([(-10, 84), (-18, 100), (-24, 120), (-32, 112), (-24, 92), (-16, 82)], .7),                                                                                       # Tyrrhenum
        ([(-22, 30), (-27, 44), (-31, 58), (-36, 46), (-32, 30)], .55),                                                                                                    # Pandorae Fretum
        ([(-8, -46), (-13, -40), (-19, -47), (-16, -58), (-10, -55)], .6),                                                                                                 # Aurorae Sinus
    ]
    def smooth(pts, n=5):
        out = []
        for i in range(len(pts)):
            p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % len(pts)], pts[(i + 2) % len(pts)]
            for k in range(n):
                t = k / n
                out.append(tuple(.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t ** 3) for c in (0, 1)))
        return out

    def shrink(pts, k):
        ma = sum(p[0] for p in pts) / len(pts); mo = sum(p[1] for p in pts) / len(pts)
        return [(ma + (la - ma) * k + rnd.uniform(-.6, .6), mo + (lo - mo) * k + rnd.uniform(-.9, .9)) for la, lo in pts]
    soft, core, mask = [], [], []
    for pts, op in M:
        j = smooth(jit(pts, .8))
        soft.append('<path d="%s" fill="#6a3622" opacity="%s"/>' % (g.poly(shrink(j, 1.12)), f(op * .3)))
        core.append('<path d="%s" fill="#6a3824" opacity="%s"/>' % (g.poly(j), f(op * .6)))
        core.append('<path d="%s" fill="#52291a" opacity="%s"/>' % (g.poly(smooth(shrink(pts, .72), 4)), f(op * .55)))
        core.append('<path d="%s" fill="#3e1c10" opacity="%s"/>' % (g.poly(smooth(shrink(pts, .42), 4)), f(op * .45)))
        mask.append('<path d="%s" fill="#fff"/>' % g.poly(j))
    collar = [(62 + 3 * math.sin(k * 1.3) + rnd.uniform(-1.5, 1.5), -180 + k * 10) for k in range(37)] + [(68 + rnd.uniform(-1, 1), 180 - k * 10) for k in range(37)]
    core.append('<path d="%s" fill="#4a2414" opacity=".6"/>' % g.poly(collar))
    b.append('<g filter="url(#%sb8)">%s</g>' % (u, ''.join(soft)))
    b.append('<g filter="url(#%srg)">%s</g>' % (u, ''.join(core)))
    # texture inside the maria: dark mottling and wind streaks trailing from craters
    defs += '<mask id="%smm"><rect width="%d" height="%d" fill="#000"/><g filter="url(#%srg)">%s</g></mask>' % (u, W, H, u, ''.join(mask))
    b.append('<g mask="url(#%smm)">%s</g>' % (u, rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n5', .55, 'multiply', u)))
    streaks = []
    for _ in range(40):
        la, lo = rnd.uniform(-40, 40), rnd.uniform(-40, 100)
        streaks.append('<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            g.line([(la - k * .5, lo - k * 1.4) for k in range(5)]), rnd.choice(['#f6c898', '#4a2212']), f(rnd.uniform(.08, .16)), f(rnd.uniform(1, 2.2))))
    b.append('<g filter="url(#%sb1)">%s</g>' % (u, ''.join(streaks)))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n2', .3, 'screen', u))
    # Hellas: a pale basin two thousand kilometres across, its rim a darker ring of old highland
    b.append('<path d="%s" fill="#5a2c1a" opacity=".45" filter="url(#%sb3)"/>' % (g.sblob(-42, 70, 16, 21, rnd, 20, .08), u))
    b.append('<path d="%s" fill="#f6e0c8" opacity=".95" filter="url(#%srgc)"/>' % (g.sblob(-42, 70, 11.5, 15, rnd, 20, .1), u))
    b.append('<path d="%s" fill="#fff6ee" opacity=".5" filter="url(#%sb3)"/>' % (g.sblob(-44, 71, 6, 8, rnd, 14, .2), u))
    b.append('<path d="%s" fill="#f2d8c0" opacity=".65" filter="url(#%srgc)"/>' % (g.sblob(-50, -42, 6, 8, rnd, 16, .12), u))
    # craters: a few big ones sharp, many small ones soft
    pal = ('#5a2614', '#f4bc92', '#c47a4a', '#f8cca8', '#fbe0c8')
    cr = [g.crater(la, lo, r, pal, depth=.5) for la, lo, r in [(-28, 22, 9), (-20, -20, 6), (12, 30, 5), (-40, -14, 7), (32, 50, 5), (-52, 28, 6), (-8, 40, 4), (24, -2, 5)]]
    for _ in range(120):
        cr.append(g.crater(math.degrees(math.asin(rnd.uniform(-.9, .8))), rnd.uniform(-60, 110), 1 + 3.6 * rnd.random() ** 3, pal, depth=.5, op=.7))
    b.append('<g filter="url(#%sb05)">%s</g>' % (u, ''.join(cr)))
    # the north polar cap: crisp-edged water ice, its spiral troughs, a fringe of seasonal frost
    cap = [(78.5 + 2.5 * math.sin(k * .9) + rnd.uniform(-.8, .8), -180 + k * 7.5) for k in range(49)]
    b.append('<path d="%s" fill="#f4f0ee" opacity=".45" filter="url(#%sb3)"/>' % (g.poly([(la - 3.5, lo) for la, lo in cap]), u))
    b.append('<path d="%s" fill="#fdfcfa" filter="url(#%srgc)"/>' % (g.poly(cap), u))
    sw = ''.join('<path d="%s" fill="none" stroke="#b89a8a" stroke-opacity=".55" stroke-width="1.3"/>' % g.line([(86 - k * .55, a + k * 13) for k in range(14)]) for a in range(0, 360, 51))
    b.append('<g filter="url(#%sb05)">%s</g>' % (u, sw))
    # a regional dust storm rolling toward the morning limb over Chryse and Margaritifer
    dust = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (g.sblob(rnd.uniform(-26, 10), rnd.uniform(-55, -22), rnd.uniform(4, 10), rnd.uniform(6, 16), rnd, 14, .4), rnd.choice(['#f2c088', '#eab07a', '#f8d4a8']), f(rnd.uniform(.25, .5))) for _ in range(18))
    b.append('<g filter="url(#%sdst)">%s</g>' % (u, dust))
    # water-ice haze and thin clouds strung along the morning limb
    wisps = ''.join('<path d="%s" fill="none" stroke="#eef2ff" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
        g.line([(la + k * .3, lo + k * 2.2) for k in range(8)]), f(rnd.uniform(.2, .45)), f(rnd.uniform(1.5, 4))) for la, lo in [(rnd.uniform(-20, 40), rnd.uniform(-78, -62)) for _ in range(10)])
    b.append('<g filter="url(#%sb3)">%s</g>' % (u, wisps))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n3', .14, 'overlay', u))
    b.append(g.shade(u, amb=.2, gamma=.9, night=.96, col='#050204'))
    defs += limb_dark(u, 'limbd', (.62, .14, .38), '#1a0804') + radial(u, 'lh', [('.93', '#cfe0ff', 0), ('.985', '#dfeaff', .3), ('1', '#eef4ff', .55)])
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimbd)"/>' % (cx, cy, R, u))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slh)" opacity=".7"/>' % (cx, cy, R, u))
    obj = svg(W, H, '<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)) +
              '<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#cfe0ff" stroke-opacity=".22" stroke-width="3" filter="url(#%sb3)"/>' % (cx, cy, f(R + 1.5), u) +
              lit_rim(g, u, '#d6e6ff', 3, .45, 'b3', 85) + lit_rim(g, u, '#f2f6ff', .9, .8, 'b05', 80) + grain(u + 'o', W, H, .1), defs)
    ann = [top('CENTRAL MERIDIAN 40°E · NORTHERN SPRING'), scalebar(22, 800, 1000 / 3390 * R, '1,000 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= VALLES MARINERIS
def _curve(pts):
    """A smooth open curve through pts (Catmull-Rom as cubic Béziers)."""
    d = 'M%s %s' % (f(pts[0][0]), f(pts[0][1]))
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(len(pts) - 1, i + 2)]
        d += 'C%s %s %s %s %s %s' % (f(p1[0] + (p2[0] - p0[0]) / 6), f(p1[1] + (p2[1] - p0[1]) / 6), f(p2[0] - (p3[0] - p1[0]) / 6), f(p2[1] - (p3[1] - p1[1]) / 6), f(p2[0]), f(p2[1]))
    return d


def _interp(pts, t):
    """Point at parameter t in [0, 1] along a polyline, by index."""
    x = t * (len(pts) - 1); i = min(int(x), len(pts) - 2); k = x - i
    return pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k


def valles(u):
    """Valles Marineris from high orbit at a low morning sun: a continent-long gash with branching side canyons and the Noctis maze at its head,
    terraced walls in bands of colour, landslides fanned across the floor, fog in the lows, the planet's curve and its layered haze."""
    rnd = random.Random(1971)
    F, HZ, CX = 400, 196, 291
    curv = .00028
    hzf = lambda x: HZ + curv * (x - CX) ** 2

    def proj(X, Z, dep=0.):
        yg = HZ + F / Z
        x = CX + F * X / Z
        k = max(0, (H - yg) / (H - HZ))
        return x, yg + F * dep / Z + curv * (x - CX) ** 2 * k * k
    # low sun from the near left, eighteen degrees up
    sun = norm((-.72, -.48, .33))
    skyd = (linear(u, 'sky', [('0', '#050409', 1), ('.4', '#161020', 1), ('.64', '#3e2a30', 1), ('.82', '#9a6c58', 1), ('.93', '#d8a888', 1), ('1', '#f2d2b2', 1)], 0, 0, 0, 1))
    bg = svg(W, H, '<rect width="%d" height="%d" fill="#f2d2b2"/><rect width="%d" height="%d" fill="url(#%ssky)"/>' % (W, H, W, HZ + 40, u) + starfield(W, 120, 80, 1971, 1, u=u), SPIKE_DEFS.format(u=u) + skyd)
    defs = (linear(u, 'gnd', [('0', '#e8bc98', 1), ('.08', '#d09a74', 1), ('.35', '#b87450', 1), ('1', '#9a5634', 1)], 0, 0, 0, 1) +
            linear(u, 'aer', [('0', '#f6dcc2', .95), ('.06', '#ecc4a4', .6), ('.2', '#e0aa8a', .2), ('.45', '#d89a78', 0)]) +
            linear(u, 'limb', [('0', '#ffe2c4', 0), ('.7', '#ffd8b4', .6), ('1', '#fff2e0', 1)]) +
            tint_noise(u, 'n1', '.008 .03', 5, 81, '#4a2010', 2, -.7) + tint_noise(u, 'n2', '.02 .06', 4, 83, '#f8d0ac', 2.2, -1.15) +
            grey_noise(u, 'n4', '.45', 2, 87) + tint_noise(u, 'n5', '.05 .16', 3, 97, '#5a2814', 2.2, -1.1) + rough(u, 'rg', '.06', 5, 89, .3, 10) + rough(u, 'rgc', '.03', 9, 95, .5, 10) +
            blur(u, 'b1', .8) + blur(u, 'b2', 2) + blur(u, 'b4', 4, 40) + blur(u, 'b8', 8, 40))
    o = []
    xs = range(-20, W + 21, 12)
    hzp = 'M-20 %s%s' % (f(hzf(-20)), ''.join('L%d %s' % (x, f(hzf(x))) for x in xs))
    o.append('<path d="%sL%d %dL-20 %dZ" fill="url(#%sgnd)"/>' % (hzp, W + 20, H, H, u))
    o.append('<path d="%sL%d %dL-20 %dZ" fill="#000" filter="url(#%sn1)" opacity=".55" style="mix-blend-mode: multiply"/>' % (hzp, W + 20, H, H, u))
    o.append('<path d="%sL%d %dL-20 %dZ" fill="#000" filter="url(#%sn2)" opacity=".18" style="mix-blend-mode: screen"/>' % (hzp, W + 20, H, H, u))
    # the plateau: dark albedo streaks and craters, flattened by the oblique view
    pl = []
    for _ in range(26):
        X, Z = rnd.uniform(-3, 4), rnd.uniform(.7, 9)
        x, y = proj(X, Z); s = F / Z
        pl.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(s * rnd.uniform(.1, .4)), f(s * rnd.uniform(.03, .1) / Z ** .3), rnd.choice(['#6a2e18', '#f0c49c']), f(rnd.uniform(.12, .28))))
    o.append('<g filter="url(#%sb8)">%s</g>' % (u, ''.join(pl)))
    cr = []
    o.append('<path d="%sL%d %dL-20 %dZ" fill="#000" filter="url(#%sn5)" opacity=".4" style="mix-blend-mode: multiply"/>' % (hzp, W + 20, H, H, u))
    for _ in range(190):
        X, Z = rnd.uniform(-3, 5), .65 + 10 * rnd.random() ** 1.8
        x, y = proj(X, Z)
        if not (-20 < x < W + 20 and y < H + 10): continue
        r = F / Z * (.006 + .05 * rnd.random() ** 3.5)
        e = (1 / Z) / math.sqrt(1 + 1 / Z ** 2)
        if r < .5: continue
        cr.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#4a1c0c" opacity=".45"/><path d="M%s %sA%s %s 0 0 0 %s %s" fill="none" stroke="#ffd8b8" stroke-opacity=".55" stroke-width="%s"/>' % (
            f(x), f(y), f(r), f(r * e), f(x - r), f(y), f(r), f(r * e), f(x + r), f(y), f(min(1.2, .3 + r * .08))))
    for X, Z, r in [(-.9, 1.25, .1), (-1.3, 1.9, .07), (-.35, 1.05, .05), (.9, 3.1, .09), (-2.1, 2.6, .12), (1.7, 2.3, .06)]:
        x, y = proj(X, Z); rx = F * r / Z; e = (1 / Z) / math.sqrt(1 + 1 / Z ** 2); ry = rx * e
        cr.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#f0c4a0" opacity=".08" filter="url(#%sb2)"/><ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#6a2e18"/>'
                  '<path d="M%s %sA%s %s 0 0 1 %s %sA%s %s 0 0 0 %s %sZ" fill="#d89a72" opacity=".85"/><path d="M%s %sA%s %s 0 0 0 %s %s" fill="none" stroke="#ffe0c4" stroke-width="1" stroke-opacity=".6"/>' % (
                      f(x), f(y), f(rx * 1.9), f(ry * 1.9), u, f(x), f(y), f(rx), f(ry), f(x - rx), f(y), f(rx), f(ry), f(x + rx), f(y), f(rx * 1.05), f(ry * .55), f(x - rx), f(y), f(x - rx), f(y), f(rx), f(ry), f(x + rx), f(y)))
    o.append(''.join(cr))

    # a canyon: a centreline in the plan, a width and a depth profile; walls sloping in; drawn far to near
    ncan = [0]

    def canyon(cl, width, depth, samples, nb=6, fogn=0, fogop=.7, fann=0):
        pts = []
        for i in range(samples + 1):
            t = i / samples; x_ = t * (len(cl) - 1); j = min(int(x_), len(cl) - 2); k = x_ - j
            p0, p1, p2, p3 = cl[max(0, j - 1)], cl[j], cl[j + 1], cl[min(len(cl) - 1, j + 2)]
            cr_ = lambda a, b, c, d: .5 * ((2 * b) + (-a + c) * k + (2 * a - 5 * b + 4 * c - d) * k * k + (-a + 3 * b - 3 * c + d) * k ** 3)
            pts.append((cr_(p0[0], p1[0], p2[0], p3[0]), cr_(p0[1], p1[1], p2[1], p3[1]), width(t) * (1 + rnd.uniform(-.12, .12)), depth(t)))
        segs = []
        for i in range(samples):
            (x0, z0, w0, d0), (x1, z1, w1, d1) = pts[i], pts[i + 1]
            dx, dz = x1 - x0, z1 - z0; L = math.hypot(dx, dz) or 1
            nx, nz = -dz / L, dx / L
            segs.append(((x0, z0, w0, d0), (x1, z1, w1, d1), (nx, nz), i))
        # band boundaries wander along the wall: terraces that thicken, pinch and step
        tb, cur = [], [k / nb for k in range(nb + 1)]
        for i in range(samples + 1):
            cur = [0] + [min(.97, max(.03, c + rnd.uniform(-.025, .025) + (k / nb - c) * .3)) for k, c in enumerate(cur[1:-1], 1)] + [1]
            cur = [cur[0]] + sorted(cur[1:-1]) + [1]
            tb.append(cur)
        out = []
        cols = ['#e8b48a', '#c47a52', '#f2d0a8', '#9a5436', '#d89868', '#7a3c24', '#e8c09a']
        for (a, b, (nx, nz), si) in sorted(segs, key=lambda s_: -(s_[0][1] + s_[1][1])):
            q = []
            for side in (1, -1):
                ra = (a[0] + side * nx * a[2] / 2, a[1] + side * nz * a[2] / 2); rb = (b[0] + side * nx * b[2] / 2, b[1] + side * nz * b[2] / 2)
                ba = (a[0] + side * nx * a[2] * .22, a[1] + side * nz * a[2] * .22); bb = (b[0] + side * nx * b[2] * .22, b[1] + side * nz * b[2] * .22)
                inward = (-side * nx, -side * nz)
                cam = (-(ra[0] + rb[0]) / 2, -(ra[1] + rb[1]) / 2)
                vis = inward[0] * cam[0] + inward[1] * cam[1]
                lit = max(0, .55 * (inward[0] * sun[0] + inward[1] * sun[1]) + .45 * sun[2] * 1.4)
                q.append((ra, rb, ba, bb, vis, lit, inward))
            # floor between the two wall feet
            (_, _, ba1, bb1, _, _, _), (_, _, ba2, bb2, _, _, _) = q
            fl = [proj(*ba1, a[3]), proj(*bb1, b[3]), proj(*bb2, b[3]), proj(*ba2, a[3])]
            flc = '#8a4a30'
            out.append('<path d="M%sZ" fill="%s" stroke="%s" stroke-width=".6"/>' % ('L'.join('%s %s' % (f(x), f(y)) for x, y in fl), flc, flc))
            # the shadow a sun-facing-away wall throws over the floor
            for ra, rb, ba, bb, vis, lit, inward in q:
                if lit < .25:
                    other = q[1] if q[0][2] is ba else q[0]
                    sa = proj(ba[0] + (other[2][0] - ba[0]) * .7, ba[1] + (other[2][1] - ba[1]) * .7, a[3]); sb = proj(bb[0] + (other[3][0] - bb[0]) * .7, bb[1] + (other[3][1] - bb[1]) * .7, b[3])
                    out.append('<path d="M%s %sL%s %sL%s %sL%s %sZ" fill="#1e0a06" opacity=".55"/>' % (f(proj(*ba, a[3])[0]), f(proj(*ba, a[3])[1]), f(proj(*bb, b[3])[0]), f(proj(*bb, b[3])[1]), f(sb[0]), f(sb[1]), f(sa[0]), f(sa[1])))
            for ra, rb, ba, bb, vis, lit, inward in q:
                if vis <= 0: continue
                # terraced wall: bands of rock from rim to foot, each its own colour, all toned by the light
                for k in range(nb):
                    t0, t1, u0, u1 = tb[si][k], tb[si][k + 1], tb[si + 1][k], tb[si + 1][k + 1]
                    P0 = proj(ra[0] + (ba[0] - ra[0]) * t0, ra[1] + (ba[1] - ra[1]) * t0, a[3] * t0)
                    P1 = proj(rb[0] + (bb[0] - rb[0]) * u0, rb[1] + (bb[1] - rb[1]) * u0, b[3] * u0)
                    P2 = proj(rb[0] + (bb[0] - rb[0]) * u1, rb[1] + (bb[1] - rb[1]) * u1, b[3] * u1)
                    P3 = proj(ra[0] + (ba[0] - ra[0]) * t1, ra[1] + (ba[1] - ra[1]) * t1, a[3] * t1)
                    c = cols[(k * 3 + 1) % len(cols)]
                    out.append('<path d="M%s %sL%s %sL%s %sL%s %sZ" fill="%s" stroke="%s" stroke-width=".5"/>' % (f(P0[0]), f(P0[1]), f(P1[0]), f(P1[1]), f(P2[0]), f(P2[1]), f(P3[0]), f(P3[1]), c, c))
                shade = 1 - min(1, lit * 1.5)
                P = [proj(*ra), proj(*rb), proj(*bb, b[3]), proj(*ba, a[3])]
                out.append('<path d="M%sZ" fill="#1a0804" opacity="%s"/>' % ('L'.join('%s %s' % (f(x), f(y)) for x, y in P), f(.08 + .78 * shade)))
                if lit > .35:
                    out.append('<path d="M%s %sL%s %s" stroke="#fff0dc" stroke-opacity=".7" stroke-width="1"/>' % (f(P[0][0]), f(P[0][1]), f(P[1][0]), f(P[1][1])))
                # gullies down the face
                for gq in ((rnd.uniform(.1, .45), rnd.uniform(.55, .9)) if nb > 4 else (rnd.uniform(.2, .8),)):
                    g0 = proj(ra[0] + (rb[0] - ra[0]) * gq, ra[1] + (rb[1] - ra[1]) * gq); gm = rnd.uniform(.5, .9)
                    g1 = proj(ra[0] + (ba[0] - ra[0]) * gm + (rb[0] - ra[0]) * (gq - .1), ra[1] + (ba[1] - ra[1]) * gm + (rb[1] - ra[1]) * (gq - .1), (a[3] + b[3]) / 2 * gm)
                    g2 = proj(ra[0] + (ba[0] - ra[0]) * gm + (rb[0] - ra[0]) * (gq + .12), ra[1] + (ba[1] - ra[1]) * gm + (rb[1] - ra[1]) * (gq + .12), (a[3] + b[3]) / 2 * gm)
                    out.append('<path d="M%s %sL%s %sL%s %sZ" fill="#3a1408" opacity="%s"/>' % (f(g0[0]), f(g0[1]), f(g1[0]), f(g1[1]), f(g2[0]), f(g2[1]), f(rnd.uniform(.2, .45))))
            for ra, rb, ba, bb, vis, lit, inward in q:
                if vis <= 0:
                    P0, P1 = proj(*ra), proj(*rb)
                    lips.append('<path d="M%s %sL%s %s" stroke="#ffe2c4" stroke-opacity=".6" stroke-width="1.1"/>' % (f(P0[0]), f(P0[1]), f(P1[0]), f(P1[1])))
        # what can be seen of a canyon lies between its two rims; the near plateau hides the rest
        L_ = [proj(X + nx * w / 2, Z + nz * w / 2) for (X, Z, w, d), (_, _, (nx, nz), _i) in zip(pts, segs + [segs[-1]])]
        R_ = [proj(X - nx * w / 2, Z - nz * w / 2) for (X, Z, w, d), (_, _, (nx, nz), _i) in zip(pts, segs + [segs[-1]])]
        cid = '%scv%d' % (u, ncan[0]); ncan[0] += 1
        clips.append('<clipPath id="%s"><path d="M%sZ"/></clipPath>' % (cid, 'L'.join('%s %s' % (f(x), f(y)) for x, y in L_ + R_[::-1])))
        fg = ''.join(fog(pts, fogn, .3, fogop))
        fn = ''.join(fans(pts, fann, -1)) if fann else ''
        body = ''.join(out) + ('<g filter="url(#%srg)">%s</g>' % (u, fn) if fn else '') + ('<g filter="url(#%sb4)">%s</g>' % (u, fg) if fg else '')
        return pts, '<g filter="url(#%srgc)"><g clip-path="url(#%s)">%s</g></g>' % (u, cid, body)

    def fans(pts, n, side):
        out = []
        for _ in range(n):
            i = rnd.randrange(2, len(pts) - 3)
            (x0, z0, w0, d0), (x1, z1, _, _) = pts[i], pts[i + 1]
            L = math.hypot(x1 - x0, z1 - z0) or 1; nx, nz = -(z1 - z0) / L, (x1 - x0) / L
            fx_, fz_ = x0 + side * nx * w0 * .22, z0 + side * nz * w0 * .22
            reach = w0 * rnd.uniform(.25, .4); spread = w0 * rnd.uniform(.12, .22)
            tx, tz = (x1 - x0) / L, (z1 - z0) / L
            lobe = [(fx_ - tx * spread * .4, fz_ - tz * spread * .4)]
            for k in range(9):
                a = -1 + k / 4
                rr = reach * (1 - .3 * a * a) * rnd.uniform(.85, 1.1)
                lobe.append((fx_ - side * nx * rr + tx * spread * a, fz_ - side * nz * rr + tz * spread * a))
            lobe.append((fx_ + tx * spread * .4, fz_ + tz * spread * .4))
            P = [proj(X, Z, d0) for X, Z in lobe]
            out.append('<path d="M%sZ" fill="#9a5a3c" opacity=".7"/>' % 'L'.join('%s %s' % (f(x), f(y)) for x, y in P))
            apex = proj(fx_, fz_, d0 * .85)
            for x, y in P[1:-1:1]:
                out.append('<path d="M%s %sL%s %s" stroke="#7a3e24" stroke-opacity=".3" stroke-width=".6"/>' % (f(apex[0]), f(apex[1]), f(x), f(y)))
        return out

    def fog(pts, n, spread=.35, op=.7):
        out = []
        for _ in range(n):
            X, Z, w, d = rnd.choice(pts)
            X += rnd.uniform(-w, w) * spread; Z += rnd.uniform(-w, w) * spread
            x, y = proj(X, Z, d * .9); s = F / Z
            out.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(s * w * rnd.uniform(.2, .5)), f(s * w * rnd.uniform(.05, .12) / Z ** .3), rnd.choice(['#fff8f2', '#f4e8ec', '#ffffff']), f(rnd.uniform(.25, op))))
        return out

    cg, lips, clips = [], [], []
    # Noctis Labyrinthus: the canyon's head breaks into a maze of short intersecting troughs
    K = .66
    maze = []
    for _ in range(12):
        cx0, cz0 = K * (-1.45 + rnd.uniform(-.8, .7)), K * (4.0 + rnd.uniform(-.6, 1.2))
        a = rnd.choice([.6, 2.4, 1.5]) + rnd.uniform(-.25, .25); L = K * rnd.uniform(.4, .9)
        cl = [(cx0 - math.cos(a) * L / 2, cz0 - math.sin(a) * L / 2), (cx0, cz0 + rnd.uniform(-.05, .05)), (cx0 + math.cos(a) * L / 2, cz0 + math.sin(a) * L / 2)]
        maze.append((cz0, cl))
    for _, cl in sorted(maze, key=lambda m: -m[0]):
        cg.append(canyon(cl, lambda t: K * (.17 * (1 - (2 * t - 1) ** 4) + .02), lambda t: .08 * (1 - (2 * t - 1) ** 4), 4, 3, 3, .6)[1])
    # a parallel chasma far off, receding to the right
    cg.append(canyon([(-.3, 3.3), (.8, 3.8), (1.9, 4.8), (3.2, 6.6), (4.4, 9.4)], lambda t: .34 * (1 - t * .5), lambda t: .12, 14, 4, 8, .55, 2)[1])
    # side canyons cut back into the plateau beyond the trunk, drawn before it
    trunk = [(K * x, K * z) for x, z in [(-1.2, 3.5), (-.85, 2.9), (-.45, 2.3), (0, 1.8), (.5, 1.42), (1.0, 1.16), (1.55, .98), (2.2, .86)]]
    for (X, Z), a, Lt in [((-.6 * K, 2.62 * K), 1.9, .9 * K), ((.2 * K, 1.9 * K), 2.2, 1.1 * K), ((.95 * K, 1.46 * K), 1.5, .8 * K)]:
        cl = [(X + math.cos(a) * Lt, Z + math.sin(a) * Lt), (X + math.cos(a + .3) * Lt * .5, Z + math.sin(a + .3) * Lt * .5), (X, Z)]
        cg.append(canyon(cl, lambda t: K * (.03 + .22 * t ** 1.3), lambda t: .02 + .12 * t, 9, 5, 3, .5)[1])
    pt, st = canyon(trunk, lambda t: K * (.4 + .3 * t), lambda t: .1 + .1 * t, 20, 6, 20, .5, 7)
    cg.append(st)
    o.append(''.join(cg))
    o.append('<g filter="url(#%sb1)">%s</g>' % (u, ''.join(lips)))
    # air: haze thickening to the horizon, the limb, and the thin detached haze layers above it
    defs += ''.join(clips)
    o.append('<rect x="-20" y="%d" width="%d" height="%d" fill="url(#%saer)"/>' % (HZ - 6, W + 40, H - HZ + 6, u))
    for dy, op, w in [(-5, .9, 10), (-12, .35, 2), (-18, .22, 1.6), (-25, .14, 1.4)]:
        o.append('<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" filter="url(#%s)" transform="translate(0 %d)"/>' % (
            hzp, 'url(#%slimb)' % u if w > 5 else '#f4e0e4', f(op), f(w), u + ('b2' if w > 5 else 'b1'), dy))
    o.append('<path d="%s" fill="none" stroke="#fff4e4" stroke-opacity=".9" stroke-width="1"/>' % hzp)
    o.append(rect_fill(-20, HZ - 6, W + 40, H - HZ + 6, 'n4', .1, 'overlay', u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .11), defs)
    ann = [top('VALLES MARINERIS · 4,000 KM · UP TO 7 KM DEEP'), scalebar(22, 800, 110, '~100 KM ACROSS')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= IO
def io(u):
    """Io over Jupiter: sulfur yellows and whites, black calderas ringed in red, a blue-white plume standing off the limb."""
    cx, cy, R = 270, 372, 188
    rnd = random.Random(1610)
    S = (-.55, .22, .8)
    g = Globe(cx, cy, R, 8, 0, 0, S)
    jg = Globe(640, 70, 340, 18, 0, -14, S)
    jdefs = (clip_defs(u, jg, 'jdisk') + blur(u, 'jsh', 10, 10) + rough(u, 'jt', '.008 .045', 26, 101, 2.2, 10) +
             radial(u, 'jglow', [('.8', '#e8c89a', .12), ('1', '#e8c89a', 0)]))
    jb = []
    for la, w, c in [(80, 20, '#8e8676'), (62, 10, '#b8a88c'), (48, 8, '#d8c6a4'), (36, 7, '#a08264'), (26, 6, '#e6d6b8'), (16, 7, '#a8764e'), (8, 6, '#c49470'),
                     (0, 9, '#f2e6cc'), (-10, 8, '#e0caa4'), (-18, 7, '#9a6844'), (-26, 6, '#b0845e'), (-34, 7, '#e8d8bc'), (-44, 8, '#b89a78'), (-58, 12, '#cbbba0'), (-76, 20, '#948a7a')]:
        jb.append('<path d="%s" fill="none" stroke="%s" stroke-width="%s"/>' % (jg.line([(la, -100 + k * 8) for k in range(26)]), c, f(w * 3.4)))
    for _ in range(40):
        la = rnd.uniform(-60, 60)
        jb.append('<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (jg.line([(la + rnd.uniform(-.5, .5), -100 + k * 8) for k in range(26)]), rnd.choice(['#fff4e0', '#6a4428', '#c89870']), f(rnd.uniform(.1, .3)), f(rnd.uniform(1, 4))))
    grs = jg.P(-22, -40)
    jb.append('<ellipse cx="%s" cy="%s" rx="38" ry="20" fill="#c8643c" opacity=".8" transform="rotate(-14 %s %s)"/>' % (f(grs[0]), f(grs[1]), f(grs[0]), f(grs[1])))
    jup = ('<circle cx="640" cy="70" r="%d" fill="url(#%sjglow)"/>' % (380, u) +
           '<g clip-path="url(#%sjdisk)"><circle cx="640" cy="70" r="340" fill="#d8c4a0"/><g filter="url(#%sjt)">%s</g>%s</g>' % (u, u, ''.join(jb), jg.shade(u, amb=.12, gamma=.8, night=.97, col='#030204', filt='jsh')))
    bg = sky(u, H, ('#14100e', '#08070a', '#020204'), 200, 1610, 3, extra=jup, extra_defs=jdefs + limb_dark(u, 'jlimb', (.6, .25, .6)))
    defs = (clip_defs(u, g) +
            radial(u, 'base', [('0', '#f6e6a0', 1), ('.5', '#ecd27c', 1), ('.85', '#d8b460', 1), ('1', '#b88c40', 1)], cx='.4', cy='.42', r='.75') +
            tint_noise(u, 'n1', '.018', 5, 111, '#b0702c', 2.2, -.9) + tint_noise(u, 'n2', '.03', 4, 113, '#fffae8', 2.4, -1.2) + tint_noise(u, 'n3', '.012', 4, 115, '#d8e4a0', 2.4, -1.3) +
            grey_noise(u, 'n4', '.3', 2, 117) + rough(u, 'rg', '.05', 12, 119, 1, 20) + rough(u, 'rgc', '.09', 5, 121, .7, 20) +
            blur(u, 'b05', .4) + blur(u, 'b1', .8) + blur(u, 'b3', 3) + blur(u, 'b6', 6, 40) + blur(u, 'b14', 14, 60) + blur(u, 'bsh', 6, 10) +
            radial(u, 'plg', [('0', '#ffffff', .2), ('.6', '#e4f0ff', .5), ('.9', '#c8dcff', .7), ('1', '#a8c8ff', 0)], cy='1', r='1'))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
         rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n1', .55, 'multiply', u), rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n3', .35, 'soft-light', u)]
    # red-brown poles
    for la in (78, -80):
        b.append('<path d="%s" fill="#8a4a26" opacity=".7" filter="url(#%sb14)"/>' % (g.poly([(la - (28 if la > 0 else -28) + 5 * math.sin(k * .9), -180 + k * 10) for k in range(37)] + [(la, 180 - k * 30) for k in range(13)]), u))
    # white sulfur-dioxide frost fields
    b.append('<g filter="url(#%srg)">%s</g>' % (u, ''.join('<path d="%s" fill="#fbf8ec" opacity="%s"/>' % (g.sblob(rnd.uniform(-40, 40), rnd.uniform(-90, 90), rnd.uniform(4, 12), rnd.uniform(6, 18), rnd, 14, .45), f(rnd.uniform(.35, .7))) for _ in range(26))))
    b.append('<g filter="url(#%sb6)">%s</g>' % (u, ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (g.sblob(rnd.uniform(-60, 60), rnd.uniform(-90, 90), rnd.uniform(6, 16), rnd.uniform(8, 22), rnd, 12, .4), rnd.choice(['#d8782c', '#c8923a', '#e0b050', '#b85a2a', '#c8c060']), f(rnd.uniform(.2, .4))) for _ in range(22))))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n2', .35, 'screen', u))
    # the volcanoes: black paterae, most with a halo of red or orange fallout; Pele's great red ring; Loki's dark horseshoe
    v = []
    pla, plo = -18, 22
    m, _, _, z = g.frame(pla, plo)
    v.append('<g transform="%s"><ellipse rx="62" ry="54" fill="none" stroke="#c0402a" stroke-width="16" opacity=".55" filter="url(#%sb6)"/><ellipse rx="62" ry="54" fill="none" stroke="#d85a34" stroke-width="5" opacity=".45" filter="url(#%sb3)"/></g>' % (m, u, u))
    v.append('<path d="%s" fill="#1a0e06"/>' % g.sblob(pla + 1, plo - 2, 1.8, 3, rnd, 10, .5))
    lm, _, _, _ = g.frame(14, -40)
    v.append('<g transform="%s"><ellipse rx="34" ry="30" fill="#b8702c" opacity=".35" filter="url(#%sb6)"/><path d="M-18 4A18 15 0 1 1 15 9" fill="none" stroke="#140a04" stroke-width="7" stroke-linecap="round" filter="url(#%srgc)"/></g>' % (lm, u, u))
    for _ in range(40):
        la, lo = rnd.uniform(-70, 70), rnd.uniform(-95, 95)
        r = 1 + 3.6 * rnd.random() ** 2
        halo = rnd.choice(['#c8482a', '#d86a30', '#e89a3a', '#7a4a20', None, None])
        if halo:
            v.append('<path d="%s" fill="%s" opacity="%s" filter="url(#%sb3)"/>' % (g.sblob(la, lo, r * 2.2, r * 2.8, rnd, 10, .4), halo, f(rnd.uniform(.25, .5)), u))
        v.append('<path d="%s" fill="%s" opacity="%s"/>' % (g.sblob(la, lo, r * .55, r * .8, rnd, 9, .5), rnd.choice(['#1c0e04', '#2a1606', '#3a1e0a']), f(rnd.uniform(.65, .9))))
    b.append('<g filter="url(#%sb05)"><g filter="url(#%srgc)">%s</g></g>' % (u, u, ''.join(v)))
    # a few mountains, low sun on their flanks
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n4', .14, 'overlay', u))
    b.append(g.shade(u, amb=.14, gamma=.85, night=.97, col='#050302'))
    defs += limb_dark(u, 'limbd', (.66, .18, .5), '#2a1606')
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimbd)"/>' % (cx, cy, R, u))
    # the plume: an umbrella of sulfur gas and dust, three hundred kilometres high, lit from the side
    A = math.radians(-146)
    vx, vy = cx + R * math.cos(A), cy + R * math.sin(A)
    Hp = 72
    surf = lambda x: x * x / (2 * R)         # the ground falls away from the vent as the moon curves
    pl, dots, ends, wide = [], [], [], []
    for i in range(52):
        th = math.radians(rnd.choice([-1, 1]) * rnd.uniform(2, 19)); k = rnd.uniform(.88, 1.04)
        vxl, vyl = math.sqrt(2 * Hp * k) * math.sin(th), math.sqrt(2 * Hp * k) * math.cos(th)
        pts = []
        for j in range(40):
            tt = j * 2 * vyl / 26
            x, y = vxl * tt, -(vyl * tt - tt * tt / 2)
            pts.append((x, y))
            if j > 2 and y > surf(x) + 2: break
        ends.append(pts[-1])
        wd = rnd.uniform(.4, 1.1)
        pl.append('<path d="M%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
            'L'.join('%s %s' % (f(x), f(y)) for x, y in pts), rnd.choice(['#dce8ff', '#bcd2ff', '#f2f6ff', '#a8c0f0']), f(rnd.uniform(.07, .22)), f(wd)))
        wide.append(pl[-1].replace('stroke-width="%s"' % f(wd), 'stroke-width="%s"' % f(wd * 4)))
        for _ in range(2):
            x, y = rnd.choice(pts[1:])
            dots.append('<circle cx="%s" cy="%s" r="%s" fill="#eef4ff" opacity="%s"/>' % (f(x), f(y), f(rnd.uniform(.3, .8)), f(rnd.uniform(.2, .5))))
    wmax = max(abs(x) for x, _ in ends)
    shell = 'M%s %sC%s %s %s %s 0 %sC%s %s %s %s %s %s' % (f(-wmax), f(surf(wmax)), f(-wmax * .9), f(-Hp * .8), f(-wmax * .5), f(-Hp * 1.02), f(-Hp * 1.02),
                                                         f(wmax * .5), f(-Hp * 1.02), f(wmax * .9), f(-Hp * .8), f(wmax), f(surf(wmax)))
    plume = ('<g transform="translate(%s %s) rotate(%s)">' % (f(vx), f(vy), f(math.degrees(A) + 90)) +
             '<path d="%sZ" fill="url(#%splg)" opacity=".28" filter="url(#%sb6)"/>' % (shell, u, u) +
             '<path d="M0 0L-7 %sL7 %sZ" fill="#f4f8ff" opacity=".3" filter="url(#%sb3)"/>' % (f(-Hp * .9), f(-Hp * .9), u) +
             '<g filter="url(#%sb3)" opacity=".8">%s</g>' % (u, ''.join(wide)) +
             '<g filter="url(#%sb05)">%s%s</g>' % (u, ''.join(pl), ''.join(dots)) +
             '<path d="%s" fill="none" stroke="#e8f0ff" stroke-opacity=".4" stroke-width="4" filter="url(#%sb3)"/>' % (shell, u) +
             '<circle r="2.6" fill="#fff" opacity=".9" filter="url(#%sb1)"/></g>' % u)
    obj = svg(W, H, '<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)) + lit_rim(g, u, '#fff8d8', 1.2, .5, 'b1', 80) + plume + grain(u + 'o', W, H, .11), defs)
    ann = [top('421,700 KM FROM JUPITER · 400 ACTIVE VOLCANOES'), scalebar(22, 800, 1000 / 1822 * R, '1,000 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= GANYMEDE
def ganymede(u):
    """Ganymede, larger than Mercury: old dark crust split by lanes of bright grooved ice, fresh rayed craters, frosted poles."""
    cx, cy, R = 291, 350, 206
    rnd = random.Random(1892)
    g = Globe(cx, cy, R, 12, -150, 0, (-.5, .24, .83))
    bg = sky(u, H, ('#12141c', '#08090e', '#020204'), 220, 1892, 4)
    defs = (clip_defs(u, g) +
            radial(u, 'base', [('0', '#d2cabb', 1), ('.55', '#bcb2a2', 1), ('1', '#8e8474', 1)], cx='.38', cy='.4', r='.8') +
            tint_noise(u, 'n1', '.02', 5, 131, '#4a4034', 2, -.7) + tint_noise(u, 'n2', '.07', 3, 133, '#f4f0e8', 2.2, -1.1) + grey_noise(u, 'n3', '.3', 2, 135) +
            rough(u, 'rg', '.03', 22, 137, 1.2, 20) + rough(u, 'rgs', '.06', 5, 139, .4, 10) + blur(u, 'b05', .5) + blur(u, 'b1', 1) + blur(u, 'b4', 4) + blur(u, 'b12', 12, 40) + blur(u, 'bsh', 5, 10))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u), rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n1', .4, 'multiply', u)]
    # grooved terrain: families of fine parallel ridges, each family its own direction, clipped to its lane
    lanes = [(-10, -175, 22, 14, 30), (20, -120, 14, 30, -20), (-30, -130, 16, 18, 70), (38, -170, 10, 26, 10), (-4, -150, 8, 24, -60),
             (-48, -170, 12, 30, 5), (8, -95, 16, 10, 80), (50, -130, 8, 22, -35), (-20, -205, 14, 12, 40), (25, -210, 12, 14, -70)]
    gr = []
    for i, (la, lo, rl, ro, ang) in enumerate(lanes):
        cid = '%sln%d' % (u, i)
        lane = g.sblob(la, lo, rl, ro, rnd, 22, .38)
        defs += '<clipPath id="%s"><path d="%s"/></clipPath>' % (cid, lane)
        a = math.radians(ang); lines = []
        ph = rnd.uniform(0, 6)
        for k in range(-12, 13):
            off = k * max(rl, ro) / 10.5 + rnd.uniform(-.3, .3)
            pts = [(la + off * math.cos(a) + q * math.sin(a) + .8 * math.sin(q * .15 + ph), lo + (-off * math.sin(a) + q * math.cos(a)) / max(.3, math.cos(math.radians(la)))) for q in [(-1.3 + j * .325) * max(rl, ro) for j in range(9)]]
            lines.append(g.line(pts))
        gr.append('<path d="%s" fill="#ece6da" opacity=".35"/><g clip-path="url(#%s)"><path d="%s" fill="none" stroke="#6e6456" stroke-opacity=".42" stroke-width=".9"/><path d="%s" fill="none" stroke="#fbf8f2" stroke-opacity=".45" stroke-width=".6" transform="translate(-.7 -.5)"/></g>' % (
            lane, cid, ''.join(lines), ''.join(lines)))
    b.append('<g filter="url(#%srg)"><g filter="url(#%sb05)">%s</g></g>' % (u, u, ''.join(gr)))
    # the dark terrain: Galileo-like polygons of ancient crust, with their curving furrows
    dk = []
    for la, lo, rl, ro in [(12, -150, 20, 26), (-18, -110, 16, 18), (-40, -140, 10, 22), (32, -95, 12, 16), (-12, -195, 14, 14), (48, -200, 10, 18), (-58, -110, 8, 20)]:
        dk.append('<path d="%s" fill="#5a4e40" opacity=".7"/>' % g.sblob(la, lo, rl, ro, rnd, 18, .3))
        dk.append('<path d="%s" fill="#44392e" opacity=".4"/>' % g.sblob(la + rnd.uniform(-3, 3), lo + rnd.uniform(-3, 3), rl * .6, ro * .6, rnd, 14, .4))
    b.append('<g filter="url(#%sb4)" opacity=".6">%s</g><g filter="url(#%srg)">%s</g>' % (u, ''.join(dk), u, ''.join(dk)))
    fr = []
    for k in range(9):
        r0 = 8 + k * 3.2
        pts = [(12 + r0 * math.sin(math.radians(t)), -150 + r0 * math.cos(math.radians(t)) / .97) for t in range(200, 330, 10)]
        fr.append(g.line(pts))
    b.append('<path d="%s" fill="none" stroke="#d8d0c0" stroke-opacity=".35" stroke-width="1.2" filter="url(#%sb05)"/>' % (''.join(fr), u))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n2', .45, 'screen', u))
    # palimpsests: ghost craters flattened by flowing ice
    b.append(''.join('<path d="%s" fill="#e8e2d6" opacity=".22" filter="url(#%sb4)"/>' % (g.sblob(la, lo, 6, 7, rnd, 14, .1), u) for la, lo in [(20, -140), (-24, -118)]))
    # craters: bright young ones with ray systems, older ones softened
    rays = []
    for la, lo, n, L in [(-38, -166, 40, 40), (12, -128, 26, 26), (30, -180, 18, 18)]:
        for _ in range(n):
            t = rnd.uniform(0, 2 * math.pi); ll = rnd.uniform(.3, 1) * L
            rays.append('<path d="%s" fill="none" stroke="#ffffff" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
                g.line([(la + ll * q / 6 * math.sin(t), lo + ll * q / 6 * math.cos(t) / math.cos(math.radians(la))) for q in range(7)]), f(rnd.uniform(.12, .35)), f(rnd.uniform(.8, 2.6))))
        rays.append('<path d="%s" fill="#fff" opacity=".4"/>' % g.sblob(la, lo, 4, 4.5, rnd, 10, .2))
    b.append('<g filter="url(#%sb1)">%s</g>' % (u, ''.join(rays)))
    pal = ('#3e3830', '#f4f0e8', '#bab2a4', '#f8f6f0', '#ffffff')
    cr = [g.crater(la, lo, r, pal, fresh) for la, lo, r, fresh in [(-38, -166, 6, 1), (12, -128, 4.5, 1), (30, -180, 3.5, 1), (-6, -170, 10, 0), (40, -120, 8, 0), (-52, -135, 9, 0)]]
    n = 0
    while n < 170:
        c = g.crater(math.degrees(math.asin(rnd.uniform(-1, 1))), rnd.uniform(-240, -60), 1 + 6 * rnd.random() ** 3.2, pal, op=.8)
        if c: cr.append(c)
        n += 1
    b.append('<g filter="url(#%sb05)">%s</g>' % (u, ''.join(cr)))
    # polar frost: bright caps that thin toward the mid-latitudes
    for la in (90, -90):
        b.append('<path d="%s" fill="#f4f8ff" opacity=".75" filter="url(#%sb12)"/>' % (g.poly([(la - (40 if la > 0 else -40) + 4 * math.sin(k * 1.1), -180 + k * 10) for k in range(37)] + [(la, 180 - k * 30) for k in range(13)]), u))
        b.append('<path d="%s" fill="#ffffff" opacity=".6" filter="url(#%sb4)"/>' % (g.poly([(la - (26 if la > 0 else -26) + 3 * math.sin(k * 1.7), -180 + k * 10) for k in range(37)] + [(la, 180 - k * 30) for k in range(13)]), u))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n3', .14, 'overlay', u))
    b.append(g.shade(u, amb=.12, gamma=.85, night=.975, col='#030306'))
    defs += limb_dark(u, 'limbd', (.66, .16, .45))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimbd)"/>' % (cx, cy, R, u))
    obj = svg(W, H, '<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)) + lit_rim(g, u, '#f4f8ff', 1.2, .5, 'b1', 80) + grain(u + 'o', W, H, .11), defs)
    ann = [top('5,268 KM · LARGEST MOON IN THE SOLAR SYSTEM'), scalebar(22, 800, 1000 / 2634 * R, '1,000 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= ENCELADUS
def enceladus(u):
    """Enceladus against the sun: a white ice ball, blue tiger stripes at the south pole and the jets they feed, Saturn's rings a hairline behind."""
    cx, cy, R = 262, 300, 150
    rnd = random.Random(2005)
    S = (.72, .36, .42)
    g = Globe(cx, cy, R, -34, 0, -32, S)
    ringl = (linear(u, 'ring', [('0', '#e8dcc0', 0), ('.2', '#f4e8cc', .8), ('.5', '#fff6e0', 1), ('.8', '#f4e8cc', .8), ('1', '#e8dcc0', 0)], 0, 0, 1, 0) +
             linear(u, 'ering', [('0', '#9ab8ff', 0), ('.3', '#a8c4ff', .5), ('.7', '#a8c4ff', .5), ('1', '#9ab8ff', 0)], 0, 0, 1, 0) +
             radial(u, 'bl', [('0', '#fff8ec', .5), ('.3', '#e8f0ff', .16), ('1', '#c8d8ff', 0)]) + blur(u, 'rb3', 3, 60) + blur(u, 'rb12', 12, 80))
    ringy = lambda x: 380 - .1 * x
    rline = '<path d="M-20 %sL%d %s" stroke="url(#%sering)" stroke-width="30" filter="url(#%srb12)" opacity=".5"/>' % (f(ringy(-20)), W + 20, f(ringy(W + 20)), u, u) + \
            '<path d="M-20 %sL%d %s" stroke="url(#%sring)" stroke-width="3" filter="url(#%srb3)" opacity=".7"/>' % (f(ringy(-20)), W + 20, f(ringy(W + 20)), u, u) + \
            '<path d="M-20 %sL%d %s" stroke="url(#%sring)" stroke-width=".9"/>' % (f(ringy(-20)), W + 20, f(ringy(W + 20)), u) + \
            '<path d="M-20 %sL%d %s" stroke="#0a0806" stroke-width=".5" opacity=".6"/>' % (f(ringy(-20) + .25), W + 20, f(ringy(W + 20) + .25))
    bg = sky(u, H, ('#0c1020', '#060812', '#020206'), 230, 2005, 4, extra='<circle cx="%d" cy="%d" r="300" fill="url(#%sbl)" opacity=".35"/>' % (cx + 200, cy - 110, u) + rline, extra_defs=ringl, cy='.36')
    defs = (clip_defs(u, g) +
            radial(u, 'base', [('0', '#ffffff', 1), ('.6', '#f2f6fa', 1), ('1', '#d8e2ec', 1)], cx='.7', cy='.3', r='.8') +
            tint_noise(u, 'n1', '.03', 5, 141, '#7890a8', 2, -.8) + grey_noise(u, 'n3', '.3', 2, 143) +
            rough(u, 'rg', '.06', 6, 145, .5, 10) + blur(u, 'b05', .5) + blur(u, 'b1', 1) + blur(u, 'b2', 2.2, 40) + blur(u, 'b6', 6, 60) + blur(u, 'b16', 16, 80) + blur(u, 'bsh', 6, 10) +
            linear(u, 'jet', [('0', '#ffffff', .9), ('.25', '#e4efff', .45), ('1', '#b8d0ff', 0)]))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u), rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n1', .4, 'multiply', u)]
    # the old north: soft craters; the middle: long fractures and ridged plains
    pal = ('#8898aa', '#ffffff', '#e6ecf2', '#ffffff', '#ffffff')
    cr = []
    for _ in range(120):
        la = rnd.uniform(-10, 80)
        cr.append(g.crater(la, rnd.uniform(-180, 180), 1.2 + 6 * rnd.random() ** 2.4, pal, depth=.6, op=.7, night_ok=True))
    b.append('<g filter="url(#%sb05)">%s</g>' % (u, ''.join(cr)))
    fr = []
    for _ in range(26):
        la, lo = rnd.uniform(-45, 40), rnd.uniform(-120, 120); a = rnd.uniform(-.6, .6)
        fr.append(g.line([(la + k * math.sin(a) * 2.2, lo + k * math.cos(a) * 3) for k in range(-8, 9)]))
    b.append('<path d="%s" fill="none" stroke="#8aa2c0" stroke-opacity=".3" stroke-width="2" filter="url(#%sb1)"/><path d="%s" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-width=".6" transform="translate(.8 -.6)"/>' % (''.join(fr), u, ''.join(fr)))
    # the south polar terrain: a wrinkled margin of ridges, then the four tiger stripes
    marg = ''.join(g.line([(-55 + 3 * math.sin(k * .7 + j) - j * 2.2, -180 + k * 8) for k in range(46)]) for j in range(5))
    b.append('<path d="%s" fill="none" stroke="#6a84a4" stroke-opacity=".28" stroke-width="1.6" filter="url(#%sb1)"/>' % (marg, u))

    def sp(x, y):
        r = math.hypot(x, y); return (-90 + r, math.degrees(math.atan2(y, x)))
    stripes = []
    src = []
    for k in range(4):
        y0 = -13 + k * 8.5
        pts = [sp(x, y0 + .004 * x * x - .06 * x) for x in [(-19 + j * 1.9) for j in range(21)]]
        d = g.line(pts)
        stripes.append('<path d="%s" fill="none" stroke="#4a8ad0" stroke-opacity=".45" stroke-width="10" filter="url(#%sb2)"/><path d="%s" fill="none" stroke="#7ab4ee" stroke-opacity=".6" stroke-width="3.6" filter="url(#%sb05)"/>'
                       '<path d="%s" fill="none" stroke="#1e3e6e" stroke-opacity=".75" stroke-width="1"/>' % (d, u, d, u, d))
        src += [pts[j] for j in range(1, 21, 2)]
    b.append(''.join(stripes))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n3', .14, 'overlay', u))
    b.append(g.shade(u, amb=.22, gamma=.6, night=.92, col='#070c18'))
    # Saturnshine: faint warm light on the night side
    defs += radial(u, 'ss', [('0', '#fff0d8', .08), ('1', '#fff0d8', 0)], cx='.3', cy='.7', r='.7') + limb_dark(u, 'limbd', (.7, .1, .35), '#0a1020')
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sss)"/><circle cx="%d" cy="%d" r="%d" fill="url(#%slimbd)"/>' % (cx, cy, R, u, cx, cy, R, u))
    # the jets: a hundred sprays from the stripes, backlit, fanning into a plume taller than the moon
    jets = []
    for la, lo in src:
        X, Y = g.P(la, lo)
        a = math.atan2(Y - cy, X - cx) + rnd.uniform(-.45, .45)
        L = rnd.uniform(90, 300)
        w = rnd.uniform(4, 16)
        ex, ey = X + L * math.cos(a), Y + L * math.sin(a)
        px, py = -math.sin(a), math.cos(a)
        jets.append('<path d="M%s %sL%s %sL%s %sZ" fill="url(#%sjet)" opacity="%s" transform="rotate(0)"/>' % (
            f(X), f(Y), f(ex + px * w), f(ey + py * w), f(ex - px * w), f(ey - py * w), u, f(rnd.uniform(.25, .6))))
    # the gradient on each jet must run along it: use one gradient in user space per jet instead
    jets = []
    for i, (la, lo) in enumerate(src):
        X, Y = g.P(la, lo)
        a = math.atan2(Y - cy, X - cx) + rnd.uniform(-.4, .4)
        L = rnd.uniform(120, 340); w = rnd.uniform(2, 9)
        ex, ey = X + L * math.cos(a), Y + L * math.sin(a); px, py = -math.sin(a), math.cos(a)
        defs += '<linearGradient id="%sj%d" gradientUnits="userSpaceOnUse" x1="%s" y1="%s" x2="%s" y2="%s"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".3" stop-color="#dfeaff" stop-opacity=".4"/><stop offset="1" stop-color="#b8d0ff" stop-opacity="0"/></linearGradient>' % (u, i, f(X), f(Y), f(ex), f(ey))
        jets.append('<path d="M%s %sL%s %sL%s %sZ" fill="url(#%sj%d)" opacity="%s"/>' % (f(X), f(Y), f(ex + px * w), f(ey + py * w), f(ex - px * w), f(ey - py * w), u, i, f(rnd.uniform(.3, .7))))
    px_, py_ = g.P(-90, 0)
    a0 = math.atan2(py_ - cy, px_ - cx)
    defs += '<radialGradient id="%sfan" gradientUnits="userSpaceOnUse" cx="%s" cy="%s" r="330"><stop offset="0" stop-color="#f4f8ff" stop-opacity=".55"/><stop offset=".4" stop-color="#c8dcff" stop-opacity=".18"/><stop offset="1" stop-color="#a8c4ff" stop-opacity="0"/></radialGradient>' % (u, f(px_), f(py_))
    fan = '<path d="M%s %sL%s %sA330 330 0 0 1 %s %sZ" fill="url(#%sfan)" filter="url(#%sb16)"/>' % (
        f(px_), f(py_), f(px_ + 330 * math.cos(a0 - .55)), f(py_ + 330 * math.sin(a0 - .55)), f(px_ + 330 * math.cos(a0 + .55)), f(py_ + 330 * math.sin(a0 + .55)), u, u)
    jetg = fan + '<g filter="url(#%sb6)">%s</g><g filter="url(#%sb1)">%s</g>' % (u, ''.join(jets), u, ''.join(jets))
    obj = svg(W, H, jetg + '<circle cx="%d" cy="%d" r="%d" fill="#04060c"/><g clip-path="url(#%sdisk)">%s</g>' % (cx, cy, R, u, ''.join(b)) +
              '<g opacity=".55">%s</g>' % jetg.replace('url(#%sb16)' % u, 'url(#%sb6)' % u) +
              lit_rim(g, u, '#ffffff', 6, .5, 'b6', 70) + lit_rim(g, u, '#ffffff', 1.6, .9, 'b1', 64) + grain(u + 'o', W, H, .1), defs)
    ann = [top('SOUTH POLAR TERRAIN · WATER-ICE JETS'), scalebar(22, 800, 100 / 252 * R, '100 KM')]
    return bg, obj, svg(W, H, ''.join(ann))



# ================================================================= URANUS
def uranus(u):
    """Uranus on its side: a pale cyan ball with almost nothing on it, its dark narrow rings standing nearly upright, five moons in the ring plane."""
    cx, cy, R = 291, 338, 128
    rnd = random.Random(1781)
    tilt = 17                                   # how far the ring plane opens toward us
    rot = 97                                    # the pole lies almost in the picture, pointing right
    S = (-.3, .1, .95)
    g = Globe(cx, cy, R, tilt, 0, rot, S)
    # ring geometry: circles in the equatorial plane, projected; the pole direction on the page
    pole = g.v(90, 0)
    ang = math.degrees(math.atan2(-pole[1], pole[0]))     # page angle of the projected pole
    k = math.sin(math.radians(tilt))

    def ring_arc(r, front, w, col, op):
        # front half: the side of the ellipse nearer to us (toward the visible pole's opposite on the page)
        a0, a1 = (90, 270) if front else (-90, 90)
        pts = []
        for i in range(61):
            t = math.radians(a0 + (a1 - a0) * i / 60)
            x, y = r * k * math.cos(t), r * math.sin(t)
            ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
        return '<path d="M%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="%s"/>' % ('L'.join('%s %s' % (f(x), f(y)) for x, y in pts), col, f(w), f(op))
    rings = [(1.637, .5, .16), (1.652, .5, .14), (1.666, .5, .14), (1.751, .6, .18), (1.786, .6, .2), (1.838, .6, .18), (1.862, .7, .22), (1.877, .6, .2), (2.0, 2.2, .42)]
    back = ''.join(ring_arc(r * R, False, w, '#c8d8dc', op * .7) for r, w, op in rings)
    front = ''.join(ring_arc(r * R, True, w, '#dfeaec', op) for r, w, op in rings)
    back += ring_arc(2.0 * R, False, 7, '#a8c8d0', .08); front += ring_arc(2.0 * R, True, 7, '#b8d8e0', .1)
    bg = sky(u, H, ('#0e1a22', '#060c12', '#020406'), 210, 1781, 3, cy='.4')
    defs = (clip_defs(u, g) +
            radial(u, 'base', [('0', '#d4f4f4', 1), ('.5', '#bdeaee', 1), ('.85', '#98d4de', 1), ('1', '#6ab4c6', 1)], cx='.5', cy='.46', r='.7') +
            tint_noise(u, 'n1', '.01 .03', 3, 151, '#5aa8b8', 1.4, -.55) + grey_noise(u, 'n3', '.3', 2, 153) +
            blur(u, 'b1', 1) + blur(u, 'b4', 4) + blur(u, 'b10', 10, 40) + blur(u, 'b20', 20, 60) + blur(u, 'bsh', 7, 10) + blur(u, 'rb', .6, 10) +
            radial(u, 'halo', [('.92', '#b8f0f4', 0), ('.965', '#c8f4f8', .16), ('1', '#c8f4f8', 0)]))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u)]
    # faint latitude bands, a brighter polar hood, a couple of small bright clouds
    bands = []
    for la, w, c, op in [(-40, 14, '#8ecad6', .25), (-20, 10, '#b8eef2', .3), (0, 8, '#9ad4de', .2), (20, 10, '#b4ecf0', .25), (40, 12, '#8cc6d2', .25), (58, 8, '#d8fafa', .35)]:
        bands.append('<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="%s"/>' % (g.line([(la, -180 + i * 10) for i in range(37)]), c, f(w), f(op)))
    b.append('<g filter="url(#%sb10)">%s</g>' % (u, ''.join(bands)))
    b.append('<path d="%s" fill="#eaffff" opacity=".4" filter="url(#%sb20)"/>' % (g.poly([(62 + 3 * math.sin(i), -180 + i * 10) for i in range(37)] + [(90, 180 - i * 30) for i in range(13)]), u))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n1', .35, 'multiply', u))
    for la, lo in [(34, 20), (30, 60)]:
        b.append('<path d="%s" fill="#ffffff" opacity=".55" filter="url(#%sb1)"/>' % (g.sblob(la, lo, 1.4, 5, rnd, 10, .3), u))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n3', .08, 'overlay', u))
    b.append(g.shade(u, amb=.6, gamma=1.3, night=.95, col='#021016'))
    defs += limb_dark(u, 'limbd', (.5, .28, .62), '#0a3444')
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimbd)"/>' % (cx, cy, R, u))
    # the five major moons, on their orbits in the ring plane
    moons = []
    for r, t, rad, col in [(2.6, 210, 1, '#c8ccd0'), (3.37, 20, 1.3, '#c8ccd0'), (5.08, 174, 2.2, '#c8ccd0'), (7.47, 3, 2.8, '#d4d6d8')]:
        tt = math.radians(t); x, y = r * R * k * math.cos(tt), r * R * math.sin(tt)
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        X, Y = cx + x * ca - y * sa, cy + x * sa + y * ca
        if -10 < X < W + 10 and -10 < Y < H + 10:
            moons.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity=".12"/><circle cx="%s" cy="%s" r="%s" fill="%s"/><circle cx="%s" cy="%s" r="%s" fill="#000" opacity=".45"/>' % (
                f(X), f(Y), f(rad * 3), col, f(X), f(Y), f(rad), col, f(X + rad * .35), f(Y + rad * .1), f(rad * .8)))
    obj = svg(W, H, '<g filter="url(#%srb)">%s</g>' % (u, back) + '<circle cx="%d" cy="%d" r="%s" fill="url(#%shalo)"/>' % (cx, cy, f(R * 1.06), u) +
              '<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)) + '<g filter="url(#%srb)">%s</g>' % (u, front) + ''.join(moons) +
              lit_rim(g, u, '#e8ffff', 1.2, .5, 'b1', 80) + grain(u + 'o', W, H, .09), defs)
    ann = [top('AXIAL TILT 97.8° · 13 RINGS'), scalebar(22, 800, 10000 / 25559 * R, '10,000 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= NEPTUNE
def neptune(u):
    """Neptune: deep azure, a dark storm with bright companion clouds, white methane cirrus, faint ring arcs, Triton close by."""
    cx, cy, R = 300, 346, 178
    rnd = random.Random(1846)
    S = (-.55, .24, .8)
    g = Globe(cx, cy, R, -22, 0, -18, S)
    tg = Globe(96, 176, 17, -30, 0, 0, S)
    k = math.sin(math.radians(22))
    ang = -18

    def ring(r, front, w, col, op, arcs=()):
        a0, a1 = (180, 360) if front else (0, 180)
        out = ''
        pts = []
        for i in range(91):
            t = math.radians(a0 + (a1 - a0) * i / 90)
            x, y = r * math.cos(t), r * k * math.sin(t)
            ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
        out += '<path d="M%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="%s"/>' % ('L'.join('%s %s' % (f(x), f(y)) for x, y in pts), col, f(w), f(op))
        for c0, c1 in arcs:
            if not (a0 <= c0 < a1): continue
            q = [(cx + r * math.cos(math.radians(t)) * math.cos(math.radians(ang)) - r * k * math.sin(math.radians(t)) * math.sin(math.radians(ang)),
                  cy + r * math.cos(math.radians(t)) * math.sin(math.radians(ang)) + r * k * math.sin(math.radians(t)) * math.cos(math.radians(ang))) for t in range(c0, c1 + 1)]
            out += '<path d="M%s" fill="none" stroke="#e8f0ff" stroke-width="%s" stroke-opacity=".55" stroke-linecap="round"/>' % ('L'.join('%s %s' % (f(x), f(y)) for x, y in q), f(w * 2.2))
        return out
    arcs = [(242, 250), (254, 258), (261, 266), (270, 272)]
    back = ring(2.15 * R, False, 1, '#9ab0e0', .16) + ring(2.54 * R, False, 1.1, '#9ab0e0', .2) + ring(1.69 * R, False, 3, '#8aa0d0', .05)
    front = ring(2.15 * R, True, 1, '#a8bcec', .2) + ring(2.54 * R, True, 1.1, '#a8bcec', .24, arcs) + ring(1.69 * R, True, 3, '#8aa0d0', .06)
    bg = sky(u, H, ('#0a1026', '#050814', '#020308'), 220, 1846, 4, cy='.42')
    defs = (clip_defs(u, g) + clip_defs(u, tg, 'tdisk') +
            radial(u, 'base', [('0', '#5a8cf0', 1), ('.45', '#3a68d8', 1), ('.8', '#2448b0', 1), ('1', '#142a78', 1)], cx='.36', cy='.36', r='.8') +
            radial(u, 'tb', [('0', '#f4e8e4', 1), ('.6', '#d8c4c0', 1), ('1', '#9a8a8c', 1)], cx='.36', cy='.36', r='.8') +
            tint_noise(u, 'n1', '.006 .04', 4, 161, '#10287a', 1.6, -.55) + tint_noise(u, 'n2', '.01 .08', 3, 163, '#a8d0ff', 2, -1.1) + grey_noise(u, 'n3', '.3', 2, 165) +
            rough(u, 'rs', '.02 .08', 5, 167, 1.6, 20) + blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b8', 8, 40) + blur(u, 'bsh', 7, 10) + blur(u, 'tsh', 1.4, 10) + blur(u, 'rb', .6, 10) +
            radial(u, 'halo', [('.93', '#6a9cff', 0), ('.97', '#7aa8ff', .22), ('1', '#7aa8ff', 0)]))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u), rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n1', .55, 'multiply', u)]
    bands = []
    for la, w, c, op in [(-68, 22, '#1a3488', .5), (-50, 10, '#4a78e0', .35), (-30, 14, '#2a52c0', .3), (-8, 18, '#5486ec', .3), (14, 12, '#2c56c4', .3), (34, 10, '#4a7ce4', .3), (56, 14, '#2a4ab0', .3)]:
        bands.append('<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="%s"/>' % (g.line([(la, -180 + i * 10) for i in range(37)]), c, f(w), f(op)))
    b.append('<g filter="url(#%sb8)">%s</g>' % (u, ''.join(bands)))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n2', .3, 'screen', u))
    # the Great Dark Spot, its bright companion clouds riding the south edge; a second small dark spot with a bright core
    m, _, _, _ = g.frame(-22, -18)
    b.append('<g transform="%s"><ellipse rx="34" ry="18" fill="#0e1c5c" opacity=".75" filter="url(#%sb3)"/><ellipse rx="24" ry="11" fill="#0a1448" opacity=".6" filter="url(#%sb1)"/>'
             '<ellipse cx="-2" cy="-2" rx="30" ry="15" fill="none" stroke="#6a98f0" stroke-opacity=".35" stroke-width="2" filter="url(#%sb1)"/></g>' % (m, u, u, u))
    m2, _, _, _ = g.frame(-54, 30)
    b.append('<g transform="%s"><ellipse rx="12" ry="7" fill="#0e1c5c" opacity=".7" filter="url(#%sb1)"/><ellipse rx="3" ry="2" fill="#fff" opacity=".8" filter="url(#%sb1)"/></g>' % (m2, u, u))
    # white methane cirrus: long thin bright streaks along the latitudes
    ci = []
    for la, lo, L, w, op in [(-28, -30, 40, 3.2, .85), (-30, 0, 22, 2, .7), (-40, -10, 60, 1.6, .6), (-42, 36, 12, 3, .9), (24, -40, 50, 2, .55), (28, 10, 34, 1.4, .5), (-18, 30, 26, 1.4, .45),
                               (-60, -40, 40, 1.4, .4), (40, -20, 30, 1.2, .4), (8, -60, 20, 1.2, .35)]:
        pts = [(la + .6 * math.sin(i * .5), lo + L * i / 12) for i in range(13)]
        ci.append('<path d="%s" fill="none" stroke="#ffffff" stroke-width="%s" stroke-opacity="%s" stroke-linecap="round"/>' % (g.line(pts), f(w), f(op)))
        ci.append('<path d="%s" fill="none" stroke="#dcecff" stroke-width="%s" stroke-opacity="%s" stroke-linecap="round"/>' % (g.line(pts), f(w * 4), f(op * .25)))
    b.append('<g filter="url(#%srs)">%s</g>' % (u, ''.join(ci)))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n3', .08, 'overlay', u))
    b.append(g.shade(u, amb=.1, gamma=.85, night=.97, col='#01020a'))
    defs += limb_dark(u, 'limbd', (.55, .3, .65), '#040c30')
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimbd)"/>' % (cx, cy, R, u))
    # Triton: pale pinkish ice, a bright southern cap
    tri = ('<circle cx="96" cy="176" r="17" fill="url(#%stb)"/>' % u +
           '<path d="%s" fill="#fff6f4" opacity=".6"/>' % tg.poly([(-40 + 4 * math.sin(i), -180 + i * 20) for i in range(19)] + [(-90, 180 - i * 60) for i in range(7)]) +
           '<path d="%s" fill="#b89898" opacity=".35"/>' % tg.sblob(10, 20, 14, 30, rnd) + tg.shade(u, amb=.1, gamma=.8, night=.96, col='#020308', filt='tsh'))
    obj = svg(W, H, '<g filter="url(#%srb)">%s</g>' % (u, back) + '<circle cx="%d" cy="%d" r="%s" fill="url(#%shalo)"/>' % (cx, cy, f(R * 1.07), u) +
              '<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)) + '<g filter="url(#%srb)">%s</g>' % (u, front) +
              '<g clip-path="url(#%stdisk)">%s</g>' % (u, tri) + lit_rim(g, u, '#a8c8ff', 3, .35, 'b3', 80) + lit_rim(g, u, '#dce8ff', 1, .5, 'b1', 70) + grain(u + 'o', W, H, .1), defs)
    ann = [top('WINDS 2,100 KM/H · 30 AU FROM THE SUN'), scalebar(22, 800, 10000 / 24764 * R, '10,000 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= PLUTO
def pluto(u):
    """Pluto as New Horizons met it: peach and beige, the pale heart of Tombaugh Regio, dark red Cthulhu on the equator, blue haze layers on the limb, Charon beyond."""
    cx, cy, R = 291, 350, 196
    rnd = random.Random(1930)
    S = (-.42, .2, .88)
    g = Globe(cx, cy, R, 22, 178, -8, S)
    cg = Globe(482, 150, 30, 30, 0, -8, S)
    bg = sky(u, H, ('#14121a', '#08080e', '#020204'), 240, 1930, 4)
    defs = (clip_defs(u, g) + clip_defs(u, cg, 'cdisk') +
            radial(u, 'base', [('0', '#ecd2b4', 1), ('.5', '#d8b08c', 1), ('.85', '#b8866a', 1), ('1', '#8a6450', 1)], cx='.4', cy='.4', r='.8') +
            radial(u, 'cb', [('0', '#d8d4d0', 1), ('.6', '#b4b0ac', 1), ('1', '#7a7672', 1)], cx='.36', cy='.36', r='.8') +
            tint_noise(u, 'n1', '.016', 5, 171, '#5a3422', 2, -.75) + tint_noise(u, 'n2', '.05', 3, 173, '#fff4e8', 2.2, -1.1) + grey_noise(u, 'n3', '.3', 2, 175) +
            rough(u, 'rg', '.03', 22, 177, 1.6, 20) + rough(u, 'rgf', '.07', 6, 179, .5, 10) +
            blur(u, 'b05', .5) + blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b8', 8, 40) + blur(u, 'bsh', 6, 10) + blur(u, 'csh', 2, 10))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u), rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n1', .45, 'multiply', u)]
    # the northern cap: Lowell Regio, grey-yellow; mid-latitude bands
    b.append('<path d="%s" fill="#c8bea8" opacity=".55" filter="url(#%sb8)"/>' % (g.poly([(56 + 4 * math.sin(i * .8), -180 + i * 10) for i in range(37)] + [(90, 180 - i * 30) for i in range(13)]), u))
    b.append('<path d="%s" fill="#a88a78" opacity=".3" filter="url(#%sb8)"/>' % (g.poly([(40 + 3 * math.sin(i), -180 + i * 10) for i in range(37)] + [(52 + 2 * math.sin(i * 1.3), 180 - i * 10) for i in range(37)]), u))
    # dark red-brown maculae along the equator: Cthulhu to the west, Krun, Balrog to the east
    dk = []
    cth = [(-6, 58), (6, 70), (14, 86), (12, 104), (8, 122), (4, 140), (-4, 154), (-14, 160), (-26, 156), (-30, 138), (-28, 112), (-24, 88), (-18, 68)]
    dk.append('<path d="%s" fill="#6a2c1c" opacity=".85"/>' % g.poly(cth))
    dk.append('<path d="%s" fill="#3e1c10" opacity=".5"/>' % g.poly([(la * .7 - 5, lo) for la, lo in cth[2:10]] + [(-18, 125), (-14, 95)]))
    for la, lo, rl, ro, op in [(-10, 200, 8, 14, .7), (-14, 228, 10, 22, .75), (-8, 262, 9, 20, .7), (-6, 40, 8, 18, .6)]:
        dk.append('<path d="%s" fill="#5e2e1c" opacity="%s"/>' % (g.sblob(la, lo, rl, ro, rnd, 16, .35), f(op)))
    b.append('<g filter="url(#%sb8)" opacity=".6">%s</g><g filter="url(#%srg)">%s</g>' % (u, ''.join(dk), u, ''.join(dk)))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n2', .35, 'screen', u))
    # the heart: Sputnik Planitia, a smooth nitrogen-ice plain in convection cells, and the brighter eastern lobe
    sp = [(38, 172), (36, 165), (30, 161), (22, 161), (13, 163), (5, 167), (-4, 172), (-12, 178), (-17, 183), (-10, 187), (0, 188), (12, 187), (24, 185), (33, 181)]
    east = [(38, 180), (34, 194), (27, 207), (17, 215), (5, 217), (-6, 210), (-13, 198), (-17, 186), (-8, 184), (8, 183), (24, 181)]
    b.append('<path d="%s" fill="#efe0cc" opacity=".7" filter="url(#%sb8)"/>' % (g.poly(east), u))
    b.append('<g filter="url(#%sb3)"><path d="%s" fill="#f2e6d6" opacity=".55" filter="url(#%srg)"/></g>' % (u, g.poly(east), u))
    b.append(''.join('<path d="%s" fill="#c8a88c" opacity=".25" filter="url(#%sb3)"/>' % (g.sblob(rnd.uniform(-6, 30), rnd.uniform(192, 212), 3, 5, rnd), u) for _ in range(8)))
    b.append('<path d="%s" fill="#f2e2cc" opacity=".6" filter="url(#%sb8)"/>' % (g.poly(sp), u))
    b.append('<g filter="url(#%sb1)"><path d="%s" fill="#f6ecdc" opacity=".92" filter="url(#%srgf)"/></g>' % (u, g.poly(sp), u))
    cells = []
    for _ in range(90):
        la, lo = rnd.uniform(-14, 38), rnd.uniform(160, 190)
        cells.append('<path d="%s" fill="%s" opacity=".35" stroke="#bfa288" stroke-opacity=".35" stroke-width=".6"/>' % (g.sblob(la, lo, 1.6, 2.2, rnd, 7, .2), rnd.choice(['#fbf4ea', '#efe2d0', '#f6ecdc'])))
    defs += '<clipPath id="%ssp"><path d="%s"/></clipPath>' % (u, g.poly(sp))
    b.append('<g clip-path="url(#%ssp)" filter="url(#%sb05)">%s</g>' % (u, u, ''.join(cells)))
    # the water-ice mountains on the heart's western shore, Tenzing and Hillary
    b.append(''.join(g.hill(la + rnd.uniform(-1, 1), lo + rnd.uniform(-1, 1), rnd.uniform(1.2, 2.6), ('#3a2418', '#e8d4c0', '#8a6a58'), rnd.uniform(1, 1.8), rnd.uniform(0, 180)) for la, lo in
                 [(-16, 176 - i * 2.2) for i in range(6)] + [(-6, 166 - i * 1.6) for i in range(5)]))
    # craters, sparse, softened
    pal = ('#4a2e20', '#f4e2cc', '#c8a88c', '#f8eadc', '#ffffff')
    b.append(''.join(g.crater(math.degrees(math.asin(rnd.uniform(-.6, 1))), rnd.uniform(80, 280), 1 + 5 * rnd.random() ** 3, pal, op=.55) for _ in range(90)))
    b.append(rect_fill(cx - R, cy - R, 2 * R, 2 * R, 'n3', .12, 'overlay', u))
    b.append(g.shade(u, amb=.14, gamma=.85, night=.97, col='#040306'))
    defs += limb_dark(u, 'limbd', (.66, .18, .5), '#1a0c08')
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimbd)"/>' % (cx, cy, R, u))
    # the haze: thin blue layers stacked above the limb, strongest toward the sun
    hz = []
    for i, (dr, op) in enumerate([(2.5, .55), (5.5, .4), (8.5, .3), (12, .22), (16, .14), (21, .09)]):
        hz.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#8cc0ff" stroke-width="%s" stroke-opacity="%s"/>' % (cx, cy, f(R + dr), f(1.4 - i * .12), f(op)))
    a = math.degrees(math.atan2(-S[1], S[0]))
    defs += '<linearGradient id="%shzm" gradientUnits="userSpaceOnUse" x1="%s" y1="%s" x2="%s" y2="%s"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient><mask id="%shm"><rect width="%d" height="%d" fill="url(#%shzm)"/></mask>' % (
        u, f(cx + R * math.cos(math.radians(a))), f(cy + R * math.sin(math.radians(a))), f(cx - R * math.cos(math.radians(a))), f(cy - R * math.sin(math.radians(a))), u, W, H, u)
    haze = '<g mask="url(#%shm)"><g filter="url(#%sb1)">%s</g><circle cx="%d" cy="%d" r="%s" fill="none" stroke="#6aa0f0" stroke-width="16" stroke-opacity=".12" filter="url(#%sb8)"/></g>' % (u, u, ''.join(hz), cx, cy, f(R + 10), u)
    # Charon: grey, the red Mordor Macula at its pole
    ch = ('<circle cx="482" cy="150" r="30" fill="url(#%scb)"/>' % u +
          '<path d="%s" fill="#7a3a2a" opacity=".6" filter="url(#%sb3)"/>' % (cg.poly([(66 + 4 * math.sin(i), -180 + i * 20) for i in range(19)] + [(90, 180 - i * 60) for i in range(7)]), u) +
          '<path d="%s" fill="#6a6660" opacity=".35"/>' % cg.sblob(0, 20, 10, 50, rnd, 12, .3) +
          ''.join(cg.crater(rnd.uniform(-50, 50), rnd.uniform(-70, 70), rnd.uniform(.6, 2), ('#3a3632', '#f0ece8', '#aaa6a0', '#ffffff', '#fff'), op=.7) for _ in range(12)) +
          cg.shade(u, amb=.1, gamma=.85, night=.97, col='#020204', filt='csh'))
    obj = svg(W, H, '<g clip-path="url(#%scdisk)">%s</g>' % (u, ch) + haze + '<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)) +
              lit_rim(g, u, '#f4f0ff', 1, .45, 'b1', 80) + grain(u + 'o', W, H, .11), defs)
    ann = [top('TOMBAUGH REGIO · 14 JULY 2015'), scalebar(22, 800, 1000 / 1188 * R, '1,000 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= ʻOUMUAMUA
def oumuamua(u):
    """ʻOumuamua outbound: a long red shard tumbling end over end, its earlier poses fading behind it on the hyperbola it rode past the Sun."""
    rnd = random.Random(2017)
    bg = sky(u, H, ('#0c0e1c', '#06070f', '#020205'), 380, 2017, 6, cy='.4', extra=
             '<path d="M-80 520Q260 360 680 60" stroke="#b8c4ff" stroke-opacity=".06" stroke-width="190" fill="none" filter="url(#%smw)"/>' % u +
             '<g opacity=".45">%s</g>' % starfield(W, H, 520, 2018, 0, ('#ffffff', '#cfd8ff', '#ffe8d0'), u=u),
             extra_defs=blur(u, 'mw', 40, 60))
    # the hyperbola, e = 1.2, the Sun at its focus in the lower left; the body on the outbound leg
    fx, fy = 104, 640
    e, p = 1.2, 116
    bx, by = 330, 318
    phi = math.atan2(by - fy, bx - fx); rb = math.hypot(bx - fx, by - fy)
    om = phi + math.acos((p / rb - 1) / e)
    P = lambda d: (lambda th, r: (fx + r * math.cos(th), fy + r * math.sin(th)))(om + d, p / (1 + e * math.cos(d)))
    d_body = phi - om
    path = [P(math.radians(-142 + 284 * i / 160)) for i in range(161)]
    t0, t1 = P(d_body - .01), P(d_body + .01)
    heading = math.degrees(math.atan2(t0[1] - t1[1], t0[0] - t1[0]))
    L, Wd = 262, 42
    outline = []
    for i in range(20):
        t = 2 * math.pi * i / 20
        c, s_ = math.cos(t), math.sin(t)
        rx = L / 2 * (abs(c) ** .9) * (1 if c >= 0 else -1)
        ry = Wd / 2 * (abs(s_) ** .7) * (1 if s_ >= 0 else -1) * (1 - .2 * c)
        outline.append((rx * (1 + rnd.uniform(-.04, .04)), ry * (1 + rnd.uniform(-.22, .22))))
    shape = 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in outline) + 'Z'
    defs = (blur(u, 'b05', .5) + blur(u, 'b1', 1) + blur(u, 'b2', 2) + blur(u, 'b5', 5, 60) + blur(u, 'b20', 20, 80) +
            tint_noise(u, 'n1', '.07 .16', 4, 191, '#1a0804', 2, -.75) + tint_noise(u, 'n2', '.22', 3, 193, '#f0b490', 2.4, -1.4) +
            radial(u, 'sun', [('0', '#fffaf0', 1), ('.08', '#fff0d0', .7), ('.3', '#ffd8a0', .14), ('1', '#ffd8a0', 0)]) +
            '<clipPath id="%sbody"><path d="%s"/></clipPath>' % (u, shape))

    def pose(x, y, a, sc, op, full):
        # light arrives from the Sun: express its direction in the body's own frame
        sa = math.atan2(fy - y, fx - x) - math.radians(a)
        dx, dy = .35 * math.cos(sa), (1 if math.sin(sa) >= 0 else -1)
        gid = '%sl%d' % (u, int(a * 10) % 100000)
        gd = ('<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s"><stop offset="0" stop-color="#f0b088"/><stop offset=".18" stop-color="#c07650"/>'
              '<stop offset=".5" stop-color="#6a3020"/><stop offset=".85" stop-color="#220c06"/><stop offset="1" stop-color="#3a1a10"/></linearGradient>') % (gid, f(.5 + .5 * dx), f(.5 + .5 * dy), f(.5 - .5 * dx), f(.5 - .5 * dy))
        g0 = '<g transform="translate(%s %s) rotate(%s) scale(%s)" opacity="%s">' % (f(x), f(y), f(a), f(sc), f(op))
        if not full:
            return gd, g0 + '<path d="%s" fill="#e8b8a0" opacity=".08"/><path d="%s" fill="none" stroke="#f4d4c4" stroke-opacity=".8" stroke-width="%s"/></g>' % (shape, shape, f(.9 / sc))
        inner = ['<path d="%s" fill="url(#%s)"/>' % (shape, gid),
                 '<rect x="%s" y="%s" width="%d" height="%d" filter="url(#%sn1)" opacity=".8" style="mix-blend-mode: multiply"/>' % (f(-L / 2), f(-Wd / 2), L, Wd, u),
                 '<rect x="%s" y="%s" width="%d" height="%d" filter="url(#%sn2)" opacity=".35" style="mix-blend-mode: screen"/>' % (f(-L / 2), f(-Wd / 2), L, Wd, u)]
        # facets: broken planes across the shard, each tilted a little toward or away from the light
        for i in range(16):
            x0 = -L / 2 + L * i / 16 + rnd.uniform(-4, 4); w = L / 16 * rnd.uniform(.8, 1.6)
            inner.append('<path d="M%s %sL%s %sL%s %sL%s %sZ" fill="%s" opacity="%s"/>' % (
                f(x0), f(-Wd), f(x0 + w), f(-Wd), f(x0 + w + rnd.uniform(-8, 8)), f(Wd), f(x0 + rnd.uniform(-8, 8)), f(Wd),
                rnd.choice(['#ffd0b0', '#1a0804']), f(rnd.uniform(.03, .09))))
        for _ in range(9):
            px, py = rnd.uniform(-L * .42, L * .42), rnd.uniform(-Wd * .3, Wd * .2); r = rnd.uniform(1.2, 3)
            inner.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#1a0804" opacity=".35"/>' % (f(px), f(py), f(r), f(r * .6)))
        rim = '<path d="%s" fill="none" stroke="#ffe0c8" stroke-opacity=".45" stroke-width="2" transform="translate(%s %s)" clip-path="url(#%sbody)" filter="url(#%sb05)"/>' % (shape, f(-dx * 5), f(-dy * 3.5), u, u)
        return gd, g0 + '<g clip-path="url(#%sbody)" filter="url(#%sb05)">%s</g>%s</g>' % (u, u, ''.join(inner), rim)

    o = ['<circle cx="%d" cy="%d" r="70" fill="url(#%ssun)"/>' % (fx, fy, u), spike_star(fx, fy, 3, '#fff0d0', 28, 1, 1)]
    o.append('<path d="M%s" fill="none" stroke="#c8d4ff" stroke-opacity=".35" stroke-width=".9" stroke-dasharray="1 6" stroke-linecap="round"/>' % 'L'.join('%s %s' % (f(x), f(y)) for x, y in path))
    # where it was: the tumble (one turn in about eight hours) fading back toward perihelion
    hx, hy = math.cos(math.radians(heading)), math.sin(math.radians(heading))
    for j in range(6, 0, -1):
        gd, pg = pose(bx - hx * 22 * j, by - hy * 22 * j, heading + 24 - 21 * j, 1, .34 - .05 * j, False)
        defs += gd; o.append(pg)
    gd, pg = pose(bx - hx * 8, by - hy * 8, heading + 24 - 8, 1, .3, False)
    defs += gd; o.append('<g filter="url(#%sb5)">%s</g>' % (u, pg))
    gd, pg = pose(bx, by, heading + 24, 1, 1, True)
    defs += gd; o.append(pg)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('1I/2017 U1 · e = 1.20 · 26 KM/S AT INFINITY'), scalebar(22, 800, 100 / 400 * L, '~100 M')]
    return bg, obj, svg(W, H, ''.join(ann))


PLATES = {
    'SUN': sun, 'MERCURY': mercury, 'VENUS': venus, 'MARS': mars, 'VALLES-MARINERIS': valles, 'IO': io, 'GANYMEDE': ganymede,
    'ENCELADUS': enceladus, 'URANUS': uranus, 'NEPTUNE': neptune, 'PLUTO': pluto, 'OUMUAMUA': oumuamua,
}

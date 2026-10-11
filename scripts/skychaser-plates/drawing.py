"""Skychaser card system — four fronts, four backs, three artboards.

Every card is a stack: an art window of three parallax layers (sky, object,
annotation) under a frame of foil, guilloche and microtext, with foil, glitter
and glare on top. All geometry is generated here and written as literal SVG.
"""
import json, math, os, random, datetime

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, 'canvas', 'project')

def f(x):
    s = '%.1f' % x
    return s[:-2] if s.endswith('.0') else s

def rr(x, y, w, h, r):
    return ('M%s %sH%sA%s %s 0 0 1 %s %sV%sA%s %s 0 0 1 %s %sH%sA%s %s 0 0 1 %s %sV%sA%s %s 0 0 1 %s %sZ' % (
        f(x + r), f(y), f(x + w - r), f(r), f(r), f(x + w), f(y + r), f(y + h - r), f(r), f(r), f(x + w - r), f(y + h),
        f(x + r), f(r), f(r), f(x), f(y + h - r), f(y + r), f(r), f(r), f(x + r), f(y)))

def blob(cx, cy, rx, ry, rnd, n=14, j=0.22):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        k = 1 + rnd.uniform(-j, j)
        pts.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a)))
    d = 'M%s %s' % (f((pts[0][0] + pts[-1][0]) / 2), f((pts[0][1] + pts[-1][1]) / 2))
    for i in range(n):
        p = pts[i]; q = pts[(i + 1) % n]
        d += 'Q%s %s %s %s' % (f(p[0]), f(p[1]), f((p[0] + q[0]) / 2), f((p[1] + q[1]) / 2))
    return d + 'Z'

# ----------------------------------------------------------------- metals
METAL = {
    'common':    ['#f4f6fa', '#9aa3b5', '#e3e8ef', '#6f788a', '#cfd5df'],
    'rare':      ['#e6eefa', '#6c93cb', '#2855a4', '#c0d1e9', '#2d65b5'],
    'epic':      ['#fff3cf', '#e0a84a', '#fde6a8', '#9c6a22', '#ffd98a'],
    'legendary': ['#fffaf0', '#ffe3a3', '#f4c9ff', '#bfe9ff', '#ffe9b8'],
}
METAL_INK = {'common': '#dfe4ec', 'rare': '#a9c1e4', 'epic': '#ffd98a', 'legendary': '#fff0cc'}

def metal_defs(u, rarity):
    m = METAL[rarity]
    st = ''.join('<stop offset="%s" stop-color="%s"/>' % (f(i / (len(m) - 1)), c) for i, c in enumerate(m))
    return ('<linearGradient id="%smetal" x1="0" y1="0" x2="1" y2="1">%s</linearGradient>'
            '<linearGradient id="%smetalH" x1="0" y1="0" x2="1" y2="0">%s</linearGradient>') % (u, st, u, st)

# ----------------------------------------------------------------- sky
def starfield(w, h, n, seed, spikes=5, tints=('#ffffff', '#dfe8ff', '#fff1dc', '#cfe0ff'), u='s'):
    r = random.Random(seed)
    out = []
    for _ in range(n):
        m = r.random() ** 3.2
        out.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (
            f(r.uniform(0, w)), f(r.uniform(0, h)), f(0.3 + 1.2 * m), r.choice(tints), f(0.25 + 0.7 * r.random() ** .6)))
    for _ in range(spikes):
        x, y = r.uniform(20, w - 20), r.uniform(20, h - 20)
        L = r.uniform(10, 22); c = r.choice(tints)
        out.append('<g opacity="%s"><circle cx="%s" cy="%s" r="6" fill="%s" opacity=".12"/><circle cx="%s" cy="%s" r="1.5" fill="#fff"/>'
                   '<rect x="%s" y="%s" width="%s" height=".6" fill="url(#%sspH)"/><rect x="%s" y="%s" width=".6" height="%s" fill="url(#%sspV)"/></g>' % (
                       f(r.uniform(.6, 1)), f(x), f(y), c, f(x), f(y), f(x - L), f(y - .3), f(2 * L), u, f(x - .3), f(y - L), f(2 * L), u))
    return ''.join(out)

SPIKE_DEFS = ('<linearGradient id="{u}spH" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
              '<linearGradient id="{u}spV" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>')

def grain(u, w, h, op=.10):
    return ('<filter id="%sgr" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<rect width="%d" height="%d" filter="url(#%sgr)" opacity="%s" style="mix-blend-mode: overlay"/>') % (u, w, h, u, f(op))

def svg(w, h, inner, defs='', extra=''):
    return ('<svg width="100%%" height="100%%" viewBox="0 0 %d %d" preserveAspectRatio="xMidYMid slice" style="display: block" aria-hidden="true"%s><defs>%s</defs>%s</svg>' % (w, h, extra, defs, inner))

# ----------------------------------------------------------------- labels
LBL = "font-family: 'JetBrains Mono', monospace; font-size: 8.5px; letter-spacing: 1.4px"

def label(pt, at, lines, anchor='start', color='rgba(245,241,232,.82)', dot=True, elbow=True):
    (px, py), (lx, ly) = pt, at
    ex = lx - 6 if anchor == 'start' else lx + 6
    path = 'M%s %sL%s %sL%s %s' % (f(px), f(py), f(ex), f(ly - 3), f(ex), f(ly - 3)) if not elbow else 'M%s %sL%s %sL%s %s' % (f(px), f(py), f(px + (ex - px) * .35), f(ly - 3), f(ex), f(ly - 3))
    out = '<path d="%s" fill="none" stroke="rgba(245,241,232,.42)" stroke-width=".6"/>' % path
    if dot:
        out += '<circle cx="%s" cy="%s" r="2.2" fill="none" stroke="%s" stroke-width=".8"/><circle cx="%s" cy="%s" r=".8" fill="%s"/>' % (f(px), f(py), color, f(px), f(py), color)
    for i, t in enumerate(lines):
        op = '1' if i == 0 else '.62'
        out += '<text x="%s" y="%s" text-anchor="%s" fill="%s" opacity="%s" style="%s">%s</text>' % (f(lx), f(ly + i * 11), anchor, color, op, LBL, t)
    return out

def scalebar(x, y, w, text, anchor='start'):
    return ('<g stroke="rgba(245,241,232,.6)" stroke-width=".7"><line x1="%s" y1="%s" x2="%s" y2="%s"/><line x1="%s" y1="%s" x2="%s" y2="%s"/><line x1="%s" y1="%s" x2="%s" y2="%s"/></g>'
            '<text x="%s" y="%s" text-anchor="%s" fill="rgba(245,241,232,.7)" style="%s">%s</text>') % (
        f(x), f(y), f(x + w), f(y), f(x), f(y - 3), f(x), f(y + 3), f(x + w), f(y - 3), f(x + w), f(y + 3),
        f(x if anchor == 'start' else x + w), f(y - 7), anchor, LBL, text)

def reticle(cx, cy, r, ticks=72, major=6, op=.3):
    out = ['<circle cx="%s" cy="%s" r="%s" fill="none" stroke="rgba(245,241,232,%s)" stroke-width=".6" stroke-dasharray="1 4"/>' % (f(cx), f(cy), f(r), f(op))]
    for i in range(ticks):
        a = 2 * math.pi * i / ticks
        L = 7 if i % (ticks // major) == 0 else 3
        out.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="rgba(245,241,232,%s)" stroke-width=".6"/>' % (
            f(cx + r * math.cos(a)), f(cy + r * math.sin(a)), f(cx + (r + L) * math.cos(a)), f(cy + (r + L) * math.sin(a)), f(op + .15)))
    return ''.join(out)

# ================================================================= SATURN
def saturn(u, h=620):
    W = 582
    cx, cy, rot, sc = 291, 340, -16, 0.8
    B = math.radians(24); sB, cB = math.sin(B), math.cos(B)
    a, b = 120.0, 108.0
    ly = math.sqrt(b * b * cB * cB + a * a * sB * sB)
    K = 0.001991
    rnd = random.Random(6)

    def scr(x, y):
        t = math.radians(rot)
        x, y = x * sc, y * sc
        return (cx + x * math.cos(t) - y * math.sin(t), cy + x * math.sin(t) + y * math.cos(t))

    def ring_pt(rpx, tdeg):
        t = math.radians(tdeg)
        return scr(rpx * math.cos(t), rpx * sB * math.sin(t))

    # sky
    bg_defs = SPIKE_DEFS.format(u=u) + ('<radialGradient id="%shz" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#26243d"/><stop offset=".5" stop-color="#0f0e1e"/><stop offset="1" stop-color="#04050d"/></radialGradient>'
                                        '<radialGradient id="%shz2" cx=".2" cy=".85" r=".5"><stop offset="0" stop-color="#2b3a6a" stop-opacity=".35"/><stop offset="1" stop-color="#2b3a6a" stop-opacity="0"/></radialGradient>') % (u, u)
    bg = svg(W, h, '<rect width="%d" height="%d" fill="url(#%shz)"/><rect width="%d" height="%d" fill="url(#%shz2)"/>' % (W, h, u, W, h, u) + starfield(W, h, 260, 11, 6, u=u), bg_defs)

    # rings profile
    def prof(km):
        n = rnd.uniform(-1, 1)
        if 66900 <= km < 74510: return .05, '#8d8578'
        if 74658 <= km < 92000: return .16 + .06 * n, '#a1978a'
        if 92000 <= km < 117580:
            t = (km - 92000) / 25580
            return min(.95, .52 + .38 * t + .12 * n), rnd.choice(['#eee3c8', '#e6d8b8', '#f3e8cf', '#dccca9'])
        if 117580 <= km < 122170:
            return (.2 if abs(km - 120050) < 300 else .03), '#8f8778'
        if 122170 <= km < 136775:
            if 133424 <= km < 133749 or 136485 <= km < 136527: return 0, '#000'
            return .5 + .1 * n, rnd.choice(['#d9ccb0', '#d2c4a6', '#e0d4b9'])
        if 139900 <= km < 140450: return .55, '#efe6d0'
        return 0, '#000'

    back, front = [], []
    km = 66900
    while km < 140500:
        op, col = prof(km)
        if op > 0.01:
            r = km * K; ry = r * sB
            back.append('<path d="M%s 0A%s %s 0 0 1 %s 0" stroke="%s" stroke-opacity="%s"/>' % (f(-r), f(r), f(ry), f(r), col, f(op * .92)))
            front.append('<path d="M%s 0A%s %s 0 0 0 %s 0" stroke="%s" stroke-opacity="%s"/>' % (f(-r), f(r), f(ry), f(r), col, f(op)))
        km += 230
    ring_g = '<g fill="none" stroke-width=".62">%s</g>'

    # globe
    def lat(phi):
        p = math.radians(phi)
        return -b * math.sin(p) * cB, a * math.cos(p), a * math.cos(p) * sB
    bands = [(-40, '#d3b782'), (-20, '#dcc290'), (-8, '#ecd9ab'), (4, '#f3e3ba'), (10, '#e2c792'), (16, '#caa56f'), (21, '#dcc08c'),
             (27, '#e6d0a0'), (34, '#cfb07c'), (41, '#dcc497'), (48, '#c9ae80'), (55, '#bca887'), (61, '#aaa28e'), (68, '#9aa0a0'), (74, '#8b95a1')]
    g = ['<ellipse rx="%s" ry="%s" fill="#c7a874"/>' % (f(a), f(ly))]
    for phi, col in bands:
        yc, rx, ry = lat(phi)
        if phi >= 66:
            g.append('<ellipse cy="%s" rx="%s" ry="%s" fill="%s"/>' % (f(yc), f(rx), f(ry), col))
        else:
            g.append('<path d="M%s %sA%s %s 0 0 0 %s %sL%s %sL%s %sL%s %sL%s %sZ" fill="%s"/>' % (
                f(-rx), f(yc), f(rx), f(ry), f(rx), f(yc), f(a + 10), f(yc), f(a + 10), f(-ly - 10), f(-a - 10), f(-ly - 10), f(-a - 10), f(yc), col))
    for i, phi in enumerate(range(-32, 66, 3)):
        yc, rx, ry = lat(phi + rnd.uniform(-.8, .8))
        g.append('<path d="M%s %sA%s %s 0 0 0 %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
            f(-rx), f(yc), f(rx), f(ry), f(rx), f(yc), '#fff4d6' if i % 2 else '#5a4526', f(rnd.uniform(.06, .16)), f(rnd.uniform(.5, 1.6))))
    # storms
    for phi, lam, s in [(41, -32, 1), (38, 18, .7), (-12, -50, .8)]:
        yc, rx, ry = lat(phi)
        x = rx * math.sin(math.radians(lam)); y = yc + ry * math.cos(math.radians(lam))
        g.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#f8eed4" opacity=".55"/>' % (f(x), f(y), f(6 * s), f(2.2 * s)))
    # polar hexagon
    yc, rx, ry = lat(77)
    hexp = ' '.join('%s,%s' % (f(rx * math.cos(math.radians(60 * k + 10))), f(yc + ry * math.sin(math.radians(60 * k + 10)))) for k in range(6))
    g.append('<polygon points="%s" fill="#76808c" fill-opacity=".55" stroke="#56606d" stroke-width="1.1"/>' % hexp)
    yc2, rx2, ry2 = lat(86)
    g.append('<ellipse cy="%s" rx="%s" ry="%s" fill="#4d5561" opacity=".8"/>' % (f(yc2), f(rx2 + 3), f(ry2 + 1.2)))
    # ring shadow on globe
    g.append('<path d="M-%s -18A%s %s 0 0 0 %s -18L%s -26A%s %s 0 0 1 -%s -26Z" fill="#20170c" opacity=".5"/>' % (
        f(190 * .78), f(190 * .78), f(190 * .78 * sB), f(190 * .78), f(150 * .78), f(150 * .78), f(150 * .78 * sB), f(150 * .78)))
    g.append('<ellipse rx="%s" ry="%s" fill="url(#%slimb)"/><ellipse rx="%s" ry="%s" fill="url(#%sterm)"/>' % (f(a), f(ly), u, f(a), f(ly), u))
    g.append('<ellipse rx="%s" ry="%s" fill="none" stroke="#fff3d6" stroke-opacity=".18" stroke-width="1.2"/>' % (f(a - .6), f(ly - .6)))

    obj_defs = ('<clipPath id="%sglobe"><ellipse rx="%s" ry="%s"/></clipPath>'
                '<clipPath id="%sback"><path d="M-300 0A300 %s 0 0 1 300 0Z"/></clipPath>'
                '<radialGradient id="%slimb" cx=".42" cy=".38" r=".62"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#140a03" stop-opacity=".16"/><stop offset=".92" stop-color="#0a0602" stop-opacity=".55"/><stop offset="1" stop-color="#050301" stop-opacity=".85"/></radialGradient>'
                '<linearGradient id="%sterm" x1=".1" y1=".05" x2=".95" y2=".95"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".56" stop-color="#000" stop-opacity="0"/><stop offset=".82" stop-color="#03030a" stop-opacity=".55"/><stop offset="1" stop-color="#010104" stop-opacity=".9"/></linearGradient>'
                '<radialGradient id="%sti" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#f4cf8c"/><stop offset=".7" stop-color="#b9823e"/><stop offset="1" stop-color="#5a3a15"/></radialGradient>'
                '<radialGradient id="%sglo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe3a3" stop-opacity=".22"/><stop offset="1" stop-color="#ffe3a3" stop-opacity="0"/></radialGradient>') % (
        u, f(a), f(ly), u, f(300 * sB), u, u, u, u)
    system = ('<ellipse rx="190" ry="170" fill="url(#%sglo)"/>' % u +
              ring_g % ''.join(back) +
              '<g clip-path="url(#%sback)"><polygon points="18,-36 122,-6 330,-80 250,-150" fill="#04050b" opacity=".82"/></g>' % u +
              '<g clip-path="url(#%sglobe)">%s</g>' % (u, ''.join(g)) +
              ring_g % ''.join(front))
    moons = [('TITAN', 356, -44, 4.6, 'url(#%sti)' % u), ('RHEA', -330, 18, 2.1, '#dcd8d0'), ('DIONE', 312, 26, 1.8, '#d2cdc5'),
             ('TETHYS', -302, -22, 1.8, '#e2ded6'), ('ENCELADUS', 294, -14, 1.3, '#ffffff')]
    mo = ''
    for n, x, y, r_, c in moons:
        X, Y = scr(x, y)
        mo += '<circle cx="%s" cy="%s" r="%s" fill="%s"/><circle cx="%s" cy="%s" r="%s" fill="#000" opacity=".45" transform="translate(%s %s)"/>' % (
            f(X), f(Y), f(r_), c, f(X), f(Y), f(r_ * .9), f(r_ * .35), f(r_ * .3))
    obj = svg(W, h, '<g transform="translate(%d %d) rotate(%d) scale(%s)">%s</g>%s%s' % (cx, cy, rot, sc, system, mo, grain(u + 'o', W, h, .12)), obj_defs)

    # annotation layer
    ann = [reticle(cx, cy, 124, 72, 8, .22)]
    ann.append(label(ring_pt(119875 * K, 152), (22, 452), ['CASSINI DIVISION', '4,590 KM']))
    ann.append(label(ring_pt(105000 * K, -150), (22, 146), ['B RING', '25,580 KM WIDE']))
    ann.append(label(ring_pt(130000 * K, 28), (560, 488), ['A RING'], 'end'))
    ann.append(label(ring_pt(133587 * K, 58), (560, 530), ['ENCKE GAP', '325 KM'], 'end'))
    yc, rx, ry = lat(77)
    ann.append(label(scr(0, yc), (560, 128), ['NORTH POLAR', 'HEXAGON'], 'end'))
    for n, x, y, r_, c in moons:
        X, Y = scr(x, y)
        ann.append('<text x="%s" y="%s" fill="rgba(245,241,232,.66)" style="%s" text-anchor="%s">%s</text>' % (
            f(X + (8 if x > 0 else -8)), f(Y - 6), LBL, 'start' if x > 0 else 'end', n))
    ann.append(scalebar(22, 590, 50000 * K * sc, '50,000 KM'))
    ann.append('<text x="22" y="96" fill="rgba(245,241,232,.5)" style="%s">RING PLANE 24° · FLATTENING 0.098</text>' % LBL)
    annotation = svg(W, h, ''.join(ann))
    return bg, obj, annotation

# ================================================================= MOON
def moon(u):
    W, H = 582, 620
    cx, cy, R = 291, 300, 200
    rnd = random.Random(1)
    bg_defs = SPIKE_DEFS.format(u=u) + ('<radialGradient id="%shz" cx=".5" cy=".48" r=".72"><stop offset="0" stop-color="#1c2442"/><stop offset=".55" stop-color="#0a1022"/><stop offset="1" stop-color="#03050c"/></radialGradient>'
                                        '<radialGradient id="%shalo" cx=".5" cy=".5" r=".5"><stop offset=".62" stop-color="#c9d6ff" stop-opacity=".16"/><stop offset="1" stop-color="#c9d6ff" stop-opacity="0"/></radialGradient>') % (u, u)
    bg = svg(W, H, '<rect width="%d" height="%d" fill="url(#%shz)"/>' % (W, H, u) + starfield(W, H, 150, 21, 3, u=u) +
             '<circle cx="%d" cy="%d" r="%d" fill="url(#%shalo)"/>' % (cx, cy, R + 70, u), bg_defs)

    defs = ('<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
            '<radialGradient id="%sbase" cx=".64" cy=".42" r=".72"><stop offset="0" stop-color="#f3f2ec"/><stop offset=".45" stop-color="#d2d0c9"/><stop offset=".82" stop-color="#a6a49e"/><stop offset="1" stop-color="#7a7874"/></radialGradient>'
            '<radialGradient id="%slimb" cx=".5" cy=".5" r=".5"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset=".9" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>'
            '<filter id="%sn1" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="5" seed="4"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sn2" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="9"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sb2"><feGaussianBlur stdDeviation="2.2"/></filter><filter id="%sb6" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="6"/></filter><filter id="%sb1"><feGaussianBlur stdDeviation=".7"/></filter>') % (
        u, cx, cy, R, u, u, u, u, u, u, u)
    P = lambda x, y: (cx + x * R, cy + y * R)
    body = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
            '<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn1)" opacity=".42" style="mix-blend-mode: multiply"/>' % (cx - R, cy - R, 2 * R, 2 * R, u)]
    maria = [(-0.30, -0.42, .26, .22), (0.12, -0.40, .15, .14), (0.30, -0.12, .19, .16), (0.66, -0.30, .08, .12), (0.52, 0.10, .11, .17),
             (0.34, 0.26, .08, .09), (-0.22, 0.30, .16, .12), (-0.50, 0.36, .08, .08), (-0.62, -0.05, .24, .42), (-0.02, -0.72, .42, .06),
             (0.0, -0.22, .07, .05), (-0.30, 0.12, .09, .07)]
    mar = []
    for x, y, rx, ry in maria:
        X, Y = P(x, y)
        mar.append('<path d="%s" fill="#5f6470" opacity=".8"/>' % blob(X, Y, rx * R, ry * R, rnd, 16, .26))
        mar.append('<path d="%s" fill="#50555f" opacity=".4"/>' % blob(X + rnd.uniform(-6, 6), Y + rnd.uniform(-6, 6), rx * R * .6, ry * R * .6, rnd, 12, .3))
    body.append('<g filter="url(#%sb2)">%s</g>' % (u, ''.join(mar)))
    body.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn2)" opacity=".22" style="mix-blend-mode: overlay"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    # rays
    def rays(x, y, n, lo, hi, op):
        X, Y = P(x, y); out = []
        for _ in range(n):
            t = rnd.uniform(0, 2 * math.pi); L = rnd.uniform(lo, hi) * R
            out.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#f7f6f0" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
                f(X), f(Y), f(X + L * math.cos(t)), f(Y + L * math.sin(t)), f(rnd.uniform(op * .4, op)), f(rnd.uniform(.7, 2.4))))
        out.append('<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity=".16"/>' % (f(X), f(Y), f(R * .08)))
        return ''.join(out)
    body.append('<g filter="url(#%sb1)">%s%s%s</g>' % (u, rays(-0.14, 0.68, 52, .15, .95, .17), rays(-0.34, -0.17, 30, .08, .36, .14), rays(-0.59, -0.13, 16, .05, .2, .12)))
    # craters
    cr = []
    def crater(x, y, r):
        d = math.hypot(x, y); fo = math.sqrt(max(.06, 1 - d * d)); ang = math.degrees(math.atan2(y, x))
        t = math.radians(-ang); sx, sy = math.cos(t), math.sin(t)
        X, Y = P(x, y)
        cr.append('<g transform="translate(%s %s) rotate(%s)"><ellipse rx="%s" ry="%s" fill="#2c2d33" opacity=".34"/>'
                  '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#e2e0d9" opacity=".42"/>'
                  '<ellipse rx="%s" ry="%s" fill="none" stroke="#fbfaf5" stroke-opacity=".22" stroke-width=".7"/></g>' % (
                      f(X), f(Y), f(ang), f(r * fo), f(r), f(-sx * r * .24 * fo), f(-sy * r * .24), f(r * .78 * fo), f(r * .78), f(r * 1.04 * fo), f(r * 1.04)))
    for x, y, r in [(-0.14, 0.68, 9), (-0.34, -0.17, 10), (-0.59, -0.13, 5), (0.10, 0.62, 12), (-0.05, 0.40, 8), (0.44, 0.58, 10)]:
        crater(x, y, r)
    n = 0
    while n < 250:
        x, y = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        if x * x + y * y > .93: continue
        inmare = any(((x - mx) / mrx) ** 2 + ((y - my) / mry) ** 2 < 1 for mx, my, mrx, mry in maria)
        if inmare and rnd.random() > .25: continue
        crater(x, y, 1.2 + 11 * rnd.random() ** 3.4); n += 1
    body.append(''.join(cr))
    body.append('<path d="M%s %s L%s %s" stroke="#fff" stroke-opacity=".9" stroke-width="2.2" stroke-linecap="round"/>' % (f(P(-.72, -.38)[0]), f(P(-.72, -.38)[1]), f(P(-.72, -.38)[0] + .1), f(P(-.72, -.38)[1])))
    # terminator (waxing gibbous, lit from the right)
    k = .38
    body.append('<path d="M%d %dA%d %d 0 0 0 %d %dA%s %d 0 0 1 %d %dZ" fill="#04060d" opacity=".94" filter="url(#%sb6)"/>' % (cx, cy - R - 8, R + 8, R + 8, cx, cy + R + 8, f(k * R), R + 8, cx, cy - R - 8, u))
    body.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimb)"/>' % (cx, cy, R, u))
    obj = svg(W, H, '<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(body)) +
              '<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#f4f6ff" stroke-opacity=".25" stroke-width="1"/>' % (cx, cy, f(R - .5)) + grain(u + 'o', W, H, .1), defs)

    ann = ['<defs><clipPath id="%sgd"><circle cx="%d" cy="%d" r="%d"/></clipPath></defs><g clip-path="url(#%sgd)" fill="none" stroke="rgba(245,241,232,.14)" stroke-width=".6" stroke-dasharray="2 3">' % (u + 'a', cx, cy, R, u + 'a')]
    for la in (-60, -30, 0, 30, 60):
        y = cy - R * math.sin(math.radians(la)); hw = R * math.cos(math.radians(la))
        ann.append('<line x1="%s" y1="%s" x2="%s" y2="%s"/>' % (f(cx - hw), f(y), f(cx + hw), f(y)))
    for lo in (-60, -30, 30, 60):
        rx = R * abs(math.sin(math.radians(lo)))
        ann.append('<path d="M%d %dA%s %d 0 0 %d %d %d"/>' % (cx, cy - R, f(rx), R, 1 if lo > 0 else 0, cx, cy + R))
    ann.append('<line x1="%d" y1="%d" x2="%d" y2="%d"/></g>' % (cx, cy - R, cx, cy + R))
    ann.append(reticle(cx, cy, R + 16, 72, 4, .2))
    ann.append(label(P(-0.30, -0.42), (22, 142), ['MARE', 'IMBRIUM']))
    ann.append(label(P(-0.34, -0.17), (22, 262), ['COPERNICUS', '93 KM']))
    ann.append(label(P(-0.14, 0.68), (22, 478), ['TYCHO', '85 KM · RAYED']))
    ann.append(label(P(0.66, -0.30), (560, 132), ['MARE', 'CRISIUM'], 'end'))
    ann.append(label(P(0.30, -0.12), (560, 216), ['MARE', 'TRANQUILLITATIS'], 'end'))
    ax, ay = P(.398, -.0118)
    ann.append('<g stroke="#5eead4" stroke-width=".8"><line x1="%s" y1="%s" x2="%s" y2="%s"/><line x1="%s" y1="%s" x2="%s" y2="%s"/></g>' % (f(ax - 6), f(ay), f(ax + 6), f(ay), f(ax), f(ay - 6), f(ax), f(ay + 6)))
    ann.append(label((ax, ay), (560, 312), ['APOLLO 11', '0.674°N 23.473°E'], 'end', '#8ff0dc', dot=False))
    ann.append(scalebar(560 - 1000 / 1737 * R, 578, 1000 / 1737 * R, '1,000 KM', 'end'))
    ann.append('<text x="22" y="96" fill="rgba(245,241,232,.5)" style="%s">NEAR SIDE · WAXING GIBBOUS</text>' % LBL)
    return bg, obj, svg(W, H, ''.join(ann))

# ================================================================= ANDROMEDA
def andromeda(u, h=620):
    W = 582
    cx, cy, rot = 291, 340, -38
    q = math.cos(math.radians(77))
    rnd = random.Random(31)
    bg_defs = SPIKE_DEFS.format(u=u) + '<radialGradient id="%shz" cx=".5" cy=".48" r=".75"><stop offset="0" stop-color="#1d2244"/><stop offset=".55" stop-color="#0b0e22"/><stop offset="1" stop-color="#03040b"/></radialGradient>' % u
    bg = svg(W, h, '<rect width="%d" height="%d" fill="url(#%shz)"/>' % (W, h, u) + starfield(W, h, 320, 41, 7, u=u), bg_defs)
    defs = ('<filter id="%sb4" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="5"/></filter>'
            '<filter id="%sb2" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="1.8"/></filter>'
            '<filter id="%sb1"><feGaussianBlur stdDeviation=".5"/></filter>')
    defs = defs % (u, u, u)
    for n, c0, o0, c1 in [('halo', '#7086cc', .22, '#7086cc'), ('disk', '#b9c6ea', .42, '#9fb0e0'), ('inner', '#f1dcb5', .7, '#d8c6a8'), ('bulge', '#fff6e2', 1, '#f3d9ae')]:
        defs += '<radialGradient id="%s%s"><stop offset="0" stop-color="%s" stop-opacity="%s"/><stop offset=".55" stop-color="%s" stop-opacity="%s"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>' % (u, n, c0, f(o0), c1, f(o0 * .35), c1)
    glow = ('<ellipse rx="345" ry="%s" fill="url(#%shalo)"/><ellipse rx="265" ry="%s" fill="url(#%sdisk)"/><ellipse rx="125" ry="%s" fill="url(#%sinner)"/><ellipse rx="58" ry="%s" fill="url(#%sbulge)"/>' % (
        f(345 * q * 1.5), u, f(265 * q * 1.3), u, f(125 * q * 1.4), u, f(58 * q * 1.9), u))
    blobs, parts = [], []
    for i in range(1300):
        arm = i % 2; t = rnd.random() ** 1.1
        r = 22 + 300 * t; th = arm * math.pi + t * 3.3 * math.pi
        s = 5 + 13 * t
        x = r * math.cos(th) + rnd.gauss(0, s); y = (r * math.sin(th) + rnd.gauss(0, s)) * q
        if t < .15: col = '#ffe4bd'
        elif rnd.random() < .04: col = '#ff9ec7'
        else: col = rnd.choice(['#cfe0ff', '#b6ccff', '#e6eeff', '#ffffff', '#dfe6ff'])
        parts.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(.35 + 1.0 * rnd.random() ** 2), col, f(.3 + .65 * rnd.random())))
        if i % 5 == 0:
            blobs.append('<circle cx="%s" cy="%s" r="%s" fill="#a9bdff" opacity=".07"/>' % (f(x), f(y), f(3 + 6 * rnd.random())))
    lanes = []
    for rr_ in (92, 128, 166, 204, 246, 284):
        a0, a1 = rnd.uniform(150, 200), rnd.uniform(330, 380)
        pts = []
        for k in range(40):
            A = math.radians(a0 + (a1 - a0) * k / 39)
            pts.append('%s %s' % (f(rr_ * math.cos(A)), f(rr_ * math.sin(A) * q + 2)))
        lanes.append('<path d="M%s" fill="none" stroke="#150d06" stroke-width="%s" stroke-opacity="%s" stroke-dasharray="%d %d %d %d" stroke-linecap="round"/>' % (
            'L'.join(pts), f(rnd.uniform(3, 7)), f(rnd.uniform(.45, .7)), rnd.randint(30, 60), rnd.randint(6, 14), rnd.randint(14, 30), rnd.randint(4, 10)))
    gal = ('<g transform="translate(%d %d) rotate(%d)"><g filter="url(#%sb4)">%s%s</g><g filter="url(#%sb1)">%s</g><g filter="url(#%sb2)">%s</g>'
           '<circle r="10" fill="#fff4de" opacity=".5" filter="url(#%sb2)"/><circle r="3" fill="#fff"/></g>') % (cx, cy, rot, u, glow, ''.join(blobs), u, ''.join(parts), u, ''.join(lanes), u)
    m32 = (348, 360); m110 = (176, 178)
    sats = ('<circle cx="%d" cy="%d" r="11" fill="url(#%sbulge)"/><circle cx="%d" cy="%d" r="2" fill="#fff"/>'
            '<ellipse cx="%d" cy="%d" rx="30" ry="12" transform="rotate(-62 %d %d)" fill="url(#%sinner)" opacity=".75"/>') % (m32[0], m32[1], u, m32[0], m32[1], m110[0], m110[1], m110[0], m110[1], u)
    fg = starfield(W, h, 40, 77, 4, u=u + 'x')
    obj = svg(W, h, gal + sats + fg + grain(u + 'o', W, h, .12), defs + SPIKE_DEFS.format(u=u + 'x'))
    def scr(x, y):
        t = math.radians(rot)
        return (cx + x * math.cos(t) - y * math.sin(t), cy + x * math.sin(t) + y * math.cos(t))
    ann = ['<ellipse cx="%d" cy="%d" rx="310" ry="%s" transform="rotate(%d %d %d)" fill="none" stroke="rgba(245,241,232,.2)" stroke-width=".6" stroke-dasharray="3 5"/>' % (cx, cy, f(310 * q), rot, cx, cy)]
    ann.append(label((cx, cy), (560, 150), ['NUCLEUS', 'P2 DOUBLE CORE'], 'end'))
    ann.append(label(m32, (560, 452), ['M32', 'SATELLITE'], 'end'))
    ann.append(label(m110, (22, 130), ['M110', 'SATELLITE']))
    ann.append(label(scr(166 * math.cos(math.radians(250)), 166 * math.sin(math.radians(250)) * q), (22, 470), ['DUST LANE']))
    ann.append(label(scr(310, 0), (560, 540), ['DISK', 'INCLINED 77°'], 'end', dot=False))
    ann.append(scalebar(22, 590, 80, '20,000 LY'))
    ann.append('<text x="22" y="96" fill="rgba(245,241,232,.5)" style="%s">RA 00H 42M 44S · DEC +41° 16′</text>' % LBL)
    return bg, obj, svg(W, h, ''.join(ann))

# ================================================================= M87
def m87(u):
    W, H = 582, 832
    cx, cy, R = 291, 330, 150
    rnd = random.Random(87)
    bg_defs = SPIKE_DEFS.format(u=u) + ('<radialGradient id="%shz" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#3a2410"/><stop offset=".35" stop-color="#1a0e06"/><stop offset=".75" stop-color="#080404"/><stop offset="1" stop-color="#030203"/></radialGradient>') % u
    gcs = []
    for _ in range(700):
        rad = 30 + 400 * rnd.random() ** 1.8; A = rnd.uniform(0, 2 * math.pi)
        gcs.append('<circle cx="%s" cy="%s" r="%s" fill="#ffe9cc" opacity="%s"/>' % (f(cx + rad * math.cos(A)), f(cy + rad * .9 * math.sin(A)), f(.3 + .6 * rnd.random()), f(.12 + .5 * rnd.random())))
    bg = svg(W, H, '<rect width="%d" height="%d" fill="url(#%shz)"/>' % (W, H, u) + ''.join(gcs) + starfield(W, H, 60, 88, 3, tints=('#fff1dc', '#ffe0c0', '#ffffff'), u=u), bg_defs)
    defs = ('<linearGradient id="%sring" x1=".25" y1="0" x2=".65" y2="1"><stop offset="0" stop-color="#5a1804"/><stop offset=".32" stop-color="#b9400c"/><stop offset=".62" stop-color="#ff9a3c"/><stop offset=".86" stop-color="#ffe2a8"/><stop offset="1" stop-color="#fff6de"/></linearGradient>'
            '<radialGradient id="%sglow" cx=".5" cy=".5" r=".5"><stop offset=".42" stop-color="#ff8a2a" stop-opacity="0"/><stop offset=".6" stop-color="#ff8a2a" stop-opacity=".28"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%sshadow"><stop offset="0" stop-color="#000"/><stop offset=".9" stop-color="#040100"/><stop offset="1" stop-color="#1a0802"/></radialGradient>'
            '<linearGradient id="%sjet" x1="0" x2="1"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".7"/><stop offset=".5" stop-color="#9fcaff" stop-opacity=".25"/><stop offset="1" stop-color="#9fcaff" stop-opacity="0"/></linearGradient>'
            '<filter id="%splasma" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="3" seed="8"/><feDisplacementMap in="SourceGraphic" scale="22"/><feGaussianBlur stdDeviation="2.4"/></filter>'
            '<filter id="%sb3" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="3"/></filter>'
            '<filter id="%sb8" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="9"/></filter>') % (u, u, u, u, u, u, u)
    knots = ''.join('<ellipse cx="%s" cy="0" rx="%s" ry="%s" fill="#e6f3ff" opacity="%s"/>' % (f(x), f(6 + i * 1.3), f(2.4 + i * .5), f(.75 - i * .07)) for i, x in enumerate([225, 262, 300, 344, 392, 446, 500]))
    jet = '<g transform="translate(%d %d) rotate(-44)"><path d="M150 -5L560 -30L560 30L150 5Z" fill="url(#%sjet)" filter="url(#%sb3)"/><g filter="url(#%sb3)">%s</g></g>' % (cx, cy, u, u, u, knots)
    arcs = []
    for _ in range(160):
        r_ = rnd.uniform(112, 205); a0 = rnd.uniform(0, 360); L = rnd.uniform(18, 75)
        mid = math.radians(a0 + L / 2); boost = .45 + .55 * (1 + math.sin(mid)) / 2
        A0, A1 = math.radians(a0), math.radians(a0 + L)
        arcs.append('<path d="M%s %sA%s %s 0 0 1 %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
            f(cx + r_ * math.cos(A0)), f(cy + r_ * math.sin(A0)), f(r_), f(r_), f(cx + r_ * math.cos(A1)), f(cy + r_ * math.sin(A1)),
            rnd.choice(['#ffcf8a', '#ff9a3c', '#fff1d2', '#ffb45a']), f(rnd.uniform(.08, .32) * boost), f(rnd.uniform(.6, 2.4))))
    ring = ('<circle cx="%d" cy="%d" r="265" fill="url(#%sglow)"/>' % (cx, cy, u) +
            '<circle cx="%d" cy="%d" r="%d" fill="none" stroke="url(#%sring)" stroke-width="70" filter="url(#%splasma)"/>' % (cx, cy, R, u, u) +
            '<circle cx="%d" cy="%d" r="%d" fill="none" stroke="url(#%sring)" stroke-width="26" opacity=".55" filter="url(#%sb8)"/>' % (cx, cy, R - 6, u, u) +
            ''.join(arcs) +
            '<circle cx="%d" cy="%d" r="114" fill="none" stroke="#fff4dd" stroke-width="4" opacity=".45" filter="url(#%sb3)"/>' % (cx, cy, u) +
            '<circle cx="%d" cy="%d" r="111" fill="url(#%sshadow)"/>' % (cx, cy, u) +
            '<circle cx="%d" cy="%d" r="114" fill="none" stroke="#fff6e4" stroke-width="1.4" opacity=".9"/>' % (cx, cy))
    obj = svg(W, H, jet + ring + grain(u + 'o', W, H, .14), defs)
    ann = [reticle(cx, cy, 238, 72, 4, .2)]
    for i, t in enumerate(['0°', '90°', '180°', '270°']):
        A = math.radians(-90 + 90 * i)
        ann.append('<text x="%s" y="%s" text-anchor="middle" fill="rgba(245,241,232,.5)" style="%s">%s</text>' % (f(cx + 258 * math.cos(A)), f(cy + 258 * math.sin(A) + 3), LBL, t))
    ann.append(label((cx + 114 * math.cos(math.radians(-122)), cy + 114 * math.sin(math.radians(-122))), (22, 150), ['PHOTON RING']))
    ann.append(label((cx - 40, cy + 20), (22, 520), ['SHADOW', 'Ø 42 µAS']))
    ann.append(label((cx + 170 * math.cos(math.radians(115)), cy + 170 * math.sin(math.radians(115))), (560, 540), ['ACCRETION FLOW', 'DOPPLER-BRIGHT SOUTH'], 'end'))
    ann.append(label((cx + 300 * math.cos(math.radians(-44)), cy + 300 * math.sin(math.radians(-44))), (560, 200), ['RELATIVISTIC JET', '5,000 LY'], 'end'))
    ann.append('<text x="22" y="96" fill="rgba(245,241,232,.5)" style="%s">RA 12H 30M 49S · DEC +12° 23′ · EHT 2019</text>' % LBL)
    return bg, obj, svg(W, H, ''.join(ann))


"""First Light, famous sights (a): Earth, Earthrise, the Moon, Tranquility Base and four spacecraft.

Full-art plates at 582 × 832 in the manner of drawing.py. The card crops the
canvas to about y 120–712 and prints the title over the foot, so every subject
sits around (291, 350) and the bottom of the frame stays dark.
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, label, scalebar, reticle
from more import sky, top, spike_star, W, HF
from fl_planets import Globe
from paint import blur, noise, lin, rad, arc, smooth, globe, EARTH

H = HF

# a Blue Marble palette: deeper sea, drier tropics, brighter cloud rims
BLUE = dict(EARTH, sea=[(0, '#3a8fd4', None), (.4, '#1a5c9e', None), (.8, '#0c3468', None), (1, '#061b3c', None)],
            land='#6a7e46', forest='#2e5a2c', grass='#9a9a5a', desert='#d2ac74', haze='#9fd2ff', rim='#b8e2ff', dry=.7)


def space(u, n=240, seed=1, c=('#0a0f20', '#04060f', '#010207'), cy='.42', extra='', extra_defs=''):
    return sky(u, H, c, n, seed, 3, cy=cy, extra=extra, extra_defs=extra_defs)


def halo(u, name, cx, cy, R, col, op, width):
    """Blurred atmosphere glow just outside a disc."""
    return ('<circle cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" filter="url(#%s%s)"/>' % (
        f(cx), f(cy), f(R + width * .3), col, f(op), f(width), u, name))


def night_cap(u, cx, cy, R, light, rot, filt, op=.9):
    """A soft black cap over the night side of a globe lit from light (x right, y down, z to us), rot as in globe()."""
    lx, ly, lz = light
    n = math.sqrt(lx * lx + ly * ly + lz * lz)
    t = math.degrees(math.atan2(ly, lx)) + rot + 180
    k = max(.02, lz / n)
    r = R + 3
    return ('<g transform="translate(%s %s) rotate(%s)"><path d="M0 -%sA%s %s 0 0 1 0 %sA%s %s 0 0 %d 0 -%sZ" fill="#000" opacity="%s" filter="url(#%s%s)"/></g>' % (
        f(cx), f(cy), f(t), f(r), f(r), f(r), f(r), f(r * k), f(r), 0 if lz >= 0 else 1, f(r), f(op), u, filt))


# ================================================================= EARTH
def earth(u):
    cx, cy, R = 291, 372, 172
    lx, ly, lz = -.78, -.28, .56
    bg = space(u, 260, 1990, cy='.4', extra='<circle cx="-60" cy="250" r="300" fill="url(#%ssun)"/>' % u,
               extra_defs=rad(u, 'sun', [(0, '#fff3dc', .32), (.3, '#ffe2b0', .08), (1, '#ffe2b0', 0)]))
    conts = [(.1, .34, .36, 7), (-.3, .45, .2, 3), (.8, .38, .18, 3), (.42, .82, .16, 3), (-.28, -1.0, .3, 5), (.95, 1.1, .22, 3)]
    gd, gb = globe(u, 'e', cx, cy, R, math.radians(22), -8, (lx, ly, lz), 1972, dict(BLUE, cyclones=6, puffs=1.6, streaks=1.4), conts, city=.5)
    ph = math.atan2(ly, lx)
    defs = gd + blur(u, 'b6', 6) + blur(u, 'b18', 18, 60)
    o = ['<path d="%s" fill="none" stroke="#5aa8ff" stroke-opacity=".42" stroke-width="22" filter="url(#%sb18)"/>' % (arc(cx, cy, R + 4, ph - 1.7, ph + 1.7), u),
         '<path d="%s" fill="none" stroke="#9fd2ff" stroke-opacity=".5" stroke-width="5" filter="url(#%sb6)"/>' % (arc(cx, cy, R + 2, ph - 1.5, ph + 1.5), u),
         '<circle cx="%d" cy="%d" r="%d" fill="#010309"/>' % (cx, cy, R),
         gb, night_cap(u, cx, cy, R, (lx, ly, lz), -8, 'b6', .8)]
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('EARTH · 12,742 KM · THE ONLY KNOWN HOME'), reticle(cx, cy, R + 24, 72, 4, .12)]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= THE MOON
# selenographic (lat, lon, half-size in lat, half-size in lon) — near side, east on the right
MARE = [(33, -17, 15, 19), (40, -28, 9, 12), (28, 17, 10, 11), (8, 31, 11, 12), (14, 22, 6, 7), (17, 59, 8, 9), (-5, 52, 10, 8),
        (-15, 34, 6, 6), (-20, -15, 11, 12), (-24, -39, 6, 6), (20, -52, 20, 17), (2, -47, 15, 14), (-8, -36, 9, 10), (-10, -22, 7, 8),
        (13, 4, 5, 6), (2, 1, 4, 5), (56, -25, 3.5, 18), (56, 12, 3.5, 20), (44, 27, 5, 7), (-3, -68, 3, 3), (-1, 86, 7, 3), (18, 84, 7, 3),
        (30, -40, 10, 10), (-28, -26, 6, 9), (8, -18, 6, 8)]
TONE = ['#666a76', '#62666f', '#72747c', '#5e6876', '#666a76', '#60646f', '#6b6e77', '#6e7078', '#6c6e76', '#666870', '#5f626d',
        '#63666f', '#696b73', '#70717a', '#6e7078', '#717279', '#73757c', '#73757c', '#6f7178', '#53555e', '#66686f', '#66686f',
        '#646770', '#6c6e76', '#6a6c74']


def dest(la, lo, brg, d):
    """The point d radians from (la, lo) along bearing brg, all in degrees except d."""
    la1, lo1, b = math.radians(la), math.radians(lo), math.radians(brg)
    la2 = math.asin(math.sin(la1) * math.cos(d) + math.cos(la1) * math.sin(d) * math.cos(b))
    lo2 = lo1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(la1), math.cos(d) - math.sin(la1) * math.sin(la2))
    return math.degrees(la2), math.degrees(lo2)


def moon(u):
    cx, cy, R = 291, 350, 190
    rnd = random.Random(1609)
    G = Globe(cx, cy, R, lat0=2, lon0=0, rot=0, sun=(0, 0, 1))
    bg = space(u, 230, 1609, ('#0e1222', '#05070f', '#010207'), cy='.42', extra='<circle cx="%d" cy="%d" r="%d" fill="url(#%sglow)"/>' % (cx, cy, R + 150, u),
               extra_defs=rad(u, 'glow', [(.5, '#e8ecf4', .2), (.72, '#e8ecf4', .05), (1, '#e8ecf4', 0)]))
    defs = ('<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>' % (u, cx, cy, R) +
            rad(u, 'base', [(0, '#f7f5ee', None), (.55, '#e6e3da', None), (.88, '#c9c5bb', None), (1, '#9c9890', None)], .47, .45, .56) +
            rad(u, 'limb', [(.8, '#000', 0), (.95, '#0a0a0c', .14), (1, '#0a0a0c', .4)]) +
            noise(u, 'n1', '.011', 5, 4) + noise(u, 'n2', '.05', 4, 9) + noise(u, 'n3', '.16', 3, 2) +
            '<filter id="%smott" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="4" seed="21"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 .2  0 0 0 0 .21  0 0 0 0 .25  0 2.4 0 0 -1.05"/><feComposite in2="SourceGraphic" operator="in"/></filter>' % u +
            blur(u, 'b1', .6, 10) + blur(u, 'b2', 1.6, 10) + blur(u, 'b4', 4, 20) + blur(u, 'b14', 14, 40))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
         '<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn1)" opacity=".38" style="mix-blend-mode: multiply"/>' % (cx - R, cy - R, 2 * R, 2 * R, u)]
    # the maria: overlapping lobes, soft edged, each a slightly different basalt
    mar = []
    for (la, lo, rla, rlo), col in zip(MARE, TONE):
        mar.append('<path d="%s" fill="%s" opacity=".8"/>' % (G.sblob(la, lo, rla, rlo, rnd, 22, .2), col))
        for _ in range(3):
            mar.append('<path d="%s" fill="%s" opacity=".5"/>' % (G.sblob(la + rnd.uniform(-rla, rla) * .5, lo + rnd.uniform(-rlo, rlo) * .5, rla * .55, rlo * .55, rnd, 14, .35), col))
    mg = ''.join(mar)
    b.append('<g filter="url(#%sb4)">%s</g>' % (u, mg))
    b.append('<g filter="url(#%sb14)" opacity=".35">%s</g>' % (u, mg))
    b.append('<g filter="url(#%smott)" opacity=".55">%s</g>' % (u, mg))
    b.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn2)" opacity=".3" style="mix-blend-mode: overlay"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    # highland craters, faint under a high sun: bright rims, a hint of floor
    cr = []
    pal = ('#9a978f', '#f3f1ea', '#d6d3ca', '#fbfaf4', '#ffffff')
    for _ in range(170):
        la, lo = rnd.uniform(-80, 80), rnd.uniform(-85, 85)
        if any(((la - a) / c) ** 2 + ((lo - o_) / d) ** 2 < 1.2 for a, o_, c, d in MARE): continue
        cr.append(G.crater(la, lo, 1.2 + 7 * rnd.random() ** 3, pal, op=.55))
    b.append(''.join(cr))
    # ray systems: thin bright streaks on great circles, Tycho's crossing half the disc
    rays = []

    def rayset(la, lo, n, lo_d, hi_d, w, op):
        for _ in range(n):
            brg = rnd.uniform(0, 360); d = rnd.uniform(lo_d, hi_d)
            pts = [dest(la, lo, brg, d * k / 12) for k in range(1, 13)]
            seg = G.line(pts)
            if seg:
                rays.append('<path d="%s" fill="none" stroke="#fffdf6" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (seg, f(rnd.uniform(op * .4, op)), f(rnd.uniform(*w))))
    rayset(-43, -11, 22, .4, 1.3, (1.6, 5), .55)
    rayset(-43, -11, 50, .05, .3, (1.5, 5), .45)
    rayset(9.6, -20, 30, .06, .32, (1, 2.6), .38)
    rayset(8, -38, 18, .04, .2, (.8, 2), .34)
    rayset(24, -47, 12, .03, .14, (.8, 1.8), .3)
    rayset(16, 47, 12, .04, .22, (.8, 2), .3)
    rayset(-9, 61, 10, .03, .14, (.8, 1.6), .26)
    b.append('<g filter="url(#%sb4)">%s</g><g filter="url(#%sb2)" opacity=".5">%s</g>' % (u, ''.join(rays), u, ''.join(rays)))
    # the bright young craters at the hubs, and Plato's dark floor
    for la, lo, r, k in [(-43, -11, 7, 1), (9.6, -20, 7.5, .9), (8, -38, 4, .8), (24, -47, 4.2, 1.1), (16, 47, 3.4, .8), (-9, 61, 4.5, .6)]:
        X, Y = G.P(la, lo)
        b.append('<circle cx="%s" cy="%s" r="%s" fill="#ffffff" opacity="%s" filter="url(#%sb4)"/>' % (f(X), f(Y), f(r * 2.6), f(.38 * k), u))
        b.append('<circle cx="%s" cy="%s" r="%s" fill="#fffefa" opacity="%s" filter="url(#%sb1)"/>' % (f(X), f(Y), f(r * .9), f(.75 * k), u))
        b.append('<circle cx="%s" cy="%s" r="%s" fill="#8a8a8e" opacity=".55"/>' % (f(X + .6), f(Y + .4), f(r * .35)))
    X, Y = G.P(-43, -11)
    b.append('<circle cx="%s" cy="%s" r="11" fill="none" stroke="#7a7a80" stroke-opacity=".35" stroke-width="5" filter="url(#%sb2)"/>' % (f(X), f(Y), u))
    X, Y = G.P(51.6, -9)
    b.append('<ellipse cx="%s" cy="%s" rx="7" ry="3.6" fill="#4a4c56" opacity=".85" filter="url(#%sb1)"/>' % (f(X), f(Y), u))
    X, Y = G.P(-5, -68)
    b.append('<ellipse cx="%s" cy="%s" rx="3" ry="8" fill="#45474f" opacity=".8" filter="url(#%sb1)"/>' % (f(X), f(Y), u))
    b.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn3)" opacity=".16" style="mix-blend-mode: overlay"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimb)"/>' % (cx, cy, R, u))
    o = ['<circle cx="%d" cy="%d" r="%d" fill="#f4f2ea" opacity=".3" filter="url(#%sb14)"/>' % (cx, cy, R + 8, u),
         '<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)),
         '<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#fffdf4" stroke-opacity=".5" stroke-width="1.2"/>' % (cx, cy, f(R - .6))]
    tx, ty = G.P(-43, -11)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('THE MOON · 3,474 KM · 384,400 KM AWAY'), reticle(cx, cy, R + 20, 72, 4, .12),
           label((tx, ty), (22, 610), ['TYCHO', 'RAYS 1,500 KM LONG'])]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= LUNAR GROUND
def lunar_crater(x, y, rx, ry, k, rnd):
    """A crater on the plain, foreshortened, lit by a low sun from the left:
    the inner left wall and floor in shadow, the inner right wall bright, a cast shadow off the outer right slope."""
    sh = min(.95, .55 + .5 * (1 - k))
    return ('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#0d0c0a" opacity="%s"/>'
            '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#2a2824" opacity=".9"/>'
            '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#6e6a62"/>'
            '<path d="M%s %sA%s %s 0 0 1 %s %s" fill="none" stroke="#e6e1d6" stroke-opacity=".45" stroke-width="%s"/>'
            '<path d="M%s %sA%s %s 0 0 0 %s %s" fill="none" stroke="#d8d3c8" stroke-opacity=".22" stroke-width="%s"/>') % (
        f(x + rx * .55), f(y + ry * .15), f(rx * 1.05), f(ry * 1.0), f(.35 * sh),
        f(x), f(y), f(rx), f(ry),
        f(x + rx * (.18 + .3 * (1 - sh))), f(y + ry * .06), f(rx * (.78 - .15 * sh)), f(ry * .8),
        f(x + rx * .25), f(y - ry * .92), f(rx * .9), f(ry * .95), f(x + rx * .25), f(y + ry * .92), f(max(.7, rx * .07)),
        f(x - rx * .2), f(y - ry * 1.05), f(rx * 1.05), f(ry * 1.08), f(x - rx * .2), f(y + ry * 1.05), f(max(.6, rx * .05)))


def lunar_ground(u, rnd, edge, hz, n=110, top_col='#bdb8ad', fade=.88, rocks=0):
    """Grey regolith from a horizon path down to the foot of the frame, mottled, cratered, falling into dark."""
    land = edge + 'L%d %dL-20 %dZ' % (W + 20, H + 10, H + 10)
    defs = (noise(u, 'gn', '.01 .045', 5, 8) + noise(u, 'gm', '.03 .12', 4, 18) + noise(u, 'fn', '.2 .6', 3, 9) +
            lin(u, 'gnd', [(0, top_col, None), (.1, '#9a958b', None), (.35, '#6a665e', None), (.7, '#3a3833', None), (1, '#16150f', None)]) +
            lin(u, 'fade', [(0, '#000', 0), (.35, '#000', .12), (.7, '#000', fade * .7), (1, '#000', fade)]) +
            '<clipPath id="%sland"><path d="%s"/></clipPath>' % (u, land))
    hh = H - hz + 40
    g = ['<path d="%s" fill="url(#%sgnd)"/>' % (land, u),
         '<rect y="%d" width="%d" height="%d" filter="url(#%sgn)" opacity=".55" style="mix-blend-mode: multiply"/>' % (hz - 40, W, hh, u),
         '<rect y="%d" width="%d" height="%d" filter="url(#%sgm)" opacity=".35" style="mix-blend-mode: overlay"/>' % (hz - 40, W, hh, u),
         '<rect y="%d" width="%d" height="%d" filter="url(#%sfn)" opacity=".2" style="mix-blend-mode: overlay"/>' % (hz - 40, W, hh, u)]
    cr = []
    for _ in range(n):
        y = hz + 4 + (H - hz) * rnd.random() ** 1.7
        k = (y - hz) / (H - hz)
        r = (2.5 + 46 * rnd.random() ** 3) * (.35 + 1.5 * k)
        cr.append((y, lunar_crater(rnd.uniform(-30, W + 30), y, r, r * (.09 + .3 * k), k, rnd)))
    for _ in range(rocks):
        y = hz + 10 + (H - hz) * rnd.random() ** 1.3; k = (y - hz) / (H - hz)
        x = rnd.uniform(0, W); r = (.8 + 3 * rnd.random() ** 2) * (.4 + 1.6 * k)
        cr.append((y, '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#0b0a08" opacity=".7"/><ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#cfcac0"/>' % (
            f(x + r * 1.6), f(y + r * .25), f(r * 2.2), f(r * .4), f(x), f(y - r * .2), f(r), f(r * .65))))
    g.append(''.join(c for _, c in sorted(cr)))
    g.append('<rect y="%d" width="%d" height="%d" fill="url(#%sfade)"/>' % (hz - 40, W, hh, u))
    body = '<g clip-path="url(#%sland)">%s</g>' % (u, ''.join(g))
    body += '<path d="%s" fill="none" stroke="#f4f0e6" stroke-opacity=".55" stroke-width="1.4" filter="url(#%sb2)"/>' % (edge, u)
    return defs, body


def horizon(rnd, hz, sag, bumps):
    pts = []
    for i in range(81):
        x = -20 + i * (W + 40) / 80
        y = hz + sag * ((x - 291) / 310) ** 2 + rnd.uniform(-.8, .8) + sum(a * math.sin(x / p + ph) for a, p, ph in bumps)
        pts.append((x, y))
    return 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in pts)


# ================================================================= EARTHRISE
def earthrise(u):
    rnd = random.Random(1968)
    ex, ey, ER = 291, 322, 122
    lx, ly, lz = -.88, -.4, .18
    bg = space(u, 110, 1968, ('#05070e', '#020308', '#000002'), cy='.4')
    conts = [(.25, -.25, .32, 7), (-.3, .3, .26, 4), (.65, .45, .22, 4), (-.1, 1.0, .2, 3)]
    gd, gb = globe(u, 'e', ex, ey, ER, math.radians(14), -6, (lx, ly, lz), 1224, dict(BLUE, cyclones=5, puffs=1.4, streaks=1.3, night='#000000'), conts)
    hz = 500
    edge = horizon(rnd, hz, 16, [(2.4, 41, 0), (1.4, 13, 1), (3.5, 97, 2)])
    ld, lb = lunar_ground(u, rnd, edge, hz, 130, rocks=40)
    ph = math.atan2(ly, lx)
    night = night_cap(u, ex, ey, ER, (lx, ly, lz), -6, 'b5')
    defs = gd + ld + blur(u, 'b2', 2) + blur(u, 'b5', 5) + blur(u, 'b12', 12, 60)
    o = ['<path d="%s" fill="none" stroke="#5aa8ff" stroke-opacity=".5" stroke-width="10" filter="url(#%sb12)"/>' % (arc(ex, ey, ER + 3, ph - 1.45, ph + 1.45), u),
         '<circle cx="%d" cy="%d" r="%d" fill="#000"/>' % (ex, ey, ER), gb, night, lb]
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .12), defs)
    ann = [top('APOLLO 8 · 24 DECEMBER 1968 · LUNAR ORBIT'), label((ex - ER * .5, ey - ER * .4), (22, 200), ['EARTH', 'RISING OVER THE LIMB'])]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= TRANQUILITY BASE
def apollo11(u):
    rnd = random.Random(1969)
    bg = space(u, 140, 1969, ('#05070d', '#020308', '#000002'), cy='.3')
    hz = 322
    edge = horizon(rnd, hz, -6, [(1.6, 37, 0), (.8, 11, 1), (2.6, 83, 2)])
    ld, lb = lunar_ground(u, rnd, edge, hz, 90, top_col='#c9c3b6', fade=.9, rocks=70)
    # Earth, small and gibbous, high over the plain
    gx, gy, gr = 452, 168, 20
    gd, gb = globe(u, 'e', gx, gy, gr, math.radians(10), 0, (-.8, -.3, .5), 7, dict(BLUE, cyclones=2, puffs=.5, streaks=.6), [(.2, .3, .35, 4), (-.3, -.8, .3, 3)])
    B = 486
    defs = ld + gd + blur(u, 'b1', .7) + blur(u, 'b2', 2) + blur(u, 'b5', 5) + blur(u, 'b10', 10, 60) + noise(u, 'cr', '.09 .05', 3, 5) + (
        lin(u, 'foil', [(0, '#fff0b6', None), (.18, '#e2b04e', None), (.4, '#9a6a1c', None), (.62, '#e9c66e', None), (.8, '#7a4e12', None), (1, '#3e2606', None)], 0, 0, 1, .3) +
        lin(u, 'foilS', [(0, '#5a3a10', None), (1, '#1e1204', None)], 0, 0, 1, 0) +
        lin(u, 'asc', [(0, '#f2f0ea', None), (.45, '#b9b8b2', None), (1, '#5d5c58', None)], 0, 0, 1, 0) +
        lin(u, 'ascS', [(0, '#6a6964', None), (1, '#2a2a28', None)], 0, 0, 1, 0) +
        lin(u, 'strut', [(0, '#f4eedc', None), (1, '#8a826e', None)], 0, 0, 1, 0) +
        '<filter id="%ssil" x="-10%%" y="-10%%" width="120%%" height="120%%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 .02  0 0 0 0 .02  0 0 0 0 .02  0 0 0 .82 0"/><feGaussianBlur stdDeviation="1.4"/></filter>' % u)
    cx = 291
    lm = []
    # legs: the two side legs and the front leg with its ladder; struts lit on the left
    for sgn in (-1, 1):
        fx = cx + sgn * 148
        lm.append('<path d="M%d %dL%d %dM%d %dL%d %dM%d %dL%d %d" stroke="url(#%sstrut)" stroke-width="4" stroke-linecap="round"/>' % (
            cx + sgn * 76, 398, fx, B - 12, cx + sgn * 80, 378, fx + sgn * -4, B - 30, cx + sgn * 62, 418, fx - sgn * 10, B - 14, u))
        lm.append('<path d="M%d %dL%d %d" stroke="#2a2416" stroke-width="7" stroke-linecap="round"/><path d="M%d %dL%d %d" stroke="#c9a24c" stroke-width="5" stroke-linecap="round"/>' % (
            cx + sgn * 84, 392, fx - sgn * 2, B - 26, cx + sgn * 84, 392, fx - sgn * 2, B - 26))
        lm.append('<ellipse cx="%d" cy="%d" rx="17" ry="5.5" fill="#d8d2c0"/><ellipse cx="%d" cy="%d" rx="17" ry="2.5" fill="#8a8474"/>' % (fx, B - 8, fx, B - 5))
        lm.append('<path d="M%d %dL%d %d" stroke="#e8e2d0" stroke-width="1" stroke-opacity=".7"/>' % (fx, B - 30, fx, B - 60))
    # descent engine bell in the shadow under the stage
    lm.append('<path d="M%d %dL%d %dL%d %dL%d %dZ" fill="#18160f"/>' % (cx - 20, 420, cx + 20, 420, cx + 30, 446, cx - 30, 446))
    # front leg
    lm.append('<path d="M%d %dL%d %d" stroke="url(#%sstrut)" stroke-width="5" stroke-linecap="round"/>' % (cx - 4, 420, cx - 4, B + 6, u))
    lm.append('<path d="M%d %dL%d %dM%d %dL%d %d" stroke="#bfb79f" stroke-width="2.4" stroke-linecap="round"/>' % (cx - 50, 414, cx - 6, B - 16, cx + 50, 414, cx + 2, B - 16))
    lm.append('<ellipse cx="%d" cy="%d" rx="20" ry="6.5" fill="#e0dac8"/><ellipse cx="%d" cy="%d" rx="20" ry="3" fill="#8a8474"/>' % (cx - 4, B + 9, cx - 4, B + 12))
    lad = ''.join('<path d="M%d %sH%d"/>' % (cx - 13, f(424 + k * 7.4), cx + 5, ) for k in range(8))
    lm.append('<g stroke="#e8e0c8" stroke-width="1.6"><path d="M%d 420V%dM%d 420V%d"/>%s</g>' % (cx - 13, B - 4, cx + 5, B - 4, lad))
    # the descent stage: an octagon in crinkled gold and black foil
    lm.append('<path d="M%d 372L%d 372L%d 384L%d 420L%d 420L%d 384Z" fill="url(#%sfoilS)"/>' % (cx - 96, cx + 96, cx + 104, cx + 96, cx - 96, cx - 104, u))
    lm.append('<path d="M%d 372H%dV420H%dZ" fill="url(#%sfoil)"/>' % (cx - 82, cx + 82, cx - 82, u))
    lm.append('<path d="M%d 372L%d 372L%d 420L%d 420Z" fill="#e6c26a"/>' % (cx - 104, cx - 82, cx - 82, cx - 98))
    lm.append('<rect x="%d" y="372" width="%d" height="48" filter="url(#%scr)" opacity=".35" style="mix-blend-mode: multiply"/>' % (cx - 104, 208, u))
    for k in range(6):
        lm.append('<path d="M%d %dL%d %d" stroke="#fff6d0" stroke-opacity=".4" stroke-width=".8"/>' % (cx - 80 + k * 30, 374, cx - 74 + k * 30 + rnd.randint(-4, 4), 418))
    lm.append('<rect x="%d" y="366" width="%d" height="8" fill="#141210"/>' % (cx - 98, 196))
    lm.append('<rect x="%d" y="400" width="34" height="14" fill="#1a1712" opacity=".85"/><rect x="%d" y="402" width="10" height="7" fill="#d8d0bc"/>' % (cx - 26, cx - 17))
    # the porch, from the hatch to the ladder
    lm.append('<path d="M%d 364H%dL%d 372H%dZ" fill="#d2ccbc"/>' % (cx - 22, cx + 14, cx + 10, cx - 18))
    # the ascent stage: faceted cabin, black and silver, two triangular windows, tanks and thruster quads
    lm.append('<path d="M%d 366L%d 330L%d 300L%d 286L%d 286L%d 300L%d 330L%d 366Z" fill="url(#%sasc)"/>' % (
        cx - 70, cx - 76, cx - 58, cx - 30, cx + 34, cx + 58, cx + 74, cx + 70, u))
    lm.append('<path d="M%d 366L%d 330L%d 300L%d 300L%d 366Z" fill="#f7f5ef" opacity=".55"/>' % (cx - 70, cx - 76, cx - 58, cx - 44, cx - 50))
    lm.append('<path d="M%d 286L%d 286L%d 300L%d 300Z" fill="#26262a"/>' % (cx - 30, cx + 34, cx + 46, cx - 42))
    lm.append('<path d="M%d 304L%d 304L%d 330Z" fill="#0c0d12"/><path d="M%d 304L%d 304L%d 330Z" fill="#0c0d12"/>' % (cx - 40, cx - 8, cx - 12, cx + 12, cx + 42, cx + 14))
    lm.append('<path d="M%d 306L%d 306L%d 318Z" fill="#9fb4d0" opacity=".35"/>' % (cx - 34, cx - 18, cx - 20))
    lm.append('<rect x="%d" y="332" width="34" height="32" fill="#1c1c20"/><rect x="%d" y="336" width="26" height="24" fill="#3a3a40"/>' % (cx - 20, cx - 16))
    lm.append('<path d="M%d 330H%dM%d 300H%d" stroke="#151518" stroke-width="1.2"/>' % (cx - 76, cx + 74, cx - 58, cx + 58))
    for sgn in (-1, 1):
        tx = cx + sgn * 82
        lm.append('<ellipse cx="%d" cy="346" rx="14" ry="20" fill="%s"/><ellipse cx="%d" cy="340" rx="5" ry="9" fill="#fff" opacity="%s"/>' % (
            tx, '#c9c6bc' if sgn < 0 else '#4a4944', tx - 4, '.55' if sgn < 0 else '.12'))
        qx = cx + sgn * 70
        lm.append('<rect x="%d" y="288" width="12" height="12" fill="#2a2a2c"/><path d="M%d 294H%dM%d 280V308" stroke="%s" stroke-width="3" stroke-linecap="round"/>' % (
            qx - 6, qx - 14, qx + 14, qx, '#d8d4ca' if sgn < 0 else '#77756e'))
    # the docking tunnel, the rendezvous radar dish and the steerable S-band antenna
    lm.append('<rect x="%d" y="272" width="22" height="16" fill="#8a8984"/><rect x="%d" y="272" width="8" height="16" fill="#e8e6e0" opacity=".7"/>' % (cx - 10, cx - 10))
    lm.append('<path d="M%d 286L%d 262" stroke="#bdbab0" stroke-width="2"/><ellipse cx="%d" cy="258" rx="13" ry="10" fill="#e9e6dc" transform="rotate(-25 %d 258)"/><ellipse cx="%d" cy="258" rx="9" ry="7" fill="#9b988e" transform="rotate(-25 %d 258)"/>' % (
        cx + 36, cx + 46, cx + 48, cx + 48, cx + 49, cx + 49))
    lm.append('<path d="M%d 288L%d 256" stroke="#bdbab0" stroke-width="1.6"/><circle cx="%d" cy="252" r="9" fill="#f1eee6"/><circle cx="%d" cy="252" r="5.5" fill="#a19e94"/>' % (cx - 46, cx - 58, cx - 59, cx - 58))
    lm.append('<path d="M%d 300L%d 268M%d 300L%d 266" stroke="#d8d4ca" stroke-width=".9"/>' % (cx + 20, cx + 24, cx - 20, cx - 26))
    lmg = ''.join(lm)
    # the flag, small, on its horizontal rod
    fx, fy = 150, 474
    fl = ['<path d="M%d %dV%d" stroke="#ecebe6" stroke-width="2.2"/><path d="M%d %dH%d" stroke="#ecebe6" stroke-width="1.6"/>' % (fx, fy, fy - 96, fx, fy - 94, fx + 44)]
    fl.append('<path d="M%d %dH%dV%dQ%d %d %d %dQ%d %d %d %dZ" fill="#f2f0ea"/>' % (fx, fy - 93, fx + 44, fy - 66, fx + 33, fy - 63, fx + 22, fy - 66, fx + 11, fy - 69, fx, fy - 66))
    for k in range(4):
        y0 = fy - 93 + k * 7.8
        fl.append('<path d="M%d %sH%dV%sH%dZ" fill="#b3313a"/>' % (fx, f(y0), fx + 44, f(y0 + 3.9), fx))
    fl.append('<rect x="%d" y="%d" width="18" height="14" fill="#29407a"/>' % (fx, fy - 93))
    fl.append('<path d="M%d %dV%d" stroke="#000" stroke-opacity=".25" stroke-width="10" transform="translate(%d 0)"/>' % (fx + 30, fy - 93, fy - 67, 0))
    flg = ''.join(fl)
    # the seismometer, a box with two solar wings
    sx, sy = 452, 506
    eq = ('<path d="M%d %dL%d %dL%d %dL%d %dZ" fill="#26324e" stroke="#9aa4ba" stroke-width=".6"/><path d="M%d %dL%d %dL%d %dL%d %dZ" fill="#26324e" stroke="#9aa4ba" stroke-width=".6"/>'
          '<rect x="%d" y="%d" width="12" height="15" fill="url(#%sfoil)"/>' % (
              sx - 38, sy - 6, sx - 7, sy - 10, sx - 7, sy + 1, sx - 38, sy + 5, sx + 7, sy - 10, sx + 38, sy - 6, sx + 38, sy + 5, sx + 7, sy + 1, sx - 6, sy - 13, u))
    # bootprints: trails worn between the ladder, the flag and the experiments
    bp = []
    for (x0, y0), (x1, y1), n in [((cx - 6, B + 18), (fx + 8, fy + 8), 22), ((cx + 6, B + 20), (sx - 10, sy + 12), 20), ((cx - 30, B + 22), (cx - 120, 560), 14), ((fx + 4, fy + 10), (cx - 70, 540), 14)]:
        for i in range(n):
            t = i / (n - 1)
            x = x0 + (x1 - x0) * t + 6 * math.sin(t * 7 + x0); y = y0 + (y1 - y0) * t + 3 * math.cos(t * 5)
            k = (y - hz) / (H - hz); side = 3.5 if i % 2 else -3.5
            a = math.degrees(math.atan2((y1 - y0) * .3, x1 - x0))
            bp.append('<g transform="translate(%s %s) rotate(%s) scale(%s)"><ellipse rx="4.2" ry="1.7" fill="#1e1c18" opacity=".7"/><path d="M-4 -1.3H4" stroke="#e4dfd4" stroke-opacity=".45" stroke-width=".6"/></g>' % (
                f(x), f(y + side * .3), f(a), f(.7 + .9 * k)))
    # long shadows of the low morning sun, thrown to the right across the plain
    sh = 'matrix(1 0 -1.15 -.34 %s %s)' % (f(1.15 * B), f(1.34 * B))
    shf = 'matrix(1 0 -1.15 -.34 %s %s)' % (f(1.15 * fy), f(1.34 * fy))
    o = [gb, '<path d="%s" fill="none" stroke="#5aa8ff" stroke-opacity=".5" stroke-width="5" filter="url(#%sb5)"/>' % (arc(gx, gy, gr + 1, math.radians(110), math.radians(290)), u),
         lb, ''.join(bp),
         '<g transform="%s" filter="url(#%ssil)">%s</g>' % (sh, u, lmg),
         '<g transform="%s" filter="url(#%ssil)">%s</g>' % (shf, u, flg),
         '<ellipse cx="%d" cy="%d" rx="170" ry="12" fill="#000" opacity=".45" filter="url(#%sb5)"/>' % (cx + 20, B + 6, u),
         eq, lmg, flg]
    o = ['<g transform="translate(0 46)">%s</g>' % ''.join(o)]
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .12), defs)
    ann = [top('0.674°N 23.473°E · MARE TRANQUILLITATIS · 20 JULY 1969'),
           label((cx, 330), (22, 240), ['EAGLE', 'LUNAR MODULE 5']), label((fx + 20, fy - 80), (22, 420), ['FLAG', 'PLANTED 03:41 UTC']),
           label((gx, gy), (560, 240), ['EARTH', '384,400 KM'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= A LITTLE 3D
def mix(a, b, t):
    t = max(0, min(1, t))
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]; pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(x + (y - x) * t) for x, y in zip(pa, pb))


class Cam:
    """Orthographic camera. Model space: x right, y down, z toward the viewer; the model is turned by yaw (about y),
    pitch (about x) and roll (about z), then scaled by k px per unit about (cx, cy)."""

    def __init__(s, cx, cy, k, yaw, pitch, roll=0, light=(-.6, -.5, .62)):
        s.cx, s.cy, s.k = cx, cy, k
        s.a, s.b, s.c = math.radians(yaw), math.radians(pitch), math.radians(roll)
        n = math.sqrt(sum(v * v for v in light)); s.L = tuple(v / n for v in light)
        s.prims = []
        s.gid = 0

    def rot(s, p):
        x, y, z = p
        x, z = x * math.cos(s.a) + z * math.sin(s.a), -x * math.sin(s.a) + z * math.cos(s.a)
        y, z = y * math.cos(s.b) - z * math.sin(s.b), y * math.sin(s.b) + z * math.cos(s.b)
        x, y = x * math.cos(s.c) - y * math.sin(s.c), x * math.sin(s.c) + y * math.cos(s.c)
        return x, y, z

    def P(s, p):
        x, y, z = s.rot(p)
        return s.cx + s.k * x, s.cy + s.k * y, z

    def lit(s, n):
        n = s.rot(n); m = math.sqrt(sum(v * v for v in n)) or 1
        n = tuple(v / m for v in n)
        return n, sum(a * b for a, b in zip(n, s.L))

    def add(s, depth, svg_):
        s.prims.append((depth, len(s.prims), svg_))

    def quad(s, pts, light_col, dark_col, back=None, grid=None, amb=.18, spec=0, stroke=None, op=1):
        """A flat four-cornered panel. grid=(cols, rows, colour, opacity) rules cells on it."""
        Q = [s.P(p) for p in pts]
        e1 = [pts[1][i] - pts[0][i] for i in range(3)]; e2 = [pts[3][i] - pts[0][i] for i in range(3)]
        n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
        nv, d = s.lit(n)
        front = nv[2] >= 0
        if not front:
            d = -d
            if back: light_col, dark_col = back
        t = amb + (1 - amb) * max(0, d)
        col = mix(dark_col, light_col, t)
        path = 'M' + 'L'.join('%s %s' % (f(q[0]), f(q[1])) for q in Q) + 'Z'
        out = '<path d="%s" fill="%s"%s%s/>' % (path, col, ' stroke="%s" stroke-width=".5"' % stroke if stroke else '', ' opacity="%s"' % f(op) if op < 1 else '')
        if spec and d > 0:
            out += '<path d="%s" fill="#fff" opacity="%s"/>' % (path, f(spec * max(0, d) ** 6))
        if grid:
            cols, rows, gc, go = grid
            lines = []
            lerp = lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            for i in range(1, cols):
                t_ = i / cols
                a_, b_ = lerp(Q[0], Q[1], t_), lerp(Q[3], Q[2], t_)
                lines.append('M%s %sL%s %s' % (f(a_[0]), f(a_[1]), f(b_[0]), f(b_[1])))
            for i in range(1, rows):
                t_ = i / rows
                a_, b_ = lerp(Q[0], Q[3], t_), lerp(Q[1], Q[2], t_)
                lines.append('M%s %sL%s %s' % (f(a_[0]), f(a_[1]), f(b_[0]), f(b_[1])))
            out += '<path d="%s" stroke="%s" stroke-opacity="%s" stroke-width=".6" fill="none"/>' % (''.join(lines), gc, f(go))
        s.add(sum(q[2] for q in Q) / 4, out)

    def box(s, c, h, light_col, dark_col, amb=.2, spec=0):
        (x, y, z), (a, b, cc) = c, h
        V = lambda i, j, k: (x + i * a, y + j * b, z + k * cc)
        faces = [((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)), ((-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)),
                 ((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)), ((-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1)),
                 ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)), ((1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1))]
        for fc in faces:
            pts = [V(*v) for v in fc]
            e1 = [pts[1][i] - pts[0][i] for i in range(3)]; e2 = [pts[3][i] - pts[0][i] for i in range(3)]
            n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
            # outward normals by construction point away from the centre; keep the faces that turn to us
            cen = [sum(p[i] for p in pts) / 4 - (x, y, z)[i] for i in range(3)]
            if sum(a_ * b_ for a_, b_ in zip(n, cen)) < 0: n = tuple(-v for v in n)
            if s.rot(n)[2] <= 0: continue
            s.quad(pts if sum(a_ * b_ for a_, b_ in zip((e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]), cen)) > 0 else pts[::-1],
                   light_col, dark_col, amb=amb, spec=spec)

    def cyl(s, p0, p1, r, cols, u, cap=None, ribs=0, rib_col='#000', rib_op=.2):
        """A cylinder from p0 to p1: a shaded band across its width and the near end cap. cols = (shadow, mid, light, highlight)."""
        A, B = s.P(p0), s.P(p1)
        dx, dy = B[0] - A[0], B[1] - A[1]
        L = math.hypot(dx, dy) or 1e-6
        nx, ny = -dy / L, dx / L
        R = r * s.k
        ax = [p1[i] - p0[i] for i in range(3)]
        av, _ = s.lit(ax)
        # which edge of the band faces the light
        lx, ly = s.L[0], s.L[1]
        if nx * lx + ny * ly > 0: nx, ny = -nx, -ny
        s.gid += 1
        gid = '%scy%d' % (u, s.gid)
        g = '<linearGradient id="%s" gradientUnits="userSpaceOnUse" x1="%s" y1="%s" x2="%s" y2="%s"><stop offset="0" stop-color="%s"/><stop offset=".22" stop-color="%s"/><stop offset=".42" stop-color="%s"/><stop offset=".7" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>' % (
            gid, f(A[0] - nx * R), f(A[1] - ny * R), f(A[0] + nx * R), f(A[1] + ny * R), cols[2], cols[3], cols[2], cols[1], cols[0])
        pts = [(A[0] - nx * R, A[1] - ny * R), (B[0] - nx * R, B[1] - ny * R), (B[0] + nx * R, B[1] + ny * R), (A[0] + nx * R, A[1] + ny * R)]
        out = [g, '<path d="M%sZ" fill="url(#%s)"/>' % ('L'.join('%s %s' % (f(x), f(y)) for x, y in pts), gid)]
        ang = math.degrees(math.atan2(ny, nx))
        minor = R * abs(av[2])
        near_d = 1 if av[2] > 0 else -1
        ux, uy = dx / L * near_d, dy / L * near_d
        for i in range(1, ribs + 1):
            t = i / (ribs + 1)
            mx, my = A[0] + dx * t, A[1] + dy * t
            pts_ = [(mx + nx * R * math.cos(q * math.pi / 16) + ux * minor * math.sin(q * math.pi / 16),
                     my + ny * R * math.cos(q * math.pi / 16) + uy * minor * math.sin(q * math.pi / 16)) for q in range(17)]
            out.append('<path d="M%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width=".9"/>' % (
                'L'.join('%s %s' % (f(x), f(y)) for x, y in pts_), rib_col, f(rib_op)))
        # rounded ends: the far end peeks as an ellipse under the band, the near one is a full cap
        near, far = (B, A) if av[2] > 0 else (A, B)
        out.insert(1, '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" transform="rotate(%s %s %s)" fill="%s"/>' % (f(far[0]), f(far[1]), f(R), f(max(.3, minor)), f(ang), f(far[0]), f(far[1]), cols[1]))
        out.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" transform="rotate(%s %s %s)" fill="%s"/>' % (
            f(near[0]), f(near[1]), f(R), f(max(.3, minor)), f(ang), f(near[0]), f(near[1]), cap or cols[1]))
        s.add((A[2] + B[2]) / 2, ''.join(out))

    def line(s, p0, p1, col, w, op=1):
        A, B = s.P(p0), s.P(p1)
        s.add((A[2] + B[2]) / 2, '<path d="M%s %sL%s %s" stroke="%s" stroke-width="%s" stroke-opacity="%s" stroke-linecap="round"/>' % (f(A[0]), f(A[1]), f(B[0]), f(B[1]), col, f(w), f(op)))

    def render(s):
        return ''.join(v for _, _, v in sorted(s.prims))


def earth_limb(u, cx, cy, R, seed, fade_from, sun_x=.3):
    """A great curve of Earth seen from low orbit: ocean and cloud decks foreshortened toward the limb,
    the atmosphere a bright blue line, the whole darkening toward the foot of the frame."""
    defs = ('<clipPath id="%slimbc"><circle cx="%s" cy="%s" r="%s"/></clipPath>' % (u, f(cx), f(cy), f(R)) +
            rad(u, 'locean', [(0, '#0a2c5c', None), (.86, '#164f8e', None), (.97, '#3f86c8', None), (1, '#9fd0ff', None)], .5, .5, .5) +
            '<radialGradient id="%slsun" cx="%s" cy="0" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' % (u, f(sun_x)) +
            '<filter id="%slcl" x="0" y="0" width="100%%" height="100%%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".0045 .022" numOctaves="5" seed="%d"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.4 0 0 0 -1.35"/></filter>' % (u, seed) +
            '<filter id="%slcl2" x="0" y="0" width="100%%" height="100%%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".012 .07" numOctaves="4" seed="%d"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -1.4"/></filter>' % (u, seed + 7) +
            '<filter id="%slland" x="0" y="0" width="100%%" height="100%%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".003 .012" numOctaves="5" seed="%d"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 .42  0 0 0 0 .44  0 0 0 0 .26  6 0 0 0 -3.5"/></filter>' % (u, seed + 3) +
            blur(u, 'lb4', 4) + blur(u, 'lb14', 14, 40) + lin(u, 'lfade', [(0, '#000', 0), (.3, '#000', .4), (1, '#000', .94)]) +
            lin(u, 'lvert', [(0, '#fff', .0), (1, '#fff', 0)]))
    top_y = cy - R
    band = 'x="%s" y="%s" width="%s" height="%s"' % (f(cx - R), f(top_y), f(2 * R), f(H - top_y + 10))
    body = ('<circle cx="%s" cy="%s" r="%s" fill="none" stroke="#4a9cff" stroke-opacity=".6" stroke-width="30" filter="url(#%slb14)"/>' % (f(cx), f(cy), f(R + 10), u) +
            '<g clip-path="url(#%slimbc)"><circle cx="%s" cy="%s" r="%s" fill="url(#%slocean)"/>' % (u, f(cx), f(cy), f(R), u) +
            '<rect %s filter="url(#%slland)" opacity=".75"/>' % (band, u) +
            '<rect %s filter="url(#%slcl)" opacity=".62"/><rect %s filter="url(#%slcl2)" opacity=".4"/>' % (band, u, band, u) +
            '<circle cx="%s" cy="%s" r="%s" fill="url(#%slsun)"/>' % (f(cx), f(cy), f(R), u) +
            '<circle cx="%s" cy="%s" r="%s" fill="none" stroke="#9fd6ff" stroke-opacity=".55" stroke-width="18" filter="url(#%slb14)"/></g>' % (f(cx), f(cy), f(R - 6), u) +
            '<circle cx="%s" cy="%s" r="%s" fill="none" stroke="#d6efff" stroke-opacity=".85" stroke-width="2.5" filter="url(#%slb4)"/>' % (f(cx), f(cy), f(R + 1.5), u) +
            '<rect y="%s" width="%d" height="%s" fill="url(#%slfade)"/>' % (f(fade_from), W, f(H - fade_from), u))
    return defs, body


# ================================================================= ISS
def iss(u):
    rnd = random.Random(1998)
    bg = space(u, 200, 1998, ('#070b18', '#03050c', '#000104'), cy='.3')
    ld, lb = earth_limb(u, 291, 1300, 850, 2000, 470)
    C = Cam(291, 366, 3.8, 30, -24, 9, light=(-.55, -.6, .58))
    gold = ('#e8b85a', '#4a2e0c'); goldb = ('#e8e4da', '#6a6862')
    # the truss, segment by segment
    for i in range(11):
        x0 = -55 + i * 10
        C.box((x0 + 5, 0, 0), (5, 1.4, 1.4), '#ecebe6', '#4a4a48', spec=.3)
    # the eight solar array wings, on their masts, tilted to the sun
    for xs, beta in ((-49, 24), (-36.5, 24), (36.5, -18), (49, -18)):
        bt = math.radians(beta)
        for sgn in (-1, 1):
            dirv = (0, sgn * math.cos(bt), -sgn * math.sin(bt))
            P = lambda x, d: (x, 1.8 * sgn + dirv[1] * d, dirv[2] * d)
            for x0, x1 in ((xs - 5.6, xs - .55), (xs + .55, xs + 5.6)):
                pts = [P(x0, 1.5), P(x1, 1.5), P(x1, 35), P(x0, 35)]
                C.quad(pts, gold[0], gold[1], grid=(4, 22, '#2a1806', .45), amb=.35, spec=.25, stroke='#fff2c8')
            C.line(P(xs, 0), P(xs, 35.5), '#d8d6d0', 1.2)
            C.box(P(xs, 35.5), (5.8, .3, .3), '#cfcdc6', '#55534f')
    # the white radiators below the truss
    for xs in (-16, 16):
        for k in range(3):
            y0 = 2.5 + k * 7
            C.quad([(xs - 5, y0, -1.5 + k * .4), (xs + 5, y0, -1.5 + k * .4), (xs + 5, y0 + 6.5, -2 + k * .4), (xs - 5, y0 + 6.5, -2 + k * .4)],
                   '#dfe2e8', '#4e545e', grid=(5, 1, '#7a808c', .6), amb=.3)
    # the pressurised modules, nose to tail, hanging under the truss
    white = ('#3a3c40', '#a9acb2', '#eef0f2', '#ffffff')
    y = 4
    y = 4.6
    for z0, z1, r, ribs in ((-19, -15, 1.5, 0), (-15, -6.5, 3, 3), (-6.5, 4, 3, 5), (4, 9.5, 3, 2), (9.5, 22, 2.8, 5), (22, 35, 2.9, 6), (35, 41, 1.9, 2)):
        C.cyl((0, y, z0), (0, y, z1), r, white, u, ribs=ribs, rib_col='#2a2c30', rib_op=.25)
    C.cyl((-2, y, -11), (-15, y, -11), 3, white, u, ribs=3)       # Kibo
    C.cyl((2, y, -11), (10, y, -11), 3, white, u, ribs=2)         # Columbus
    C.cyl((-11, y - 3.6, -11), (-11, y - 6.5, -11), 2.2, white, u)  # Kibo's logistics module on top
    # Zvezda's and Zarya's own small blue arrays
    for z, span, wdt in ((28.5, 15, 2), (16, 12, 1.7)):
        for sgn in (-1, 1):
            C.quad([(sgn * 3.2, y, z - wdt), (sgn * span, y, z - wdt), (sgn * span, y, z + wdt), (sgn * 3.2, y, z + wdt)],
                   '#5a7ad0', '#0c1430', back=('#cfd2d8', '#4a4e56'), grid=(6, 2, '#a0b8f0', .35), amb=.25, spec=.3)
    # a docked Soyuz at the tail
    C.cyl((0, y, 41), (0, y, 47), 1.5, ('#2e3a2a', '#6f7a62', '#b8c0a8', '#e8eedc'), u)
    for sgn in (-1, 1):
        C.quad([(sgn * 1.2, y, 43), (sgn * 6, y, 43), (sgn * 6, y, 44.4), (sgn * 1.2, y, 44.4)], '#4a6ac0', '#0c1430', amb=.3)
    defs = ld + blur(u, 'b2', 2) + blur(u, 'b6', 6) + ''.join('')
    obj_body = lb + C.render()
    # a sun glint on the arrays
    gx, gy, _ = C.P((-49, -20, 8))
    obj_body += spike_star(gx, gy, 2.2, '#fff6dc', 34, .9, 1)
    obj = svg(W, H, obj_body + grain(u + 'o', W, H, .1), defs)
    ann = [top('INTERNATIONAL SPACE STATION · 1998-067A · 400 KM · 28,000 KM/H')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= HUBBLE
def hubble(u):
    rnd = random.Random(1990)
    bg = space(u, 220, 1990, ('#070b18', '#03050c', '#000104'), cy='.3')
    ld, lb = earth_limb(u, 291, 1380, 900, 1990, 500, .7)
    C = Cam(300, 330, 25, -48, -14, -24, light=(-.5, -.65, .6))
    foil = ('#2a2c32', '#878b94', '#d4d7dc', '#f6f7f9')
    C.cyl((-6.8, 0, 0), (-2.6, 0, 0), 2.25, ('#2e3036', '#8c9098', '#d8dade', '#ffffff'), u, ribs=3, rib_col='#1a1c20', rib_op=.5)
    C.cyl((-2.6, 0, 0), (3.6, 0, 0), 2.15, foil, u, ribs=4, rib_col='#3a3c42', rib_op=.3)
    C.cyl((3.6, 0, 0), (6.6, 0, 0), 2.1, foil, u, cap='#07080c', ribs=3, rib_col='#3a3c42', rib_op=.3)
    # the aperture door, swung open on its hinge
    a = math.radians(102)
    door = []
    for i in range(20):
        t = 2 * math.pi * i / 20
        h = 2.1 + 2.1 * math.cos(t)
        door.append((6.6 + .05 + h * math.sin(a), -2.1 + h * math.cos(a), 2.1 * math.sin(t)))
    C.quad(door, '#f4f5f7', '#5a5e66', amb=.3, spec=.3)
    # the two solar wings on their masts, broadside to the sun
    for sgn in (-1, 1):
        z0, z1 = sgn * 2.6, sgn * 9.8
        tw = math.radians(28)
        P = lambda x, z: (x, -1.3 * math.sin(tw) * (x + 2) / 1.3, z)
        C.line((-2, 0, sgn * 2.1), (-2, 0, z1), '#c8ccd2', 1.6)
        C.quad([(-3.3, -.6, z0), (-.7, .6, z0), (-.7, .6, z1), (-3.3, -.6, z1)], '#5a6ad8', '#0a0c26', grid=(2, 10, '#d8a840', .7), amb=.28, spec=.35, stroke='#d8a840')
    # the two high-gain antennas on their booms
    for sgn in (-1, 1):
        C.line((-3, sgn * 2.2, 0), (-3, sgn * 5.2, 0), '#d8dade', 1.4)
        dish = [(-3 + .9 * math.cos(2 * math.pi * i / 14), sgn * 5.4, .9 * math.sin(2 * math.pi * i / 14)) for i in range(14)]
        C.quad(dish, '#eef0f2', '#4a4e56', amb=.3)
    # handrails and the aft bulkhead
    for k in range(6):
        t = 2 * math.pi * k / 6
        C.line((-6.5, 2.27 * math.sin(t), 2.27 * math.cos(t)), (-2.8, 2.27 * math.sin(t), 2.27 * math.cos(t)), '#f2d070', .8, .7)
    defs = ld
    body = lb + C.render()
    gx, gy, _ = C.P((6.6, -2.1, 0))
    body += spike_star(gx - 8, gy + 6, 2, '#ffffff', 28, .85, .9)
    obj = svg(W, H, body + grain(u + 'o', W, H, .1), defs)
    ann = [top('HUBBLE SPACE TELESCOPE · 1990-037B · 540 KM ORBIT · 2.4 M MIRROR')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= JWST
def jwst(u):
    rnd = random.Random(2021)
    bg = space(u, 280, 2021, ('#0a0b1c', '#04050f', '#010106'), cy='.4',
               extra=''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%d %s %s)"/>' % (
                   f(x), f(y), f(r), f(r * .4), c, f(o_), a_, f(x), f(y)) for x, y, r, c, o_, a_ in
                   [(70, 180, 7, '#ffd8a8', .5, 30), (520, 230, 5, '#cfe0ff', .45, -20), (480, 610, 6, '#ffc8a0', .4, 60), (120, 640, 4, '#dfe8ff', .4, 10)]))
    cx, cy, s_ = 291, 296, 33
    sq = math.sqrt(3)
    defs = blur(u, 'b1', .8) + blur(u, 'b3', 3) + blur(u, 'b10', 10, 60) + blur(u, 'b24', 24, 80) + (
        rad(u, 'seg', [(0, '#fff1b8', None), (.35, '#f0c35a', None), (.75, '#c08a22', None), (1, '#7a520e', None)], .38, .32, .8) +
        lin(u, 'sheen', [(0, '#fff', 0), (.42, '#fff', 0), (.5, '#fffbe8', .5), (.58, '#fff', 0), (1, '#fff', 0)], 0, 0, 1, 1) +
        lin(u, 'ss', [(0, '#f2f0ff', None), (.4, '#b8b0d8', None), (.75, '#7a6aa8', None), (1, '#3a3060', None)], 0, 0, 1, 1) +
        lin(u, 'ssd', [(0, '#6a5a98', None), (1, '#1a1430', None)], 0, 0, 1, 1) +
        '')
    hexes = []
    for q in range(-2, 3):
        for r in range(-2, 3):
            if abs(q + r) > 2 or (q == 0 and r == 0): continue
            x = cx + 1.5 * s_ * q
            y = cy + sq * s_ * (r + q / 2)
            hexes.append((x, y))
    hp = lambda x, y, k=1: 'M' + 'L'.join('%s %s' % (f(x + s_ * k * math.cos(math.pi / 3 * i)), f(y + s_ * k * math.sin(math.pi / 3 * i))) for i in range(6)) + 'Z'
    allhex = ''.join(hp(x, y, 1.02) for x, y in hexes)
    defs += '<clipPath id="%smir"><path d="%s"/></clipPath>' % (u, allhex)
    o = []
    # the sunshield first: five layers like stacked kites, violet silver, catching the light on their edges
    for k in range(5):
        dy = (4 - k) * 11
        pts = [(26, 494 + dy), (150, 466 + dy), (291, 450 + dy), (432, 462 + dy), (556, 488 + dy), (420, 530 + dy), (291, 558 + dy), (160, 534 + dy)]
        d = smooth(pts)
        o.append('<path d="%s" fill="url(#%s)" opacity="%s"/>' % (d, u + ('ss' if k == 4 else 'ssd'), '1' if k == 4 else '.9'))
        o.append('<path d="%s" fill="none" stroke="#e8e4ff" stroke-opacity="%s" stroke-width="1.2"/>' % (d, f(.3 + .14 * k)))
        if k < 4:
            o.append('<path d="%s" fill="#06050c" opacity=".35" transform="translate(0 -4)"/>' % d)
    o.append('<path d="M150 470L291 454L250 556L160 534Z" fill="#fff" opacity=".12" filter="url(#%sb10)"/>' % u)
    o.append('<path d="M60 494Q291 470 520 488" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2" filter="url(#%sb3)"/>' % u)
    # the tower from the sunshield to the backplane
    o.append('<path d="M280 470L302 470L298 418L284 418Z" fill="#1a1a22"/><path d="M280 470L286 470L286 418L284 418Z" fill="#6a6a78"/>')
    # the backplane, black, peeking round the mirror
    o.append('<path d="%s" fill="#0c0c12" transform="translate(4 6)"/>' % ''.join(hp(x, y, 1.08) for x, y in hexes))
    # glow of the gold
    o.append('<circle cx="%d" cy="%d" r="170" fill="#ffc860" opacity=".16" filter="url(#%sb24)"/>' % (cx, cy, u))
    for i, (x, y) in enumerate(hexes):
        o.append('<path d="%s" fill="url(#%sseg)" stroke="#3a2606" stroke-width="2.4"/>' % (hp(x, y), u))
        o.append('<path d="%s" fill="%s" opacity="%s"/>' % (hp(x, y, .98), rnd.choice(['#fff4c8', '#7a4e0c', '#ffe08a']), f(rnd.uniform(.05, .2))))
        o.append('<path d="%s" fill="none" stroke="#fff6d0" stroke-opacity=".35" stroke-width=".8"/>' % hp(x, y, .9))
    o.append('<g clip-path="url(#%smir)"><rect x="%d" y="%d" width="340" height="320" fill="url(#%ssheen)"/></g>' % (u, cx - 170, cy - 160, u))
    # the central hole and the aft optics
    o.append('<path d="%s" fill="#0a0a10"/><circle cx="%d" cy="%d" r="10" fill="#2a2a34"/><circle cx="%d" cy="%d" r="4" fill="#8a8a9a"/>' % (hp(cx, cy, .9), cx, cy, cx, cy))
    # the secondary mirror on its three struts
    sx, sy = cx + 6, cy - 20
    for ex, ey in ((cx - 128, cy + 96), (cx + 128, cy + 96), (cx, cy - 172)):
        o.append('<path d="M%s %sL%s %s" stroke="#14141c" stroke-width="5" stroke-linecap="round"/><path d="M%s %sL%s %s" stroke="#9a9aac" stroke-width="1.2" stroke-opacity=".8"/>' % (
            f(ex), f(ey), f(sx), f(sy), f(ex - 1.5), f(ey - 1), f(sx - 1.5), f(sy - 1)))
    o.append('<circle cx="%s" cy="%s" r="16" fill="#1a1a22"/><circle cx="%s" cy="%s" r="11" fill="#e8c46a"/><circle cx="%s" cy="%s" r="5" fill="#fff4c8" opacity=".8" filter="url(#%sb1)"/>' % (
        f(sx), f(sy), f(sx), f(sy), f(sx - 3), f(sy - 3), u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('JAMES WEBB SPACE TELESCOPE · 2021-130A · SUN–EARTH L2 · 6.5 M MIRROR')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= SPUTNIK 1
def sputnik(u):
    bg = space(u, 220, 1957, ('#070b18', '#03050c', '#000104'), cy='.3')
    ld, lb = earth_limb(u, 291, 1420, 900, 1957, 540, .25)
    cx, cy, R = 236, 300, 88
    defs = ld + blur(u, 'b1', .8) + blur(u, 'b3', 3) + blur(u, 'b12', 12, 60) + (
        lin(u, 'env', [(0, '#f2f3f5', None), (.18, '#c4c8ce', None), (.36, '#6a6e78', None), (.5, '#1a1c22', None), (.6, '#0a0b10', None), (.72, '#1e3c66', None), (.86, '#4c86c4', None), (1, '#bfe2ff', None)], 0, 0, .25, 1) +
        rad(u, 'hi', [(0, '#ffffff', 1), (.25, '#ffffff', .6), (1, '#ffffff', 0)]) +
        rad(u, 'rim', [(.78, '#000', 0), (.96, '#000', .45), (1, '#000', .7)]) +
        lin(u, 'rod', [(0, '#ffffff', None), (.5, '#a8acb4', None), (1, '#3a3c42', None)], 0, 0, 0, 1))
    # four antennas, two pairs, swept back from the sphere's rear toward the lower right
    rods = [(-24, 640, -.5), (-8, 720, -.15), (10, 700, .2), (24, 620, .55)]
    back, front = [], []
    for k, (ang, L, off) in enumerate(rods):
        a = math.radians(ang + 28)
        x0, y0 = cx + R * .62 + 10 * off, cy - R * .2 + R * .5 * off
        x1, y1 = x0 + L * math.cos(a), y0 + L * math.sin(a)
        g = ('<path d="M%s %sL%s %s" stroke="#1a1c22" stroke-width="3.2" stroke-linecap="round"/>'
             '<path d="M%s %sL%s %s" stroke="#e8ecf2" stroke-width="1.4" stroke-linecap="round" stroke-opacity=".9"/>'
             '<path d="M%s %sL%s %s" stroke="#fff" stroke-width="5" stroke-opacity=".18" filter="url(#%sb3)"/>'
             '<g transform="translate(%s %s) rotate(%s)"><rect x="-4" y="-5" width="18" height="10" rx="2" fill="#6a6e78"/><rect x="-4" y="-5" width="18" height="4" rx="2" fill="#e6e9ee"/></g>') % (
            f(x0), f(y0), f(x1), f(y1), f(x0), f(y0 - .8), f(x1), f(y1 - .8), f(x0), f(y0), f(x0 + (x1 - x0) * .4), f(y0 + (y1 - y0) * .4), u,
            f(x0), f(y0), f(ang + 28))
        (back if k % 2 else front).append(g)
    o = [lb, ''.join(back),
         '<circle cx="%d" cy="%d" r="%d" fill="#cfe4ff" opacity=".12" filter="url(#%sb12)"/>' % (cx, cy, R + 20, u),
         '<circle cx="%d" cy="%d" r="%d" fill="url(#%senv)"/>' % (cx, cy, R, u),
         # the seam where the two polished hemispheres meet, with its bolts
         '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="none" stroke="#0c0e12" stroke-opacity=".55" stroke-width="1.6" transform="rotate(-62 %d %d)"/>' % (cx, cy, R, R * .3, cx, cy),
         '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="none" stroke="#f4f6fa" stroke-opacity=".3" stroke-width=".8" transform="rotate(-62 %d %d) translate(-1.5 -1.5)"/>' % (cx, cy, R, R * .3, cx, cy),
         '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%shi)" transform="rotate(-30 %s %s)"/>' % (f(cx - R * .36), f(cy - R * .42), f(R * .4), f(R * .26), u, f(cx - R * .36), f(cy - R * .42)),
         '<circle cx="%d" cy="%d" r="%d" fill="url(#%srim)"/>' % (cx, cy, R, u),
         '<path d="%s" fill="none" stroke="#bfe2ff" stroke-opacity=".7" stroke-width="2" filter="url(#%sb1)"/>' % (arc(cx, cy, R - 1, math.radians(40), math.radians(150)), u),
         ''.join(front),
         spike_star(cx - R * .38, cy - R * .46, 2.4, '#ffffff', 46, 1, 1.1)]
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('SPUTNIK 1 · 1957-001B · 4 OCTOBER 1957 · 58 CM · 83.6 KG')]
    return bg, obj, svg(W, H, ''.join(ann))


PLATES = {'EARTH': earth, 'EARTHRISE': earthrise, 'MOON': moon, 'APOLLO-11': apollo11, 'ISS': iss, 'HUBBLE': hubble, 'JWST': jwst, 'SPUTNIK-1': sputnik}

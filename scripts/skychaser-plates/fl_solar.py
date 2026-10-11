"""First Light, the solar-system plates: seven full-art drawings at 582 × 832.

Same stack as drawing.py — a sky layer, an object layer with grain, and a
light survey layer — composed for the tall window with the subject in the
upper two thirds, since the card face prints the name over the foot.
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL, label, scalebar, reticle
from more import sky, shade_defs, top, spike_star, W, HF

H = HF


def noise(u, name, freq, octaves, seed, sat=0):
    return ('<filter id="%s%s" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d"/>'
            '<feColorMatrix type="saturate" values="%s"/></filter>') % (u, name, freq, octaves, seed, sat)


def blur(u, name, sd, pad=20):
    return '<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feGaussianBlur stdDeviation="%s"/></filter>' % (u, name, pad, pad, 100 + 2 * pad, 100 + 2 * pad, sd)


def disc_defs(u, cx, cy, R, base, limb=('.6', '.18', '.42')):
    return ('<clipPath id="%sdisk"><circle cx="%s" cy="%s" r="%s"/></clipPath>'
            '<radialGradient id="%sbase" cx="%s" cy="%s" r=".74">%s</radialGradient>'
            '<radialGradient id="%slimb" cx=".5" cy=".5" r=".5"><stop offset="%s" stop-color="#000" stop-opacity="0"/><stop offset=".9" stop-color="#000" stop-opacity="%s"/><stop offset="1" stop-color="#000" stop-opacity="%s"/></radialGradient>') % (
        u, f(cx), f(cy), f(R), u, base[0], base[1], ''.join('<stop offset="%s" stop-color="%s"/>' % (o, c) for o, c in base[2]), u, limb[0], limb[1], limb[2])


# ----------------------------------------------------------------- a full moon, reusable
MARIA = [(-0.30, -0.42, .26, .22), (0.12, -0.40, .15, .14), (0.30, -0.12, .19, .16), (0.66, -0.30, .08, .12), (0.52, 0.10, .11, .17),
         (0.34, 0.26, .08, .09), (-0.22, 0.30, .16, .12), (-0.50, 0.36, .08, .08), (-0.62, -0.05, .24, .42), (-0.02, -0.72, .42, .06),
         (0.0, -0.22, .07, .05), (-0.30, 0.12, .09, .07)]


def full_moon(u, cx, cy, R, rnd, base, mare='#5f6470', mare_op=.8, ray_col='#f7f6f0', ray_op=.17, crater_tint=('#2c2d33', '#e2e0d9', '#fbfaf5')):
    """The near side, full, lit flat. Returns (defs, body) — body is meant to be clipped to the disc."""
    defs = disc_defs(u, cx, cy, R, base) + noise(u, 'n1', '.014', 5, 4) + noise(u, 'n2', '.09', 3, 9) + blur(u, 'b2', 2.2, 0) + blur(u, 'b1', .7, 0)
    P = lambda x, y: (cx + x * R, cy + y * R)
    body = ['<circle cx="%s" cy="%s" r="%s" fill="url(#%sbase)"/>' % (f(cx), f(cy), f(R), u),
            '<rect x="%s" y="%s" width="%s" height="%s" filter="url(#%sn1)" opacity=".42" style="mix-blend-mode: multiply"/>' % (f(cx - R), f(cy - R), f(2 * R), f(2 * R), u)]
    mar = []
    for x, y, rx, ry in MARIA:
        X, Y = P(x, y)
        mar.append('<path d="%s" fill="%s" opacity="%s"/>' % (blob(X, Y, rx * R, ry * R, rnd, 16, .26), mare, f(mare_op)))
        mar.append('<path d="%s" fill="%s" opacity="%s"/>' % (blob(X + rnd.uniform(-6, 6), Y + rnd.uniform(-6, 6), rx * R * .6, ry * R * .6, rnd, 12, .3), mare, f(mare_op * .5)))
    body.append('<g filter="url(#%sb2)">%s</g>' % (u, ''.join(mar)))
    body.append('<rect x="%s" y="%s" width="%s" height="%s" filter="url(#%sn2)" opacity=".22" style="mix-blend-mode: overlay"/>' % (f(cx - R), f(cy - R), f(2 * R), f(2 * R), u))

    def rays(x, y, n, lo, hi, op):
        X, Y = P(x, y); out = []
        for _ in range(n):
            t = rnd.uniform(0, 2 * math.pi); L = rnd.uniform(lo, hi) * R
            out.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
                f(X), f(Y), f(X + L * math.cos(t)), f(Y + L * math.sin(t)), ray_col, f(rnd.uniform(op * .4, op)), f(rnd.uniform(.7, 2.4))))
        out.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity=".16"/>' % (f(X), f(Y), f(R * .08), ray_col))
        return ''.join(out)
    body.append('<g filter="url(#%sb1)">%s%s%s</g>' % (u, rays(-0.14, 0.68, 52, .15, .95, ray_op), rays(-0.34, -0.17, 30, .08, .36, ray_op * .8), rays(-0.59, -0.13, 16, .05, .2, ray_op * .7)))
    cr = []

    def crater(x, y, r):
        d = math.hypot(x, y); fo = math.sqrt(max(.06, 1 - d * d)); ang = math.degrees(math.atan2(y, x))
        t = math.radians(-ang); sx, sy = math.cos(t), math.sin(t)
        X, Y = P(x, y)
        cr.append('<g transform="translate(%s %s) rotate(%s)"><ellipse rx="%s" ry="%s" fill="%s" opacity=".34"/>'
                  '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity=".42"/>'
                  '<ellipse rx="%s" ry="%s" fill="none" stroke="%s" stroke-opacity=".22" stroke-width=".7"/></g>' % (
                      f(X), f(Y), f(ang), f(r * fo), f(r), crater_tint[0], f(-sx * r * .24 * fo), f(-sy * r * .24), f(r * .78 * fo), f(r * .78), crater_tint[1], f(r * 1.04 * fo), f(r * 1.04), crater_tint[2]))
    for x, y, r in [(-0.14, 0.68, 9), (-0.34, -0.17, 10), (-0.59, -0.13, 5), (0.10, 0.62, 12), (-0.05, 0.40, 8), (0.44, 0.58, 10)]:
        crater(x, y, r * R / 200)
    n = 0
    while n < 220:
        x, y = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        if x * x + y * y > .93: continue
        inmare = any(((x - mx) / mrx) ** 2 + ((y - my) / mry) ** 2 < 1 for mx, my, mrx, mry in MARIA)
        if inmare and rnd.random() > .25: continue
        crater(x, y, (1.2 + 11 * rnd.random() ** 3.4) * R / 200); n += 1
    body.append(''.join(cr))
    body.append('<circle cx="%s" cy="%s" r="%s" fill="url(#%slimb)"/>' % (f(cx), f(cy), f(R), u))
    return defs, ''.join(body)


# ================================================================= TYCHO
def tycho(u):
    """The crater from above at crater scale: terraced walls, a flat floor, the central peak, and the rays going out across the dark highlands."""
    cx, cy, R = 291, 310, 152
    rnd = random.Random(43)
    defs = noise(u, 'gn', '.02', 5, 11) + noise(u, 'fn', '.14', 3, 12) + blur(u, 'b1', 1.2, 0) + blur(u, 'b3', 3.5, 0) + blur(u, 'b8', 9, 30) + blur(u, 'b20', 22, 40) + (
            '<radialGradient id="%sground" cx=".5" cy=".38" r=".9"><stop offset="0" stop-color="#8a8780"/><stop offset=".5" stop-color="#5e5c56"/><stop offset="1" stop-color="#2a2926"/></radialGradient>'
            '<radialGradient id="%sfloor" cx=".45" cy=".42" r=".7"><stop offset="0" stop-color="#7d7a72"/><stop offset=".75" stop-color="#5b5953"/><stop offset="1" stop-color="#3a3935"/></radialGradient>'
            '<linearGradient id="%swallL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151412"/><stop offset="1" stop-color="#151412" stop-opacity="0"/></linearGradient>'
            '<linearGradient id="%swallR" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f1eee6"/><stop offset="1" stop-color="#f1eee6" stop-opacity="0"/></linearGradient>'
            '<radialGradient id="%svig" cx=".5" cy=".42" r=".8"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>'
            '<clipPath id="%sbowl"><path d="%s"/></clipPath>') % (u, u, u, u, u, u, blob(cx, cy, R, R * .97, random.Random(7), 22, .04))
    bg = svg(W, H, ('<rect width="%d" height="%d" fill="url(#%sground)"/>'
                    '<rect width="%d" height="%d" filter="url(#%sgn)" opacity=".55" style="mix-blend-mode: multiply"/>'
                    '<rect width="%d" height="%d" filter="url(#%sfn)" opacity=".16" style="mix-blend-mode: overlay"/>') % (W, H, u, W, H, u, W, H, u), defs)
    o = []

    def crater(x, y, r, depth=.5):
        """Lit from the upper left: a dark far wall on the left, a bright rim on the right."""
        return ('<circle cx="%s" cy="%s" r="%s" fill="#1c1b19" opacity="%s"/>'
                '<circle cx="%s" cy="%s" r="%s" fill="#6f6d66" opacity=".9"/>'
                '<path d="M%s %sA%s %s 0 0 1 %s %s" fill="none" stroke="#f3f0e8" stroke-opacity=".7" stroke-width="%s"/>'
                '<path d="M%s %sA%s %s 0 0 1 %s %s" fill="none" stroke="#0e0e0d" stroke-opacity=".75" stroke-width="%s"/>') % (
            f(x), f(y), f(r), f(depth), f(x + r * .18), f(y + r * .16), f(r * .8),
            f(x + r * .7), f(y - r * .7), f(r), f(r), f(x + r * .7), f(y + r * .7), f(max(.6, r * .16)),
            f(x - r * .75), f(y + r * .65), f(r), f(r), f(x - r * .7), f(y - r * .7), f(max(.6, r * .14)))
    # the ray system: bright ejecta fans, long and thin, out to every edge
    rays = []
    for _ in range(220):
        t = rnd.uniform(0, 2 * math.pi); L = rnd.uniform(.3, 3.4) * R * (1.3 if rnd.random() < .2 else 1); w = rnd.uniform(2, 14)
        x0, y0 = cx + (R + 6) * math.cos(t), cy + (R + 6) * math.sin(t)
        rays.append('<path d="M%s %sL%s %s" stroke="#e9e6de" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(x0), f(y0), f(x0 + L * math.cos(t + rnd.uniform(-.04, .04))), f(y0 + L * math.sin(t)), f(rnd.uniform(.05, .22)), f(w)))
    o.append('<g filter="url(#%sb8)">%s</g>' % (u, ''.join(rays)))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="#d9d5cb" opacity=".35" filter="url(#%sb20)"/>' % (cx, cy, R + 70, u))
    # hummocky ejecta and secondary craters on the blanket, thinning with distance
    for _ in range(90):
        t = rnd.uniform(0, 2 * math.pi); d = R + rnd.uniform(6, 120); x, y = cx + d * math.cos(t), cy + d * math.sin(t)
        o.append('<path d="%s" fill="%s" opacity="%s"/>' % (blob(x, y, rnd.uniform(5, 16), rnd.uniform(3, 9), rnd, 9, .45), rnd.choice(['#e4e0d6', '#2a2926']), f(rnd.uniform(.15, .4))))
    for _ in range(240):
        t = rnd.uniform(0, 2 * math.pi); d = R + rnd.uniform(14, 420); x, y = cx + d * math.cos(t), cy + d * math.sin(t)
        if not (-10 < x < W + 10 and -10 < y < H + 10): continue
        o.append(crater(x, y, rnd.uniform(1.5, 8) * (1 + (d - R) / 380), .45))
    # the rim crest: a lit arc on the sunward side, shadow opposite, both soft
    o.append('<path d="M%s %sA%s %s 0 0 0 %s %s" fill="none" stroke="#fbfaf5" stroke-opacity=".75" stroke-width="5" filter="url(#%sb3)"/>' % (
        f(cx + (R + 2) * math.cos(.4)), f(cy + (R + 2) * math.sin(.4)), f(R + 2), f(R + 2), f(cx + (R + 2) * math.cos(-2.2)), f(cy + (R + 2) * math.sin(-2.2)), u))
    o.append('<path d="M%s %sA%s %s 0 0 0 %s %s" fill="none" stroke="#0e0e0d" stroke-opacity=".7" stroke-width="8" filter="url(#%sb3)"/>' % (
        f(cx + (R + 4) * math.cos(-2.4)), f(cy + (R + 4) * math.sin(-2.4)), f(R + 4), f(R + 4), f(cx + (R + 4) * math.cos(.6)), f(cy + (R + 4) * math.sin(.6)), u))
    # the bowl
    bowl = ['<circle cx="%d" cy="%d" r="%d" fill="#4a4843"/>' % (cx, cy, R)]
    # terraces: four slumped benches stepping down the wall, each a shelf with a lit riser on the right and a shadowed one on the left
    for i, k in enumerate((1.0, .88, .77, .67)):
        r = R * k
        ring = blob(cx + i * 2, cy + i * 2, r, r * .985, rnd, 26, .05)
        shade = ['#5b5953', '#66645d', '#6e6c65', '#75736b'][i]
        bowl.append('<path d="%s" fill="%s"/>' % (ring, shade))
        bowl.append('<path d="%s" fill="none" stroke="#0c0c0b" stroke-opacity=".8" stroke-width="%s" filter="url(#%sb3)" transform="translate(%s %s)"/>' % (ring, f(R * .07), u, f(-R * .045), f(-R * .035)))
        bowl.append('<path d="%s" fill="none" stroke="#f6f4ee" stroke-opacity=".5" stroke-width="%s" filter="url(#%sb1)" transform="translate(%s %s)"/>' % (ring, f(R * .02), u, f(R * .04), f(R * .035)))
        bowl.append('<path d="%s" fill="%s"/>' % (ring, shade))
    floor = blob(cx + 6, cy + 6, R * .6, R * .585, rnd, 22, .06)
    bowl.append('<path d="%s" fill="none" stroke="#0c0c0b" stroke-opacity=".85" stroke-width="%s" filter="url(#%sb3)" transform="translate(%s %s)"/>' % (floor, f(R * .08), u, f(-R * .05), f(-R * .04)))
    bowl.append('<path d="%s" fill="url(#%sfloor)"/>' % (floor, u))
    # slump blocks and boulders on the benches and floor
    for _ in range(140):
        t = rnd.uniform(0, 2 * math.pi); d = rnd.uniform(.05, .95) * R; x, y = cx + d * math.cos(t), cy + d * math.sin(t)
        r = rnd.uniform(1, 6) * (1.6 if d > .62 * R else 1)
        bowl.append('<path d="%s" fill="#2b2a27" opacity=".5"/><path d="%s" fill="#cfcbc1" opacity=".55"/>' % (
            blob(x - r * .3, y + r * .3, r * 1.3, r * .8, rnd, 8, .4), blob(x + r * .3, y - r * .3, r * .8, r * .5, rnd, 7, .4)))
    for _ in range(40):
        t = rnd.uniform(0, 2 * math.pi); d = rnd.uniform(.05, .6) * R
        bowl.append(crater(cx + d * math.cos(t), cy + d * math.sin(t), rnd.uniform(1.2, 5), .5))
    bowl.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sfn)" opacity=".18" style="mix-blend-mode: overlay"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    # the central peak: a cluster of summits 2 km high, throwing a long shadow to the lower left
    px, py = cx + 6, cy - 4
    bowl.append('<path d="M%s %sL%s %sL%s %sL%s %sZ" fill="#0a0a09" opacity=".9" filter="url(#%sb3)"/>' % (f(px + 6), f(py - 4), f(px - 96), f(py + 26), f(px - 70), f(py + 44), f(px + 10), f(py + 18), u))
    for dx, dy, r in [(0, 0, 24), (-18, 12, 14), (16, 14, 12), (-4, -20, 9)]:
        bowl.append('<path d="%s" fill="#8f8c84"/>' % blob(px + dx, py + dy, r, r * .82, rnd, 10, .3))
        bowl.append('<path d="%s" fill="#f6f4ee" opacity=".85"/>' % blob(px + dx + r * .28, py + dy - r * .28, r * .5, r * .42, rnd, 8, .3))
        bowl.append('<path d="%s" fill="#1c1b19" opacity=".8"/>' % blob(px + dx - r * .38, py + dy + r * .22, r * .55, r * .45, rnd, 8, .3))
    o.append('<g clip-path="url(#%sbowl)">%s</g>' % (u, ''.join(bowl)))
    o.append('<rect width="%d" height="%d" fill="url(#%svig)"/>' % (W, H, u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [scalebar(22, 800, 40 * R / 43, '40 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= OLYMPUS MONS
def olympus(u):
    """The shield from orbit: a 600-km dome, its basal cliff, its flanks scored by lava, the nested calderas at the summit, and the curve of Mars against space."""
    rnd = random.Random(22)
    defs = noise(u, 'sn', '.016', 5, 7) + noise(u, 'fn', '.09', 3, 3) + noise(u, 'cn', '.02 .06', 3, 5) + blur(u, 'b2', 2, 0) + blur(u, 'b6', 6, 20) + blur(u, 'b14', 14, 30) + (
            '<linearGradient id="%sspace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040305"/><stop offset="1" stop-color="#160b09"/></linearGradient>'
            '<linearGradient id="%sglow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb894" stop-opacity="0"/><stop offset=".8" stop-color="#ffb894" stop-opacity=".3"/><stop offset="1" stop-color="#ffe0cc" stop-opacity=".95"/></linearGradient>'
            '<radialGradient id="%sground" cx=".5" cy="0" r="1.2"><stop offset="0" stop-color="#d98a58"/><stop offset=".5" stop-color="#b8602f"/><stop offset="1" stop-color="#5a2412"/></radialGradient>'
            '<radialGradient id="%sshield" cx=".4" cy=".34" r=".66"><stop offset="0" stop-color="#e9a070"/><stop offset=".3" stop-color="#d47e4c"/><stop offset=".7" stop-color="#b45a30"/><stop offset=".93" stop-color="#8e4222"/><stop offset="1" stop-color="#6a2c14"/></radialGradient>'
            '<linearGradient id="%shaze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd8c0" stop-opacity="0"/><stop offset="1" stop-color="#ffd8c0" stop-opacity=".2"/></linearGradient>'
            '<linearGradient id="%srelief" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#ffe2cc" stop-opacity=".22"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#2a0c04" stop-opacity=".5"/></linearGradient>'
            '<clipPath id="%splanet"><path d="M-200 240Q291 90 782 240V%d H-200Z"/></clipPath>'
            '<clipPath id="%sdome"><ellipse cx="291" cy="400" rx="262" ry="158"/></clipPath>') % (u, u, u, u, u, u, u, H, u)
    bg = svg(W, H, ('<rect width="%d" height="%d" fill="url(#%sspace)"/>' % (W, H, u) + starfield(W, 230, 110, 22, 2, u=u) +
                    '<rect width="%d" height="240" fill="url(#%sglow)"/>' % (W, u)), SPIKE_DEFS.format(u=u) + defs)
    sx, sy, rx, ry = 291, 400, 262, 158
    o = ['<g clip-path="url(#%splanet)"><rect width="%d" height="%d" fill="url(#%sground)"/>' % (u, W, H, u),
         '<rect width="%d" height="%d" filter="url(#%ssn)" opacity=".45" style="mix-blend-mode: multiply"/>' % (W, H, u)]
    # the plains: old flows and wrinkle ridges running away from the volcano
    for _ in range(90):
        y = rnd.uniform(250, 830); x = rnd.uniform(-40, 620)
        o.append('<path d="M%s %sq%s %s %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
            f(x), f(y), f(rnd.uniform(-40, 40)), f(rnd.uniform(10, 40)), f(rnd.uniform(-120, 120)), f(rnd.uniform(30, 120)), rnd.choice(['#7a3018', '#e8a878', '#5a2210']), f(rnd.uniform(.1, .3)), f(rnd.uniform(1, 6))))
    for _ in range(60):
        x, y = rnd.uniform(0, W), rnd.uniform(250, 830)
        if ((x - sx) / (rx + 40)) ** 2 + ((y - sy) / (ry + 30)) ** 2 < 1: continue
        r = rnd.uniform(1.5, 7)
        o.append('<circle cx="%s" cy="%s" r="%s" fill="#3a1408" opacity=".4"/><circle cx="%s" cy="%s" r="%s" fill="none" stroke="#ffcfae" stroke-opacity=".4" stroke-width=".7"/>' % (f(x), f(y), f(r), f(x - r * .1), f(y - r * .08), f(r)))
    # the aureole: lobes of broken ground spilling out from under the cliff, mostly to the north-west
    for _ in range(70):
        t = rnd.uniform(0, 2 * math.pi); d = rnd.uniform(1.02, 1.42 if math.cos(t) < 0 else 1.18)
        x, y = sx + rx * d * math.cos(t), sy + ry * d * math.sin(t)
        o.append('<path d="%s" fill="%s" opacity="%s"/>' % (blob(x, y, rnd.uniform(10, 34), rnd.uniform(5, 14), rnd, 12, .4), rnd.choice(['#6e2812', '#e6986a', '#a24a26']), f(rnd.uniform(.15, .4))))
    # the shield's shadow, thrown south-east by an afternoon sun
    o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#2a0e06" opacity=".55" filter="url(#%sb14)" transform="translate(28 26)"/>' % (sx, sy, rx, ry, u))
    o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="url(#%sshield)"/>' % (sx, sy, rx, ry, u))
    # relief: the dome's near side falls away into shade, its far side catches the light
    o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="url(#%srelief)"/>' % (sx, sy, rx, ry, u))
    dome = []
    # contour: the slope is gentle, so the dome is drawn in faint concentric steps that darken to the south-east
    for k in (.16, .3, .45, .6, .75, .9):
        dome.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="none" stroke="#ffd2b0" stroke-opacity=".12" stroke-width="1.4"/>' % (f(sx - (1 - k) * 12), f(sy - 40 * (1 - k) - 6), f(rx * k), f(ry * k)))
    # the flanks: hundreds of radial lava channels and levees
    for _ in range(360):
        t = rnd.uniform(0, 2 * math.pi); r0 = rnd.uniform(.06, .55); r1 = min(1.02, r0 + rnd.uniform(.2, .55))
        cxo, cyo = sx - 8, sy - 30
        dome.append('<path d="M%s %sQ%s %s %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
            f(cxo + rx * r0 * math.cos(t)), f(cyo + ry * r0 * math.sin(t)), f(cxo + rx * (r0 + r1) / 2 * math.cos(t + .05)), f(cyo + ry * (r0 + r1) / 2 * math.sin(t + .05)),
            f(cxo + rx * r1 * math.cos(t)), f(cyo + ry * r1 * math.sin(t)), rnd.choice(['#6e2a12', '#ffcaa4', '#8a3a1c', '#f4a878']), f(rnd.uniform(.14, .4)), f(rnd.uniform(.5, 2.4))))
    dome.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%scn)" opacity=".3" style="mix-blend-mode: multiply"/>' % (sx - rx, sy - ry, 2 * rx, 2 * ry, u))
    dome.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sfn)" opacity=".14" style="mix-blend-mode: overlay"/>' % (sx - rx, sy - ry, 2 * rx, 2 * ry, u))
    o.append('<g clip-path="url(#%sdome)">%s</g>' % (u, ''.join(dome)))
    # the escarpment: a cliff 8 km high round the whole base — a band of shadow under the south-eastern edge, a lit lip on the north-west
    o.append('<path d="M%s %sA%d %d 0 0 0 %s %sA%d %d 0 0 1 %s %sZ" fill="#1a0803" opacity=".8" filter="url(#%sb2)"/>' % (
        f(sx + rx), f(sy), rx, ry, f(sx), f(sy + ry), rx, ry + 9, f(sx + rx), f(sy), u))
    o.append('<path d="M%s %sA%d %d 0 0 0 %s %s" fill="none" stroke="#1a0803" stroke-opacity=".9" stroke-width="6" filter="url(#%sb6)"/>' % (f(sx + rx * .98), f(sy + ry * .2), rx, ry, f(sx - rx * .5), f(sy + ry * .87), u))
    o.append('<path d="M%s %sA%d %d 0 0 0 %s %s" fill="none" stroke="#ffe4cf" stroke-opacity=".8" stroke-width="2.2" filter="url(#%sb2)"/>' % (f(sx - rx * .98), f(sy + ry * .2), rx, ry, f(sx + rx * .5), f(sy - ry * .87), u))
    # the summit: six nested collapse calderas, each floor a step down, walls lit from the north-west
    cald = [(0, 0, 46, 27), (-24, -15, 27, 15), (18, -21, 23, 13), (28, 12, 19, 11), (-31, 12, 17, 10), (2, -36, 14, 8)]
    for dx, dy, a, b in cald:
        X, Y = sx - 8 + dx, sy - 46 + dy
        o.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#4a160a"/>' % (f(X), f(Y), f(a), f(b)))
        o.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#93401f"/>' % (f(X + a * .1), f(Y + b * .18), f(a * .86), f(b * .78)))
        o.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="none" stroke="#ffd9c0" stroke-opacity=".8" stroke-width="1.3"/>' % (f(X), f(Y), f(a), f(b)))
        o.append('<path d="M%s %sA%s %s 0 0 0 %s %s" fill="none" stroke="#1e0702" stroke-opacity=".85" stroke-width="2.2"/>' % (f(X - a * .95), f(Y + b * .3), f(a), f(b), f(X + a * .3), f(Y - b * .95)))
    # afternoon water-ice cloud banked on the western flank, and haze near the limb
    cl = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#fff4ea" opacity="%s"/>' % (
        f(sx - rx * rnd.uniform(.35, 1.0)), f(sy + ry * rnd.uniform(-.25, .45)), f(rnd.uniform(16, 60)), f(rnd.uniform(5, 13)), f(rnd.uniform(.1, .26))) for _ in range(22))
    o.append('<g filter="url(#%sb6)">%s</g>' % (u, cl))
    o.append('<rect width="%d" height="%d" fill="url(#%shaze)"/></g>' % (W, H, u))
    o.append('<path d="M-200 240Q291 90 782 240" fill="none" stroke="#ffd2b4" stroke-opacity=".6" stroke-width="2" filter="url(#%sb2)"/>' % u)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .11), defs)
    ann = [scalebar(22, 800, 100 * rx / 300, '100 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= EUROPA
def europa(u):
    """The ice moon full on: white-blue ice, the long brown lineae and cycloids, chaos terrain, Jupiter's light off to one side."""
    cx, cy, R = 291, 318, 205
    rnd = random.Random(3122)
    bg = sky(u, H, ('#1b1a2c', '#0a0a16', '#030308'), 200, 502, 4, extra=
             '<ellipse cx="640" cy="120" rx="360" ry="300" fill="url(#%sjup)"/>' % u,
             extra_defs='<radialGradient id="%sjup" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e8b88a" stop-opacity=".55"/><stop offset=".5" stop-color="#b07a50" stop-opacity=".18"/><stop offset="1" stop-color="#b07a50" stop-opacity="0"/></radialGradient>' % u, cy='.35')
    defs = (disc_defs(u, cx, cy, R, ('.44', '.4', [('0', '#fdfdfc'), ('.4', '#e9ece9'), ('.78', '#c9d0d3'), ('1', '#8a969c')]), ('.62', '.22', '.5')) +
            noise(u, 'n1', '.02', 5, 31) + noise(u, 'n2', '.12', 2, 32) + blur(u, 'b1', .9, 0) + blur(u, 'b3', 3, 0) + blur(u, 'b7', 7, 20) +
            shade_defs(u, .36, .34, (.1, .05, .95, .95), .62))
    P = lambda x, y: (cx + x * R, cy + y * R)
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
         '<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn1)" opacity=".28" style="mix-blend-mode: multiply"/>' % (cx - R, cy - R, 2 * R, 2 * R, u)]
    # mottled terrain: warm brown lowlands here and there
    mot = ''.join('<path d="%s" fill="#b98a66" opacity="%s"/>' % (blob(*P(rnd.uniform(-.8, .8), rnd.uniform(-.8, .8)), rnd.uniform(.05, .2) * R, rnd.uniform(.04, .14) * R, rnd, 12, .5), f(rnd.uniform(.12, .3))) for _ in range(40))
    b.append('<g filter="url(#%sb7)">%s</g>' % (u, mot))
    # chaos regions: two broken rafts of ice in brown matrix
    for x, y, rx, ry in [(.28, .18, .22, .16), (-.4, -.32, .16, .12)]:
        X, Y = P(x, y)
        b.append('<path d="%s" fill="#9c6a48" opacity=".55" filter="url(#%sb3)"/>' % (blob(X, Y, rx * R, ry * R, rnd, 16, .35), u))
        for _ in range(18):
            b.append('<path d="%s" fill="#e4e9ee" opacity=".6"/>' % blob(X + rnd.uniform(-rx, rx) * R * .8, Y + rnd.uniform(-ry, ry) * R * .8, rnd.uniform(3, 12), rnd.uniform(2, 8), rnd, 7, .4))
    # lineae: long double ridges, brown, some cycloidal (chains of arcs)
    lines = []
    for _ in range(70):
        x0, y0 = rnd.uniform(-1.1, 1.1), rnd.uniform(-1.1, 1.1)
        t = rnd.uniform(0, 2 * math.pi); L = rnd.uniform(.6, 2.4)
        x1, y1 = x0 + L * math.cos(t), y0 + L * math.sin(t)
        X0, Y0 = P(x0, y0); X1, Y1 = P(x1, y1)
        cxp, cyp = (X0 + X1) / 2 + rnd.uniform(-90, 90), (Y0 + Y1) / 2 + rnd.uniform(-90, 90)
        w = rnd.uniform(.6, 3.2); op = rnd.uniform(.25, .7)
        col = rnd.choice(['#8a5a3a', '#a8714c', '#6f4630'])
        lines.append('<path d="M%s %sQ%s %s %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (f(X0), f(Y0), f(cxp), f(cyp), f(X1), f(Y1), col, f(op), f(w)))
        lines.append('<path d="M%s %sQ%s %s %s %s" fill="none" stroke="#ffffff" stroke-opacity="%s" stroke-width="%s"/>' % (f(X0), f(Y0), f(cxp), f(cyp), f(X1), f(Y1), f(op * .5), f(w * .3)))
    for _ in range(4):
        # a cycloid: scallops of arcs, each cusp turning a little
        x, y = P(rnd.uniform(-.6, .6), rnd.uniform(-.6, .6)); t = rnd.uniform(0, 2 * math.pi); d = ['M%s %s' % (f(x), f(y))]
        for _ in range(7):
            a = rnd.uniform(26, 40); x2, y2 = x + a * math.cos(t), y + a * math.sin(t)
            d.append('A%s %s 0 0 1 %s %s' % (f(a * .7), f(a * .7), f(x2), f(y2))); x, y, t = x2, y2, t + rnd.uniform(-.25, .25)
        lines.append('<path d="%s" fill="none" stroke="#7a4e34" stroke-opacity=".7" stroke-width="2.2"/>' % ''.join(d))
    b.append('<g filter="url(#%sb1)">%s</g>' % (u, ''.join(lines)))
    b.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn2)" opacity=".16" style="mix-blend-mode: overlay"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    # a few small bright impact craters, Pwyll with its ray halo
    px, py = P(-.2, .5)
    b.append('<circle cx="%s" cy="%s" r="46" fill="#ffffff" opacity=".28" filter="url(#%sb7)"/><circle cx="%s" cy="%s" r="5" fill="#8a5a3a" opacity=".8"/><circle cx="%s" cy="%s" r="5.6" fill="none" stroke="#fff" stroke-width="1"/>' % (f(px), f(py), u, f(px), f(py), f(px), f(py)))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimb)"/><circle cx="%d" cy="%d" r="%d" fill="url(#%sterm)"/>' % (cx, cy, R, u, cx, cy, R, u))
    obj = svg(W, H, '<g clip-path="url(#%sdisk)">%s</g><circle cx="%d" cy="%d" r="%s" fill="none" stroke="#f4f8ff" stroke-opacity=".3" stroke-width="1"/>' % (u, ''.join(b), cx, cy, f(R - .5)) + grain(u + 'o', W, H, .1), defs)
    ann = [reticle(cx, cy, R + 18, 72, 4, .16), label((px, py), (560, 610), ['PWYLL', '26 KM · RAYED'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= HUNTER'S MOON
def hunters(u):
    """A huge harvest-orange full moon just up, flattened by the air, over a black treeline; the halo of a warm October night."""
    cx, cy, R = 291, 312, 192
    rnd = random.Random(1026)
    bg = sky(u, H, ('#2a1a2e', '#0f0a18', '#040309'), 150, 26, 2, extra=
             '<rect width="%d" height="%d" fill="url(#%sdusk)"/><ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="url(#%shalo)"/>' % (W, H, u, cx, cy + 10, R + 130, R + 110, u),
             extra_defs=('<linearGradient id="%sdusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a2e" stop-opacity="0"/><stop offset=".55" stop-color="#5a2a22" stop-opacity=".4"/><stop offset=".72" stop-color="#7a3a22" stop-opacity=".55"/><stop offset="1" stop-color="#1a0c0a"/></linearGradient>'
                         '<radialGradient id="%shalo" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#ff9a4a" stop-opacity=".28"/><stop offset=".8" stop-color="#ff8a3a" stop-opacity=".1"/><stop offset="1" stop-color="#ff8a3a" stop-opacity="0"/></radialGradient>') % (u, u), cy='.4')
    mdefs, body = full_moon(u, cx, cy, R, rnd, ('.5', '.44', [('0', '#ffd08a'), ('.5', '#f39a48'), ('.85', '#d46a2a'), ('1', '#8a3a14')]),
                            mare='#7a3418', mare_op=.7, ray_col='#ffe2b0', ray_op=.12, crater_tint=('#5a2210', '#ffcf98', '#ffe6c2'))
    defs = mdefs + blur(u, 'b12', 12, 30) + noise(u, 'tn', '.5', 2, 3) + '<linearGradient id="%sext" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a2a10" stop-opacity="0"/><stop offset="1" stop-color="#5a1a08" stop-opacity=".6"/></linearGradient>' % u
    o = ['<circle cx="%d" cy="%d" r="%d" fill="#ff9a48" opacity=".35" filter="url(#%sb12)"/>' % (cx, cy, R + 14, u),
         # the air squashes the disc a little at the horizon
         '<g transform="translate(%d %d) scale(1 .965) translate(%d %d)"><g clip-path="url(#%sdisk)">%s<circle cx="%d" cy="%d" r="%d" fill="url(#%sext)"/></g></g>' % (cx, cy, -cx, -cy, u, body, cx, cy, R, u)]
    # thin cloud crossing the lower disc
    cl = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#3a1a12" opacity="%s"/>' % (f(rnd.uniform(60, 520)), f(cy + rnd.uniform(90, 170)), f(rnd.uniform(120, 260)), f(rnd.uniform(2, 5)), f(rnd.uniform(.2, .4))) for _ in range(6))
    o.append('<g filter="url(#%sb12)">%s</g>' % (u, cl))
    # the treeline: firs and bare trees on a low ridge, black against the moon
    ty = 545
    # firs: each a stack of ragged tiers, farther ones smaller and a touch lighter
    firs = []
    for layer, (col, scale, n) in enumerate([('#1c0e10', .55, 40), ('#120809', .8, 30), ('#0a0507', 1.1, 22)]):
        for _ in range(n):
            bx = rnd.uniform(-20, W + 20); h = rnd.uniform(40, 120) * scale; base = ty + 14 - layer * 10 + rnd.uniform(-6, 6)
            tiers = int(3 + h / 22)
            for k in range(tiers):
                yk = base - h * k / tiers; wk = (h * .34) * (1 - k / (tiers + 1)) * rnd.uniform(.85, 1.15)
                firs.append('<path d="M%s %sL%s %sL%s %sZ" fill="%s"/>' % (f(bx - wk), f(yk), f(bx), f(yk - h / tiers * 1.7), f(bx + wk), f(yk), col))
            firs.append('<rect x="%s" y="%s" width="2" height="%s" fill="%s"/>' % (f(bx - 1), f(base - 4), 24, col))
    o.append(''.join(firs))
    o.append('<path d="M-10 %dQ150 %d 300 %dT600 %dL600 %dL-10 %dZ" fill="#0a0507"/>' % (ty + 18, ty + 6, ty + 16, ty + 10, H + 10, H + 10))
    o.append('<rect y="%d" width="%d" height="%d" filter="url(#%stn)" opacity=".05" style="mix-blend-mode: screen"/>' % (ty - 80, W, 130, u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .11), defs)
    ann = [label((cx + R * .66, cy - R * .3), (560, 140), ['MARE CRISIUM'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= CHRISTMAS EVE SUPERMOON
def supermoon(u):
    """The year's closest full moon on a snow night: very large, very bright, a 22° ice halo round it and snow in the air."""
    cx, cy, R = 291, 300, 176
    rnd = random.Random(1224)
    bg = sky(u, H, ('#1a2450', '#0b1230', '#04071a'), 220, 24, 4, extra=
             '<circle cx="%d" cy="%d" r="%d" fill="url(#%sglow)"/>' % (cx, cy, R + 120, u),
             extra_defs='<radialGradient id="%sglow" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#dfe9ff" stop-opacity=".3"/><stop offset="1" stop-color="#dfe9ff" stop-opacity="0"/></radialGradient>' % u, cy='.36')
    mdefs, body = full_moon(u, cx, cy, R, rnd, ('.5', '.44', [('0', '#ffffff'), ('.5', '#e8ebf0'), ('.85', '#bfc6d2'), ('1', '#828b9a')]), mare='#5c6478', ray_op=.2)
    defs = mdefs + blur(u, 'b3', 3, 10) + blur(u, 'b10', 10, 30) + blur(u, 'b20', 20, 40) + noise(u, 'cn', '.008 .03', 3, 6) + (
            '<radialGradient id="%sring" cx=".5" cy=".5" r=".5"><stop offset=".9" stop-color="#fff" stop-opacity="0"/><stop offset=".95" stop-color="#ffd6c8" stop-opacity=".22"/><stop offset=".97" stop-color="#e6f0ff" stop-opacity=".3"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%sinner" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#0b1230" stop-opacity=".0"/><stop offset=".85" stop-color="#0b1230" stop-opacity=".25"/><stop offset="1" stop-color="#0b1230" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="%ssnow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0ff" stop-opacity="0"/><stop offset="1" stop-color="#e6efff" stop-opacity=".55"/></linearGradient>') % (u, u, u)
    Rh = 392
    o = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sinner)"/>' % (cx, cy, Rh, u),
         '<circle cx="%d" cy="%d" r="%d" fill="url(#%sring)"/>' % (cx, cy, Rh, u),
         '<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#ffe8dc" stroke-opacity=".35" stroke-width="3" filter="url(#%sb3)"/>' % (cx, cy, Rh - 10, u),
         '<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#d6e8ff" stroke-opacity=".25" stroke-width="5" filter="url(#%sb10)"/>' % (cx, cy, Rh - 4, u)]
    # thin cirrus that makes the halo
    cir = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#dfe9ff" opacity="%s" transform="rotate(%s %s %s)"/>' % (
        f(rnd.uniform(-40, 620)), f(rnd.uniform(0, 640)), f(rnd.uniform(80, 240)), f(rnd.uniform(5, 18)), f(rnd.uniform(.05, .14)), f(rnd.uniform(-20, 12)), f(291), f(300)) for _ in range(22))
    o.append('<g filter="url(#%sb20)">%s</g>' % (u, cir))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="#fff" opacity=".5" filter="url(#%sb20)"/>' % (cx, cy, R + 8, u))
    o.append('<g clip-path="url(#%sdisk)">%s</g><circle cx="%d" cy="%d" r="%s" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>' % (u, body, cx, cy, f(R - .5)))
    # two mock-moon brightenings on the halo, left and right
    for sx in (cx - Rh + 6, cx + Rh - 6):
        o.append('<ellipse cx="%s" cy="%d" rx="14" ry="40" fill="#fff0e6" opacity=".22" filter="url(#%sb10)"/>' % (f(sx), cy, u))
    # snow, near flakes large and soft, far flakes fine
    sn = []
    for _ in range(160):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H); r = rnd.uniform(.5, 1.6)
        sn.append('<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity="%s"/>' % (f(x), f(y), f(r), f(rnd.uniform(.3, .8))))
    near = ''.join('<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity="%s"/>' % (f(rnd.uniform(0, W)), f(rnd.uniform(0, H)), f(rnd.uniform(2.5, 6)), f(rnd.uniform(.15, .4))) for _ in range(28))
    o.append(''.join(sn) + '<g filter="url(#%sb3)">%s</g>' % (u, near))
    # snowfield below, moonlit, with a fence line of shadows
    o.append('<path d="M-10 640Q150 610 300 636T600 626L600 %dL-10 %dZ" fill="#0e1636"/>' % (H + 10, H + 10))
    o.append('<path d="M-10 640Q150 610 300 636T600 626L600 %dL-10 %dZ" fill="url(#%ssnow)" opacity=".5"/>' % (H + 10, H + 10, u))
    o.append('<path d="M-10 640Q150 610 300 636T600 626" fill="none" stroke="#f4f8ff" stroke-opacity=".7" stroke-width="1.5" filter="url(#%sb3)"/>' % u)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [label((cx + Rh - 10, cy - 60), (560, 170), ['22° HALO', 'ICE IN THE CIRRUS'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= SNOW MOON ECLIPSE
def snowmoon(u):
    """The Snow Moon inside Earth's penumbra: one limb dusky and brown where the shadow lies, the rest cold and bright; the umbra's edge just off the disc."""
    cx, cy, R = 291, 306, 182
    rnd = random.Random(220)
    # the shadow cone: centred up and to the left, its umbra just missing the disc
    ux, uy, Ru = cx - 330, cy - 250, 290
    bg = sky(u, H, ('#121a3a', '#080c22', '#03040d'), 260, 20, 5, extra=
             '<circle cx="%d" cy="%d" r="%d" fill="url(#%spen)"/>' % (ux, uy, Ru * 2.1, u),
             extra_defs='<radialGradient id="%spen" cx=".5" cy=".5" r=".5"><stop offset=".42" stop-color="#000" stop-opacity=".55"/><stop offset=".6" stop-color="#1a0a06" stop-opacity=".28"/><stop offset="1" stop-color="#1a0a06" stop-opacity="0"/></radialGradient>' % u, cy='.4')
    mdefs, body = full_moon(u, cx, cy, R, rnd, ('.6', '.6', [('0', '#f6f4ee'), ('.5', '#d6d4cc'), ('.85', '#a9a69e'), ('1', '#6e6c66')]), mare='#5f6470', ray_op=.16)
    defs = mdefs + blur(u, 'b14', 14, 30) + blur(u, 'b4', 4, 10) + (
            '<radialGradient id="%sshade" cx="%s" cy="%s" r="%s" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#3a1408" stop-opacity=".92"/><stop offset=".72" stop-color="#6e2e12" stop-opacity=".6"/><stop offset=".86" stop-color="#8a5a3a" stop-opacity=".3"/><stop offset="1" stop-color="#8a5a3a" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%scold" cx=".5" cy=".5" r=".5"><stop offset=".6" stop-color="#bcd0ff" stop-opacity=".2"/><stop offset="1" stop-color="#bcd0ff" stop-opacity="0"/></radialGradient>') % (u, f(ux), f(uy), f(Ru * 2.1), u)
    o = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%scold)"/>' % (cx, cy, R + 110, u),
         '<g clip-path="url(#%sdisk)">%s<circle cx="%d" cy="%d" r="%d" fill="url(#%sshade)"/></g>' % (u, body, ux, uy, int(Ru * 2.1), u),
         '<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#e8eeff" stroke-opacity=".3" stroke-width="1"/>' % (cx, cy, f(R - .5))]
    # a soft rim of the umbra drawn in the dark beside the disc, so the shadow reads as a body
    # snow drifting, sparse
    o.append(''.join('<circle cx="%s" cy="%s" r="%s" fill="#dfe8ff" opacity="%s"/>' % (f(rnd.uniform(0, W)), f(rnd.uniform(0, H)), f(rnd.uniform(.5, 2)), f(rnd.uniform(.15, .5))) for _ in range(70)))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [reticle(cx, cy, R + 18, 72, 4, .14), label((cx - R * .82, cy - R * .5), (22, 150), ['PENUMBRA', 'THE EARTH, EDGE ON'])]
    return bg, obj, svg(W, H, ''.join(ann))


PLATES = {
    'TYCHO': tycho, 'OLYMPUS-MONS': olympus, 'EUROPA': europa,
    'HUNTERS-MOON': hunters, 'CHRISTMAS-SUPERMOON': supermoon, 'SNOW-MOON-ECLIPSE': snowmoon,
}

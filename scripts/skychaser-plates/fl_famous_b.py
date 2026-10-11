"""First Light, famous skies and impacts: eight full-art plates at 582 × 832.

Two strikes from space on Earth, a comet thrown into Jupiter, Saturn's hazy moon,
and four star patterns plotted from real J2000 positions. Same stack as every
plate: sky, object with grain, survey.
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL, label, scalebar, reticle
from more import top, W, HF
from fl_stars import (blur, rg, lg, noise, cloud, warp, spike_grad, spikes, glow, halo_grad, core_grad, core, pinstar, field, base, plate_sky,
                      milky_way, conifer, dust_stars)

H = HF


def poly(pts):
    return 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in pts) + 'Z'


def smooth(pts):
    """A closed curve through the midpoints of pts."""
    mids = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in zip(pts, pts[1:] + pts[:1])]
    return 'M%s %s' % (f(mids[-1][0]), f(mids[-1][1])) + ''.join('Q%s %s %s %s' % (f(p[0]), f(p[1]), f(m[0]), f(m[1])) for p, m in zip(pts, mids)) + 'Z'


# ----------------------------------------------------------------- the sky as charted
def hms(h, m, s):
    return h + m / 60 + s / 3600


def dms(d, m, s):
    return d + m / 60 + s / 3600


def chart(stars, ra0, de0, cx, cy, scale, rot=0):
    """Gnomonic projection about (ra0, de0), north up, east left; scale in px per degree. Returns {name: (x, y, mag, col)}."""
    a0, d0 = math.radians(ra0 * 15), math.radians(de0)
    cr, sr = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    out = {}
    for n, ra, de, mag, col in stars:
        a, d = math.radians(ra * 15), math.radians(de)
        D = math.sin(d0) * math.sin(d) + math.cos(d0) * math.cos(d) * math.cos(a - a0)
        x = math.cos(d) * math.sin(a - a0) / D
        y = (math.cos(d0) * math.sin(d) - math.sin(d0) * math.cos(d) * math.cos(a - a0)) / D
        X, Y = -math.degrees(x) * scale, -math.degrees(y) * scale
        out[n] = (cx + X * cr - Y * sr, cy + X * sr + Y * cr, mag, col)
    return out


def star_defs(u, cols):
    return ''.join(halo_grad(u, 'h' + k, c, k=.9) + spike_grad(u, k, c, .18) + core_grad(u, 'c' + k, c) for k, c in cols.items())


def bright(u, x, y, mag, k, big=1.0):
    """A named star: bloom, soft and crisp spikes, a burnt-out core, all sized by magnitude."""
    s = max(.35, (3.6 - mag)) * big
    r = 2.2 + 2.1 * s
    out = glow(x, y, r * 11, u + 'h' + k, .9)
    if s > 1.2:
        out += spikes(u, k, x, y, r * 15, r * .5, op=.25, filt='b3')
    out += spikes(u, k, x, y, r * 13, max(.6, r * .16), op=.85) + spikes(u, k, x, y, r * 4.5, .5, (45, 135), .3)
    return out + core(u, x, y, r * 1.6, 'c' + k)


def figure(pos, segs, gap, col='#f4e8cc', op=.42, w=.8):
    """Thin constellation lines that stop short of each star."""
    out = []
    for a, b in segs:
        (x0, y0, m0, _), (x1, y1, m1, _) = pos[a], pos[b]
        L = math.hypot(x1 - x0, y1 - y0)
        g0, g1 = gap(m0), gap(m1)
        if L <= g0 + g1: continue
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        out.append('<path d="M%s %sL%s %s"/>' % (f(x0 + ux * g0), f(y0 + uy * g0), f(x1 - ux * g1), f(y1 - uy * g1)))
    return '<g stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round" fill="none">%s</g>' % (col, f(op), f(w), ''.join(out))


def faint_field(u, rnd, n, box, tints=('#ffffff', '#fff1dc', '#dfe8ff', '#e8ecff')):
    """Background stars with a few small blooms, a step up from dots."""
    out = [field(rnd, n, box, list(tints), .25, 1.2, 4, (.18, .8))]
    x0, y0, x1, y1 = box
    for _ in range(n // 14):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        out.append(pinstar(x, y, rnd.uniform(.7, 1.4), rnd.choice(tints), rnd.uniform(.5, .9)))
    return ''.join(out)


def calm(u, y0=560, op=.55):
    """Darkens the strip under the card title."""
    return '<rect y="%d" width="%d" height="%d" fill="url(#%scalm)" opacity="%s"/>' % (y0 - 60, W, H - y0 + 60, u, f(op)), lg(u, 'calm', [(0, '#020204', 0), (.4, '#020204', .6), (1, '#020204', 1)])


# ================================================================= CHICXULUB
def sauropod(x, y, s, flip=False):
    """A long-necked sauropod in silhouette, facing right (or left)."""
    k = -1 if flip else 1
    p = lambda a, b: '%s %s' % (f(x + k * a * s), f(y + b * s))
    body = ('M' + p(-30, -10) + 'Q' + p(-20, -21) + ' ' + p(-2, -20) + 'Q' + p(8, -19) + ' ' + p(13, -16) +
            'Q' + p(22, -24) + ' ' + p(26, -40) + 'Q' + p(29, -50) + ' ' + p(35, -50) + 'Q' + p(38, -49) + ' ' + p(37, -47) +
            'Q' + p(31, -47) + ' ' + p(29, -40) + 'Q' + p(26, -22) + ' ' + p(14, -10) +
            'L' + p(12, 0) + 'L' + p(8, 0) + 'L' + p(7, -6) + 'L' + p(3, -6) + 'L' + p(2, 0) + 'L' + p(-2, 0) + 'L' + p(-3, -6) +
            'L' + p(-12, -6) + 'L' + p(-13, 0) + 'L' + p(-17, 0) + 'L' + p(-18, -7) + 'L' + p(-22, -7) + 'L' + p(-23, 0) + 'L' + p(-27, 0) + 'L' + p(-27, -8) +
            'Q' + p(-42, -6) + ' ' + p(-58, -1) + 'Q' + p(-44, -9) + ' ' + p(-30, -10) + 'Z')
    return body


def cycad(rnd, x, y, h):
    """A tree fern: a thin trunk and a burst of drooping fronds."""
    tx, ty = x + rnd.uniform(-4, 4), y - h
    out = ['<path d="M%s %sQ%s %s %s %s" stroke-width="%s" fill="none"/>' % (f(x), f(y), f(x + rnd.uniform(-3, 3)), f(y - h * .5), f(tx), f(ty), f(1 + h * .03))]
    for i in range(9):
        a = math.radians(-180 + i * 22.5 + rnd.uniform(-8, 8)); L = h * rnd.uniform(.35, .55)
        ex, ey = tx + L * math.cos(a), ty + L * math.sin(a) * .6 + L * .35
        out.append('<path d="M%s %sQ%s %s %s %s" stroke-width="%s" fill="none"/>' % (f(tx), f(ty), f(tx + L * .6 * math.cos(a)), f(ty - L * .35), f(ex), f(ey), f(.8 + h * .015)))
    return ''.join(out)


def chicxulub(u):
    """Sixty-six million years ago: a mountain-sized rock blazing down through the air over a shallow tropical sea, the sky lit orange, sauropods on the shore."""
    rnd = random.Random(66)
    hz = 474
    hx, hy = 336, 286                       # the bolide's head
    ang = math.radians(-156)                 # the way back up its trail
    ux, uy = math.cos(ang), math.sin(ang)
    nx, ny = -uy, ux
    sd = (lg(u, 'sk', [(0, '#0c0712', 1), (.25, '#24101c', 1), (.45, '#521c1e', 1), (.6, '#8a3420', 1), (.72, '#bc5626', 1), (.82, '#e08236', 1), (.91, '#f8a04a', 1), (1, '#ffc87a', 1)], 0, 0, 0, 1) +
          rg(u, 'sg', [(0, '#ffc070', .55), (.3, '#ff8a3a', .22), (.7, '#c84a1e', .06), (1, '#c84a1e', 0)]) +
          cloud(u, 'cl', '.006 .03', 4, 61, 50, 8, 2.6, -.9) + blur(u, 'b2', 2))
    stars = field(rnd, 120, (0, 0, W, 300), ['#ffffff', '#fff1dc', '#ffe0c0'], .3, 1.1, 4, (.1, .6))
    clouds = []
    for _ in range(26):
        x, y = rnd.uniform(-80, 660), rnd.uniform(330, hz - 10)
        k = (y - 330) / 140
        clouds.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s"/>' % (
            f(x), f(y), f(rnd.uniform(60, 170)), f(rnd.uniform(4, 12)), rnd.choice(['#5a2028', '#7a2e26', '#3e1a24']), f(rnd.uniform(.35, .75) * (1 - .4 * k))))
    lit = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#ffc27a" opacity="%s"/>' % (
        f(x), f(y + 4), f(rnd.uniform(40, 110)), f(rnd.uniform(1.5, 3.5)), f(rnd.uniform(.25, .55) * max(0, 1 - abs(x - hx) / 330)))
        for x, y in ((rnd.uniform(0, W), rnd.uniform(336, hz - 12)) for _ in range(22)))
    bg = svg(W, H, '<rect width="%d" height="%d" fill="url(#%ssk)"/>' % (W, hz, u) + stars + glow(hx, hy + 60, 520, u + 'sg') +
             '<g filter="url(#%scl)">%s</g><g filter="url(#%sb2)">%s</g>' % (u, ''.join(clouds), u, lit), sd)

    defs = [rg(u, 'hg', [(0, '#ffffff', 1), (.05, '#fff6d8', .95), (.12, '#ffd27a', .7), (.25, '#ff9a3a', .32), (.5, '#e8602a', .1), (1, '#c8401a', 0)]),
            rg(u, 'bow', [(0, '#ffffff', 1), (.45, '#fff2c0', .9), (.7, '#ffb04a', .5), (1, '#ff7a2a', 0)]),
            lg(u, 'tr', [(0, '#fff8e0', 1), (.06, '#ffd88a', .9), (.2, '#ff9a40', .6), (.45, '#d8502a', .3), (.75, '#8a2a20', .12), (1, '#5a1a1a', 0)],
               hx, hy, hx + ux * 640, hy + uy * 640, ' gradientUnits="userSpaceOnUse"'),
            lg(u, 'sm', [(0, '#5a3a30', 0), (.15, '#5a3a32', .55), (.6, '#3a2830', .4), (1, '#2a1e28', 0)], hx, hy, hx + ux * 640, hy + uy * 640, ' gradientUnits="userSpaceOnUse"'),
            rg(u, 'rock', [(0, '#fffbe8', 1), (.25, '#ffd070', 1), (.5, '#e86a2a', 1), (.75, '#8a2a14', 1), (1, '#3a140c', 1)], '.75', '.8', '.9'),
            blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b6', 6) + blur(u, 'b14', 14) + blur(u, 'b30', 30, 60),
            warp(u, 'tw', '.012 .04', 3, 9, 40, 2) + warp(u, 'rw', '.08', 2, 4, 6),
            noise(u, 'rn', '.09', 4, 12, (2.4, -.8), (.06, .02, .01)),
            lg(u, 'sea', [(0, '#ffb060', 1), (.04, '#c86a3a', 1), (.2, '#5a2a2a', 1), (.5, '#20141e', 1), (1, '#07060a', 1)], 0, 0, 0, 1),
            lg(u, 'land', [(0, '#1a0e10', 1), (1, '#080507', 1)], 0, 0, 0, 1)]
    o = []
    # the trail: a broad glowing wake, a hot inner core, smoke rolling off its edges
    def wake(L, w0, w1):
        pts = []
        for i in range(21):
            t = i / 20; w = w0 + (w1 - w0) * t ** .8
            pts.append((hx + ux * L * t + nx * w, hy + uy * L * t + ny * w))
        for i in range(20, -1, -1):
            t = i / 20; w = w0 + (w1 - w0) * t ** .8
            pts.append((hx + ux * L * t - nx * w, hy + uy * L * t - ny * w))
        return poly(pts)
    o.append(glow(hx, hy, 520, u + 'hg', .7))
    sm = []
    for _ in range(60):
        t = rnd.uniform(.05, 1.1); side = rnd.choice((-1, 1)); w = (14 + 70 * t) * rnd.uniform(.5, 1.3)
        x, y = hx + ux * 640 * t + nx * side * w, hy + uy * 640 * t + ny * side * w
        sm.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(x), f(y), f(rnd.uniform(30, 90)), f(rnd.uniform(8, 26) * (.5 + t)), rnd.choice(['#4a2e2c', '#3a2630', '#6a3a2c', '#2a1c24']), f(rnd.uniform(.3, .6)), f(math.degrees(ang)), f(x), f(y)))
    o.append('<g filter="url(#%stw)">%s</g>' % (u, ''.join(sm)))
    o.append('<path d="%s" fill="url(#%str)" opacity=".6" filter="url(#%sb30)"/>' % (wake(700, 60, 170), u, u))
    o.append('<path d="%s" fill="url(#%str)" opacity=".9" filter="url(#%sb14)"/>' % (wake(640, 38, 96), u, u))
    o.append('<path d="%s" fill="url(#%str)" filter="url(#%sb3)"/>' % (wake(460, 22, 38), u, u))
    o.append('<path d="%s" fill="#fffbe8" opacity=".95" filter="url(#%sb3)"/>' % (wake(170, 18, 5), u))
    # streamers of plasma and ablating rock along the wake
    st = []
    for _ in range(46):
        t0 = rnd.uniform(0, .5); L = rnd.uniform(.08, .4); off = rnd.gauss(0, 18 + 40 * t0)
        x0, y0 = hx + ux * 640 * t0 + nx * off, hy + uy * 640 * t0 + ny * off
        x1, y1 = x0 + ux * 640 * L + nx * off * .4, y0 + uy * 640 * L + ny * off * .4
        st.append('<path d="M%s %sL%s %s" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
            f(x0), f(y0), f(x1), f(y1), rnd.choice(['#fff0c0', '#ffc070', '#ff9a50']), f(rnd.uniform(.15, .5)), f(rnd.uniform(.8, 3))))
    o.append('<g filter="url(#%sb1)" stroke-linecap="round">%s</g>' % (u, ''.join(st)))
    # fragments shed along the wake, each with its own tiny trail
    for _ in range(14):
        t = rnd.uniform(.08, .55); off = rnd.gauss(0, 30)
        x, y = hx + ux * 640 * t + nx * off, hy + uy * 640 * t + ny * off
        L = rnd.uniform(14, 40)
        o.append('<path d="M%s %sL%s %s" stroke="#ffb860" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round" filter="url(#%sb1)"/><circle cx="%s" cy="%s" r="%s" fill="#fff4d0"/>' % (
            f(x), f(y), f(x + ux * L), f(y + uy * L), u, f(x), f(y), f(rnd.uniform(.8, 1.8))))
    # the rock itself, mostly hidden in its own fire: a dark lumpy body, a white-hot bow ahead of it
    o.append('<circle cx="%s" cy="%s" r="110" fill="#ffd890" opacity=".55" filter="url(#%sb14)"/>' % (f(hx - ux * 8), f(hy - uy * 8), u))
    o.append('<ellipse cx="%s" cy="%s" rx="70" ry="60" fill="url(#%sbow)" transform="rotate(%s %s %s)" filter="url(#%sb6)" opacity=".85"/>' % (
        f(hx - ux * 6), f(hy - uy * 6), u, f(math.degrees(ang)), f(hx - ux * 6), f(hy - uy * 6), u))
    rock = blob(hx + ux * 6, hy + uy * 6, 34, 28, rnd, 14, .2)
    rx0, ry0 = hx + ux * 40, hy + uy * 40
    rx1, ry1 = hx - ux * 30, hy - uy * 30
    defs.append('<clipPath id="%src"><path d="%s"/></clipPath>' % (u, rock) +
                lg(u, 'hot', [(0, '#ffb060', 0), (.35, '#ff7a30', .25), (.6, '#ffb050', .75), (.8, '#fff0b0', .95), (1, '#ffffff', 1)], rx0, ry0, rx1, ry1, ' gradientUnits="userSpaceOnUse"'))
    cr_ = ''.join('<circle cx="%s" cy="%s" r="%s" fill="none" stroke="#1a0804" stroke-opacity=".5" stroke-width="1.2"/>' % (
        f(hx + rnd.uniform(-22, 22)), f(hy + rnd.uniform(-18, 18)), f(rnd.uniform(2, 6))) for _ in range(9))
    cracks = ''.join('<path d="M%s %sl%s %sl%s %s" fill="none" stroke="#ff9a3a" stroke-opacity=".45" stroke-width=".8"/>' % (
        f(hx + rnd.uniform(-20, 10)), f(hy + rnd.uniform(-16, 10)), f(rnd.uniform(-8, 8)), f(rnd.uniform(-8, 8)), f(rnd.uniform(-8, 8)), f(rnd.uniform(-8, 8))) for _ in range(10))
    o.append('<g filter="url(#%srw)"><g clip-path="url(#%src)"><path d="%s" fill="#3a1e14"/><rect x="%s" y="%s" width="90" height="90" filter="url(#%srn)" opacity=".6"/>%s%s'
             '<path d="%s" fill="url(#%shot)"/></g></g>' % (u, u, rock, f(hx - 45), f(hy - 45), u, cr_, cracks, rock, u))
    # the shock front: a white-hot crescent hugging the leading face
    a0 = math.degrees(ang) + 180
    arc = lambda r, da: 'M%s %sA%s %s 0 0 1 %s %s' % (f(hx + r * math.cos(math.radians(a0 - da))), f(hy + r * math.sin(math.radians(a0 - da))), f(r), f(r),
                                                       f(hx + r * math.cos(math.radians(a0 + da))), f(hy + r * math.sin(math.radians(a0 + da))))
    o.append('<path d="%s" fill="none" stroke="#fff4c8" stroke-width="22" stroke-linecap="round" opacity=".7" filter="url(#%sb6)"/>' % (arc(36, 80), u))
    o.append('<path d="%s" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity=".9" filter="url(#%sb3)"/>' % (arc(31, 70), u))
    o.append('<path d="%s" fill="none" stroke="#ffd070" stroke-width="3" stroke-linecap="round" opacity=".7" filter="url(#%sb1)"/>' % (arc(44, 95), u))
    # the sea: lit from the sky, a long glitter path under the fireball
    o.append('<rect y="%d" width="%d" height="%d" fill="url(#%ssea)"/>' % (hz, W, H - hz, u))
    gl = []
    for i in range(170):
        y = hz + 2 + (H - hz) * rnd.random() ** 1.8; k = (y - hz) / (H - hz)
        x = hx - 30 + rnd.gauss(0, 18 + 70 * k)
        gl.append('<path d="M%s %sh%s" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
            f(x), f(y), f(rnd.uniform(4, 22) * (1 + 2 * k)), rnd.choice(['#ffe0a0', '#ffb860', '#ff9a50']), f(rnd.uniform(.3, .9) * (1 - .8 * k)), f(.6 + 1.6 * k)))
    for i in range(70):
        y = hz + 2 + (H - hz) * rnd.random() ** 1.5; k = (y - hz) / (H - hz)
        gl.append('<path d="M%s %sh%s" stroke="#ff9a5a" stroke-opacity="%s" stroke-width=".8"/>' % (f(rnd.uniform(0, W)), f(y), f(rnd.uniform(10, 40)), f(.16 * (1 - k))))
    o.append(''.join(gl))
    # the shore: a low Yucatán coast, tree ferns and cycads, three sauropods wading at the edge
    land = [(-10, hz + 2), (-10, hz - 30), (30, hz - 34), (70, hz - 27), (110, hz - 21), (150, hz - 15), (190, hz - 9), (230, hz - 4), (272, hz + 1), (250, hz + 8), (120, hz + 14), (-10, hz + 16)]
    o.append('<path d="%s" fill="url(#%sland)"/>' % (smooth(land), u))
    o.append('<path d="M-10 %sQ120 %s 262 %s" fill="none" stroke="#ffb870" stroke-opacity=".35" stroke-width="1.2"/>' % (f(hz + 5), f(hz + 3), f(hz + 3)))
    ferns = ''.join(cycad(rnd, x, hz - 26 + (x / 230) * 22 + rnd.uniform(-2, 2), rnd.uniform(16, 40)) for x in [6, 18, 34, 52, 64, 86, 100, 116, 160, 176])
    o.append('<g stroke="#100809">%s</g>' % ferns)
    dino = [(138, hz - 14, .5, False), (206, hz - 2, .74, False), (250, hz + 6, .46, True)]
    o.append('<g fill="#0d0708">%s</g>' % ''.join('<path d="%s"/>' % sauropod(x, y, s, fl) for x, y, s, fl in dino))
    o.append('<g fill="none" stroke="#ffc080" stroke-opacity=".3" stroke-width=".7">%s</g>' % ''.join(
        '<path d="M%s %sh%s"/>' % (f(x - 18 * s), f(y + 2), f(36 * s)) for x, y, s, fl in dino))
    # the haze of the horizon, and a cooler, calmer strip under the title
    o.append('<rect y="%d" width="%d" height="10" fill="#ffd090" opacity=".35" filter="url(#%sb3)"/>' % (hz - 6, W, u))
    cr, cd = calm(u, 600, .65)
    o.append(cr); defs.append(cd)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .12), ''.join(defs))
    ann = [top('21.4°N 89.5°W · YUCATÁN · 66.04 MILLION YEARS AGO'),
           label((hx, hy), (560, 236), ['IMPACTOR', '~10 KM · 20 KM/S'], 'end'),
           label((206, hz - 30), (22, 420), ['SAUROPODS', 'LATE MAASTRICHTIAN']),
           label((420, 600), (560, 620), ['CRATER SITE', '180 KM ACROSS'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= TUNGUSKA
def tunguska(u):
    """30 June 1908, 07:17 local: a stony body bursts eight kilometres above the Podkamennaya Tunguska, and the taiga below lies flattened outward in a great radial fan."""
    rnd = random.Random(1908)
    fx, fy = 296, 282                 # the burst
    ex, ey = 296, 466                 # the ground below it, seen from high up
    hz = 372
    sd = (lg(u, 'sk', [(0, '#060c1a', 1), (.22, '#0e1a32', 1), (.36, '#2a3048', 1), (.42, '#6a5a60', 1), (.45, '#b08a70', 1), (.5, '#d8a878', 1)], 0, 0, 0, 1) +
          rg(u, 'fl', [(0, '#fff8e8', .8), (.06, '#ffe8c0', .55), (.16, '#ffc890', .24), (.35, '#d8a080', .07), (1, '#8a7080', 0)]))
    bg = svg(W, H, '<rect width="%d" height="%d" fill="url(#%ssk)"/>' % (W, H, u) + field(rnd, 160, (0, 0, W, 360), ['#ffffff', '#dfe8ff', '#fff1dc'], .3, 1.1, 4, (.1, .55)) +
             glow(fx, fy, 640, u + 'fl'), sd)

    defs = [rg(u, 'core', [(0, '#ffffff', 1), (.15, '#ffffff', 1), (.3, '#fffbe8', .9), (.55, '#ffe0a8', .45), (.8, '#ffb070', .12), (1, '#ff9050', 0)]),
            rg(u, 'bloom', [(0, '#fff8e0', .9), (.1, '#ffe8b8', .55), (.25, '#ffc888', .25), (.5, '#e89a6a', .08), (1, '#c87a5a', 0)]),
            rg(u, 'shock', [(.8, '#ffe8c8', 0), (.95, '#fff4e0', .5), (1, '#fff4e0', 0)]),
            lg(u, 'trail', [(0, '#fff4d8', 0), (.6, '#ffd8a0', .35), (1, '#fff8e8', .95)], 0, 0, 1, 0),
            lg(u, 'gnd', [(0, '#3a2a24', 1), (.1, '#22201e', 1), (.4, '#121410', 1), (1, '#050604', 1)], 0, 0, 0, 1),
            rg(u, 'glow', [(0, '#ffd8a0', .6), (.3, '#e8a070', .25), (.7, '#a06048', .06), (1, '#a06048', 0)], f(ex), f(ey), '360', ' gradientUnits="userSpaceOnUse" gradientTransform="translate(0 %s) scale(1 .5) translate(0 %s)"' % (f(ey), f(-ey))),
            blur(u, 'b1', 1) + blur(u, 'b2', 2) + blur(u, 'b4', 4) + blur(u, 'b10', 10) + blur(u, 'b24', 24, 60),
            cloud(u, 'sm', '.012', 4, 77, 50, 6, 2.4, -.6) + warp(u, 'rw', '.03', 3, 31, 14, 1.5),
            noise(u, 'gn', '.008 .03', 4, 19, (1.8, -.4), (.05, .04, .03)),
            rg(u, 'riv', [(0, '#ffe8c0', .95), (.35, '#d8a070', .6), (1, '#6a5060', .25)], f(ex), f(ey - 50), '360', ' gradientUnits="userSpaceOnUse"')]
    o = []
    # the incoming track, a fading streak from the south-east
    tx, ty = fx + 330, fy - 250
    o.append('<path d="M%s %sL%s %sL%s %sZ" fill="url(#%strail)" filter="url(#%sb4)" opacity=".85"/>' % (f(tx), f(ty - 2), f(fx), f(fy - 5), f(fx), f(fy + 5), u, u))
    o.append('<path d="M%s %sL%s %s" stroke="#fff4dc" stroke-opacity=".5" stroke-width="1.2" filter="url(#%sb1)"/>' % (f(tx), f(ty), f(fx), f(fy), u))
    # a long smoke trail left hanging along the track
    sm = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(-35 %s %s)"/>' % (
        f(x), f(y), f(rnd.uniform(20, 50)), f(rnd.uniform(5, 12)), rnd.choice(['#6a6070', '#8a7a80', '#4a4458']), f(rnd.uniform(.2, .45)), f(x), f(y))
        for x, y in ((fx + (tx - fx) * t + rnd.gauss(0, 6), fy + (ty - fy) * t + rnd.gauss(0, 6)) for t in (rnd.uniform(.15, 1.05) for _ in range(26))))
    o.append('<g filter="url(#%ssm)">%s</g>' % (u, sm))
    # the flash: rays, a shock shell, a bloom, a white core
    o.append(glow(fx, fy, 330, u + 'bloom'))
    rays = []
    for i in range(64):
        a = rnd.uniform(0, 2 * math.pi); L = rnd.uniform(70, 220)
        rays.append('<path d="M%s %sL%s %s" stroke="#fff0d0" stroke-opacity="%s" stroke-width="%s"/>' % (
            f(fx), f(fy), f(fx + L * math.cos(a)), f(fy + L * math.sin(a)), f(rnd.uniform(.06, .22)), f(rnd.uniform(1, 4))))
    o.append('<g filter="url(#%sb2)" stroke-linecap="round">%s</g>' % (u, ''.join(rays)))
    o.append('<circle cx="%d" cy="%d" r="104" fill="url(#%sshock)" filter="url(#%sb2)"/>' % (fx, fy, u, u))
    o.append('<circle cx="%d" cy="%d" r="104" fill="none" stroke="#fff6e8" stroke-opacity=".25" stroke-width="1"/>' % (fx, fy))
    o.append(spikes(u, 'w', fx, fy, 220, 5, op=.25, filt='b4') + spikes(u, 'w', fx, fy, 200, 1.6))
    o.append(glow(fx, fy, 80, u + 'core') + '<circle cx="%d" cy="%d" r="17" fill="#fff" filter="url(#%sb4)"/>' % (fx, fy, u))
    defs.append(spike_grad(u, 'w', '#ffe8c0', .2))
    # the land: far ridges, the treeline still standing at the edge of the blast, the flattened plain
    o.append('<path d="M-10 %sQ70 %s 160 %sT340 %sT600 %sV%dH-10Z" fill="#7a6468" opacity=".8"/>' % (f(hz - 14), f(hz - 30), f(hz - 18), f(hz - 24), f(hz - 12), H))
    o.append('<path d="M-10 %sQ110 %s 220 %sT420 %sT600 %sV%dH-10Z" fill="#3a2e34"/>' % (f(hz - 6), f(hz - 16), f(hz - 8), f(hz - 12), f(hz - 4), H))
    trees = []
    x = -12
    while x < W + 12:
        h = rnd.uniform(4, 10)
        trees.append('<path d="%s"/>' % conifer(rnd, x, hz + 2, h, h * .34))
        x += rnd.uniform(3, 8)
    o.append('<g fill="#151216">%s</g>' % ''.join(trees))
    o.append('<rect y="%d" width="%d" height="%d" fill="url(#%sgnd)"/>' % (hz, W, H - hz, u))
    o.append('<rect y="%d" width="%d" height="%d" filter="url(#%sgn)" opacity=".5" style="mix-blend-mode: multiply"/>' % (hz, W, H - hz, u))
    # far patches of standing taiga beyond the fallen zone
    for _ in range(40):
        x = rnd.uniform(-20, W + 20); y = hz + rnd.uniform(1, 16)
        o.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#0c0c0c" opacity="%s"/>' % (f(x), f(y), f(rnd.uniform(14, 50)), f(rnd.uniform(1.5, 4)), f(rnd.uniform(.3, .6))))
    # the Kimchu, a river winding across the plain and throwing back the flash
    rv = [(-20, 402), (60, 396), (130, 410), (190, 430), (240, 428), (300, 412), (360, 404), (420, 418), (470, 440), (500, 470), (540, 500), (600, 520)]
    d = 'M%s %s' % (f(rv[0][0]), f(rv[0][1])) + ''.join('Q%s %s %s %s' % (f(a[0]), f(a[1]), f((a[0] + b[0]) / 2), f((a[1] + b[1]) / 2)) for a, b in zip(rv[1:], rv[2:]))
    o.append('<path d="%s" fill="none" stroke="#1a1416" stroke-width="7" stroke-linecap="round"/><path d="%s" fill="none" stroke="url(#%sriv)" stroke-width="3.2" stroke-linecap="round"/>' % (d, d, u))
    o.append('<rect y="%d" width="%d" height="%d" fill="url(#%sglow)"/>' % (hz, W, H - hz, u))
    # the radial fan of fallen trunks, crowns pointing away from the point below the burst
    fall = []
    lit = []
    for _ in range(3400):
        a = rnd.uniform(0, 2 * math.pi); r = 16 + 700 * rnd.random() ** 1.15
        x0, y0 = ex + r * math.cos(a), ey + r * math.sin(a) * .5
        if y0 < hz + 3 or y0 > 640 or x0 < -20 or x0 > W + 20: continue
        dep = (y0 - hz) / (ey - hz)
        L = rnd.uniform(8, 18) * (.35 + .8 * dep)
        a2 = a + rnd.gauss(0, .07)
        x1, y1 = x0 + L * math.cos(a2), y0 + L * math.sin(a2) * .5
        k = max(0, 1 - r / 380)
        w = .6 + 1.3 * dep
        fall.append('<path d="M%s %sL%s %s" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
            f(x0), f(y0), f(x1), f(y1), rnd.choice(['#0a0806', '#1a1410', '#2a1e16']), f(rnd.uniform(.6, 1)), f(w)))
        if rnd.random() < .6 * k + .25:
            lit.append('<path d="M%s %sL%s %s" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
                f(x0), f(y0 - w * .4), f(x1), f(y1 - w * .4), rnd.choice(['#e8b080', '#c88a60', '#ffd0a0']), f(.25 + .55 * k), f(w * .5)))
    o.append('<g stroke-linecap="round">%s%s</g>' % (''.join(fall), ''.join(lit)))
    # at the epicentre the trees still stand, stripped bare: a cluster of charred poles
    for _ in range(26):
        x = ex + rnd.gauss(0, 16); y = ey + rnd.gauss(0, 6); h = rnd.uniform(7, 15)
        o.append('<path d="M%s %sl%s %s" stroke="#0e0a08" stroke-width="1.1"/><path d="M%s %sl%s %s" stroke="#ffd0a0" stroke-opacity=".5" stroke-width=".5"/>' % (
            f(x), f(y), f(rnd.uniform(-1, 1)), f(-h), f(x + .4), f(y), f(0), f(-h)))
    # smoke and fires rising from the burnt ground
    smk = []
    for _ in range(18):
        x = ex + rnd.gauss(0, 150); y = hz + rnd.uniform(-30, 50)
        smk.append('<path d="%s" fill="%s" opacity="%s"/>' % (blob(x, y, rnd.uniform(18, 46), rnd.uniform(10, 30), rnd, 10, .35), rnd.choice(['#4a3a3a', '#5a4848', '#3a3038']), f(rnd.uniform(.25, .5))))
    o.append('<g filter="url(#%ssm)">%s</g>' % (u, ''.join(smk)))
    for _ in range(26):
        x = ex + rnd.gauss(0, 150); y = hz + 8 + abs(rnd.gauss(0, 90))
        o.append('<circle cx="%s" cy="%s" r="%s" fill="#ff9a40" opacity="%s" filter="url(#%sb2)"/>' % (f(x), f(y), f(rnd.uniform(1, 3)), f(rnd.uniform(.4, .8)), u))
    o.append('<rect y="%d" width="%d" height="6" fill="#e8b890" opacity=".3" filter="url(#%sb2)"/>' % (hz - 16, W, u))
    cr, cd = calm(u, 600, .7)
    o.append(cr); defs.append(cd)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .12), ''.join(defs))
    ann = [top('60.886°N 101.894°E · 30 JUNE 1908 · 00:14 UTC'),
           label((fx, fy), (560, 200), ['AIRBURST', '5–10 KM UP · ~12 MT'], 'end'),
           label((ex, ey), (22, 560), ['EPICENTRE', 'TREES LEFT STANDING']),
           label((470, 500), (560, 600), ['FALLEN FOREST', '2,150 KM² · 80 MILLION TREES'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= SL9
def sl9(u):
    """July 1994: Comet Shoemaker–Levy 9, torn into a string of pearls by Jupiter two years before, comes back to strike it; the scars of the first hits darken the south."""
    rnd = random.Random(1994)
    cx, cy, a = 364, 350, 172
    b_ = a * (1 - .065)
    sd = base(u, 'bg', [(0, '#1c1814'), (.55, '#0c0a0a'), (1, '#040306')], '.55', '.85')
    bg = plate_sky(u, 'bg', starfield(W, H, 230, 9407, 3, ('#ffffff', '#dfe8ff', '#fff1dc', '#cfe0ff'), u), sd + SPIKE_DEFS.format(u=u))
    defs = [('<clipPath id="%sdisk"><ellipse cx="%d" cy="%d" rx="%d" ry="%s"/></clipPath>'
             '<filter id="%sturb" x="-10%%" y="-10%%" width="120%%" height="120%%"><feTurbulence type="fractalNoise" baseFrequency=".004 .055" numOctaves="3" seed="44"/><feDisplacementMap in="SourceGraphic" scale="18"/></filter>') % (u, cx, cy, a, f(b_), u),
            rg(u, 'limb', [(0, '#000', 0), (.62, '#05040a', .1), (.88, '#030305', .45), (1, '#010102', .85)], '.42', '.42', '.68'),
            lg(u, 'term', [(0, '#000', 0), (.58, '#000', 0), (.84, '#03030a', .62), (1, '#010104', .94)], .1, .05, .95, .95),
            rg(u, 'grs', [(0, '#e8a17a', 1), (.55, '#c8643c', 1), (.85, '#a44a2c', 1), (1, '#f0d8c0', 1)]),
            rg(u, 'scar', [(0, '#1a0e0a', .95), (.45, '#2a1810', .85), (.75, '#4a2a1a', .45), (1, '#4a2a1a', 0)]),
            rg(u, 'pc', [(0, '#ffffff', 1), (.15, '#fff8ec', .9), (.4, '#d8e4f0', .35), (1, '#c8d8f0', 0)]),
            lg(u, 'tail', [(0, '#e8f0ff', .55), (.4, '#c8d8f0', .2), (1, '#c8d8f0', 0)], 0, 0, 1, 0),
            rg(u, 'flash', [(0, '#ffffff', 1), (.2, '#fff4d8', .8), (.5, '#ffc890', .25), (1, '#ff9a60', 0)]),
            rg(u, 'atm', [(.92, '#ffe0b0', 0), (.975, '#ffe8c8', .35), (1, '#ffe8c8', 0)]),
            blur(u, 'b1', .8) + blur(u, 'b2', 2) + blur(u, 'b4', 4) + blur(u, 'b10', 10)]
    bands = [(-1, '#8e949c'), (-.84, '#ac9c86'), (-.7, '#d4c4a6'), (-.56, '#a28666'), (-.44, '#e2d2b4'), (-.3, '#986642'), (-.18, '#ae784e'),
             (-.08, '#f2e6d0'), (.08, '#e6d0a6'), (.16, '#a46e48'), (.3, '#8a5636'), (.4, '#e6d6ba'), (.52, '#b6926e'), (.62, '#d4c4a6'), (.76, '#a89c8a'), (.88, '#949088')]
    g = ['<rect x="%d" y="%s" width="%d" height="%s" fill="%s"/>' % (cx - a - 20, f(cy + y * b_), 2 * a + 40, f(b_ * .3), c) for y, c in bands]
    for _ in range(80):
        y = cy + rnd.uniform(-.98, .98) * b_
        g.append('<path d="M%d %sH%d" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (cx - a - 20, f(y), cx + a + 20, rnd.choice(['#fff4e0', '#6a4428', '#c89870', '#8a6a50']), f(rnd.uniform(.08, .28)), f(rnd.uniform(.6, 3.2))))
    for _ in range(22):
        x = cx + rnd.uniform(-.85, .85) * a; y = cy + rnd.choice([-.24, .04, .36, -.5]) * b_
        g.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#fff6e4" opacity=".4"/>' % (f(x), f(y), f(rnd.uniform(4, 13)), f(rnd.uniform(1.5, 3.2))))
    # festoons along the equatorial belt edge
    for _ in range(14):
        x = cx + rnd.uniform(-.8, .8) * a; y = cy - .1 * b_
        g.append('<path d="M%s %sq%s %s %s %s" fill="none" stroke="#6a4428" stroke-opacity=".35" stroke-width="1.6"/>' % (f(x), f(y), f(8), f(10), f(22), f(14)))
    gx, gy = cx - .38 * a, cy + .3 * b_
    spot = ('<ellipse cx="%s" cy="%s" rx="30" ry="16" fill="#f4e4cc" opacity=".7"/><ellipse cx="%s" cy="%s" rx="24" ry="12" fill="url(#%sgrs)"/>'
            '<ellipse cx="%s" cy="%s" rx="14" ry="6" fill="none" stroke="#f8d8b8" stroke-opacity=".4"/>') % (f(gx - 4), f(gy), f(gx), f(gy), u, f(gx), f(gy))
    # the impact scars, strung along about 44° south: a dark core, a crescent of ejecta, smeared east by the winds
    lat = .58
    sc = []
    for xs, r, sm in [(-.62, 10, 20), (-.46, 15, 30), (-.27, 20, 44), (-.04, 24, 56), (.12, 9, 16), (.24, 16, 38), (.44, 19, 40), (.6, 11, 18)]:
        x = cx + xs * a * math.sqrt(1 - lat ** 2) / .72; y = cy + (lat + rnd.uniform(-.02, .02)) * b_
        fs = math.sqrt(max(.05, 1 - ((x - cx) / a) ** 2 - lat ** 2)) / math.sqrt(1 - lat ** 2)
        sc.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#3a2418" opacity=".35" filter="url(#%sb4)"/>' % (f(x + sm * .4), f(y + 1), f(r * 1.4 * fs + sm * .5), f(r * .38), u))
        sc.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%sscar)"/>' % (f(x), f(y), f(r * fs), f(r * .42), u))
        sc.append('<path d="M%s %sA%s %s 0 0 0 %s %s" fill="none" stroke="#2a180e" stroke-opacity=".55" stroke-width="%s" filter="url(#%sb1)"/>' % (
            f(x - r * 1.5 * fs), f(y - 1), f(r * 1.6 * fs), f(r * .7), f(x + r * 1.5 * fs), f(y - 1), f(r * .14), u))
    # a fresh hit just over the limb: a plume catching the sunlight
    px, py = cx - a * math.sqrt(1 - lat ** 2) * 1.0 + 4, cy + lat * b_ - 2
    body = ('<g clip-path="url(#%sdisk)"><g filter="url(#%sturb)">%s</g>%s%s<ellipse cx="%d" cy="%d" rx="%d" ry="%s" fill="url(#%slimb)"/><ellipse cx="%d" cy="%d" rx="%d" ry="%s" fill="url(#%sterm)"/></g>'
            '<ellipse cx="%d" cy="%d" rx="%s" ry="%s" fill="url(#%satm)"/>') % (
        u, u, ''.join(g), spot, ''.join(sc), cx, cy, a, f(b_), u, cx, cy, a, f(b_), u, cx, cy, f(a * 1.04), f(b_ * 1.04), u)
    o = [body]
    o.append('<path d="M%s %sq%s %s %s %s" stroke="#fff0d0" stroke-opacity=".75" stroke-width="5" fill="none" filter="url(#%sb2)"/>' % (f(px + 2), f(py), f(-10), f(-12), f(-8), f(-26), u))
    o.append(glow(px - 2, py - 16, 26, u + 'flash', .9))
    # the string of pearls: twenty-one fragments in a line, each with a coma and a short tail streaming back
    p0, p1 = (-4, 236), (cx - a * .93, cy + b_ * .44)
    ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    tail_a = math.degrees(ang) + 180 - 8
    sizes = [.5, .7, .9, .6, 1.1, .8, 1.3, 1.0, .7, 1.5, 1.2, .8, 1.4, 1.0, .6, 1.1, .9, 1.6, .7, 1.0, .8]
    for i, s in enumerate(sizes):
        t = .03 + .92 * i / 20
        x = p0[0] + (p1[0] - p0[0]) * t + rnd.gauss(0, 1.5); y = p0[1] + (p1[1] - p0[1]) * t + rnd.gauss(0, 1.5)
        s *= 1 + .6 * t
        L = 7 + 10 * s
        o.append('<path d="M0 %sL%s 0L0 %sZ" fill="url(#%stail)" transform="translate(%s %s) rotate(%s)" filter="url(#%sb1)"/>' % (
            f(-2.4 * s), f(L), f(2.4 * s), u, f(x), f(y), f(tail_a), u))
        o.append(glow(x, y, 5 + 5 * s, u + 'pc', .95) + '<circle cx="%s" cy="%s" r="%s" fill="#fff"/>' % (f(x), f(y), f(.6 + .55 * s)))
    # a faint dust train tying the pearls together
    o.append('<path d="M%s %sL%s %s" stroke="#d8e4f0" stroke-opacity=".08" stroke-width="10" filter="url(#%sb4)"/>' % (f(p0[0]), f(p0[1]), f(p1[0]), f(p1[1]), u))
    # Io in transit beside the limb
    o.append('<circle cx="%d" cy="%d" r="6" fill="#f0d890"/><circle cx="%d" cy="%d" r="6" fill="#000" opacity=".35" transform="translate(2 1)"/>' % (cx + a + 40, cy - 70, cx + a + 40, cy - 70))
    cr, cd = calm(u, 600, .5)
    o.append(cr); defs.append(cd)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .12), ''.join(defs))
    ann = [top('D/1993 F2 · IMPACTS 16–22 JULY 1994'),
           label((40, 214), (22, 300), ['FRAGMENTS A–W', '21 PIECES · 1 MILLION KM']),
           label((cx - .08 * a * math.sqrt(1 - lat ** 2) / .72, cy + lat * b_), (560, 600), ['IMPACT SCARS', '44°S · WIDER THAN EARTH'], 'end'),
           label((gx, gy), (22, 470), ['GREAT RED SPOT'])]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= TITAN
def titan(u):
    """Saturn's largest moon, its surface hidden under a smog of orange haze, a thin blue haze layer floating detached above the limb, Saturn and its rings behind."""
    rnd = random.Random(1655)
    cx, cy, R = 324, 366, 142
    sx, sy, SR = 112, 296, 60
    sd = base(u, 'bg', [(0, '#16120e'), (.55, '#0a0808'), (1, '#030305')], '.35', '.9')
    # Saturn: banded, its rings tilted, the night side and the ring shadow, dim behind the moon
    sdef = (lg(u, 'sat', [(0, '#e8d4a8', 1), (.25, '#d4b884', 1), (.4, '#c8a878', 1), (.55, '#e0c898', 1), (.7, '#b89870', 1), (.85, '#a88c6a', 1), (1, '#7a6a5a', 1)], 0, 0, 0, 1) +
            '<clipPath id="%ssc"><ellipse cx="%d" cy="%d" rx="%d" ry="%s"/></clipPath>' % (u, sx, sy, SR, f(SR * .9)) +
            lg(u, 'sterm', [(0, '#000', 0), (.5, '#000', 0), (.8, '#020204', .7), (1, '#020204', .95)], .2, 0, 1, .4) +
            rg(u, 'slimb', [(0, '#000', 0), (.7, '#000', .1), (1, '#000', .7)]) + blur(u, 'sb', 1.2))
    tilt = -18
    rings = [(1.24, 1.5, '#8a7a64', .45), (1.53, 1.94, '#e4d0a8', .8), (2.02, 2.26, '#c8b490', .65)]
    def ring_band(back):
        out = []
        for r0, r1, col, op in rings:
            rm = (r0 + r1) / 2 * SR; w = (r1 - r0) * SR
            d = ('M%s %sA%s %s 0 0 1 %s %s' if back else 'M%s %sA%s %s 0 0 0 %s %s') % (f(sx - rm), f(sy), f(rm), f(rm * .22), f(sx + rm), f(sy))
            out.append('<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (d, col, f(op), f(w * .9)))
        return '<g transform="rotate(%d %d %d)">%s</g>' % (tilt, sx, sy, ''.join(out))
    sat = (ring_band(True) +
           '<g clip-path="url(#%ssc)" transform="rotate(%d %d %d)"><rect x="%d" y="%d" width="%d" height="%d" fill="url(#%ssat)"/>%s'
           '<ellipse cx="%d" cy="%d" rx="%d" ry="%s" fill="url(#%sslimb)"/><rect x="%d" y="%d" width="%d" height="%d" fill="url(#%ssterm)"/>'
           '<path d="M%d %sA%d %s 0 0 0 %d %s" stroke="#0a0806" stroke-opacity=".55" stroke-width="7" fill="none"/></g>' % (
               u, tilt, sx, sy, sx - SR, sy - SR, 2 * SR, 2 * SR, u,
               ''.join('<rect x="%d" y="%s" width="%d" height="%s" fill="%s" opacity="%s"/>' % (sx - SR, f(sy + yy * SR), 2 * SR, f(h * SR), c, f(op)) for yy, h, c, op in
                       [(-.7, .12, '#a48a6a', .5), (-.4, .08, '#f0dcb4', .5), (-.22, .1, '#b0906a', .45), (.1, .06, '#a08060', .4), (.3, .1, '#c8a878', .4), (.55, .14, '#8a7a6a', .5)]),
               sx, sy, SR, f(SR * .9), u, sx - SR, sy - SR, 2 * SR, 2 * SR, u, sx - SR, f(sy - 6), SR, f(SR * .2), sx + SR, f(sy - 6)) +
           ring_band(False))
    bg = plate_sky(u, 'bg', starfield(W, H, 200, 1655, 2, ('#ffffff', '#fff1dc', '#ffe8cc', '#dfe8ff'), u) + '<g opacity=".62">%s</g>' % sat, sd + SPIKE_DEFS.format(u=u) + sdef)

    defs = [rg(u, 'base', [(0, '#f6c66a', 1), (.35, '#e8a648', 1), (.7, '#c8803a', 1), (.9, '#9a5a2a', 1), (1, '#6a3a1c', 1)], '.36', '.4', '.78'),
            '<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>' % (u, cx, cy, R),
            lg(u, 'term', [(0, '#000', 0), (.5, '#000', 0), (.72, '#140804', .75), (.86, '#080302', .97), (1, '#050201', 1)], .1, .08, .92, .9),
            rg(u, 'limb', [(0, '#000', 0), (.6, '#3a1a08', .08), (.88, '#2a1006', .3), (1, '#1a0804', .5)]),
            rg(u, 'haze', [(0, '#ffb050', 0), (.88, '#ffb050', 0), (.92, '#ffc070', .5), (.95, '#ffb060', .12), (1, '#ffb060', 0)], '.5', '.5', '.5'),
            rg(u, 'blue', [(0, '#7ab0ff', 0), (.948, '#7ab0ff', 0), (.962, '#b8d6ff', 1), (.976, '#7aa8ff', .45), (1, '#6a9aff', 0)], '.5', '.5', '.5'),
            noise(u, 'tn', '.006 .02', 4, 21, (2.2, -.9), (.35, .15, .05)),
            noise(u, 'tm', '.03', 3, 23, (2.4, -1.1), (1, .9, .7)),
            blur(u, 'b2', 2) + blur(u, 'b6', 6) + blur(u, 'b14', 14) + blur(u, 'b30', 30, 60),
            lg(u, 'lit', [(0, '#333', 1), (.45, '#555', 1), (.75, '#fff', 1), (1, '#fff', 1)], .9, .85, .1, .1),
            '<mask id="%slm" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><rect x="%d" y="%d" width="%d" height="%d" fill="url(#%slit)"/></mask>' % (u, W, H, cx - R - 40, cy - R - 40, 2 * R + 80, 2 * R + 80, u)]
    o = []
    # a warm glow of scattered sunlight round the whole globe
    o.append('<circle cx="%d" cy="%d" r="%d" fill="#ff9a40" opacity=".16" filter="url(#%sb30)"/>' % (cx, cy, R + 30, u))
    o.append('<g mask="url(#%slm)"><circle cx="%d" cy="%d" r="%s" fill="none" stroke="#8ab8ff" stroke-opacity=".22" stroke-width="10" filter="url(#%sb6)"/></g>' % (u, cx, cy, f(R * 1.1), u))
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u)]
    # the haze is nearly featureless: soft latitude banding, a darker northern hood, a brighter south
    for yy, h, c, op in [(-1, .26, '#7a4420', .5), (-.78, .1, '#a8642c', .4), (-.6, .06, '#f8c878', .25), (-.3, .14, '#d89048', .2), (.05, .18, '#f8c070', .2), (.4, .2, '#ffd890', .22), (.75, .3, '#c88848', .2)]:
        b.append('<rect x="%d" y="%s" width="%d" height="%s" fill="%s" opacity="%s" filter="url(#%sb14)"/>' % (cx - R, f(cy + yy * R), 2 * R, f(h * R), c, f(op), u))
    b.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%stn)" opacity=".35" style="mix-blend-mode: multiply"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    b.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%stm)" opacity=".06" style="mix-blend-mode: screen"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    # a ghost of the dark dune fields and the bright Xanadu region showing faintly through
    b.append('<path d="%s" fill="#5a2a10" opacity=".14" filter="url(#%sb14)"/>' % (blob(cx - 10, cy + 20, R * .9, R * .16, rnd, 16, .3), u))
    b.append('<path d="%s" fill="#ffe0a0" opacity=".14" filter="url(#%sb14)"/>' % (blob(cx + 30, cy + 10, R * .3, R * .2, rnd, 12, .3), u))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimb)"/><circle cx="%d" cy="%d" r="%d" fill="url(#%sterm)"/>' % (cx, cy, R, u, cx, cy, R, u))
    o.append('<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)))
    # the thick atmosphere: an orange haze softening the edge, then a thin blue layer detached above it, brightest toward the sun
    o.append('<g mask="url(#%slm)"><circle cx="%d" cy="%d" r="%s" fill="url(#%shaze)"/></g>' % (u, cx, cy, f(R * 1.09), u))
    o.append('<g mask="url(#%slm)"><circle cx="%d" cy="%d" r="%s" fill="url(#%sblue)"/><circle cx="%d" cy="%d" r="%s" fill="none" stroke="#b8d4ff" stroke-opacity=".5" stroke-width="1.4" filter="url(#%sb2)"/></g>' % (
        u, cx, cy, f(R * 1.12), u, cx, cy, f(R * 1.082), u))
    cr, cd = calm(u, 600, .55)
    o.append(cr); defs.append(cd)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), ''.join(defs))
    ann = [reticle(cx, cy, R + 26, 72, 4, .2), top('SATURN VI · ATMOSPHERE 1.5 BAR · N₂ + CH₄'),
           label((cx + R * .76, cy - R * .8), (560, 160), ['DETACHED HAZE', '500 KM UP · BLUE'], 'end'),
           label((cx + R * .2, cy - R * .9), (560, 240), ['POLAR HOOD'], 'end'),
           label((sx - SR * .3, sy + SR * .5), (22, 420), ['SATURN', '1.2 MILLION KM']),
           scalebar(560 - 1000 / 2575 * R, 600, 1000 / 2575 * R, '1,000 KM', 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= constellations
STAR_COLS = {'b': '#a8c4ff', 'w': '#dfe8ff', 'y': '#fff0d0', 'o': '#ffb86a', 'r': '#ff8a4a'}


def plate_stars(u, pos, named, bigs=1.0):
    return ''.join(bright(u, x, y, m, c, bigs) for n, (x, y, m, c) in pos.items() if n in named)


def lesser(pos, names, op=1):
    return ''.join(pinstar(pos[n][0], pos[n][1], max(.7, 1.2 + (4.6 - pos[n][2]) * .7), STAR_COLS[pos[n][3]], op) for n in names)


def const_defs(u):
    return star_defs(u, STAR_COLS) + blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b8', 8) + blur(u, 'b20', 20, 60)


DIPPER = [('DUBHE', hms(11, 3, 43.7), dms(61, 45, 3), 1.79, 'o'), ('MERAK', hms(11, 1, 50.5), dms(56, 22, 57), 2.37, 'w'),
          ('PHECDA', hms(11, 53, 49.8), dms(53, 41, 41), 2.44, 'w'), ('MEGREZ', hms(12, 15, 25.6), dms(57, 1, 57), 3.31, 'w'),
          ('ALIOTH', hms(12, 54, 1.7), dms(55, 57, 35), 1.77, 'w'), ('MIZAR', hms(13, 23, 55.5), dms(54, 55, 31), 2.27, 'w'),
          ('ALCOR', hms(13, 25, 13.5), dms(54, 59, 17), 4.01, 'w'), ('ALKAID', hms(13, 47, 32.4), dms(49, 18, 48), 1.86, 'b'),
          # the rest of the Bear, faint
          ('MUSCIDA', hms(8, 30, 15.9), dms(60, 43, 5), 3.36, 'y'), ('TALITHA', hms(8, 59, 12.5), dms(48, 2, 30), 3.14, 'w'),
          ('TANIA-B', hms(10, 17, 5.8), dms(42, 54, 52), 3.45, 'w'), ('TANIA-A', hms(10, 22, 19.7), dms(41, 29, 58), 3.06, 'o'),
          ('ALULA-B', hms(11, 18, 28.7), dms(33, 5, 39), 3.49, 'o'), ('ALULA-A', hms(11, 18, 10.9), dms(31, 31, 45), 3.79, 'y'),
          ('UPS', hms(9, 50, 59.4), dms(59, 2, 19), 3.8, 'y'), ('THETA', hms(9, 32, 51.4), dms(51, 40, 38), 3.17, 'y'),
          ('PSI', hms(11, 9, 39.8), dms(44, 29, 55), 3.01, 'o'), ('CHI', hms(11, 46, 3.0), dms(47, 46, 46), 3.69, 'o'),
          ('M81', hms(9, 55, 33), dms(69, 3, 55), 7, 'y'), ('M82', hms(9, 55, 52), dms(69, 40, 47), 8, 'y'), ('M101', hms(14, 3, 12.6), dms(54, 20, 56), 8, 'y')]


def big_dipper(u):
    """The seven stars of the Plough, plotted where they are: the bowl and the bent handle, Mizar with Alcor beside it, and the pointers aimed at the Pole Star."""
    rnd = random.Random(1781)
    pos = chart(DIPPER, 12.4, 55.5, 290, 384, 15.5, 10)
    sd = base(u, 'bg', [(0, '#121a30'), (.5, '#080c1c'), (1, '#02040a')], '.45', '.85')
    # the faint galactic cirrus that hangs over the Bear, lit by the whole Milky Way
    ifn = ''.join('<path d="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
        blob(x, y, rnd.uniform(60, 160), rnd.uniform(14, 40), rnd, 12, .45), rnd.choice(['#5a5a6a', '#6a6460', '#4a4a5a', '#7a7068']), f(rnd.uniform(.08, .2)), f(rnd.uniform(-40, -10)), f(x), f(y))
        for x, y in ((rnd.uniform(-40, 620), rnd.uniform(60, 760)) for _ in range(24)))
    bg = plate_sky(u, 'bg', '<g filter="url(#%sif)">%s</g>' % (u, ifn) + faint_field(u, rnd, 560, (0, 0, W, H), ('#ffffff', '#dfe8ff', '#fff1dc', '#e8ecff', '#ffe8cc')),
                   sd + cloud(u, 'if', '.012 .03', 4, 27, 60, 10, 2.4, -.6))
    defs = const_defs(u)
    o = []
    # faint galaxies in the Bear's field: M81 and M82 above the bowl, the Pinwheel by the handle
    for n, rx, ry, rot, col in [('M81', 7, 3.6, -30, '#fff0d8'), ('M82', 6, 1.4, 60, '#f0e4d8'), ('M101', 6, 5.4, 0, '#e8ecff')]:
        x, y, _, _ = pos[n]
        o.append('<g transform="translate(%s %s) rotate(%s)"><ellipse rx="%s" ry="%s" fill="%s" opacity=".22" filter="url(#%sb3)"/><ellipse rx="%s" ry="%s" fill="#fff" opacity=".6"/></g>' % (
            f(x), f(y), f(rot), f(rx * 1.8), f(ry * 1.8), col, u, f(rx * .3), f(ry * .3)))
    # the whole Bear, its outline faint behind the Dipper
    bear = [('DUBHE', 'UPS'), ('UPS', 'MUSCIDA'), ('UPS', 'THETA'), ('THETA', 'TALITHA'), ('PHECDA', 'CHI'), ('CHI', 'PSI'), ('PSI', 'ALULA-A'), ('PSI', 'ALULA-B'),
            ('MERAK', 'THETA'), ('CHI', 'TANIA-B'), ('TANIA-B', 'TANIA-A')]
    gap = lambda m: 6 + max(0, 3.6 - m) * 6
    o.append(figure(pos, bear, gap, '#c8d4f0', .14, .6))
    o.append(lesser(pos, ['MUSCIDA', 'TALITHA', 'TANIA-A', 'TANIA-B', 'ALULA-A', 'ALULA-B', 'UPS', 'THETA', 'PSI', 'CHI'], .8))
    # the pointers: Merak to Dubhe and on, five times the gap, to Polaris
    (mx, my, _, _), (dx, dy, _, _) = pos['MERAK'], pos['DUBHE']
    L = math.hypot(dx - mx, dy - my); ux, uy = (dx - mx) / L, (dy - my) / L
    s0, s1 = 22, 170
    o.append('<path d="M%s %sL%s %s" stroke="#ffe8b8" stroke-opacity=".45" stroke-width=".8" stroke-dasharray="2 5" stroke-linecap="round"/>' % (
        f(dx + ux * s0), f(dy + uy * s0), f(dx + ux * s1), f(dy + uy * s1)))
    ax, ay = dx + ux * (s1 + 8), dy + uy * (s1 + 8)
    o.append('<path d="M%s %sL%s %sL%s %s" fill="none" stroke="#ffe8b8" stroke-opacity=".6" stroke-width=".9" stroke-linejoin="round"/>' % (
        f(ax - ux * 9 - uy * 5), f(ay - uy * 9 + ux * 5), f(ax), f(ay), f(ax - ux * 9 + uy * 5), f(ay - uy * 9 - ux * 5)))
    dip = [('DUBHE', 'MERAK'), ('MERAK', 'PHECDA'), ('PHECDA', 'MEGREZ'), ('MEGREZ', 'DUBHE'), ('MEGREZ', 'ALIOTH'), ('ALIOTH', 'MIZAR'), ('MIZAR', 'ALKAID')]
    o.append(figure(pos, dip, gap, '#f4e8cc', .5, .9))
    o.append(plate_stars(u, pos, {'DUBHE', 'MERAK', 'PHECDA', 'MEGREZ', 'ALIOTH', 'MIZAR', 'ALKAID'}, 1.05))
    o.append(lesser(pos, ['ALCOR']))
    cr, cd = calm(u, 600, .5)
    o.append(cr)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs + cd)
    ann = [top('URSA MAJOR · RA 11H–14H · DEC +49° TO +62°')]
    for n, side in [('DUBHE', 'end'), ('MERAK', 'end'), ('ALKAID', 'start')]:
        x, y, m, _ = pos[n]
        ann.append('<text x="%s" y="%s" text-anchor="%s" fill="rgba(245,241,232,.6)" style="%s">%s</text>' % (f(x + (14 if side == 'start' else -14)), f(y + 20), side, LBL, n))
    ann.append(label(pos['MIZAR'][:2], (22, 560), ['MIZAR + ALCOR', 'THE HORSE AND RIDER']))
    ann.append('<text x="%s" y="%s" text-anchor="middle" fill="rgba(245,241,232,.6)" style="%s">TO POLARIS · 28°</text>' % (f(ax), f(ay - 10), LBL))
    return bg, obj, svg(W, H, ''.join(ann))


ORI = [('BETELGEUSE', hms(5, 55, 10.3), dms(7, 24, 25), .42, 'r'), ('RIGEL', hms(5, 14, 32.3), -dms(8, 12, 6), .13, 'b'),
       ('BELLATRIX', hms(5, 25, 7.9), dms(6, 20, 59), 1.64, 'b'), ('SAIPH', hms(5, 47, 45.4), -dms(9, 40, 11), 2.06, 'b'),
       ('ALNITAK', hms(5, 40, 45.5), -dms(1, 56, 34), 1.77, 'b'), ('ALNILAM', hms(5, 36, 12.8), -dms(1, 12, 7), 1.69, 'b'),
       ('MINTAKA', hms(5, 32, 0.4), -dms(0, 17, 57), 2.23, 'b'), ('MEISSA', hms(5, 35, 8.3), dms(9, 56, 3), 3.39, 'b'),
       ('M42', hms(5, 35, 17.3), -dms(5, 23, 28), 4.0, 'w'), ('HATYSA', hms(5, 35, 26.0), -dms(5, 54, 36), 2.77, 'b'), ('C-ORI', hms(5, 35, 23.2), -dms(4, 50, 18), 4.6, 'b'),
       ('PI3', hms(4, 49, 50.4), dms(6, 57, 41), 3.19, 'y'), ('PI2', hms(4, 50, 36.7), dms(8, 54, 1), 4.35, 'w'), ('PI4', hms(4, 51, 12.4), dms(5, 36, 18), 3.68, 'b'),
       ('PI5', hms(4, 54, 15.1), dms(2, 26, 26), 3.7, 'b'), ('PI1', hms(4, 54, 53.7), dms(10, 9, 3), 4.6, 'w'), ('PI6', hms(4, 58, 32.9), dms(1, 42, 51), 4.47, 'o'),
       ('MU', hms(6, 2, 23.0), dms(9, 38, 51), 4.12, 'w'), ('NU', hms(6, 7, 34.3), dms(14, 46, 6), 4.42, 'b'), ('XI', hms(6, 11, 56.4), dms(14, 12, 32), 4.45, 'b'),
       ('F1', hms(6, 3, 55.2), dms(20, 8, 18), 4.63, 'y'), ('CHI1', hms(5, 54, 23.0), dms(20, 16, 34), 4.39, 'y'),
       ('PHI1', hms(5, 34, 49.2), dms(9, 29, 22), 4.39, 'b'), ('PHI2', hms(5, 36, 54.4), dms(9, 17, 26), 4.09, 'y'),
       ('ETA', hms(5, 24, 28.6), -dms(2, 23, 49), 3.36, 'b'), ('TAU', hms(5, 17, 36.4), -dms(6, 50, 40), 3.6, 'b'), ('SIGMA', hms(5, 38, 44.8), -dms(2, 36, 0), 3.8, 'b')]


def orion(u):
    """The Hunter: red Betelgeuse at his shoulder, blue Rigel at his knee, the belt of three, the sword with the Orion Nebula glowing pink, Barnard's Loop arching round."""
    rnd = random.Random(1610)
    pos = chart(ORI, 5.55, 2.6, 296, 380, 13)
    sd = base(u, 'bg', [(0, '#141a30'), (.5, '#090c1c'), (1, '#03040a')], '.45', '.85')
    # Barnard's Loop, a great faint red arc on the eastern side, and the Lambda Orionis ring round the head
    bx, by = pos['ALNITAK'][0] + 10, pos['ALNITAK'][1] + 14
    sdefs = cloud(u, 'hb', '.01', 4, 33, 50, 14, 2.4, -.7) + blur(u, 'b10', 10)
    loop = '<path d="M%s %sA%s %s 0 0 0 %s %s" fill="none" stroke="#c83a4a" stroke-opacity=".5" stroke-width="24" filter="url(#%shb)"/>' % (
        f(bx + 20), f(by - 160), f(130), f(170), f(bx + 30), f(by + 160), u)
    mx, my = pos['MEISSA'][0], pos['MEISSA'][1]
    lam = '<circle cx="%s" cy="%s" r="48" fill="none" stroke="#b8384a" stroke-opacity=".35" stroke-width="22" filter="url(#%shb)"/>' % (f(mx), f(my + 4), u)
    hal = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(rnd.uniform(-40, 620), rnd.uniform(120, 760), rnd.uniform(60, 160), rnd.uniform(30, 80), rnd, 12, .4),
                                                             rnd.choice(['#3a1a2a', '#2a1830', '#1a1a34']), f(rnd.uniform(.25, .5))) for _ in range(12))
    bg = plate_sky(u, 'bg', '<g filter="url(#%shb)">%s</g>' % (u, hal) + loop + lam + faint_field(u, rnd, 480, (0, 0, W, H)), sd + sdefs)
    defs = const_defs(u) + cloud(u, 'nb', '.03', 4, 42, 18, 3, 2.4, -.5) + rg(u, 'neb', [(0, '#ffe0e8', .9), (.25, '#ff8aa8', .55), (.6, '#c84a7a', .2), (1, '#8a2a5a', 0)])
    o = []
    # the nebula in the sword
    nx_, ny_ = pos['M42'][0], pos['M42'][1]
    neb = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(nx_ + rnd.gauss(0, 4), ny_ + rnd.gauss(0, 5), rnd.uniform(4, 11), rnd.uniform(3, 9), rnd, 10, .4),
                                                             rnd.choice(['#ff7aa0', '#ff9ab8', '#e85a8a', '#ffb0c0']), f(rnd.uniform(.25, .55))) for _ in range(16))
    o.append(glow(nx_, ny_, 30, u + 'neb') + '<g filter="url(#%snb)">%s</g>' % (u, neb) +
             '<path d="%s" fill="#3a1424" opacity=".4" filter="url(#%sb1)"/>' % (blob(nx_ - 4, ny_ - 3, 4, 2, rnd, 8, .3), u))
    o.append(pinstar(nx_, ny_, 1.6, '#e8f0ff') + pinstar(nx_ + 1.5, ny_ - 1, 1, '#ffffff'))
    gap = lambda m: 7 + max(0, 3.6 - m) * 6.4
    segs = [('BETELGEUSE', 'BELLATRIX'), ('BETELGEUSE', 'ALNITAK'), ('BELLATRIX', 'MINTAKA'), ('ALNITAK', 'ALNILAM'), ('ALNILAM', 'MINTAKA'),
            ('ALNITAK', 'SAIPH'), ('MINTAKA', 'RIGEL'), ('BETELGEUSE', 'MEISSA'), ('BELLATRIX', 'MEISSA'),
            ('BELLATRIX', 'PI3'), ('PI1', 'PI2'), ('PI2', 'PI3'), ('PI3', 'PI4'), ('PI4', 'PI5'), ('PI5', 'PI6'),
            ('BETELGEUSE', 'MU'), ('MU', 'XI'), ('XI', 'NU'), ('NU', 'F1'), ('F1', 'CHI1'),
            ('ALNILAM', 'C-ORI'), ('C-ORI', 'M42'), ('M42', 'HATYSA')]
    o.append(figure(pos, segs, gap, '#f4e8cc', .4, .8))
    o.append(lesser(pos, ['MEISSA', 'PI1', 'PI2', 'PI3', 'PI4', 'PI5', 'PI6', 'MU', 'NU', 'XI', 'F1', 'CHI1', 'PHI1', 'PHI2', 'ETA', 'TAU', 'SIGMA', 'C-ORI', 'HATYSA']))
    o.append(plate_stars(u, pos, {'BELLATRIX', 'SAIPH', 'ALNITAK', 'ALNILAM', 'MINTAKA'}, .95))
    # the two first-magnitude stars, larger and coloured
    bx_, by_, _, _ = pos['BETELGEUSE']
    o.append('<circle cx="%s" cy="%s" r="34" fill="#ff6a2a" opacity=".3" filter="url(#%sb8)"/>' % (f(bx_), f(by_), u))
    o.append(plate_stars(u, pos, {'BETELGEUSE', 'RIGEL'}, 1.05))
    cr, cd = calm(u, 600, .45)
    o.append(cr)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs + cd)
    ann = [top('ORION · RA 5H–6H · DEC −10° TO +20°')]
    for n, dx_, dy_, anc in [('BETELGEUSE', -16, -14, 'end'), ('RIGEL', 16, 22, 'start'), ('BELLATRIX', 16, -10, 'start'), ('SAIPH', -16, 22, 'end')]:
        x, y, _, _ = pos[n]
        ann.append('<text x="%s" y="%s" text-anchor="%s" fill="rgba(245,241,232,.6)" style="%s">%s</text>' % (f(x + dx_), f(y + dy_), anc, LBL, n))
    ann.append(label((nx_, ny_), (22, 470), ['M42', 'ORION NEBULA · 1,344 LY']))
    ann.append(label(pos['ALNILAM'][:2], (560, 260), ['THE BELT', 'ALNITAK · ALNILAM · MINTAKA'], 'end'))
    return bg, obj, svg(W, H, ''.join(ann))


CRUX = [('ACRUX', hms(12, 26, 35.9), -dms(63, 5, 57), .76, 'b'), ('MIMOSA', hms(12, 47, 43.3), -dms(59, 41, 19), 1.25, 'b'),
        ('GACRUX', hms(12, 31, 9.96), -dms(57, 6, 48), 1.64, 'r'), ('DELTA', hms(12, 15, 8.7), -dms(58, 44, 56), 2.79, 'b'),
        ('EPSILON', hms(12, 21, 21.6), -dms(60, 24, 4), 3.59, 'o'),
        ('MU', hms(12, 54, 35.6), -dms(57, 10, 40), 3.9, 'b'), ('ZETA', hms(12, 18, 26.2), -dms(64, 0, 11), 4.04, 'b'),
        ('COAL', hms(12, 51, 0), -dms(62, 48, 0), 9, 'w'), ('JEWEL', hms(12, 53, 36), -dms(60, 22, 0), 4.2, 'y')]


def southern_cross(u):
    """Crux: blue Acrux at the foot, orange Gacrux at the head, Mimosa and Delta for the arms, little Epsilon off-centre; the Coalsack a black hole in the Milky Way beside it."""
    rnd = random.Random(1679)
    pos = chart(CRUX, 12.5, -60.3, 300, 378, 38, 0)
    sd = base(u, 'bg', [(0, '#1a1822'), (.55, '#0c0b12'), (1, '#040308')], '.45', '.85')
    cx_, cy_ = pos['COAL'][0], pos['COAL'][1]
    # the southern Milky Way runs through the cross from the right (Carina) to the lower left (Centaurus)
    ax_, ay_ = pos['ACRUX'][0], pos['ACRUX'][1]
    mdefs, mw = milky_way(u, rnd, (720, ay_ - 120), (-140, ay_ + 40), 330, ['#7a6c5a', '#5e5246', '#8a7a64', '#4a4048', '#6a5c50'], seed=61, dens=.72, lanes=20,
                          neb=[(560, ay_ - 110, 40, '#b0404a', .4), (40, ay_ + 30, 30, '#a8384a', .25)])
    mw = '<g opacity=".72">%s</g>' % mw
    coal = '<g filter="url(#%smwl)">%s</g>' % (u, ''.join('<path d="%s" fill="#020104" opacity="%s"/>' % (
        blob(cx_ + rnd.gauss(0, 20), cy_ + rnd.gauss(0, 16), rnd.uniform(40, 70), rnd.uniform(30, 56), rnd, 12, .3), f(rnd.uniform(.5, .7))) for _ in range(10)))
    bg = plate_sky(u, 'bg', mw + coal + field(rnd, 300, (0, 0, W, H), ['#ffffff', '#fff1dc', '#ffe0b8', '#dfe8ff'], .3, 1.4), sd + mdefs)
    defs = const_defs(u)
    o = []
    # the Jewel Box, a tiny glittering cluster by Mimosa
    jx, jy = pos['JEWEL'][0], pos['JEWEL'][1]
    for _ in range(18):
        o.append(pinstar(jx + rnd.gauss(0, 4), jy + rnd.gauss(0, 4), rnd.uniform(.5, 1), rnd.choice(['#dfe8ff', '#ffffff', '#ffb070']), .9))
    gap = lambda m: 9 + max(0, 3.6 - m) * 6.8
    o.append(figure(pos, [('GACRUX', 'ACRUX'), ('DELTA', 'MIMOSA')], gap, '#f4e8cc', .6, 1))
    o.append(lesser(pos, ['MU', 'ZETA']))
    o.append(plate_stars(u, pos, {'EPSILON', 'DELTA'}, 1.15))
    o.append(plate_stars(u, pos, {'ACRUX', 'MIMOSA', 'GACRUX'}, 1.25))
    cr, cd = calm(u, 600, .5)
    o.append(cr)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs + cd)
    ann = [top('CRUX · RA 12H 30M · DEC −60° · SMALLEST CONSTELLATION')]
    for n, dx_, dy_, anc in [('ACRUX', 18, 24, 'start'), ('MIMOSA', -18, -14, 'end'), ('GACRUX', 18, -12, 'start'), ('DELTA', 16, 20, 'start')]:
        x, y, _, _ = pos[n]
        ann.append('<text x="%s" y="%s" text-anchor="%s" fill="rgba(245,241,232,.6)" style="%s">%s</text>' % (f(x + dx_), f(y + dy_), anc, LBL, n))
    ann.append(label((cx_, cy_), (22, 600), ['COALSACK', 'DARK NEBULA · 600 LY']))
    ann.append(label((jx, jy), (22, 180), ['NGC 4755', 'THE JEWEL BOX']))
    return bg, obj, svg(W, H, ''.join(ann))


TRI = [('VEGA', hms(18, 36, 56.3), dms(38, 47, 1), .03, 'b'), ('DENEB', hms(20, 41, 25.9), dms(45, 16, 49), 1.25, 'w'),
       ('ALTAIR', hms(19, 50, 47.0), dms(8, 52, 6), .77, 'w'),
       ('SADR', hms(20, 22, 13.7), dms(40, 15, 24), 2.23, 'y'), ('GIENAH', hms(20, 46, 12.7), dms(33, 58, 13), 2.48, 'o'),
       ('DELTA-CYG', hms(19, 44, 58.5), dms(45, 7, 51), 2.87, 'w'), ('ALBIREO', hms(19, 30, 43.3), dms(27, 57, 35), 3.05, 'o'),
       ('ETA-CYG', hms(19, 56, 18.4), dms(35, 5, 0), 3.89, 'o'),
       ('SHELIAK', hms(18, 50, 4.8), dms(33, 21, 46), 3.5, 'w'), ('SULAFAT', hms(18, 58, 56.6), dms(32, 41, 22), 3.25, 'w'),
       ('ZETA-LYR', hms(18, 44, 46.3), dms(37, 36, 18), 4.3, 'w'), ('DELTA-LYR', hms(18, 54, 30.3), dms(36, 53, 55), 4.3, 'o'), ('EPS-LYR', hms(18, 44, 20.3), dms(39, 40, 12), 4.6, 'w'),
       ('TARAZED', hms(19, 46, 15.6), dms(10, 36, 48), 2.72, 'o'), ('ALSHAIN', hms(19, 55, 18.8), dms(6, 24, 24), 3.71, 'y'),
       ('DELTA-AQL', hms(19, 25, 29.9), dms(3, 6, 53), 3.36, 'w'), ('ZETA-AQL', hms(19, 5, 24.6), dms(13, 51, 48), 2.99, 'w'), ('LAMBDA-AQL', hms(19, 6, 14.9), -dms(4, 52, 57), 3.43, 'b'),
       ('SAGITTA', hms(19, 58, 45.4), dms(19, 29, 32), 3.47, 'o'), ('NAN', hms(20, 59, 0), dms(44, 20, 0), 9, 'w')]


def summer_triangle(u):
    """Vega, Deneb and Altair: three bright stars in three constellations, and the summer Milky Way flowing between them, split by the dark Great Rift."""
    rnd = random.Random(1781)
    pos = chart(TRI, 19.65, 27.5, 298, 392, 8.2, -60)
    sd = base(u, 'bg', [(0, '#141626'), (.55, '#0a0b16'), (1, '#030308')], '.45', '.85')
    dx, dy = pos['DENEB'][0], pos['DENEB'][1]
    ax, ay = pos['ALTAIR'][0], pos['ALTAIR'][1]
    # the band runs from Cygnus at the upper left down through Aquila, past Altair's west side
    vx, vy = pos['VEGA'][0], pos['VEGA'][1]
    L = math.hypot(vx - ax, vy - ay)
    qx, qy = ax + (vx - ax) / L * 9 * 8.2, ay + (vy - ay) / L * 9 * 8.2
    p0 = (dx - .9 * (qx - dx), dy - .9 * (qy - dy)); p1 = (qx + .9 * (qx - dx), qy + .9 * (qy - dy))
    ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    mdefs, mw = milky_way(u, rnd, p0, p1, 300, ['#8a7e6c', '#6e6458', '#9c8c74', '#5a5060', '#7a6e64'], seed=71, dens=.7, lanes=12,
                          neb=[(pos['NAN'][0], pos['NAN'][1], 22, '#c0404a', .45), (dx - 30, dy + 40, 30, '#a8384a', .2)])
    # the Great Rift: a long dark lane down the band's middle, from Deneb toward Aquila
    rift = []
    for i in range(26):
        t = i / 25
        x = dx + 14 + (p1[0] - dx) * t * .9 + rnd.gauss(0, 6); y = dy + 8 + (p1[1] - dy) * t * .9 + rnd.gauss(0, 6)
        rift.append('<path d="%s" fill="#040306" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            blob(x, y, rnd.uniform(26, 50), rnd.uniform(6, 16) * (1 + .5 * math.sin(t * 6)), rnd, 12, .4), f(rnd.uniform(.5, .8)), f(math.degrees(ang) + rnd.uniform(-15, 15)), f(x), f(y)))
    bg = plate_sky(u, 'bg', mw + '<g filter="url(#%smwl)">%s</g>' % (u, ''.join(rift)) + field(rnd, 300, (0, 0, W, H), ['#ffffff', '#fff1dc', '#ffe0b8', '#dfe8ff'], .3, 1.3), sd + mdefs)
    defs = const_defs(u)
    o = []
    gap = lambda m: 10 + max(0, 3.6 - m) * 7
    o.append(figure(pos, [('VEGA', 'DENEB'), ('DENEB', 'ALTAIR'), ('ALTAIR', 'VEGA')], gap, '#f4e8cc', .5, .9))
    # the three host figures, faint: the Swan, the Lyre, the Eagle
    host = [('DENEB', 'SADR'), ('SADR', 'ETA-CYG'), ('ETA-CYG', 'ALBIREO'), ('SADR', 'GIENAH'), ('SADR', 'DELTA-CYG'),
            ('VEGA', 'ZETA-LYR'), ('ZETA-LYR', 'SHELIAK'), ('SHELIAK', 'SULAFAT'), ('SULAFAT', 'DELTA-LYR'), ('DELTA-LYR', 'ZETA-LYR'), ('VEGA', 'EPS-LYR'),
            ('ALTAIR', 'TARAZED'), ('ALTAIR', 'ALSHAIN'), ('ALTAIR', 'DELTA-AQL'), ('DELTA-AQL', 'LAMBDA-AQL'), ('TARAZED', 'ZETA-AQL')]
    o.append(figure(pos, host, lambda m: 6 + max(0, 3.6 - m) * 6, '#c8d4f0', .16, .6))
    o.append(lesser(pos, ['SADR', 'GIENAH', 'DELTA-CYG', 'ETA-CYG', 'SHELIAK', 'SULAFAT', 'ZETA-LYR', 'DELTA-LYR', 'EPS-LYR', 'TARAZED', 'ALSHAIN', 'DELTA-AQL', 'ZETA-AQL', 'LAMBDA-AQL', 'SAGITTA']))
    # Albireo, gold and blue together
    alx, aly = pos['ALBIREO'][0], pos['ALBIREO'][1]
    o.append(pinstar(alx, aly, 1.6, '#ffc070') + pinstar(alx + 3.5, aly + 2, 1, '#8ab4ff'))
    o.append(plate_stars(u, pos, {'VEGA', 'DENEB', 'ALTAIR'}, 1.1))
    cr, cd = calm(u, 600, .5)
    o.append(cr)
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs + cd)
    ann = [top('LYRA · CYGNUS · AQUILA · RA 18H 37M–20H 41M')]
    for n, dx_, dy_, anc in [('VEGA', 18, -12, 'start'), ('DENEB', -18, -14, 'end'), ('ALTAIR', 18, 22, 'start')]:
        x, y, _, _ = pos[n]
        ann.append('<text x="%s" y="%s" text-anchor="%s" fill="rgba(245,241,232,.6)" style="%s">%s</text>' % (f(x + dx_), f(y + dy_), anc, LBL, n))
    ann.append(label((alx, aly), (560, 380), ['ALBIREO', 'GOLD + BLUE DOUBLE'], 'end'))
    ann.append(label((dx + 20, dy + 60), (22, 600), ['GREAT RIFT', 'DUST ACROSS THE MILKY WAY']))
    return bg, obj, svg(W, H, ''.join(ann))


PLATES = {'CHICXULUB': chicxulub, 'TUNGUSKA': tunguska, 'SL9': sl9, 'TITAN': titan,
          'BIG-DIPPER': big_dipper, 'ORION': orion, 'SOUTHERN-CROSS': southern_cross, 'SUMMER-TRIANGLE': summer_triangle}

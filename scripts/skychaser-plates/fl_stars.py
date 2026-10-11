"""First Light, the stars and their worlds: sixteen full-art plates at 582 × 832.

Same stack as every plate: a sky layer (the field, the Milky Way, the dust),
an object layer with grain (the star, its nebula, its planets), and a quiet
survey layer. Each star is drawn in its own setting and optics, so no two read
as the same dot with spikes.
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL, label, scalebar
from more import top, W, HF

H = HF


# ----------------------------------------------------------------- defs
def blur(u, n, sd, pad=40):
    return '<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feGaussianBlur stdDeviation="%s"/></filter>' % (u, n, pad, pad, 100 + 2 * pad, 100 + 2 * pad, f(sd))


def stops(st):
    return ''.join('<stop offset="%s" stop-color="%s" stop-opacity="%s"/>' % (f(o) if not isinstance(o, str) else o, c, f(a)) for o, c, a in st)


def rg(u, n, st, cx='.5', cy='.5', r='.5', extra=''):
    return '<radialGradient id="%s%s" cx="%s" cy="%s" r="%s"%s>%s</radialGradient>' % (u, n, cx, cy, r, extra, stops(st))


def lg(u, n, st, x1=0, y1=0, x2=0, y2=1, extra=''):
    return '<linearGradient id="%s%s" x1="%s" y1="%s" x2="%s" y2="%s"%s>%s</linearGradient>' % (u, n, f(x1), f(y1), f(x2), f(y2), extra, stops(st))


def noise(u, n, freq, octv, seed, alpha=None, rgb=None, kind='fractalNoise'):
    """A turbulence texture. alpha=(k, b) turns the red channel into coverage (a = k·R + b) in colour rgb."""
    if alpha is None:
        mx = '<feColorMatrix type="saturate" values="0"/>'
    else:
        r, g, b = rgb or (1, 1, 1)
        mx = '<feColorMatrix type="matrix" values="0 0 0 0 %s  0 0 0 0 %s  0 0 0 0 %s  %s 0 0 0 %s"/>' % (f(r), f(g), f(b), f(alpha[0]), f(alpha[1]))
    return ('<filter id="%s%s" x="0" y="0" width="100%%" height="100%%" color-interpolation-filters="sRGB"><feTurbulence type="%s" baseFrequency="%s" numOctaves="%d" seed="%d"/>%s</filter>'
            % (u, n, kind, freq, octv, seed, mx))


def cloud(u, n, freq, octv, seed, disp, sd, k=2.6, b=-.7, pad=60):
    """Displaces a soft shape, blurs it, then eats it with a turbulence mask: a painterly, mottled cloud."""
    return ('<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%" color-interpolation-filters="sRGB">'
            '<feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d" result="t"/>'
            '<feDisplacementMap in="SourceGraphic" in2="t" scale="%s" xChannelSelector="R" yChannelSelector="G" result="d"/>'
            '<feGaussianBlur in="d" stdDeviation="%s" result="s"/>'
            '<feColorMatrix in="t" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  %s 0 0 0 %s" result="m"/>'
            '<feComposite in="s" in2="m" operator="in"/></filter>') % (u, n, pad, pad, 100 + 2 * pad, 100 + 2 * pad, freq, octv, seed, f(disp), f(sd), f(k), f(b))


def warp(u, n, freq, octv, seed, disp, sd=0, pad=40):
    bl = '<feGaussianBlur stdDeviation="%s"/>' % f(sd) if sd else ''
    return ('<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d"/>'
            '<feDisplacementMap in="SourceGraphic" scale="%s" xChannelSelector="R" yChannelSelector="G"/>%s</filter>') % (u, n, pad, pad, 100 + 2 * pad, 100 + 2 * pad, freq, octv, seed, f(disp), bl)


def dust_stars(u, n, seed, thresh=.66, clump=.9, lo='.011', col=(1, .97, .92), gain=9):
    """Thousands of unresolved stars from one filter: fine noise thresholded to points, the threshold swayed by a slow noise so they clump into star clouds."""
    r, g, b = col
    return ('<filter id="%s%s" x="0" y="0" width="100%%" height="100%%" color-interpolation-filters="sRGB">'
            '<feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="1" seed="%d" result="hi"/>'
            '<feColorMatrix in="hi" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="h"/>'
            '<feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="3" seed="%d" result="lo"/>'
            '<feColorMatrix in="lo" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="l"/>'
            '<feComposite in="h" in2="l" operator="arithmetic" k2="1" k3="%s" k4="%s" result="m"/>'
            '<feColorMatrix in="m" type="matrix" values="0 0 0 0 %s  0 0 0 0 %s  0 0 0 0 %s  %s 0 0 0 %s"/></filter>') % (
        u, n, seed, lo, seed + 7, f(clump * .5), f(-clump * .25), f(r), f(g), f(b), f(gain), f(-gain * thresh))


# ----------------------------------------------------------------- stars
def spike_grad(u, k, col, soft=.14):
    return lg(u, 'sk' + k, [(0, col, 0), (.3, col, soft * .5), (.44, col, soft * 2.2), (.49, '#ffffff', .9), (.5, '#ffffff', 1), (.51, '#ffffff', .9),
                            (.56, col, soft * 2.2), (.7, col, soft * .5), (1, col, 0)], 0, 0, 1, 0)


def spikes(u, k, x, y, L, w, angles=(0, 90), op=1, filt=''):
    fl = ' filter="url(#%s%s)"' % (u, filt) if filt else ''
    return ''.join('<path d="M%s 0L0 %sL%s 0L0 %sZ" fill="url(#%ssk%s)" opacity="%s" transform="translate(%s %s) rotate(%s)"%s/>' % (
        f(-L), f(-w), f(L), f(w), u, k, f(op), f(x), f(y), f(a), fl) for a in angles)


def glow(x, y, r, grad, op=1):
    return '<circle cx="%s" cy="%s" r="%s" fill="url(#%s)" opacity="%s"/>' % (f(x), f(y), f(r), grad, f(op))


def halo_grad(u, n, col, core='#ffffff', k=1):
    """A star's bloom: a white core, a tinted shoulder, a long faint skirt."""
    return rg(u, n, [(0, core, 1), (.05 * k, core, .95), (.12 * k, col, .6), (.25 * k, col, .22), (.5, col, .07), (1, col, 0)])


def core_grad(u, n='cr', col='#ffffff'):
    return rg(u, n, [(0, '#ffffff', 1), (.22, '#ffffff', 1), (.42, col, .7), (.7, col, .2), (1, col, 0)])


def core(u, x, y, r, n='cr', op=1):
    """A burnt-out centre with a soft shoulder, not a disc with an edge."""
    return '<circle cx="%s" cy="%s" r="%s" fill="url(#%s%s)" opacity="%s"/>' % (f(x), f(y), f(r), u, n, f(op))


def pinstar(x, y, r, col, op=1, halo=3.2):
    return ('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/><circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/><circle cx="%s" cy="%s" r="%s" fill="#fff" opacity="%s"/>' % (
        f(x), f(y), f(r * halo), col, f(.06 * op), f(x), f(y), f(r * 1.8), col, f(.18 * op), f(x), f(y), f(r), f(op)))


def field(rnd, n, box, tints, rmin=.3, rmax=1.5, pw=3.4, op=(.3, 1)):
    x0, y0, x1, y1 = box
    out = []
    for _ in range(n):
        m = rnd.random() ** pw
        out.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (
            f(rnd.uniform(x0, x1)), f(rnd.uniform(y0, y1)), f(rmin + (rmax - rmin) * m), rnd.choice(tints), f(op[0] + (op[1] - op[0]) * rnd.random() ** .6)))
    return ''.join(out)


def base(u, n, st, cy='.45', r='.8'):
    return rg(u, n, [(o, c, 1) for o, c in st], '.5', cy, r)


def plate_sky(u, grad, inner, defs=''):
    return svg(W, H, '<rect width="%d" height="%d" fill="url(#%s%s)"/>' % (W, H, u, grad) + inner, defs)


def band_pts(x0, y0, x1, y1, t):
    return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t


def milky_way(u, rnd, p0, p1, width, glow_cols, dust=True, seed=1, dens=.64, lanes=18, lane_col='#050409', lane_op=(.5, .85), star_col=(1, .96, .9), neb=()):
    """A band of star clouds from p0 to p1: soft glow, a filter-drawn swarm of faint stars, and dark lanes of dust across it."""
    ang = math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    defs = (blur(u, 'mwb', 26, 60) + blur(u, 'mwm', 34, 80) + dust_stars(u, 'mws', seed, dens, clump=.45, lo='.012', gain=7) + dust_stars(u, 'mwt', seed + 3, dens + .03, clump=.35, lo='.02', col=(.85, .9, 1), gain=6) +
            cloud(u, 'mwc', '.009', 4, seed + 11, 60, 16, 3, -.9) + warp(u, 'mwl', '.018', 4, seed + 5, 70, 3.5) +
            noise(u, 'mwn', '.006', 4, seed + 2, (2.4, -.9), (0, 0, 0)))
    mask = '<mask id="%smwk" x="0" y="0" width="%d" height="%d" maskUnits="userSpaceOnUse"><g filter="url(#%smwm)"><ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#fff" transform="rotate(%s %s %s)"/>%s</g></mask>' % (
        u, W, H, u, f(mx), f(my), f(L / 2), f(width * .5), f(ang), f(mx), f(my),
        ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#fff" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(x), f(y), f(rnd.uniform(40, 110)), f(rnd.uniform(24, 60)), f(rnd.uniform(.5, 1)), f(ang + rnd.uniform(-20, 20)), f(x), f(y))
            for x, y in (band_pts(*p0, *p1, rnd.uniform(.05, .95)) for _ in range(10))))
    defs += mask
    out = []
    # glow of the unresolved clouds
    gl = []
    for _ in range(22):
        t = rnd.uniform(0, 1); x, y = band_pts(*p0, *p1, t)
        off = rnd.gauss(0, width * .22)
        x += off * -math.sin(math.radians(ang)); y += off * math.cos(math.radians(ang))
        gl.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(x), f(y), f(rnd.uniform(60, 150)), f(rnd.uniform(26, width * .45)), rnd.choice(glow_cols), f(rnd.uniform(.18, .42)), f(ang + rnd.uniform(-15, 15)), f(x), f(y)))
    out.append('<g filter="url(#%smwc)">%s</g>' % (u, ''.join(gl)))
    for x, y, r, c, op in neb:
        out.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s" filter="url(#%smwc)"/>' % (f(x), f(y), f(r), c, f(op), u))
    bs = []
    for _ in range(int(L * 1.3)):
        t = rnd.random(); x, y = band_pts(*p0, *p1, t); off = rnd.gauss(0, width * .2)
        x += off * -math.sin(math.radians(ang)); y += off * math.cos(math.radians(ang))
        m = rnd.random() ** 4
        bs.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(.35 + 1.1 * m), rnd.choice(['#ffffff', '#fff4e0', '#ffe8c8', '#e0e8ff']), f(.35 + .6 * rnd.random())))
    out.append('<g mask="url(#%smwk)"><rect width="%d" height="%d" filter="url(#%smws)"/><rect width="%d" height="%d" filter="url(#%smwt)" opacity=".7"/></g>' % (u, W, H, u, W, H, u) + ''.join(bs))
    if dust:
        ln = []
        for _ in range(lanes):
            t = rnd.uniform(-.05, 1.05); x, y = band_pts(*p0, *p1, t)
            off = rnd.gauss(0, width * .16)
            x += off * -math.sin(math.radians(ang)); y += off * math.cos(math.radians(ang))
            ln.append('<path d="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
                blob(x, y, rnd.uniform(30, 110), rnd.uniform(6, 22), rnd, 12, .45), lane_col, f(rnd.uniform(*lane_op)), f(ang + rnd.uniform(-25, 25)), f(x), f(y)))
        out.append('<g filter="url(#%smwl)">%s</g>' % (u, ''.join(ln)))
    return defs, ''.join(out)


def conifer(rnd, x, y, h, w):
    """A spruce in silhouette: ragged tiers of branches narrowing to a spire."""
    n = max(5, int(h / 9))
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        yy = y - h * t
        hw = w / 2 * (1 - t) ** .9 * rnd.uniform(.75, 1.15)
        droop = h / n * .45
        left.append((x - hw, yy)); left.append((x - hw * .45, yy - droop))
        right.append((x + hw * rnd.uniform(.8, 1.1), yy)); right.append((x + hw * .45, yy - droop))
    pts = [(x - 1.2, y)] + left + [(x, y - h - rnd.uniform(3, 8))] + right[::-1] + [(x + 1.2, y)]
    return 'M' + 'L'.join('%s %s' % (f(a), f(b)) for a, b in pts) + 'Z'


def treeline(rnd, y0, fill, hmin, hmax, wave=12):
    d = ['M-10 %dL-10 %s' % (H, f(y0))]
    x = -14
    trees = []
    while x < W + 20:
        base_y = y0 + wave * math.sin(x / 83) + wave * .5 * math.sin(x / 31)
        h = hmin + (hmax - hmin) * rnd.random() ** 1.8
        trees.append(conifer(rnd, x, base_y + 4, h, h * rnd.uniform(.28, .42)))
        d.append('L%s %s' % (f(x), f(base_y)))
        x += rnd.uniform(5, 14)
    d.append('L%d %s L%d %dZ' % (W + 10, f(y0), W + 10, H))
    return '<g fill="%s"><path d="%s"/>%s</g>' % (fill, ''.join(d), ''.join('<path d="%s"/>' % t for t in trees))


# ================================================================= ALPHA CENTAURI
def alpha_cen(u):
    """The nearest suns: A and B blazing together, Proxima a small red coal apart, all against the crowded star clouds of the southern Milky Way."""
    rnd = random.Random(4243)
    ax, ay, bx, by = 262, 334, 312, 312
    px, py = 470, 508
    sd = base(u, 'bg', [(0, '#1a1822'), (.55, '#0c0b12'), (1, '#040308')], '.45', '.85')
    mdefs, mw = milky_way(u, rnd, (-80, 700), (680, 90), 330, ['#8a7a64', '#6e604e', '#a08c70', '#5a4c50', '#7a6a5a'], seed=43, dens=.73, lanes=26,
                          neb=[(500, 160, 40, '#b0404a', .35), (92, 598, 34, '#a8384a', .3), (380, 200, 22, '#b84a52', .3)])
    # the Coalsack, a dark cloud off the band's edge near Crux
    coal = '<g filter="url(#%smwl)" opacity=".8">%s</g>' % (u, ''.join('<path d="%s" fill="#030206" opacity="%s"/>' % (blob(92 + rnd.uniform(-30, 30), 330 + rnd.uniform(-30, 30), rnd.uniform(30, 60), rnd.uniform(26, 50), rnd, 12, .3), f(rnd.uniform(.3, .5))) for _ in range(7)))
    bg = plate_sky(u, 'bg', mw + coal + field(rnd, 260, (0, 0, W, H), ['#ffffff', '#fff1dc', '#ffe0b8', '#dfe8ff'], .3, 1.5),
                   sd + mdefs + blur(u, 'b1', .8))
    defs = (halo_grad(u, 'ha', '#fff0cc', k=1) + halo_grad(u, 'hb', '#ffd7a4', k=1.1) + halo_grad(u, 'hp', '#ff5a36', '#ffc8b0') +
            spike_grad(u, 'a', '#fff0cc', .2) + spike_grad(u, 'b', '#ffd6a0', .2) + spike_grad(u, 'p', '#ff6a48') + blur(u, 'b1', 1) + blur(u, 'b3', 3) + core_grad(u, 'cr', '#fff2d4') +
            rg(u, 'warm', [(0, '#ffe8c0', .32), (.4, '#ffd8a0', .1), (1, '#ffd8a0', 0)]))
    o = [glow((ax + bx) / 2, (ay + by) / 2, 300, u + 'warm'),
         # soft spikes first, then crisp ones on top
         spikes(u, 'a', ax, ay, 300, 5, op=.35, filt='b3'), spikes(u, 'b', bx, by, 220, 4, op=.3, filt='b3'),
         spikes(u, 'a', ax, ay, 290, 2.2), spikes(u, 'b', bx, by, 210, 1.7),
         spikes(u, 'a', ax, ay, 70, .8, (45, 135), .35), spikes(u, 'b', bx, by, 50, .6, (45, 135), .3),
         glow(ax, ay, 150, u + 'ha'), glow(bx, by, 104, u + 'hb'),
         core(u, ax, ay, 13), core(u, bx, by, 9.5),
         # Proxima: a faint red dwarf, 13,000 AU out
         glow(px, py, 34, u + 'hp', .9), spikes(u, 'p', px, py, 22, .6, op=.7), '<circle cx="%s" cy="%s" r="1.9" fill="#ffd2c0"/>' % (f(px), f(py))]
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 14H 39M 36S · DEC −60° 50′ · CENTAURUS · 4.37 LY'),
           label((px, py), (560, 560), ['PROXIMA', 'M5.5V · 4.24 LY'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= SIRIUS
def sirius(u):
    """The Dog Star low over a winter treeline: blue-white fire, long spikes, the air splitting it into colour, and the white dwarf in its glare."""
    rnd = random.Random(1862)
    cx, cy = 291, 322
    bx, by = cx + 52, cy - 40
    sd = (base(u, 'bg', [(0, '#172652'), (.5, '#0a1430'), (1, '#03060f')], '.4', '.9') +
          lg(u, 'hz', [(0, '#1c2c5a', 0), (.6, '#2a3a66', .35), (1, '#6a5a6e', .7)], 0, 0, 0, 1))
    bg = plate_sky(u, 'bg', starfield(W, H, 230, 18, 0, ('#ffffff', '#dfe8ff', '#cfe0ff', '#fff1dc'), u) +
                   '<rect y="520" width="%d" height="%d" fill="url(#%shz)"/>' % (W, H - 520, u), sd + SPIKE_DEFS.format(u=u))
    hues = ['#ff3a5a', '#ff8a2a', '#ffe040', '#6aff8a', '#2ad8ff', '#4a6aff', '#b04aff']
    defs = (halo_grad(u, 'h', '#a8c8ff', k=.8) + rg(u, 'sky', [(0, '#8fb4ff', .28), (.35, '#6a90ff', .08), (1, '#6a90ff', 0)]) +
            spike_grad(u, 'w', '#cfe0ff', .18) + spike_grad(u, 'r', '#ff4a6a', .12) + spike_grad(u, 'bl', '#3a8aff', .12) + spike_grad(u, 'b', '#e8eeff') +
            rg(u, 'hr', [(0, '#ff6a8a', .5), (.3, '#ff6a8a', .12), (1, '#ff6a8a', 0)]) + rg(u, 'hbl', [(0, '#5aa0ff', .6), (.3, '#5aa0ff', .14), (1, '#5aa0ff', 0)]) +
            halo_grad(u, 'hB', '#e8eeff') + blur(u, 'b1', 1.1) + blur(u, 'b2', 2.2) + blur(u, 'b5', 5) +
            lg(u, 'tree', [(0, '#05080f', 1), (1, '#010204', 1)], 0, 0, 0, 1))
    o = [glow(cx, cy, 420, u + 'sky')]
    # atmospheric dispersion: blue lifted, red dropped, low in the sky
    o.append(glow(cx, cy - 4, 70, u + 'hbl') + glow(cx, cy + 5, 64, u + 'hr'))
    # the long spikes, each a white core with a red and blue fringe that don't quite agree on length
    o.append('<g style="mix-blend-mode: screen">%s%s%s</g>' % (spikes(u, 'r', cx, cy + 1.5, 330, 3, op=.55, filt='b2'), spikes(u, 'bl', cx, cy - 1.5, 300, 3, op=.6, filt='b2'),
                                                              spikes(u, 'w', cx, cy, 360, 9, op=.3, filt='b5')))
    o.append(spikes(u, 'w', cx, cy, 340, 2.2))
    o.append(spikes(u, 'w', cx, cy, 120, 1, (45, 135), .4))
    # scintillation: flecks of pure colour thrown off as the air boils
    fl = []
    for i in range(170):
        a = rnd.uniform(0, 2 * math.pi); r0 = 12 + 70 * rnd.random() ** 1.6; L = rnd.uniform(2, 9) * (1 + r0 / 50)
        c = hues[int((r0 / 82) * 7 + rnd.uniform(-1, 1)) % 7]
        fl.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(cx + r0 * math.cos(a)), f(cy + r0 * math.sin(a)), f(cx + (r0 + L) * math.cos(a)), f(cy + (r0 + L) * math.sin(a)), c, f(rnd.uniform(.25, .75)), f(rnd.uniform(.8, 2.4))))
    o.append('<g filter="url(#%sb1)" style="mix-blend-mode: screen">%s</g>' % (u, ''.join(fl)))
    # a prismatic ring where the halo breaks up
    for i, c in enumerate(hues):
        o.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="%s" stroke-opacity=".09" stroke-width="3" filter="url(#%sb2)"/>' % (cx, cy, f(96 + i * 3.2), c, u))
    o.append(glow(cx, cy, 130, u + 'h'))
    o.append('<circle cx="%d" cy="%d" r="11" fill="#fff" filter="url(#%sb2)"/><circle cx="%d" cy="%d" r="7.5" fill="#fff"/>' % (cx, cy, u, cx, cy))
    # Sirius B: ten thousand times fainter, a white point barely clear of the glare
    o.append(glow(bx, by, 11, u + 'hB', .9) + spikes(u, 'b', bx, by, 11, .45, op=.8) + '<circle cx="%s" cy="%s" r="1.5" fill="#fff"/>' % (f(bx), f(by)))
    # the treeline, black against the glow of the horizon
    o.append(treeline(rnd, 704, '#02040a', 20, 120))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 06H 45M 09S · DEC −16° 43′ · CANIS MAJOR · MAG −1.46'),
           label((bx, by), (560, 170), ['SIRIUS B', 'WHITE DWARF · EARTH-SIZED'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= VEGA
def vega(u):
    """Vega from above its pole: a blue-white star inside a wide, smooth, face-on disc of dust a hundred AU across — the first debris disc ever found."""
    rnd = random.Random(1983)
    cx, cy = 291, 330
    sd = base(u, 'bg', [(0, '#1a1a3a'), (.5, '#0c0c22'), (1, '#04040d')], '.45', '.85')
    bg = plate_sky(u, 'bg', starfield(W, H, 280, 1983, 0, ('#ffffff', '#dfe8ff', '#e8e0ff', '#fff1dc'), u), sd + SPIKE_DEFS.format(u=u))
    R0, R1 = 92, 256
    disc_st = [(0, '#ffe0a0', .0), (.12, '#ffd89a', .1), (.3, '#ffc878', .26), (.44, '#f8b060', .4), (.5, '#e89850', .32), (.55, '#f0a458', .4), (.66, '#e08840', .36),
               (.78, '#c0602e', .2), (.9, '#8a3a24', .07), (1, '#5a2418', 0)]
    defs = (rg(u, 'disc', disc_st) + rg(u, 'discm', [(o, '#fff', min(1, a * 2.6)) for o, c, a in disc_st]) + rg(u, 'inner', [(0, '#fff8e8', .5), (.4, '#ffe8c0', .3), (.7, '#ffd8a0', .12), (1, '#ffc8a0', 0)]) +
            cloud(u, 'dc', '.03', 4, 19, 24, 5, 2.6, -.6) + noise(u, 'dn', '.05', 3, 7, (2.4, -.55), (.12, .1, .14)) + blur(u, 'b1', .9) + blur(u, 'b3', 3) + blur(u, 'b8', 8) +
            halo_grad(u, 'h', '#b8d0ff', k=.9) + spike_grad(u, 'w', '#cfe0ff', .16) + rg(u, 'hz', [(0, '#9ab8ff', .22), (.5, '#9ab8ff', .05), (1, '#9ab8ff', 0)]) +
            '<mask id="%sring" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><circle cx="%d" cy="%d" r="%d" fill="url(#%sdiscm)"/></mask>' % (u, W, H, cx, cy, R1, u))
    o = [glow(cx, cy, 360, u + 'hz')]
    # the disc: smooth, a faint dip part-way out, dimming slowly to its ragged edge
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sdisc)"/>' % (cx, cy, R1, u))
    # texture: soft clumps of dust, a hint of spiral wake, all in light — the disc is smooth, so it stays quiet
    cl = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (
        blob(cx + r * math.cos(a), cy + r * math.sin(a), rnd.uniform(20, 46), rnd.uniform(12, 26), rnd, 10, .4), rnd.choice(['#ffd8a0', '#f8b878', '#e89860']), f(rnd.uniform(.06, .16)))
        for r, a in ((rnd.gauss(150, 40), rnd.uniform(0, 2 * math.pi)) for _ in range(46)))
    o.append('<g filter="url(#%sdc)" mask="url(#%sring)">%s</g>' % (u, u, cl))
    grains = ''.join('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (
        f(cx + r * math.cos(a)), f(cy + r * math.sin(a)), f(rnd.uniform(.3, .9)), rnd.choice(['#ffe6c0', '#ffd0a0', '#f8c090']), f(rnd.uniform(.1, .3)))
        for r, a in ((rnd.gauss(170, 40), rnd.uniform(0, 2 * math.pi)) for _ in range(500)))
    o.append('<g mask="url(#%sring)">%s</g>' % (u, grains))
    wisps = ''.join('<path d="M%s %sA%s %s 0 0 1 %s %s" fill="none" stroke="#ffd8a8" stroke-opacity="%s" stroke-width="%s"/>' % (
        f(cx + r * math.cos(a0)), f(cy + r * math.sin(a0)), f(r), f(r), f(cx + r * math.cos(a0 + L)), f(cy + r * math.sin(a0 + L)), f(rnd.uniform(.04, .1)), f(rnd.uniform(4, 12)))
        for r, a0, L in ((rnd.gauss(168, 26), rnd.uniform(0, 6.3), rnd.uniform(.4, 1.2)) for _ in range(30)))
    o.append('<g filter="url(#%sb8)" mask="url(#%sring)">%s</g>' % (u, u, wisps))
    # the warm inner belt, hot dust close in
    o.append('<circle cx="%d" cy="%d" r="44" fill="url(#%sinner)" filter="url(#%sb3)"/>' % (cx, cy, u, u))
    # the star, through a segmented mirror: six long spikes and two short
    o.append(spikes(u, 'w', cx, cy, 190, 6, (30, 90, 150), .25, 'b3') + spikes(u, 'w', cx, cy, 180, 1.5, (30, 90, 150)) + spikes(u, 'w', cx, cy, 70, 1, (0,), .6))
    o.append(glow(cx, cy, 120, u + 'h') + '<circle cx="%d" cy="%d" r="9" fill="#fff" filter="url(#%sb3)"/><circle cx="%d" cy="%d" r="6" fill="#fff"/>' % (cx, cy, u, cx, cy))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 18H 36M 56S · DEC +38° 47′ · LYRA · 25 LY'), scalebar(22, 800, (R1 - R0) * 100 / 150, '100 AU')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= ARCTURUS
def arcturus(u):
    """The bear-guard: a swollen orange giant, soft amber bloom, alone in the thin star field far from the Milky Way, where faint galaxies show through."""
    rnd = random.Random(1933)
    cx, cy = 291, 326
    sd = base(u, 'bg', [(0, '#1e140e'), (.5, '#0d0907'), (1, '#040304')], '.42', '.85')
    gal = []
    for _ in range(9):
        x, y = rnd.uniform(30, 552), rnd.uniform(110, 780)
        if math.hypot(x - cx, y - cy) < 170: continue
        a = rnd.uniform(0, 180); s = rnd.uniform(2.4, 6)
        gal.append('<g transform="translate(%s %s) rotate(%s)"><ellipse rx="%s" ry="%s" fill="#e8dcc8" opacity=".18" filter="url(#%sb1)"/><ellipse rx="%s" ry="%s" fill="#fff2dc" opacity=".45"/></g>' % (
            f(x), f(y), f(a), f(s), f(s * rnd.uniform(.3, .7)), u, f(s * .3), f(s * .2)))
    bg = plate_sky(u, 'bg', starfield(W, H, 150, 1933, 0, ('#ffffff', '#fff1dc', '#ffe6c4', '#dfe8ff'), u) + ''.join(gal), sd + SPIKE_DEFS.format(u=u) + blur(u, 'b1', 1.2))
    defs = (rg(u, 'bloom', [(0, '#fff2d8', 1), (.03, '#ffe2b0', .95), (.08, '#ffb45a', .6), (.18, '#ff9a40', .26), (.4, '#e8762a', .08), (1, '#c8601a', 0)]) +
            rg(u, 'veil', [(0, '#ffb060', .22), (.5, '#ff9040', .06), (1, '#ff9040', 0)]) +
            rg(u, 'cir', [(0, '#ffd9a0', .9), (.25, '#f0a860', .5), (.6, '#8a6a58', .22), (1, '#4a4050', .12)], str(cx), str(cy), '420', ' gradientUnits="userSpaceOnUse"') +
            cloud(u, 'cc', '.012 .05', 4, 33, 40, 3, 3, -1.1) + warp(u, 'cw', '.02 .08', 3, 5, 18, 1.6) +
            spike_grad(u, 'a', '#ffc080', .15) + blur(u, 'b2', 2) + blur(u, 'b6', 6) + blur(u, 'b14', 14) + core_grad(u, 'cr', '#ffe0b0'))
    o = [glow(cx, cy, 480, u + 'veil'), glow(cx, cy, 380, u + 'bloom'), glow(cx, cy, 140, u + 'bloom', .8)]
    # a corona in thin high cloud: the bluish aureole, then brown-red, then faint green and rose
    for r, c, op, w in [(40, '#dfe4ff', .08, 16), (66, '#b8542a', .1, 16), (86, '#6fae7a', .04, 14), (104, '#d05a7a', .05, 16), (140, '#6aa08a', .025, 18), (160, '#c0506a', .03, 20)]:
        o.append('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" filter="url(#%sb14)"/>' % (cx, cy, r, c, f(op), f(w), u))
    # cirrus drifting across, lit amber where it passes the star
    ci = []
    for _ in range(26):
        x = rnd.uniform(-60, 640); y = rnd.uniform(200, 700)
        ci.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(x), f(y), f(rnd.uniform(90, 240)), f(rnd.uniform(4, 16)), f(rnd.uniform(.25, .7)), f(-14 + rnd.uniform(-6, 6)), f(x), f(y)))
    o.append('<g fill="url(#%scir)" filter="url(#%scc)">%s</g>' % (u, u, ''.join(ci)))
    fib = ''.join('<path d="M%s %sq%s %s %s %s" fill="none" stroke="url(#%scir)" stroke-width="%s" stroke-opacity="%s"/>' % (
        f(x), f(y), f(rnd.uniform(60, 120)), f(rnd.uniform(-30, -6)), f(rnd.uniform(160, 300)), f(rnd.uniform(-70, -30)), u, f(rnd.uniform(.6, 2)), f(rnd.uniform(.12, .4)))
        for x, y in ((rnd.uniform(-80, 520), rnd.uniform(260, 700)) for _ in range(40)))
    o.append('<g filter="url(#%scw)">%s</g>' % (u, fib))
    o.append(spikes(u, 'a', cx, cy, 250, 7, (0, 90), .22, 'b6') + spikes(u, 'a', cx, cy, 230, 1.8, (0, 90), .7))
    o.append('<circle cx="%d" cy="%d" r="34" fill="#ffa850" opacity=".6" filter="url(#%sb14)"/>' % (cx, cy, u) + core(u, cx, cy, 21))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 14H 15M 40S · DEC +19° 11′ · BOÖTES · K1.5 III')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= ALDEBARAN
HYADES = [('ALDEBARAN', 4, 35, 55.2, 16, 30, 33, .85), ('GAMMA', 4, 19, 47.6, 15, 37, 39, 3.65), ('DELTA1', 4, 22, 56.1, 17, 32, 33, 3.76), ('EPSILON', 4, 28, 37.0, 19, 10, 50, 3.53),
          ('THETA2', 4, 28, 39.7, 15, 52, 15, 3.40), ('THETA1', 4, 28, 34.5, 15, 57, 44, 3.84), ('DELTA3', 4, 25, 29.4, 17, 55, 41, 4.30), ('71', 4, 26, 20.7, 15, 37, 6, 4.49),
          ('KAPPA1', 4, 25, 22.2, 22, 17, 38, 4.22), ('UPSILON', 4, 26, 18.5, 22, 48, 49, 4.28), ('90', 4, 38, 9.5, 12, 30, 39, 4.27), ('SIGMA2', 4, 39, 16.5, 15, 55, 5, 4.69),
          ('RHO', 4, 33, 50.9, 14, 50, 40, 4.65), ('DELTA2', 4, 24, 5.7, 17, 26, 39, 4.80), ('75', 4, 28, 26.4, 16, 21, 35, 4.97), ('79', 4, 28, 50.2, 13, 2, 51, 5.03),
          ('HD27371', 4, 18, 49.0, 13, 50, 0, 5.5), ('85', 4, 33, 1.8, 15, 50, 40, 6.0)]


def aldebaran(u):
    """The eye of the Bull: an orange giant 65 light-years away, standing in front of the V of the Hyades, twice as far, all against the dark dust of Taurus."""
    rnd = random.Random(1718)
    ra0, de0 = 4 + 27 / 60, 16.6
    rot = math.radians(54)
    sc = 1.62
    pos = {}
    for n, h, m, s_, d, dm, ds, mag in HYADES:
        ra = h + m / 60 + s_ / 3600; de = d + dm / 60 + ds / 3600
        x = -(ra - ra0) * 15 * math.cos(math.radians(de0)) * 60; y = -(de - de0) * 60
        X = x * math.cos(rot) - y * math.sin(rot); Y = x * math.sin(rot) + y * math.cos(rot)
        pos[n] = (272 + X * sc, 352 + Y * sc, mag)
    sd = base(u, 'bg', [(0, '#1a1518'), (.55, '#0c0a0e'), (1, '#040306')], '.45', '.85')
    sdefs = cloud(u, 'tc', '.008', 4, 71, 60, 22, 2.6, -.8) + warp(u, 'tl', '.02', 4, 72, 60, 5) + blur(u, 'b1', 1)
    tau = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(rnd.uniform(-40, 620), rnd.uniform(60, 820), rnd.uniform(80, 200), rnd.uniform(40, 110), rnd, 12, .4),
                                                             rnd.choice(['#4a3428', '#3a2a2a', '#5a4030', '#2e2a36']), f(rnd.uniform(.25, .5))) for _ in range(16))
    lanes = ''.join('<path d="%s" fill="#020103" opacity="%s" transform="rotate(%s %s %s)"/>' % (blob(x, y, rnd.uniform(50, 140), rnd.uniform(6, 18), rnd, 12, .45), f(rnd.uniform(.35, .7)), f(rnd.uniform(-60, -20)), f(x), f(y))
                    for x, y in ((rnd.uniform(-20, 600), rnd.uniform(80, 820)) for _ in range(14)))
    bg = plate_sky(u, 'bg', '<g filter="url(#%stc)">%s</g><g filter="url(#%stl)">%s</g>' % (u, tau, u, lanes) +
                   field(rnd, 300, (0, 0, W, H), ['#ffffff', '#fff1dc', '#ffe0c0', '#ffd8b0', '#e8ecff'], .25, 1.1, 4, (.15, .7)), sd + sdefs)
    defs = (halo_grad(u, 'ha', '#ff8a3a', '#fff0d8', 1.1) + rg(u, 'warm', [(0, '#ff9a4a', .3), (.4, '#ff7a30', .08), (1, '#ff7a30', 0)]) +
            halo_grad(u, 'hg', '#ffe2b0') + halo_grad(u, 'hw', '#dfe8ff') + spike_grad(u, 'a', '#ffa860', .2) + spike_grad(u, 'g', '#ffe8c8') + spike_grad(u, 'w', '#e8f0ff') +
            core_grad(u, 'cr', '#ffd0a0') + core_grad(u, 'cg', '#fff0d8') + blur(u, 'b2', 2) + blur(u, 'b4', 4) + blur(u, 'b10', 10))
    o = []
    # the cluster's faint members, a loose swarm about the V
    ga, gb = pos['GAMMA'], pos['THETA2']
    hx, hy = (ga[0] + gb[0]) / 2, (ga[1] + gb[1]) / 2 - 90
    for _ in range(34):
        x, y = hx + rnd.gauss(0, 90), hy + rnd.gauss(0, 100)
        m = rnd.uniform(6.5, 8.5)
        o.append(pinstar(x, y, max(.5, 2.6 - (m - 5.5) * .6), rnd.choice(['#fff4dc', '#ffe8c8', '#f4f6ff']), .5 + (8.5 - m) * .18))
    for n, (x, y, mag) in pos.items():
        if n == 'ALDEBARAN': continue
        r = 1 + (6.2 - mag) * 1.25
        k = 'w' if n in ('THETA2', 'DELTA3', '71', 'KAPPA1', 'UPSILON', 'RHO', 'SIGMA2', '90') else 'g'
        if mag < 5.2:
            big = mag < 4
            o.append(glow(x, y, r * (16 if big else 11), u + 'h' + k, .85) + spikes(u, k, x, y, r * (20 if big else 11), r * .3, op=.6) + core(u, x, y, r * 1.9, 'cg'))
        else:
            o.append(pinstar(x, y, r * .7, '#fff4e0', .9))
    ax, ay, _ = pos['ALDEBARAN']
    o.append(glow(ax, ay, 330, u + 'warm') + '<circle cx="%s" cy="%s" r="40" fill="#ff7a2a" opacity=".45" filter="url(#%sb10)"/>' % (f(ax), f(ay), u))
    o.append(spikes(u, 'a', ax, ay, 240, 6, op=.28, filt='b4') + spikes(u, 'a', ax, ay, 230, 1.9) + spikes(u, 'a', ax, ay, 60, .8, (45, 135), .3))
    o.append(glow(ax, ay, 130, u + 'ha') + core(u, ax, ay, 15))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 04H 35M 55S · DEC +16° 30′ · TAURUS · 65 LY'), label(pos['GAMMA'][:2], (560, 600), ['HYADES', '153 LY · 625 MYR'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= POLARIS
def polaris(u):
    """An hour and more of sky turning about the pole: every star a coloured arc, Polaris a short bright hook at the hub, a ridge and a dome black below."""
    rnd = random.Random(2102)
    cx, cy = 291, 292
    sd = (base(u, 'bg', [(0, '#0a1024'), (.6, '#070b1a'), (1, '#03050c')], '.35', '.9') +
          lg(u, 'air', [(0, '#1a3a3a', 0), (.55, '#20403c', .18), (.8, '#3a4a58', .4), (1, '#6a5a60', .7)], 0, 0, 0, 1))
    bg = plate_sky(u, 'bg', '<rect y="430" width="%d" height="%d" fill="url(#%sair)"/>' % (W, H - 430, u), sd)
    cols = ['#ffffff', '#f4f6ff', '#dbe6ff', '#c4d6ff', '#fff4e0', '#ffe6b8', '#ffd49a', '#ffbe84', '#ff9f70']
    sweep = math.radians(56)
    tr, gl = [], []
    for _ in range(780):
        r = 8 + 680 * math.sqrt(rnd.random())
        a0 = rnd.uniform(0, 2 * math.pi); a1 = a0 - sweep
        m = rnd.random() ** 3.4
        c = rnd.choice(cols)
        w = .45 + 2.1 * m; op = .22 + .7 * rnd.random() ** .8
        d = 'M%s %sA%s %s 0 0 0 %s %s' % (f(cx + r * math.cos(a0)), f(cy + r * math.sin(a0)), f(r), f(r), f(cx + r * math.cos(a1)), f(cy + r * math.sin(a1)))
        tr.append('<path d="%s" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (d, c, f(op), f(w)))
        if m > .45:
            gl.append('<path d="%s" stroke="%s" stroke-opacity=".35" stroke-width="%s"/>' % (d, c, f(w * 3.5)))
    defs = (blur(u, 'b2', 2.2) + blur(u, 'b5', 5) + rg(u, 'pg', [(0, '#fff6e0', .9), (.25, '#fff0d0', .3), (1, '#fff0d0', 0)]) +
            lg(u, 'ext', [(0, '#fff', 1), (.62, '#fff', 1), (.8, '#fff', .35), (.9, '#fff', 0)], 0, 0, 0, 1) +
            '<mask id="%sfade" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><rect width="%d" height="%d" fill="url(#%sext)"/></mask>' % (u, W, H, W, H, u) +
            lg(u, 'hill', [(0, '#05070d', 1), (1, '#010103', 1)], 0, 0, 0, 1) + warp(u, 'rw', '.03', 3, 9, 6))
    o = ['<g mask="url(#%sfade)" fill="none" stroke-linecap="round"><g filter="url(#%sb5)">%s</g>%s</g>' % (u, u, ''.join(gl), ''.join(tr))]
    # Polaris: 0.66° off the true pole, so even Polaris draws a short hook
    pr = 12
    p0 = math.radians(-60); p1 = p0 - sweep
    P0 = (cx + pr * math.cos(p0), cy + pr * math.sin(p0)); P1 = (cx + pr * math.cos(p1), cy + pr * math.sin(p1))
    o.append(glow(P1[0], P1[1], 40, u + 'pg'))
    o.append('<path d="M%s %sA%d %d 0 0 0 %s %s" fill="none" stroke="#fff4dc" stroke-width="3.2" stroke-linecap="round"/>' % (f(P0[0]), f(P0[1]), pr, pr, f(P1[0]), f(P1[1])))
    o.append('<circle cx="%s" cy="%s" r="2.6" fill="#fff"/>' % (f(P1[0]), f(P1[1])))
    # the ridge and an observatory dome, in silhouette
    ridge = ['M-10 %d' % H]
    x = -10
    while x <= W + 10:
        y = 664 - 36 * math.exp(-((x - 120) / 110) ** 2) - 22 * math.exp(-((x - 450) / 90) ** 2) + 6 * math.sin(x / 23) + rnd.uniform(-2, 2)
        ridge.append('L%s %s' % (f(x), f(y))); x += 6
    ridge.append('L%d %dZ' % (W + 10, H))
    dx, dy = 452, 638
    dome = ('<path d="M%s %sA20 20 0 0 1 %s %sZ" /><rect x="%s" y="%s" width="44" height="18"/><rect x="%s" y="%s" width="5" height="16" fill="#15181f" transform="rotate(-8 %s %s)"/>' % (
        f(dx - 20), f(dy), f(dx + 20), f(dy), f(dx - 22), f(dy), f(dx - 3), f(dy - 21), f(dx), f(dy)))
    o.append('<g fill="url(#%shill)"><path d="%s" filter="url(#%srw)"/>%s</g>' % (u, ''.join(ridge), u, dome))
    o.append('<circle cx="%s" cy="%s" r="1.3" fill="#ff5a4a" opacity=".8"/>' % (f(dx + 14), f(dy + 10)))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 02H 31M 49S · DEC +89° 15′ · URSA MINOR · 3H 44M')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= MIRA
def mira(u):
    """Mira in ultraviolet: a pulsing red giant ploughing through space at 130 km/s, a bow shock ahead of it and a tail of shed gas thirteen light-years long behind."""
    rnd = random.Random(1596)
    hx, hy = 440, 186
    sd = base(u, 'bg', [(0, '#0c1024'), (.55, '#060818'), (1, '#02030a')], '.6', '.9')
    bg = plate_sky(u, 'bg', starfield(W, H, 300, 1596, 0, ('#ffffff', '#dfe8ff', '#b8d0ff', '#cfe0ff', '#fff1dc'), u), sd + SPIKE_DEFS.format(u=u))
    # the path of the tail, a gentle curve down and away
    P0, P1, P2 = (hx, hy), (300, 330), (-60, 900)

    def path(t):
        return ((1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1])

    def normal(t):
        a = path(max(0, t - .01)); b = path(min(1, t + .01))
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        return -(b[1] - a[1]) / L, (b[0] - a[0]) / L, math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    defs = (cloud(u, 'tc', '.018', 4, 15, 40, 5, 2.8, -.75) + cloud(u, 'tk', '.05', 3, 16, 14, 1.6, 3, -.9) + warp(u, 'tw', '.03 .01', 3, 17, 26, 1.2) +
            blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b8', 8) + blur(u, 'b20', 20, 60) +
            halo_grad(u, 'hm', '#ff6a3a', '#ffd8c0') + rg(u, 'uv', [(0, '#cfeaff', .45), (.4, '#8ab8ff', .12), (1, '#8ab8ff', 0)]) + core_grad(u, 'cr', '#ffb89a'))
    def taper(w0, w1, n=40, pw=1.0):
        L, R = [], []
        for k in range(n + 1):
            t = k / n; x, y = path(t); nx, ny, _ = normal(t); w = w0 + (w1 - w0) * t ** pw
            L.append((x + nx * w, y + ny * w)); R.append((x - nx * w, y - ny * w))
        return 'M' + 'L'.join('%s %s' % (f(a), f(b)) for a, b in L + R[::-1]) + 'Z'
    defs += lg(u, 'tail', [(0, '#e8f4ff', .95), (.25, '#a8ccff', .55), (.6, '#6a94e0', .22), (1, '#4a6ac0', 0)], hx, hy, P2[0] + 60, P2[1] - 60, ' gradientUnits="userSpaceOnUse"')
    wide, knots, fil = [], [], []
    for i in range(130):
        t = (i / 130) ** 1.2
        x, y = path(t); nx, ny, ang = normal(t)
        off = rnd.gauss(0, (8 + 90 * t) * .45)
        X, Y = x + nx * off, y + ny * off
        wide.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(X), f(Y), f(14 + 50 * t), f(6 + 26 * t), rnd.choice(['#9cc8ff', '#b8dcff', '#7aa8f0', '#cfe8ff']), f((.34 - .28 * t) * rnd.uniform(.5, 1)), f(ang), f(X), f(Y)))
    for i in range(150):
        t = rnd.random() ** 1.5
        x, y = path(t); nx, ny, ang = normal(t)
        off = rnd.gauss(0, 4 + 34 * t) + 8 * math.sin(t * 40)
        X, Y = x + nx * off, y + ny * off
        r = rnd.uniform(1.5, 5) * (1 + 1.5 * t)
        knots.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(X), f(Y), f(r * rnd.uniform(1.2, 2.4)), f(r), rnd.choice(['#e8f6ff', '#cfe8ff', '#ffffff']), f((.6 - .5 * t) * rnd.uniform(.3, 1)), f(ang), f(X), f(Y)))
    for i in range(18):
        t0 = rnd.uniform(0, .5); t1 = min(1, t0 + rnd.uniform(.12, .35)); off = rnd.gauss(0, 10 + 30 * t0)
        pts = []
        for k in range(6):
            t = t0 + (t1 - t0) * k / 5; x, y = path(t); nx, ny, _ = normal(t)
            pts.append((x + nx * off * (1 + t), y + ny * off * (1 + t)))
        fil.append('<path d="M%s" fill="none" stroke="#d8ecff" stroke-opacity="%s" stroke-width="%s"/>' % ('L'.join('%s %s' % (f(a), f(b)) for a, b in pts), f(rnd.uniform(.06, .18)), f(rnd.uniform(.8, 2.4))))
    o = ['<path d="%s" fill="url(#%stail)" opacity=".55" filter="url(#%sb20)"/>' % (taper(14, 150, pw=.9), u, u),
         '<path d="%s" fill="url(#%stail)" opacity=".6" filter="url(#%sb8)"/>' % (taper(5, 70, pw=1.1), u, u),
         '<g filter="url(#%stc)" style="mix-blend-mode: screen">%s</g>' % (u, ''.join(wide)),
         '<g filter="url(#%sb3)">%s</g>' % (u, ''.join(fil)),
         '<g filter="url(#%sb3)" style="mix-blend-mode: screen">%s</g>' % (u, ''.join(knots))]
    # the bow shock: a bright parabola where the stellar wind meets the interstellar gas head-on
    _, _, ang = normal(0)
    mv = math.radians(ang + 180)
    ca, sa = math.cos(mv), math.sin(mv)
    arc = []
    for k in range(-20, 21):
        Y = k / 20 * 62
        X = 24 - Y * Y / 58
        arc.append((hx + X * ca - Y * sa, hy + X * sa + Y * ca))
    d = 'M' + 'L'.join('%s %s' % (f(a), f(b)) for a, b in arc)
    dm = 'M' + 'L'.join('%s %s' % (f(a), f(b)) for a, b in arc[9:32])
    o.append('<path d="%s" fill="none" stroke="#bfe0ff" stroke-opacity=".32" stroke-width="34" stroke-linecap="round" filter="url(#%sb20)"/>' % (d, u))
    o.append('<path d="%s" fill="none" stroke="#dff0ff" stroke-opacity=".4" stroke-width="9" stroke-linecap="round" filter="url(#%sb8)"/>' % (dm, u))
    o.append('<path d="%s" fill="none" stroke="#ffffff" stroke-opacity=".4" stroke-width="2" stroke-linecap="round" filter="url(#%sb1)"/>' % (dm, u))
    o.append(glow(hx, hy, 90, u + 'uv'))
    # Mira itself: a cool red giant at the head, its companion lost in its light
    o.append(glow(hx, hy, 70, u + 'hm') + core(u, hx, hy, 10))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 02H 19M 21S · DEC −02° 58′ · CETUS · GALEX FUV'), scalebar(22, 800, 150, '2 LY')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= BETELGEUSE
def betelgeuse(u):
    """Betelgeuse resolved: a boiling red disc wider than Jupiter's orbit, a handful of convection cells each larger than the Sun's orbit, and the dust cloud that dimmed it in 2019."""
    rnd = random.Random(2019)
    cx, cy, R = 291, 336, 170
    sd = base(u, 'bg', [(0, '#2a0f0a'), (.5, '#120605'), (1, '#040204')], '.46', '.8')
    bg = plate_sky(u, 'bg', starfield(W, H, 170, 2019, 0, ('#ffffff', '#fff1dc', '#ffe0c8', '#dfe8ff'), u), sd + SPIKE_DEFS.format(u=u))
    rim = blob(cx, cy, R, R * .975, random.Random(3), 40, .018)
    defs = ('<clipPath id="%sdisk"><path d="%s"/></clipPath>' % (u, rim) +
            rg(u, 'base', [(0, '#ffc070', 1), (.35, '#ff9a48', 1), (.62, '#e8642a', 1), (.84, '#b83a18', 1), (.95, '#7a1c0a', 1), (1, '#4a0e06', 1)], '.47', '.45', '.54') +
            rg(u, 'limb', [(0, '#000', 0), (.55, '#000', 0), (.82, '#2a0402', .35), (.96, '#1a0201', .75), (1, '#0a0100', .9)]) +
            rg(u, 'cell', [(0, '#ffe2a0', .85), (.35, '#ffc070', .5), (.7, '#ff9040', .15), (1, '#ff9040', 0)]) +
            rg(u, 'env', [(.3, '#ff6a2a', .55), (.45, '#e84a1c', .22), (.7, '#a82a10', .07), (1, '#a82a10', 0)]) +
            rg(u, 'dim', [(0, '#140403', .92), (.45, '#200806', .7), (.75, '#2a0a06', .3), (1, '#2a0a06', 0)]) +
            '<filter id="%slanes" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="turbulence" baseFrequency=".0075" numOctaves="2" seed="61"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 .26  0 0 0 0 .04  0 0 0 0 .01  -3.4 0 0 0 .95"/><feGaussianBlur stdDeviation="5"/></filter>' % u +
            '<filter id="%sfine" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="turbulence" baseFrequency=".022" numOctaves="3" seed="62"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 .3  0 0 0 0 .05  0 0 0 0 .01  -3 0 0 0 .8"/><feGaussianBlur stdDeviation="1.5"/></filter>' % u +
            cloud(u, 'pl', '.014', 4, 63, 50, 10, 2.6, -.7) + cloud(u, 'dust', '.02', 4, 64, 40, 6, 3, -.9) + blur(u, 'b3', 3) + blur(u, 'b10', 10) + blur(u, 'b24', 24, 60))
    o = [glow(cx, cy, 420, u + 'env')]
    # the extended envelope: plumes of warm gas thrown off unevenly, brightest to the north-east
    pl = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (
        blob(cx + d * math.cos(a), cy + d * math.sin(a), rnd.uniform(40, 110), rnd.uniform(30, 70), rnd, 12, .4), rnd.choice(['#ff8a4a', '#e0502a', '#ffb070', '#c83a1c']), f(rnd.uniform(.12, .3)))
        for a, d in ((rnd.gauss(-1.1, 1.0), rnd.uniform(R * .9, R * 1.5)) for _ in range(26)))
    o.append('<g filter="url(#%spl)">%s</g>' % (u, pl))
    # the photosphere
    b = ['<rect x="%d" y="%d" width="%d" height="%d" fill="url(#%sbase)"/>' % (cx - R, cy - R, 2 * R, 2 * R, u)]
    cells = []
    for x, y, r in [(-.28, -.22, .5), (.3, .1, .42), (-.05, .42, .36)]:
        cells.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%scell)"/>' % (f(cx + x * R), f(cy + y * R), f(r * R), f(r * R * rnd.uniform(.75, 1)), u))
    for _ in range(40):
        a = rnd.uniform(0, 2 * math.pi); d = R * math.sqrt(rnd.random()) * .92
        r = rnd.uniform(.08, .2) * R
        cells.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%scell)" opacity="%s"/>' % (f(cx + d * math.cos(a)), f(cy + d * math.sin(a)), f(r), f(r * rnd.uniform(.7, 1)), u, f(rnd.uniform(.4, .9))))
    b.append('<g filter="url(#%sb10)">%s</g>' % (u, ''.join(cells)))
    b.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%slanes)" opacity=".8"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    b.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sfine)" opacity=".35"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    # a few hot upwellings, white-gold
    for x, y, r in [(-.3, -.26, 20), (.28, .08, 15), (-.1, .38, 11)]:
        b.append('<circle cx="%s" cy="%s" r="%s" fill="#ffe8b8" opacity=".55" filter="url(#%sb10)"/>' % (f(cx + x * R), f(cy + y * R), f(r), u))
    b.append('<rect x="%d" y="%d" width="%d" height="%d" fill="url(#%slimb)"/>' % (cx - R, cy - R, 2 * R, 2 * R, u))
    # the Great Dimming: a dust cloud over the southern hemisphere
    b.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%sdim)" transform="rotate(-18 %s %s)"/>' % (f(cx - 30), f(cy + R * .72), f(R * 1.2), f(R * .78), u, f(cx), f(cy)))
    o.append('<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)))
    o.append('<path d="%s" fill="none" stroke="#ff9a5a" stroke-opacity=".35" stroke-width="3" filter="url(#%sb3)"/>' % (rim, u))
    # the dust itself, drifting off the south-west limb, dark against the envelope
    du = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (
        blob(cx + d * math.cos(a), cy + d * math.sin(a), rnd.uniform(30, 80), rnd.uniform(20, 50), rnd, 12, .4), rnd.choice(['#1a0806', '#2a0e08', '#120404']), f(rnd.uniform(.35, .7)))
        for a, d in ((rnd.gauss(2.1, .35), rnd.uniform(R * .75, R * 1.45)) for _ in range(16)))
    o.append('<g filter="url(#%sdust)">%s</g>' % (u, du))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .12), defs)
    ann = [top('RA 05H 55M 10S · DEC +07° 24′ · ORION · M1-2 IA'), scalebar(22, 800, R / 3.6, '1 AU')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= ANTARES
def antares(u):
    """The rival of Mars in its nest: Antares lighting a golden reflection cloud, the red glow round Sigma Scorpii, blue dust round Rho Ophiuchi, dark streamers, and M4 beside it."""
    rnd = random.Random(1604)
    ax, ay = 212, 430
    rx, ry = 392, 176
    sx, sy = 488, 470
    mx, my = 318, 472
    sd = base(u, 'bg', [(0, '#16121a'), (.55, '#0b080e'), (1, '#040306')], '.5', '.85')
    sdefs = dust_stars(u, 'ds', 17, .72, .5, '.01', (1, .95, .88), 7) + dust_stars(u, 'dt', 23, .76, .4, '.02', (.9, .92, 1), 6)
    bg = plate_sky(u, 'bg', '<rect width="%d" height="%d" filter="url(#%sds)"/><rect width="%d" height="%d" filter="url(#%sdt)" opacity=".7"/>' % (W, H, u, W, H, u) +
                   field(rnd, 420, (0, 0, W, H), ['#ffffff', '#fff1dc', '#ffe0b8', '#dfe8ff'], .3, 1.5), sd + sdefs)
    defs = (cloud(u, 'nb', '.009', 4, 41, 70, 20, 2.4, -.6) + cloud(u, 'nf', '.022', 4, 42, 40, 6, 2.8, -.85) + warp(u, 'dl', '.016', 4, 43, 80, 4) + warp(u, 'df', '.02', 3, 44, 18, 3) +
            blur(u, 'b2', 2) + blur(u, 'b4', 4) + blur(u, 'b10', 10) +
            halo_grad(u, 'ha', '#ff7a3a', '#fff0d8', 1.1) + halo_grad(u, 'hr', '#a8c4ff') + halo_grad(u, 'hs', '#dfe8ff') +
            spike_grad(u, 'a', '#ffa060', .2) + spike_grad(u, 'b', '#cfe0ff', .18) + core_grad(u, 'cr', '#ffc890') + core_grad(u, 'cb', '#dfe8ff') +
            rg(u, 'm4', [(0, '#fff0d8', .5), (.4, '#ffe8c8', .18), (1, '#ffe8c8', 0)]))
    o = []

    def neb(x, y, n, sx_, sy_, cols, op, rmin, rmax, filt):
        return '<g filter="url(#%s%s)">%s</g>' % (u, filt, ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (
            blob(x + rnd.gauss(0, sx_), y + rnd.gauss(0, sy_), rnd.uniform(rmin, rmax), rnd.uniform(rmin, rmax) * .8, rnd, 12, .4), rnd.choice(cols), f(rnd.uniform(*op))) for _ in range(n)))
    # red: hydrogen round Sigma Scorpii
    o.append(neb(sx, sy - 20, 16, 80, 110, ['#c8303e', '#a82034', '#e04a50', '#8a1a2e'], (.3, .6), 40, 110, 'nb'))
    # gold: dust lit by Antares itself
    o.append(neb(ax + 20, ay, 18, 90, 90, ['#e8a838', '#f0c050', '#d08028', '#c86a2a'], (.3, .6), 40, 110, 'nb'))
    o.append(neb(ax + 10, ay - 10, 10, 50, 50, ['#ffd070', '#ffe090'], (.25, .45), 20, 60, 'nf'))
    # blue: dust lit by the hot B stars of Rho Ophiuchi, and a smaller cloud below it
    o.append(neb(rx, ry + 10, 16, 70, 60, ['#3a6ad0', '#4a80e8', '#2a50b0', '#6a9aff'], (.3, .6), 40, 100, 'nb'))
    o.append(neb(rx - 10, ry, 8, 30, 30, ['#8ab4ff', '#b8d0ff'], (.25, .45), 16, 40, 'nf'))
    o.append(neb(470, 290, 6, 20, 20, ['#4a80e8', '#6a9aff'], (.25, .45), 16, 36, 'nf'))
    # dark dust: streamers out of the Rho Oph cloud toward the south-east, and knots across the gold
    dk = []
    for _ in range(26):
        t = rnd.random()
        x, y = rx - 60 - t * 480 + rnd.gauss(0, 40), ry + 60 + t * 160 + rnd.gauss(0, 90)
        dk.append('<path d="%s" fill="#060306" opacity="%s" transform="rotate(%s %s %s)"/>' % (blob(x, y, rnd.uniform(40, 130), rnd.uniform(6, 20), rnd, 12, .45), f(rnd.uniform(.5, .9)), f(rnd.uniform(-35, -10)), f(x), f(y)))
    for _ in range(12):
        x, y = rnd.uniform(0, W), rnd.uniform(560, 820)
        dk.append('<path d="%s" fill="#050305" opacity="%s"/>' % (blob(x, y, rnd.uniform(40, 120), rnd.uniform(20, 60), rnd, 12, .4), f(rnd.uniform(.5, .85))))
    o.append('<g filter="url(#%sdl)">%s</g>' % (u, ''.join(dk)))
    fine = ''.join('<path d="M%s %sq%s %s %s %s" fill="none" stroke="#080406" stroke-opacity="%s" stroke-width="%s"/>' % (
        f(x), f(y), f(rnd.uniform(-60, 60)), f(rnd.uniform(-20, 30)), f(rnd.uniform(-160, -60)), f(rnd.uniform(20, 70)), f(rnd.uniform(.2, .45)), f(rnd.uniform(3, 9)))
        for x, y in ((rnd.uniform(60, 560), rnd.uniform(140, 620)) for _ in range(14)))
    o.append('<g filter="url(#%sdf)">%s</g>' % (u, fine))
    # M4: a globular cluster of old stars, 7,200 light-years behind
    o.append(glow(mx, my, 34, u + 'm4') + ''.join('<circle cx="%s" cy="%s" r="%s" fill="#fff4e0" opacity="%s"/>' % (
        f(mx + rnd.gauss(0, 9)), f(my + rnd.gauss(0, 9)), f(rnd.uniform(.3, .8)), f(rnd.uniform(.4, .9))) for _ in range(140)))
    # Rho Ophiuchi and Sigma Scorpii, blue-white
    o.append(glow(rx, ry, 60, u + 'hr') + spikes(u, 'b', rx, ry, 60, 1.1, op=.8) + core(u, rx, ry, 6, 'cb'))
    o.append(glow(sx, sy, 56, u + 'hs') + spikes(u, 'b', sx, sy, 56, 1, op=.8) + core(u, sx, sy, 5.5, 'cb'))
    # Antares
    o.append('<circle cx="%d" cy="%d" r="46" fill="#ff7a2a" opacity=".45" filter="url(#%sb10)"/>' % (ax, ay, u))
    o.append(spikes(u, 'a', ax, ay, 230, 6, op=.26, filt='b4') + spikes(u, 'a', ax, ay, 220, 1.9) + spikes(u, 'a', ax, ay, 60, .8, (45, 135), .3))
    o.append(glow(ax, ay, 140, u + 'ha') + core(u, ax, ay, 15))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .11), defs)
    ann = [top('RA 16H 29M 24S · DEC −26° 25′ · SCORPIUS · 550 LY'), label((mx, my), (560, 580), ['M4', 'GLOBULAR · 7,200 LY'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= RIGEL
def rigel(u):
    """Rigel blazing blue-white in Orion's foot, and beside it the Witch Head: a ghost of dust lit blue by Rigel, its profile turned toward the star."""
    rnd = random.Random(2118)
    gx, gy = 168, 214
    sd = base(u, 'bg', [(0, '#10142a'), (.55, '#080a18'), (1, '#03040a')], '.3', '.9')
    sdefs = cloud(u, 'hb', '.008', 4, 91, 70, 26, 2.4, -.7)
    hal = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(rnd.uniform(-60, 640), rnd.uniform(100, 860), rnd.uniform(80, 180), rnd.uniform(40, 90), rnd, 12, .4), rnd.choice(['#6a2030', '#4a1a2a', '#3a2040']), f(rnd.uniform(.2, .45))) for _ in range(10))
    bg = plate_sky(u, 'bg', '<g filter="url(#%shb)">%s</g>' % (u, hal) + field(rnd, 360, (0, 0, W, H), ['#ffffff', '#dfe8ff', '#cfe0ff', '#fff1dc'], .3, 1.5), sd + sdefs)
    defs = (cloud(u, 'wb', '.012 .03', 4, 51, 40, 9, 2.4, -.6) + cloud(u, 'wf', '.03 .07', 3, 52, 18, 2, 2.8, -.9) + warp(u, 'ww', '.02 .05', 3, 53, 22, 1.4) +
            blur(u, 'b3', 3) + blur(u, 'b5', 5) + blur(u, 'b12', 12) +
            halo_grad(u, 'h', '#8ab4ff', k=.8) + rg(u, 'sky', [(0, '#7aa0ff', .3), (.35, '#5a80ff', .08), (1, '#5a80ff', 0)]) +
            spike_grad(u, 'w', '#b8d0ff', .2) + core_grad(u, 'cr', '#cfe0ff'))
    # the Witch Head: a long diagonal cloud, forehead, hooked nose, chin and jaw along the edge that faces Rigel
    prof = [(300, 236), (270, 250), (258, 278), (272, 300), (252, 318), (220, 352), (246, 360), (256, 374), (268, 382), (254, 396), (262, 414), (248, 438),
            (278, 452), (312, 472), (350, 520), (400, 590), (450, 650), (520, 710), (600, 750), (640, 600), (600, 420), (520, 300), (420, 240), (340, 222)]
    mids = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in zip(prof, prof[1:] + prof[:1])]
    head = 'M%s %s' % (f(mids[-1][0]), f(mids[-1][1])) + ''.join('Q%s %s %s %s' % (f(p[0]), f(p[1]), f(m[0]), f(m[1])) for p, m in zip(prof, mids)) + 'Z'
    defs += '<mask id="%shead" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><path d="%s" fill="#fff" filter="url(#%sb12)"/></mask>' % (u, W, H, head, u) + lg(u, 'lit', [(0, '#dbe8ff', .9), (.3, '#8ab0ff', .45), (1, '#3a5ad0', .05)], 260, 300, 560, 520, ' gradientUnits="userSpaceOnUse"')
    body = ['<path d="%s" fill="url(#%slit)" opacity=".5" filter="url(#%sb12)"/>' % (head, u, u)]
    st = []
    for _ in range(70):
        t = rnd.random(); x, y = 290 + t * 300 + rnd.gauss(0, 40), 280 + t * 420 + rnd.gauss(0, 50)
        st.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(54 %s %s)"/>' % (
            f(x), f(y), f(rnd.uniform(30, 110)), f(rnd.uniform(4, 16)), rnd.choice(['#6a90f0', '#8ab0ff', '#4a6ad8', '#b8d0ff']), f(rnd.uniform(.12, .35)), f(x), f(y)))
    body.append('<g filter="url(#%swb)">%s</g>' % (u, ''.join(st)))
    fil = ''.join('<path d="M%s %sq%s %s %s %s" fill="none" stroke="#cfe0ff" stroke-opacity="%s" stroke-width="%s"/>' % (
        f(x), f(y), f(rnd.uniform(20, 60)), f(rnd.uniform(30, 70)), f(rnd.uniform(60, 160)), f(rnd.uniform(90, 220)), f(rnd.uniform(.06, .22)), f(rnd.uniform(1, 4)))
        for x, y in ((rnd.uniform(250, 520), rnd.uniform(240, 640)) for _ in range(34)))
    body.append('<g filter="url(#%sww)">%s</g>' % (u, fil))
    o = [glow(gx, gy, 560, u + 'sky'),
         '<g mask="url(#%shead)" opacity=".8"><g filter="url(#%sb3)">%s</g></g>' % (u, u, ''.join(body)),
         # the lit brow and nose: the edge nearest Rigel glows brightest
         '<path d="M%s" fill="none" stroke="#cfe0ff" stroke-opacity=".2" stroke-width="12" stroke-linejoin="round" filter="url(#%sb12)"/>' % ('L'.join('%s %s' % (f(a + 10), f(b + 4)) for a, b in prof[:13]), u)]
    # Rigel
    o.append(spikes(u, 'w', gx, gy, 320, 7, op=.3, filt='b5') + spikes(u, 'w', gx, gy, 300, 2.2) + spikes(u, 'w', gx, gy, 90, 1, (45, 135), .35))
    o.append(glow(gx, gy, 150, u + 'h') + '<circle cx="%d" cy="%d" r="30" fill="#aac8ff" opacity=".5" filter="url(#%sb12)"/>' % (gx, gy, u) + core(u, gx, gy, 17))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 05H 14M 32S · DEC −08° 12′ · ORION · B8 IA'), label((420, 520), (560, 610), ['IC 2118', 'THE WITCH HEAD'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= ETA CARINAE
def eta_carinae(u):
    """The Homunculus: two dusty lobes blown out in the Great Eruption of the 1840s, a thin skirt at the waist, the star still blazing inside, all in the red Carina Nebula."""
    rnd = random.Random(1843)
    cx, cy = 291, 338
    th = math.radians(-132)
    ux, uy = math.cos(th), math.sin(th)
    sd = base(u, 'bg', [(0, '#2a0e14'), (.55, '#12060a'), (1, '#050205')], '.5', '.85')
    sdefs = cloud(u, 'cb', '.008', 4, 11, 80, 22, 2.4, -.6) + cloud(u, 'cf', '.02', 4, 12, 40, 6, 2.8, -.9) + warp(u, 'cd', '.015', 4, 13, 70, 4)
    car = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(rnd.uniform(-40, 620), rnd.uniform(40, 860), rnd.uniform(70, 170), rnd.uniform(50, 120), rnd, 12, .4),
                                                             rnd.choice(['#b82a3a', '#8a1a2a', '#d0404a', '#6a1424', '#3a8a8a']), f(rnd.uniform(.25, .55))) for _ in range(26))
    fine = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(rnd.uniform(0, W), rnd.uniform(60, 840), rnd.uniform(20, 60), rnd.uniform(10, 40), rnd, 10, .4),
                                                              rnd.choice(['#ff6a6a', '#e84a5a', '#5ac8c0']), f(rnd.uniform(.15, .35))) for _ in range(30))
    dark = ''.join('<path d="%s" fill="#070205" opacity="%s" transform="rotate(%s %s %s)"/>' % (blob(x, y, rnd.uniform(50, 130), rnd.uniform(14, 40), rnd, 12, .45), f(rnd.uniform(.5, .85)), f(rnd.uniform(0, 180)), f(x), f(y))
                   for x, y in ((rnd.choice([rnd.uniform(-20, 140), rnd.uniform(440, 600)]), rnd.uniform(80, 820)) for _ in range(16)))
    bg = plate_sky(u, 'bg', '<g filter="url(#%scb)">%s</g><g filter="url(#%scf)">%s</g><g filter="url(#%scd)">%s</g>' % (u, car, u, fine, u, dark) +
                   field(rnd, 360, (0, 0, W, H), ['#ffffff', '#fff1dc', '#ffe0d0', '#dfe8ff'], .3, 1.5), sd + sdefs + blur(u, 'b1', 1))
    L, A, B = 128, 132, 94
    defs = (rg(u, 'lobeN', [(0, '#e8a080', .95), (.5, '#f0b090', .95), (.8, '#fcd0b4', 1), (.93, '#ffe6d4', 1), (1, '#ffe6d4', .3)], '.5', '.5', '.5') +
            rg(u, 'lobeF', [(0, '#a8584a', .9), (.6, '#c07060', .9), (.85, '#dc9a84', .92), (.95, '#ecb8a4', .9), (1, '#ecb8a4', .2)], '.5', '.5', '.5') +
            '<filter id="%scell" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="turbulence" baseFrequency=".028" numOctaves="3" seed="18"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 .22  0 0 0 0 .08  0 0 0 0 .06  -3.2 0 0 0 1.05"/></filter>' % u +
            noise(u, 'mot', '.02', 4, 19, (2.6, -.9), (.25, .1, .08)) +
            warp(u, 'sk', '.012', 2, 20, 8, 1.4) + warp(u, 'lw', '.02', 3, 21, 10, 0) + cloud(u, 'ej', '.04', 3, 22, 16, 1.6, 2.8, -.8) +
            blur(u, 'b1', 1) + blur(u, 'b3', 3) + blur(u, 'b8', 8) + blur(u, 'b18', 18) +
            halo_grad(u, 'h', '#ffe0c8', k=.9) + spike_grad(u, 'w', '#ffe8d8', .2) + core_grad(u, 'cr', '#fff0e0') +
            rg(u, 'waist', [(0, '#fff4e8', .8), (.4, '#ffd8c0', .3), (1, '#ffd8c0', 0)]))
    o = []
    # outer ejecta: nitrogen-rich knots and strings, orange-red, far out
    ej = []
    for _ in range(70):
        a = rnd.uniform(0, 2 * math.pi); d = rnd.uniform(150, 250)
        x, y = cx + d * math.cos(a), cy + d * math.sin(a) * .9
        ej.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(x), f(y), f(rnd.uniform(8, 26)), f(rnd.uniform(2, 6)), rnd.choice(['#ff8a5a', '#ff6a4a', '#ffb080', '#e85a4a']), f(rnd.uniform(.15, .4)), f(math.degrees(a)), f(x), f(y)))
    o.append('<g filter="url(#%sb3)">%s</g>' % (u, ''.join(ej)))
    o.append('<circle cx="%d" cy="%d" r="190" fill="#ffb8a0" opacity=".16" filter="url(#%sb18)"/>' % (cx, cy, u))

    def lobe(sign, grad, op):
        lx, ly = cx + sign * ux * L, cy + sign * uy * L
        ca, sa = math.cos(th), math.sin(th)
        pts = []
        for k in range(60):
            p = 2 * math.pi * k / 60
            X, Y = A * math.cos(p), B * math.sin(p)
            Y *= 1 - .62 * max(0, -math.cos(p)) ** 2.4
            X *= sign
            pts.append((lx + X * ca - Y * sa, ly + X * sa + Y * ca))
        d = 'M' + 'L'.join('%s %s' % (f(a), f(b)) for a, b in pts) + 'Z'
        mid = '%slb%d' % (u, 1 if sign > 0 else 2)
        box = (f(lx - A - 20), f(ly - A - 20), f(2 * A + 40), f(2 * A + 40))
        g = ['<mask id="%s" maskUnits="userSpaceOnUse" x="0" y="0" width="%d" height="%d"><path d="%s" fill="#fff" filter="url(#%sb3)"/></mask>' % (mid, W, H, d, u)]
        inner = ['<rect x="%s" y="%s" width="%s" height="%s" fill="url(#%s)"/>' % (box + (grad,)),
                 '<rect x="%s" y="%s" width="%s" height="%s" filter="url(#%smot)" opacity=".6" style="mix-blend-mode: multiply"/>' % (box + (u,)),
                 '<rect x="%s" y="%s" width="%s" height="%s" filter="url(#%scell)" opacity=".3"/>' % (box + (u,))]
        for _ in range(8):
            X, Y = lx + rnd.gauss(0, 40), ly + rnd.gauss(0, 40)
            inner.append('<path d="%s" fill="#6a3028" opacity="%s" filter="url(#%sb8)"/>' % (blob(X, Y, rnd.uniform(16, 36), rnd.uniform(8, 16), rnd, 10, .4), f(rnd.uniform(.2, .4)), u))
        for _ in range(9):
            k = rnd.uniform(.2, .8); a2 = rnd.gauss(0, .6)
            X, Y = lx + sign * (ux * math.cos(a2) - uy * math.sin(a2)) * A * k, ly + sign * (ux * math.sin(a2) + uy * math.cos(a2)) * A * k
            inner.append('<circle cx="%s" cy="%s" r="%s" fill="#fff2e8" opacity="%s" filter="url(#%sb8)"/>' % (f(X), f(Y), f(rnd.uniform(8, 20)), f(rnd.uniform(.12, .28)), u))
        inner.append('<path d="%s" fill="none" stroke="#fff0e6" stroke-opacity=".5" stroke-width="10" filter="url(#%sb8)"/>' % (d, u))
        g.append('<g opacity="%s" mask="url(#%s)">%s</g>' % (f(op), mid, ''.join(inner)))
        return ''.join(g)
    # the far lobe (north-west) behind, dimmer; the near lobe (south-east) in front
    o.append('<g opacity=".3" filter="url(#%sb18)">%s</g>' % (u, ''.join(
        '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#ffc8b0" transform="rotate(%s %s %s)"/>' % (f(cx + sg * ux * L), f(cy + sg * uy * L), f(A * 1.05), f(B * 1.05), f(math.degrees(th)), f(cx + sg * ux * L), f(cy + sg * uy * L)) for sg in (1, -1))))
    o.append(lobe(1, u + 'lobeF', .9))
    # the equatorial skirt: thin radial streamers, perpendicular to the axis
    sk = []
    px, py = -uy, ux
    for _ in range(70):
        sgn = rnd.choice((-1, 1)); d0 = rnd.uniform(6, 30); d1 = d0 + rnd.uniform(40, 170)
        sp = rnd.gauss(0, .16)
        dx, dy = px * math.cos(sp) - py * math.sin(sp), px * math.sin(sp) + py * math.cos(sp)
        sk.append('<path d="M%s %sL%s %s" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(cx + sgn * dx * d0), f(cy + sgn * dy * d0), f(cx + sgn * dx * d1), f(cy + sgn * dy * d1), rnd.choice(['#ffe8d8', '#ffc8b0', '#fff4ec']), f(rnd.uniform(.08, .3)), f(rnd.uniform(.6, 2.2))))
    o.append('<g filter="url(#%ssk)">%s</g>' % (u, ''.join(sk)))
    o.append(lobe(-1, u + 'lobeN', 1))
    o.append(glow(cx, cy, 60, u + 'waist'))
    o.append(spikes(u, 'w', cx, cy, 230, 5, op=.3, filt='b3') + spikes(u, 'w', cx, cy, 220, 1.8) + glow(cx, cy, 70, u + 'h') + core(u, cx, cy, 12))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .11), defs)
    ann = [top('RA 10H 45M 04S · DEC −59° 41′ · CARINA · 7,500 LY')]
    return bg, obj, svg(W, H, ''.join(ann))


# ----------------------------------------------------------------- worlds
def lit_path(cx, cy, R, a, k):
    """The sunlit part of a disc: a half circle toward the light closed by the terminator, a half ellipse. k = 1 full, 0 half, -1 new."""
    b = abs(k) * R
    sweep = 1 if k >= 0 else 0
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    P = lambda x, y: (cx + x * ca - y * sa, cy + x * sa + y * ca)
    (x0, y0), (x1, y1) = P(0, -R), P(0, R)
    return 'M%s %sA%s %s %s 0 1 %s %sA%s %s %s 0 %d %s %sZ' % (f(x0), f(y0), f(R), f(R), f(a), f(x1), f(y1), f(max(.01, b)), f(R), f(a), sweep, f(x0), f(y0))


def sphere(u, k, cx, cy, R, tex, lights, night=('#020308', .94), limb=.55, rim=True, rimcol=None):
    """A globe lit by one or more suns. tex is drawn once in defs and reused; each light is (angle toward it in degrees, tint, phase -1..1, softness in R, tint strength)."""
    defs = ['<clipPath id="%s%sc"><circle cx="%s" cy="%s" r="%s"/></clipPath><g id="%s%st">%s</g>' % (u, k, f(cx), f(cy), f(R), u, k, tex)]
    body = ['<use href="#%s%st"/><rect x="%s" y="%s" width="%s" height="%s" fill="%s" opacity="%s"/>' % (u, k, f(cx - R), f(cy - R), f(2 * R), f(2 * R), night[0], f(night[1]))]
    rims = []
    box = (f(cx - R * 1.5), f(cy - R * 1.5), f(3 * R), f(3 * R))
    for i, (a, col, ph, soft, tint) in enumerate(lights):
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        defs.append(blur(u, '%sS%d' % (k, i), R * soft, 20))
        defs.append('<mask id="%s%sM%d" maskUnits="userSpaceOnUse" x="%s" y="%s" width="%s" height="%s"><path d="%s" fill="#fff" filter="url(#%s%sS%d)"/></mask>' % (
            (u, k, i) + box + (lit_path(cx, cy, R, a, ph), u, k, i)))
        defs.append(rg(u, '%sH%d' % (k, i), [(0, col, .42), (.45, col, .12), (1, col, 0)], f(cx + R * .6 * ca), f(cy + R * .6 * sa), f(R * 1.1), ' gradientUnits="userSpaceOnUse"'))
        body.append('<g mask="url(#%s%sM%d)"%s><use href="#%s%st"/><rect x="%s" y="%s" width="%s" height="%s" fill="%s" opacity="%s" style="mix-blend-mode: multiply"/>'
                    '<rect x="%s" y="%s" width="%s" height="%s" fill="url(#%s%sH%d)" style="mix-blend-mode: screen"/></g>' % (
                        u, k, i, ' style="mix-blend-mode: screen"' if i else '', u, k, f(cx - R), f(cy - R), f(2 * R), f(2 * R), col, f(tint), f(cx - R), f(cy - R), f(2 * R), f(2 * R), u, k, i))
        if rim:
            rims.append('<g mask="url(#%s%sM%d)"><circle cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-opacity=".75" stroke-width="%s" filter="url(#%s%sR)"/></g>' % (
                u, k, i, f(cx), f(cy), f(R * .995), rimcol or col, f(max(1.2, R * .025)), u, k))
    defs.append(rg(u, k + 'D', [(0, '#000', 0), (.62, '#000', 0), (.9, '#000', limb * .45), (1, '#000', limb)], f(cx), f(cy), f(R), ' gradientUnits="userSpaceOnUse"'))
    defs.append(blur(u, k + 'R', max(.8, R * .012)))
    body.append('<circle cx="%s" cy="%s" r="%s" fill="url(#%s%sD)"/>' % (f(cx), f(cy), f(R), u, k))
    return ''.join(defs), '<g clip-path="url(#%s%sc)">%s</g>%s' % (u, k, ''.join(body), ''.join(rims))


def surface(u, k, cx, cy, R, rnd, cols, freq='.03', seed=1, spots=(), bands=None, clouds=0, cloud_col='#ffffff', tilt=0, mottle=.3):
    """Paint for a world: base gradient, noise mottling, dark and light patches, optional bands and cloud streaks. Returns (defs, tex)."""
    x, y, w = cx - R, cy - R, 2 * R
    defs = (rg(u, k + 'g', [(0, cols[0], 1), (.6, cols[1], 1), (1, cols[2], 1)], '.45', '.45', '.7') +
            noise(u, k + 'n', freq, 5, seed, (2.8, -1.05), (0, 0, 0)) + noise(u, k + 'm', f(float(freq) * 3.2), 3, seed + 1, (2.2, -.9), (1, 1, 1)) + blur(u, k + 'b', max(.6, R * .04), 20))
    t = ['<rect x="%s" y="%s" width="%s" height="%s" fill="url(#%s%sg)"/>' % (f(x), f(y), f(w), f(w), u, k)]
    if bands:
        g = []
        for j in range(int(bands[0])):
            yy = y - R * .2 + (w + R * .4) * rnd.random()
            g.append('<rect x="%s" y="%s" width="%s" height="%s" fill="%s" opacity="%s"/>' % (f(x - R), f(yy), f(w + 2 * R), f(rnd.uniform(.01, .07) * w), rnd.choice(bands[1]), f(rnd.uniform(.3, .8))))
        t.append('<g filter="url(#%s%sw)" transform="rotate(%s %s %s)">%s</g>' % (u, k, f(tilt), f(cx), f(cy), ''.join(g)))
        defs += '<filter id="%s%sw" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency="%s %s" numOctaves="3" seed="%d"/><feDisplacementMap in="SourceGraphic" scale="%s"/><feGaussianBlur stdDeviation="%s"/></filter>' % (
            u, k, f(.5 / R), f(7 / R), seed, f(R * .1), f(max(.4, R * .008)))
    for sx, sy, sr, col, op in spots:
        t.append('<path d="%s" fill="%s" opacity="%s" filter="url(#%s%sb)"/>' % (blob(cx + sx * R, cy + sy * R, sr * R, sr * R * .7, rnd, 12, .45), col, f(op), u, k))
    t.append('<rect x="%s" y="%s" width="%s" height="%s" filter="url(#%s%sn)" opacity="%s" style="mix-blend-mode: multiply"/>' % (f(x), f(y), f(w), f(w), u, k, f(mottle)))
    t.append('<rect x="%s" y="%s" width="%s" height="%s" filter="url(#%s%sm)" opacity=".16" style="mix-blend-mode: soft-light"/>' % (f(x), f(y), f(w), f(w), u, k))
    if clouds:
        c = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(cx + rnd.uniform(-1, 1) * R), f(cy + rnd.uniform(-1, 1) * R), f(rnd.uniform(.15, .45) * R), f(rnd.uniform(.03, .08) * R), cloud_col, f(rnd.uniform(.3, .75)), f(tilt + rnd.uniform(-12, 12)), f(cx), f(cy)) for _ in range(clouds))
        t.append('<g filter="url(#%s%sb)">%s</g>' % (u, k, c))
    return defs, ''.join(t)


def sun_disc(u, k, cx, cy, R, cols, gran=.08, seed=5, spots=0, rnd=None, gop=.14):
    """A star close enough to show a face: limb-darkened, finely granulated, a few spots, and a bloom that spills over its edge."""
    defs = (rg(u, k + 'f', [(0, cols[0], 1), (.5, cols[1], 1), (.82, cols[2], 1), (1, cols[3], 1)]) +
            noise(u, k + 'n', f(gran), 2, seed, (3.4, -1.2), (0, 0, 0)) + '<clipPath id="%s%sc"><circle cx="%s" cy="%s" r="%s"/></clipPath>' % (u, k, f(cx), f(cy), f(R)) +
            rg(u, k + 'e', [(.8, cols[1], 0), (.9, cols[1], .5), (1, cols[1], 0)]) + blur(u, k + 'eb', max(1, R * .05)))
    sp = ''
    if spots and rnd:
        for _ in range(spots):
            a = rnd.uniform(0, 2 * math.pi); d = R * math.sqrt(rnd.random()) * .75; r = rnd.uniform(.025, .06) * R
            X, Y = cx + d * math.cos(a), cy + d * math.sin(a)
            sp += '<circle cx="%s" cy="%s" r="%s" fill="%s" opacity=".35"/><circle cx="%s" cy="%s" r="%s" fill="%s" opacity=".55"/>' % (f(X), f(Y), f(r * 1.8), cols[2], f(X), f(Y), f(r), cols[3])
    body = ('<g clip-path="url(#%s%sc)"><circle cx="%s" cy="%s" r="%s" fill="url(#%s%sf)"/><rect x="%s" y="%s" width="%s" height="%s" filter="url(#%s%sn)" opacity="%s" style="mix-blend-mode: multiply"/>%s</g>'
            '<circle cx="%s" cy="%s" r="%s" fill="url(#%s%se)" filter="url(#%s%seb)"/>' % (
                u, k, f(cx), f(cy), f(R), u, k, f(cx - R), f(cy - R), f(2 * R), f(2 * R), u, k, f(gop), sp, f(cx), f(cy), f(R * 1.1), u, k, u, k))
    return defs, body


# ================================================================= TRAPPIST-1
def trappist(u):
    """An ultracool red dwarf no bigger than Jupiter, and its seven Earth-sized worlds strung out in a sweeping arc, each a different world at a different phase."""
    rnd = random.Random(2017)
    sx, sy, SR = 144, 196, 50
    sd = base(u, 'bg', [(0, '#1e0c10'), (.5, '#0c0609'), (1, '#030204')], '.25', '.95')
    bg = plate_sky(u, 'bg', starfield(W, H, 280, 2017, 0, ('#ffffff', '#fff1dc', '#ffe0d0', '#dfe8ff'), u), sd + SPIKE_DEFS.format(u=u))
    ddefs, disc = sun_disc(u, 'st', sx, sy, SR, ('#ffb070', '#ff8a48', '#e0502a', '#a8281a'), .12, 3, 7, rnd)
    defs = [ddefs, rg(u, 'sg', [(0, '#ff9050', .9), (.2, '#ff6a3a', .45), (.45, '#e8402a', .14), (1, '#c02a20', 0)]),
            rg(u, 'wash', [(0, '#ff6a40', .22), (.5, '#c83a2a', .06), (1, '#c83a2a', 0)]), blur(u, 'b3', 3), blur(u, 'b10', 10),
            warp(u, 'fl', '.05', 2, 8, 6, 1.2)]
    o = [glow(sx, sy, 560, u + 'wash'), glow(sx, sy, 190, u + 'sg'), disc]
    # a flare loop on the limb: these little stars are violently active
    loop = 'M%s %sC%s %s %s %s %s %s' % (f(sx + SR * .62), f(sy - SR * .78), f(sx + SR * 1.1), f(sy - SR * 1.7), f(sx + SR * 1.75), f(sy - SR * 1.05), f(sx + SR * .97), f(sy - SR * .24))
    o.append('<path d="%s" fill="none" stroke="#ff8a50" stroke-opacity=".45" stroke-width="9" filter="url(#%sb3)"/><path d="%s" fill="none" stroke="#ffd0a0" stroke-opacity=".75" stroke-width="2.2" filter="url(#%sfl)"/>' % (loop, u, loop, u))
    o.append('<circle cx="%s" cy="%s" r="%s" fill="none" stroke="#ffb080" stroke-opacity=".5" stroke-width="3" filter="url(#%sb3)"/>' % (f(sx), f(sy), f(SR), u))
    # b..h: position, radius, terminator, palette, extras
    worlds = [
        ('b', 236, 246, 11, .5, ('#7a6458', '#5a4238', '#2a1c16'), {'spots': [(.2, .1, .3, '#3a2a24', .6)]}),
        ('c', 292, 282, 14, .35, ('#c09a7a', '#94705a', '#4a3a30'), {'spots': [(-.2, -.1, .3, '#6a4a38', .5)]}),
        ('d', 342, 330, 13, .2, ('#7a9ac0', '#4a6a9a', '#22345a'), {'clouds': 8}),
        ('e', 380, 392, 21, 0, ('#4a86b0', '#2e5a86', '#16284a'), {'clouds': 14, 'spots': [(-.3, .1, .35, '#9a8a58', .8), (.35, -.25, .25, '#6a8a50', .7)]}),
        ('f', 392, 470, 30, -.15, ('#a4ccd4', '#6a9cae', '#3a5a6a'), {'clouds': 16, 'bands': (8, ['#d8ecf0', '#5a8898'])}),
        ('g', 336, 552, 44, -.35, ('#eef4fa', '#bccfe0', '#6a7a90'), {'spots': [(-.2, .2, .3, '#8aa0b8', .5), (.3, -.3, .2, '#ffffff', .6)], 'clouds': 10}),
        ('h', 204, 566, 34, -.5, ('#d4c8d8', '#a494b0', '#5a5068'), {'spots': [(.1, .1, .35, '#6a5a70', .5)]}),
    ]
    lab = []
    pts = [(sx, sy)] + [(x, y) for _, x, y, *_ in worlds]
    o.append('<path d="M%s" fill="none" stroke="#ff8a60" stroke-opacity=".06" stroke-width="44" stroke-linejoin="round" stroke-linecap="round" filter="url(#%sb10)"/>' % ('L'.join('%s %s' % (f(a), f(b)) for a, b in pts), u))
    for i, (n, x, y, r, term, cols, ex) in enumerate(worlds):
        tdefs, tex = surface(u, 'p' + n, x, y, r, rnd, cols, '.08' if r < 15 else '.045', 30 + i, ex.get('spots', ()), ex.get('bands'), ex.get('clouds', 0), '#f4f0f0', mottle=.22)
        a = math.degrees(math.atan2(sy - y, sx - x))
        sdefs, body = sphere(u, 'q' + n, x, y, r, tex, [(a, '#ffb890', term, .06, .25)], ('#0c0408', .8), rimcol='#ffd0b0')
        defs.append(tdefs + sdefs)
        o.append('<circle cx="%s" cy="%s" r="%s" fill="#ff7a50" opacity=".12" filter="url(#%sb3)"/>' % (f(x), f(y), f(r * 1.12), u) + body)
        lab.append('<text x="%s" y="%s" fill="rgba(245,241,232,.55)" style="%s" text-anchor="middle">%s</text>' % (f(x), f(y + r + 13), LBL, n.upper()))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), ''.join(defs))
    ann = [top('RA 23H 06M 29S · DEC −05° 02′ · AQUARIUS · 40 LY')] + lab
    return bg, obj, svg(W, H, ''.join(ann))


PLATES = {'ALPHA-CEN': alpha_cen, 'SIRIUS': sirius, 'VEGA': vega, 'ARCTURUS': arcturus,
          'ALDEBARAN': aldebaran, 'POLARIS': polaris, 'MIRA': mira,
          'BETELGEUSE': betelgeuse, 'ANTARES': antares, 'RIGEL': rigel, 'ETA-CARINAE': eta_carinae,
          'TRAPPIST-1': trappist}

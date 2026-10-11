"""Painting helpers shared by the plates: blurs, noise, gradients, smooth
paths and arcs, and an orthographic globe with drawn land (the Earth's palette
in EARTH). Not a plate module itself; fl_*.py modules import from it."""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL
from more import sky, top, spike_star, W, HF


def blur(u, name, sd, pad=30):
    return '<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feGaussianBlur stdDeviation="%s"/></filter>' % (u, name, pad, pad, 100 + 2 * pad, 100 + 2 * pad, f(sd))


def noise(u, name, freq, octaves, seed, sat=0):
    return ('<filter id="%s%s" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="%d" seed="%d"/>'
            '<feColorMatrix type="saturate" values="%s"/></filter>') % (u, name, freq, octaves, seed, sat)


def g4(x):
    return ('%.4f' % x).rstrip('0').rstrip('.') or '0'


def lin(u, name, stops, x1=0, y1=0, x2=0, y2=1, units=''):
    st = ''.join('<stop offset="%s" stop-color="%s"%s/>' % (g4(o), c, '' if a is None else ' stop-opacity="%s"' % g4(a)) for o, c, a in stops)
    return '<linearGradient id="%s%s" x1="%s" y1="%s" x2="%s" y2="%s"%s>%s</linearGradient>' % (u, name, g4(x1), g4(y1), g4(x2), g4(y2), units, st)


def rad(u, name, stops, cx=.5, cy=.5, r=.5, extra=''):
    st = ''.join('<stop offset="%s" stop-color="%s"%s/>' % (g4(o), c, '' if a is None else ' stop-opacity="%s"' % g4(a)) for o, c, a in stops)
    return '<radialGradient id="%s%s" cx="%s" cy="%s" r="%s"%s>%s</radialGradient>' % (u, name, g4(cx), g4(cy), g4(r), extra, st)


def smooth(pts, closed=True):
    """A closed (or open) curve through the midpoints of pts, the points themselves as controls."""
    if closed:
        mids = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in zip(pts, pts[1:] + pts[:1])]
        return 'M%s %s' % (f(mids[-1][0]), f(mids[-1][1])) + ''.join('Q%s %s %s %s' % (f(p[0]), f(p[1]), f(m[0]), f(m[1])) for p, m in zip(pts, mids)) + 'Z'
    d = 'M%s %s' % (f(pts[0][0]), f(pts[0][1]))
    for i in range(1, len(pts) - 1):
        m = ((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
        d += 'Q%s %s %s %s' % (f(pts[i][0]), f(pts[i][1]), f(m[0]), f(m[1]))
    return d + 'L%s %s' % (f(pts[-1][0]), f(pts[-1][1]))


def arc(cx, cy, r, a0, a1, rx=None, ry=None):
    """An arc from angle a0 to a1 (radians, clockwise on screen)."""
    rx = r if rx is None else rx; ry = r if ry is None else ry
    large = 1 if abs(a1 - a0) > math.pi else 0
    return 'M%s %sA%s %s 0 %d 1 %s %s' % (f(cx + rx * math.cos(a0)), f(cy + ry * math.sin(a0)), f(rx), f(ry), large, f(cx + rx * math.cos(a1)), f(cy + ry * math.sin(a1)))


def sphere(lat, lon, tilt):
    """A point on the unit sphere, the pole tipped toward us by tilt (radians): x right, y down, z toward the eye."""
    x = math.cos(lat) * math.sin(lon); y = -math.sin(lat); z = math.cos(lat) * math.cos(lon)
    return x, y * math.cos(tilt) - z * math.sin(tilt), y * math.sin(tilt) + z * math.cos(tilt)


def globe(u, k, cx, cy, R, tilt, rot, light, seed, pal, conts, city=0, extra=''):
    """A living world: fractal continents on the sphere, biomes, shelves, cloud systems casting shadows,
    an ocean glint, a true terminator and (optionally) coastal cities on the night side. Returns (defs, body)."""
    rnd = random.Random(seed)
    lx, ly, lz = light
    ln = math.sqrt(lx * lx + ly * ly + lz * lz); lx, ly, lz = lx / ln, ly / ln, lz / ln
    t = math.radians(rot)
    ct, st_ = math.cos(t), math.sin(t)
    K = u + k

    def P(x, y):
        return cx + R * (x * ct - y * st_), cy + R * (x * st_ + y * ct)

    def pt(lat, lon):
        x, y, z = sphere(lat, lon, tilt)
        if z < 0:
            n = math.hypot(x, y) or 1
            x, y = x / n, y / n
        return P(x, y), z

    def dark(lat, lon):
        x, y, z = sphere(lat, lon, tilt)
        return x * lx + y * ly + z * lz, z

    def path(pts):
        return 'M' + 'L'.join('%s %s' % (round(x), round(y)) for x, y in pts) + 'Z'

    def shape(lat0, lon0, rb, n=70, rough=.36, top=22):
        amps = [(h, rnd.uniform(-1, 1) * rough / h ** .85, rnd.uniform(0, 6.3)) for h in range(2, top)]
        pts, verts, vis = [], [], False
        for i in range(n):
            a = 2 * math.pi * i / n
            r = max(rb * .12, rb * (1 + sum(A * math.sin(h * a + ph) for h, A, ph in amps)))
            la = max(-1.55, min(1.55, lat0 + r * math.sin(a)))
            lo = lon0 + r * math.cos(a) / max(.25, math.cos(lat0))
            (X, Y), z = pt(la, lo)
            pts.append((X, Y)); verts.append((la, lo, z))
            vis = vis or z > 0
        return (path(pts), verts) if vis else (None, None)

    lands, coast, biome = [], [], {b: [] for b in ('forest', 'desert', 'grass', 'snow')}
    ridges = []
    for lat0, lon0, size, nb in conts:
        for j in range(nb):
            la, lo = lat0 + rnd.gauss(0, size * .55), lon0 + rnd.gauss(0, size * .7)
            d, verts = shape(la, lo, size * rnd.uniform(.35, .8))
            if not d: continue
            lands.append(d); coast += verts
            for _ in range(2):
                bl, bo = la + rnd.gauss(0, size * .25), lo + rnd.gauss(0, size * .3)
                kind = 'desert' if abs(bl) < .45 and rnd.random() < pal.get('dry', .4) else ('snow' if abs(bl) > 1.05 else rnd.choice(['forest', 'forest', 'grass']))
                bd, _ = shape(bl, bo, size * rnd.uniform(.12, .32), 48, .45, 12)
                if bd: biome[kind].append(bd)
            if rnd.random() < .7:   # a mountain chain along the continent
                a = rnd.uniform(0, math.pi); L = size * rnd.uniform(.4, .9)
                rp = []
                for s in range(14):
                    q = (s / 13 - .5) * L
                    (X, Y), z = pt(la + q * math.sin(a) + rnd.gauss(0, .006), lo + q * math.cos(a) / max(.3, math.cos(la)))
                    if z > .05: rp.append((X, Y))
                if len(rp) > 3: ridges.append('M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in rp))
    # archipelagos: island chains curving across the ocean
    for _ in range(pal.get('isles', 4)):
        la, lo = rnd.uniform(-.9, .9), rnd.uniform(-2.2, 2.2)
        a = rnd.uniform(0, 6.3)
        for s in range(rnd.randint(5, 11)):
            la += .035 * math.sin(a); lo += .05 * math.cos(a); a += rnd.uniform(-.3, .3)
            d, verts = shape(la, lo, rnd.uniform(.01, .03), 14, .5, 6)
            if d: lands.append(d); coast += verts
    for sgn in (1, -1):   # polar ice
        d, _ = shape(sgn * 1.5, 0, .28, 90, .25, 14)
        if d: biome['snow'].append(d)
    land = ''.join(lands)
    sx_, sy_ = lx * ct - ly * st_, lx * st_ + ly * ct
    sl = math.hypot(sx_, sy_) or 1; sx_, sy_ = sx_ / sl, sy_ / sl
    phi = math.degrees(math.atan2(sy_, sx_))

    # ---------------- clouds, in the sphere's own frame
    cl_soft, cl_crisp = [], []

    def poly(pts_ll, width, op, soft=True, col='#ffffff'):
        seg = []
        for la, lo in pts_ll:
            (X, Y), z = pt(la, lo)
            if z > .02: seg.append((X, Y, z))
            elif len(seg) > 1: break
        if len(seg) < 2: return
        zz = sum(p[2] for p in seg) / len(seg)
        d = 'M' + 'L'.join('%d %d' % (round(x), round(y)) for x, y, _ in seg)
        s = '<path d="%s" stroke-opacity="%s" stroke-width="%s"/>' % (d, f(op), f(width * (.35 + .65 * zz ** .5)))
        (cl_soft if soft else cl_crisp).append(s)
    for c in range(pal.get('cyclones', 4)):
        la0 = rnd.choice([-1, 1]) * rnd.uniform(.5, .95) if c else rnd.uniform(.2, .35) * rnd.choice([-1, 1])
        lo0 = rnd.uniform(-1.3, 1.3)
        sp = 1 if la0 > 0 else -1
        size = rnd.uniform(.9, 1.4)
        for arm in range(2):
            pts_ll = []
            for s in range(40):
                th = s / 39 * 2.3 * math.pi
                r = (.01 + .016 * th ** 1.15) * size
                an = sp * th + arm * math.pi + rnd.gauss(0, .04)
                pts_ll.append((la0 + r * math.sin(an), lo0 + r * math.cos(an) / math.cos(la0)))
            poly(pts_ll, 18 * size, .5)
            poly(pts_ll, 6 * size, .7, False)
        (X0, Y0), z0 = pt(la0, lo0)
        if z0 > .1:
            cl_soft.append('<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity=".6"/>' % (f(X0), f(Y0), f(R * .03 * size * z0 ** .5)))
        # the trailing front, sweeping toward the equator
        pts_ll = [(la0 - sp * s * .03 - rnd.gauss(0, .004), lo0 - s * .05 - (s * s) * .0025) for s in range(24)]
        poly(pts_ll, 16 * size, .45)
        poly(pts_ll, 5 * size, .6, False)
    for _ in range(int(230 * pal.get('streaks', 1))):   # streaks in the storm tracks and along the doldrums
        la = rnd.choice([rnd.gauss(.8, .15), rnd.gauss(-.8, .15), rnd.gauss(.08, .06)])
        lo = rnd.uniform(-2, 2); L = rnd.uniform(.08, .5)
        pts_ll = [(la + rnd.gauss(0, .004) + .02 * math.sin(s), lo + L * s / 7) for s in range(8)]
        poly(pts_ll, rnd.uniform(5, 14), rnd.uniform(.25, .5))
        if rnd.random() < .5: poly(pts_ll, rnd.uniform(.8, 2.2), rnd.uniform(.3, .6), False)
    puffs = []
    for _ in range(int(260 * pal.get('puffs', 1))):   # fair-weather cumulus
        la, lo = rnd.uniform(-.75, .75), rnd.uniform(-1.6, 1.6)
        x, y, z = sphere(la, lo, tilt)
        if z < .1: continue
        X, Y = P(x, y)
        puffs.append('M%s %sh.01' % (f(X), f(Y)))
    cloud = ('<g filter="url(#%scwisp)" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"><g filter="url(#%scb)">%s<path d="%s" stroke="#ffffff" stroke-opacity=".7" stroke-width="%s" stroke-linecap="round"/></g>%s</g>' % (
        K, K, ''.join(cl_soft), ''.join(puffs), f(R * .03), ''.join(cl_crisp)))
    ghx, ghy, ghz = lx, ly, lz + 1
    gn = math.sqrt(ghx * ghx + ghy * ghy + ghz * ghz)
    GX, GY = P(ghx / gn, ghy / gn)
    tz = max(.02, abs(lz))
    night = 'M0 -1A1 1 0 0 0 0 1A%s 1 0 0 %d 0 -1Z' % (g4(tz), 1 if lz > 0 else 0)
    defs = (('<clipPath id="%sdisk"><circle cx="%s" cy="%s" r="%s"/></clipPath><path id="%slp" d="%s"/><clipPath id="%sland"><use href="#%slp"/></clipPath>'
             '<filter id="%scb" x="-10%%" y="-10%%" width="120%%" height="120%%"><feGaussianBlur stdDeviation="%s"/></filter>'
             '<filter id="%scsh" x="-10%%" y="-10%%" width="120%%" height="120%%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 .01  0 0 0 0 .03  0 0 0 0 .08  0 0 0 .55 0"/><feGaussianBlur stdDeviation="%s"/></filter>'
             '<filter id="%stex" x="0" y="0" width="100%%" height="100%%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="4" seed="%d"/><feColorMatrix type="saturate" values="0"/></filter>'
             '<filter id="%snt1" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation=".07"/></filter>'
             '<filter id="%snt2" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation=".018"/></filter>'
             '<filter id="%sb2" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="%s"/></filter>'
             '<filter id="%sb6" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="%s"/></filter>'
             '<filter id="%scwisp" x="-5%%" y="-5%%" width="110%%" height="110%%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="4" seed="%d" result="n"/>'
             '<feDisplacementMap in="SourceGraphic" in2="n" scale="%s" xChannelSelector="R" yChannelSelector="G" result="d"/>'
             '<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -.95" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>'
             '<g id="%scloud">%s</g>') % (
        K, f(cx), f(cy), f(R), K, land, K, K, K, f(R * .012), K, f(R * .01), K, g4(8 / R), seed % 97, K, K, K, f(R * .008), K, f(R * .025), K, g4(6 / R), seed % 89 + 3, f(R * .09), K, cloud) +
        rad(K, 'sea', pal['sea'], .5 + .28 * sx_, .5 + .28 * sy_, .75) +
        rad(K, 'glint', [(0, '#fffaf0', .55), (.25, '#dff0ff', .22), (1, '#dff0ff', 0)]) +
        rad(K, 'limb', [(.72, '#000', 0), (.94, '#000', .3), (1, '#000', .6)]) +
        rad(K, 'haze', [(.78, pal['haze'], 0), (.96, pal['haze'], .32), (1, pal['haze'], .6)]) +
        rad(K, 'sheen', [(0, '#fff', .16), (1, '#fff', 0)]))
    L_ = pal['land']
    b = ['<circle cx="%s" cy="%s" r="%s" fill="url(#%ssea)"/>' % (f(cx), f(cy), f(R), K),
         '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%sglint)"/>' % (f(GX), f(GY), f(R * .32), f(R * .26), K),
         '<use href="#%slp" fill="none" stroke="%s" stroke-width="%s" stroke-opacity=".5" filter="url(#%sb6)"/>' % (K, pal['shelf'], f(R * .05), K),
         '<use href="#%slp" fill="none" stroke="%s" stroke-width="%s" stroke-opacity=".45" filter="url(#%sb2)"/>' % (K, pal['shelf'], f(R * .014), K),
         '<use href="#%slp" fill="%s"/>' % (K, L_)]
    inner = ['<path d="%s" fill="%s" opacity=".8" filter="url(#%sb2)"/>' % (''.join(v), pal[kk], K) for kk, v in biome.items() if v and kk != 'snow']
    inner.append('<rect x="%s" y="%s" width="%s" height="%s" filter="url(#%stex)" opacity=".4" style="mix-blend-mode: multiply"/>' % (f(cx - R), f(cy - R), f(2 * R), f(2 * R), K))
    if ridges:
        rd = ''.join(ridges)
        inner.append('<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity=".45" stroke-linecap="round" filter="url(#%sb6)"/>' % (rd, pal['mount'], f(R * .035), K))
        inner.append('<path d="%s" fill="none" stroke="#f4ecd8" stroke-width="%s" stroke-opacity=".3" stroke-linecap="round" filter="url(#%sb2)" transform="translate(%s %s)"/>' % (rd, f(R * .01), K, f(sx_ * 2), f(sy_ * 2)))
    b.append('<g clip-path="url(#%sland)">%s</g>' % (K, ''.join(inner)))
    b.append('<use href="#%slp" fill="none" stroke="#f4f0e0" stroke-opacity=".18" stroke-width=".5"/>' % K)
    if biome['snow']:
        b.append('<path d="%s" fill="#f4f8fc" opacity=".92" filter="url(#%sb2)"/>' % (''.join(biome['snow']), K))
    b.append('<use href="#%scloud" filter="url(#%scsh)" transform="translate(%s %s)"/>' % (K, K, f(-sx_ * R * .018), f(-sy_ * R * .018)))
    b.append('<use href="#%scloud"/>' % K)
    b.append(extra)
    b.append('<circle cx="%s" cy="%s" r="%s" fill="url(#%shaze)"/>' % (f(cx), f(cy), f(R), K))
    b.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%ssheen)"/>' % (f(cx + sx_ * R * .4), f(cy + sy_ * R * .4), f(R * .7), f(R * .7), K))
    b.append('<circle cx="%s" cy="%s" r="%s" fill="url(#%slimb)"/>' % (f(cx), f(cy), f(R), K))
    tf = 'translate(%s %s) rotate(%s) scale(%s)' % (f(cx), f(cy), f(phi), f(R))
    b.append('<g transform="%s"><path d="%s" fill="%s" opacity=".6" filter="url(#%snt1)"/><path d="%s" fill="%s" opacity=".86" filter="url(#%snt2)"/>'
             '<path d="%s" fill="none" stroke="#ff9a5a" stroke-opacity=".22" stroke-width=".05" filter="url(#%snt1)"/></g>' % (
                 tf, night, pal['night'], K, night, pal['night'], K, 'M0 -1A%s 1 0 0 %d 0 1' % (g4(tz), 0 if lz > 0 else 1), K))
    if city:
        dots_, glows = [], []
        for la, lo, z in coast[::2]:
            dd, zz = dark(la, lo)
            if zz < .08 or dd > -.05 or rnd.random() > city: continue
            (X, Y), _ = pt(la, lo)
            for _ in range(rnd.randint(1, 4)):
                dots_.append('M%s %sh.01' % (f(X + rnd.gauss(0, 2.2 * zz)), f(Y + rnd.gauss(0, 1.6 * zz))))
            if rnd.random() < .08: glows.append('<circle cx="%s" cy="%s" r="%s" fill="#ffb850"/>' % (f(X), f(Y), f(1.5 + 2 * zz)))
        b.append('<g filter="url(#%sb2)" opacity=".4">%s</g>' % (K, ''.join(glows)))
        b.append('<path d="%s" stroke="#ffd890" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' % ''.join(dots_))
    body = '<g clip-path="url(#%sdisk)">%s</g>' % (K, ''.join(b))
    body += '<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity=".5" filter="url(#%sb6)"/>' % (arc(cx, cy, R * 1.01, math.radians(phi - 95), math.radians(phi + 95)), pal['rim'], f(R * .035), K)
    body += '<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity=".85" filter="url(#%sb2)"/>' % (arc(cx, cy, R * 1.003, math.radians(phi - 80), math.radians(phi + 80)), pal['rim'], f(R * .009), K)
    return defs, body


EARTH = {'sea': [(0, '#2f7fc4', None), (.45, '#15508e', None), (.85, '#0a2c5c', None), (1, '#061a3a', None)],
         'shelf': '#5ac0d8', 'land': '#5a7a44', 'forest': '#2c5a2e', 'grass': '#8a9a5a', 'desert': '#c8a870', 'mount': '#3a3226',
         'haze': '#8ec8ff', 'rim': '#a8dcff', 'night': '#01040c', 'dry': .5}


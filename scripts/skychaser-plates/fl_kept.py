"""First Light's three held things, drawn: the observatory's first frame, a
pallasite slice, a piece of the Moon. Full-art canvas, W × HF."""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL, label, scalebar, reticle
from more import sky, top, spike_star, W, HF


# ================================================================= FIRST LIGHT
def first_light(u):
    h = HF
    rnd = random.Random(1)
    sx, sy = 291, 318
    bg_defs = SPIKE_DEFS.format(u=u) + ('<radialGradient id="%shz" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#0c1224"/><stop offset=".6" stop-color="#05080f"/><stop offset="1" stop-color="#010204"/></radialGradient>'
                                        '<filter id="%ssn" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="11"/><feColorMatrix type="saturate" values="0"/></filter>') % (u, u)
    # a raw sensor field: faint stars, read noise, a few hot pixels
    hot = ''.join('<rect x="%s" y="%s" width="1.2" height="1.2" fill="%s"/>' % (f(rnd.uniform(0, W)), f(rnd.uniform(0, h)), rnd.choice(['#fff', '#ffd8d8', '#d8e8ff'])) for _ in range(28))
    bg = svg(W, h, '<rect width="%d" height="%d" fill="url(#%shz)"/>' % (W, h, u) + starfield(W, h, 120, 7, 0, tints=('#dfe8ff', '#ffffff', '#cfd8ea'), u=u) +
             '<rect width="%d" height="%d" filter="url(#%ssn)" opacity=".14" style="mix-blend-mode: screen"/>' % (W, h, u) + hot, bg_defs)

    defs = ('<radialGradient id="%score" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff"/><stop offset=".18" stop-color="#fff7e6"/><stop offset=".4" stop-color="#ffd9a8" stop-opacity=".55"/><stop offset="1" stop-color="#ffb36b" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%shalo" cx=".5" cy=".5" r=".5"><stop offset=".3" stop-color="#ffc98a" stop-opacity="0"/><stop offset=".62" stop-color="#ffc98a" stop-opacity=".18"/><stop offset=".7" stop-color="#ffd9a8" stop-opacity=".3"/><stop offset=".78" stop-color="#ffc98a" stop-opacity=".1"/><stop offset="1" stop-color="#ffc98a" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="%ssp" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff5e0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
            '<linearGradient id="%sbloom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe6c0" stop-opacity="0"/><stop offset=".5" stop-color="#ffe6c0" stop-opacity=".5"/><stop offset="1" stop-color="#ffe6c0" stop-opacity="0"/></linearGradient>'
            '<filter id="%sb2" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="2"/></filter>'
            '<filter id="%sb9" x="-40%%" y="-40%%" width="180%%" height="180%%"><feGaussianBlur stdDeviation="9"/></filter>'
            '<filter id="%sb1"><feGaussianBlur stdDeviation=".8"/></filter>') % (u, u, u, u, u, u, u)
    o = []
    # a soft column of bloom, the sensor saturating along the star
    o.append('<rect x="%d" y="%d" width="7" height="%d" fill="url(#%sbloom)" filter="url(#%sb2)" opacity=".55"/>' % (sx - 3, sy - 260, 520, u, u))
    # the defocus ring: the star not quite in focus yet
    o.append('<circle cx="%d" cy="%d" r="150" fill="url(#%shalo)"/>' % (sx, sy, u))
    o.append('<circle cx="%d" cy="%d" r="60" fill="none" stroke="#ffd9a8" stroke-opacity=".28" stroke-width="7" filter="url(#%sb9)"/>' % (sx, sy, u))
    # diffraction spikes from a four-vane spider
    for ang in (0, 90):
        for L, wdt, op in ((250, 1.6, .9), (180, 3.2, .35), (330, .7, .5)):
            o.append('<rect x="%s" y="%s" width="%s" height="%s" fill="url(#%ssp)" opacity="%s" transform="rotate(%d %d %d)"/>' % (
                f(sx - L), f(sy - wdt / 2), f(2 * L), f(wdt), u, f(op), ang, sx, sy))
    # the star itself, over-exposed
    o.append('<circle cx="%d" cy="%d" r="46" fill="url(#%score)"/>' % (sx, sy, u))
    o.append('<circle cx="%d" cy="%d" r="9" fill="#fff"/>' % (sx, sy))
    # field stars with small spikes, the same optic
    for _ in range(9):
        x, y = rnd.uniform(60, W - 60), rnd.uniform(90, h - 120)
        if math.hypot(x - sx, y - sy) < 120: continue
        r = rnd.uniform(1.2, 2.6)
        o.append(spike_star(x, y, r, '#e8f0ff', 9 * r, op=rnd.uniform(.5, .9), w=.6))
    # a faint galaxy smudge low in the frame, first light finds more than it aimed at
    o.append('<ellipse cx="128" cy="612" rx="26" ry="9" fill="#c6d2ff" opacity=".16" transform="rotate(-28 128 612)" filter="url(#%sb2)"/>' % u)
    # optical vignette: the corners darker than the centre
    o.append('<rect width="%d" height="%d" fill="url(#%svig)"/>' % (W, h, u))
    defs += '<radialGradient id="%svig" cx=".5" cy=".42" r=".7"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>' % u
    obj = svg(W, h, ''.join(o) + grain(u + 'o', W, h, .16), defs)

    # survey: the guide crosshair, frame ticks, a header line
    ann = [top('NODE 01 · FRAME 000001 · SHUTTER OPEN')]
    g = 18
    ann.append('<g stroke="rgba(245,241,232,.5)" stroke-width=".7"><path d="M%d %dH%dM%d %dH%dM%d %dV%dM%d %dV%d"/></g>' % (
        sx - 110, sy, sx - g, sx + g, sy, sx + 110, sx, sy - 110, sy - g, sx, sy + g, sy + 110))
    ann.append('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="rgba(245,241,232,.35)" stroke-width=".6"/>' % (sx, sy, g))
    ann.append(reticle(sx, sy, 176, 72, 4, .14))
    ticks = ''.join('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="rgba(245,241,232,.3)" stroke-width=".6"/>' % (x, h - 40, x, h - 40 - (8 if i % 5 == 0 else 4)) for i, x in enumerate(range(22, W - 20, 12)))
    ann.append(ticks)
    ann.append(label((sx + 60, sy), (560, 470), ['FOCUS', 'CONVERGING · HFR 3.2 → 2.1'], 'end'))
    ann.append(scalebar(22, h - 62, 96, '10 ARCMIN'))
    return bg, obj, svg(W, h, ''.join(ann))


# ================================================================= IMILAC
def poly(cx, cy, rx, ry, rnd, n=6, jit=.18):
    """An angular crystal face: n straight edges, radii jittered."""
    angs = sorted(rnd.uniform(0, 2 * math.pi) for _ in range(n))
    pts = ['%s %s' % (f(cx + rx * (1 + rnd.uniform(-jit, jit)) * math.cos(a)), f(cy + ry * (1 + rnd.uniform(-jit, jit)) * math.sin(a))) for a in angs]
    return 'M' + 'L'.join(pts) + 'Z'


def imilac(u):
    h = HF
    rnd = random.Random(1822)
    cx, cy = 291, 330
    bg = sky(u, h, ('#1a1208', '#0a0704', '#020101'), 40, 22, 0, tints=('#fff1dc', '#ffe0b8'), cy='.4',
             extra='<ellipse cx="%d" cy="%d" rx="260" ry="220" fill="url(#%sback)"/>' % (cx, cy, u),
             extra_defs='<radialGradient id="%sback" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb23a" stop-opacity=".38"/><stop offset=".55" stop-color="#8a4c14" stop-opacity=".14"/><stop offset="1" stop-color="#3a1c06" stop-opacity="0"/></radialGradient>' % u)
    slab = poly(cx, cy, 222, 182, random.Random(3), 11, .1)
    defs = ('<clipPath id="%sslab"><path d="%s"/></clipPath>' % (u, slab) +
            '<linearGradient id="%smetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8d6d0"/><stop offset=".25" stop-color="#7c7a76"/><stop offset=".48" stop-color="#c9c6be"/><stop offset=".7" stop-color="#5f5d5a"/><stop offset="1" stop-color="#a8a59e"/></linearGradient>'
            '<filter id="%setch" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".04 .4" numOctaves="2" seed="5"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sgr" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="9"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sb1"><feGaussianBlur stdDeviation="1"/></filter>'
            '<filter id="%sb3" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="3"/></filter>'
            '<filter id="%sb12" x="-40%%" y="-40%%" width="180%%" height="180%%"><feGaussianBlur stdDeviation="14"/></filter>'
            '<linearGradient id="%sspec" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".38" stop-color="#fff" stop-opacity=".12"/><stop offset=".47" stop-color="#fff" stop-opacity=".42"/><stop offset=".56" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>') % (u, u, u, u, u, u, u)
    # back-lit olivine: a bright honey heart falling to deep amber and bottle green at the edges
    pal = [('#ffe28a', '#f0a82e', '#7a4a0c'), ('#f6ff9a', '#b8d23a', '#3e5a10'), ('#ffc95a', '#d97a18', '#5a2e08'), ('#e2ff7a', '#8fbf2c', '#2f4a10'), ('#fff0b0', '#ffc24a', '#8a5a12'), ('#ffb03a', '#c25a10', '#4a2206')]
    for i, (a, b, c) in enumerate(pal):
        defs += '<radialGradient id="%sol%d" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="%s"/><stop offset=".45" stop-color="%s"/><stop offset="1" stop-color="%s"/></radialGradient>' % (u, i, a, b, c)
    o = ['<path d="%s" fill="#000" opacity=".8" transform="translate(8 18)" filter="url(#%sb12)"/>' % (slab, u),
         '<g clip-path="url(#%sslab)">' % u,
         '<rect width="%d" height="%d" fill="url(#%smetal)"/>' % (W, h, u),
         '<rect width="%d" height="%d" filter="url(#%setch)" opacity=".35" style="mix-blend-mode: multiply"/>' % (W, h, u)]
    # crystals: angular, packed edge to edge, sized by distance from the heart
    placed, tries = [], 0
    while len(placed) < 420 and tries < 40000:
        tries += 1
        x, y = rnd.uniform(cx - 225, cx + 225), rnd.uniform(cy - 185, cy + 185)
        d = math.hypot((x - cx) / 222, (y - cy) / 182)
        if d > 1.02: continue
        r = rnd.uniform(12, 36) * (1.05 - .25 * d)
        if any(math.hypot(x - px, y - py) < (r + pr) * .6 for px, py, pr in placed): continue
        placed.append((x, y, r))
    crystals = []
    for x, y, r in placed:
        d = math.hypot((x - cx) / 222, (y - cy) / 182)
        i = rnd.choice([0, 0, 2, 2, 4, 4, 5, 1, 3])
        rx, ry = r * rnd.uniform(.95, 1.25), r * rnd.uniform(.8, 1.1)
        shape = poly(x, y, rx, ry, rnd, rnd.randint(6, 9), .12)
        lit = 1 - .5 * min(1, d)
        crystals.append('<path d="%s" fill="#ffc84a" opacity="%s" filter="url(#%sb3)"/>' % (shape, f(.5 * lit), u))
        crystals.append('<path d="%s" fill="url(#%sol%d)" opacity="%s" stroke="#1e1206" stroke-opacity=".7" stroke-width=".8"/>' % (shape, u, i, f(.72 + .28 * lit)))
        # an internal fracture and a glassy facet highlight
        if rnd.random() < .7:
            ax, ay = x + rnd.uniform(-rx * .4, rx * .4), y + rnd.uniform(-ry * .4, ry * .4)
            crystals.append('<path d="M%s %sL%s %sL%s %s" fill="none" stroke="#3a1c04" stroke-opacity=".45" stroke-width=".7"/>' % (
                f(ax - rx * .5), f(ay + ry * .3), f(ax), f(ay), f(ax + rx * .45), f(ay - ry * .4)))
        crystals.append('<path d="%s" fill="#fff6d8" opacity="%s"/>' % (poly(x - rx * .28, y - ry * .3, rx * .3, ry * .18, rnd, 4, .3), f(.32 * lit)))
    o.append(''.join(crystals))
    # the heart, lit hardest from behind
    o.append('<ellipse cx="%d" cy="%d" rx="130" ry="100" fill="#ffd25a" opacity=".28" filter="url(#%sb12)" style="mix-blend-mode: screen"/>' % (cx - 12, cy - 10, u))
    o.append('<rect width="%d" height="%d" fill="url(#%sspec)" style="mix-blend-mode: screen"/>' % (W, h, u))
    o.append('<rect width="%d" height="%d" filter="url(#%sgr)" opacity=".1" style="mix-blend-mode: overlay"/>' % (W, h, u))
    o.append('</g>')
    # the cut edge: bright bevel over a dark rind
    o.append('<path d="%s" fill="none" stroke="#1a1006" stroke-opacity=".9" stroke-width="4" transform="translate(2 4)"/>' % slab)
    o.append('<path d="%s" fill="none" stroke="#fff3d0" stroke-opacity=".6" stroke-width="1.2"/>' % slab)
    obj = svg(W, h, ''.join(o) + grain(u + 'o', W, h, .1), defs)
    ann = [top('IMILAC · PALLASITE · ATACAMA, CHILE · FOUND 1822')]
    ann.append(label((cx - 70, cy - 20), (22, 580), ['OLIVINE', 'FROM A BROKEN MANTLE']))
    ann.append(label((cx + 170, cy + 110), (560, 640), ['NICKEL-IRON', 'THE CORE AROUND IT'], 'end'))
    ann.append(scalebar(22, h - 62, 120, '2 CM'))
    return bg, obj, svg(W, h, ''.join(ann))


# ================================================================= LUNAR FRAGMENT
def lunar_fragment(u):
    h = HF
    rnd = random.Random(384)
    cx, cy = 286, 356
    # a faint Moon behind, where it came from
    mx, my, mr = 400, 176, 118
    bg_defs = ('<radialGradient id="%smoon" cx=".62" cy=".4" r=".7"><stop offset="0" stop-color="#d9dbe0"/><stop offset=".6" stop-color="#8d9098"/><stop offset="1" stop-color="#4a4d55"/></radialGradient>'
               '<filter id="%smn" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="4" seed="4"/><feColorMatrix type="saturate" values="0"/></filter>'
               '<clipPath id="%smc"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
               '<radialGradient id="%smterm" cx=".22" cy=".5" r=".95"><stop offset=".45" stop-color="#04060d" stop-opacity="0"/><stop offset=".7" stop-color="#04060d" stop-opacity=".7"/><stop offset="1" stop-color="#04060d" stop-opacity=".95"/></radialGradient>') % (u, u, u, mx, my, mr, u)
    moon = ('<g opacity=".3"><circle cx="%d" cy="%d" r="%d" fill="url(#%smoon)"/>'
            '<g clip-path="url(#%smc)"><rect x="%d" y="%d" width="%d" height="%d" filter="url(#%smn)" opacity=".55" style="mix-blend-mode: multiply"/></g>'
            '<circle cx="%d" cy="%d" r="%d" fill="url(#%smterm)"/></g>') % (
        mx, my, mr, u, u, mx - mr, my - mr, 2 * mr, 2 * mr, u, mx, my, mr, u)
    bg = sky(u, h, ('#0e1222', '#05070f', '#010204'), 150, 38, 2, extra=moon, extra_defs=bg_defs, cy='.35')

    outline = blob(cx, cy, 196, 148, random.Random(12), 16, .2)
    defs = ('<clipPath id="%srock"><path d="%s"/></clipPath>' % (u, outline) +
            '<radialGradient id="%sbase" cx=".3" cy=".28" r=".85"><stop offset="0" stop-color="#f3f1ea"/><stop offset=".4" stop-color="#cfccc2"/><stop offset=".75" stop-color="#8d8a82"/><stop offset="1" stop-color="#4c4a45"/></radialGradient>'
            '<radialGradient id="%scrust" cx=".7" cy=".7" r=".8"><stop offset="0" stop-color="#0c0b0a"/><stop offset=".55" stop-color="#1c1a18"/><stop offset="1" stop-color="#3a3632" stop-opacity=".2"/></radialGradient>'
            '<filter id="%sn1" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="5" seed="21"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sn2" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".25" numOctaves="3" seed="8"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sb2" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="2"/></filter>'
            '<filter id="%sb10" x="-40%%" y="-40%%" width="180%%" height="180%%"><feGaussianBlur stdDeviation="12"/></filter>'
            '<filter id="%sb1"><feGaussianBlur stdDeviation=".7"/></filter>'
            '<filter id="%sdisp" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".025" numOctaves="3" seed="6"/><feDisplacementMap in="SourceGraphic" scale="48"/><feGaussianBlur stdDeviation="1.2"/></filter>') % (u, u, u, u, u, u, u, u)
    o = ['<path d="%s" fill="#000" opacity=".75" transform="translate(10 26) scale(1.02 .9)" filter="url(#%sb10)"/>' % (outline, u),
         '<g clip-path="url(#%srock)">' % u,
         '<rect width="%d" height="%d" fill="url(#%sbase)"/>' % (W, h, u),
         '<rect width="%d" height="%d" filter="url(#%sn1)" opacity=".45" style="mix-blend-mode: multiply"/>' % (W, h, u)]
    # breccia: angular white clasts of anorthosite in a darker matrix
    for _ in range(70):
        x, y = rnd.uniform(cx - 190, cx + 190), rnd.uniform(cy - 140, cy + 140)
        if math.hypot((x - cx) / 196, (y - cy) / 148) > .92: continue
        r = rnd.uniform(4, 22)
        o.append('<path d="%s" fill="%s" opacity="%s"/>' % (blob(x, y, r, r * rnd.uniform(.6, 1), rnd, rnd.randint(4, 6), .3), rnd.choice(['#f6f4ee', '#e4e1d8', '#ffffff']), f(rnd.uniform(.35, .8))))
    for _ in range(160):
        x, y = rnd.uniform(cx - 190, cx + 190), rnd.uniform(cy - 140, cy + 140)
        o.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(rnd.uniform(.6, 2.6)), rnd.choice(['#3a3834', '#ffffff', '#6a675f']), f(rnd.uniform(.25, .6))))
    # a few glassy dark clasts
    for _ in range(9):
        x, y = rnd.uniform(cx - 150, cx + 150), rnd.uniform(cy - 100, cy + 100)
        r = rnd.uniform(5, 13)
        o.append('<path d="%s" fill="#2a2b30" opacity=".7"/>' % blob(x, y, r, r * .8, rnd, 5, .3))
    # the fusion crust: the side that faced the air, black and glassy, with contraction cracks
    crust = blob(cx + 128, cy + 74, 200, 180, random.Random(99), 18, .3)
    o.append('<path d="%s" fill="url(#%scrust)" filter="url(#%sdisp)"/>' % (crust, u, u))
    o.append('<ellipse cx="%d" cy="%d" rx="52" ry="14" fill="#8a8f9c" opacity=".22" transform="rotate(-24 %d %d)" filter="url(#%sb2)"/>' % (cx + 120, cy + 60, cx + 120, cy + 60, u))
    for _ in range(26):
        x, y = rnd.uniform(cx + 20, cx + 200), rnd.uniform(cy - 20, cy + 150)
        o.append('<path d="M%s %sl%s %sl%s %s" fill="none" stroke="#000" stroke-opacity=".6" stroke-width=".8"/>' % (
            f(x), f(y), f(rnd.uniform(-14, 14)), f(rnd.uniform(-10, 10)), f(rnd.uniform(-14, 14)), f(rnd.uniform(-10, 10))))
    for _ in range(40):
        x, y = rnd.uniform(cx + 30, cx + 200), rnd.uniform(cy, cy + 150)
        o.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#5a5a60" opacity="%s"/>' % (f(x), f(y), f(rnd.uniform(1, 4)), f(rnd.uniform(.6, 2)), f(rnd.uniform(.15, .4))))
    o.append('<rect width="%d" height="%d" filter="url(#%sn2)" opacity=".18" style="mix-blend-mode: overlay"/>' % (W, h, u))
    # hard light from the upper left: a specular edge, and the shaded side
    o.append('<rect width="%d" height="%d" fill="url(#%sshade)"/>' % (W, h, u))
    defs += '<linearGradient id="%sshade" x1=".1" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></linearGradient>' % u
    o.append('</g>')
    o.append('<path d="%s" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1" filter="url(#%sb1)"/>' % (outline, u))
    obj = svg(W, h, ''.join(o) + grain(u + 'o', W, h, .1), defs)
    ann = [top('LUNAR METEORITE · ANORTHOSITIC BRECCIA · CLASS TBC')]
    ann.append(label((cx - 80, cy - 40), (22, 560), ['ANORTHOSITE', 'THE OLD HIGHLAND CRUST']))
    ann.append(label((cx + 130, cy + 90), (560, 620), ['FUSION CRUST', 'THE SIDE THAT BURNED'], 'end'))
    ann.append(label((mx, my), (560, 96), ['384,400 KM', 'FROM HERE'], 'end', dot=False))
    ann.append(scalebar(22, h - 62, 100, '1 CM'))
    return bg, obj, svg(W, h, ''.join(ann))


PLATES = {'FIRST-LIGHT': first_light, 'IMILAC': imilac, 'LUNAR-FRAGMENT': lunar_fragment}

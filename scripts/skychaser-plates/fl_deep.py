"""First Light: the deep sky and the Almanac, drawn in the manner of drawing.py.

Full-art plates: 582 × 832, the subject in the upper two thirds, the survey
layer no more than a quiet label or a scale. Same three layers as every plate.
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL, label, scalebar, reticle
from more import sky, top, spike_star, W, HF

H = HF


def blur(u, name, sd, pad=30):
    return '<filter id="%s%s" x="-%d%%" y="-%d%%" width="%d%%" height="%d%%"><feGaussianBlur stdDeviation="%s"/></filter>' % (u, name, pad, pad, 100 + 2 * pad, 100 + 2 * pad, f(sd))


def streak(x0, y0, dx, dy, col, w=1.4, op=.9, u='', head=True):
    """A meteor: it moves from (x0, y0) along (dx, dy); the head is at the far end and the train fades behind it."""
    x1, y1 = x0 + dx, y0 + dy
    L = math.hypot(dx, dy)
    out = ''
    n = 14
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        a = op * (t0 ** 1.6)
        out += '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(x0 + dx * t0), f(y0 + dy * t0), f(x0 + dx * t1), f(y0 + dy * t1), col, f(a), f(w * (0.4 + 0.6 * t1)))
    if head:
        out += '<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity="%s"/>' % (f(x1), f(y1), f(w * 0.9), f(min(1, op + .1)))
    return out


# ================================================================= M1, THE CRAB
def m1(u):
    cx, cy = 291, 318
    rnd = random.Random(1054)
    bg = sky(u, H, ('#141a36', '#080c1e', '#03040c'), 300, 1054, 5)
    defs = blur(u, 'b12', 14) + blur(u, 'b4', 3) + blur(u, 'b1', .8) + (
            '<filter id="%sfil" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".025" numOctaves="3" seed="11"/><feDisplacementMap in="SourceGraphic" scale="26"/><feGaussianBlur stdDeviation="1.1"/></filter>'
            '<filter id="%scloud" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="4" seed="1054"/><feDisplacementMap in="SourceGraphic" scale="70"/><feGaussianBlur stdDeviation="9"/></filter>'
            '<radialGradient id="%ssyn" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#dfe9ff" stop-opacity=".9"/><stop offset=".3" stop-color="#86b0ff" stop-opacity=".55"/><stop offset=".7" stop-color="#4c6fd8" stop-opacity=".18"/><stop offset="1" stop-color="#2b3f9a" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%spul"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#cfe2ff" stop-opacity=".8"/><stop offset="1" stop-color="#9ec0ff" stop-opacity="0"/></radialGradient>') % (u, u, u, u)
    o = []
    # the synchrotron nebula: a tilted blue-white ellipse, soft
    o.append('<ellipse cx="%d" cy="%d" rx="150" ry="105" fill="url(#%ssyn)" transform="rotate(-32 %d %d)"/>' % (cx, cy, u, cx, cy))
    o.append('<ellipse cx="%d" cy="%d" rx="95" ry="62" fill="url(#%ssyn)" transform="rotate(-32 %d %d)" opacity=".8"/>' % (cx, cy, u, cx, cy))
    # the cage of filaments: red-orange, denser at the rim, tangled
    fil = []
    for i in range(170):
        a = rnd.uniform(0, 2 * math.pi)
        r0 = rnd.uniform(.35, 1.02)
        rx, ry = 165, 118
        rot = math.radians(-32)
        def P(rr, aa):
            x, y = rx * rr * math.cos(aa), ry * rr * math.sin(aa)
            return cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)
        x0, y0 = P(r0, a)
        x2, y2 = P(min(1.08, r0 + rnd.uniform(.12, .45)), a + rnd.uniform(-.7, .7))
        x1, y1 = (x0 + x2) / 2 + rnd.uniform(-30, 30), (y0 + y2) / 2 + rnd.uniform(-30, 30)
        col = rnd.choice(['#ff6a3a', '#ff8a4a', '#e8452e', '#ffb070', '#ff5f6a', '#d63a2a'])
        fil.append('<path d="M%s %sQ%s %s %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(x0), f(y0), f(x1), f(y1), f(x2), f(y2), col, f(rnd.uniform(.3, .85)), f(rnd.uniform(.8, 3.2))))
    # a few greenish-yellow filaments (oxygen)
    for i in range(24):
        a = rnd.uniform(0, 2 * math.pi); r0 = rnd.uniform(.5, .95)
        x0 = cx + 160 * r0 * math.cos(a); y0 = cy + 115 * r0 * math.sin(a)
        fil.append('<path d="M%s %sq%s %s %s %s" fill="none" stroke="#d8f08a" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(x0), f(y0), f(rnd.uniform(-30, 30)), f(rnd.uniform(-30, 30)), f(rnd.uniform(-60, 60)), f(rnd.uniform(-50, 50)), f(rnd.uniform(.2, .5)), f(rnd.uniform(.6, 1.6))))
    o.append('<g filter="url(#%sb12)" opacity=".7">%s</g>' % (u, ''.join(fil[:60])))
    o.append('<g filter="url(#%sfil)">%s</g>' % (u, ''.join(fil)))
    # outer haze in red, blurred
    haze = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(cx + rnd.uniform(-90, 90), cy + rnd.uniform(-60, 60), rnd.uniform(70, 150), rnd.uniform(50, 100), rnd, 14, .35), rnd.choice(['#8a2a2a', '#b83a2a', '#5a1a3a']), f(rnd.uniform(.14, .26))) for _ in range(9))
    o.insert(0, '<g filter="url(#%scloud)">%s</g>' % (u, haze))
    # the pulsar and its wind: a small bright torus and jets
    o.append('<ellipse cx="%d" cy="%d" rx="34" ry="14" fill="none" stroke="#bcd6ff" stroke-opacity=".45" stroke-width="2" transform="rotate(-32 %d %d)" filter="url(#%sb4)"/>' % (cx, cy, cx, cy, u))
    o.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#cfe0ff" stroke-opacity=".5" stroke-width="2.5" transform="rotate(-32 %d %d)" filter="url(#%sb4)"/>' % (cx, cy - 70, cx, cy + 70, cx, cy, u))
    o.append('<circle cx="%d" cy="%d" r="28" fill="url(#%spul)"/>' % (cx, cy, u))
    o.append(spike_star(cx, cy, 2.6, '#dfe9ff', 30, 1, 1.1))
    o.append(spike_star(cx + 9, cy + 3, 1.6, '#ffe9c8', 12, .9, .8))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .11), defs)
    ann = [top('RA 05H 34M 32S · DEC +22° 01′ · TAURUS'), scalebar(22, 800, 92, '3 LY')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= SAGITTARIUS A*
def sgr_a(u):
    cx, cy = 291, 300
    rnd = random.Random(2022)
    bg = sky(u, H, ('#2a1a10', '#120a06', '#040203'), 120, 2022, 0, tints=('#ffe2b0', '#ffd090', '#fff4dc'))
    defs = blur(u, 'b3', 2.4) + blur(u, 'b8', 8) + blur(u, 'b16', 18) + (
            '<radialGradient id="%sswarm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe6b8" stop-opacity=".55"/><stop offset=".25" stop-color="#e8a860" stop-opacity=".3"/><stop offset=".6" stop-color="#7a4a26" stop-opacity=".12"/><stop offset="1" stop-color="#3a2210" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%sring" cx=".5" cy=".5" r=".5"><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset=".72" stop-color="#ff8a2a" stop-opacity=".25"/><stop offset=".8" stop-color="#ffb86a"/><stop offset=".86" stop-color="#ff7a1a"/><stop offset=".93" stop-color="#c03a08" stop-opacity=".55"/><stop offset="1" stop-color="#4a1400" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%sshadow" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>'
            ) % (u, u, u)
    o = ['<ellipse cx="%d" cy="%d" rx="300" ry="240" fill="url(#%sswarm)"/>' % (cx, cy, u),
         '<ellipse cx="%d" cy="%d" rx="150" ry="120" fill="url(#%sswarm)" opacity=".9"/>' % (cx, cy, u)]
    # the swarm: stars crowd toward the centre, gold and white, a few blue giants
    st = []
    for i in range(4200):
        r = 320 * rnd.random() ** 2.6 + 2
        a = rnd.uniform(0, 2 * math.pi)
        x, y = cx + r * math.cos(a) * 1.05, cy + r * math.sin(a) * .85
        if x < -5 or x > W + 5 or y < -5 or y > H + 5: continue
        m = rnd.random() ** 2.6
        near = max(0, 1 - r / 140)
        st.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (
            f(x), f(y), f(.3 + 1.9 * m + .6 * near), rnd.choice(['#fff2d8', '#ffd9a0', '#ffc070', '#fff8ec', '#ffe8c0', '#ffe8c0', '#bcd0ff']), f(.45 + .55 * rnd.random())))
    o.append(''.join(st))
    for _ in range(9):
        r = rnd.uniform(40, 220); a = rnd.uniform(0, 2 * math.pi)
        o.append(spike_star(cx + r * math.cos(a), cy + r * math.sin(a) * .85, rnd.uniform(1.4, 2.4), rnd.choice(['#ffd9a0', '#bcd0ff', '#fff4e0']), rnd.uniform(8, 18), .9, .8))
    # the crowded core: thousands more, tiny, within a hundred pixels
    core = ''.join('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (
        f(cx + rnd.gauss(0, 60)), f(cy + rnd.gauss(0, 48)), f(rnd.uniform(.3, 1.1)), rnd.choice(['#fff2d8', '#ffd9a0', '#ffe8c0', '#fff8ec']), f(rnd.uniform(.5, 1))) for _ in range(2200))
    o.append(core)
    # the shadow and the ring, seen slightly from above; the near side brighter
    rr = 46
    o.append('<circle cx="%d" cy="%d" r="%d" fill="#000" opacity=".85" filter="url(#%sb16)"/>' % (cx, cy, rr + 60, u))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="#ff8a2a" opacity=".35" filter="url(#%sb16)"/>' % (cx, cy, rr + 10, u))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sring)" filter="url(#%sb8)" opacity=".9"/>' % (cx, cy, rr + 8, u, u))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sring)" filter="url(#%sb3)"/>' % (cx, cy, rr, u, u))
    o.append('<path d="M%s %sA%d %d 0 0 0 %s %s" fill="none" stroke="#fff0c8" stroke-opacity=".7" stroke-width="7" stroke-linecap="round" filter="url(#%sb8)"/>' % (
        f(cx - rr * .82 * .6), f(cy + rr * .82 * .8), int(rr * .82), int(rr * .82), f(cx + rr * .82 * .95), f(cy + rr * .82 * .3), u))
    o.append('<circle cx="%d" cy="%d" r="%s" fill="url(#%sshadow)"/>' % (cx, cy, f(rr * .64), u))
    o.append('<circle cx="%d" cy="%d" r="%s" fill="#000"/>' % (cx, cy, f(rr * .5)))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 17H 45M 40S · DEC −29° 00′ · GALACTIC CENTRE'), reticle(cx, cy, 78, 72, 4, .16)]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= VOYAGER 1
def voyager(u):
    rnd = random.Random(1977)
    sx, sy = 120, 130
    bg = sky(u, H, ('#05070f', '#02030a', '#000001'), 220, 1977, 2, cy='.2',
             extra='<circle cx="%d" cy="%d" r="120" fill="url(#%ssun)"/>' % (sx, sy, u) + spike_star(sx, sy, 3.2, '#fff8e8', 90, 1, 1.2),
             extra_defs='<radialGradient id="%ssun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6e0" stop-opacity=".9"/><stop offset=".08" stop-color="#ffe9b8" stop-opacity=".5"/><stop offset=".4" stop-color="#c9a870" stop-opacity=".12"/><stop offset="1" stop-color="#8a7040" stop-opacity="0"/></radialGradient>' % u)
    defs = blur(u, 'b1', .7) + blur(u, 'b3', 3) + blur(u, 'b6', 7) + (
            '<linearGradient id="%sdish" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9e3d6"/><stop offset=".35" stop-color="#8f8a80"/><stop offset=".7" stop-color="#3a3834"/><stop offset="1" stop-color="#15140f"/></linearGradient>'
            '<linearGradient id="%sbus" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c776d"/><stop offset=".5" stop-color="#2c2a26"/><stop offset="1" stop-color="#0f0e0c"/></linearGradient>'
            '<linearGradient id="%sfoil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9b25a"/><stop offset=".4" stop-color="#6a4a14"/><stop offset="1" stop-color="#1a1206"/></linearGradient>'
            '<radialGradient id="%sinner" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f4efe4"/><stop offset=".5" stop-color="#7d786e"/><stop offset="1" stop-color="#1d1c18"/></radialGradient>') % (u, u, u, u)
    cx, cy = 330, 340
    rot = -22
    o = []
    g = []
    # the high-gain dish, 3.7 m, seen from the sunward side and a little above: a wide ellipse, the inside lit
    g.append('<ellipse cx="0" cy="0" rx="150" ry="112" fill="url(#%sdish)"/>' % u)
    g.append('<ellipse cx="0" cy="0" rx="138" ry="100" fill="url(#%sinner)"/>' % u)
    for i in range(24):
        a = 2 * math.pi * i / 24
        g.append('<line x1="0" y1="0" x2="%s" y2="%s" stroke="#f6f1e6" stroke-opacity=".16" stroke-width=".8"/>' % (f(138 * math.cos(a)), f(100 * math.sin(a))))
    for r_ in (.35, .62, .85):
        g.append('<ellipse rx="%s" ry="%s" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width=".8"/>' % (f(138 * r_), f(100 * r_)))
    g.append('<ellipse cx="0" cy="0" rx="150" ry="112" fill="none" stroke="#fff5e0" stroke-opacity=".55" stroke-width="1.6"/>')
    # feed and sub-reflector on three struts
    for a in (-1.8, 0.4, 2.5):
        g.append('<line x1="%s" y1="%s" x2="0" y2="-64" stroke="#d8d2c4" stroke-width="1.6"/>' % (f(60 * math.cos(a)), f(44 * math.sin(a))))
    g.append('<ellipse cx="0" cy="-64" rx="16" ry="9" fill="#c9c2b2"/><ellipse cx="0" cy="-64" rx="16" ry="9" fill="#000" opacity=".35" transform="translate(3 2)"/>')
    g.append('<rect x="-5" y="-60" width="10" height="46" fill="#5a554b"/>')
    # the bus, a ten-sided drum behind the dish, in thermal blankets
    g.append('<path d="M-70 60L70 60L84 96L-84 96Z" fill="url(#%sbus)"/>' % u)
    g.append('<path d="M-84 96L84 96L70 124L-70 124Z" fill="url(#%sfoil)"/>' % u)
    # the RTG boom, three cylinders, off to the lower left
    g.append('<line x1="-60" y1="100" x2="-300" y2="196" stroke="#b9b2a4" stroke-width="2.2"/>')
    g.append('<line x1="-60" y1="112" x2="-300" y2="208" stroke="#7c766b" stroke-width="1.4"/>')
    for k in range(3):
        x = -230 - k * 26; y = 170 + k * 10.5
        g.append('<g transform="translate(%d %d) rotate(-22)"><rect x="-8" y="-24" width="16" height="48" rx="3" fill="#2a2925" stroke="#a49d8f" stroke-width=".8"/>%s</g>' % (
            x, y, ''.join('<line x1="-8" y1="%d" x2="8" y2="%d" stroke="#8b8577" stroke-width=".6"/>' % (-20 + 6 * j, -20 + 6 * j) for j in range(7))))
    # the science boom to the right, with the scan platform and the magnetometer boom long behind
    g.append('<line x1="70" y1="90" x2="250" y2="150" stroke="#c9c2b2" stroke-width="2.2"/><line x1="70" y1="100" x2="250" y2="160" stroke="#7c766b" stroke-width="1.2"/>')
    g.append('<rect x="238" y="126" width="34" height="26" rx="3" fill="#3a3732" stroke="#c4bdae" stroke-width=".8"/><circle cx="255" cy="139" r="6" fill="#111" stroke="#d6cfc0" stroke-width="1"/>')
    g.append('<line x1="60" y1="120" x2="330" y2="420" stroke="#8a8478" stroke-width="1"/>' )
    g.append(''.join('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#8a8478" stroke-width=".6"/>' % (f(60 + 270 * t - 4), f(120 + 300 * t + 4), f(60 + 270 * t + 4), f(120 + 300 * t - 4)) for t in [i / 22 for i in range(23)]))
    # the golden record on the bus
    g.append('<circle cx="52" cy="78" r="9" fill="#d8a83a"/><circle cx="52" cy="78" r="9" fill="none" stroke="#fff0b0" stroke-opacity=".6" stroke-width=".6"/><circle cx="52" cy="78" r="3" fill="#7a5a10"/>')
    o.append('<g transform="translate(%d %d) rotate(%d)">%s</g>' % (cx, cy, rot, ''.join(g)))
    # rim light from the Sun, upper left, over everything
    o.append('<g transform="translate(%d %d) rotate(%d)"><ellipse cx="0" cy="0" rx="150" ry="112" fill="none" stroke="#fff8e8" stroke-opacity=".9" stroke-width="2.4" stroke-dasharray="300 500" stroke-dashoffset="-60" filter="url(#%sb1)"/></g>' % (cx, cy, rot, u))
    # the pale blue dot, in a ray of scattered light
    px, py = 218, 212
    o.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#c9b48a" stroke-opacity=".08" stroke-width="26" filter="url(#%sb6)"/>' % (sx, sy, px + 200, py + 170, u))
    o.append('<circle cx="%d" cy="%d" r="4" fill="#9fc0ff" opacity=".35" filter="url(#%sb3)"/><circle cx="%d" cy="%d" r="1.3" fill="#c8dcff"/>' % (px, py, u, px, py))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('INTERSTELLAR SPACE · 170 AU · 23,000 KM/H OUTWARD'),
           label((px, py), (22, 250), ['EARTH', 'A PALE BLUE DOT'])]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= THE ORIONIDS
def _orion(cx, cy, s):
    """Orion as seen from the north: name, dx, dy (in the drawing's frame), radius, colour."""
    return [('BETELGEUSE', -.62, -.62, 4.2, '#ff9a5a'), ('BELLATRIX', .52, -.66, 3, '#cfe0ff'), ('MEISSA', -.05, -1.02, 1.8, '#dfe8ff'),
            ('ALNITAK', -.2, .02, 3, '#bcd4ff'), ('ALNILAM', 0, -.02, 3.2, '#cfe0ff'), ('MINTAKA', .2, -.06, 2.8, '#bcd4ff'),
            ('SAIPH', -.5, .64, 3, '#cfe0ff'), ('RIGEL', .62, .7, 4.4, '#dfeaff'), ('HATSYA', -.03, .3, 2, '#bcd4ff')]


def orionids(u):
    rnd = random.Random(1021)
    cx, cy, s = 260, 400, 150
    bg = sky(u, H, ('#0e1530', '#060a1c', '#02040a'), 340, 1021, 3, cy='.35')
    defs = blur(u, 'b2', 1.8) + blur(u, 'b8', 9, 200) + blur(u, 'b20', 22)
    o = []
    # winter Milky Way, faint, from upper left to lower right
    o.append('<ellipse cx="%d" cy="%d" rx="420" ry="90" fill="#7a90c8" opacity=".09" transform="rotate(-58 %d %d)" filter="url(#%sb20)"/>' % (cx + 60, cy - 60, cx + 60, cy - 60, u))
    # Orion
    st = _orion(cx, cy, s)
    for n, dx, dy, r, c in st:
        x, y = cx + dx * s, cy + dy * s
        o.append(spike_star(x, y, r * .55, c, r * 5.5, 1, .9))
    # the nebula under the belt
    o.append('<circle cx="%s" cy="%s" r="16" fill="#ff9ec7" opacity=".35" filter="url(#%sb8)"/><circle cx="%s" cy="%s" r="5" fill="#ffd8e8" opacity=".6"/>' % (f(cx - .03 * s), f(cy + .3 * s), u, f(cx - .03 * s), f(cy + .3 * s)))
    # the club, a faint chain of stars above Betelgeuse; the radiant sits beside it
    club = [(-.62, -.62), (-.86, -.92), (-.98, -1.2), (-1.02, -1.45), (-1.1, -1.66)]
    for i in range(1, len(club)):
        o.append('<circle cx="%s" cy="%s" r="1.2" fill="#dfe8ff" opacity=".8"/>' % (f(cx + club[i][0] * s), f(cy + club[i][1] * s)))
    rx, ry = cx - 1.3 * s, cy - 1.5 * s
    # the shower: streaks radiating from the radiant, longer away from it, fast and thin
    ms = []
    for i in range(22):
        a = rnd.uniform(-.2, 1.5) + rnd.choice([0, 0, math.pi * 1.2])
        a = rnd.uniform(0, 2 * math.pi)
        d0 = rnd.uniform(60, 420)
        x0, y0 = rx + d0 * math.cos(a), ry + d0 * math.sin(a)
        if not (-20 < x0 < W + 20 and -20 < y0 < 700): continue
        L = rnd.uniform(40, 150) * (0.5 + d0 / 400)
        w = rnd.uniform(.9, 2.2)
        col = rnd.choice(['#ffffff', '#dfe8ff', '#cfe6ff', '#fff2d0'])
        ms.append('<g filter="url(#%sb2)" opacity=".55">%s</g>' % (u, streak(x0, y0, L * math.cos(a), L * math.sin(a), col, w * 3, .5, u, head=False)))
        ms.append(streak(x0, y0, L * math.cos(a), L * math.sin(a), col, w, rnd.uniform(.6, 1), u))
    o.append(''.join(ms))
    # one bright fireball with a persistent train
    a = math.radians(38); x0, y0 = rx + 150 * math.cos(a), ry + 150 * math.sin(a)
    o.append('<g filter="url(#%sb8)" opacity=".5">%s</g>' % (u, streak(x0, y0, 260 * math.cos(a), 260 * math.sin(a), '#9fe8c8', 10, .5, u, head=False)))
    o.append(streak(x0, y0, 260 * math.cos(a), 260 * math.sin(a), '#eafff4', 2.6, 1, u))
    o.append('<circle cx="%s" cy="%s" r="9" fill="#fff" opacity=".5" filter="url(#%sb8)"/>' % (f(x0 + 260 * math.cos(a)), f(y0 + 260 * math.sin(a)), u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RADIANT RA 06H 20M · DEC +16° · NEAR THE CLUB OF ORION'), label((rx, ry), (22, 190), ['RADIANT', 'ZHR ~20'])]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= THE GEMINIDS
def geminids(u):
    rnd = random.Random(1213)
    bg = sky(u, H, ('#0a1224', '#040818', '#010208'), 380, 1213, 4, cy='.4')
    defs = blur(u, 'b2', 1.8) + blur(u, 'b8', 9, 200) + blur(u, 'b20', 22)
    o = []
    o.append('<ellipse cx="200" cy="500" rx="480" ry="110" fill="#8aa0d0" opacity=".08" transform="rotate(-62 200 500)" filter="url(#%sb20)"/>' % u)
    # Gemini: Castor and Pollux at the top, the twins' bodies running down to the lower right
    gx, gy, s = 330, 170, 120
    twins = [('CASTOR', 0, 0, 3.4, '#e8f0ff'), ('POLLUX', .42, .16, 3.8, '#ffc98a'), ('WASAT', .62, 1.0, 1.8, '#dfe8ff'), ('MEBSUTA', -.28, .78, 2.2, '#f2e8d8'),
             ('ALHENA', .48, 1.62, 2.8, '#dfe8ff'), ('TEJAT', -.72, 1.1, 2.2, '#ffb08a'), ('PROPUS', -.86, 1.28, 1.8, '#ffc9a0'), ('MEKBUDA', .3, 1.34, 1.6, '#f2ecd8'), ('ALZIRR', .9, 1.58, 1.6, '#dfe8ff')]
    lines = [('CASTOR', 'MEBSUTA'), ('MEBSUTA', 'TEJAT'), ('TEJAT', 'PROPUS'), ('POLLUX', 'WASAT'), ('WASAT', 'MEKBUDA'), ('MEKBUDA', 'ALHENA'), ('WASAT', 'ALZIRR')]
    pos = {n: (gx + dx * s, gy + dy * s) for n, dx, dy, r, c in twins}
    for a, b in lines:
        o.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#9fb4e0" stroke-opacity=".14" stroke-width=".8"/>' % (f(pos[a][0]), f(pos[a][1]), f(pos[b][0]), f(pos[b][1])))
    for n, dx, dy, r, c in twins:
        o.append(spike_star(pos[n][0], pos[n][1], r * .55, c, r * 5, 1, .9))
    rx, ry = gx - 14, gy - 10
    ms = []
    for i in range(42):
        a = rnd.uniform(0, 2 * math.pi)
        d0 = rnd.uniform(40, 520)
        x0, y0 = rx + d0 * math.cos(a), ry + d0 * math.sin(a)
        if not (-30 < x0 < W + 30 and -30 < y0 < 760): continue
        L = rnd.uniform(30, 120) * (0.4 + d0 / 300)
        w = rnd.uniform(1, 2.6)
        col = rnd.choice(['#ffffff', '#fff4d0', '#e8ffe0', '#dfe8ff', '#c8ffd8', '#ffe6a8'])
        ms.append('<g filter="url(#%sb2)" opacity=".6">%s</g>' % (u, streak(x0, y0, L * math.cos(a), L * math.sin(a), col, w * 3, .45, u, head=False)))
        ms.append(streak(x0, y0, L * math.cos(a), L * math.sin(a), col, w, rnd.uniform(.7, 1), u))
    o.append(''.join(ms))
    # two slow bright ones, green-white, with glowing heads
    for a, d0, L in ((math.radians(118), 210, 300), (math.radians(20), 260, 220)):
        x0, y0 = rx + d0 * math.cos(a), ry + d0 * math.sin(a)
        o.append('<g filter="url(#%sb8)" opacity=".55">%s</g>' % (u, streak(x0, y0, L * math.cos(a), L * math.sin(a), '#a8f0c8', 12, .5, u, head=False)))
        o.append(streak(x0, y0, L * math.cos(a), L * math.sin(a), '#f0fff4', 3, 1, u))
        o.append('<circle cx="%s" cy="%s" r="10" fill="#dfffe8" opacity=".55" filter="url(#%sb8)"/>' % (f(x0 + L * math.cos(a)), f(y0 + L * math.sin(a)), u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RADIANT RA 07H 28M · DEC +32° · GEMINI · PARENT 3200 PHAETHON'), label((rx, ry), (560, 110), ['RADIANT', 'ZHR 120'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= THE MOON TAKES THE PLEIADES
def pleiades_occultation(u):
    rnd = random.Random(1124)
    mx, my, R = 380, 400, 250
    bg = sky(u, H, ('#1a2748', '#0a1230', '#03060f'), 200, 1124, 2, cy='.35',
             extra='<circle cx="%d" cy="%d" r="%d" fill="url(#%shalo)"/>' % (mx, my, R + 160, u),
             extra_defs='<radialGradient id="%shalo" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#dfe8ff" stop-opacity=".22"/><stop offset=".75" stop-color="#b8c8ff" stop-opacity=".1"/><stop offset="1" stop-color="#b8c8ff" stop-opacity="0"/></radialGradient>' % u)
    defs = ('<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
            '<radialGradient id="%sbase" cx=".4" cy=".4" r=".72"><stop offset="0" stop-color="#fbfaf5"/><stop offset=".5" stop-color="#dcdad2"/><stop offset=".85" stop-color="#b3b1aa"/><stop offset="1" stop-color="#8c8a84"/></radialGradient>'
            '<radialGradient id="%slimb" cx=".5" cy=".5" r=".5"><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset=".94" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>'
            '<filter id="%sn1" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="5" seed="4"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sn2" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="3" seed="9"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sneb" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".02 .05" numOctaves="4" seed="45"/><feDisplacementMap in="SourceGraphic" scale="50"/><feGaussianBlur stdDeviation="5"/></filter>') % (
        u, mx, my, R, u, u, u, u, u) + blur(u, 'b3', 3) + blur(u, 'b1', 1) + blur(u, 'b9', 9)
    # the Pleiades, upper left, some of them already behind the Moon
    ra0, de0 = 3 + 47 / 60 + 29.1 / 3600, 24 + 6 / 60 + 18 / 3600
    stars = [('ALCYONE', 3, 47, 29.1, 24, 6, 18, 2.87), ('ATLAS', 3, 49, 9.7, 24, 3, 12, 3.62), ('ELECTRA', 3, 44, 52.5, 24, 6, 48, 3.70), ('MAIA', 3, 45, 49.6, 24, 22, 4, 3.87),
             ('MEROPE', 3, 46, 19.6, 23, 56, 54, 4.18), ('TAYGETA', 3, 45, 12.5, 24, 28, 2, 4.30), ('PLEIONE', 3, 49, 11.2, 24, 8, 12, 5.05), ('CELAENO', 3, 44, 48.2, 24, 17, 22, 5.45), ('ASTEROPE', 3, 45, 54.5, 24, 33, 16, 5.76)]
    sc, ox, oy = 4.6, 236, 226
    pos = {}
    for n, h, m, s, d, dm, ds, mag in stars:
        ra = h + m / 60 + s / 3600; de = d + dm / 60 + ds / 3600
        x = ox - (ra - ra0) * 15 * math.cos(math.radians(24.1)) * 60 * sc; y = oy - (de - de0) * 60 * sc
        pos[n] = (x, y, mag)
    o = []
    neb = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#5a8ce0" opacity="%s" transform="rotate(%s %s %s)"/>' % (
        f(x + rnd.uniform(-20, 20)), f(y + rnd.uniform(-10, 30)), f(rnd.uniform(40, 90)), f(rnd.uniform(10, 26)), f(rnd.uniform(.08, .18)), f(rnd.uniform(-40, -20)), f(x), f(y))
        for n, (x, y, mag) in pos.items() for _ in range(3) if mag < 4.5)
    o.append('<g filter="url(#%sneb)">%s</g>' % (u, neb))
    for _ in range(70):
        o.append('<circle cx="%s" cy="%s" r="%s" fill="#bcd8ff" opacity="%s"/>' % (f(ox + rnd.gauss(0, 80)), f(oy + rnd.gauss(0, 70)), f(rnd.uniform(.4, 1.2)), f(rnd.uniform(.3, .8))))
    o.append(''.join(spike_star(x, y, 3.4 - (mag - 2.8) * .8, '#bcd8ff', 30 - (mag - 2.8) * 6) for n, (x, y, mag) in pos.items()))
    # the Moon, full, lit flat, covering the cluster's east
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (mx, my, R, u),
         '<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn1)" opacity=".4" style="mix-blend-mode: multiply"/>' % (mx - R, my - R, 2 * R, 2 * R, u)]
    maria = [(-0.30, -0.42, .26, .22), (0.12, -0.40, .15, .14), (0.30, -0.12, .19, .16), (0.66, -0.30, .08, .12), (0.52, 0.10, .11, .17),
             (0.34, 0.26, .08, .09), (-0.22, 0.30, .16, .12), (-0.50, 0.36, .08, .08), (-0.62, -0.05, .24, .42), (-0.02, -0.72, .42, .06)]
    P = lambda x, y: (mx + x * R, my + y * R)
    mar = ''.join('<path d="%s" fill="#6a6f7c" opacity=".62"/><path d="%s" fill="#5c6170" opacity=".3"/>' % (
        blob(P(x, y)[0], P(x, y)[1], rx * R, ry * R, rnd, 18, .3), blob(P(x, y)[0] + rnd.uniform(-8, 8), P(x, y)[1] + rnd.uniform(-8, 8), rx * R * .6, ry * R * .6, rnd, 12, .35)) for x, y, rx, ry in maria)
    b.append('<g filter="url(#%sb9)">%s</g>' % (u, mar))
    b.append('<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn2)" opacity=".2" style="mix-blend-mode: overlay"/>' % (mx - R, my - R, 2 * R, 2 * R, u))
    tx, ty = P(-.14, .68)
    rays = ''.join('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#fbfaf5" stroke-opacity="%s" stroke-width="%s"/>' % (
        f(tx), f(ty), f(tx + rnd.uniform(.1, .9) * R * math.cos(t)), f(ty + rnd.uniform(.1, .9) * R * math.sin(t)), f(rnd.uniform(.06, .18)), f(rnd.uniform(.7, 2.2))) for t in [rnd.uniform(0, 6.3) for _ in range(46)])
    b.append('<g filter="url(#%sb1)">%s<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity=".2"/></g>' % (u, rays, f(tx), f(ty), f(R * .07)))
    for _ in range(320):
        x, y = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        if x * x + y * y > .93: continue
        X, Y = P(x, y); r = .8 + 9 * rnd.random() ** 3.2
        b.append('<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity=".18"/><circle cx="%s" cy="%s" r="%s" fill="#3a3c44" opacity=".2"/>' % (f(X), f(Y), f(r), f(X - r * .2), f(Y - r * .15), f(r * .7)))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimb)"/>' % (mx, my, R, u))
    o.append('<g clip-path="url(#%sdisk)">%s</g>' % (u, ''.join(b)))
    o.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="1"/>' % (mx, my, f(R - .5)))
    # a star right at the limb, about to go
    o.append(spike_star(mx - R * .93, my - R * .38, 1.8, '#dfe8ff', 14, 1, .9))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    ann = [top('24 NOV 2026 · THE FULL MOON CROSSES M45'), label((mx - R * .93, my - R * .38), (22, 470), ['DISAPPEARANCE', 'AT THE BRIGHT LIMB'])]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= THE DOUBLE OPPOSITION
def double_opposition(u):
    rnd = random.Random(2027)
    bg = sky(u, H, ('#131a38', '#080c20', '#02030b'), 260, 2027, 4, cy='.4')
    jx, jy, a = 200, 250, 96
    b_ = a * (1 - .065)
    mx, my, R = 420, 470, 44
    defs = ('<clipPath id="%sjd"><ellipse cx="%d" cy="%d" rx="%d" ry="%s"/></clipPath>'
            '<clipPath id="%smd"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
            '<filter id="%sturb" x="-10%%" y="-10%%" width="120%%" height="120%%"><feTurbulence type="fractalNoise" baseFrequency=".006 .07" numOctaves="3" seed="21"/><feDisplacementMap in="SourceGraphic" scale="12"/></filter>'
            '<filter id="%sn1" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="4" seed="7"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<radialGradient id="%sgrs" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e8a17a"/><stop offset=".55" stop-color="#c8643c"/><stop offset=".85" stop-color="#a44a2c"/><stop offset="1" stop-color="#f0d8c0"/></radialGradient>'
            '<radialGradient id="%sjl" cx=".42" cy=".4" r=".62"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".75" stop-color="#140a03" stop-opacity=".14"/><stop offset="1" stop-color="#050301" stop-opacity=".75"/></radialGradient>'
            '<radialGradient id="%smb" cx=".4" cy=".38" r=".75"><stop offset="0" stop-color="#f2a36a"/><stop offset=".5" stop-color="#d9713a"/><stop offset=".85" stop-color="#a44a24"/><stop offset="1" stop-color="#5a2412"/></radialGradient>'
            '<radialGradient id="%sml" cx=".42" cy=".4" r=".62"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#140a03" stop-opacity=".15"/><stop offset="1" stop-color="#050301" stop-opacity=".8"/></radialGradient>'
            '<radialGradient id="%sglo" cx=".5" cy=".5" r=".5"><stop offset=".3" stop-color="#ffe3b0" stop-opacity=".22"/><stop offset="1" stop-color="#ffe3b0" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%smg" cx=".5" cy=".5" r=".5"><stop offset=".3" stop-color="#ff9a63" stop-opacity=".22"/><stop offset="1" stop-color="#ff9a63" stop-opacity="0"/></radialGradient>') % (
        u, jx, jy, a, f(b_), u, mx, my, R, u, u, u, u, u, u, u, u) + blur(u, 'b1', .8)
    o = []
    # the ecliptic, a dashed great circle through both
    o.append('<path d="M-20 %dQ%d %d 602 %d" fill="none" stroke="#9fb4e0" stroke-opacity=".18" stroke-width=".8" stroke-dasharray="3 6"/>' % (200, 300, 430, 520))
    # Jupiter
    bands = [(-1, '#9aa0a8'), (-.82, '#b8a58c'), (-.66, '#d8c8aa'), (-.5, '#a88a6a'), (-.4, '#e6d6b8'), (-.26, '#9c6a44'), (-.14, '#b07a50'),
             (-.06, '#f4ead4'), (.1, '#e8d2a8'), (.16, '#a8704a'), (.3, '#8e5a38'), (.38, '#e8d8bc'), (.52, '#b89470'), (.64, '#d8c8aa'), (.8, '#a8a092')]
    g = ['<rect x="%d" y="%s" width="%d" height="%s" fill="%s"/>' % (jx - a - 20, f(jy + y * b_), 2 * a + 40, f(b_ * .3), c) for y, c in bands]
    for i in range(40):
        y = jy + rnd.uniform(-.95, .95) * b_
        g.append('<path d="M%d %sH%d" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (jx - a - 20, f(y), jx + a + 20, rnd.choice(['#fff4e0', '#6a4428', '#c89870']), f(rnd.uniform(.08, .25)), f(rnd.uniform(.5, 2))))
    gx, gy = jx + .3 * a, jy + .3 * b_
    g.append('<ellipse cx="%s" cy="%s" rx="17" ry="9" fill="#f4e4cc" opacity=".7"/><ellipse cx="%s" cy="%s" rx="14" ry="7" fill="url(#%sgrs)"/>' % (f(gx - 3), f(gy), f(gx), f(gy), u))
    o.append('<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="url(#%sglo)"/>' % (jx, jy, a + 60, a + 50, u))
    o.append('<g clip-path="url(#%sjd)"><g filter="url(#%sturb)">%s</g><ellipse cx="%d" cy="%d" rx="%d" ry="%s" fill="url(#%sjl)"/></g>' % (u, u, ''.join(g), jx, jy, a, f(b_), u))
    o.append('<ellipse cx="%d" cy="%d" rx="%s" ry="%s" fill="none" stroke="#fff3d6" stroke-opacity=".25"/>' % (jx, jy, f(a - .5), f(b_ - .5)))
    for x, y, r, c in [(-138, 4, 2.2, '#f0d890'), (150, 1, 2, '#ece4d4'), (-166, 6, 2.8, '#c8bca8'), (176, 3, 2.6, '#8a7c6c')]:
        o.append('<circle cx="%d" cy="%d" r="%s" fill="%s"/>' % (jx + x, jy + y, f(r), c))
    # Mars, small, red, a polar cap and dark Syrtis
    m = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%smb)"/>' % (mx, my, R, u),
         '<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn1)" opacity=".35" style="mix-blend-mode: multiply"/>' % (mx - R, my - R, 2 * R, 2 * R, u)]
    for x, y, rx, ry in [(.18, .02, .16, .3), (-.3, .2, .24, .09), (.4, -.2, .12, .1)]:
        m.append('<path d="%s" fill="#6a2a14" opacity=".5" filter="url(#%sb1)"/>' % (blob(mx + x * R, my + y * R, rx * R, ry * R, rnd, 12, .4), u))
    m.append('<path d="%s" fill="#fbf6f0" opacity=".9" filter="url(#%sb1)"/>' % (blob(mx, my - .88 * R, .26 * R, .1 * R, rnd, 12, .2), u))
    m.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sml)"/>' % (mx, my, R, u))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%smg)"/>' % (mx, my, R + 40, u))
    o.append('<g clip-path="url(#%smd)">%s</g>' % (u, ''.join(m)))
    o.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#ffc2a0" stroke-opacity=".35"/>' % (mx, my, f(R - .5)))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .11), defs)
    ann = [top('JUPITER 11 FEB · MARS 19 FEB 2027 · BOTH OPPOSITE THE SUN'),
           label((jx, jy - b_), (22, 130), ['JUPITER', '−2.6 · 45″']), label((mx + R, my), (560, 560), ['MARS', '−1.2 · 14″'], 'end')]
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= THE GREAT ECLIPSE
def great_eclipse(u):
    rnd = random.Random(802)
    cx, cy, R = 291, 300, 96
    bg = sky(u, H, ('#0b1226', '#050818', '#020309'), 90, 802, 1, cy='.36',
             extra='<rect y="560" width="%d" height="%d" fill="url(#%sdusk)"/>' % (W, H - 560, u) + spike_star(112, 470, 2.6, '#fff4e0', 26, 1, 1),
             extra_defs='<linearGradient id="%sdusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a5a" stop-opacity="0"/><stop offset=".6" stop-color="#ff8a4a" stop-opacity=".14"/><stop offset="1" stop-color="#ffb070" stop-opacity=".3"/></linearGradient>' % u)
    defs = blur(u, 'b2', 2) + blur(u, 'b6', 6) + blur(u, 'b14', 14) + blur(u, 'b30', 30) + (
            '<radialGradient id="%sinner" cx=".5" cy=".5" r=".5"><stop offset=".5" stop-color="#fff"/><stop offset=".62" stop-color="#fff" stop-opacity=".85"/><stop offset=".78" stop-color="#e8f0ff" stop-opacity=".35"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%souter" cx=".5" cy=".5" r=".5"><stop offset=".3" stop-color="#dfe8ff" stop-opacity=".5"/><stop offset=".6" stop-color="#b8c8f0" stop-opacity=".12"/><stop offset="1" stop-color="#8090c0" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%sdisc" cx=".5" cy=".5" r=".5"><stop offset=".92" stop-color="#000"/><stop offset="1" stop-color="#05060c"/></radialGradient>'
            '<filter id="%swisp" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="3" seed="8"/><feDisplacementMap in="SourceGraphic" scale="9"/><feGaussianBlur stdDeviation="2.2"/></filter>') % (u, u, u, u)
    o = []
    o.append('<ellipse cx="%d" cy="%d" rx="290" ry="230" fill="url(#%souter)"/>' % (cx, cy, u))
    # streamers: long at the equator, short polar brushes; each a thin wedge, blurred
    st = []
    for i in range(160):
        a = rnd.uniform(0, 2 * math.pi)
        eq = abs(math.cos(a))  # 1 at the equator (left-right)
        L = R + rnd.uniform(40, 120) + 260 * (eq ** 2.2) * rnd.uniform(.5, 1.2)
        w = rnd.uniform(.4, 2.4) * (0.6 + eq)
        curve = rnd.uniform(-.18, .18)
        x1, y1 = cx + R * .98 * math.cos(a), cy + R * .98 * math.sin(a)
        x2, y2 = cx + L * math.cos(a + curve), cy + L * math.sin(a + curve)
        xm, ym = cx + (L * .5) * math.cos(a + curve * .5), cy + (L * .5) * math.sin(a + curve * .5)
        st.append('<path d="M%s %sQ%s %s %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(x1), f(y1), f(xm), f(ym), f(x2), f(y2), rnd.choice(['#ffffff', '#eef3ff', '#dfe8ff']), f(rnd.uniform(.12, .5)), f(w)))
    o.append('<g filter="url(#%sb30)" opacity=".9">%s</g>' % (u, ''.join(st)))
    o.append('<g filter="url(#%sb14)" opacity=".7">%s</g>' % (u, ''.join(st[::2])))
    o.append('<g filter="url(#%swisp)" opacity=".55">%s</g>' % (u, ''.join(st[::3])))
    # polar plumes, short and fine
    pl = []
    for i in range(60):
        a = rnd.choice([-math.pi / 2, math.pi / 2]) + rnd.uniform(-.55, .55)
        L = R + rnd.uniform(20, 70)
        pl.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#fff" stroke-opacity="%s" stroke-width="%s"/>' % (
            f(cx + R * math.cos(a)), f(cy + R * math.sin(a)), f(cx + L * math.cos(a)), f(cy + L * math.sin(a)), f(rnd.uniform(.15, .5)), f(rnd.uniform(.4, 1))))
    o.append('<g filter="url(#%sb2)">%s</g>' % (u, ''.join(pl)))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sinner)"/>' % (cx, cy, R + 36, u))
    # prominences at the limb
    for a, s in ((.35, 1.2), (2.4, .8), (3.6, 1), (5.2, .7)):
        px, py = cx + R * math.cos(a), cy + R * math.sin(a)
        o.append('<path d="%s" fill="#ff6a8a" opacity=".85" filter="url(#%sb2)"/>' % (blob(px, py, 9 * s, 6 * s, rnd, 10, .4), u))
        o.append('<path d="%s" fill="#ffb0c0" opacity=".7"/>' % blob(px, py, 4 * s, 3 * s, rnd, 8, .3))
    # the diamond ring: the last bead of photosphere at the upper right limb
    dx, dy = cx + R * math.cos(-.8), cy + R * math.sin(-.8)
    o.append('<circle cx="%s" cy="%s" r="30" fill="#fff" opacity=".55" filter="url(#%sb14)"/>' % (f(dx), f(dy), u))
    o.append(spike_star(dx, dy, 4, '#ffffff', 70, 1, 1.4))
    # the Moon, black, with a faint earthshine edge
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sdisc)"/>' % (cx, cy, R, u))
    o.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#3a4260" stroke-opacity=".5" stroke-width=".8"/>' % (cx, cy, f(R - .4)))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .09), defs)
    ann = [top('2 AUG 2027 · TOTALITY 6 M 23 S AT LUXOR'), label((112, 470), (22, 520), ['VENUS', 'OUT IN DAYTIME'])]
    return bg, obj, svg(W, H, ''.join(ann))


PLATES = {
    'M1': m1, 'SGR-A': sgr_a, 'VOYAGER-1': voyager, 'ORIONIDS': orionids, 'GEMINIDS': geminids,
    'PLEIADES-OCCULTATION': pleiades_occultation, 'DOUBLE-OPPOSITION': double_opposition, 'GREAT-ECLIPSE': great_eclipse,
}

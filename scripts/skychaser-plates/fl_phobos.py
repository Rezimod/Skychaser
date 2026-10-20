"""First Light, the special card: Phobos, one full-art plate at 582 x 832.

A lumpy grey moon seen close, lit from the upper left: Stickney, the crater
that nearly broke it, opens on the near face; the long parallel grooves run
across it; and the rust limb of Mars fills the lower corner, close enough to
show why the moon is falling.
"""
import math, random
from drawing import f, starfield, grain, svg, scalebar, label
from more import sky, top, W, HF
from fl_planets import blur, tint_noise, grey_noise, radial, rect_fill

H = HF


def phobos(u):
    """Phobos 6,000 km above Mars: a 27 x 22 km potato of dark regolith, Stickney's 9 km bowl on the
    near face, grooves raked across it, Mars's day side and thin blue air rising behind it."""
    rnd = random.Random(1877)
    bg = sky(u, H, ('#120c0c', '#070506', '#020203'), 300, 1877, 4, cy='.3')

    # Mars: a huge disc whose upper-left limb crosses the lower right of the plate
    mx, my, mR = 610, 1120, 560
    # Phobos: centre and semi-axes; 27 km along the long axis
    cx, cy, A, B, tilt = 292, 330, 196, 152, -14
    pts = []
    n = 44
    for i in range(n):
        t = 2 * math.pi * i / n
        # low-order lumps (the potato) and a little high-order roughness
        k = (1 + .07 * math.sin(2 * t + .6) + .05 * math.sin(3 * t + 2.1) + .035 * math.cos(5 * t + .4)
             + rnd.uniform(-.018, .018))
        pts.append((A * k * math.cos(t), B * k * math.sin(t)))
    # Stickney bites the outline on the left, where its rim reaches the limb
    mids = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in zip(pts, pts[1:] + pts[:1])]
    shape = 'M%s %s' % (f(mids[-1][0]), f(mids[-1][1])) + ''.join('Q%s %s %s %s' % (f(p[0]), f(p[1]), f(q[0]), f(q[1])) for p, q in zip(pts, mids)) + 'Z'

    defs = (blur(u, 'b05', .5) + blur(u, 'b1', 1) + blur(u, 'b2', 2) + blur(u, 'b4', 4, 40) + blur(u, 'b12', 12, 60) + blur(u, 'b30', 30, 80) +
            tint_noise(u, 'n1', '.018', 5, 401, '#1c140e', 2.1, -.7) +
            tint_noise(u, 'n2', '.06', 4, 403, '#e8dccc', 2.4, -1.25) +
            tint_noise(u, 'n3', '.16', 3, 405, '#0c0806', 2.6, -1.3) +
            grey_noise(u, 'n4', '.5', 2, 407) +
            tint_noise(u, 'm1', '.006', 5, 409, '#5a2210', 2, -.6) + tint_noise(u, 'm2', '.02', 4, 411, '#f6c08c', 2.2, -1.1) +
            # Phobos lit from the upper left: bright face to the terminator to night
            '<linearGradient id="%slit" x1=".1" y1=".05" x2=".92" y2=".98"><stop offset="0" stop-color="#c8b8a6"/><stop offset=".3" stop-color="#9c8a78"/>'
            '<stop offset=".56" stop-color="#5e5046"/><stop offset=".78" stop-color="#241c18"/><stop offset="1" stop-color="#0a0706"/></linearGradient>' % u +
            radial(u, 'mars', [('0', '#e49a62', 1), ('.55', '#c8703c', 1), ('.85', '#9a4a24', 1), ('1', '#5a2412', 1)], cx='.32', cy='.3', r='.8') +
            radial(u, 'mshade', [('.0', '#000', 0), ('.6', '#000', 0), ('.86', '#050203', .55), ('1', '#020101', .9)], cx='.2', cy='.15', r='1') +
            radial(u, 'air', [('.965', '#bcd2ff', 0), ('.99', '#cfe0ff', .45), ('1', '#e8f0ff', .7)]) +
            radial(u, 'form', [('0', '#fff', 1), ('.45', '#e8e0d8', 1), ('.72', '#7a6e66', 1), ('.9', '#2a2420', 1), ('1', '#140f0c', 1)], cx='.3', cy='.26', r='.9') +
            radial(u, 'glow', [('0', '#ff9a62', .22), ('.6', '#ff8a52', .06), ('1', '#ff8a52', 0)]) +
            # in the body's own frame: applied inside the group that places and turns the body
            '<clipPath id="%sbody"><path d="%s"/></clipPath>' % (u, shape) +
            '<clipPath id="%smclip"><circle cx="%d" cy="%d" r="%d"/></clipPath>' % (u, mx, my, mR))

    o = []
    # Mars: the planet's light on the dark around it, then the disc, its deserts and maria, the night side, the air
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sglow)"/>' % (mx, my, mR + 260, u))
    m = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%smars)"/>' % (mx, my, mR, u),
         rect_fill(mx - mR, my - mR, 2 * mR, mR, 'm1', .5, 'multiply', u),
         rect_fill(mx - mR, my - mR, 2 * mR, mR, 'm2', .3, 'screen', u)]
    for _ in range(9):
        a = rnd.uniform(math.radians(196), math.radians(262)); r = mR * rnd.uniform(.62, .92)
        m.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#4a2212" opacity="%s" transform="rotate(%s %s %s)"/>' % (
            f(mx + r * math.cos(a)), f(my + r * math.sin(a)), f(rnd.uniform(30, 80)), f(rnd.uniform(8, 20)), f(rnd.uniform(.25, .45)),
            f(math.degrees(a) + 90), f(mx + r * math.cos(a)), f(my + r * math.sin(a))))
    o.append('<g clip-path="url(#%smclip)">%s<g filter="url(#%sb12)">%s</g></g>' % (u, ''.join(m[:3]), u, ''.join(m[3:])))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%smshade)"/>' % (mx, my, mR, u))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%sair)"/>' % (mx, my, mR + 3, u))
    o.append('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#cfe0ff" stroke-opacity=".25" stroke-width="4" filter="url(#%sb4)"/>' % (mx, my, mR + 2, u))

    # Phobos, in its own frame: the lit body, its regolith, the grooves, the craters, then Stickney
    def arc(x, y, rx, ry, a0, a1, n=24):
        """A polyline along an ellipse from angle a0 to a1 (degrees, y down)."""
        return 'M' + 'L'.join('%s %s' % (f(x + rx * math.cos(math.radians(a0 + (a1 - a0) * k / n))), f(y + ry * math.sin(math.radians(a0 + (a1 - a0) * k / n)))) for k in range(n + 1))

    b = ['<path d="%s" fill="url(#%slit)"/>' % (shape, u)]
    box = (-A * 1.2, -B * 1.2, A * 2.4, B * 2.4)
    b.append(rect_fill(*box, 'n1', .7, 'multiply', u))
    b.append(rect_fill(*box, 'n3', .4, 'multiply', u))
    b.append(rect_fill(*box, 'n2', .14, 'screen', u))
    # grooves: chains of pits running round the body, centred on a pole off the right-hand end
    # (they circle the point opposite Stickney), so each one bends with the surface
    px, py = A * 1.45, B * 1.25
    gr = []
    for j in range(8):
        r = A * (1.25 + .17 * j) + rnd.uniform(-8, 8)
        span = rnd.uniform(14, 26)
        mid = 222 + rnd.uniform(-10, 10)
        a0, a1 = mid - span, mid + span * rnd.uniform(.5, 1)
        d = arc(px, py, r, r * .9, a0, a1, 40)
        dash = '%s %s %s %s' % (f(rnd.uniform(3, 7)), f(rnd.uniform(2, 4)), f(rnd.uniform(6, 16)), f(rnd.uniform(3, 9)))
        w = rnd.uniform(1.4, 2.4)
        gr.append('<path d="%s" fill="none" stroke="#0a0706" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round" stroke-dasharray="%s"/>' % (d, f(rnd.uniform(.18, .34)), f(w), dash))
        gr.append('<path d="%s" fill="none" stroke="#efe2d0" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round" stroke-dasharray="%s" transform="translate(1.4 1.6)"/>' % (d, f(rnd.uniform(.06, .12)), f(w * .45), dash))
    b.append('<g filter="url(#%sb05)">%s</g>' % (u, ''.join(gr)))

    def crater(x, y, r, op=1.):
        """A bowl lit from the upper left: the near (upper-left) wall in shadow, the far (lower-right) wall and rim catching the light."""
        sq = .82
        return ('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#0a0706" opacity="%s"/>'
                '<path d="%s" fill="none" stroke="#e8dac6" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>'
                '<path d="%s" fill="none" stroke="#120c0a" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>') % (
            f(x), f(y), f(r), f(r * sq), f(.5 * op),
            arc(x, y, r * .8, r * .8 * sq, -10, 110, 12), f(.5 * op), f(max(.8, r * .22)),
            arc(x, y, r * 1.06, r * 1.06 * sq, 160, 260, 12), f(.35 * op), f(max(.6, r * .12)))
    cr = []
    for _ in range(80):
        t = rnd.uniform(0, 2 * math.pi); s = rnd.random() ** .6
        x, y = A * .88 * s * math.cos(t), B * .88 * s * math.sin(t)
        if math.hypot((x + 72) / 84, (y - 14) / 72) < 1:
            continue  # leave Stickney's floor clear
        cr.append(crater(x, y, 1.6 + 8 * rnd.random() ** 3.2, rnd.uniform(.5, .9)))
    for x, y, r in [(72, -64, 16), (126, 30, 11), (24, 94, 10), (-14, -98, 8), (-150, -40, 9)]:
        cr.append(crater(x, y, r))
    b.append('<g filter="url(#%sb05)">%s</g>' % (u, ''.join(cr)))
    # Stickney: nine kilometres across on a moon of twenty-two. Its near wall drops into shadow,
    # its far wall is lit, slumps run down it, and a smaller crater sits on its floor
    sx, sy, sr = -72, 14, 70
    b.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#3a3028" opacity=".9" filter="url(#%sb2)"/>' % (f(sx), f(sy), f(sr), f(sr * .8), u))
    b.append('<path d="%s" fill="none" stroke="#050403" stroke-opacity=".75" stroke-width="%s" filter="url(#%sb4)"/>' % (arc(sx + 8, sy + 6, sr * .78, sr * .62, 150, 300, 30), f(sr * .32), u))
    b.append('<path d="%s" fill="none" stroke="#bfae98" stroke-opacity=".32" stroke-width="%s" filter="url(#%sb4)"/>' % (arc(sx - 4, sy - 3, sr * .8, sr * .64, -20, 120, 30), f(sr * .2), u))
    for k in range(8):
        a = math.radians(-14 + k * 17)
        b.append('<path d="M%s %sL%s %s" stroke="#5a4a3c" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" filter="url(#%sb1)"/>' % (
            f(sx + sr * .92 * math.cos(a)), f(sy + sr * .74 * math.sin(a)), f(sx + sr * .6 * math.cos(a)), f(sy + sr * .48 * math.sin(a)), u))
    b.append('<path d="%s" fill="none" stroke="#f6ead8" stroke-opacity=".85" stroke-width="2.6" stroke-linecap="round" filter="url(#%sb05)"/>' % (arc(sx, sy, sr, sr * .8, -30, 125, 40), u))
    b.append('<path d="%s" fill="none" stroke="#0c0806" stroke-opacity=".6" stroke-width="3" stroke-linecap="round" filter="url(#%sb05)"/>' % (arc(sx, sy, sr * 1.03, sr * .83, 140, 300, 40), u))
    b.append(crater(sx + 14, sy + 16, 12))
    b.append(rect_fill(*box, 'n4', .1, 'overlay', u))
    # form: the body rounds away from the Sun into night, darkest at the lower right
    b.append('<path d="%s" fill="url(#%sform)" style="mix-blend-mode: multiply"/>' % (shape, u))
    # a faint red fill from Mars below, on the night edge turned toward it
    b.append('<path d="%s" fill="none" stroke="#ff9a62" stroke-opacity=".2" stroke-width="18" filter="url(#%sb12)" transform="translate(12 16)"/>' % (shape, u))

    # the lit limb: a thin bright edge on the sunward side
    o.append('<g transform="translate(%d %d) rotate(%s)"><g clip-path="url(#%sbody)">%s</g>'
             '<path d="%s" fill="none" stroke="#f2e6d6" stroke-opacity=".5" stroke-width="1.6" transform="translate(-1.5 -1.5)" clip-path="url(#%sbody)" filter="url(#%sb1)"/></g>' % (
                 cx, cy, f(tilt), u, ''.join(b), shape, u, u))
    obj = svg(W, H, ''.join(o) + grain(u + 'o', W, H, .1), defs)
    km = 2 * A / 27
    c, s = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
    rim = (sx - sr * .5, sy - sr * .62)  # Stickney's upper-left rim, in the body's frame
    ann = [top('JPL HORIZONS 401 · 6,000 KM ABOVE MARS · 7 H 39 M'),
           label((cx + rim[0] * c - rim[1] * s, cy + rim[0] * s + rim[1] * c), (22, 150), ['STICKNEY', '9 KM']),
           label((mx - mR * .62, my - mR * .78), (560, 690), ['MARS'], 'end'),
           scalebar(22, 800, 10 * km, '10 KM')]
    return bg, obj, svg(W, H, ''.join(ann))


PLATES = {'PHOBOS': phobos}

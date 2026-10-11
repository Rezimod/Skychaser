"""The other twenty plates of Set 001, drawn in the manner of drawing.py.

Same stack as the four originals: a sky layer, an object layer with grain, and
a survey layer of reticle, callouts and scale bar. Real objects carry real
measurements; the fiction plates say where they come from.
"""
import math, random
from drawing import f, blob, starfield, SPIKE_DEFS, grain, svg, LBL, label, scalebar, reticle

W, H, HF = 582, 620, 832


def sky(u, h, c, n, seed, spikes, tints=('#ffffff', '#dfe8ff', '#fff1dc', '#cfe0ff'), extra='', extra_defs='', cy='.48'):
    d = SPIKE_DEFS.format(u=u) + ('<radialGradient id="%shz" cx=".5" cy="%s" r=".75"><stop offset="0" stop-color="%s"/>'
                                  '<stop offset=".55" stop-color="%s"/><stop offset="1" stop-color="%s"/></radialGradient>') % (u, cy, c[0], c[1], c[2])
    return svg(W, h, '<rect width="%d" height="%d" fill="url(#%shz)"/>' % (W, h, u) + starfield(W, h, n, seed, spikes, tints, u=u) + extra, d + extra_defs)


def shade_defs(u, lx=.36, ly=.34, term=(.1, .05, .95, .95), t0=.56):
    """Limb darkening and a terminator, lit from (lx, ly)."""
    return ('<radialGradient id="%slimb" cx="%s" cy="%s" r=".66"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#05060a" stop-opacity=".14"/>'
            '<stop offset=".92" stop-color="#030305" stop-opacity=".5"/><stop offset="1" stop-color="#010102" stop-opacity=".82"/></radialGradient>'
            '<linearGradient id="%sterm" x1="%s" y1="%s" x2="%s" y2="%s"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="%s" stop-color="#000" stop-opacity="0"/>'
            '<stop offset="%s" stop-color="#03030a" stop-opacity=".6"/><stop offset="1" stop-color="#010104" stop-opacity=".92"/></linearGradient>') % (
        u, f(lx), f(ly), u, f(term[0]), f(term[1]), f(term[2]), f(term[3]), f(t0), f(min(.97, t0 + .26)))


def top(text):
    return '<text x="22" y="96" fill="rgba(245,241,232,.5)" style="%s">%s</text>' % (LBL, text)


def spike_star(x, y, r, col, L, op=1, w=.9):
    return ('<g opacity="%s"><circle cx="%s" cy="%s" r="%s" fill="%s" opacity=".18"/><circle cx="%s" cy="%s" r="%s" fill="%s" opacity=".35"/><circle cx="%s" cy="%s" r="%s" fill="#fff"/>'
            '<path d="M%s %sH%sM%s %sV%s" stroke="%s" stroke-width="%s" stroke-linecap="round" opacity=".7"/></g>') % (
        f(op), f(x), f(y), f(r * 4.5), col, f(x), f(y), f(r * 2), col, f(x), f(y), f(r), f(x - L), f(y), f(x + L), f(x), f(y - L), f(y + L), col, f(w))


# ================================================================= TRANQUILITY BASE
def tranquility(u):
    h = HF
    rnd = random.Random(1969)
    bg = sky(u, h, ('#0b0f1c', '#05070f', '#010207'), 170, 69, 2, extra=
             '<circle cx="438" cy="150" r="40" fill="url(#%searth)"/>'
             '<path d="M438 110A40 40 0 0 0 438 190A22 40 0 0 1 438 110Z" fill="#02040a" opacity=".82"/>'
             '<circle cx="438" cy="150" r="40" fill="none" stroke="#bfe0ff" stroke-opacity=".25"/>' % u,
             extra_defs='<radialGradient id="%searth" cx=".62" cy=".38" r=".7"><stop offset="0" stop-color="#e8f3ff"/><stop offset=".35" stop-color="#6fa6e0"/><stop offset=".7" stop-color="#2b5c9e"/><stop offset="1" stop-color="#0d2448"/></radialGradient>' % u, cy='.3')
    defs = ('<linearGradient id="%sgnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e6c66"/><stop offset=".4" stop-color="#8d8a82"/><stop offset="1" stop-color="#b4b0a6"/></linearGradient>'
            '<linearGradient id="%sfoil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".35" stop-color="#d9a441"/><stop offset=".6" stop-color="#8a5a18"/><stop offset=".8" stop-color="#e8c26a"/><stop offset="1" stop-color="#6b4210"/></linearGradient>'
            '<linearGradient id="%sfoilS" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a3a10"/><stop offset=".5" stop-color="#c79436"/><stop offset="1" stop-color="#3a2408"/></linearGradient>'
            '<filter id="%sn1" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".03 .12" numOctaves="4" seed="3"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sb2"><feGaussianBlur stdDeviation="2"/></filter>') % (u, u, u, u, u)
    hz = 330
    o = ['<path d="M0 %dQ150 %d 300 %dT582 %dV%dH0Z" fill="url(#%sgnd)"/>' % (hz, hz - 6, hz + 2, hz - 4, h, u),
         '<rect y="%d" width="%d" height="%d" filter="url(#%sn1)" opacity=".35" style="mix-blend-mode: multiply"/>' % (hz - 8, W, h - hz + 8, u)]
    # small craters on the plain, flattened by perspective
    for _ in range(46):
        y = rnd.uniform(hz + 10, h - 10); k = (y - hz) / (h - hz)
        x = rnd.uniform(-10, W + 10); r = (3 + 26 * rnd.random() ** 2.5) * (.3 + k)
        o.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#3e3c38" opacity=".3"/><ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="none" stroke="#d8d4ca" stroke-opacity=".3" stroke-width=".8"/>' % (
            f(x), f(y), f(r), f(r * (.18 + .2 * k)), f(x + r * .1), f(y + r * .04), f(r * 1.05), f(r * (.2 + .2 * k))))
    for _ in range(140):
        y = rnd.uniform(hz + 4, h); k = (y - hz) / (h - hz)
        o.append('<circle cx="%s" cy="%s" r="%s" fill="#2a2926" opacity="%s"/>' % (f(rnd.uniform(0, W)), f(y), f(.5 + 2.4 * k * rnd.random()), f(.3 + .4 * rnd.random())))
    # footprints: a trail from the ladder to the flag and the experiments
    for i in range(34):
        t = i / 33
        x = 250 + 150 * t + 14 * math.sin(t * 9); y = 420 + 70 * t + 6 * math.cos(t * 7)
        o.append('<ellipse cx="%s" cy="%s" rx="3.4" ry="1.3" fill="#3a3834" opacity=".55" transform="rotate(%s %s %s)"/>' % (f(x + (3 if i % 2 else -3)), f(y), f(20 + 10 * math.sin(t * 5)), f(x), f(y)))
    # the descent stage: octagonal body in foil, four legs, footpads
    lx, ly = 250, 400
    o.append('<ellipse cx="%d" cy="%d" rx="118" ry="16" fill="#1a1916" opacity=".55" filter="url(#%sb2)"/>' % (lx + 20, ly + 44, u))
    legs = [(-92, 40, -58, -6), (92, 40, 58, -6), (-40, 52, -30, 4), (40, 52, 30, 4)]
    for fx, fy, ax, ay in legs:
        o.append('<path d="M%d %dL%d %dM%d %dL%d %d" stroke="#c9c2b0" stroke-width="3" stroke-linecap="round"/>' % (lx + ax, ly + ay - 30, lx + fx, ly + fy, lx + ax * .6, ly + ay - 4, lx + fx, ly + fy))
        o.append('<ellipse cx="%d" cy="%d" rx="11" ry="3.5" fill="#d9d2c0"/>' % (lx + fx, ly + fy + 1))
    o.append('<path d="M%d %dL%d %dL%d %dL%d %dL%d %dL%d %dZ" fill="url(#%sfoil)" stroke="#3a2408" stroke-width=".8"/>' % (
        lx - 64, ly - 58, lx + 64, ly - 58, lx + 74, ly - 34, lx + 64, ly - 6, lx - 64, ly - 6, lx - 74, ly - 34, u))
    o.append('<path d="M%d %dH%dM%d %dH%d" stroke="#fff4cc" stroke-opacity=".35" stroke-width="1"/>' % (lx - 70, ly - 40, lx + 70, lx - 66, ly - 22, lx + 66))
    for i in range(9):
        x = lx - 62 + i * 15.5
        o.append('<path d="M%s %dv%d" stroke="#4a300c" stroke-opacity=".45" stroke-width=".7"/>' % (f(x), ly - 57, 50))
    o.append('<rect x="%d" y="%d" width="128" height="8" fill="#1a1510"/>' % (lx - 64, ly - 66))
    # ladder on the forward leg
    o.append('<g stroke="#e0d8c4" stroke-width="1.4"><path d="M%d %dL%d %dM%d %dL%d %d"/>%s</g>' % (
        lx - 10, ly - 6, lx - 16, ly + 44, lx + 2, ly - 6, lx - 4, ly + 44, ''.join('<path d="M%s %sH%s"/>' % (f(lx - 11 - k * .6), f(ly + 2 + k * 5), f(lx + 1 - k * .6)) for k in range(8))))
    # plaque, flag, experiments
    o.append('<rect x="%d" y="%d" width="10" height="7" fill="#d8d0bc"/>' % (lx - 8, ly + 6))
    fxp, fyp = 408, 466
    o.append('<path d="M%d %dV%d" stroke="#e8e4da" stroke-width="2"/><path d="M%d %dH%d" stroke="#e8e4da" stroke-width="1.6"/>' % (fxp, fyp, fyp - 118, fxp, fyp - 116, fxp + 62))
    fl = ['<rect x="%d" y="%d" width="62" height="40" fill="#f2f0ea"/>' % (fxp, fyp - 116)]
    for k in range(7):
        fl.append('<rect x="%d" y="%s" width="62" height="%s" fill="#b8323a"/>' % (fxp, f(fyp - 116 + k * 40 / 6.5), f(40 / 13)))
    fl.append('<rect x="%d" y="%d" width="26" height="%s" fill="#2b3f7a"/>' % (fxp, fyp - 116, f(40 * 7 / 13)))
    o.append('<g transform="translate(0 0)">%s</g>' % ''.join(fl))
    o.append('<ellipse cx="%d" cy="%d" rx="14" ry="3" fill="#1a1916" opacity=".4"/>' % (fxp, fyp + 1))
    # LRRR: a tilted panel of corner cubes
    rx_, ry_ = 470, 528
    o.append('<g transform="translate(%d %d) skewX(-18)"><rect x="-24" y="-12" width="48" height="20" fill="#c6c2b8" stroke="#6a665e" stroke-width=".8"/>%s</g>' % (
        rx_, ry_, ''.join('<circle cx="%s" cy="%s" r="1.3" fill="#3a3a44"/>' % (f(-20 + 4.4 * (i % 10)), f(-8 + 4 * (i // 10))) for i in range(40))))
    o.append('<path d="M%d %dL%d %dM%d %dL%d %d" stroke="#8e8a80" stroke-width="1.2"/>' % (rx_ - 16, ry_ + 8, rx_ - 20, ry_ + 16, rx_ + 12, ry_ + 8, rx_ + 16, ry_ + 16))
    # PSE: a small drum with two solar wings
    px, py = 150, 510
    o.append('<path d="M%d %dL%d %dL%d %dL%d %dZ" fill="#26324e" stroke="#9aa4ba" stroke-width=".6"/><path d="M%d %dL%d %dL%d %dL%d %dZ" fill="#26324e" stroke="#9aa4ba" stroke-width=".6"/>'
             '<rect x="%d" y="%d" width="14" height="16" fill="url(#%sfoilS)"/>' % (
                 px - 40, py - 6, px - 8, py - 10, px - 8, py + 2, px - 40, py + 6, px + 8, py - 10, px + 40, py - 6, px + 40, py + 6, px + 8, py + 2, px - 7, py - 12, u))
    # a shadow line from the low sun, and the grain
    obj = svg(W, h, ''.join(o) + grain(u + 'o', W, h, .12), defs)
    ann = [top('0.674°N 23.473°E · MARE TRANQUILLITATIS')]
    ann.append(label((lx, ly - 34), (22, 250), ['DESCENT STAGE', 'EAGLE · 20 JULY 1969']))
    ann.append(label((fxp + 30, fyp - 96), (560, 290), ['FLAG', 'PLANTED 03:41 UTC'], 'end'))
    ann.append(label((rx_, ry_ - 4), (560, 480), ['RETROREFLECTOR', 'STILL RANGED FROM EARTH'], 'end'))
    ann.append(label((px, py - 8), (22, 490), ['SEISMOMETER', 'PASSIVE SEISMIC EXP.']))
    ann.append(label((438, 150), (560, 214), ['EARTH', '384,400 KM'], 'end'))
    ann.append(label((330, 458), (22, 420), ['BOOTPRINTS', 'NO WIND TO ERASE THEM']))
    return bg, obj, svg(W, h, ''.join(ann))


# ================================================================= VENUS
def venus(u):
    cx, cy, R = 291, 300, 172
    bg = sky(u, H, ('#2a2016', '#130d08', '#050306'), 150, 299, 3, extra='<circle cx="%d" cy="%d" r="%d" fill="url(#%shalo)"/>' % (cx, cy, R + 60, u),
             extra_defs='<radialGradient id="%shalo"><stop offset=".72" stop-color="#ffd79a" stop-opacity=".18"/><stop offset="1" stop-color="#ffd79a" stop-opacity="0"/></radialGradient>' % u)
    defs = ('<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
            '<radialGradient id="%sbase" cx=".34" cy=".4" r=".75"><stop offset="0" stop-color="#fff4d8"/><stop offset=".45" stop-color="#f0d9a6"/><stop offset=".85" stop-color="#c9a262"/><stop offset="1" stop-color="#8a6432"/></radialGradient>'
            '<filter id="%scl" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".008 .03" numOctaves="4" seed="12"/><feColorMatrix type="matrix" values="0 0 0 0 .55  0 0 0 0 .4  0 0 0 0 .2  0 0 0 -2.2 1.35"/></filter>'
            '<filter id="%sb3"><feGaussianBlur stdDeviation="3"/></filter>'
            '<filter id="%sb10" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="10"/></filter>') % (u, cx, cy, R, u, u, u, u) + shade_defs(u, .3, .36)
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
         '<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%scl)" opacity=".55" transform="rotate(-8 %d %d)"/>' % (cx - R - 20, cy - R - 20, 2 * R + 40, 2 * R + 40, u, cx, cy)]
    # the dark Y of the ultraviolet clouds, lying on its side
    b.append('<g filter="url(#%sb3)" fill="none" stroke="#8a6432" stroke-linecap="round" opacity=".45">' % u +
             '<path d="M%d %dQ%d %d %d %d" stroke-width="26"/><path d="M%d %dQ%d %d %d %d" stroke-width="18"/><path d="M%d %dQ%d %d %d %d" stroke-width="18"/></g>' % (
                 cx - 150, cy + 6, cx - 40, cy + 2, cx + 20, cy + 4, cx + 20, cy + 4, cx + 90, cy - 40, cx + 160, cy - 86, cx + 20, cy + 4, cx + 90, cy + 50, cx + 160, cy + 92))
    for i in range(9):
        y = cy - R + 30 + i * 36
        b.append('<path d="M%d %sQ%d %s %d %s" fill="none" stroke="%s" stroke-opacity=".16" stroke-width="%d"/>' % (
            cx - R, f(y), cx, f(y + (8 if i % 2 else -6)), cx + R, f(y + 4), '#fff8e6' if i % 2 else '#9b7440', 5 + (i % 3) * 3))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimb)"/>' % (cx, cy, R, u))
    # gibbous: the night side on the right
    k = .42
    b.append('<path d="M%d %dA%d %d 0 0 1 %d %dA%s %d 0 0 0 %d %dZ" fill="#050306" opacity=".93" filter="url(#%sb10)"/>' % (cx, cy - R - 10, R + 10, R + 10, cx, cy + R + 10, f(k * R), R + 10, cx, cy - R - 10, u))
    obj = svg(W, H, '<g clip-path="url(#%sdisk)">%s</g><circle cx="%d" cy="%d" r="%s" fill="none" stroke="#fff3d6" stroke-opacity=".22"/>' % (u, ''.join(b), cx, cy, f(R - .5)) + grain(u + 'o', W, H, .1), defs)
    ann = [reticle(cx, cy, R + 16, 72, 4, .2), top('CLOUD TOPS · SUPER-ROTATION 4 DAYS')]
    ann.append(label((cx - 60, cy + 4), (22, 262), ['Y-FEATURE', 'UV CLOUD PATTERN']))
    ann.append(label((cx - 90, cy - 110), (22, 146), ['CLOUD DECK', '45–70 KM · SULFURIC ACID']))
    ann.append(label((cx + 80, cy + 120), (560, 500), ['TERMINATOR', 'PHASE 64% LIT'], 'end'))
    ann.append(label((cx + R - 6, cy - 40), (560, 150), ['NIGHT SIDE', 'SURFACE 465 °C'], 'end'))
    ann.append(scalebar(22, 590, 5000 / 6052 * R, '5,000 KM'))
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= MARS
def mars(u):
    cx, cy, R = 291, 300, 180
    rnd = random.Random(499)
    bg = sky(u, H, ('#2a1510', '#120907', '#040205'), 170, 498, 4)
    defs = ('<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
            '<radialGradient id="%sbase" cx=".4" cy=".38" r=".75"><stop offset="0" stop-color="#f2a36a"/><stop offset=".5" stop-color="#d9713a"/><stop offset=".85" stop-color="#a44a24"/><stop offset="1" stop-color="#5a2412"/></radialGradient>'
            '<filter id="%sn1" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="5" seed="7"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sb3"><feGaussianBlur stdDeviation="3.2"/></filter><filter id="%sb1"><feGaussianBlur stdDeviation="1"/></filter><filter id="%sb6" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="46"/><feGaussianBlur stdDeviation="3.5"/></filter>'
            '<radialGradient id="%satm" cx=".5" cy=".5" r=".5"><stop offset=".9" stop-color="#ffb08a" stop-opacity="0"/><stop offset=".985" stop-color="#ffc2a0" stop-opacity=".45"/><stop offset="1" stop-color="#ffc2a0" stop-opacity="0"/></radialGradient>') % (
        u, cx, cy, R, u, u, u, u, u, u) + shade_defs(u, .38, .36, (.05, .1, 1, .9), .6)
    P = lambda x, y: (cx + x * R, cy + y * R)
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
         '<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn1)" opacity=".4" style="mix-blend-mode: multiply"/>' % (cx - R, cy - R, 2 * R, 2 * R, u)]
    dark = [(.18, .02, .14, .34), (.05, .3, .3, .1), (-.35, .16, .26, .09), (-.62, .02, .12, .2), (.46, -.18, .16, .1), (-.1, -.3, .5, .07), (.4, .38, .2, .06)]
    d = ''.join('<path d="%s" fill="#6a2a14" opacity="%s"/>' % (blob(*P(x + rnd.uniform(-.6, .6) * rx, y + rnd.uniform(-.6, .6) * ry), rx * R * rnd.uniform(.35, .7), ry * R * rnd.uniform(.5, 1.1), rnd, 14, .45), f(rnd.uniform(.25, .45))) for x, y, rx, ry in dark for _ in range(6))
    b.append('<g filter="url(#%sb6)">%s</g>' % (u, d))
    # Hellas, bright; Valles Marineris; Tharsis volcanoes; Olympus Mons
    b.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#f8c9a0" opacity=".55" filter="url(#%sb3)"/>' % (f(P(.3, .56)[0]), f(P(.3, .56)[1]), f(.2 * R), f(.13 * R), u))
    vx, vy = P(-.62, .12)
    b.append('<path d="M%s %sQ%s %s %s %s" fill="none" stroke="#4a1a0a" stroke-width="3.2" stroke-opacity=".7" stroke-linecap="round" filter="url(#%sb1)"/>' % (
        f(vx), f(vy), f(vx + .2 * R), f(vy + .06 * R), f(vx + .44 * R), f(vy + .02 * R), u))
    for x, y, r in [(-.78, -.12, 11), (-.7, -.02, 6), (-.66, .06, 6), (-.64, -.12, 6)]:
        X, Y = P(x, y)
        b.append('<circle cx="%s" cy="%s" r="%s" fill="#b8562a" stroke="#ffc9a4" stroke-opacity=".35" stroke-width=".8"/><circle cx="%s" cy="%s" r="%s" fill="#5a2210" opacity=".6"/>' % (
            f(X), f(Y), f(r), f(X + r * .15), f(Y + r * .1), f(r * .3)))
    for _ in range(90):
        x, y = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        if x * x + y * y > .9: continue
        X, Y = P(x, y); r = 1 + 6 * rnd.random() ** 3
        b.append('<circle cx="%s" cy="%s" r="%s" fill="none" stroke="#ffd0b0" stroke-opacity=".22" stroke-width=".6"/>' % (f(X), f(Y), f(r)))
    b.append('<path d="%s" fill="#fbf6f0" opacity=".92" filter="url(#%sb1)"/>' % (blob(*P(.02, -.86), .34 * R, .14 * R, rnd, 14, .18), u))
    b.append('<path d="%s" fill="#f4ece4" opacity=".6" filter="url(#%sb1)"/>' % (blob(*P(-.04, .92), .2 * R, .06 * R, rnd, 12, .2), u))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimb)"/><circle cx="%d" cy="%d" r="%d" fill="url(#%sterm)"/>' % (cx, cy, R, u, cx, cy, R, u))
    obj = svg(W, H, '<circle cx="%d" cy="%d" r="%d" fill="url(#%satm)"/><g clip-path="url(#%sdisk)">%s</g>' % (cx, cy, R + 6, u, u, ''.join(b)) +
              '<circle cx="84" cy="486" r="3.2" fill="#b8a898"/><circle cx="520" cy="160" r="2" fill="#a89888"/>' + grain(u + 'o', W, H, .11), defs)
    ann = [reticle(cx, cy, R + 16, 72, 4, .2), top('ALBEDO FEATURES · NORTHERN SUMMER')]
    ann.append(label(P(-.78, -.12), (22, 196), ['OLYMPUS MONS', '21.9 KM HIGH']))
    ann.append(label(P(-.4, .14), (22, 440), ['VALLES MARINERIS', '4,000 KM LONG']))
    ann.append(label(P(.02, -.86), (560, 128), ['NORTH POLAR CAP', 'WATER + CO₂ ICE'], 'end'))
    ann.append(label(P(.18, .02), (560, 262), ['SYRTIS MAJOR', 'DARK BASALT'], 'end'))
    ann.append(label(P(.3, .56), (560, 450), ['HELLAS PLANITIA', '2,300 KM'], 'end'))
    ann.append('<text x="92" y="482" fill="rgba(245,241,232,.66)" style="%s">PHOBOS</text><text x="512" y="156" text-anchor="end" fill="rgba(245,241,232,.66)" style="%s">DEIMOS</text>' % (LBL, LBL))
    ann.append(scalebar(560 - 1000 / 3390 * R, 590, 1000 / 3390 * R, '1,000 KM', 'end'))
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= JUPITER
def jupiter(u, h=H):
    cx, cy, a = 291, 330, 158
    b_ = a * (1 - .065)
    rnd = random.Random(599)
    bg = sky(u, h, ('#2a2018', '#120d0a', '#050407'), 200, 598, 5)
    defs = ('<clipPath id="%sdisk"><ellipse cx="%d" cy="%d" rx="%d" ry="%s"/></clipPath>'
            '<filter id="%sturb" x="-10%%" y="-10%%" width="120%%" height="120%%"><feTurbulence type="fractalNoise" baseFrequency=".004 .06" numOctaves="3" seed="21"/><feDisplacementMap in="SourceGraphic" scale="16"/></filter>'
            '<filter id="%sb1"><feGaussianBlur stdDeviation=".8"/></filter>'
            '<radialGradient id="%sgrs" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e8a17a"/><stop offset=".55" stop-color="#c8643c"/><stop offset=".85" stop-color="#a44a2c"/><stop offset="1" stop-color="#f0d8c0"/></radialGradient>') % (
        u, cx, cy, a, f(b_), u, u, u) + shade_defs(u, .38, .36, (.1, .1, .95, .9), .6)
    bands = [(-1, '#9aa0a8'), (-.82, '#b8a58c'), (-.66, '#d8c8aa'), (-.5, '#a88a6a'), (-.4, '#e6d6b8'), (-.26, '#9c6a44'), (-.14, '#b07a50'),
             (-.06, '#f4ead4'), (.1, '#e8d2a8'), (.16, '#a8704a'), (.3, '#8e5a38'), (.38, '#e8d8bc'), (.52, '#b89470'), (.64, '#d8c8aa'), (.8, '#a8a092')]
    g = ['<rect x="%d" y="%s" width="%d" height="%s" fill="%s"/>' % (cx - a - 20, f(cy + y * b_), 2 * a + 40, f(b_ * .3), c) for y, c in bands]
    for i in range(60):
        y = cy + rnd.uniform(-.95, .95) * b_
        g.append('<path d="M%d %sH%d" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (cx - a - 20, f(y), cx + a + 20, rnd.choice(['#fff4e0', '#6a4428', '#c89870']), f(rnd.uniform(.08, .25)), f(rnd.uniform(.6, 3))))
    for i in range(18):
        x = cx + rnd.uniform(-.8, .8) * a; y = cy + rnd.choice([-.2, .06, .34]) * b_
        g.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#fff6e4" opacity=".4"/>' % (f(x), f(y), f(rnd.uniform(4, 12)), f(rnd.uniform(1.5, 3))))
    gx, gy = cx + .3 * a, cy + .3 * b_
    spot = ('<ellipse cx="%s" cy="%s" rx="30" ry="16" fill="#f4e4cc" opacity=".7"/><ellipse cx="%s" cy="%s" rx="24" ry="12" fill="url(#%sgrs)"/>'
            '<ellipse cx="%s" cy="%s" rx="14" ry="6" fill="none" stroke="#f8d8b8" stroke-opacity=".4"/>') % (f(gx - 4), f(gy), f(gx), f(gy), u, f(gx), f(gy))
    body = ('<g clip-path="url(#%sdisk)"><g filter="url(#%sturb)">%s</g>%s<ellipse cx="%d" cy="%d" rx="%d" ry="%s" fill="url(#%slimb)"/><ellipse cx="%d" cy="%d" rx="%d" ry="%s" fill="url(#%sterm)"/></g>'
            '<ellipse cx="%d" cy="%d" rx="%s" ry="%s" fill="none" stroke="#fff3d6" stroke-opacity=".2"/>') % (
        u, u, ''.join(g), spot, cx, cy, a, f(b_), u, cx, cy, a, f(b_), u, cx, cy, f(a - .5), f(b_ - .5))
    moons = [('IO', -216, 6, 3.4, '#f0d890'), ('EUROPA', 232, 2, 3, '#ece4d4'), ('GANYMEDE', -258, 8, 4.8, '#c8bca8'), ('CALLISTO', 268, 5, 4.4, '#8a7c6c')]
    mo = ''.join('<circle cx="%d" cy="%d" r="%s" fill="%s"/><circle cx="%s" cy="%d" r="%s" fill="#000" opacity=".4"/>' % (cx + x, cy + y, f(r), c, f(cx + x + r * .35), cy + y, f(r * .85)) for n, x, y, r, c in moons)
    obj = svg(W, h, body + mo + grain(u + 'o', W, h, .12), defs)
    ann = [reticle(cx, cy, a + 14, 72, 8, .2), top('SYSTEM II · FLATTENING 0.065')]
    ann.append(label((gx, gy), (560, 470), ['GREAT RED SPOT', '16,350 KM'], 'end'))
    ann.append(label((cx - .5 * a, cy - .2 * b_), (22, 150), ['NORTH EQUATORIAL', 'BELT']))
    ann.append(label((cx - .4 * a, cy + .34 * b_), (22, 470), ['SOUTH EQUATORIAL', 'BELT']))
    ann.append(label((cx + .2 * a, cy + .02 * b_), (560, 150), ['EQUATORIAL ZONE'], 'end'))
    for n, x, y, r, c in moons:
        ann.append('<text x="%d" y="%d" fill="rgba(245,241,232,.66)" style="%s" text-anchor="middle">%s</text>' % (cx + x, cy + y + (20 if n in ('IO', 'CALLISTO') else -12), LBL, n))
    ann.append(scalebar(22, 590, 50000 / 71492 * a, '50,000 KM'))
    return bg, obj, svg(W, h, ''.join(ann))


# ================================================================= PLUTO
def pluto(u):
    cx, cy, R = 291, 300, 176
    rnd = random.Random(999)
    bg = sky(u, H, ('#1e1826', '#0c0912', '#030206'), 220, 998, 4)
    defs = ('<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
            '<radialGradient id="%sbase" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="#f0dcc4"/><stop offset=".5" stop-color="#cfae8c"/><stop offset=".85" stop-color="#a0785a"/><stop offset="1" stop-color="#5a4034"/></radialGradient>'
            '<filter id="%sn1" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".025" numOctaves="5" seed="15"/><feColorMatrix type="saturate" values="0"/></filter>'
            '<filter id="%sb3"><feGaussianBlur stdDeviation="3"/></filter><filter id="%sb1"><feGaussianBlur stdDeviation=".9"/></filter><filter id="%sb6" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="5"/></filter>'
            '<radialGradient id="%sch" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#d8d0c8"/><stop offset=".7" stop-color="#8a847e"/><stop offset="1" stop-color="#3a3632"/></radialGradient>') % (
        u, cx, cy, R, u, u, u, u, u, u) + shade_defs(u, .4, .36)
    P = lambda x, y: (cx + x * R, cy + y * R)
    b = ['<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/>' % (cx, cy, R, u),
         '<rect x="%d" y="%d" width="%d" height="%d" filter="url(#%sn1)" opacity=".38" style="mix-blend-mode: multiply"/>' % (cx - R, cy - R, 2 * R, 2 * R, u)]
    # Cthulhu: the long dark red band along the equator, west of the heart
    b.append('<g filter="url(#%sb6)">%s</g>' % (u, ''.join('<path d="%s" fill="#5a2418" opacity=".4"/>' % blob(*P(-.5 + rnd.uniform(-.3, .3), .34 + rnd.uniform(-.1, .12)), .22 * R, .14 * R, rnd, 14, .4) for _ in range(9))))
    b.append('<path d="%s" fill="#6a2c1c" opacity=".6" filter="url(#%sb3)"/>' % (blob(*P(.62, .44), .3 * R, .14 * R, rnd, 14, .25), u))
    # the heart: Sputnik Planitia (west lobe, smooth) and the eastern lobe
    heart = 'M%s %sC%s %s %s %s %s %sC%s %s %s %s %s %sC%s %s %s %s %s %sC%s %s %s %s %s %sZ' % tuple(f(v) for v in (
        *P(.1, -.12), *P(-.02, -.42), *P(-.4, -.34), *P(-.34, .02), *P(-.28, .3), *P(.02, .4), *P(.14, .46),
        *P(.34, .34), *P(.6, .2), *P(.5, -.14), *P(.4, -.4), *P(.16, -.36), *P(.1, -.12)))
    b.append('<path d="%s" fill="#fbf4ea" opacity=".62" filter="url(#%sb6)"/><path d="%s" fill="#fbf4ea" opacity=".4" filter="url(#%sb1)" transform="translate(%s %s) scale(.86) translate(%s %s)"/>' % (heart, u, heart, u, f(cx), f(cy), f(-cx), f(-cy)))
    for _ in range(70):
        x, y = rnd.uniform(-.34, .06), rnd.uniform(-.3, .34)
        X, Y = P(x, y)
        b.append('<path d="%s" fill="none" stroke="#c8b8a4" stroke-opacity=".3" stroke-width=".6"/>' % blob(X, Y, rnd.uniform(4, 10), rnd.uniform(4, 10), rnd, 6, .3))
    for _ in range(80):
        x, y = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        if x * x + y * y > .9 or (-.4 < x < .6 and -.4 < y < .45): continue
        X, Y = P(x, y); r = 1.2 + 7 * rnd.random() ** 3
        b.append('<circle cx="%s" cy="%s" r="%s" fill="#3a2418" opacity=".25"/><circle cx="%s" cy="%s" r="%s" fill="none" stroke="#f4e4d0" stroke-opacity=".25" stroke-width=".6"/>' % (f(X), f(Y), f(r), f(X), f(Y), f(r)))
    b.append('<circle cx="%d" cy="%d" r="%d" fill="url(#%slimb)"/><circle cx="%d" cy="%d" r="%d" fill="url(#%sterm)"/>' % (cx, cy, R, u, cx, cy, R, u))
    chx, chy, chr_ = 478, 148, 26
    ch = ('<circle cx="%d" cy="%d" r="%d" fill="url(#%sch)"/><path d="%s" fill="#6a3424" opacity=".6"/><path d="M%d %dA%d %d 0 0 1 %d %dA%s %d 0 0 0 %d %dZ" fill="#030206" opacity=".8"/>' % (
        chx, chy, chr_, u, blob(chx, chy - chr_ * .78, chr_ * .5, chr_ * .16, rnd, 10, .2), chx, chy - chr_, chr_, chr_, chx, chy + chr_, f(chr_ * .5), chr_, chx, chy - chr_))
    obj = svg(W, H, '<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#bcd0ff" stroke-opacity=".18" stroke-width="4"/><g clip-path="url(#%sdisk)">%s</g>' % (cx, cy, R + 2, u, ''.join(b)) + ch + grain(u + 'o', W, H, .12), defs)
    ann = [reticle(cx, cy, R + 16, 72, 4, .2), top('NEW HORIZONS · 14 JULY 2015')]
    ann.append(label(P(-.2, 0), (22, 212), ['SPUTNIK PLANITIA', '1,050 KM · NITROGEN ICE']))
    ann.append(label(P(.36, .1), (560, 312), ['TOMBAUGH REGIO', 'THE HEART'], 'end'))
    ann.append(label(P(-.6, .36), (22, 470), ['CTHULHU MACULA', 'THOLIN-DARKENED']))
    ann.append(label(P(0, -.99), (22, 130), ['HAZE', 'BLUE, 200 KM HIGH']))
    ann.append(label((chx, chy + chr_), (560, 216), ['CHARON', '1,212 KM'], 'end'))
    ann.append(scalebar(560 - 500 / 1188 * R, 590, 500 / 1188 * R, '500 KM', 'end'))
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= HALLEY
def halley(u, h=H):
    rnd = random.Random(1986)
    nx, ny = 396, 206
    bg = sky(u, h, ('#122038', '#07101e', '#02050c'), 300, 76, 6)
    defs = ('<radialGradient id="%scoma" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff"/><stop offset=".12" stop-color="#fff2d0" stop-opacity=".9"/><stop offset=".4" stop-color="#b8f0e0" stop-opacity=".3"/><stop offset="1" stop-color="#7fd8c8" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="%sdust" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0cc" stop-opacity=".75"/><stop offset=".5" stop-color="#ffd89a" stop-opacity=".28"/><stop offset="1" stop-color="#ffc878" stop-opacity="0"/></linearGradient>'
            '<linearGradient id="%sion" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe4ff" stop-opacity=".8"/><stop offset=".6" stop-color="#6fb6ff" stop-opacity=".2"/><stop offset="1" stop-color="#6fb6ff" stop-opacity="0"/></linearGradient>'
            '<filter id="%sb6" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="6"/></filter>'
            '<filter id="%sb2" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="1.6"/></filter>') % (u, u, u, u, u)
    # dust tail: broad and curved; ion tail: narrow and straight, pointing away from the Sun
    dust = 'M%d %dC%d %d %d %d %d %dL%d %dC%d %d %d %d %d %dZ' % (nx - 6, ny - 10, nx - 120, ny + 20, nx - 280, ny + 170, nx - 420, ny + 440, nx - 250, ny + 470, nx - 180, ny + 240, nx - 70, ny + 90, nx + 6, ny + 12)
    ion = 'M%d %dL%d %dL%d %dZ' % (nx - 3, ny - 3, nx - 400, ny + 330, nx - 370, ny + 356)
    streams = ''.join('<path d="M%d %dL%s %s" stroke="#cfe8ff" stroke-opacity="%s" stroke-width="%s"/>' % (
        nx, ny, f(nx - 400 + rnd.uniform(-30, 30)), f(ny + 340 + rnd.uniform(-30, 30)), f(rnd.uniform(.08, .25)), f(rnd.uniform(.4, 1.4))) for _ in range(14))
    motes = ''.join('<circle cx="%s" cy="%s" r="%s" fill="#fff0d0" opacity="%s"/>' % (
        f(nx - t * 360 + rnd.gauss(0, 16 + 50 * t)), f(ny + t * t * 330 + t * 60 + rnd.gauss(0, 10 + 30 * t)), f(.3 + .8 * rnd.random()), f(.2 + .5 * rnd.random() * (1 - t)))
        for t in (rnd.random() ** 1.4 for _ in range(500)))
    jets = ''.join('<path d="M%d %dl%s %s" stroke="#fff" stroke-opacity=".5" stroke-width="1" filter="url(#%sb2)"/>' % (nx, ny, f(30 * math.cos(a)), f(30 * math.sin(a)), u) for a in (-1.2, -.5, .2))
    obj = svg(W, h, '<g filter="url(#%sb6)"><path d="%s" fill="url(#%sdust)"/><path d="%s" fill="url(#%sion)"/></g>%s%s' % (u, dust, u, ion, u, streams, motes) +
              '<circle cx="%d" cy="%d" r="70" fill="url(#%scoma)"/>%s<circle cx="%d" cy="%d" r="3.2" fill="#fff"/>' % (nx, ny, u, jets, nx, ny) + grain(u + 'o', W, h, .12), defs)
    ann = [reticle(nx, ny, 58, 72, 4, .22), top('PERIHELION 9 FEB 1986 · NEXT 28 JULY 2061')]
    ann.append(label((nx, ny), (560, 330), ['NUCLEUS', '15 × 8 KM · DARK AS COAL'], 'end'))
    ann.append(label((nx + 40, ny - 40), (560, 130), ['COMA', '100,000 KM ACROSS'], 'end'))
    ann.append(label((nx - 250, ny + 210), (22, 300), ['ION TAIL', 'BLUE · POINTS FROM THE SUN']))
    ann.append(label((nx - 200, ny + 250), (560, 520), ['DUST TAIL', 'CURVED · SUNLIT DUST'], 'end'))
    ann.append('<g stroke="rgba(245,241,232,.5)" stroke-width=".7"><path d="M536 212L556 194M556 194l-7 1M556 194l-1 7"/></g><text x="530" y="226" text-anchor="end" fill="rgba(245,241,232,.6)" style="%s">SUN</text>' % LBL)
    ann.append(scalebar(22, 590, 110, '1 MILLION KM'))
    return bg, obj, svg(W, h, ''.join(ann))


# ================================================================= SIRIUS
def sirius(u):
    cx, cy = 280, 300
    bx, by = cx + 118, cy - 66
    bg = sky(u, H, ('#17254a', '#0a1328', '#03060e'), 260, 9, 5)
    defs = ('<radialGradient id="%sglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff"/><stop offset=".06" stop-color="#f4f8ff"/><stop offset=".16" stop-color="#bcd8ff" stop-opacity=".7"/><stop offset=".4" stop-color="#7fb0ff" stop-opacity=".18"/><stop offset="1" stop-color="#7fb0ff" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="%ssH" x1="0" x2="1"><stop offset="0" stop-color="#bcd8ff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#bcd8ff" stop-opacity="0"/></linearGradient>'
            '<linearGradient id="%ssV" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#bcd8ff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#bcd8ff" stop-opacity="0"/></linearGradient>'
            '<filter id="%sb1"><feGaussianBlur stdDeviation="1.2"/></filter><filter id="%sprism" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="2.4"/></filter>') % (u, u, u, u, u)
    rings = ''.join('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" filter="url(#%sprism)"/>' % (
        cx, cy, r, c, f(op), f(w), u) for r, c, op, w in [(44, '#ffb0c8', .22, 2), (47, '#b0ffd8', .18, 2), (50, '#a8c8ff', .22, 2), (82, '#c8d8ff', .08, 3), (120, '#c8d8ff', .05, 3)])
    spikes = ('<rect x="%d" y="%s" width="520" height="2.4" fill="url(#%ssH)" filter="url(#%sb1)"/><rect x="%s" y="%d" width="2.4" height="520" fill="url(#%ssV)" filter="url(#%sb1)"/>'
              '<g transform="rotate(45 %d %d)" opacity=".35"><rect x="%d" y="%s" width="300" height="1.2" fill="url(#%ssH)"/><rect x="%s" y="%d" width="1.2" height="300" fill="url(#%ssV)"/></g>') % (
        cx - 260, f(cy - 1.2), u, u, f(cx - 1.2), cy - 260, u, u, cx, cy, cx - 150, f(cy - .6), u, f(cx - .6), cy - 150, u)
    obj = svg(W, H, '<circle cx="%d" cy="%d" r="190" fill="url(#%sglow)"/>%s%s<circle cx="%d" cy="%d" r="9" fill="#fff"/>' % (cx, cy, u, rings, spikes, cx, cy) +
              '<circle cx="%d" cy="%d" r="7" fill="#dfe8ff" opacity=".25"/><circle cx="%d" cy="%d" r="1.8" fill="#fff"/>' % (bx, by, bx, by) + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 06H 45M 09S · DEC −16° 43′ · CANIS MAJOR')]
    ann.append('<ellipse cx="%d" cy="%d" rx="140" ry="62" transform="rotate(-28 %d %d)" fill="none" stroke="rgba(245,241,232,.3)" stroke-width=".6" stroke-dasharray="3 5"/>' % (cx + 40, cy - 20, cx + 40, cy - 20))
    ann.append(label((cx, cy), (22, 470), ['SIRIUS A', 'A1V · 9,940 K · 25 L☉']))
    ann.append(label((bx, by), (560, 150), ['SIRIUS B', 'WHITE DWARF · EARTH-SIZED'], 'end'))
    ann.append(label((cx + 170, cy - 76), (560, 420), ['ORBIT', '50.1 YEARS'], 'end', dot=False))
    ann.append(label((cx - 250, cy), (22, 200), ['DIFFRACTION', 'SPIKES']))
    ann.append(scalebar(560 - 60, 590, 60, '10 AU', 'end'))
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= POLARIS
def polaris(u):
    cx, cy = 291, 280
    rnd = random.Random(11767)
    bg = sky(u, H, ('#141c38', '#080f22', '#03050d'), 60, 10, 0)
    trails = []
    for _ in range(420):
        r = 14 + 480 * rnd.random() ** 1.2
        a0 = rnd.uniform(0, 360); L = 30
        A0, A1 = math.radians(a0), math.radians(a0 + L)
        c = rnd.choice(['#ffffff', '#dfe8ff', '#fff1dc', '#cfe0ff', '#ffd8b0', '#b8d0ff'])
        trails.append('<path d="M%s %sA%s %s 0 0 1 %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(cx + r * math.cos(A0)), f(cy + r * math.sin(A0)), f(r), f(r), f(cx + r * math.cos(A1)), f(cy + r * math.sin(A1)), c, f(.15 + .6 * rnd.random() ** 2), f(.4 + 1.3 * rnd.random() ** 3)))
    px, py = cx + 9, cy - 4
    pol = '<path d="M%s %sA%s %s 0 0 1 %s %s" fill="none" stroke="#fff4dc" stroke-width="2.2" stroke-linecap="round"/>' % (
        f(px), f(py), f(math.hypot(9, 4)), f(math.hypot(9, 4)), f(cx + math.hypot(9, 4) * math.cos(math.radians(-24 + 30))), f(cy + math.hypot(9, 4) * math.sin(math.radians(-24 + 30))))
    defs = '<radialGradient id="%sg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4dc" stop-opacity=".9"/><stop offset=".3" stop-color="#fff4dc" stop-opacity=".2"/><stop offset="1" stop-color="#fff4dc" stop-opacity="0"/></radialGradient>' % u
    obj = svg(W, H, ''.join(trails) + '<circle cx="%s" cy="%s" r="22" fill="url(#%sg)"/>%s<circle cx="%s" cy="%s" r="2.6" fill="#fff"/>' % (f(px), f(py), u, pol, f(px), f(py)) +
              '<path d="M0 560Q120 540 220 556T420 548T582 560V620H0Z" fill="#02030a"/>' + grain(u + 'o', W, H, .1), defs)
    ann = [top('RA 02H 31M 49S · DEC +89° 15′ · URSA MINOR')]
    ann.append('<g stroke="#5eead4" stroke-width=".8"><line x1="%d" y1="%d" x2="%d" y2="%d"/><line x1="%d" y1="%d" x2="%d" y2="%d"/></g>' % (cx - 6, cy, cx + 6, cy, cx, cy - 6, cx, cy + 6))
    ann.append(label((px, py), (560, 150), ['POLARIS', 'α UMI · F7IB · CEPHEID'], 'end'))
    ann.append(label((cx, cy), (22, 150), ['NORTH CELESTIAL POLE', '0.66° FROM POLARIS'], color='#8ff0dc', dot=False))
    ann.append(label((cx + 200 * math.cos(1), cy + 200 * math.sin(1)), (560, 500), ['STAR TRAILS', '15° PER HOUR'], 'end'))
    ann.append(reticle(cx, cy, 120, 72, 4, .16))
    ann.append(label((cx - 120, cy), (22, 360), ['ALTITUDE', '= YOUR LATITUDE']))
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= BETELGEUSE
def betelgeuse(u):
    cx, cy, R = 291, 300, 128
    rnd = random.Random(27989)
    bg = sky(u, H, ('#2a120e', '#120706', '#040206'), 200, 58, 4)
    defs = ('<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
            '<radialGradient id="%sbase" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffc47a"/><stop offset=".5" stop-color="#f07a38"/><stop offset=".85" stop-color="#b8361a"/><stop offset="1" stop-color="#5a1208"/></radialGradient>'
            '<filter id="%scells" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="turbulence" baseFrequency=".022" numOctaves="3" seed="19"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 .85  0 0 0 0 .5  1.6 0 0 0 -.35"/></filter>'
            '<filter id="%sb12" x="-40%%" y="-40%%" width="180%%" height="180%%"><feGaussianBlur stdDeviation="14"/></filter>'
            '<filter id="%sb3"><feGaussianBlur stdDeviation="3"/></filter>'
            '<radialGradient id="%sglow"><stop offset=".45" stop-color="#ff7a4a" stop-opacity=".4"/><stop offset="1" stop-color="#ff7a4a" stop-opacity="0"/></radialGradient>') % (u, cx, cy, R, u, u, u, u, u)
    plume = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(cx + rnd.uniform(-60, 120), cy + rnd.uniform(-160, 20), rnd.uniform(50, 120), rnd.uniform(30, 80), rnd, 12, .35),
                                                               rnd.choice(['#ff8a4a', '#c8401c', '#ffb070']), f(rnd.uniform(.06, .16))) for _ in range(12))
    b = ('<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/><rect x="%d" y="%d" width="%d" height="%d" filter="url(#%scells)" opacity=".6" style="mix-blend-mode: overlay"/>'
         '<path d="%s" fill="#6a1a0a" opacity=".45" filter="url(#%sb3)"/>') % (cx, cy, R, u, cx - R, cy - R, 2 * R, 2 * R, u, blob(cx - 40, cy + 50, 70, 50, rnd, 12, .3), u)
    obj = svg(W, H, '<circle cx="%d" cy="%d" r="%d" fill="url(#%sglow)"/><g filter="url(#%sb12)">%s</g><g clip-path="url(#%sdisk)">%s</g>' % (cx, cy, R + 90, u, u, plume, u, b) + grain(u + 'o', W, H, .12), defs)
    ann = [top('RA 05H 55M 10S · DEC +07° 24′ · ORION')]
    ann.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="#ffe3a3" stroke-opacity=".45" stroke-width=".7" stroke-dasharray="3 4"/>' % (cx, cy, f(R * 5.2 / 3.55)))
    ann.append('<circle cx="%d" cy="%d" r="%s" fill="none" stroke="rgba(245,241,232,.3)" stroke-width=".6" stroke-dasharray="1 3"/>' % (cx, cy, f(R * 1.52 / 3.55)))
    ann.append(label((cx - 60, cy - 60), (22, 150), ['PHOTOSPHERE', 'GIANT CONVECTION CELLS']))
    ann.append(label((cx + 110, cy - 110), (560, 150), ['DUST PLUME', 'THE GREAT DIMMING, 2019'], 'end'))
    ann.append(label((cx + R * 5.2 / 3.55 * math.cos(.7), cy + R * 5.2 / 3.55 * math.sin(.7)), (560, 520), ["JUPITER'S ORBIT", 'FOR SCALE'], 'end', '#ffe3a3', dot=False))
    ann.append(label((cx - R * 1.52 / 3.55, cy), (22, 470), ["MARS' ORBIT", 'FOR SCALE'], dot=False))
    ann.append(scalebar(22, 590, R / 3.55, '1 AU'))
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= M42
def m42(u, h=H):
    cx, cy = 300, 350
    rnd = random.Random(1976)
    bg = sky(u, h, ('#2a1c34', '#110e1c', '#04050e'), 260, 42, 5)
    defs = ('<filter id="%sneb" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="4" seed="42"/><feDisplacementMap in="SourceGraphic" scale="60"/><feGaussianBlur stdDeviation="6"/></filter>'
            '<filter id="%sfil" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="30"/><feGaussianBlur stdDeviation="1.4"/></filter>'
            '<radialGradient id="%score"><stop offset="0" stop-color="#fffaf0"/><stop offset=".25" stop-color="#ffe8c8" stop-opacity=".8"/><stop offset="1" stop-color="#ffc8a0" stop-opacity="0"/></radialGradient>') % (u, u, u)
    clouds = []
    for x, y, rx, ry, c, op in [(0, 0, 230, 190, '#b83a5a', .45), (-60, 60, 180, 120, '#e0587a', .4), (70, -40, 150, 150, '#d84a6a', .4), (-20, -150, 100, 70, '#c8406a', .3),
                                 (20, 10, 110, 90, '#f4a0b0', .55), (-10, 0, 70, 60, '#5ad8d0', .45), (40, 90, 120, 60, '#f07a8a', .35), (-140, -40, 90, 140, '#8a2a4a', .3)]:
        clouds.append('<path d="%s" fill="%s" opacity="%s"/>' % (blob(cx + x, cy + y, rx, ry, rnd, 14, .3), c, f(op)))
    fil = ''.join('<path d="M%s %sQ%s %s %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (
        f(cx + rnd.uniform(-200, 200)), f(cy + rnd.uniform(-200, 200)), f(cx + rnd.uniform(-100, 100)), f(cy + rnd.uniform(-100, 100)), f(cx + rnd.uniform(-220, 220)), f(cy + rnd.uniform(-220, 220)),
        rnd.choice(['#ffd0dc', '#ff8aa8', '#9af0e8']), f(rnd.uniform(.08, .22)), f(rnd.uniform(2, 8))) for _ in range(40))
    # the dark bay (Fish's mouth) and the dust lanes
    dark = ('<path d="M%d %dQ%d %d %d %dQ%d %d %d %dQ%d %d %d %dZ" fill="#0a0612" opacity=".5"/>' % (
        cx - 170, cy - 70, cx - 60, cy - 60, cx - 20, cy - 20, cx - 60, cy + 10, cx - 170, cy + 30, cx - 220, cy - 20, cx - 170, cy - 70))
    m43 = '<circle cx="%d" cy="%d" r="36" fill="#e0587a" opacity=".35" filter="url(#%sneb)"/><circle cx="%d" cy="%d" r="3" fill="#fff"/>' % (cx + 10, cy - 180, u, cx + 10, cy - 180)
    tx, ty = cx + 6, cy - 6
    trap = ''.join(spike_star(tx + dx, ty + dy, r, '#dfe8ff', 10 + 6 * r) for dx, dy, r in [(-6, -4, 1.8), (5, -6, 1.4), (-4, 6, 1.6), (7, 4, 1.2)])
    obj = svg(W, h, '<g filter="url(#%sneb)">%s</g><g filter="url(#%sfil)">%s%s</g>%s<circle cx="%d" cy="%d" r="60" fill="url(#%score)"/>%s' % (
        u, ''.join(clouds), u, fil, dark, m43, tx, ty, u, trap) + grain(u + 'o', W, h, .12), defs)
    ann = [top('RA 05H 35M 17S · DEC −05° 23′ · ORION')]
    ann.append(label((tx, ty), (560, 300), ['TRAPEZIUM', 'θ¹ ORIONIS · 4 YOUNG STARS'], 'end'))
    ann.append(label((cx + 10, cy - 180), (560, 130), ['M43', "DE MAIRAN'S NEBULA"], 'end'))
    ann.append(label((cx - 130, cy - 20), (22, 200), ["FISH'S MOUTH", 'DARK DUST']))
    ann.append(label((cx + 60, cy + 90), (560, 520), ['ORION BAR', 'IONIZATION FRONT'], 'end'))
    ann.append(label((cx - 80, cy + 90), (22, 470), ['HYDROGEN GLOW', 'Hα · 656 NM']))
    ann.append(scalebar(22, 590, 64, '5 LY'))
    return bg, obj, svg(W, h, ''.join(ann))


# ================================================================= M45
def m45(u, h=H):
    rnd = random.Random(45)
    bg = sky(u, h, ('#132446', '#08122a', '#03060f'), 240, 45, 3)
    # J2000 positions, as offsets from Alcyone in arcminutes (east to the left)
    ra0, de0 = 3 + 47 / 60 + 29.1 / 3600, 24 + 6 / 60 + 18 / 3600
    stars = [('ALCYONE', 3, 47, 29.1, 24, 6, 18, 2.87), ('ATLAS', 3, 49, 9.7, 24, 3, 12, 3.62), ('ELECTRA', 3, 44, 52.5, 24, 6, 48, 3.70), ('MAIA', 3, 45, 49.6, 24, 22, 4, 3.87),
             ('MEROPE', 3, 46, 19.6, 23, 56, 54, 4.18), ('TAYGETA', 3, 45, 12.5, 24, 28, 2, 4.30), ('PLEIONE', 3, 49, 11.2, 24, 8, 12, 5.05), ('CELAENO', 3, 44, 48.2, 24, 17, 22, 5.45), ('ASTEROPE', 3, 45, 54.5, 24, 33, 16, 5.76)]
    sc, ox, oy = 5.6, 316, 350
    pos = {}
    for n, hr, m, s, d, dm, ds, mag in stars:
        ra = hr + m / 60 + s / 3600; de = d + dm / 60 + ds / 3600
        x = ox - (ra - ra0) * 15 * math.cos(math.radians(24.1)) * 60 * sc; y = oy - (de - de0) * 60 * sc
        pos[n] = (x, y, mag)
    defs = ('<filter id="%sneb" x="-30%%" y="-30%%" width="160%%" height="160%%"><feTurbulence type="fractalNoise" baseFrequency=".02 .05" numOctaves="4" seed="45"/><feDisplacementMap in="SourceGraphic" scale="50"/><feGaussianBlur stdDeviation="5"/></filter>'
            '<filter id="%sb1"><feGaussianBlur stdDeviation="1"/></filter>') % (u, u)
    neb = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#5a8ce0" opacity="%s" transform="rotate(%s %s %s)"/>' % (
        f(x + rnd.uniform(-20, 20)), f(y + rnd.uniform(-10, 30)), f(rnd.uniform(40, 90)), f(rnd.uniform(10, 26)), f(rnd.uniform(.1, .22)), f(rnd.uniform(-40, -20)), f(x), f(y))
        for n, (x, y, mag) in pos.items() for _ in range(3) if mag < 4.5)
    streaks = ''.join('<path d="M%s %sl%s %s" stroke="#9ec0ff" stroke-opacity="%s" stroke-width="%s" filter="url(#%sb1)"/>' % (
        f(rnd.uniform(60, 520)), f(rnd.uniform(140, 560)), f(rnd.uniform(40, 120)), f(rnd.uniform(-60, -20)), f(rnd.uniform(.05, .14)), f(rnd.uniform(1, 4)), u) for _ in range(40))
    st = ''.join(spike_star(x, y, 3.6 - (mag - 2.8) * .9, '#bcd8ff', 34 - (mag - 2.8) * 7) for n, (x, y, mag) in pos.items())
    obj = svg(W, h, '<g filter="url(#%sneb)">%s</g>%s%s' % (u, neb, streaks, st) + grain(u + 'o', W, h, .1), defs)
    ann = [top('RA 03H 47M 24S · DEC +24° 07′ · TAURUS')]
    place = {'ALCYONE': (22, 380, 'start', ['ALCYONE', 'MAG 2.9 · BRIGHTEST']), 'ATLAS': (560, 330, 'end', ['ATLAS']), 'ELECTRA': (560, 460, 'end', ['ELECTRA']),
             'MAIA': (560, 150, 'end', ['MAIA']), 'MEROPE': (22, 470, 'start', ['MEROPE', 'REFLECTION NEBULA']), 'TAYGETA': (560, 210, 'end', ['TAYGETA']),
             'PLEIONE': (22, 260, 'start', ['PLEIONE']), 'CELAENO': (560, 520, 'end', ['CELAENO']), 'ASTEROPE': (22, 150, 'start', ['ASTEROPE'])}
    for n, (x, y, mag) in pos.items():
        lx, ly, an, lines = place[n]
        ann.append(label((x, y), (lx, ly), lines, an))
    ann.append(scalebar(22, 590, 30 * sc / 2, "15′"))
    return bg, obj, svg(W, h, ''.join(ann))


# ================================================================= M16
def m16(u):
    rnd = random.Random(6611)
    bg = sky(u, H, ('#1c3a38', '#0a1a18', '#030807'), 160, 16, 3)
    defs = ('<linearGradient id="%sglow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fe0c8"/><stop offset=".45" stop-color="#3a9a8a"/><stop offset="1" stop-color="#c89a4a"/></linearGradient>'
            '<filter id="%sneb" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".01" numOctaves="4" seed="16"/><feDisplacementMap in="SourceGraphic" scale="70"/><feGaussianBlur stdDeviation="8"/></filter>'
            '<filter id="%scol" x="-20%%" y="-10%%" width="140%%" height="120%%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="4" seed="3"/><feDisplacementMap in="SourceGraphic" scale="30"/></filter>'
            '<filter id="%srim" x="-20%%" y="-10%%" width="140%%" height="120%%"><feGaussianBlur stdDeviation="3"/></filter>'
            '<linearGradient id="%spil" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1a10"/><stop offset=".5" stop-color="#4a2c18"/><stop offset="1" stop-color="#1a0e08"/></linearGradient>') % (u, u, u, u, u)
    wash = ''.join('<path d="%s" fill="%s" opacity="%s"/>' % (blob(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(80, 200), rnd.uniform(60, 160), rnd, 12, .3),
                                                              rnd.choice(['#5ad6c2', '#3a8a7a', '#d8a85a', '#8ae0c0']), f(rnd.uniform(.12, .3))) for _ in range(14))
    def pillar(x0, base, topy, w0, w1, lean):
        pts_l, pts_r = [], []
        for k in range(13):
            t = k / 12; y = base + (topy - base) * t
            w = w0 + (w1 - w0) * t + 6 * math.sin(t * 9 + x0)
            x = x0 + lean * t * t
            pts_l.append((x - w / 2, y)); pts_r.append((x + w / 2, y))
        d = 'M' + 'L'.join('%s %s' % (f(a), f(b)) for a, b in pts_l) + 'Q%s %s %s %s' % (f(x0 + lean), f(topy - w1 * .9), f(pts_r[-1][0]), f(pts_r[-1][1])) + 'L' + 'L'.join('%s %s' % (f(a), f(b)) for a, b in reversed(pts_r)) + 'Z'
        return d
    ps = [pillar(170, 640, 150, 110, 46, 30), pillar(330, 640, 300, 90, 40, -14), pillar(470, 640, 380, 70, 30, 10)]
    rims = ''.join('<path d="%s" fill="none" stroke="#ffe6a8" stroke-opacity=".55" stroke-width="5" filter="url(#%srim)"/>' % (d, u) for d in ps)
    body = '<g filter="url(#%scol)">%s%s</g>' % (u, ''.join('<path d="%s" fill="url(#%spil)"/><path d="%s" fill="none" stroke="#f8d49a" stroke-opacity=".55" stroke-width="1.6"/>' % (d, u, d) for d in ps), ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#c88a4a" opacity=".45"/>' % (f(x), f(y), f(w), f(w * .6)) for x, y, w in [(200, 170, 22), (316, 310, 18), (480, 390, 13)]))
    eggs = ''.join('<circle cx="%s" cy="%s" r="%s" fill="#3a2214"/><circle cx="%s" cy="%s" r="1" fill="#ffe8b8"/>' % (f(x), f(y), f(r), f(x), f(y - r)) for x, y, r in [(196, 148, 5), (214, 160, 4), (180, 170, 3.5), (318, 300, 4)])
    stars = ''.join(spike_star(rnd.uniform(40, 540), rnd.uniform(130, 560), rnd.uniform(.8, 1.6), '#fff4dc', rnd.uniform(6, 14), .9) for _ in range(9))
    obj = svg(W, H, '<g filter="url(#%sneb)">%s</g>%s%s%s%s' % (u, wash, rims, body, eggs, stars) + grain(u + 'o', W, H, .13), defs)
    ann = [top('RA 18H 18M 48S · DEC −13° 49′ · SERPENS')]
    ann.append(label((200, 190), (22, 150), ['PILLAR I', '4 LIGHT-YEARS TALL']))
    ann.append(label((214, 160), (560, 150), ['EGGS', 'STARS FORMING AT THE TIPS'], 'end'))
    ann.append(label((330, 330), (560, 300), ['PILLAR II'], 'end'))
    ann.append(label((470, 400), (560, 450), ['PILLAR III'], 'end'))
    ann.append(label((120, 360), (22, 420), ['PHOTOEVAPORATION', 'NGC 6611 STARLIGHT']))
    ann.append(scalebar(22, 590, 60, '1 LY'))
    return bg, obj, svg(W, H, ''.join(ann))


# ================================================================= FICTION
def fiction_top(n):
    return top('SKYCHASER FICTION %s · NOT IN ANY SKY' % n)


def twin_sun(u):
    rnd = random.Random(101)
    bg = sky(u, H, ('#6a3a38', '#2a1624', '#0a0610'), 90, 101, 1, cy='.9',
             extra='<rect width="%d" height="%d" fill="url(#%sdusk)"/>' % (W, H, u),
             extra_defs='<linearGradient id="%sdusk" x1="0" y1="0" x2="0" y2="1"><stop offset=".3" stop-color="#ff9a5a" stop-opacity="0"/><stop offset=".78" stop-color="#ff9a5a" stop-opacity=".45"/><stop offset="1" stop-color="#ffcf94" stop-opacity=".6"/></linearGradient>' % u)
    defs = ('<radialGradient id="%ssa"><stop offset="0" stop-color="#fffaf0"/><stop offset=".4" stop-color="#ffd890"/><stop offset=".7" stop-color="#ff9a4a" stop-opacity=".5"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%ssb"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#fff0d0"/><stop offset=".7" stop-color="#ffd8a0" stop-opacity=".4"/><stop offset="1" stop-color="#ffd8a0" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="%sd1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8703a"/><stop offset="1" stop-color="#5a2a18"/></linearGradient>'
            '<linearGradient id="%sd2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a4424"/><stop offset="1" stop-color="#2a120a"/></linearGradient>') % (u, u, u, u)
    suns = '<circle cx="230" cy="400" r="120" fill="url(#%ssa)"/><circle cx="230" cy="400" r="38" fill="#fff4dc"/><circle cx="372" cy="436" r="70" fill="url(#%ssb)"/><circle cx="372" cy="436" r="18" fill="#ffffff"/>' % (u, u)
    def dunes(y0, amp, col, seed):
        r = random.Random(seed); d = 'M0 %s' % f(y0); x = 0
        while x < W:
            nx = x + r.uniform(60, 140); d += 'Q%s %s %s %s' % (f(x + (nx - x) / 2), f(y0 - r.uniform(.3, 1) * amp), f(nx), f(y0 + r.uniform(-8, 8))); x = nx
        return '<path d="%sV%dH0Z" fill="%s"/>' % (d, H, col)
    ridges = ''.join('<path d="M%s %sq%s %s %s %s" fill="none" stroke="#ffd0a0" stroke-opacity=".25" stroke-width=".8"/>' % (
        f(rnd.uniform(0, W)), f(rnd.uniform(500, 600)), f(rnd.uniform(20, 40)), f(rnd.uniform(-10, -4)), f(rnd.uniform(50, 90)), f(rnd.uniform(-2, 4))) for _ in range(30))
    obj = svg(W, H, suns + dunes(470, 30, 'url(#%sd1)' % u, 3) + dunes(530, 50, 'url(#%sd2)' % u, 8) + ridges + '<path d="M0 590Q200 560 582 596V620H0Z" fill="#1a0a06"/>' + grain(u + 'o', W, H, .13), defs)
    ann = [fiction_top('01')]
    ann.append(label((230, 400), (22, 200), ['SUN A', 'ORANGE · SETS SECOND']))
    ann.append(label((372, 436), (560, 260), ['SUN B', 'WHITE · SETS FIRST'], 'end'))
    ann.append(label((440, 520), (560, 520), ['DUNE SEA', 'NO WATER IN 900 KM'], 'end'))
    ann.append(label((120, 486), (22, 440), ['TWO SHADOWS', 'EVERY EVENING']))
    ann.append(scalebar(22, 590, 60, '200 M'))
    return bg, obj, svg(W, H, ''.join(ann))


def tide_world(u):
    cx, cy, R = 262, 330, 168
    rnd = random.Random(102)
    bg = sky(u, H, ('#0f2440', '#07132a', '#03060f'), 220, 102, 4)
    defs = ('<clipPath id="%sdisk"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
            '<radialGradient id="%sbase" cx=".36" cy=".36" r=".75"><stop offset="0" stop-color="#8fd8ff"/><stop offset=".4" stop-color="#2a7fd4"/><stop offset=".85" stop-color="#0e3a7a"/><stop offset="1" stop-color="#061a3a"/></radialGradient>'
            '<filter id="%ssea" x="0" y="0" width="100%%" height="100%%"><feTurbulence type="fractalNoise" baseFrequency=".02 .05" numOctaves="4" seed="102"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2 1.1"/></filter>'
            '<filter id="%sb4" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="4"/></filter>'
            '<radialGradient id="%smoon" cx=".38" cy=".36" r=".7"><stop offset="0" stop-color="#e8e4dc"/><stop offset=".7" stop-color="#8a8680"/><stop offset="1" stop-color="#3a3834"/></radialGradient>') % (
        u, cx, cy, R, u, u, u, u) + shade_defs(u, .36, .36)
    b = ('<circle cx="%d" cy="%d" r="%d" fill="url(#%sbase)"/><rect x="%d" y="%d" width="%d" height="%d" filter="url(#%ssea)" opacity=".25"/>' % (cx, cy, R, u, cx - R, cy - R, 2 * R, 2 * R, u) +
         ''.join('<path d="%s" fill="#ffffff" opacity="%s" filter="url(#%sb4)"/>' % (blob(cx + rnd.uniform(-R, R) * .8, cy + rnd.uniform(-R, R) * .8, rnd.uniform(20, 60), rnd.uniform(6, 14), rnd, 10, .4), f(rnd.uniform(.25, .5)), u) for _ in range(14)) +
         '<circle cx="%d" cy="%d" r="%d" fill="url(#%slimb)"/><circle cx="%d" cy="%d" r="%d" fill="url(#%sterm)"/>' % (cx, cy, R, u, cx, cy, R, u))
    # the tidal bulge, pulled toward the moon
    bulge = '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" transform="rotate(-38 %d %d)" fill="none" stroke="#bfefff" stroke-opacity=".5" stroke-width="3" filter="url(#%sb4)"/>' % (cx, cy, R + 22, R - 6, cx, cy, u)
    mx, my = 470, 150
    moon = '<circle cx="%d" cy="%d" r="34" fill="url(#%smoon)"/><path d="M%d %dA34 34 0 0 1 %d %dA16 34 0 0 0 %d %dZ" fill="#03060f" opacity=".75" transform="rotate(-38 %d %d)"/>' % (mx, my, u, mx, my - 34, mx, my + 34, mx, my - 34, mx, my)
    obj = svg(W, H, bulge + '<g clip-path="url(#%sdisk)">%s</g>' % (u, b) + moon + grain(u + 'o', W, H, .11), defs)
    ann = [reticle(cx, cy, R + 34, 72, 4, .18), fiction_top('02')]
    ang = math.radians(-38)
    ann.append(label((cx + (R + 22) * math.cos(ang), cy + (R + 22) * math.sin(ang)), (560, 300), ['TIDAL BULGE', 'WAVES TALLER THAN MOUNTAINS'], 'end'))
    ann.append(label((mx, my), (560, 128), ['THE MOON', 'CLOSE AND HEAVY'], 'end'))
    ann.append(label((cx - 60, cy + 40), (22, 470), ['OCEAN', 'NO LAND, ANYWHERE']))
    ann.append(label((cx - 90, cy - 90), (22, 150), ['STORM BANDS']))
    ann.append(scalebar(22, 590, 80, '5,000 KM'))
    return bg, obj, svg(W, H, ''.join(ann))


def ring_habitat(u):
    cx, cy = 291, 300
    rnd = random.Random(103)
    bg = sky(u, H, ('#15203c', '#0a1024', '#03050e'), 260, 103, 5)
    rx, ry, tilt = 250, 88, -14
    defs = ('<radialGradient id="%sstar"><stop offset="0" stop-color="#fff"/><stop offset=".2" stop-color="#fff4d8"/><stop offset=".5" stop-color="#ffd890" stop-opacity=".3"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient>'
            '<clipPath id="%sback"><rect x="-400" y="-400" width="800" height="400"/></clipPath><clipPath id="%sfront"><rect x="-400" y="0" width="800" height="400"/></clipPath>') % (u, u, u)
    def band(ww, cols, op):
        return ''.join('<ellipse rx="%s" ry="%s" fill="none" stroke="%s" stroke-width="%s" stroke-opacity="%s"/>' % (f(rx - i * ww / len(cols)), f(ry - i * ww / len(cols) * ry / rx), c, f(ww / len(cols) + .4), f(op)) for i, c in enumerate(cols))
    inner = band(26, ['#3a8a5a', '#5fbf8f', '#2a6aa8', '#5fbf8f', '#8ad0a0', '#3a7a4a', '#2a5a9a', '#6ac89a'], .95)
    clouds = ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="1.4" fill="#fff" opacity=".5"/>' % (f((rx - 13) * math.cos(a)), f((ry - 5) * math.sin(a)), f(rnd.uniform(4, 10))) for a in (rnd.uniform(0, 2 * math.pi) for _ in range(60)))
    rim = '<ellipse rx="%d" ry="%d" fill="none" stroke="#9aa8c0" stroke-width="3"/><ellipse rx="%d" ry="%d" fill="none" stroke="#3a4458" stroke-width="1.2"/>' % (rx + 2, ry + 1, rx - 28, ry - 10)
    squares = ''.join('<path d="M%s %sL%s %s" stroke="#0a1024" stroke-width="10" stroke-opacity=".85"/>' % (f(120 * math.cos(a)), f(42 * math.sin(a)), f(130 * math.cos(a + .25)), f(45 * math.sin(a + .25))) for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2))
    ring = inner + clouds + rim
    obj = svg(W, H, '<g transform="translate(%d %d) rotate(%d)"><g clip-path="url(#%sback)" opacity=".85">%s</g>%s<circle r="120" fill="url(#%sstar)"/><circle r="16" fill="#fff"/><g clip-path="url(#%sfront)">%s</g></g>' % (
        cx, cy, tilt, u, ring, squares, u, u, ring) + grain(u + 'o', W, H, .11), defs)
    def scr(x, y):
        t = math.radians(tilt)
        return (cx + x * math.cos(t) - y * math.sin(t), cy + x * math.sin(t) + y * math.cos(t))
    ann = [fiction_top('03')]
    ann.append(label((cx, cy), (22, 150), ['THE STAR', 'NEVER SETS, NEVER RISES']))
    ann.append(label(scr(rx - 13, 0), (560, 262), ['HABITABLE BAND', 'SEA, FOREST, SKY'], 'end'))
    ann.append(label(scr(0, ry + 1), (560, 500), ['RIM WALL', 'HOLDS THE AIR IN'], 'end'))
    ann.append(label(scr(125 * math.cos(math.pi), 43 * math.sin(math.pi)), (22, 470), ['SHADOW SQUARE', 'MAKES THE NIGHT']))
    ann.append(scalebar(22, 590, 90, '1 AU'))
    return bg, obj, svg(W, H, ''.join(ann))


def unit7(u):
    rnd = random.Random(104)
    bg = sky(u, H, ('#1a2a3a', '#0c1622', '#04070d'), 200, 104, 2, cy='.35')
    defs = ('<linearGradient id="%sgnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4250"/><stop offset="1" stop-color="#1a1e26"/></linearGradient>'
            '<linearGradient id="%sbody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a96a6"/><stop offset=".4" stop-color="#e0e8f0"/><stop offset="1" stop-color="#5a6a80"/></linearGradient>'
            '<radialGradient id="%seye"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#ffb070"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%sp"><stop offset="0" stop-color="#b8ffc8" stop-opacity=".35"/><stop offset="1" stop-color="#b8ffc8" stop-opacity="0"/></radialGradient>') % (u, u, u, u)
    g = '<path d="M0 470Q160 452 300 466T582 460V620H0Z" fill="url(#%sgnd)"/>' % u
    g += '<path d="M0 470L40 440L70 458L110 430L150 462Z" fill="#232a36"/><path d="M430 462L480 420L520 446L560 424L582 440V462Z" fill="#232a36"/>'
    g += ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#12161c" opacity=".6"/>' % (f(rnd.uniform(0, W)), f(rnd.uniform(480, 610)), f(rnd.uniform(3, 14)), f(rnd.uniform(1, 3))) for _ in range(40))
    rx_, ry_ = 250, 520
    robot = ('<ellipse cx="%d" cy="%d" rx="70" ry="9" fill="#05070a" opacity=".6"/>'
             '<rect x="%d" y="%d" width="22" height="22" rx="6" fill="#2a3040"/><rect x="%d" y="%d" width="22" height="22" rx="6" fill="#2a3040"/>'
             '<rect x="%d" y="%d" width="96" height="70" rx="12" fill="url(#%sbody)" stroke="#3a4458"/>'
             '<rect x="%d" y="%d" width="64" height="40" rx="10" fill="url(#%sbody)" stroke="#3a4458"/>'
             '<circle cx="%d" cy="%d" r="11" fill="#0a0e14"/><circle cx="%d" cy="%d" r="18" fill="url(#%seye)"/><circle cx="%d" cy="%d" r="3" fill="#fff"/>'
             '<path d="M%d %dv-22" stroke="#8a96a6" stroke-width="2"/><circle cx="%d" cy="%d" r="3" fill="#ff9a4a"/>'
             '<path d="M%d %dq30 -6 44 -30" fill="none" stroke="#8a96a6" stroke-width="6" stroke-linecap="round"/>'
             '<path d="M%d %dl10 -4l6 10l-10 4z" fill="#5a6a80"/>') % (
        rx_, ry_ + 36, rx_ - 44, ry_ + 16, rx_ + 22, ry_ + 16, rx_ - 48, ry_ - 56, u, rx_ - 32, ry_ - 100, u, rx_ + 6, ry_ - 80, rx_ + 6, ry_ - 80, u, rx_ + 6, ry_ - 80, rx_ - 16, ry_ - 100, rx_ - 16, ry_ - 124,
        rx_ + 48, ry_ - 30, rx_ + 86, ry_ - 68)
    drops = ''.join('<circle cx="%s" cy="%s" r="1.2" fill="#8fd8ff" opacity=".8"/>' % (f(rx_ + 96 + i * 2), f(ry_ - 58 + i * 9)) for i in range(4))
    px, py = rx_ + 108, ry_ + 30
    plant = ('<circle cx="%d" cy="%d" r="40" fill="url(#%sp)"/><path d="M%d %dL%d %dL%d %dL%d %dZ" fill="#a8583a"/>'
             '<path d="M%d %dQ%d %d %d %d" fill="none" stroke="#5fbf8f" stroke-width="2"/>'
             '<path d="M%d %dq-14 -4 -16 -14q12 0 16 14z" fill="#5fbf8f"/><path d="M%d %dq14 -6 18 -16q-14 2 -18 16z" fill="#6ad09a"/><path d="M%d %dq-8 -8 -6 -18q8 8 6 18z" fill="#8ae0b0"/>') % (
        px, py - 20, u, px - 12, py, px + 12, py, px + 9, py + 16, px - 9, py + 16, px, py, px - 4, py - 20, px + 2, py - 34, px - 1, py - 12, px + 1, py - 20, px + 2, py - 30)
    obj = svg(W, H, g + robot + drops + plant + grain(u + 'o', W, H, .12), defs)
    ann = [fiction_top('04')]
    ann.append(label((rx_ + 6, ry_ - 80), (22, 200), ['UNIT-7', 'SERVICE ROBOT · ALONE']))
    ann.append(label((px, py - 30), (560, 360), ['THE PLANT', 'WATERED EVERY MORNING'], 'end'))
    ann.append(label((rx_ + 98, ry_ - 50), (560, 200), ['WATER RATION', 'ONE CUP'], 'end'))
    ann.append(label((500, 430), (560, 520), ['HORIZON', 'NO ONE ELSE ON IT'], 'end'))
    ann.append(scalebar(22, 590, 50, '1 M'))
    return bg, obj, svg(W, H, ''.join(ann))


def sentinel(u):
    rnd = random.Random(105)
    bg = sky(u, H, ('#2a1840', '#120a22', '#040208'), 260, 105, 5, cy='.7',
             extra='<circle cx="120" cy="190" r="54" fill="url(#%smoonb)"/>' % u,
             extra_defs='<radialGradient id="%smoonb" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#e4dcff"/><stop offset=".7" stop-color="#8a78c8"/><stop offset="1" stop-color="#3a2a6a"/></radialGradient>' % u)
    defs = ('<radialGradient id="%seye"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#5ef0ff"/><stop offset="1" stop-color="#5ef0ff" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="%sbeam" x1="0" x2="1"><stop offset="0" stop-color="#5ef0ff" stop-opacity=".45"/><stop offset="1" stop-color="#5ef0ff" stop-opacity="0"/></linearGradient>'
            '<linearGradient id="%sridge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1030"/><stop offset="1" stop-color="#05030a"/></linearGradient>'
            '<filter id="%sb3" x="-20%%" y="-40%%" width="140%%" height="180%%"><feGaussianBlur stdDeviation="3"/></filter>') % (u, u, u, u)
    far = '<path d="M0 470L80 440L150 456L240 420L330 452L420 430L500 450L582 436V620H0Z" fill="#140c26"/>'
    ridge = '<path d="M0 540Q120 520 230 500L330 490Q420 500 582 530V620H0Z" fill="url(#%sridge)"/>' % u
    sx, sy = 300, 492
    m = ('<path d="M%d %dL%d %dL%d %dL%d %dZ" fill="#0c0818"/>' % (sx - 30, sy, sx - 12, sy - 170, sx + 12, sy - 170, sx + 30, sy) +
         '<path d="M%d %dL%d %dL%d %dL%d %dZ" fill="#120c22"/>' % (sx - 12, sy - 170, sx - 22, sy - 250, sx + 22, sy - 250, sx + 12, sy - 170) +
         '<path d="M%d %dL%d %dL%d %dZ" fill="#0c0818"/>' % (sx - 36, sy - 250, sx + 36, sy - 250, sx, sy - 300) +
         '<path d="M%d %dL%d %dM%d %dL%d %d" stroke="#0c0818" stroke-width="10" stroke-linecap="round"/>' % (sx - 22, sy - 230, sx - 60, sy - 120, sx + 22, sy - 230, sx + 60, sy - 120) +
         '<path d="M%d %dH%d" stroke="#5ef0ff" stroke-opacity=".3" stroke-width="1"/>' % (sx - 20, sy - 200, sx + 20))
    ey = sy - 262
    eye = '<path d="M%d %dL582 %dL582 %dZ" fill="url(#%sbeam)" filter="url(#%sb3)"/><circle cx="%d" cy="%d" r="22" fill="url(#%seye)"/><circle cx="%d" cy="%d" r="3" fill="#fff"/>' % (sx, ey, ey - 40, ey + 30, u, u, sx, ey, u, sx, ey)
    moss = ''.join('<circle cx="%s" cy="%s" r="%s" fill="#6a4ab0" opacity="%s"/>' % (f(sx + rnd.uniform(-30, 30)), f(sy - rnd.uniform(0, 60)), f(rnd.uniform(.6, 1.6)), f(rnd.uniform(.2, .5))) for _ in range(40))
    obj = svg(W, H, far + ridge + m + moss + eye + grain(u + 'o', W, H, .13), defs)
    ann = [fiction_top('05')]
    ann.append(label((sx, ey), (22, 330), ['SENSOR', 'OPEN 10,000 YEARS']))
    ann.append(label((520, ey - 18), (560, 150), ['SIGHTLINE', 'THE SAME HORIZON'], 'end'))
    ann.append(label((sx - 60, sy - 120), (22, 470), ['THE SENTINEL', '40 M TALL']))
    ann.append(label((120, 190), (22, 150), ['OUTER MOON']))
    ann.append(scalebar(560 - 50, 590, 50, '10 M', 'end'))
    return bg, obj, svg(W, H, ''.join(ann))


def black_slab(u):
    rnd = random.Random(106)
    bg = sky(u, H, ('#1c1a24', '#0c0b12', '#040306'), 240, 106, 4, cy='.3')
    defs = ('<linearGradient id="%sface" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0a0c"/><stop offset=".6" stop-color="#050506"/><stop offset="1" stop-color="#000"/></linearGradient>'
            '<linearGradient id="%sedge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8e2d4" stop-opacity=".55"/><stop offset="1" stop-color="#e8e2d4" stop-opacity="0"/></linearGradient>'
            '<linearGradient id="%sgnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5448"/><stop offset="1" stop-color="#1a1814"/></linearGradient>'
            '<radialGradient id="%ssun"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fff4d8"/><stop offset="1" stop-color="#fff4d8" stop-opacity="0"/></radialGradient>') % (u, u, u, u)
    # the planets in a line above the slab, the Sun last
    align = ''.join('<circle cx="%d" cy="%s" r="%s" fill="%s"/>' % (291, f(y), f(r), c) for y, r, c in [(150, 16, '#c8b89a'), (210, 10, '#8aa0c0'), (252, 5, '#d8d0c0')])
    sun = '<circle cx="291" cy="118" r="60" fill="url(#%ssun)"/>' % u
    gnd = '<path d="M0 500Q291 480 582 500V620H0Z" fill="url(#%sgnd)"/>' % u + ''.join('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="#12100c" opacity=".5"/>' % (
        f(rnd.uniform(0, W)), f(rnd.uniform(506, 616)), f(rnd.uniform(4, 20)), f(rnd.uniform(1, 4))) for _ in range(40))
    # proportions 1 : 4 : 9
    sw, sh = 68, 68 * 9 / 4
    slab = ('<path d="M%s 506L%s %sL%s %sL%s 506Z" fill="url(#%sface)"/><path d="M%s %sL%s %sL%s %sL%s 506Z" fill="#141416"/>'
            '<path d="M%s %sV506" stroke="url(#%sedge)" stroke-width="1.2"/>') % (
        f(291 - sw / 2), f(291 - sw / 2), f(506 - sh), f(291 + sw / 2), f(506 - sh), f(291 + sw / 2), u, f(291 + sw / 2), f(506 - sh), f(291 + sw / 2 + 17), f(506 - sh + 6), f(291 + sw / 2 + 17), f(500), f(291 + sw / 2),
        f(291 + sw / 2), f(506 - sh), u)
    shadow = '<path d="M%s 506L%s 506L%s 612L%s 612Z" fill="#050504" opacity=".7"/>' % (f(291 - sw / 2), f(291 + sw / 2 + 17), f(291 + sw / 2 + 40), f(291 - sw / 2 - 20))
    obj = svg(W, H, sun + align + gnd + shadow + slab + grain(u + 'o', W, H, .12), defs)
    ann = [fiction_top('06')]
    ann.append('<path d="M291 118V270" stroke="rgba(245,241,232,.3)" stroke-width=".6" stroke-dasharray="2 4"/>')
    ann.append(label((291 - sw / 2, 400), (22, 380), ['THE SLAB', '1 : 4 : 9 · NO ONE MADE IT']))
    ann.append(label((291, 150), (560, 180), ['ALIGNMENT', 'IT APPEARS WHEN THEY LINE UP'], 'end'))
    ann.append(label((291, 118), (22, 150), ['THE SUN']))
    ann.append(label((291 + sw / 2 + 8, 470), (560, 470), ['SURFACE', 'REFLECTS NOTHING'], 'end'))
    ann.append(scalebar(22, 590, sh / 3, '1 M'))
    return bg, obj, svg(W, H, ''.join(ann))


def derelict(u):
    rnd = random.Random(107)
    bg = sky(u, H, ('#101824', '#070c14', '#020408'), 300, 107, 6)
    defs = ('<linearGradient id="%shull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a96aa"/><stop offset=".45" stop-color="#4a5466"/><stop offset="1" stop-color="#141a24"/></linearGradient>'
            '<radialGradient id="%slt"><stop offset="0" stop-color="#fff4d0"/><stop offset=".4" stop-color="#ffd890" stop-opacity=".5"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient>') % (u, u)
    parts = []
    L = 520
    for i in range(14):
        x = -L / 2 + i * L / 14; h = rnd.uniform(26, 44) if i not in (5, 6) else rnd.uniform(10, 18)
        parts.append('<rect x="%s" y="%s" width="%s" height="%s" fill="url(#%shull)" stroke="#0a0e14" stroke-width=".8"/>' % (f(x), f(-h / 2), f(L / 14 + .5), f(h), u))
        for k in range(rnd.randint(2, 6)):
            parts.append('<rect x="%s" y="%s" width="%s" height="%s" fill="#2a3240" opacity=".8"/>' % (f(x + rnd.uniform(0, L / 14 - 8)), f(rnd.uniform(-h / 2, h / 2 - 4)), f(rnd.uniform(3, 10)), f(rnd.uniform(1.5, 4))))
    parts.append('<path d="M%s -30L%s -60L%s -60L%s -24Z" fill="url(#%shull)" stroke="#0a0e14"/>' % (f(L / 2 - 110), f(L / 2 - 90), f(L / 2 - 40), f(L / 2 - 30), u))
    parts.append('<path d="M%s -20L%s 20L%s 26L%s -26Z" fill="#3a4454"/>' % (f(L / 2), f(L / 2), f(L / 2 + 40), f(L / 2 + 40)))
    parts.append('<path d="M%s -24L%s -26L%s 24L%s 22Z" fill="#6a7486"/>' % (f(-L / 2 - 20), f(-L / 2), f(-L / 2), f(-L / 2 - 20)))
    debris = ''.join('<rect x="%s" y="%s" width="%s" height="%s" fill="#4a5466" transform="rotate(%s)"/>' % (f(rnd.uniform(-60, 40)), f(rnd.uniform(-60, 60)), f(rnd.uniform(2, 7)), f(rnd.uniform(1, 4)), f(rnd.uniform(0, 90))) for _ in range(24))
    lights = [(-190, -6), (-120, 8), (150, -10), (212, 4)]
    lt = ''.join('<circle cx="%d" cy="%d" r="14" fill="url(#%slt)"/><circle cx="%d" cy="%d" r="1.6" fill="#fff"/>' % (x, y, u, x, y) for x, y in lights)
    obj = svg(W, H, '<g transform="translate(291 300) rotate(-24)">%s%s%s</g>' % (''.join(parts), debris, lt) + grain(u + 'o', W, H, .12), defs)
    def scr(x, y):
        t = math.radians(-24)
        return (291 + x * math.cos(t) - y * math.sin(t), 300 + x * math.sin(t) + y * math.cos(t))
    ann = [fiction_top('07')]
    ann.append(label(scr(-190, -6), (22, 470), ['LIGHTS', 'FOUR STILL ON']))
    ann.append(label(scr(-40, 10), (22, 150), ['BREACH', 'OPEN TO SPACE']))
    ann.append(label(scr(L / 2 + 20, 0), (560, 200), ['DRIVE SECTION', 'COLD'], 'end'))
    ann.append(label(scr(L / 2 - 70, -50), (560, 470), ['BRIDGE', 'NO ANSWER'], 'end'))
    ann.append(scalebar(22, 590, 90, '1 KM'))
    return bg, obj, svg(W, H, ''.join(ann))


def wormhole(u):
    h = HF
    cx, cy, R = 291, 330, 140
    rnd = random.Random(108)
    bg = sky(u, h, ('#140f30', '#080618', '#020108'), 320, 108, 6, cy='.4')
    defs = ('<clipPath id="%sthroat"><circle cx="%d" cy="%d" r="%d"/></clipPath>'
            '<radialGradient id="%sin" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#2a1f5a"/><stop offset=".7" stop-color="#0a0820"/><stop offset="1" stop-color="#000"/></radialGradient>'
            '<radialGradient id="%sgal"><stop offset="0" stop-color="#fff4e0"/><stop offset=".2" stop-color="#ffd8b0" stop-opacity=".7"/><stop offset=".6" stop-color="#b9a4ff" stop-opacity=".25"/><stop offset="1" stop-color="#b9a4ff" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%slens"><stop offset=".62" stop-color="#8fd0ff" stop-opacity="0"/><stop offset=".72" stop-color="#8fd0ff" stop-opacity=".35"/><stop offset=".76" stop-color="#e8f4ff" stop-opacity=".7"/><stop offset=".8" stop-color="#b9a4ff" stop-opacity=".25"/><stop offset="1" stop-color="#b9a4ff" stop-opacity="0"/></radialGradient>'
            '<filter id="%sb2" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="2"/></filter>'
            '<filter id="%sswirl" x="-20%%" y="-20%%" width="140%%" height="140%%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="3" seed="8"/><feDisplacementMap in="SourceGraphic" scale="18"/></filter>') % (u, cx, cy, R, u, u, u, u, u)
    # a spiral galaxy, seen through the throat
    arms = []
    for i in range(700):
        arm = i % 2; t = rnd.random() ** 1.1; r = 6 + 110 * t; th = arm * math.pi + t * 3 * math.pi
        x = r * math.cos(th) + rnd.gauss(0, 3 + 8 * t); y = (r * math.sin(th) + rnd.gauss(0, 3 + 8 * t)) * .62
        arms.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(x), f(y), f(.4 + .9 * rnd.random() ** 2), rnd.choice(['#ffffff', '#e4dcff', '#b9a4ff', '#ffe8cc']), f(.3 + .6 * rnd.random())))
    inside = '<circle cx="%d" cy="%d" r="%d" fill="url(#%sin)"/><g transform="translate(%d %d) rotate(-24)"><circle r="90" fill="url(#%sgal)"/>%s<circle r="3" fill="#fff"/></g>' % (cx, cy, R, u, cx - 12, cy + 8, u, ''.join(arms))
    # the lensed sky around the throat: stars pulled into arcs
    arcs = []
    for _ in range(260):
        r = R + 4 + 150 * rnd.random() ** 2; a0 = rnd.uniform(0, 360); L = (60 - 50 * (r - R) / 154) * rnd.uniform(.4, 1)
        A0, A1 = math.radians(a0), math.radians(a0 + L)
        arcs.append('<path d="M%s %sA%s %s 0 0 1 %s %s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (
            f(cx + r * math.cos(A0)), f(cy + r * math.sin(A0)), f(r), f(r), f(cx + r * math.cos(A1)), f(cy + r * math.sin(A1)),
            rnd.choice(['#ffffff', '#cfe0ff', '#b9a4ff', '#8fd0ff']), f(rnd.uniform(.15, .7)), f(rnd.uniform(.4, 1.4))))
    obj = svg(W, h, '<circle cx="%d" cy="%d" r="%d" fill="url(#%slens)"/><g filter="url(#%sswirl)">%s</g><g clip-path="url(#%sthroat)">%s</g>' % (cx, cy, R * 1.9, u, u, ''.join(arcs), u, inside) +
              '<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#e8f4ff" stroke-width="2.2" opacity=".85" filter="url(#%sb2)"/><circle cx="%d" cy="%d" r="%d" fill="none" stroke="#fff" stroke-width=".8"/>' % (cx, cy, R, u, cx, cy, R) +
              grain(u + 'o', W, h, .13), defs)
    ann = [reticle(cx, cy, R + 90, 72, 4, .2), fiction_top('08')]
    for i, t in enumerate(['0°', '90°', '180°', '270°']):
        A = math.radians(-90 + 90 * i)
        ann.append('<text x="%s" y="%s" text-anchor="middle" fill="rgba(245,241,232,.5)" style="%s">%s</text>' % (f(cx + (R + 110) * math.cos(A)), f(cy + (R + 110) * math.sin(A) + 3), LBL, t))
    ann.append(label((cx - 12, cy + 8), (22, 520), ['THE OTHER SIDE', 'A GALAXY, NOT OURS']))
    ann.append(label((cx + R * math.cos(-2.2), cy + R * math.sin(-2.2)), (22, 150), ['THROAT', 'Ø 1,400 KM']))
    ann.append(label((cx + (R + 40) * math.cos(.5), cy + (R + 40) * math.sin(.5)), (560, 540), ['EINSTEIN RING', 'STARLIGHT BENT AROUND IT'], 'end'))
    ann.append(label((cx + (R + 120) * math.cos(-.6), cy + (R + 120) * math.sin(-.6)), (560, 200), ['LENSED SKY', 'STARS DRAWN INTO ARCS'], 'end'))
    return bg, obj, svg(W, h, ''.join(ann))

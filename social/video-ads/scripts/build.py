import subprocess, sys, math, os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = __import__('os').environ.get('ADWORK', '.')
SRC = f'{S}/src/astroman-01_v5.mp4'
LOGO = '/home/user/Stellar/public/brand-partners/astroman.png'
W, H, FPS = 1080, 1350, 30
GEO = '/usr/share/fonts/truetype/noto/NotoSansGeorgian-Bold.ttf'
LAT = '/usr/share/fonts/truetype/noto/NotoSansDisplay-Bold.ttf'
ORANGE = (255, 138, 31)
WHITE = (255, 255, 255)
CREAM = (245, 236, 220)

def mt(s):  # Mkhedruli -> Mtavruli (Georgian caps)
    return ''.join(chr(ord(c) - 0x10D0 + 0x1C90) if 0x10D0 <= ord(c) <= 0x10FA else c for c in s)

_fc = {}
def font(path, size):
    k = (path, size)
    if k not in _fc: _fc[k] = ImageFont.truetype(path, size)
    return _fc[k]

def is_geo(c): return 0x10A0 <= ord(c) <= 0x10FF or 0x1C90 <= ord(c) <= 0x1CBF

def runs(text):
    out = []
    for c in text:
        g = is_geo(c) or (c == ' ' and out and out[-1][0])
        if out and out[-1][0] == g: out[-1][1] += c
        else: out.append([g, c])
    return out

def text_layer(text, size, color, weight=0.035, track=0):
    """Render one line with Georgian/Latin font fallback, faux-black weight. Returns RGBA."""
    sw = max(1, int(size * weight))
    parts = []
    for g, s in runs(text):
        f = font(GEO if g else LAT, size if g else int(size * 1.02))
        parts.append((f, s))
    asc = max(f.getmetrics()[0] for f, _ in parts) + sw
    total = 0; widths = []
    for f, s in parts:
        w = f.getlength(s) + track * len(s); widths.append(w); total += w
    im = Image.new('RGBA', (int(total + 2 * sw + 8), int(size * 1.45 + 2 * sw)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im); x = sw + 4
    for (f, s), w in zip(parts, widths):
        a = f.getmetrics()[0]
        if track:
            for c in s:
                d.text((x, asc - a), c, font=f, fill=color, stroke_width=sw, stroke_fill=color)
                x += f.getlength(c) + track
        else:
            d.text((x, asc - a), s, font=f, fill=color, stroke_width=sw, stroke_fill=color); x += w
    bb = im.getbbox()
    return im.crop((0, max(0, bb[1] - 4), im.width, min(im.height, bb[3] + 4)))

def shadowed(layer, blur=14, alpha=200, off=(0, 6)):
    pad = blur * 3
    out = Image.new('RGBA', (layer.width + 2 * pad, layer.height + 2 * pad), (0, 0, 0, 0))
    a = layer.split()[3].point(lambda v: v * alpha // 255)
    sh = Image.new('RGBA', layer.size, (0, 0, 0, 255)); sh.putalpha(a)
    out.alpha_composite(sh, (pad + off[0], pad + off[1]))
    out = out.filter(ImageFilter.GaussianBlur(blur))
    out.alpha_composite(layer, (pad, pad))
    return out

def pill(text, size, fg, bg, padx=34, pady=18, outline=None):
    t = text_layer(text, size, fg, weight=0.02)
    w, h = t.width + 2 * padx, t.height + 2 * pady
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if outline: d.rounded_rectangle((1, 1, w - 2, h - 2), radius=h // 2, outline=outline, width=4)
    else: d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=bg)
    im.alpha_composite(t, (padx, pady)); return im

def stack(layers, gap=10, align='c'):
    w = max(l.width for l in layers); h = sum(l.height for l in layers) + gap * (len(layers) - 1)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); y = 0
    for l in layers:
        x = (w - l.width) // 2 if align == 'c' else 0
        im.alpha_composite(l, (x, y)); y += l.height + gap
    return im

def fit(layer, maxw):
    if layer.width <= maxw: return layer
    r = maxw / layer.width
    return layer.resize((int(layer.width * r), int(layer.height * r)), Image.LANCZOS)

# ---------- easing ----------
def clamp(x, a=0, b=1): return max(a, min(b, x))
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def ease_back(x, s=2.2):
    x = clamp(x) - 1; return x * x * ((s + 1) * x + s) + 1

# ---------- source frames ----------
def read_seg(t0, dur, vf=None):
    n = int(round(dur * FPS)) + 2
    cmd = ['ffmpeg', '-v', 'error', '-ss', f'{t0:.3f}', '-i', SRC, '-frames:v', str(n)]
    if vf: cmd += ['-vf', vf]
    cmd += ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
    return fr

# burned-in text cleanup: delogo then heavy blur on that band
CLEAN_LOW = "delogo=x=90:y=905:w=900:h=230,boxblur=lr=0:cr=0"  # placeholder overridden below
def clean_low(x=90, y=905, w=900, h=230):
    return (f"delogo=x={x}:y={y}:w={w}:h={h},"
            f"split[a][b];[b]crop={w+80}:{h+80}:{x-40}:{y-40},gblur=sigma=28[bl];[a][bl]overlay={x-40}:{y-40}")

def zoom_frame(img, z, cx=0.5, cy=0.5, dx=0, dy=0):
    if abs(z - 1) < 1e-3 and dx == 0 and dy == 0: return img
    cw, ch = W / z, H / z
    x0 = clamp(cx * W - cw / 2 + dx, 0, W - cw); y0 = clamp(cy * H - ch / 2 + dy, 0, H - ch)
    return img.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))

def grade(arr, contrast=1.08, sat=1.12, lift=0):
    a = arr.astype(np.float32)
    m = a.mean(axis=2, keepdims=True)
    a = m + (a - m) * sat
    a = (a - 128) * contrast + 128 + lift
    return a

_yy, _xx = np.mgrid[0:H, 0:W]
VIG = (1 - 0.38 * np.clip(((_xx - W / 2) / (W * 0.62)) ** 2 + ((_yy - H / 2) / (H * 0.62)) ** 2, 0, 1.4))[..., None].astype(np.float32)
def band(y0, y1, strength):  # bottom legibility gradient
    g = np.clip((_yy - y0) / max(1, (y1 - y0)), 0, 1) ** 1.3
    return (1 - strength * g)[..., None].astype(np.float32)
BAND = band(720, 1080, 0.80)
_m = Image.new('L', (W, H), 0); ImageDraw.Draw(_m).rounded_rectangle((60, 880, 1020, 1160), radius=90, fill=255)
CLEAN_MASK = _m.filter(ImageFilter.GaussianBlur(38))

# ================= TIMELINE (seconds on the new timeline) =================
LOW = "delogo=x=90:y=905:w=900:h=230"
TOP = "delogo=x=250:y=110:w=580:h=140"
SHOTS = [
 # start, dur, src, z0, z1, cx, cy, filter, flash
 dict(t=0.00, d=1.50, src=2.85,  z0=1.02, z1=1.34, cx=.5, cy=.42, vf=None, flash=1.0, band=True),   # moon hook
 dict(t=1.50, d=1.32, src=0.05,  z0=1.10, z1=1.00, cx=.5, cy=.5,  vf=LOW,  flash=.35, band=True),   # shop
 dict(t=2.82, d=1.32, src=6.00,  z0=1.00, z1=1.12, cx=.5, cy=.45, vf=LOW,  flash=.25, band=True),   # eyepiece
 dict(t=4.14, d=0.88, src=11.20, z0=1.85, z1=2.15, cx=.5, cy=.5,  vf=None, flash=.6,  band=True),   # jupiter
 dict(t=5.02, d=0.88, src=16.60, z0=1.85, z1=2.15, cx=.485,cy=.5, vf=None, flash=.6,  band=True),   # saturn
 dict(t=5.90, d=0.88, src=24.40, z0=2.10, z1=2.45, cx=.5, cy=.5,  vf=None, flash=.6,  band=True),   # mars
 dict(t=6.78, d=1.76, src=8.15,  z0=1.12, z1=1.00, cx=.5, cy=.5,  vf=LOW,  flash=.35, band=True),   # telescope 1
 dict(t=8.54, d=1.32, src=21.45, z0=1.00, z1=1.10, cx=.5, cy=.5,  vf=None, flash=.25, band=True),   # refractor
 dict(t=9.86, d=1.32, src=13.60, z0=1.08, z1=1.00, cx=.5, cy=.5,  vf=None, flash=.25, band=True),   # SE mount
 dict(t=11.18,d=1.72, src=26.85, z0=1.00, z1=1.16, cx=.5, cy=.48, vf=TOP,  flash=.45, band=True),   # 6SE
 dict(t=12.90,d=3.56, src=18.90, z0=1.25, z1=1.05, cx=.5, cy=.5,  vf=None, flash=1.0, band=False, kind='offer', srcdur=2.25),
 dict(t=16.46,d=3.59, src=None,  z0=1.0,  z1=1.08, cx=.5, cy=.5,  vf=None, flash=.8,  band=False, kind='end'),
]
TOTAL = SHOTS[-1]['t'] + SHOTS[-1]['d']

def two(l1, s1, c1, l2, s2, c2, caps1=True, caps2=False, gap=16):
    a = fit(text_layer(mt(l1) if caps1 else l1, s1, c1), 940)
    b = fit(text_layer(mt(l2) if caps2 else l2, s2, c2), 940)
    return [a, b], gap

ZONE_Y = 1015   # vertical centre of the caption block (covers the old burned-in text band)
TEXTS = []      # (t_in, t_out, [layers], center_y, gap, style)
def add(t_in, t_out, layers, cy=ZONE_Y, gap=8, stagger=0.09, shake=False):
    TEXTS.append(dict(a=t_in, b=t_out, layers=[shadowed(l) for l in layers], cy=cy, gap=gap, stagger=stagger))

L, g = two('ცა ახლოსაა', 124, WHITE, 'ვიდრე გგონია', 70, ORANGE, caps2=True); add(0.10, 2.82, L, gap=g)
L, g = two('ნახე', 70, ORANGE, 'საკუთარი თვალით', 104, WHITE, caps1=True, caps2=True); L = L[::-1][::-1]; add(2.86, 4.14, L, gap=g)
for t0, name in [(4.14, 'იუპიტერი'), (5.02, 'სატურნი'), (5.90, 'მარსი')]:
    add(t0 + 0.02, t0 + 0.88, [fit(text_layer(mt(name), 150, WHITE), 940)])
L, g = two('ტელესკოპები', 116, WHITE, 'ყველა დონისთვის', 76, ORANGE, caps2=True); add(6.82, 8.54, L, gap=g)
L, g = two('დამწყებიდან', 104, WHITE, 'პროფესიონალამდე', 104, ORANGE, caps2=True); add(8.58, 9.86, L, gap=g)
add(9.90, 11.18, [pill('CELESTRON', 46, (20, 12, 4), ORANGE), fit(text_layer(mt('ავტომატური GoTo'), 92, WHITE), 940)], gap=22)
add(11.22, 12.90, [fit(text_layer('Celestron', 60, ORANGE, weight=0.02, track=6), 900), fit(text_layer('NexStar 6SE', 150, WHITE, weight=0.03), 960)], gap=2)
# offer
add(12.92, 16.46, [text_layer('-20%', 330, ORANGE, weight=0.03)], cy=560, stagger=0)
add(13.18, 16.46, [fit(text_layer(mt('ტელესკოპებზე'), 112, WHITE), 960)], cy=835)
add(14.70, 16.46, [pill(mt('ონლაინ და მაღაზიაში'), 46, WHITE, None, outline=WHITE, padx=40)], cy=1010)
# end card
logo = Image.open(LOGO).convert('LA'); la = logo.split()[1]
logo_w = Image.new('RGBA', logo.size, (255, 255, 255, 0)); logo_w.putalpha(la)
logo_w = logo_w.resize((820, int(820 * logo.height / logo.width)), Image.LANCZOS)
add(16.50, TOTAL, [logo_w], cy=440, stagger=0)
add(16.80, TOTAL, [fit(text_layer(mt('შეუკვეთე ახლავე'), 92, WHITE), 940)], cy=735)
add(16.98, TOTAL, [pill('astroman.ge', 66, (20, 12, 4), ORANGE, padx=54, pady=22)], cy=880)
add(17.16, TOTAL, [text_layer('ა. ყაზბეგის გამზ. 17', 50, CREAM, weight=0.02)], cy=1030)

# ================= backgrounds =================
rng = np.random.default_rng(7)
def starfield():
    sw, sh = int(W * 1.25), int(H * 1.25)
    im = Image.new('RGB', (sw, sh), (4, 5, 12)); d = ImageDraw.Draw(im)
    for _ in range(1400):
        x, y = rng.uniform(0, sw), rng.uniform(0, sh); r = rng.choice([0.6, 0.9, 1.3, 1.9], p=[.55, .3, .12, .03])
        b = int(rng.uniform(90, 255)); tint = rng.choice([0, 1, 2])
        col = (b, b, b) if tint == 0 else ((b, int(b * .9), int(b * .75)) if tint == 1 else (int(b * .8), int(b * .88), b))
        d.ellipse((x - r, y - r, x + r, y + r), fill=col)
    im = Image.blend(im, im.filter(ImageFilter.GaussianBlur(2.2)), 0.35)
    a = np.asarray(im).astype(np.float32)
    yy, xx = np.mgrid[0:sh, 0:sw]
    glow = np.exp(-(((xx - sw / 2) / (sw * .55)) ** 2 + ((yy - sh * 1.02) / (sh * .30)) ** 2))[..., None]
    a = a + glow * np.array([255, 110, 20]) * 0.55
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

GRAIN = [rng.normal(0, 3.2, (H, W, 1)).astype(np.float32) for _ in range(6)]

def frame_for(i, shot, frames, star):
    lt = i / FPS; p = lt / shot['d']
    kind = shot.get('kind')
    if kind == 'end':
        z = shot['z0'] + (shot['z1'] - shot['z0']) * p
        cw, ch = star.width / z / 1.0, star.height / z
        x0 = (star.width - cw) / 2; y0 = (star.height - ch) / 2
        img = star.resize((W, H), Image.BICUBIC, box=(x0 + (star.width - W) * 0, y0, x0 + cw, y0 + ch))
    else:
        if kind == 'offer':
            fi = (lt / shot['d']) * shot['srcdur'] * FPS
            k = int(fi); f = fi - k; k = min(k, len(frames) - 2)
            arr = frames[k].astype(np.float32) * (1 - f) + frames[k + 1].astype(np.float32) * f
            img = Image.fromarray(arr.astype(np.uint8))
        else:
            img = Image.fromarray(frames[min(i, len(frames) - 1)])
            if shot['vf'] == LOW:
                img = Image.composite(img.filter(ImageFilter.GaussianBlur(26)), img, CLEAN_MASK)
        # slow push + impact punch at the cut
        z = shot['z0'] + (shot['z1'] - shot['z0']) * ease_out(p) if shot['z0'] > shot['z1'] else shot['z0'] + (shot['z1'] - shot['z0']) * p
        z *= 1 + 0.07 * (1 - ease_out(lt / 0.28))
        dx = dy = 0
        if kind == 'offer' and lt < 0.3:
            amp = 18 * (1 - lt / 0.3); dx = amp * math.sin(lt * 90); dy = amp * math.cos(lt * 70)
        img = zoom_frame(img, z, shot['cx'], shot['cy'], dx, dy)
    a = np.asarray(img).astype(np.float32)
    if kind == 'offer':
        a = grade(a, 1.2, 1.45) * 0.85
        a = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)
    elif kind != 'end':
        a = grade(a)
    a *= VIG
    if shot['band']: a *= BAND
    a = np.clip(a, 0, 255)
    return a

def compose_text(a, T):
    img = Image.fromarray(a.astype(np.uint8)).convert('RGBA')
    for e in TEXTS:
        if not (e['a'] <= T < e['b']): continue
        ls = e['layers']; tot = sum(l.height for l in ls) + (e['gap'] - 84) * (len(ls) - 1)
        y = e['cy'] - tot / 2
        for j, l in enumerate(ls):
            lt = T - e['a'] - j * e['stagger']
            out = clamp((e['b'] - T) / 0.10) if e['b'] < TOTAL - 0.01 and e['b'] not in [s['t'] for s in SHOTS] else 1
            if lt >= 0:
                s = 1.22 - 0.22 * ease_back(lt / 0.26); al = clamp(lt / 0.10) * out
                ll = l if abs(s - 1) < 1e-3 else l.resize((max(1, int(l.width * s)), max(1, int(l.height * s))), Image.BILINEAR)
                if al < 1:
                    aa = ll.split()[3].point(lambda v, al=al: int(v * al)); ll = ll.copy(); ll.putalpha(aa)
                cx = W / 2 - ll.width / 2; cy = y + l.height / 2 - ll.height / 2
                img.alpha_composite(ll, (int(cx), int(cy)))
            y += l.height + e['gap'] - 84
    return np.asarray(img.convert('RGB')).astype(np.float32)

def render(out_path, only=None):
    star = starfield()
    enc = None
    if only is None:
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                                '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', out_path], stdin=subprocess.PIPE)
    gi = 0
    for si, shot in enumerate(SHOTS):
        n = int(round(shot['d'] * FPS))
        start_f = int(round(shot['t'] * FPS))
        want = [k for k in range(n) if only is None or any(abs((start_f + k) / FPS - o) < 0.5 / FPS for o in only)]
        if not want: continue
        frames = None
        if shot.get('kind') != 'end':
            frames = read_seg(shot['src'], shot.get('srcdur', shot['d']), shot['vf'])
        for k in want:
            T = (start_f + k) / FPS
            a = frame_for(k, shot, frames, star)
            a = compose_text(a, T)
            ft = T - shot['t']
            if shot['flash'] and ft < 0.2:
                a = a + (255 - a) * shot['flash'] * (1 - ft / 0.2) ** 2
            if si + 1 < len(SHOTS) and shot['t'] + shot['d'] - T < 1 / FPS * 1.5 and SHOTS[si + 1]['flash'] >= .6:
                a = a * 0.7 + 255 * 0.3
            if shot.get('kind') == 'end' and T > TOTAL - 0.35:
                a *= clamp((TOTAL - T) / 0.35)
            a = a + GRAIN[gi % len(GRAIN)]; gi += 1
            out = np.clip(a, 0, 255).astype(np.uint8)
            if enc: enc.stdin.write(out.tobytes())
            else: Image.fromarray(out).save(f'{out_path}_{T:05.2f}.png')
    if enc: enc.stdin.close(); enc.wait()

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == 'stills':
        render(sys.argv[2], only=[float(x) for x in sys.argv[3:]])
    else:
        render(sys.argv[1])

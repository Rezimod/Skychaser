#!/usr/bin/env python3
"""Astroman ad kit: renders Facebook/Instagram video ads in the Astroman house style from a JSON config.

  python3 adkit.py config.json              full render (mp4 next to the config, or "output" in config)
  python3 adkit.py config.json --preview    fast contact sheet of every shot, no audio (check layout first)
  python3 adkit.py config.json --fast       full render without motion-interpolated slow motion (draft)
  python3 adkit.py --beats music.mp3        print detected tempo and beat grid of a music file

Needs ffmpeg/ffprobe on PATH and Python 3 with Pillow and NumPy.
"""
import argparse, hashlib, json, math, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_GEO = os.path.join(HERE, 'fonts', 'NotoSansGeorgian-Bold.ttf')
FONT_LAT = os.path.join(HERE, 'fonts', 'NotoSansDisplay-Bold.ttf')
FPS = 30
SR = 48000
CREAM, ORANGE, DARK = (247, 238, 220), (255, 138, 31), (20, 12, 4)
# per format: size, caption centre, offer block centre, end-card block centre (pixels)
FORMATS = {
    '4x5':  dict(size=(1080, 1350), zone=1015, offer=800, end=735),
    '9x16': dict(size=(1080, 1920), zone=1290, offer=960, end=900),
    '1x1':  dict(size=(1080, 1080), zone=830,  offer=600, end=560),
}
IMG_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.bmp', '.tif', '.tiff')

# ------------------------------------------------------------------ helpers
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def ease_back(x, s=2.2): x = clamp(x) - 1; return x * x * ((s + 1) * x + s) + 1
def log(*a): print(*a, file=sys.stderr, flush=True)

def probe_duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True).stdout.strip()
    try: return float(out)
    except ValueError: return 0.0

def load_audio(path, sr=SR):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()

# ------------------------------------------------------------------ beat grid
def beat_grid(path):
    """Return (period, phase, onsets) of the music; cuts can snap to phase + k*period."""
    a = load_audio(path, 22050).mean(axis=1); sr, hop, win = 22050, 512, 2048
    w = np.hanning(win); prev = None; flux = []
    for i in range(0, len(a) - win, hop):
        s = np.abs(np.fft.rfft(a[i:i + win] * w))
        if prev is not None: flux.append(np.maximum(s - prev, 0).sum())
        prev = s
    flux = np.array(flux); flux /= flux.max() + 1e-9; t = (np.arange(len(flux)) + 1) * hop / sr
    f = flux - flux.mean(); ac = np.correlate(f, f, 'full')[len(f) - 1:]; lags = np.arange(len(ac)) * hop / sr
    m = (lags > 0.33) & (lags < 1.0); period = float(lags[m][np.argmax(ac[m])])
    best, phase = -1, 0.0
    for ph in np.arange(0, period, hop / sr):
        idx = ((ph + np.arange(0, t[-1], period)) * sr / hop).astype(int) - 1
        idx = idx[(idx >= 0) & (idx < len(flux))]; sc = flux[idx].sum()
        if sc > best: best, phase = sc, float(ph)
    peaks = [t[i] for i in range(1, len(flux) - 1) if flux[i] > 0.35 and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1]]
    return period, phase, peaks

# ------------------------------------------------------------------ text
_fc = {}
def font(path, size):
    if (path, size) not in _fc: _fc[(path, size)] = ImageFont.truetype(path, size)
    return _fc[(path, size)]
def is_geo(c): return 0x10A0 <= ord(c) <= 0x10FF or 0x1C90 <= ord(c) <= 0x1CBF

def text_layer(text, size, color, weight=0.038, track=0):
    """One line, Georgian in Noto Sans Georgian, everything else in Noto Sans Display, faux-heavy stroke."""
    sw = max(1, int(size * weight)); parts = []
    for c in text:
        g = is_geo(c) or (c == ' ' and parts and parts[-1][0])
        if parts and parts[-1][0] == g: parts[-1][1] += c
        else: parts.append([g, c])
    parts = [(font(FONT_GEO if g else FONT_LAT, size if g else int(size * 1.02)), s) for g, s in parts]
    asc = max(f.getmetrics()[0] for f, _ in parts) + sw
    width = sum(f.getlength(s) + track * len(s) for f, s in parts)
    im = Image.new('RGBA', (int(width + 2 * sw + 8), int(size * 1.5 + 2 * sw)), (0, 0, 0, 0)); d = ImageDraw.Draw(im); x = sw + 4
    for f, s in parts:
        for chunk in (list(s) if track else [s]):
            d.text((x, asc - f.getmetrics()[0]), chunk, font=f, fill=color, stroke_width=sw, stroke_fill=color)
            x += f.getlength(chunk) + track
    bb = im.getbbox()
    return im.crop((0, max(0, bb[1] - 4), im.width, min(im.height, bb[3] + 4)))

def fit(layer, maxw=960):
    if layer.width <= maxw: return layer
    r = maxw / layer.width; return layer.resize((int(layer.width * r), int(layer.height * r)), Image.LANCZOS)

def pill(text, size, fg, bg=None, outline=None, padx=40, pady=18):
    t = text_layer(text, size, fg, weight=0.02); w, h = t.width + 2 * padx, t.height + 2 * pady
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if outline: d.rounded_rectangle((1, 1, w - 2, h - 2), radius=h // 2, outline=outline, width=4)
    else: d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=bg)
    im.alpha_composite(t, (padx, pady)); return im

SH_BLUR = 10
def shadowed(layer, blur=SH_BLUR, alpha=190, off=(3, 6)):
    pad = blur * 3; out = Image.new('RGBA', (layer.width + 2 * pad, layer.height + 2 * pad), (0, 0, 0, 0))
    sh = Image.new('RGBA', layer.size, (0, 0, 0, 255)); sh.putalpha(layer.split()[3].point(lambda v: v * alpha // 255))
    out.alpha_composite(sh, (pad + off[0], pad + off[1])); out = out.filter(ImageFilter.GaussianBlur(blur))
    out.alpha_composite(layer, (pad, pad)); return out

def caption_layers(cap):
    """Caption styles of the house layout (see SKILL.md):
       ["word"]                       one big line (e.g. a planet name)
       ["main", "accent"]             cream headline + orange second line
       {"kicker": "ნახე", "lines": ["საკუთარი თვალით"]}   small orange line above a cream headline
       {"pill": "CELESTRON", "lines": ["ავტომატური GoTo"]} orange badge above a headline
       {"kicker": "Celestron", "lines": ["NexStar 6SE"]}  product name (Latin is fine)"""
    if isinstance(cap, str): cap = [cap]
    if isinstance(cap, list): cap = {'lines': cap}
    lines = cap.get('lines', []); out = []; gap = 14
    if cap.get('pill'): out.append(pill(cap['pill'], 46, DARK, ORANGE, padx=34)); gap = 26
    if cap.get('kicker'):
        latin = not any(is_geo(c) for c in cap['kicker'])
        out.append(fit(text_layer(cap['kicker'], 62 if latin else 96, ORANGE, weight=0.02 if latin else 0.038, track=6 if latin else 0)))
    head = bool(cap.get('pill') or cap.get('kicker'))
    if 'sizes' in cap: sizes = cap['sizes']
    elif head: sizes = [116 if not cap.get('pill') else 108, 92]
    elif len(lines) == 1: sizes = [156]
    else: sizes = [132, 92]
    for i, s in enumerate(lines):
        latin = not any(is_geo(c) for c in s)
        out.append(fit(text_layer(s, int(sizes[min(i, len(sizes) - 1)] * (1.3 if latin and head else 1)), CREAM if i == 0 else ORANGE,
                                  weight=0.035 if latin else 0.038)))
    return out, gap

# ------------------------------------------------------------------ backgrounds
def starfield(W, H, seed=7):
    rng = np.random.default_rng(seed); sw, sh = int(W * 1.25), int(H * 1.25)
    im = Image.new('RGB', (sw, sh), (4, 5, 12)); d = ImageDraw.Draw(im)
    for _ in range(int(1400 * sw * sh / (1350 * 1350))):
        x, y = rng.uniform(0, sw), rng.uniform(0, sh); r = rng.choice([0.6, 0.9, 1.3, 1.9], p=[.55, .3, .12, .03])
        b = int(rng.uniform(90, 255)); k = rng.integers(3)
        d.ellipse((x - r, y - r, x + r, y + r), fill=[(b, b, b), (b, int(b * .9), int(b * .75)), (int(b * .8), int(b * .88), b)][k])
    im = Image.blend(im, im.filter(ImageFilter.GaussianBlur(2.2)), 0.35)
    a = np.asarray(im).astype(np.float32); yy, xx = np.mgrid[0:sh, 0:sw]
    glow = np.exp(-(((xx - sw / 2) / (sw * .55)) ** 2 + ((yy - sh * 1.02) / (sh * .30)) ** 2))[..., None]
    return Image.fromarray(np.clip(a + glow * np.array([255, 110, 20]) * 0.55, 0, 255).astype(np.uint8))

# ------------------------------------------------------------------ project
class Ad:
    def __init__(self, cfg_path, fast=False):
        self.cfg_path = os.path.abspath(cfg_path); self.base = os.path.dirname(self.cfg_path)
        self.cfg = json.load(open(cfg_path, encoding='utf-8')); c = self.cfg
        fmt = FORMATS[c.get('format', '4x5')]; self.W, self.H = fmt['size']; self.fmt = fmt
        self.fast = fast
        self.cache = os.path.join(self.base, '.adkit-cache'); os.makedirs(self.cache, exist_ok=True)
        self.brand = dict(logo=os.path.join(HERE, 'astroman-logo.png'), site='astroman.ge',
                          address='ა. ყაზბეგის გამზ. 17', cta='შეუკვეთე ახლავე'); self.brand.update(c.get('brand', {}))
        self.music = c.get('music') or {}
        if self.music.get('file'): self.music['file'] = self.path(self.music['file'])
        self.shots = [dict(s) for s in c['shots']]
        for s in self.shots:
            s.setdefault('type', 'clip')
            if s.get('file'): s['file'] = self.path(s['file'])
            if s['type'] == 'clip' and s.get('file', '').lower().endswith(IMG_EXT): s['type'] = 'photo'
        self.timeline()

    def path(self, p): return p if os.path.isabs(p) else os.path.normpath(os.path.join(self.base, os.path.expanduser(p)))

    def timeline(self):
        defaults = dict(clip=3.5, photo=3.5, offer=5.3, end=3.6)
        t = 0.0; cuts = []
        for s in self.shots:
            s.setdefault('dur', defaults.get(s['type'], 3.5)); cuts.append(t); t += s['dur']
        cuts.append(t)
        if self.cfg.get('snap', True) and self.music.get('file'):
            P, ph, _ = beat_grid(self.music['file']); off = self.music.get('start', 0.0)
            step = P * (2 if P < 0.6 else 1)          # snap to the stronger (bar-level) pulse
            def snap(x):
                k = round((x + off - ph) / step); return max(0.0, ph + k * step - off)
            for i in range(1, len(cuts) - 1):
                # keep the end card its full length: don't snap the last cut beyond the music
                cuts[i] = max(cuts[i - 1] + 1.0, snap(cuts[i]))
            self.grid = (P, ph)
            log(f'music tempo {60 / P:.1f} bpm, cuts snapped to {step:.3f}s grid')
        for i, s in enumerate(self.shots):
            s['t'] = cuts[i]; s['d'] = cuts[i + 1] - cuts[i] if i + 1 < len(self.shots) else s['dur']
        self.total = self.shots[-1]['t'] + self.shots[-1]['d']

    # ---- source preparation (scale/crop to format, remove burned-in text, slow motion)
    def seg(self, i):
        s = self.shots[i]; W, H = self.W, self.H
        avail = probe_duration(s['file']) - s.get('in', 0.0)
        sd = s.get('src_dur') or min(avail, s['d'])
        sd = min(sd, avail); factor = s['d'] / max(sd, 0.1)
        if factor > 2.4:
            log(f"  shot {i + 1}: only {sd:.2f}s of footage for {s['d']:.2f}s, slow-mo capped at 2.4x"); factor = 2.4
        fx, fy = s.get('focus', [0.5, 0.5])
        if s.get('fit') == 'contain':   # whole frame visible, over a blurred, darkened copy of itself
            chain = [f"split[a][b];[b]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},gblur=sigma=40,eq=brightness=-0.12[bg];"
                     f"[a]scale={W}:{H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)*{fy}"]
        else:
            chain = [f"scale={W}:{H}:force_original_aspect_ratio=increase", f"crop={W}:{H}:(iw-ow)*{fx}:(ih-oh)*{fy}"]
        for (x, y, w, h) in s.get('clean', []):
            x, y = max(1, x), max(1, y); w, h = min(w, W - x - 1), min(h, H - y - 1); chain.append(f"delogo=x={x}:y={y}:w={w}:h={h}")
        chain.append(f"setpts={factor:.5f}*PTS")
        if factor > 1.05 and not self.fast:
            chain.append(f"minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
        else: chain.append(f"fps={FPS}")
        key = hashlib.md5(json.dumps([s['file'], os.path.getmtime(s['file']), s.get('in', 0), sd, chain]).encode()).hexdigest()[:12]
        out = os.path.join(self.cache, f'seg-{key}.mp4')
        if not os.path.exists(out):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f"{s.get('in', 0.0):.3f}", '-t', f'{sd + 0.15:.3f}', '-i', s['file'],
                            '-vf', ','.join(chain), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', out + '.part.mp4'], check=True)
            os.replace(out + '.part.mp4', out)
        return out

    def prepare(self):
        jobs = [i for i, s in enumerate(self.shots) if s['type'] in ('clip', 'offer') and s.get('file') and not s['file'].lower().endswith(IMG_EXT)]
        for i in jobs:
            if not os.path.exists(self.shots[i]['file']): sys.exit(f"missing file for shot {i + 1}: {self.shots[i]['file']}")
        log(f'preparing {len(jobs)} clips' + (' (fast mode)' if self.fast else ' (motion-interpolated slow motion, takes a few minutes)'))
        with ThreadPoolExecutor(max_workers=max(1, (os.cpu_count() or 4) // 2)) as ex:
            for i, p in zip(jobs, ex.map(self.seg, jobs)): self.shots[i]['seg'] = p

    # ---- text events
    def build_texts(self):
        W, H, f = self.W, self.H, self.fmt; ev = []
        def add(a, b, layers, cy, gap=14, stagger=0.0):
            ev.append(dict(a=a, b=b, layers=[(shadowed(l), l.height) for l in layers], cy=cy, gap=gap, stagger=stagger))
        last = None
        for i, s in enumerate(self.shots):
            a, b = s['t'], s['t'] + s['d']
            if s['type'] == 'offer':
                add(a + 0.02, b, [text_layer(s.get('big', '-20%'), 340, ORANGE, weight=0.03)], f['offer'] - 240)
                if s.get('line'): add(a + 0.35, b, [fit(text_layer(s['line'], 132, CREAM))], f['offer'] + 40)
                if s.get('pill'):
                    pt = a + (self.grid[0] * 2 if hasattr(self, 'grid') else 1.8)
                    add(pt, b, [pill(s['pill'], 52, CREAM, outline=CREAM, padx=44)], f['offer'] + 210)
                last = None; continue
            if s['type'] == 'end':
                c = f['end']; br = self.brand
                if br.get('logo'):
                    lg = Image.open(self.path(br['logo'])).convert('RGBA'); al = lg.split()[3]
                    if br.get('logo_mode', 'white') == 'white':
                        lg = Image.new('RGBA', lg.size, (255, 255, 255, 0)); lg.putalpha(al)
                    lg = lg.resize((820, int(820 * lg.height / lg.width)), Image.LANCZOS)
                    if lg.height > 330: lg = lg.resize((int(lg.width * 330 / lg.height), 330), Image.LANCZOS)
                    add(a + 0.04, b, [lg], c - 295)
                add(a + 0.40, b, [fit(text_layer(br['cta'], 104, CREAM))], c + 5)
                add(a + 0.60, b, [pill(br['site'], 66, DARK, ORANGE, padx=54, pady=22)], c + 150)
                if br.get('address'): add(a + 0.80, b, [text_layer(br['address'], 54, CREAM, weight=0.03)], c + 295)
                last = None; continue
            cap = s.get('caption')
            if cap == 'same' and last is not None: last['b'] = b; continue
            if not cap: last = None; continue
            layers, gap = caption_layers(cap)
            stg = 0.5 if s['d'] >= 2.5 else 0.12
            if isinstance(cap, list) and len(cap) == 2 and s['d'] >= 2.5: stg = 0.6
            if s.get('caption_stagger') is not None: stg = s['caption_stagger']
            add(a + 0.10, b, layers, f['zone'], gap, stg); last = ev[-1]
        self.texts = ev

    # ---- per-frame rendering
    def frames(self, i, want=None):
        """Yield (k, PIL image) for shot i."""
        s = self.shots[i]; W, H = self.W, self.H; n = int(round(s['d'] * FPS))
        ks = range(n) if want is None else sorted(want)
        if s['type'] == 'end' or (s['type'] == 'offer' and not s.get('file')):
            star = self._star if hasattr(self, '_star') else starfield(W, H); self._star = star
            for k in ks:
                z = 1 + 0.08 * k / n; cw, ch = star.width / z, star.height / z; x0, y0 = (star.width - cw) / 2, (star.height - ch) / 2
                yield k, star.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))
            return
        if s['type'] == 'photo' or (s.get('file', '').lower().endswith(IMG_EXT)):
            src = Image.open(s['file']); src = src.convert('RGB'); fx, fy = s.get('focus', [0.5, 0.5])
            def cover(im0, fx, fy):
                r = max(W / im0.width, H / im0.height); im0 = im0.resize((math.ceil(im0.width * r), math.ceil(im0.height * r)), Image.LANCZOS)
                x0, y0 = (im0.width - W) * fx, (im0.height - H) * fy; return im0.crop((int(x0), int(y0), int(x0) + W, int(y0) + H))
            if s.get('fit') == 'contain':   # whole photo visible, over a blurred, darkened copy of itself
                im = cover(src, .5, .5).filter(ImageFilter.GaussianBlur(40)); im = Image.eval(im, lambda v: int(v * .78))
                r = min(W / src.width, H / src.height); fg = src.resize((int(src.width * r), int(src.height * r)), Image.LANCZOS)
                im.paste(fg, ((W - fg.width) // 2, int((H - fg.height) * fy)))
            else: im = cover(src, fx, fy)
            for (x, y, w, h) in s.get('clean', []):
                im.paste(im.crop((x, y, x + w, y + h)).filter(ImageFilter.GaussianBlur(40)), (x, y))
            for k in ks: yield k, im
            return
        p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', s['seg'], '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        need = set(ks); last = None; k = 0; size = W * H * 3
        while k < n and (want is None or k <= max(need)):
            buf = p.stdout.read(size)
            if len(buf) == size: last = Image.frombuffer('RGB', (W, H), buf, 'raw', 'RGB', 0, 1).copy()
            if k in need and last is not None: yield k, last
            k += 1
        p.stdout.close(); p.terminate(); p.wait()

    def setup_fx(self):
        W, H = self.W, self.H; yy, xx = np.mgrid[0:H, 0:W]; z = self.fmt['zone']
        self.vig = (1 - 0.38 * np.clip(((xx - W / 2) / (W * .62)) ** 2 + ((yy - H / 2) / (H * .62)) ** 2, 0, 1.4))[..., None].astype(np.float32)
        g = np.clip((yy - (z - 295)) / 360, 0, 1) ** 1.3; self.band = (1 - 0.80 * g)[..., None].astype(np.float32)
        rng = np.random.default_rng(3); self.grain = [rng.normal(0, 3.2, (H, W, 1)).astype(np.float32) for _ in range(6)]
        self.masks = {}

    def clean_mask(self, rects):
        key = json.dumps(rects)
        if key not in self.masks:
            m = Image.new('L', (self.W, self.H), 0); d = ImageDraw.Draw(m)
            for (x, y, w, h) in rects: d.rounded_rectangle((x - 30, y - 25, x + w + 30, y + h + 25), radius=90, fill=255)
            self.masks[key] = m.filter(ImageFilter.GaussianBlur(38))
        return self.masks[key]

    def compose(self, i, k, img, gi):
        s = self.shots[i]; W, H = self.W, self.H; lt = k / FPS; p = lt / s['d']; T = s['t'] + lt; kind = s['type']
        if s.get('clean') and kind != 'photo': img = Image.composite(img.filter(ImageFilter.GaussianBlur(26)), img, self.clean_mask(s['clean']))
        if kind != 'end':
            z0, z1 = s.get('zoom', [1.0, 1.25] if kind == 'offer' else ([1.0, 1.12] if kind == 'photo' else [1.0, 1.1]))
            if kind == 'offer': z0, z1 = s.get('zoom', [1.25, 1.04])
            z = z0 + (z1 - z0) * (ease_out(p) if z0 > z1 else p)
            z *= 1 + 0.07 * (1 - ease_out(lt / 0.28))
            cx, cy = s.get('zoom_center', [0.5, 0.5]); dx = dy = 0
            if kind == 'offer' and lt < 0.3: amp = 18 * (1 - lt / 0.3); dx, dy = amp * math.sin(lt * 90), amp * math.cos(lt * 70)
            cw, ch = W / z, H / z; x0 = clamp(cx * W - cw / 2 + dx, 0, W - cw); y0 = clamp(cy * H - ch / 2 + dy, 0, H - ch)
            img = img.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))
        a = np.asarray(img).astype(np.float32)
        if kind == 'offer':
            m = a.mean(axis=2, keepdims=True); a = ((m + (a - m) * 1.45) - 128) * 1.2 + 128; a = np.clip(a * 0.85, 0, 255)
            a = np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)
        elif kind != 'end':
            m = a.mean(axis=2, keepdims=True); a = ((m + (a - m) * 1.12) - 128) * 1.08 + 128
        a *= self.vig
        if kind not in ('offer', 'end'): a *= self.band
        out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
        for e in self.texts:
            if not (e['a'] <= T < e['b']): continue
            tot = sum(h for _, h in e['layers']) + e['gap'] * (len(e['layers']) - 1); y = e['cy'] - tot / 2
            for j, (l, h) in enumerate(e['layers']):
                tt = T - e['a'] - j * e['stagger']
                if tt >= 0:
                    sc = 1.22 - 0.22 * ease_back(tt / 0.26); al = clamp(tt / 0.10)
                    ll = l if abs(sc - 1) < 1e-3 else l.resize((max(1, int(l.width * sc)), max(1, int(l.height * sc))), Image.BILINEAR)
                    if al < 1: ll = ll.copy(); ll.putalpha(ll.split()[3].point(lambda v, al=al: int(v * al)))
                    out.alpha_composite(ll, (int(W / 2 - ll.width / 2), int(y + h / 2 - ll.height / 2)))
                y += h + e['gap']
        a = np.asarray(out.convert('RGB')).astype(np.float32)
        fl = s.get('flash', 1.0 if kind in ('offer',) or i == 0 else (0.8 if kind == 'end' else 0.3))
        if fl and lt < 0.2: a = a + (255 - a) * fl * (1 - lt / 0.2) ** 2
        if kind == 'end' and T > self.total - 0.35: a *= clamp((self.total - T) / 0.35)
        return np.clip(a + self.grain[gi % 6], 0, 255).astype(np.uint8)

    # ---- audio
    def audio(self, out_wav):
        n = int(self.total * SR); mus = np.zeros((n, 2), np.float32)
        mu = self.music
        if mu.get('file'):
            m = load_audio(mu['file']); st = int(mu.get('start', 0.0) * SR)
            offer = next((s for s in self.shots if s['type'] == 'offer'), None)
            if mu.get('outro_from') is not None and offer:
                A = offer['t'] + mu.get('start', 0.0); B = mu['outro_from']; X = int(0.03 * SR)
                a_ = m[st:int(A * SR) + X // 2]; b_ = m[int(B * SR) - X // 2:]; fx = np.linspace(0, 1, X)[:, None]
                m = np.concatenate([a_[:-X], a_[-X:] * (1 - fx) + b_[:X] * fx, b_[X:]])
            else: m = m[st:]
            m = m[:n]; mus[:len(m)] = m * (10 ** (mu.get('gain_db', 0) / 20))
            if len(m) < n: log('note: music is shorter than the video; the end will be silent')
        rng = np.random.default_rng(3); sfx = np.zeros_like(mus)
        def put(sig, t, g):
            i = int(t * SR); j = min(n, i + len(sig))
            if 0 <= i < n: sfx[i:j] += sig[:j - i] * g
        def lp(x, a):
            y = np.empty_like(x); s_ = 0.0; av = np.broadcast_to(a, x.shape)
            for k in range(len(x)): s_ += av[k] * (x[k] - s_); y[k] = s_
            return y
        def boom(d=1.2, f0=70, f1=32):
            t = np.arange(int(d * SR)) / SR; fr = f1 + (f0 - f1) * np.exp(-t * 6)
            s_ = np.tanh(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 3.2) * 1.6) + rng.normal(0, 1, len(t)) * np.exp(-t * 60) * .5
            return np.stack([s_, s_], 1)
        def whoosh(d=0.34):
            t = np.arange(int(d * SR)) / SR; env = np.sin(np.pi * t / d) ** 2 * (t / d)
            nz = rng.normal(0, 1, len(t)); nz = lp(nz - lp(nz, 0.08), 0.35); pan = t / d
            return np.stack([nz * env * (1 - pan * .5), nz * env * (.5 + pan * .5)], 1)
        def riser(d=2.2):
            t = np.arange(int(d * SR)) / SR; x = t / d; nz = rng.normal(0, 1, len(t))
            s_ = (nz - lp(nz, 0.02 + 0.25 * x)) * x ** 2.5 + np.sin(2 * np.pi * np.cumsum(180 + 900 * x ** 2) / SR) * x ** 3 * .25
            return np.stack([s_, s_], 1)
        if self.cfg.get('sfx', True):
            put(boom(1.3), 0, 0.55)
            for s in self.shots[1:]:
                if s['type'] == 'offer':
                    r = riser(); put(r, s['t'] - len(r) / SR, 0.22); put(boom(1.6, 85, 30), s['t'], 0.8)
                    if s.get('pill') and hasattr(self, 'grid'): put(boom(0.9, 70, 34), s['t'] + self.grid[0] * 2, 0.35)
                elif s['type'] == 'end': put(boom(1.2, 60, 30), s['t'], 0.5)
                else: put(whoosh(0.4 if s.get('caption') and len(s['caption']) == 1 else 0.34), s['t'] - 0.3, 0.13)
        mix = mus + sfx; f = int(0.02 * SR); mix[:f] *= np.linspace(0, 1, f)[:, None]
        fo = int((1.2 if mu.get('outro_from') is None else 0.35) * SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
        raw = out_wav + '.f32'; mix.astype(np.float32).tofile(raw)
        base = ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw]
        lim = 'alimiter=limit=0.7:attack=2:release=60'
        meas = subprocess.run(['ffmpeg', '-nostats', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw, '-af',
                               lim + ',loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
        j = json.loads(meas[meas.rindex('{'):meas.rindex('}') + 1])
        ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
              f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
        subprocess.run(base + ['-af', lim + ',' + ln, '-ar', str(SR), out_wav], check=True); os.remove(raw)

    # ---- outputs
    def output_path(self):
        o = self.cfg.get('output') or os.path.splitext(os.path.basename(self.cfg_path))[0] + '.mp4'
        return self.path(o)

    def render(self):
        self.prepare(); self.build_texts(); self.setup_fx(); out = self.output_path(); tmpv = out + '.video.mp4'; tmpa = out + '.audio.wav'
        os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{self.W}x{self.H}', '-r', str(FPS), '-i', '-',
                                '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '14M', '-bufsize', '28M', '-pix_fmt', 'yuv420p',
                                '-profile:v', 'high', tmpv], stdin=subprocess.PIPE)
        gi = 0
        for i, s in enumerate(self.shots):
            log(f"  rendering shot {i + 1}/{len(self.shots)} ({s['type']}, {s['d']:.2f}s)")
            for k, img in self.frames(i):
                enc.stdin.write(self.compose(i, k, img, gi).tobytes()); gi += 1
        enc.stdin.close(); enc.wait()
        log('  mixing audio'); self.audio(tmpa)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmpv, '-i', tmpa, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac',
                        '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], check=True)
        os.remove(tmpv); os.remove(tmpa)
        log(f'done: {out}  ({self.total:.1f}s, {os.path.getsize(out) / 1e6:.1f} MB)')
        return out

    def preview(self, out_png=None):
        """Contact sheet: one frame per shot (after captions have appeared) + the offer and end card."""
        self.fast = True; self.prepare(); self.build_texts(); self.setup_fx(); tiles = []
        for i, s in enumerate(self.shots):
            k = min(int(round(s['d'] * FPS)) - 1, int(FPS * min(s['d'] - 0.2, {'end': 1.4, 'offer': 2.4}.get(s['type'], 1.6))))
            for kk, img in self.frames(i, [k]):
                im = Image.fromarray(self.compose(i, kk, img, 0)).resize((self.W // 3, self.H // 3), Image.LANCZOS)
                ImageDraw.Draw(im).text((8, 6), f"{i + 1} {s['type']} {s['t']:.1f}s+{s['d']:.1f}", font=font(FONT_LAT, 22), fill=(255, 220, 0))
                tiles.append(im)
        cols = min(6, len(tiles)); rows = math.ceil(len(tiles) / cols); tw, th = tiles[0].size
        sheet = Image.new('RGB', (cols * tw, rows * th), (0, 0, 0))
        for n_, t in enumerate(tiles): sheet.paste(t, ((n_ % cols) * tw, (n_ // cols) * th))
        out_png = out_png or os.path.splitext(self.output_path())[0] + '_preview.png'; sheet.save(out_png)
        log(f'preview: {out_png}  (total {self.total:.1f}s)'); return out_png

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('config', nargs='?'); ap.add_argument('--preview', action='store_true'); ap.add_argument('--fast', action='store_true')
    ap.add_argument('--beats', metavar='AUDIO')
    a = ap.parse_args()
    if a.beats:
        P, ph, pk = beat_grid(a.beats); print(f'tempo {60 / P:.1f} bpm  beat {P:.3f}s  first beat {ph:.3f}s')
        print('strong onsets:', ' '.join(f'{x:.2f}' for x in pk[:80])); return
    if not a.config: ap.error('config required')
    ad = Ad(a.config, fast=a.fast)
    ad.preview() if a.preview else ad.render()

if __name__ == '__main__':
    main()

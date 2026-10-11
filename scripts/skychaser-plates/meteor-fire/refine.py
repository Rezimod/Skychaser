"""Tightens a U2-Net mask: black sky reachable from outside the mask is background, rock is what is left."""
import sys
import numpy as np
from PIL import Image, ImageFilter
name, thr = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.07
img = np.asarray(Image.open(f'../gen/{name}.png').convert('RGB')).astype(np.float32) / 255
m = np.asarray(Image.open(f'mask-{name}.png').convert('L')).astype(np.float32) / 255
lum = img.max(-1)
dark = lum < thr
if name == 'MUONIONALUSTA':
    r_, g_, b_ = img[..., 0], img[..., 1], img[..., 2]
    dark |= (g_ > r_ * 1.06) & (g_ > 0.04)               # the aurora behind it
    dark |= (b_ > r_ * 1.05) & (lum > 0.55)             # and the snow
bg = m < 0.5
for _ in range(400):
    g = bg.copy()
    g[1:] |= bg[:-1]; g[:-1] |= bg[1:]; g[:, 1:] |= bg[:, :-1]; g[:, :-1] |= bg[:, 1:]
    g &= dark | (m < 0.5)
    if (g == bg).all(): break
    bg = g
rock = ~bg
# Keep the biggest solid body: anything far inside the original mask stays rock, whatever its shade.
core = np.asarray(Image.fromarray((m > 0.5).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(41))) > 0
rock |= core
r = Image.fromarray(rock.astype(np.uint8) * 255).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
r.save(f'mask2-{name}.png')
print(name, round(rock.mean(), 3), round((m > 0.5).mean(), 3))

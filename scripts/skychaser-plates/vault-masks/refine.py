"""refine.py <src.jpg> <isnet-mask.png> <out.png> [circle]
Background reachable from the border in the photo's own backdrop colour is background,
whatever ISNet thought. 'circle' fits a disc to the object (the bronze mirror) instead."""
import sys
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

src, mpath, out = sys.argv[1:4]
mode = sys.argv[4] if len(sys.argv) > 4 else ''
img = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
m = np.asarray(Image.open(mpath).convert('L')).astype(np.float32) / 255
H, W = m.shape

if mode == 'circle':
    gray = cv2.GaussianBlur((img.mean(-1) * 255).astype(np.uint8), (0, 0), 3)
    circles = cv2.HoughCircles(gray, cv2.HOUGH_GRADIENT, dp=2, minDist=W, param1=80, param2=60,
                               minRadius=int(H * 0.3), maxRadius=int(H * 0.55))
    x, y, r = circles[0][0]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.hypot(xx - x, yy - y) - r
    a = np.clip(0.5 - d / 1.5, 0, 1)
    print('circle', x, y, r)
else:
    b = max(4, int(min(H, W) * 0.015))
    border = np.concatenate([img[:b].reshape(-1, 3), img[-b:].reshape(-1, 3), img[:, :b].reshape(-1, 3), img[:, -b:].reshape(-1, 3)])
    # Backdrops shade across the frame: compare each pixel to the nearest-looking border colour cluster.
    _, labels, centres = cv2.kmeans(border.astype(np.float32), 4, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.01), 3, cv2.KMEANS_PP_CENTERS)
    dist = np.min(np.stack([np.linalg.norm(img - c, axis=-1) for c in centres]), axis=0)
    thr = float(sys.argv[5]) if len(sys.argv) > 5 else 0.10
    bgish = dist < thr
    lab, n = ndimage.label(bgish)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])
    bg = ndimage.binary_opening(bg, iterations=2)
    keep = cv2.GaussianBlur((~bg).astype(np.float32), (0, 0), 1.2)
    a = m * keep
    a[a < 0.05] = 0
Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(out)
print(out, round(float((a > 0.5).mean()), 3))

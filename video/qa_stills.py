#!/usr/bin/env python3
"""Programmatic QA over film stills: region stats + motion checks."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

D = Path(r'C:\Projects\HumanCOIN\display\video\.shots-final')

def img(t):
    return np.asarray(Image.open(D / f't{t:06.1f}.png').convert('RGB')).astype(np.int16)

def region(a, x0, y0, x1, y1):
    return a[y0:y1, x0:x1]

def stats(a):
    r, g, b = a[..., 0].astype(float), a[..., 1].astype(float), a[..., 2].astype(float)
    return {
        'std': float(np.std(a.reshape(-1, 3))),
        'ink': float(np.mean(r < 100)),
        'violet': float(np.mean((r > 60) & (r < 160) & (b > 90) & (g < 110))),
        'teal': float(np.mean((r < 110) & (g > 90) & (b > 90))),
        'amber': float(np.mean((r > 130) & (g > 70) & (g < 150) & (b < 120))),
        'rose': float(np.mean((r > 130) & (r < 220) & (g < 100) & (b < 110))),
        'blue': float(np.mean((b > 110) & (r < 110) & (g < 130))),
        'dark_bg': float(np.mean(r < 60)),
    }

def diff(a, b, x0, y0, x1, y1):
    pa, pb = region(a, x0, y0, x1, y1), region(b, x0, y0, x1, y1)
    return float(np.mean(np.abs(pa - pb)))

def show(name, s):
    print(f"{name:34s} " + ' '.join(f"{k}={v:.4f}" for k, v in s.items()))

print("=== gap ===")
a = img(33.5)
show("formula region (72..732,806..1006)", stats(region(a, 72, 806, 732, 1006)))
show("proxy region (788..1848,806..1006)", stats(region(a, 788, 806, 1848, 1006)))
a19 = img(19.0)
show("branch chips (300..1300,662..744)", stats(region(a19, 300, 662, 1300, 744)))

print("=== pathway / traces ===")
for t in (58, 66, 71):
    aa = img(t)
    show(f"lanes (72..1848,782..978) t={t}", stats(region(aa, 72, 782, 1848, 978)))
a38 = img(38.0)
show("loop svg area (470..1848,282..752) t=38", stats(region(a38, 470, 282, 1848, 752)))
a38b = img(38.5)
print(f"loop pulse motion t38→38.5: {diff(a38, a38b, 470, 282, 1848, 752):.3f}")

print("=== tiers ===")
for t in (96, 106, 116):
    aa = img(t)
    show(f"tiers rows (72..1392,300..990) t={t}", stats(region(aa, 72, 300, 1392, 990)))
    show(f"matrix (1468..1848,300..560) t={t}", stats(region(aa, 1468, 300, 1848, 560)))

print("=== episode ===")
a125 = img(125.0)
a125b = img(125.3)
a133 = img(133.0)
show("hands panel (1128..1820,510..722) t=133", stats(region(a133, 1128, 510, 1820, 722)))
show("video row1 (72..1820,286..498) t=125", stats(region(a125, 72, 286, 1820, 498)))
print(f"video motion t125→125.3 row1: {diff(a125, a125b, 72, 286, 1820, 498):.3f}")
print(f"video motion t125→125.3 row2: {diff(a125, a125b, 72, 510, 1820, 722):.3f}")
a138 = img(138.0)
show("signal lanes (72..1820,744..914) t=138", stats(region(a138, 72, 744, 1820, 914)))

print("=== dist ===")
a152 = img(152.0)
show("gallery (1120..1740,330..790) t=152", stats(region(a152, 1120, 330, 1740, 790)))
a161 = img(161.0)
show("verb bars (72..572,340..700) t=161", stats(region(a161, 72, 340, 572, 700)))
show("obj curve (618..1118,340..600) t=161", stats(region(a161, 618, 340, 1118, 600)))
show("word cloud (1164..1848,340..700) t=161", stats(region(a161, 1164, 340, 1848, 700)))
a163 = img(163.0)
show("word cloud (1164..1848,340..700) t=163", stats(region(a163, 1164, 340, 1848, 700)))

print("=== format ===")
a186 = img(186.0)
a191 = img(191.0)
show("lanes (500..1380,470..880) t=186", stats(region(a186, 500, 470, 1380, 880)))
show("lanes (500..1380,470..880) t=191", stats(region(a191, 500, 470, 1380, 880)))
print(f"format cursor motion t186→191: {diff(a186, a191, 500, 470, 1380, 880):.3f}")

print("=== community ===")
a200 = img(200.0)
show("bignum (1468..1848,214..430) t=200", stats(region(a200, 1468, 214, 1848, 430)))

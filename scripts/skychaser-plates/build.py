"""Writes First Light plates as three layers: public/cards/plate/<DESIGNATION>/{sky,object,survey}.svg

    python3 scripts/skychaser-plates/build.py [--font path/to/JetBrainsMono-Regular.ttf] [DESIGNATION ...]

Every fl_*.py module beside this file that exports PLATES is drawn; name
designations to draw only those.

The layers are served as images, so the survey layer carries its own subset of
JetBrains Mono. fontTools (and brotli) are needed only for that subset.
"""
import base64, glob, importlib, io, os, re, sys
from drawing import andromeda, saturn
import more

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'cards', 'plate')

# Every plate on the full-art canvas (582 × 832), in the set's order of families.
ART = {
    'JUPITER': lambda u: more.jupiter(u, more.HF), 'SATURN': lambda u: saturn(u, more.HF), 'HALLEY': lambda u: more.halley(u, more.HF),
    'M45': lambda u: more.m45(u, more.HF), 'M42': lambda u: more.m42(u, more.HF), 'M31': lambda u: andromeda(u, more.HF),
}
for path in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fl_*.py'))):
    for k, fn in importlib.import_module(os.path.basename(path)[:-3]).PLATES.items():
        if k in ART:
            raise SystemExit('%s is drawn twice (%s)' % (k, os.path.basename(path)))
        ART[k] = fn


def standalone(s, style=''):
    s = s.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    return s.replace('<defs>', '<defs>' + style, 1) if style else s


def font_face(texts, ttf):
    from fontTools import subset
    from fontTools.ttLib import TTFont
    chars = set(''.join(texts)) | set('0123456789')
    font = TTFont(ttf)
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = []; opts.name_IDs = []
    sub = subset.Subsetter(opts); sub.populate(text=''.join(sorted(chars))); sub.subset(font)
    buf = io.BytesIO(); font.flavor = 'woff2'; font.save(buf)
    return "<style>@font-face{font-family:'JetBrains Mono';src:url(data:font/woff2;base64,%s) format('woff2')}</style>" % base64.b64encode(buf.getvalue()).decode()


def main():
    args = sys.argv[1:]
    ttf = None
    if '--font' in args:
        i = args.index('--font')
        ttf = args[i + 1]
        del args[i:i + 2]
    missing = [k for k in args if k not in ART]
    if missing:
        raise SystemExit('not drawn anywhere: ' + ', '.join(missing))
    layers = {k: fn('p') for k, fn in ART.items() if not args or k in args}
    face = ''
    if ttf:
        texts = [re.sub(r'<[^>]+>', ' ', ann) for _, _, ann in layers.values()]
        face = font_face(texts, ttf)
    for k, (bg, obj, ann) in layers.items():
        d = os.path.join(OUT, k)
        os.makedirs(d, exist_ok=True)
        for name, s in (('sky', standalone(bg)), ('object', standalone(obj)), ('survey', standalone(ann, face))):
            open(os.path.join(d, name + '.svg'), 'w').write(s)
        print(k, len(bg), len(obj), len(ann))


main()

---
name: astroman-video-ad
description: Make Facebook/Instagram video ads for Astroman (astroman.ge) in the approved house style from a folder of product clips and photos. Use when the user asks for a video ad, promo video, Reels/feed video, or "a video like the last one" for any Astroman product (telescopes, binoculars, microscopes, star projectors, accessories). Renders with adkit.py in this skill's folder.
---

# Astroman video ad

`KIT` below means this skill's own folder (the directory that contains this SKILL.md); run `KIT/adkit.py`
with its full path. The approved reference ad is `astroman-01_v7_45s_4x5.mp4` (45 s, 4:5), and the config that
rebuilds it is `KIT/examples/astroman-01.json`. Every new ad copies its structure, pacing and look.
`adkit.py` implements the whole style, so your job is to choose shots, write Georgian copy and fill in a JSON
config. Do not hand-write ffmpeg pipelines for the look, and do not edit adkit.py for a single ad.

## 0. Setup check (once per machine)

Run these and fix anything missing before starting:

```
ffmpeg -version | head -1
python3 -c "import PIL, numpy; print('ok')"
```

Missing ffmpeg: `brew install ffmpeg` on macOS, `winget install ffmpeg` on Windows.
Missing Python packages: `python3 -m pip install pillow numpy`.
Fonts and the logo ship inside `KIT`, so nothing else is needed.

## 1. Get the brief

Ask only for what you cannot see in the folder:
- the product(s) and the exact offer text (discount, price, deadline); never invent an offer or a claim;
- the format: `4x5` feed (default), `9x16` Reels/Stories, or `1x1`;
- the music file; if none, ask for one, or use the music of a previous ad.

Default length is about 45 seconds. Shorter cuts (15 to 20 s) are fine if the user asks.

## 2. Look at the material

For every file in the folder:
- `ffprobe` duration, size and frame rate;
- a contact sheet so you can see it (read the PNG):
  `ffmpeg -i CLIP -vf "fps=2,scale=270:-1,tile=6x4" -frames:v 1 sheet.png`
- note burned-in text, logos or watermarks and their pixel box in the output frame (1080 wide);
  pass them as `"clean"` boxes so the kit blurs them out under the new caption;
- note usable in-points: skip fades, black frames, shaky starts. A luma timeline helps:
  `ffmpeg -i CLIP -vf "fps=5,scale=64:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null -`

Check the music: `python3 KIT/adkit.py --beats MUSIC`. If you want the music to jump
to its ending on the offer card, pick a strong onset late in the track as `outro_from`.

## 3. Structure (the house layout)

| # | Shot | Length | Caption |
|---|------|--------|---------|
| 1 | Hook: the most striking visual (sky object, product hero, close-up) | 3 to 3.5 s | Short headline + orange second line |
| 2 to 3 | Product in the shop or in use | 2.5 to 3.5 s each | Benefit line, or `"same"` to keep the hook caption |
| 4 to 6 | "What you'll see / do" rapid set (planets, details, features) | 3.5 s each | One big word each |
| 7 to 9 | Product range or features | 3.5 to 4.5 s | Two-line benefit, or badge + headline |
| 10 | Hero product with its name | 4.5 s | Kicker brand + model name |
| 11 | Offer card (`"type": "offer"`) | 5.3 s | Big number, one line, pill |
| 12 | End card (`"type": "end"`) | 3.6 s | Logo, CTA, site button, address (automatic) |

Rules that made v7 work:
- one idea per shot, at most two caption lines, and short lines (2 or 3 words);
- the first line is cream, the second is orange; one-word captions are big and cream;
- the hook comes first; the offer appears only near the end, on a music hit;
- clips are slowed with motion interpolation when the footage is shorter than the shot, so
  2 to 2.5 s of footage per shot is enough. Avoid asking for more than about 2x slow motion;
- write Georgian in Mkhedruli (normal lowercase), not Mtavruli capitals.

## 4. Copy

Georgian, short, concrete. Useful patterns from v7: "ცა ახლოსაა / ვიდრე გგონია", "ნახე / საკუთარი თვალით",
"ტელესკოპები / ყველა დონისთვის", "დამწყებიდან / პროფესიონალამდე", "შეუკვეთე ახლავე".
Only state features the product really has (check the model name and specs) and only the offer the user gave.
Show the user the full caption list before rendering.

## 5. Config

Put the config in the user's material folder (paths are relative to the config).

```json
{
  "output": "binoculars-01_4x5.mp4",
  "format": "4x5",
  "music": { "file": "music.mp3", "start": 0, "outro_from": 39.24 },
  "brand": { "site": "astroman.ge", "address": "ა. ყაზბეგის გამზ. 17", "cta": "შეუკვეთე ახლავე" },
  "shots": [
    { "file": "clip1.mp4", "in": 1.2, "dur": 3.2, "zoom": [1.02, 1.3], "caption": ["ცა ახლოსაა", "ვიდრე გგონია"] },
    { "file": "shop.mp4",  "in": 0.0, "dur": 3.5, "zoom": [1.1, 1.0], "clean": [[90, 905, 900, 230]], "caption": "same" },
    { "file": "photo.jpg", "dur": 3.5, "fit": "contain", "caption": { "kicker": "ნახე", "lines": ["საკუთარი თვალით"] } },
    { "file": "moon.mp4",  "in": 2.0, "dur": 3.5, "zoom": [1.8, 2.2], "flash": 0.55, "caption": ["მთვარე"] },
    { "file": "mount.mp4", "in": 0.5, "dur": 3.5, "caption": { "pill": "CELESTRON", "lines": ["ავტომატური GoTo"] } },
    { "file": "hero.mp4",  "in": 0.0, "dur": 4.4, "caption": { "kicker": "Celestron", "lines": ["NexStar 6SE"] } },
    { "type": "offer", "file": "sky.mp4", "in": 0, "dur": 5.3, "big": "-20%", "line": "ტელესკოპებზე", "pill": "ონლაინ და მაღაზიაში" },
    { "type": "end", "dur": 3.6 }
  ]
}
```

Shot fields:
- `file`: video or photo (jpg/png/webp). `in`: start second in the clip. `src_dur`: seconds of footage to use
  (default: as much as fits). `dur`: shot length; cuts are snapped to the music beat (`"snap": false` at top level turns that off).
- `zoom`: `[start, end]` scale; push in on product and sky shots, pull out (`[1.1, 1.0]`) on wide shop shots.
  Planets and small objects need `[1.8, 2.2]` or more. `zoom_center`: `[x, y]` 0 to 1.
- `focus`: `[x, y]` 0 to 1, which part of the source to keep when it is cropped to the format.
- `fit: "contain"`: show the whole photo or clip over a blurred copy (use for wide product photos, especially in 9x16).
- `clean`: list of `[x, y, w, h]` boxes in output pixels to blur away burned-in text.
- `flash`: white flash strength at the cut (0 to 1). `caption_stagger`: seconds before the second line appears.
- `caption`: `["word"]`, `["line 1", "line 2"]`, `{"kicker": ..., "lines": [...]}`, `{"pill": ..., "lines": [...]}`,
  optional `"sizes": [116, 116]`, or `"same"` to continue the previous shot's caption.
- offer: `big`, `line`, `pill`; without `file` it uses a starfield.
- `music.start`: where in the track to begin. `music.outro_from`: jump to this second of the track at the offer
  card so the song ends naturally; leave it out to fade the music out instead. `music.gain_db` adjusts level.
- top level `"sfx": false` removes the whooshes and bass hits.

## 6. Render and check

1. Preview first (seconds): `python3 KIT/adkit.py CONFIG --preview`, then read the
   `_preview.png`. Check that captions do not cover the product, burned-in text is hidden, and nothing is cut off.
2. Draft if the user wants to see motion quickly: `--fast` (no interpolation).
3. Final: `python3 KIT/adkit.py CONFIG` (a few minutes; slow motion is cached in `.adkit-cache`).
4. Verify: `ffprobe` size and duration, a contact sheet of the result every second, and loudness
   (`ffmpeg -i OUT -af ebur128=peak=true -f null -` should show about -14 LUFS).
5. Tell the user where the file is, its length, and the exact captions and offer used. You cannot hear the
   result, so ask them to check the sound once.

For more variants, copy the config and change only the hook shot and caption, or the format (`9x16`).

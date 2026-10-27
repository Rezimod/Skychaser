# Video ads

`astroman-01_v7_45s_4x5.mp4` is the current version: 45 seconds, same shots and design as v6,
with each shot held longer using motion-interpolated slow motion, and captions in the original
video's lowercase cream style. The scripts in `scripts/` build v7.

`astroman-01_v6_4x5.mp4` is a 20-second Facebook feed ad (1080x1350, 4:5, 30 fps, -14 LUFS).
It is a re-edit of `astroman-01_v5.mp4`: footage up to the NexStar 6SE shot is kept and re-cut
to the music's beat, burned-in captions are removed and replaced, and a new offer and end card
replace the old ending.

## Re-rendering

The scripts expect a work folder in `ADWORK` that contains `src/astroman-01_v5.mp4` and a `build/` folder.
They need ffmpeg, Python with Pillow and NumPy, and the `fonts-noto-core` package for Noto Sans Georgian.

```
export ADWORK=/path/to/work
cd "$ADWORK/build"
python3 /path/to/scripts/build.py video.mp4
python3 /path/to/scripts/audio.py 44.64
```

Edit the `SHOTS` and `TEXTS` tables in `build.py` to change cuts, timing or copy.

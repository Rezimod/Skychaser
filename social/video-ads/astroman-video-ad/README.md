# Astroman video ad skill

A Claude Code skill plus the renderer it uses. It makes ads in the style of `../astroman-01_v7_45s_4x5.mp4`
from a JSON config. `SKILL.md` documents the workflow and every config field.

## Install on your computer (once)

Copy this whole folder into your personal Claude Code skills folder.

macOS or Linux:

```
mkdir -p ~/.claude/skills && cp -R social/video-ads/astroman-video-ad ~/.claude/skills/
```

Windows PowerShell:

```
New-Item -ItemType Directory -Force $HOME\.claude\skills; Copy-Item -Recurse social\video-ads\astroman-video-ad $HOME\.claude\skills\
```

Then open a terminal in any folder with your clips and photos, run `claude`, and type `/astroman-video-ad`
followed by your brief.

## Run the renderer directly

```
python3 adkit.py config.json --preview   # contact sheet in seconds
python3 adkit.py config.json             # final mp4
python3 adkit.py --beats music.mp3       # tempo and beat grid
```

Requirements: ffmpeg and ffprobe, Python 3 with Pillow and NumPy. Fonts (Noto, OFL) and the logo are included.
The example config expects the original `astroman-01_v5.mp4` in `examples/media/`.

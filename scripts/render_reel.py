#!/usr/bin/env python3
"""
Wolf's Garage Reel Renderer
Takes a JSON brief, outputs a 9:16 MP4 ready for Instagram Reels.

TWO BRIEF FORMATS LIVE HERE.

  v1 ("clips")    - the July format. Untouched. Every v1 brief renders through the exact
                    same code path it always did, so the ten mp4s in renders/ stay
                    reproducible. Do not "tidy" the v1 functions into the v2 ones.
  v2 ("segments") - the Phase 3 format (2026-08-09): transitions between segments,
                    spec-driven Ken Burns with a subject-safety law, stills pulled from
                    the media index by asset name, video trimmed in/out, overlays burned
                    in ONE pass, brand thin frame, end card, poster frame.

Dispatch is on the key: a brief carrying "segments" renders v2, anything else renders v1.

---------------------------------------------------------------------------- v1 brief
{
  "duration_total": 14,
  "music_url": "https://example.com/track.mp3",  // optional
  "clips": [
    {
      "kind": "photo",         // or "video", "video_segment"
      "source_url": "https://...",
      "duration": 4.0,
      "motion": "zoom_in",     // zoom_in, zoom_out, pan_left, pan_right, static
      "text_overlays": [
        {"text": "BUILT NOT BOUGHT", "position": "lower", "start": 0.5,
         "hold": 2.5, "size": "large"}
      ]
    }
  ]
}

---------------------------------------------------------------------------- v2 brief
{
  "version": 2,
  "frame": "thin",                    // thin (default, 12px, matches the photo law) | none
  "poster_at": 0.6,                   // seconds; the frame the approval page shows
  "music_url": "https://...",         // optional
  "segments": [
    {
      "kind": "clip",                 // a video: his phone footage
      "src": "temp/reel-source/video-1779581504935.mp4",
      "trim": {"in": 2.0, "out": 5.4},
      "crop": {"focus_x": 0.5, "focus_y": 0.42},
      "overlays": [ ... ]
    },
    {
      "kind": "still",                // motion on a library photo
      "asset": "20260711_153341.jpg", // resolved through the media index (BRD-005 enforced)
      "duration": 3.4,
      "plate_focus": {"x": 0.5, "y": 0.45},
      "motion": {"from": {"zoom": 1.0,  "focus_x": 0.10, "focus_y": 0.5},
                 "to":   {"zoom": 1.14, "focus_x": 0.72, "focus_y": 0.5}},
      "subject": {"x0": 0.06, "y0": 0.30, "x1": 0.97, "y1": 0.78},
      "transition_in": {"type": "whip_left", "duration": 0.22},
      "overlays": [
        {"text": "BUILT NOT BOUGHT", "position": "lower", "start": 0.2,
         "hold": 3.0, "size": "large", "style": "primary", "font": "bebas"}
      ]
    }
  ],
  "end_card": {"duration": 2.4, "logo": "assets/wolf-logo.png",
               "primary_text": "WOLF'S GARAGE", "subtitle": "PORTLAND, OREGON",
               "footer": "GET BACK IN THE GARAGE.",
               "transition_in": {"type": "crossfade", "duration": 0.5}}
}

HARD RULES enforced here (ported from _skills/post-assembler/assemble.py):
  * NO-UPSCALE GUARD. A still whose largest 9:16 window is narrower than 1080 x max_zoom
    ABORTS. A clip whose frame has to be scaled UP to fill 1080x1920 ABORTS. Pass
    "allow_upscale": true on the segment to override; it still prints a loud warning.
    Mush is worse than no reel.
  * BRD-005. A still whose media-index content_tag is "resale" or "personal" ABORTS.
    The resale side hustle and his family photos never enter a Wolf's Garage render.
  * SUBJECT SAFETY. When a still declares a "subject" box, every motion keyframe must keep
    the subject's full height inside the frame (no decapitated cars) and keep it filling at
    least half the frame width (pan ALONG the car, never off into the grass). Override with
    "allow_unsafe_motion": true, which also warns loudly.
  * Brand colours are the locked set: black #0A0A0A, red #CC0000, bone #F5F1E8, and copper
    #C8922A on TEXT ONLY.
"""

import argparse, csv, json, math, os, re, shutil, subprocess, sys, tempfile, urllib.request
from pathlib import Path

OUT_W, OUT_H = 1080, 1920  # 9:16 vertical (IG Reel)
FPS = 30

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

FONT_PATHS = [
    str(Path(__file__).parent / "fonts" / "BebasNeue-Regular.ttf"),
    str(Path(__file__).parent / "fonts" / "Oswald-Bold.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

# Named brand fonts for v2 overlays. Bebas is the hook face, Oswald the label face.
NAMED_FONTS = {
    "bebas": SCRIPT_DIR / "fonts" / "BebasNeue-Regular.ttf",
    "oswald": SCRIPT_DIR / "fonts" / "Oswald-Bold.ttf",
}

# Wolf's Garage brand colors per HARD RULES
BRAND_BONE = "#F5F1E8"     # primary text
BRAND_RED = "#CC0000"      # accent border
BRAND_BLACK = "#0A0A0A"    # bg / shadow
BRAND_COPPER = "#C8922A"   # text-only accent

# The photo law's thin frame, re-cut for video.
#
# assemble.py and post-queue.html draw thin as 4 margin + 2 red + 2 gap + 2 bone + 2 gap =
# 12px inset. Copying those numbers straight onto a reel LOOKS right in a PNG and then dies
# in the encoder: H.264 yuv420p carries chroma at half resolution, so a 2px line only gets
# ONE chroma sample and it gets averaged with whatever is beside it. Measured on the first
# render of demo B: #CC0000 came back (153,29,7) and #F5F1E8 came back (218,225,189) - the
# red read amber and the bone read green against foliage. The brand gate caught it.
#
# So "thin" keeps the 12px inset - the frame sits exactly where it does on a photo post -
# but the strokes are doubled to 4px, which is 2 chroma samples and survives the encode.
# Verified after the change: red (203,1,1), bone (245,241,231).
FRAMES = {
    "thin": {"m_out": 2, "s_red": 4, "g1": 2, "s_bone": 4, "g2": 2},      # 14px inset
    "hairline": {"m_out": 4, "s_red": 2, "g1": 2, "s_bone": 2, "g2": 2},  # photo numbers; smears
    "none": None,
}
DEFAULT_FRAME = "thin"

MEDIA_INDEX = os.environ.get(
    "WG_MEDIA_INDEX",
    r"C:\Users\wolfs\OneDrive\Desktop\knowledge base\Media\_media_index.csv",
)
BANNED_TAGS = {"resale", "personal"}


class RenderAbort(Exception):
    """A render that would ship damage. Never caught - the run stops."""


# ------------------------------------------------------------------ ffmpeg discovery

_FFMPEG = None


def ffmpeg_bin():
    """Resolve an ffmpeg binary.

    Order: $WG_FFMPEG, then PATH (this is what the GitHub Action hits - it apt-installs
    ffmpeg, so CI behaviour is unchanged), then the imageio-ffmpeg wheel's bundled build.
    That last one is how this runs on John's Windows box, which has no system ffmpeg:
    `pip install --user imageio-ffmpeg` drops a full gyan.dev build (libx264 + libfreetype)
    inside site-packages without touching PATH or anything system-wide.
    """
    global _FFMPEG
    if _FFMPEG:
        return _FFMPEG
    env = os.environ.get("WG_FFMPEG")
    if env and os.path.exists(env):
        _FFMPEG = env
        return _FFMPEG
    found = shutil.which("ffmpeg")
    if found:
        _FFMPEG = found
        return _FFMPEG
    try:
        import imageio_ffmpeg
        _FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
        return _FFMPEG
    except Exception:
        pass
    raise RenderAbort(
        "no ffmpeg found. Set WG_FFMPEG, put ffmpeg on PATH, or "
        "`pip install --user imageio-ffmpeg`."
    )


def find_font():
    for p in FONT_PATHS:
        if os.path.exists(p):
            return p
    return None


def named_font(name):
    p = NAMED_FONTS.get((name or "bebas").lower())
    if p and p.exists():
        return p
    fb = find_font()
    return Path(fb) if fb else None


def download(url, dest):
    print(f"[download] {url}", flush=True)
    if url.startswith("file://"):
        urllib.request.urlretrieve(url, dest)
    else:
        req = urllib.request.Request(url, headers={"User-Agent": "WolfsGarageReelRenderer/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest


def run_ffmpeg(args, label="ffmpeg", cwd=None):
    cmd = [ffmpeg_bin(), "-hide_banner", "-loglevel", "warning", "-y"] + args
    print(f"[{label}] running...", flush=True)
    r = subprocess.run(cmd, capture_output=True, text=True, errors="replace", cwd=cwd)
    if r.returncode != 0:
        print("FFMPEG STDERR:", r.stderr, file=sys.stderr)
        print("FFMPEG CMD:", " ".join(str(c) for c in cmd[:25]), "...", file=sys.stderr)
        raise SystemExit(r.returncode)


# =====================================================================================
# v1 PATH - the July format. Frozen. Do not refactor into the v2 helpers.
# =====================================================================================

def make_photo_clip(src, duration, motion, out_path):
    """Photo to video with Ken Burns. Pre-scale to large canvas, then zoompan."""
    frames = int(duration * FPS)
    if frames < 2:
        frames = 2

    # Pre-scale source so zoompan has headroom (zoompan source dim should be larger than output)
    pre_w = OUT_W * 4
    pre_h = OUT_H * 4

    # Motion configuration
    if motion == "zoom_in":
        z_expr = f"min(zoom+0.0015,1.4)"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"
    elif motion == "zoom_out":
        z_expr = f"if(eq(on,1),1.4,max(zoom-0.0015,1.0))"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"
    elif motion == "pan_right":
        z_expr = "1.25"
        x_expr = f"(iw-iw/zoom)*(on/{frames})"
        y_expr = "ih/2-(ih/zoom/2)"
    elif motion == "pan_left":
        z_expr = "1.25"
        x_expr = f"(iw-iw/zoom)*(1-(on/{frames}))"
        y_expr = "ih/2-(ih/zoom/2)"
    else:  # static
        z_expr = "1.05"
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"

    vf = (
        f"scale={pre_w}:{pre_h}:force_original_aspect_ratio=increase,"
        f"crop={pre_w}:{pre_h},"
        f"zoompan=z='{z_expr}':x='{x_expr}':y='{y_expr}':"
        f"d={frames}:s={OUT_W}x{OUT_H}:fps={FPS}"
    )

    run_ffmpeg([
        "-loop", "1", "-framerate", str(FPS),
        "-i", str(src),
        "-vf", vf,
        "-t", str(duration),
        "-r", str(FPS),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "20",
        "-an",
        str(out_path)
    ], label=f"photo_clip ({motion})")
    return out_path


def make_video_clip(src, duration, motion, out_path):
    """Trim and crop a video clip to 9:16."""
    vf_parts = [
        f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase",
        f"crop={OUT_W}:{OUT_H}",
        f"setsar=1",
        f"fps={FPS}",
    ]
    run_ffmpeg([
        "-i", str(src),
        "-t", str(duration),
        "-vf", ",".join(vf_parts),
        "-r", str(FPS),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "20",
        "-an",
        str(out_path)
    ], label="video_clip")
    return out_path


def make_video_segment_clip(src, start_time, duration, out_path):
    """Extract a SEGMENT from a source video (start_time to start_time+duration),
    crop/scale to 9:16, strip audio. Used when clip kind == 'video_segment'.

    Note: -ss BEFORE -i = fast seek (keyframe-snapped, less accurate).
          -ss AFTER  -i = accurate seek (slower, frame-perfect).
    We use accurate seek because Reels usually need clean cuts on action moments.
    """
    vf_parts = [
        f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase",
        f"crop={OUT_W}:{OUT_H}",
        f"setsar=1",
        f"fps={FPS}",
    ]
    run_ffmpeg([
        "-i", str(src),
        "-ss", str(start_time),
        "-t", str(duration),
        "-vf", ",".join(vf_parts),
        "-r", str(FPS),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "20",
        "-an",
        str(out_path)
    ], label=f"video_segment[{start_time:.2f}+{duration:.2f}]")
    return out_path


SIZE_MAP = {
    "small": 60,
    "medium": 88,
    "large": 130,
    "huge": 200,
}

# Per Bebas Neue's narrow geometry: width/height ratio ~ 0.42 for caps
# Per Oswald Bold: ratio ~ 0.55
# We use a conservative 0.50 to cover both
FONT_WIDTH_RATIO = 0.50

# Max text width as fraction of frame width (leaves 8% safe margin per side)
MAX_TEXT_WIDTH_FRAC = 0.84


def autofit_fontsize(text, requested_size, frame_w=OUT_W):
    """Cap the font size so text fits within the frame width."""
    if not text:
        return requested_size
    max_text_px = frame_w * MAX_TEXT_WIDTH_FRAC
    max_size_for_width = int(max_text_px / (len(text) * FONT_WIDTH_RATIO))
    return min(requested_size, max_size_for_width)


def add_text_overlay(src, text, position, start, hold, size, out_path, style="primary"):
    """Burn a Wolf's Garage branded text overlay onto a clip.

    Pinstripe plate design:
      - Semi-transparent black plate behind text
      - Red + bone double pinstripe (top and bottom of plate)
      - Bebas Neue text inside plate, bone white, no border

    Multi-line text supported via \\n in the text string. Plate grows to fit.

    style options:
      primary  - bone text on dark plate w/ red+bone pinstripes (default)
      accent   - copper text on dark plate w/ pinstripes (for subtitle)
      hook     - same as primary but larger
    """
    # Multi-line detection
    lines = text.split("\n")
    n_lines = len(lines)
    longest_line = max(lines, key=len) if lines else text

    requested = SIZE_MAP.get(size, 88)
    # Autofit based on LONGEST line, not total length
    fontsize = autofit_fontsize(longest_line, requested)

    font = find_font()

    # Total text block height for n lines (FFmpeg drawtext default line spacing ~1.15)
    line_h_factor = 1.18
    text_block_h = int(fontsize * line_h_factor * n_lines)

    pad_v = max(28, int(fontsize * 0.32))
    plate_h = text_block_h + (pad_v * 2)

    # Y position of plate (top of plate)
    if position == "upper":
        plate_y = int(OUT_H * 0.10)
    elif position == "lower":
        plate_y = int(OUT_H * 0.80) - plate_h // 2
    else:  # middle
        plate_y = (OUT_H - plate_h) // 2

    # Color per style
    if style == "accent":
        textcolor = BRAND_COPPER
    else:
        textcolor = BRAND_BONE

    # textfile= avoids FFmpeg drawtext quoting headaches
    text_file = out_path.parent / f"{out_path.stem}_text.txt"
    text_file.write_text(text, encoding="utf-8")

    en = f"enable='between(t,{start},{start+hold})'"

    # Pinstripe geometry
    red_thick = 3
    bone_thick = 2
    gap = 3

    plate_bottom = plate_y + plate_h

    filters = [
        # Plate background
        f"drawbox=x=0:y={plate_y}:w=iw:h={plate_h}:color={BRAND_BLACK}@0.72:t=fill:{en}",
        # Top red stripe
        f"drawbox=x=0:y={plate_y}:w=iw:h={red_thick}:color={BRAND_RED}:t=fill:{en}",
        # Top bone stripe (below top red)
        f"drawbox=x=0:y={plate_y + red_thick + gap}:w=iw:h={bone_thick}:color={BRAND_BONE}:t=fill:{en}",
        # Bottom red stripe
        f"drawbox=x=0:y={plate_bottom - red_thick}:w=iw:h={red_thick}:color={BRAND_RED}:t=fill:{en}",
        # Bottom bone stripe (above bottom red)
        f"drawbox=x=0:y={plate_bottom - red_thick - gap - bone_thick}:w=iw:h={bone_thick}:color={BRAND_BONE}:t=fill:{en}",
    ]

    # Text drawn inside plate, centered (FFmpeg drawtext handles multi-line natively from textfile)
    text_parts = [
        f"textfile={text_file}",
        f"fontsize={fontsize}",
        f"fontcolor={textcolor}",
        "x=(w-text_w)/2",
        f"y={plate_y}+({plate_h}-text_h)/2",
        en,
    ]
    if font:
        text_parts.insert(1, f"fontfile={font}")
    filters.append("drawtext=" + ":".join(text_parts))

    vf = ",".join(filters)
    run_ffmpeg([
        "-i", str(src),
        "-vf", vf,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "20",
        "-an",
        str(out_path)
    ], label=f"text_overlay ({fontsize}px x{n_lines}L {style})")
    return out_path


def make_end_frame(end_frame_spec, out_path, work_dir=None):
    """Generate the Wolf's Garage branded end card as a standalone clip.

    Layout (inside pinstripe rectangle, top to bottom):
      1. Wolf logo (image, centered)
      2. Primary text "WOLF'S GARAGE" (Bebas Neue bone white)
      3. Subtitle in copper (optional)
    Below rectangle:
      4. Footer stamp in copper (optional)

    Spec format:
      {
        "duration": 2.5,
        "logo_url": "https://raw.githubusercontent.com/.../wolf-logo.png",
        "logo": "assets/wolf-logo.png",        // v2: repo-relative local file
        "primary_text": "WOLF'S GARAGE",
        "subtitle": "PDX HOT ROD APPAREL",
        "footer": "WOLF'S GARAGE LLC - PORTLAND, OREGON - GET BACK IN THE GARAGE."
      }
    """
    duration = end_frame_spec.get("duration", 2.5)
    logo_url = end_frame_spec.get("logo_url")
    logo_local = end_frame_spec.get("logo")
    primary = end_frame_spec.get("primary_text", "WOLF'S GARAGE")
    subtitle = end_frame_spec.get("subtitle", "")
    footer = end_frame_spec.get("footer", "")

    font = find_font()
    if work_dir is None:
        work_dir = out_path.parent

    # === Sizing ===
    primary_size = autofit_fontsize(primary, 160)  # cap a touch below huge
    subtitle_size = autofit_fontsize(subtitle, 48) if subtitle else 0
    footer_size = max(30, autofit_fontsize(footer, 42)) if footer else 0

    # Logo target size (inside the frame)
    logo_target = 480  # px, square

    # === Layout math: stack inside a centered rectangle ===
    # Components (top to bottom): logo, primary text, subtitle (if any)
    spacing = 40  # vertical gap between components
    inner_pad = 50  # padding inside the pinstripe rectangle

    content_h = logo_target + spacing + primary_size
    if subtitle:
        content_h += spacing + subtitle_size

    frame_h = content_h + (inner_pad * 2)
    frame_w_frac = 0.86
    frame_w = int(OUT_W * frame_w_frac)
    frame_x = (OUT_W - frame_w) // 2

    # Vertically center the frame, accounting for footer below
    available_h = OUT_H - (footer_size * 2 + 80 if footer else 80)
    frame_y = max(80, (available_h - frame_h) // 2)

    # Component positions inside frame
    content_top = frame_y + inner_pad
    logo_x = (OUT_W - logo_target) // 2
    logo_y = content_top

    primary_y = logo_y + logo_target + spacing
    subtitle_y = primary_y + primary_size + spacing if subtitle else 0

    footer_y = OUT_H - footer_size - 40

    # === Text files (avoid drawtext escaping) ===
    # Referenced by BASENAME, because ffmpeg runs with cwd=work_dir. An absolute Windows
    # path inside a filter string makes drawtext read "C:" as an option separator and the
    # whole graph fails to parse - which is why the end card never rendered off CI.
    primary_file = work_dir / "endf_primary.txt"
    primary_file.write_text(primary, encoding="utf-8")
    subtitle_file = work_dir / "endf_subtitle.txt"
    subtitle_file.write_text(subtitle or "", encoding="utf-8")
    footer_file = work_dir / "endf_footer.txt"
    footer_file.write_text(footer or "", encoding="utf-8")
    if font:
        font_src = Path(font)
        font_dst = work_dir / f"font_{font_src.stem}{font_src.suffix}"
        if not font_dst.exists():
            shutil.copyfile(font_src, font_dst)
        font = font_dst.name

    # === Pinstripe rectangle (red + bone double stripes on all 4 sides) ===
    red_t = 4
    bone_t = 3
    gap = 4

    pinstripe_filters = [
        # Top
        f"drawbox=x={frame_x}:y={frame_y}:w={frame_w}:h={red_t}:color={BRAND_RED}:t=fill",
        f"drawbox=x={frame_x}:y={frame_y + red_t + gap}:w={frame_w}:h={bone_t}:color={BRAND_BONE}:t=fill",
        # Bottom
        f"drawbox=x={frame_x}:y={frame_y + frame_h - red_t}:w={frame_w}:h={red_t}:color={BRAND_RED}:t=fill",
        f"drawbox=x={frame_x}:y={frame_y + frame_h - red_t - gap - bone_t}:w={frame_w}:h={bone_t}:color={BRAND_BONE}:t=fill",
        # Left
        f"drawbox=x={frame_x}:y={frame_y}:w={red_t}:h={frame_h}:color={BRAND_RED}:t=fill",
        f"drawbox=x={frame_x + red_t + gap}:y={frame_y}:w={bone_t}:h={frame_h}:color={BRAND_BONE}:t=fill",
        # Right
        f"drawbox=x={frame_x + frame_w - red_t}:y={frame_y}:w={red_t}:h={frame_h}:color={BRAND_RED}:t=fill",
        f"drawbox=x={frame_x + frame_w - red_t - gap - bone_t}:y={frame_y}:w={bone_t}:h={frame_h}:color={BRAND_BONE}:t=fill",
    ]

    # === Text filters ===
    primary_text_parts = [
        f"textfile={primary_file.name}",
        f"fontsize={primary_size}",
        f"fontcolor={BRAND_BONE}",
        "x=(w-text_w)/2",
        f"y={primary_y}",
    ]
    if font:
        primary_text_parts.insert(1, f"fontfile={font}")
    text_filters = ["drawtext=" + ":".join(primary_text_parts)]

    if subtitle:
        sub_parts = [
            f"textfile={subtitle_file.name}",
            f"fontsize={subtitle_size}",
            f"fontcolor={BRAND_COPPER}",
            "x=(w-text_w)/2",
            f"y={subtitle_y}",
        ]
        if font:
            sub_parts.insert(1, f"fontfile={font}")
        text_filters.append("drawtext=" + ":".join(sub_parts))

    if footer:
        foot_parts = [
            f"textfile={footer_file.name}",
            f"fontsize={footer_size}",
            f"fontcolor={BRAND_COPPER}",
            "x=(w-text_w)/2",
            f"y={footer_y}",
        ]
        if font:
            foot_parts.insert(1, f"fontfile={font}")
        text_filters.append("drawtext=" + ":".join(foot_parts))

    # === Logo composite ===
    # If logo provided, download and overlay it
    logo_path = None
    if logo_local:
        cand = Path(logo_local)
        if not cand.is_absolute():
            cand = REPO_ROOT / logo_local
        if cand.exists():
            logo_path = work_dir / "wolf_logo.png"
            shutil.copyfile(cand, logo_path)
        else:
            print(f"[warn] end card logo not found: {cand}", flush=True)
    if logo_path is None and logo_url:
        try:
            logo_path = work_dir / "wolf_logo.png"
            download(logo_url, logo_path)
        except Exception as e:
            print(f"[warn] logo download failed: {e}", flush=True)
            logo_path = None

    if logo_path and logo_path.exists():
        # Two-input filter graph: [0] = black bg video, [1] = scaled logo, overlay
        filter_complex_parts = [
            # Scale logo to target size, preserve aspect, keep alpha
            f"[1:v]scale={logo_target}:{logo_target}:force_original_aspect_ratio=decrease[logo]",
            # Apply pinstripe + text on background video
            "[0:v]" + ",".join(pinstripe_filters + text_filters) + "[bg]",
            # Overlay logo on top
            f"[bg][logo]overlay=x={logo_x}:y={logo_y}:format=auto[out]",
        ]
        filter_complex = ";".join(filter_complex_parts)

        run_ffmpeg([
            "-f", "lavfi",
            "-i", f"color=c={BRAND_BLACK}:s={OUT_W}x{OUT_H}:r={FPS}:d={duration}",
            "-i", str(logo_path),
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-t", str(duration),
            "-r", str(FPS),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "20",
            "-an",
            str(out_path)
        ], label="end_frame (with logo)", cwd=str(work_dir))
    else:
        # No logo: skip the overlay step
        vf = ",".join(pinstripe_filters + text_filters)
        run_ffmpeg([
            "-f", "lavfi",
            "-i", f"color=c={BRAND_BLACK}:s={OUT_W}x{OUT_H}:r={FPS}:d={duration}",
            "-vf", vf,
            "-t", str(duration),
            "-r", str(FPS),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "20",
            "-an",
            str(out_path)
        ], label="end_frame (no logo)", cwd=str(work_dir))

    return out_path


def concat_clips(clips, out_path):
    """Concat clips using the concat demuxer (no transitions)."""
    list_path = out_path.parent / "concat_list.txt"
    with open(list_path, "w") as f:
        for c in clips:
            abs_path = str(Path(c).resolve())
            f.write(f"file '{abs_path}'\n")
    run_ffmpeg([
        "-f", "concat", "-safe", "0",
        "-i", str(list_path),
        "-c", "copy",
        str(out_path)
    ], label="concat")
    return out_path


def mix_audio(video_path, music_path, total_duration, out_path):
    """Mix in background music with fade in/out."""
    fade_out_start = max(0, total_duration - 1.0)
    af = (
        f"atrim=0:{total_duration},"
        f"afade=t=in:st=0:d=0.5,"
        f"afade=t=out:st={fade_out_start}:d=1.0,"
        f"volume=0.7"
    )
    run_ffmpeg([
        "-i", str(video_path),
        "-i", str(music_path),
        "-filter_complex", f"[1:a]{af}[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        "-movflags", "+faststart",
        str(out_path)
    ], label="mix_audio")
    return out_path


def finalize_video(src_path, out_path):
    """Re-encode to IG-friendly H.264 with faststart."""
    run_ffmpeg([
        "-i", str(src_path),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "20",
        "-an",
        "-movflags", "+faststart",
        str(out_path)
    ], label="finalize")
    return out_path


def render_v1(brief, output):
    """The July pipeline, unchanged."""
    work = Path(tempfile.mkdtemp(prefix="wgreel-"))
    print(f"[work] {work}", flush=True)
    clips_dir = work / "clips"; clips_dir.mkdir()

    # Render each clip
    rendered_clips = []
    # Cache source downloads keyed by URL - multiple clips can share one video file
    src_cache = {}
    for i, clip in enumerate(brief["clips"]):
        src_url = clip["source_url"]
        if src_url in src_cache:
            src_path = src_cache[src_url]
            print(f"[clip {i}] reusing cached source: {src_path.name}", flush=True)
        else:
            ext = Path(src_url).suffix.split("?")[0] or ".bin"
            src_path = clips_dir / f"src_{i}{ext}"
            download(src_url, src_path)
            src_cache[src_url] = src_path

        base_path = clips_dir / f"clip_{i}_base.mp4"
        if clip["kind"] == "photo":
            make_photo_clip(src_path, clip["duration"], clip.get("motion", "zoom_in"), base_path)
        elif clip["kind"] == "video":
            make_video_clip(src_path, clip["duration"], clip.get("motion", "static"), base_path)
        elif clip["kind"] == "video_segment":
            # Pull start_time + segment_duration; fall back to duration if either is missing
            start_time = float(clip.get("start_time", 0))
            seg_dur    = float(clip.get("segment_duration", clip.get("duration", 4.0)))
            make_video_segment_clip(src_path, start_time, seg_dur, base_path)
            # Ensure clip["duration"] is set for downstream timing/concat math
            clip["duration"] = seg_dur
        else:
            raise SystemExit(f"Unknown clip kind: {clip['kind']}")

        # Apply text overlays (sequentially)
        current = base_path
        for j, overlay in enumerate(clip.get("text_overlays", [])):
            next_path = clips_dir / f"clip_{i}_overlay_{j}.mp4"
            add_text_overlay(
                current,
                overlay["text"],
                overlay.get("position", "middle"),
                overlay.get("start", 0),
                overlay.get("hold", clip["duration"]),
                overlay.get("size", "medium"),
                next_path,
                style=overlay.get("style", "primary")
            )
            current = next_path
        rendered_clips.append(current)

    # Concat
    concat_path = work / "concat.mp4"

    # If end_frame spec is present, generate it and append
    end_frame_spec = brief.get("end_frame")
    if end_frame_spec:
        end_path = work / "end_frame.mp4"
        make_end_frame(end_frame_spec, end_path)
        rendered_clips.append(end_path)

    concat_clips(rendered_clips, concat_path)

    total_duration = sum(c["duration"] for c in brief["clips"])
    if end_frame_spec:
        total_duration += end_frame_spec.get("duration", 2.5)

    final = Path(output)
    final.parent.mkdir(parents=True, exist_ok=True)

    # Music
    music_url = brief.get("music_url")
    if music_url:
        try:
            music_path = work / "music.bin"
            download(music_url, music_path)
            mix_audio(concat_path, music_path, total_duration, final)
        except Exception as e:
            print(f"[warn] music failed ({e}), continuing without music", flush=True)
            finalize_video(concat_path, final)
    else:
        finalize_video(concat_path, final)

    sz = final.stat().st_size
    print(f"[done] {final} ({sz/1024/1024:.1f}MB, {total_duration:.1f}s)", flush=True)
    return final


# =====================================================================================
# v2 PATH - segments, transitions, spec-driven motion, subject safety
# =====================================================================================

# Transition library. Every entry maps to an ffmpeg xfade transition plus the duration
# that reads right for it. "cut" is the absence of a transition and is handled separately.
#
# Naming is John-facing on purpose: whip_left reads like what it looks like, not like
# "smoothleft". A whip is a fast directional smear; ffmpeg's smoothleft at ~0.2s is the
# closest honest approximation without a custom shader.
TRANSITIONS = {
    "cut":        (None,          0.0),
    "crossfade":  ("fade",        0.40),
    "dissolve":   ("dissolve",    0.45),
    "fade_black": ("fadeblack",   0.50),
    "slide_left": ("slideleft",   0.40),
    "slide_right":("slideright",  0.40),
    "slide_up":   ("slideup",     0.40),
    "slide_down": ("slidedown",   0.40),
    "whip_left":  ("smoothleft",  0.20),
    "whip_right": ("smoothright", 0.20),
    "whip_up":    ("smoothup",    0.20),
    "whip_down":  ("smoothdown",  0.20),
    "blur":       ("hblur",       0.35),
    "push_in":    ("zoomin",      0.45),
}


def transition_of(spec):
    """(xfade_name | None, duration). Anything unknown is a loud abort, not a silent cut."""
    if not spec:
        return None, 0.0
    if isinstance(spec, str):
        spec = {"type": spec}
    t = spec.get("type", "cut")
    if t not in TRANSITIONS:
        raise RenderAbort(
            f"unknown transition {t!r}. Known: {', '.join(sorted(TRANSITIONS))}"
        )
    name, default_d = TRANSITIONS[t]
    d = float(spec.get("duration", default_d))
    if name is None:
        return None, 0.0
    if d <= 0:
        return None, 0.0
    return name, d


def probe_media(path):
    """Width, height and duration without ffprobe.

    imageio-ffmpeg ships ffmpeg only, so this reads what `ffmpeg -i` prints to stderr.
    Rotation matters: phone clips carry a display matrix, and the coded WxH is
    pre-rotation. Getting this wrong makes the no-upscale guard measure the wrong side.
    """
    r = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-i", str(path)],
        capture_output=True, text=True, errors="replace",
    )
    err = r.stderr or ""
    m = re.search(r"Video:.*?[\s,](\d{2,5})x(\d{2,5})", err)
    if not m:
        raise RenderAbort(f"could not read a video stream out of {path}")
    w, h = int(m.group(1)), int(m.group(2))
    rot = 0.0
    mr = re.search(r"rotation of ([-\d.]+) degrees", err)
    if mr:
        rot = abs(float(mr.group(1))) % 180.0
    if 45.0 < rot < 135.0:
        w, h = h, w
    dur = None
    md = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    if md:
        dur = int(md.group(1)) * 3600 + int(md.group(2)) * 60 + float(md.group(3))
    return {"w": w, "h": h, "duration": dur, "rotation": rot}


_INDEX_CACHE = None


def media_index():
    global _INDEX_CACHE
    if _INDEX_CACHE is not None:
        return _INDEX_CACHE
    idx = {}
    p = Path(MEDIA_INDEX)
    if p.exists():
        with open(p, encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                idx[row.get("id", "")] = row
    _INDEX_CACHE = idx
    return idx


def resolve_still(seg):
    """Resolve a still segment to an on-disk ORIGINAL, enforcing BRD-005.

    Order: "asset" through the media index (preferred - it gets the full-resolution
    original, never a downscaled _sources copy), then a literal "src" path.
    """
    asset = seg.get("asset")
    if asset:
        row = media_index().get(asset)
        if not row:
            raise RenderAbort(
                f"asset {asset!r} is not in the media index ({MEDIA_INDEX}). "
                f"Use an id from that file, or pass an explicit 'src'."
            )
        tag = (row.get("content_tag") or "").strip().lower()
        if tag in BANNED_TAGS:
            raise RenderAbort(
                f"BRD-005: asset {asset!r} is tagged {tag!r}. Resale and personal media "
                f"never enter a Wolf's Garage render."
            )
        path = row.get("win_path") or ""
        if not path or not os.path.exists(path):
            raise RenderAbort(f"asset {asset!r} indexed at {path!r}, which is not on disk")
        return path, row
    src = seg.get("src")
    if src:
        cand = Path(src)
        if not cand.is_absolute():
            cand = REPO_ROOT / src
        if cand.exists():
            return str(cand), None
        raise RenderAbort(f"still src {src!r} does not exist")
    raise RenderAbort(f"still segment has neither 'asset' nor 'src': {seg!r}")


def resolve_clip(seg):
    src = seg.get("src")
    if not src:
        raise RenderAbort(f"clip segment has no 'src': {seg!r}")
    if re.match(r"^https?:", src, re.I):
        return src, True
    cand = Path(src)
    if not cand.is_absolute():
        cand = REPO_ROOT / src
    if not cand.exists():
        raise RenderAbort(f"clip src {src!r} does not exist (looked at {cand})")
    return str(cand), False


# -------------------------------------------------------------- overlays and frame

def overlay_filters(ov, seg_index, ov_index, work, seg_duration):
    """Build the drawbox+drawtext filters for one overlay.

    Same pinstripe plate the photo posts use: translucent black bar, red+bone hairlines
    top and bottom, Bebas caps inside. Copper is available but only ever as TEXT.

    Filenames stay RELATIVE because ffmpeg is run with cwd=work: a Windows absolute path
    inside a filter string means drawtext tries to parse "C:" as an option separator.
    """
    text = str(ov.get("text", "")).strip()
    if not text:
        return []
    lines = text.split("\n")
    n_lines = len(lines)
    longest = max(lines, key=len)

    requested = SIZE_MAP.get(ov.get("size", "medium"), 88)
    fontsize = autofit_fontsize(longest, requested)

    line_h_factor = 1.18
    text_block_h = int(fontsize * line_h_factor * n_lines)
    pad_v = max(28, int(fontsize * 0.32))
    plate_h = text_block_h + (pad_v * 2)

    position = ov.get("position", "lower")
    if position == "upper":
        plate_y = int(OUT_H * 0.12)
    elif position == "lower":
        plate_y = int(OUT_H * 0.80) - plate_h // 2
    else:
        plate_y = (OUT_H - plate_h) // 2

    style = ov.get("style", "primary")
    textcolor = BRAND_COPPER if style == "accent" else BRAND_BONE

    txt_name = f"ov_{seg_index}_{ov_index}.txt"
    (work / txt_name).write_text(text, encoding="utf-8")

    font = named_font(ov.get("font", "bebas"))
    font_name = None
    if font:
        font_name = f"font_{font.stem}{font.suffix}"
        dest = work / font_name
        if not dest.exists():
            shutil.copyfile(font, dest)

    start = float(ov.get("start", 0.0))
    hold = float(ov.get("hold", max(0.1, seg_duration - start)))
    end = min(start + hold, seg_duration)
    en = f"enable='between(t,{start:.3f},{end:.3f})'"

    red_thick, bone_thick, gap = 3, 2, 3
    plate_bottom = plate_y + plate_h

    out = [
        f"drawbox=x=0:y={plate_y}:w=iw:h={plate_h}:color={BRAND_BLACK}@0.72:t=fill:{en}",
        f"drawbox=x=0:y={plate_y}:w=iw:h={red_thick}:color={BRAND_RED}:t=fill:{en}",
        f"drawbox=x=0:y={plate_y + red_thick + gap}:w=iw:h={bone_thick}:color={BRAND_BONE}:t=fill:{en}",
        f"drawbox=x=0:y={plate_bottom - red_thick}:w=iw:h={red_thick}:color={BRAND_RED}:t=fill:{en}",
        f"drawbox=x=0:y={plate_bottom - red_thick - gap - bone_thick}:w=iw:h={bone_thick}:color={BRAND_BONE}:t=fill:{en}",
    ]
    parts = [f"textfile={txt_name}"]
    if font_name:
        parts.append(f"fontfile={font_name}")
    parts += [
        f"fontsize={fontsize}",
        f"fontcolor={textcolor}",
        "x=(w-text_w)/2",
        f"y={plate_y}+({plate_h}-text_h)/2",
        en,
    ]
    out.append("drawtext=" + ":".join(parts))
    print(f"    overlay[{ov_index}] {fontsize}px {style} {position} "
          f"t={start:.2f}-{end:.2f}s  {text!r}", flush=True)
    return out


def frame_filters(frame_name, box=None):
    """The photo law's thin frame, drawn as two rectangle outlines.

    box defaults to the whole 1080x1920 canvas. Letterboxed clips pass the video window
    instead, so the hairlines sit on the picture the way they do on a photo post rather
    than floating out at the edge of a black field.
    """
    d = FRAMES.get(frame_name if frame_name in FRAMES else DEFAULT_FRAME)
    if not d:
        return []
    bx, by, bw, bh = box or (0, 0, OUT_W, OUT_H)
    m, sr, g1, sb, g2 = d["m_out"], d["s_red"], d["g1"], d["s_bone"], d["g2"]
    inset = m + sr + g1 + sb + g2
    b = m + sr + g1
    return [
        # The bands float on a BLACK margin, exactly like a photo post, where the picture is
        # drawn inset and the frame lives in the black around it. Without this the picture
        # bleeds past the hairlines to the edge of the reel and the frame stops reading as
        # a frame - it reads as two stripes lying on a photo.
        f"drawbox=x={bx}:y={by}:w={bw}:h={bh}:color={BRAND_BLACK}:t={inset}",
        f"drawbox=x={bx + m}:y={by + m}:w={bw - 2*m}:h={bh - 2*m}:"
        f"color={BRAND_RED}:t={sr}",
        f"drawbox=x={bx + b}:y={by + b}:w={bw - 2*b}:h={bh - 2*b}:"
        f"color={BRAND_BONE}:t={sb}",
    ]


# -------------------------------------------------------------- motion on stills

def _kf(motion, which, default_zoom):
    kf = (motion or {}).get(which) or {}
    return (
        max(1.0, float(kf.get("zoom", default_zoom))),
        float(kf.get("focus_x", 0.5)),
        float(kf.get("focus_y", 0.5)),
    )


def window_at(sw, sh, z, fx, fy):
    """The visible 9:16 window in ORIGINAL pixel coords.

    ZOOM SEMANTICS: z = 1.0 puts the full height of the source in frame. z = 2.0 shows half
    of it. Width follows from 9:16. This is what makes panoramas work - a 16320x7532 pano at
    z=1 shows a 4237px-wide slice, and focus_x can walk that slice the whole way across the
    picture. The old "fraction of a pre-cut 9:16 plate" reading could not travel at all.
    """
    win_h = sh / max(1e-6, z)
    win_w = win_h * (OUT_W / OUT_H)
    if win_w > sw:
        win_w = sw
        win_h = win_w * (OUT_H / OUT_W)
    x0 = (sw - win_w) * min(1.0, max(0.0, fx))
    y0 = (sh - win_h) * min(1.0, max(0.0, fy))
    return x0, y0, win_w, win_h


def check_subject_safety(seg, sub, sw, sh, keyframes, label):
    """The don't-decapitate-the-car law.

    `sub` is the subject box in ORIGINAL normalised coords. At each motion keyframe:

      1. VERTICAL CONTAINMENT. The subject's top and bottom both sit inside the window.
         A car whose roof or wheels leave the frame is the exact failure John called out.
      2. HORIZONTAL PRESENCE. The subject covers at least min_subject_cover (default 0.5)
         of the window width, so a pan travels ALONG the subject instead of drifting off
         into grass and sky.
    """
    if not sub:
        print(f"  WARN  {label}: no 'subject' box - motion is unverified. Add one so the "
              f"crop law can be enforced.", flush=True)
        return
    allow = bool(seg.get("allow_unsafe_motion"))
    min_cover = float(seg.get("min_subject_cover", 0.5))
    sx0 = float(sub.get("x0", 0.0)) * sw
    sy0 = float(sub.get("y0", 0.0)) * sh
    sx1 = float(sub.get("x1", 1.0)) * sw
    sy1 = float(sub.get("y1", 1.0)) * sh
    problems = []
    for name, (z, fx, fy) in keyframes:
        wx0, wy0, ww, wh = window_at(sw, sh, z, fx, fy)
        wx1, wy1 = wx0 + ww, wy0 + wh
        if (sy1 - sy0) > wh + 1.0:
            problems.append(
                f"{name}: subject is {sy1-sy0:.0f}px tall but the frame only shows "
                f"{wh:.0f}px at zoom {z:.2f} - it gets decapitated"
            )
        elif sy0 < wy0 - 1.0 or sy1 > wy1 + 1.0:
            problems.append(
                f"{name}: subject spans y {sy0:.0f}-{sy1:.0f} but the frame shows "
                f"{wy0:.0f}-{wy1:.0f} - top or bottom is cut off"
            )
        ox = max(0.0, min(sx1, wx1) - max(sx0, wx0))
        cover = ox / ww if ww > 0 else 0.0
        if cover < min_cover - 1e-6:
            problems.append(
                f"{name}: subject fills only {cover:.0%} of the frame width "
                f"(floor {min_cover:.0%}) - the pan is drifting off the subject"
            )
    if not problems:
        print("    subject-safe: every keyframe keeps it whole and filling the frame",
              flush=True)
        return
    msg = f"UNSAFE MOTION {label}: " + "; ".join(problems)
    if allow:
        print(f"  WARN  {msg} (allow_unsafe_motion=true)", flush=True)
        return
    raise RenderAbort(
        "ABORT " + msg + ". Move the focus, lower the zoom, or widen the subject box."
    )


def _ease(p, mode):
    if mode == "linear":
        return p
    return p * p * (3.0 - 2.0 * p)  # smoothstep: starts and stops soft


def make_still_segment(seg, index, work, frame_name):
    """Motion on a library still, with the no-upscale and subject-safety guards.

    The motion is cut in Pillow, frame by frame, rather than handed to ffmpeg's zoompan.
    Three reasons, all learned the hard way:
      * zoompan samples iw/zoom by ih/zoom, so it silently DISTORTS any input that is not
        already 9:16 - which rules out panning across a panorama.
      * zoompan rounds its crop origin to whole pixels every frame, which shimmers on slow
        pans.
      * cutting it here means the reel uses the SAME crop-to-fill maths as the photo posts
        (assemble.py crop_fill), so a still looks the same whether it lands in a carousel
        or a reel. One crop law, not two.
    """
    from PIL import Image, ImageOps

    src, row = resolve_still(seg)
    duration = float(seg.get("duration", 3.5))
    frames = max(2, int(round(duration * FPS)))
    label = f"still[{index}] {os.path.basename(src)}"
    print(f"  {label}  {duration:.2f}s", flush=True)
    if row and row.get("caption"):
        print(f"    library caption: {row['caption'][:110]}", flush=True)

    Image.MAX_IMAGE_PIXELS = None  # his panoramas are 120MP+ and that is not an attack
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    sw, sh = im.width, im.height

    motion = seg.get("motion") or {}
    z0, fx0, fy0 = _kf(motion, "from", 1.0)
    z1, fx1, fy1 = _kf(motion, "to", 1.0)
    easing = motion.get("easing", "ease")

    keyframes = [("from", (z0, fx0, fy0)), ("to", (z1, fx1, fy1))]

    # --- NO-UPSCALE GUARD: the tightest window must still carry 1080 real pixels ---
    tight = min(window_at(sw, sh, z, fx, fy)[2] for _, (z, fx, fy) in keyframes)
    if tight < OUT_W - 0.5:
        msg = (f"UPSCALE {label}: the tightest frame samples only {tight:.0f}px of source "
               f"width and has to fill {OUT_W}px. Source is {sw}x{sh}.")
        if not seg.get("allow_upscale"):
            raise RenderAbort("ABORT " + msg + " Lower the zoom or use a bigger original.")
        print(f"  WARN  {msg} (allow_upscale=true)", flush=True)

    check_subject_safety(seg, seg.get("subject"), sw, sh, keyframes, label)

    # --- per-frame windows ---
    wins = []
    for n in range(frames):
        p = _ease(n / (frames - 1), easing)
        z = z0 + (z1 - z0) * p
        fx = fx0 + (fx1 - fx0) * p
        fy = fy0 + (fy1 - fy0) * p
        wins.append(window_at(sw, sh, z, fx, fy))

    # --- crop the union once at native resolution, then downscale ONCE ---
    ux0 = max(0.0, min(w[0] for w in wins))
    uy0 = max(0.0, min(w[1] for w in wins))
    ux1 = min(float(sw), max(w[0] + w[2] for w in wins))
    uy1 = min(float(sh), max(w[1] + w[3] for w in wins))
    union = im.crop((int(ux0), int(uy0), int(math.ceil(ux1)), int(math.ceil(uy1))))
    im.close()

    supersample = float(seg.get("supersample", 1.25))
    k = min(1.0, (OUT_W * supersample) / max(1.0, tight))
    if k < 1.0:
        union = union.resize(
            (max(1, int(round(union.width * k))), max(1, int(round(union.height * k)))),
            Image.LANCZOS,
        )
    print(f"    source {sw}x{sh} -> union {int(ux1-ux0)}x{int(uy1-uy0)} -> working "
          f"{union.width}x{union.height} (x{k:.3f}); zoom {z0:.2f}->{z1:.2f}, "
          f"focus ({fx0:.2f},{fy0:.2f})->({fx1:.2f},{fy1:.2f}), ease={easing}", flush=True)

    frames_dir = work / f"f{index}"
    frames_dir.mkdir(exist_ok=True)
    for n, (wx, wy, ww, wh) in enumerate(wins):
        bx0 = (wx - ux0) * k
        by0 = (wy - uy0) * k
        bx1 = bx0 + ww * k
        by1 = by0 + wh * k
        # clamp inside the working image; sub-pixel drift at the edges otherwise crops black
        bx0 = max(0.0, min(bx0, union.width - 1.0))
        by0 = max(0.0, min(by0, union.height - 1.0))
        bx1 = max(bx0 + 1.0, min(bx1, float(union.width)))
        by1 = max(by0 + 1.0, min(by1, float(union.height)))
        union.resize((OUT_W, OUT_H), Image.LANCZOS, box=(bx0, by0, bx1, by1)).save(
            frames_dir / f"{n:05d}.jpg", quality=96, subsampling=0
        )
    union.close()

    chain = ["setsar=1"]
    for j, ov in enumerate(seg.get("overlays") or []):
        chain += overlay_filters(ov, index, j, work, duration)
    chain += frame_filters(frame_name)

    out_name = f"seg_{index}.mp4"
    run_ffmpeg([
        "-framerate", str(FPS),
        "-i", f"f{index}/%05d.jpg",
        "-vf", ",".join(chain),
        "-r", str(FPS),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "17",
        "-an",
        out_name,
    ], label=f"still_segment[{index}]", cwd=str(work))
    return work / out_name, frames / FPS


def make_clip_segment(seg, index, work, frame_name):
    """A trimmed piece of his phone footage, cropped to 9:16 on a spec-driven focus."""
    src, is_url = resolve_clip(seg)
    if is_url:
        local = work / f"src_{index}{Path(src).suffix.split('?')[0] or '.mp4'}"
        download(src, local)
        src = str(local)

    info = probe_media(src)
    trim = seg.get("trim") or {}
    t_in = float(trim.get("in", 0.0))
    if "out" in trim:
        t_out = float(trim["out"])
        duration = t_out - t_in
    else:
        duration = float(seg.get("duration", 4.0))
        t_out = t_in + duration
    if duration <= 0:
        raise RenderAbort(f"clip[{index}] trim is {t_in}->{t_out}, which is not a clip")
    if info["duration"] is not None and t_out > info["duration"] + 0.05:
        raise RenderAbort(
            f"clip[{index}] trim runs to {t_out:.2f}s but {os.path.basename(src)} is only "
            f"{info['duration']:.2f}s long"
        )

    label = f"clip[{index}] {os.path.basename(src)}"
    print(f"  {label}  {t_in:.2f}->{t_out:.2f}s ({duration:.2f}s) "
          f"src {info['w']}x{info['h']}", flush=True)

    # --- fit mode ---------------------------------------------------------------
    # "fill"    crops the frame to 9:16 edge to edge. Only honest when he shot vertical.
    # "contain" cuts the frame to "crop_to" at NATIVE resolution, then sits that window on
    #           the brand black field. THIS IS THE ONE FOR LANDSCAPE FOOTAGE. Every clip in
    #           temp/reel-source is 1920x1080 on playback, so "fill" would blow it up 1.78x
    #           and ship exactly the soft render the guard exists to stop. Squaring it off
    #           first (crop_to 1.0) keeps a 1080x1080 window at 1:1 - no upscale anywhere,
    #           and the window still owns 56% of the reel instead of the 32% a plain
    #           letterbox would leave.
    fit = seg.get("fit", "fill")
    if fit not in ("fill", "contain"):
        raise RenderAbort(f"unknown fit {fit!r} (fill | contain)")

    crop = seg.get("crop") or {}
    cfx = float(crop.get("focus_x", 0.5))
    cfy = float(crop.get("focus_y", 0.5))

    sw, sh = info["w"], info["h"]
    pre = []
    cw, ch = float(sw), float(sh)
    crop_to = seg.get("crop_to")
    if fit == "contain" and crop_to:
        r = float(crop_to)
        cw = min(sw, sh * r)
        ch = min(sh, sw / r)
        pre.append(
            f"crop={int(cw)}:{int(ch)}:(in_w-{int(cw)})*{cfx:.4f}:(in_h-{int(ch)})*{cfy:.4f}"
        )

    if fit == "fill":
        scale = max(OUT_W / cw, OUT_H / ch)
    else:
        scale = min(OUT_W / cw, OUT_H / ch)

    # --- NO-UPSCALE GUARD ---
    if scale > 1.001:
        msg = (f"UPSCALE {label}: source {sw}x{sh} (window {int(cw)}x{int(ch)}) has to be "
               f"blown up {scale:.2f}x for fit={fit} at {OUT_W}x{OUT_H}.")
        if not seg.get("allow_upscale"):
            hint = (' Shoot vertical, or use "fit":"contain" with "crop_to":1.0.'
                    if fit == "fill" else " Use a bigger clip or a wider crop_to.")
            raise RenderAbort("ABORT " + msg + hint)
        print(f"  WARN  {msg} (allow_upscale=true)", flush=True)

    frame_box = None
    if fit == "fill":
        chain = [
            f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase",
            f"crop={OUT_W}:{OUT_H}:(in_w-{OUT_W})*{cfx:.4f}:(in_h-{OUT_H})*{cfy:.4f}",
        ]
    else:
        backdrop = seg.get("backdrop", "black")
        if backdrop not in ("black", "blur"):
            raise RenderAbort(f"unknown backdrop {backdrop!r} (black | blur)")
        place_y = float(seg.get("place_y", 0.32))
        vw = int(round(cw * scale)) // 2 * 2
        vh = int(round(ch * scale)) // 2 * 2
        vx = (OUT_W - vw) // 2
        vy = int(round((OUT_H - vh) * place_y))
        frame_box = (vx, vy, vw, vh)
        fitted = f"scale={vw}:{vh}"
        if backdrop == "black":
            chain = pre + [
                fitted,
                f"pad={OUT_W}:{OUT_H}:{vx}:{vy}:color={BRAND_BLACK}",
            ]
        else:
            # the clip's own frame, blown up and thrown out of focus behind itself
            chain = pre + [
                f"split=2[bg][fg];"
                f"[bg]scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,"
                f"crop={OUT_W}:{OUT_H},gblur=sigma=40,eq=brightness=-0.18[bgb];"
                f"[fg]{fitted}[fgs];[bgb][fgs]overlay={vx}:{vy}",
            ]
        print(f"    window {vw}x{vh} at ({vx},{vy}) on {backdrop}, scale {scale:.3f}",
              flush=True)
    chain += [
        "setsar=1",
        f"fps={FPS}",
    ]
    # overlays first, frame last - same stacking order as renderSlide() on the photo side,
    # so the hairlines always sit on top of the hook plate rather than under it
    for j, ov in enumerate(seg.get("overlays") or []):
        chain += overlay_filters(ov, index, j, work, duration)
    chain += frame_filters(frame_name, frame_box)

    out_name = f"seg_{index}.mp4"
    run_ffmpeg([
        "-ss", f"{t_in:.3f}",
        "-i", src,
        "-t", f"{duration:.3f}",
        "-vf", ",".join(chain),
        "-r", str(FPS),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "17",
        "-an",
        out_name,
    ], label=f"clip_segment[{index}]", cwd=str(work))
    # -ss/-t is keyframe- and frame-rounded; measure what actually landed
    real = probe_media(work / out_name)
    return work / out_name, (real["duration"] or duration)


def join_segments(paths, durations, transitions, work, out_name):
    """Stitch the segments into one timeline, honouring the transition between each pair.

    Built as a single filter_complex so the whole thing is one encode: a cut is a concat,
    anything else is an xfade whose offset is "however long the timeline is so far, minus
    the overlap". Getting that offset wrong is how you get a black flash mid-reel, so the
    running total is tracked explicitly rather than inferred.
    """
    n = len(paths)
    if n == 0:
        raise RenderAbort("nothing to join")
    inputs = []
    for p in paths:
        inputs += ["-i", Path(p).name]

    graph = []
    for i in range(n):
        # xfade refuses a variable frame rate ("current rate of 1/0 is invalid"), and a
        # segment cut with -ss/-t arrives with an inherited timebase. Force CFR and a
        # common timebase on every input before anything touches it.
        # ORDER MATTERS. setpts wipes the link's frame rate, so fps has to come AFTER it or
        # xfade rejects the input with "current rate of 1/0 is invalid". settb first pins a
        # common timebase across segments that were cut with different -ss/-t.
        graph.append(
            f"[{i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps={FPS},format=yuv420p[v{i}]"
        )

    cur = "v0"
    total = durations[0]
    for i in range(1, n):
        name, d = transitions[i]
        nxt = f"j{i}"
        if name is None:
            graph.append(f"[{cur}][v{i}]concat=n=2:v=1:a=0[{nxt}]")
            total += durations[i]
        else:
            d = min(d, durations[i - 1] * 0.6, durations[i] * 0.6)
            offset = total - d
            if offset <= 0:
                raise RenderAbort(
                    f"transition into segment {i} ({d:.2f}s) does not fit the "
                    f"{total:.2f}s of timeline before it"
                )
            graph.append(
                f"[{cur}][v{i}]xfade=transition={name}:duration={d:.3f}:"
                f"offset={offset:.3f}[{nxt}]"
            )
            total += durations[i] - d
        cur = nxt

    run_ffmpeg(
        inputs + [
            "-filter_complex", ";".join(graph),
            "-map", f"[{cur}]",
            "-r", str(FPS),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "slow",
            # CRF 18, not 20: this is the master. The brand hairlines are the thinnest thing
            # in frame and they are the first casualty of a loose rate. IG re-encodes on
            # upload regardless, so a cleaner master is the only lever we own.
            "-crf", "18",
            "-an",
            "-movflags", "+faststart",
            out_name,
        ],
        label=f"join ({n} segments)", cwd=str(work),
    )
    return work / out_name, total


def make_poster(video_path, at, out_path):
    """The still the approval page shows before John hits play."""
    run_ffmpeg([
        "-ss", f"{max(0.0, float(at)):.3f}",
        "-i", str(video_path),
        "-frames:v", "1",
        "-q:v", "3",
        str(out_path),
    ], label="poster")
    return out_path


def render_v2(brief, output):
    work = Path(tempfile.mkdtemp(prefix="wgreel2-"))
    print(f"[work] {work}", flush=True)
    frame_name = brief.get("frame", DEFAULT_FRAME)
    if frame_name not in FRAMES:
        raise RenderAbort(f"unknown frame {frame_name!r}; expected one of {sorted(FRAMES)}")

    segments = brief.get("segments") or []
    if not segments:
        raise RenderAbort("v2 brief has no segments")

    paths, durations, transitions = [], [], []
    for i, seg in enumerate(segments):
        kind = seg.get("kind", "still")
        if kind in ("still", "photo"):
            p, dur = make_still_segment(seg, i, work, frame_name)
        elif kind in ("clip", "video", "video_segment"):
            p, dur = make_clip_segment(seg, i, work, frame_name)
        else:
            raise RenderAbort(f"unknown segment kind {kind!r} (still | clip)")
        paths.append(p)
        durations.append(dur)
        transitions.append(transition_of(seg.get("transition_in")) if i else (None, 0.0))

    end_spec = brief.get("end_card") or brief.get("end_frame")
    if end_spec:
        end_path = work / f"seg_{len(paths)}.mp4"
        make_end_frame(end_spec, end_path, work_dir=work)
        end_dur = float(end_spec.get("duration", 2.5))
        # NO outer frame on the end card by default. The shared photo end card
        # (renders/posts/_shared/end-card.jpg) carries its own inner red+bone box and no
        # canvas-edge frame at any aspect, and the brand gate called out a reel end card
        # that grew one. Opt back in with "frame": true if a spec ever wants it.
        if end_spec.get("frame") and frame_filters(frame_name):
            framed = work / f"seg_{len(paths)}f.mp4"
            run_ffmpeg([
                "-i", end_path.name,
                "-vf", ",".join(frame_filters(frame_name)),
                "-r", str(FPS),
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-preset", "medium", "-crf", "17", "-an",
                framed.name,
            ], label="end_card frame", cwd=str(work))
            end_path = framed
        paths.append(end_path)
        durations.append(end_dur)
        transitions.append(transition_of(
            end_spec.get("transition_in") or {"type": "crossfade", "duration": 0.5}
        ))

    joined, total = join_segments(paths, durations, transitions, work, "joined.mp4")

    final = Path(output)
    final.parent.mkdir(parents=True, exist_ok=True)

    music_url = brief.get("music_url")
    if music_url:
        try:
            music_path = work / "music.bin"
            download(music_url, music_path)
            mix_audio(joined, music_path, total, final)
        except Exception as e:
            print(f"[warn] music failed ({e}), continuing without music", flush=True)
            shutil.copyfile(joined, final)
    else:
        shutil.copyfile(joined, final)

    poster = final.with_suffix(".jpg")
    make_poster(final, brief.get("poster_at", min(0.6, total / 2)), poster)

    sz = final.stat().st_size
    print(f"[done] {final} ({sz/1024/1024:.1f}MB, {total:.1f}s, {len(paths)} segments)",
          flush=True)
    print(f"[poster] {poster}", flush=True)
    return final


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--brief", required=True, help="Path to JSON brief")
    p.add_argument("--output", required=True, help="Output MP4 path")
    args = p.parse_args()

    with open(args.brief, encoding="utf-8") as f:
        brief = json.load(f)

    try:
        if brief.get("segments"):
            render_v2(brief, args.output)
        else:
            render_v1(brief, args.output)
    except RenderAbort as e:
        print(f"\nRENDER ABORTED\n{e}\n", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()

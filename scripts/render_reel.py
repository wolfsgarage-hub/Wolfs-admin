#!/usr/bin/env python3
"""
Wolf's Garage Reel Renderer
Takes a JSON brief, outputs a 9:16 MP4 ready for Instagram Reels.

Brief format (JSON):
{
  "duration_total": 14,
  "music_url": "https://example.com/track.mp3",  // optional
  "clips": [
    {
      "kind": "photo",         // or "video"
      "source_url": "https://...",
      "duration": 4.0,
      "motion": "zoom_in",     // zoom_in, zoom_out, pan_left, pan_right, static
      "text_overlays": [
        {
          "text": "BUILT NOT BOUGHT",
          "position": "lower", // upper, middle, lower
          "start": 0.5,        // seconds from clip start
          "hold": 2.5,
          "size": "large"      // small, medium, large, huge
        }
      ]
    }
  ]
}
"""

import argparse, json, os, subprocess, sys, tempfile, urllib.request
from pathlib import Path

OUT_W, OUT_H = 1080, 1920  # 9:16 vertical (IG Reel)
FPS = 30

FONT_PATHS = [
    str(Path(__file__).parent / "fonts" / "BebasNeue-Regular.ttf"),
    str(Path(__file__).parent / "fonts" / "Oswald-Bold.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

# Wolf's Garage brand colors per HARD RULES
BRAND_BONE = "#F5F1E8"     # primary text
BRAND_RED = "#CC0000"      # accent border
BRAND_BLACK = "#0A0A0A"    # bg / shadow
BRAND_COPPER = "#C8922A"   # text-only accent

def find_font():
    for p in FONT_PATHS:
        if os.path.exists(p):
            return p
    return None

def download(url, dest):
    print(f"[download] {url}", flush=True)
    if url.startswith("file://"):
        urllib.request.urlretrieve(url, dest)
    else:
        req = urllib.request.Request(url, headers={"User-Agent": "WolfsGarageReelRenderer/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest

def run_ffmpeg(args, label="ffmpeg"):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-y"] + args
    print(f"[{label}] running...", flush=True)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FFMPEG STDERR:", r.stderr, file=sys.stderr)
        print("FFMPEG CMD:", " ".join(cmd[:25]), "...", file=sys.stderr)
        raise SystemExit(r.returncode)

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

# Per Bebas Neue's narrow geometry: width/height ratio ≈ 0.42 for caps
# Per Oswald Bold: ratio ≈ 0.55
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
        "primary_text": "WOLF'S GARAGE",
        "subtitle": "PDX HOT ROD APPAREL",
        "footer": "WOLF'S GARAGE LLC · PORTLAND, OREGON · GET BACK IN THE GARAGE."
      }
    """
    duration = end_frame_spec.get("duration", 2.5)
    logo_url = end_frame_spec.get("logo_url")
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
    primary_file = work_dir / "endf_primary.txt"
    primary_file.write_text(primary, encoding="utf-8")
    subtitle_file = work_dir / "endf_subtitle.txt"
    subtitle_file.write_text(subtitle or "", encoding="utf-8")
    footer_file = work_dir / "endf_footer.txt"
    footer_file.write_text(footer or "", encoding="utf-8")

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
        f"textfile={primary_file}",
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
            f"textfile={subtitle_file}",
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
            f"textfile={footer_file}",
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
    if logo_url:
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
        ], label="end_frame (with logo)")
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
        ], label="end_frame (no logo)")

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

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--brief", required=True, help="Path to JSON brief")
    p.add_argument("--output", required=True, help="Output MP4 path")
    args = p.parse_args()

    with open(args.brief) as f:
        brief = json.load(f)

    work = Path(tempfile.mkdtemp(prefix="wgreel-"))
    print(f"[work] {work}", flush=True)
    clips_dir = work / "clips"; clips_dir.mkdir()

    # Render each clip
    rendered_clips = []
    # Cache source downloads keyed by URL — multiple clips can share one video file
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

    final = Path(args.output)
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

if __name__ == "__main__":
    main()

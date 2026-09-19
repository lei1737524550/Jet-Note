import subprocess
from pathlib import Path

video = Path("/storage/emulated/0/DCIM/ScreenRecorder/Screenrecorder-2026-09-19-13-59-41-19.mp4")
output = video.parent / f"{video.stem}_frames"

output.mkdir(parents=True, exist_ok=True)

subprocess.run([
    "ffmpeg",
    "-hide_banner",
    "-y",
    "-i", str(video),
    "-vsync", "0",
    str(output / "frame_%06d.png")
], check=True)

print(f"完成：{output}")

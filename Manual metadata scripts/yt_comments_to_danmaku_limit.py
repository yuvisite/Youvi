"""
   Youvi Player - Copyright (C) 2026 Yuvisite 
   This program is free software: you can redistribute it and/or modify 
   it under the terms of the GNU General Public License as published by 
   the Free Software Foundation, either version 3 of the License, or 
   (at your option) any later version. 
  
   This program is distributed in the hope that it will be useful, 
   but WITHOUT ANY WARRANTY; without even the implied warranty of 
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the 
   GNU General Public License for more details. 
  
   You should have received a copy of the GNU General Public License 
   along with this program. If not, see <https://www.gnu.org/licenses/>.
"""
import json
import subprocess
import sys
import tempfile
import os
import re
import random
from time import time

def parse_timestamp(ts: str) -> float:
    parts = ts.split(":")
    try:
        parts = [int(p) for p in parts]
    except ValueError:
        return None
    if len(parts) == 3:
        h, m, s = parts
    elif len(parts) == 2:
        h, m, s = 0, parts[0], parts[1]
    elif len(parts) == 1:
        h, m, s = 0, 0, parts[0]
    else:
        return None
    return h * 3600 + m * 60 + s


def main():
    if len(sys.argv) < 2:
        print("Использование: python yt_comments_to_danmaku.py <ссылка_на_видео> [опции_yt-dlp]")
        sys.exit(1)

    url = sys.argv[1]
    extra_args = sys.argv[2:]
    tmpdir = tempfile.mkdtemp()

    print("📥 Скачивание комментариев через yt-dlp...")
    cmd = [
        "yt-dlp",
        "--write-comments",
        "--skip-download",
        "--no-warnings",
        "--extractor-args", "youtube:max_comments=10000,10000,0,0",
        "-o", os.path.join(tmpdir, "%(id)s.%(ext)s"),
        *extra_args,
        url
    ]
    subprocess.run(cmd, check=True)

    info_file = None
    for f in os.listdir(tmpdir):
        if f.endswith(".info.json"):
            info_file = os.path.join(tmpdir, f)
            break

    if not info_file:
        print("❌ yt-dlp не сохранил файл комментариев (возможно, у видео нет доступа к ним).")
        sys.exit(1)

    with open(info_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    comments = data.get("comments", [])
    print(f"🔍 Загружено комментариев: {len(comments)}")
    
    if len(comments) > 0:
        for i, c in enumerate(comments[:5]):
            print(f"  [{i}] {c.get('text', '')[:80]}")

    danmaku = []
    now_ms = int(time() * 1000)

    colors = ["#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff69b4"]
    
    time_pattern = re.compile(r"\b(\d{1,2}:\d{2}(?::\d{2})?)\b")

    for i, c in enumerate(comments):
        text = c.get("text", "")
        matches = time_pattern.findall(text)
        if not matches:
            continue

        ts = parse_timestamp(matches[0])
        if ts is None:
            continue

        clean_text = time_pattern.sub("", text).strip()

        color = random.choice(colors) if random.random() < 0.2 else "#ffffff"

        danmaku.append({
            "id": str(now_ms + i),
            "text": clean_text,
            "time": ts,
            "color": color,
            "size": "normal",
            "position": "scroll",
            "created": now_ms + i,
            "shown": False
        })

    print(f"✅ Найдено комментариев с таймкодами: {len(danmaku)}")

    if not danmaku:
        print("⚠️ Комментарии с таймкодами не найдены.")
        sys.exit(0)

    video_id = data.get("id", "comments")
    out_file = f"{video_id}_danmaku.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(danmaku, f, ensure_ascii=False, indent=2)

    print(f"✅ Комментарии с таймкодами сохранены в: {out_file}")

if __name__ == "__main__":
    main()
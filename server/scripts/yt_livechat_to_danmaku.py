import json
import subprocess
import sys
import tempfile
import os
from time import time

def main():
    if len(sys.argv) < 2:
        print("Использование: python yt_livechat_to_danmaku.py <ссылка_на_видео_или_стрим>")
        sys.exit(1)

    url = sys.argv[1]
    tmpdir = tempfile.mkdtemp()

    print("📥 Скачивание live chat через yt-dlp...")
    cmd = [
        "yt-dlp",
        "--write-subs",
        "--sub-langs", "live_chat",
        "--skip-download",
        "--no-warnings",
        "-o", os.path.join(tmpdir, "%(id)s.%(ext)s"),
        url
    ]
    subprocess.run(cmd, check=True)

    chat_file = None
    for f in os.listdir(tmpdir):
        if "live_chat" in f and f.endswith(".json"):
            chat_file = os.path.join(tmpdir, f)
            break

    if not chat_file:
        print("❌ Live chat не найден (стрим без чата или завершённое видео без сохранённого чата).")
        sys.exit(1)

    actions = []
    with open(chat_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if "replayChatItemAction" in obj:
                    actions.append(obj)
            except json.JSONDecodeError:
                continue

    print(f"🔍 Загружено сообщений чата: {len(actions)}")

    danmaku = []
    now_ms = int(time() * 1000)

    for i, action in enumerate(actions):
        replay_action = action.get("replayChatItemAction", {})
        inner_actions = replay_action.get("actions", [])
        
        if not inner_actions:
            continue
        
        for inner in inner_actions:
            add_action = inner.get("addChatItemAction", {})
            item = add_action.get("item", {})
            renderer = item.get("liveChatTextMessageRenderer", {})
            
            if not renderer:
                continue

            message_runs = renderer.get("message", {}).get("runs", [])
            text = "".join(run.get("text", "") for run in message_runs)
            
            if not text.strip():
                continue

            video_offset_ms = int(replay_action.get("videoOffsetTimeMsec", "0"))
            time_sec = video_offset_ms / 1000.0
            
            color = "#ffffff"
            if renderer.get("authorBadges"):
                color = "#ffd700"

            danmaku.append({
                "id": str(now_ms + i),
                "text": text,
                "time": time_sec,
                "color": color,
                "size": "normal",
                "position": "scroll",
                "created": now_ms + i,
                "shown": False
            })

    print(f"✅ Обработано сообщений: {len(danmaku)}")

    if not danmaku:
        print("⚠️ Сообщения чата не найдены.")
        sys.exit(0)

    video_id = "livechat"
    for f in os.listdir(tmpdir):
        if ".json" in f:
            video_id = f.split(".")[0]
            break

    out_file = f"{video_id}_livechat_danmaku.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(danmaku, f, ensure_ascii=False, indent=2)

    print(f"✅ Live chat сохранён в: {out_file}")

if __name__ == "__main__":
    main()
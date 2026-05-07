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
from time import time

def build_comment_tree(comments):
    """
    Строит дерево комментариев с replies на основе поля 'parent'
    """
    comment_dict = {}
    result = []

    # Первый проход - создаем все объекты комментариев
    for c in comments:
        c_id = c.get("id")
        if not c_id:
            continue
        
        item = {
            "id": c_id,
            "nick": c.get("author", "").lstrip("@"),
            "text": c.get("text", ""),
            "created": int(c.get("timestamp", time()) * 1000),
            "replies": []
        }

        # Добавляем лайки, если есть
        if "like_count" in c and isinstance(c["like_count"], int):
            item["likes"] = c["like_count"]

        # Добавляем дополнительные поля если они есть
        if "author_id" in c:
            item["author_id"] = c["author_id"]
        if "author_thumbnail" in c:
            item["author_thumbnail"] = c["author_thumbnail"]
        if "author_is_uploader" in c and c["author_is_uploader"]:
            item["is_uploader"] = True

        comment_dict[c_id] = item

    # Второй проход - связываем комментарии через parent
    for c in comments:
        c_id = c.get("id")
        parent_id = c.get("parent")
        
        if not c_id:
            continue
        
        if parent_id and parent_id in comment_dict:
            # Это ответ на другой комментарий
            comment_dict[parent_id]["replies"].append(comment_dict[c_id])
        else:
            # Это комментарий верхнего уровня
            result.append(comment_dict[c_id])

    return result

def main():
    if len(sys.argv) < 2:
        print("Использование: python yt_comments_to_json.py <ссылка_на_видео> [max_comments]")
        print("Пример: python yt_comments_to_json.py https://youtube.com/watch?v=VIDEO_ID")
        print("Пример с лимитом: python yt_comments_to_json.py https://youtube.com/watch?v=VIDEO_ID 1000")
        print("\nФормат max_comments: max-comments,max-parents,max-replies,max-replies-per-thread,max-depth")
        print("Пример: all,all,1000,10,2 - максимум 1000 ответов, до 10 на тред, глубина 2 уровня")
        sys.exit(1)

    url = sys.argv[1]
    max_comments = sys.argv[2] if len(sys.argv) > 2 else "all,all,all,all"
    
    tmpdir = tempfile.mkdtemp()

    print("📥 Скачивание комментариев с YouTube...")
    print(f"   Лимит комментариев: {max_comments}")
    
    # Базовая команда yt-dlp
    cmd = [
        "yt-dlp",
        "--write-comments",
        "--skip-download",
        "--no-warnings",
        "--quiet",
        "--extractor-args", f"youtube:max_comments={max_comments};comment_sort=top",
        "-o", os.path.join(tmpdir, "%(id)s.%(ext)s"),
        url
    ]

    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Ошибка при выполнении yt-dlp: {e}")
        sys.exit(1)

    # Ищем .info.json файл
    info_file = None
    for f in os.listdir(tmpdir):
        if f.endswith(".info.json"):
            info_file = os.path.join(tmpdir, f)
            break

    if not info_file:
        print("❌ Не удалось найти info.json")
        print("   Возможные причины:")
        print("   - Комментарии отключены для этого видео")
        print("   - Неверная ссылка на видео")
        print("   - yt-dlp требует обновления")
        sys.exit(1)

    # Читаем данные
    with open(info_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Получаем комментарии
    comments = data.get("comments", [])
    
    if not comments:
        print("⚠️  Комментарии не найдены или пусты")
        sys.exit(0)

    print(f"✓ Найдено комментариев: {len(comments)}")

    # Строим дерево комментариев с replies
    result = build_comment_tree(comments)

    # Подсчитываем статистику
    def count_comments(items):
        total = len(items)
        for item in items:
            total += count_comments(item.get("replies", []))
        return total

    total_comments = count_comments(result)
    top_level = len(result)

    # Сохраняем результат
    video_id = data.get("id", "comments")
    out_file = f"{video_id}.comments.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ Комментарии сохранены в файл: {out_file}")
    print(f"   📊 Статистика:")
    print(f"      - Комментариев верхнего уровня: {top_level}")
    print(f"      - Всего комментариев с ответами: {total_comments}")

    # Очистка временных файлов
    try:
        import shutil
        shutil.rmtree(tmpdir)
    except:
        pass

if __name__ == "__main__":
    main()
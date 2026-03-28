yt_comments_to_json:
# Скачать все комментарии
python yt_comments_to_json.py https://youtube.com/watch?v=VIDEO_ID

# Ограничить 1000 комментариев всего
python yt_comments_to_json.py https://youtube.com/watch?v=VIDEO_ID "1000"

# Детальная настройка: 1000 ответов макс, до 10 на тред, глубина 2 уровня
python yt_comments_to_json.py https://youtube.com/watch?v=VIDEO_ID "all,all,1000,10,2"

# Только 500 комментариев верхнего уровня, без ответов
python yt_comments_to_json.py https://youtube.com/watch?v=VIDEO_ID "500,500,0"

yt_to_danmaku_limit - обрабатывает только 10000 комментариев (extract only 100000 comments)
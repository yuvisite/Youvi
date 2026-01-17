# Централизованное хранилище тегов Youvi (файл наверное на 1/3 уже устарел)

Система централизованного хранения и управления тегами для видеоплатформы Youvi.

## Описание

Данная система решает проблему медленной загрузки страницы тегов, которая ранее каждый раз сканировала все видео заново. Теперь теги хранятся в централизованной базе данных в формате JSON, что обеспечивает быструю загрузку и эффективное управление.

## Структура системы

### Основные компоненты

1. **tag-database-schema.js** - Схема данных и валидация
2. **tag-database-manager.js** - Основной менеджер базы данных
3. **tag-scanner.js** - Сканер для построения базы из метаданных видео
4. **tag-database-integration.js** - Интеграция с существующей системой
5. **tag-database.css** - Стили для UI компонентов
6. **tag-database-test.js** - Тесты функциональности

### Структура файла tag-database.json

```json
{
  "version": "1.0.0",
  "lastUpdated": 1699123456789,
  "tags": {
    "naruto (at)": {
      "canonical": "Naruto (at)",
      "type": "at",
      "aliases": ["Наруто", "ナルト"],
      "implies": [],
      "usageCount": 42,
      "createdAt": 1699123456789,
      "color": "#a78bdb"
    }
  },
  "aliasIndex": {
    "наруто": "naruto (at)",
    "ナルト": "naruto (at)"
  }
}
```

### Поля тегов

- **canonical** - Каноническое имя тега для отображения
- **type** - Тип тега с префиксом (at, ge, ch, au, etc.)
- **aliases** - Массив альтернативных названий
- **implies** - Массив тегов для автоматического добавления
- **usageCount** - Количество использований
- **createdAt** - Дата создания (timestamp)
- **color** - Цвет для UI (hex)

## Расположение файла

Файл `tag-database.json` хранится в скрытой папке `.youvi` внутри директории с видео:

```
/path/to/videos/
├── .youvi/
│   ├── tag-database.json
│   └── .metadata/
├── video1.mp4
└── video2.mp4
```

Это обеспечивает портативность - при копировании папки с видео база тегов переместится вместе с ними.

## Fallback механизм

Если запись в файл невозможна (нет прав доступа, readonly файловая система), система автоматически переключается на localStorage с предупреждением пользователю о непортативности решения.

## API

### TagDatabaseManager

```javascript
// Инициализация
await tagDatabaseManager.initialize(videoDirectoryHandle);

// Добавление тега
await tagDatabaseManager.addTag('Naruto (at)', {
  usageCount: 1,
  aliases: ['Наруто']
});

// Получение тега
const tag = tagDatabaseManager.getTag('Naruto (at)');

// Поиск тегов
const results = tagDatabaseManager.searchTags('naruto');

// Получение всех тегов по типу
const animeTags = tagDatabaseManager.getAllTags('at');

// Группировка по типам
const grouped = tagDatabaseManager.getTagsByType();

// Статистика
const stats = tagDatabaseManager.getStats();
```

### TagScanner

```javascript
// Сканирование всех видео
const result = await tagScanner.scanAndBuildDatabase(allVideos);

// Обновление базы новыми видео
const updateResult = await tagScanner.updateDatabase(newVideos);

// Анализ паттернов тегов
const analysis = tagScanner.analyzeTagPatterns(allVideos);
```

### События

```javascript
// Слушатель событий базы данных
tagDatabaseManager.addEventListener((event) => {
  console.log('Database event:', event.event, event.data);
});

// Слушатель прогресса сканирования
tagScanner.addProgressListener((progress) => {
  console.log('Scan progress:', progress);
});
```

## Типы тегов

Система поддерживает следующие типы тегов:

| Суффикс | Тип | Префикс поиска | Цвет |
|---------|-----|----------------|------|
| (ка) | Channel | channel: | #9ca3af |
| (gt) | General | general: | #6b7280 |
| (ch) | Character | character: | #6b9e4d |
| (au) | Author/Artist | author: | #ef6c7d |
| (ge) | Genre | genre: | #6b9bd1 |
| (tp) | Type | type: | #f59e6c |
| (yr) | Year | year: | #eab676 |
| (st) | Studio | studio: | #f28b8b |
| (ct) | Category | category: | #67c5d6 |
| (ra) | Rating | rating: | #f5a3c7 |
| (at) | Anime | anime: | #a78bdb |
| (ser) | Serial | serial: | #8db8d6 |
| (mt) | Movie | movie: | #d4a373 |
| (nat) | Animation | animation: | #9dd6a8 |

## Интеграция

Система автоматически интегрируется с существующей страницей `youvi_tags.html`:

1. При первом запуске проверяется существование файла базы данных
2. Если файл отсутствует, запускается сканирование всех видео
3. Заменяется функция `buildTagCloud()` на версию, использующую базу данных
4. Добавляются UI элементы для отображения прогресса и статуса

## Производительность

### До внедрения
- Каждое открытие страницы тегов = полное сканирование всех видео
- Время загрузки: 5-15 секунд для 1000+ видео
- Нагрузка на файловую систему при каждом запросе

### После внедрения
- Сканирование только при первом запуске или добавлении новых видео
- Время загрузки: 100-500мс
- Минимальная нагрузка на файловую систему

## Миграция данных

Система поддерживает миграцию между версиями схемы:

```javascript
// Автоматическая миграция при загрузке
const migratedData = TagDatabaseSchema.migrate(oldData);
```

## Резервное копирование

База данных автоматически сохраняется при каждом изменении. Рекомендуется периодически создавать резервные копии файла `tag-database.json`.

## Отладка

Для отладки доступны следующие инструменты:

```javascript
// Запуск тестов
await tagDatabaseTests.runTests();

// Получение статистики
const stats = tagDatabaseManager.getStats();
console.log('Database stats:', stats);

// Анализ тегов
const analysis = tagScanner.analyzeTagPatterns(allVideos);
console.log('Tag analysis:', analysis);
```

## Требования

- Современный браузер с поддержкой File System Access API
- JavaScript ES2020+
- Права на запись в директорию с видео (для файлового хранения)

## Ограничения

- Максимальный размер базы данных: рекомендуется до 10MB
- Максимальное количество тегов: до 50,000
- Fallback в localStorage ограничен 5-10MB в зависимости от браузера

## Troubleshooting

### База данных не сохраняется в файл
- Проверьте права доступа к папке с видео
- Убедитесь, что File System Access API поддерживается
- Система автоматически переключится на localStorage

### Медленное сканирование
- Уменьшите размер батча в настройках сканера
- Проверьте количество тегов в видео (слишком много тегов замедляет процесс)

### Дублирующиеся теги
- Используйте анализ паттернов для выявления дубликатов
- Настройте алиасы для объединения похожих тегов

## Changelog

### v1.0.0 (2024-11-11)
- Первоначальная реализация
- Поддержка всех типов тегов
- Файловое хранение с localStorage fallback
- Автоматическое сканирование и индексация
- Интеграция с существующей системой

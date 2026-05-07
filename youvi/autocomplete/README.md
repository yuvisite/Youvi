# YouVi Autocomplete Module

Модульная система автодополнения поиска для YouVi с оптимизацией производительности через IndexedDB кеширование.

## Возможности

- **Поиск по тегам** с отображением количества видео
- **Поиск по названиям видео** с приоритизацией точных совпадений
- **Поиск по плейлистам** с информацией о количестве видео
- **Поиск по каналам** с аватарками и статистикой
- **Кеширование в IndexedDB** для быстрой работы без повторного сканирования
- **Минималистичный дизайн** без перегрузки эффектами
- **Поддержка темной темы**
- **Навигация с клавиатуры** (стрелки, Enter, Escape)

## Структура файлов

```
youvi/autocomplete/
├── autocomplete.css              # Стили компонента
├── autocomplete.js               # Основной класс автодополнения
├── autocomplete-cache.js         # IndexedDB кеш-слой
├── autocomplete-integration.js   # Хелпер для интеграции
└── README.md                     # Документация
```

## Быстрый старт

### 1. Подключение файлов

Добавьте в `<head>` вашей страницы:

```html
<!-- Autocomplete Module -->
<link rel="stylesheet" href="youvi/autocomplete/autocomplete.css">
<script src="youvi/autocomplete/autocomplete-cache.js"></script>
<script src="youvi/autocomplete/autocomplete.js"></script>
<script src="youvi/autocomplete/autocomplete-integration.js"></script>
```

### 2. Инициализация

```javascript
// После загрузки всех видео и плейлистов
const integration = new AutocompleteIntegration();

await integration.init(searchInput, {
  videoDirectoryHandle: videoDirectoryHandle,
  allVideos: allVideos,
  allPlaylists: allPlaylists,
  
  onTagSelect: (tagName) => {
    console.log('Tag selected:', tagName);
    // Ваш код фильтрации по тегу
  },
  
  onVideoSelect: (videoName) => {
    console.log('Video selected:', videoName);
    // Ваш код открытия видео
  },
  
  onPlaylistSelect: (playlistId) => {
    console.log('Playlist selected:', playlistId);
    // Ваш код открытия плейлиста
  },
  
  onChannelSelect: (channelName) => {
    console.log('Channel selected:', channelName);
    // Ваш код фильтрации по каналу
  }
});
```

## Примеры интеграции

### Для youvi_main.html

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // Ваш существующий код загрузки данных...
  
  // После загрузки всех видео и плейлистов
  const searchInput = document.querySelector('input[type="search"]');
  const autocompleteIntegration = new AutocompleteIntegration();
  
  await autocompleteIntegration.init(searchInput, {
    videoDirectoryHandle: videoDirectoryHandle,
    allVideos: allVideos,
    allPlaylists: allPlaylists,
    
    onTagSelect: (tagName) => {
      searchByTag(tagName);
    },
    
    onVideoSelect: (videoName) => {
      window.location.href = `youvi_video.html?v=${encodeURIComponent(videoName)}`;
    },
    
    onPlaylistSelect: (playlistId) => {
      window.location.href = `youvi_playlists_view.html?id=${playlistId}`;
    },
    
    onChannelSelect: (channelName) => {
      filterByChannel(channelName);
    }
  });
});
```

### Для youvi_search.html

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('searchQuery');
  const autocompleteIntegration = new AutocompleteIntegration();
  
  await autocompleteIntegration.init(searchInput, {
    videoDirectoryHandle: videoDirectoryHandle,
    allVideos: allVideos,
    allPlaylists: allPlaylists,
    
    onTagSelect: (tagName) => {
      searchInput.value = tagName;
      performSearch();
    },
    
    onVideoSelect: (videoName) => {
      window.location.href = `youvi_video.html?v=${encodeURIComponent(videoName)}`;
    },
    
    onPlaylistSelect: (playlistId) => {
      window.location.href = `youvi_playlists_view.html?id=${playlistId}`;
    },
    
    onChannelSelect: (channelName) => {
      searchInput.value = `channel:${channelName}`;
      performSearch();
    }
  });
});
```

## API Reference

### AutocompleteIntegration

#### Методы

**`init(inputElement, options)`**
Инициализирует автодополнение на элементе input.

Параметры:
- `inputElement` (HTMLInputElement) - Элемент input для поиска
- `options` (Object):
  - `videoDirectoryHandle` (FileSystemDirectoryHandle) - Handle директории с видео
  - `allVideos` (Array) - Массив всех видео
  - `allPlaylists` (Array) - Массив всех плейлистов
  - `onTagSelect` (Function) - Коллбек при выборе тега
  - `onVideoSelect` (Function) - Коллбек при выборе видео
  - `onPlaylistSelect` (Function) - Коллбек при выборе плейлиста
  - `onChannelSelect` (Function) - Коллбек при выборе канала

**`updateCache(allVideos, allPlaylists)`**
Вручную обновляет кеш новыми данными.

**`destroy()`**
Уничтожает экземпляр автодополнения.

### YouviAutocomplete

Низкоуровневый класс для прямого использования без интеграционного слоя.

```javascript
const autocomplete = new YouviAutocomplete(inputElement, {
  minChars: 1,
  debounceDelay: 150,
  avatarLoader: async (channelName) => { /* ... */ },
  onSelect: (result) => {
    console.log(result.type, result.value);
  }
});
```

### AutocompleteCache

Класс для работы с IndexedDB кешем.

**`updateCache(data)`**
Обновляет кеш данными.

**`search(query)`**
Ищет в кеше по запросу.

**`getLastUpdated()`**
Возвращает timestamp последнего обновления.

## Производительность

- **IndexedDB кеширование** - данные не сканируются при каждом запросе
- **Debounce** - запросы отправляются с задержкой 150ms
- **Ограничение результатов**:
  - Теги: до 8 результатов
  - Видео: до 6 результатов
  - Плейлисты: до 5 результатов
  - Каналы: до 4 результатов
- **Ленивая загрузка аватарок** - загружаются асинхронно после рендера
- **Автообновление кеша** - обновляется раз в 5 минут при инициализации

## Кастомизация стилей

Все стили определены в `autocomplete.css` с поддержкой темной темы через `body.dark-theme`.

Основные CSS классы:
- `.autocomplete-dropdown` - основной контейнер
- `.autocomplete-section` - секция результатов
- `.autocomplete-item` - элемент результата
- `.autocomplete-highlight` - подсветка совпадений

## Требования

- Современный браузер с поддержкой:
  - IndexedDB
  - File System Access API (для загрузки аватарок)
  - ES6+ (async/await, Promise, Map, etc.)

## Примечания

- Кеш автоматически обновляется при инициализации если прошло более 5 минут
- Аватарки каналов загружаются из файлов `avatar.jpg`, `avatar.png`, `avatar.webp`, или `avatar.gif` в директории канала
- При изменении данных (добавление/удаление видео) вызовите `updateCache()` вручную

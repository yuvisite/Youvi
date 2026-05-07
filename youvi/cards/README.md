# YouVi Video Cards System

Модульная система карточек видео для всех разделов YouVi платформы.

## 📁 Структура файлов

```
youvi/cards/
├── video-cards.css      # Стили для карточек
├── video-cards.js       # JavaScript функции
├── cards-bundle.js      # Bundle для автоматического подключения
└── README.md           # Документация
```

## 🚀 Быстрое подключение

### Вариант 1: Bundle (рекомендуемый)
```html
<script src="youvi/cards/cards-bundle.js"></script>
```

### Вариант 2: Отдельные файлы
```html
<link rel="stylesheet" href="youvi/cards/video-cards.css">
<script src="youvi/cards/video-cards.js"></script>
```

## 📖 Использование

### Создание одной карточки
```javascript
const videoData = {
    name: 'video.mp4',
    duration: '5:30',
    views: 1250,
    channel: 'My Channel',
    quality: 'HD',
    created: Date.now(),
    tags: ['gaming', 'tutorial']
};

const card = createVideoCard(videoData, {
    showQuality: true,
    showNew: true,
    showViews: true
});

document.getElementById('container').appendChild(card);
```

### Рендер сетки карточек
```javascript
const videos = [
    { name: 'video1.mp4', duration: '2:15', views: 500 },
    { name: 'video2.mp4', duration: '8:42', views: 1200 },
    // ... больше видео
];

const container = document.getElementById('video-grid');
renderVideoGrid(container, videos, {
    cardType: 'video',
    showViews: true,
    showChannel: true
});
```

## ⚙️ Конфигурация

### Основные опции карточек

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `showNumber` | boolean | false | Показать номер (для плейлистов) |
| `showQuality` | boolean | true | Показать значок качества |
| `showNew` | boolean | true | Показать значок "NEW" |
| `showDuration` | boolean | true | Показать продолжительность |
| `showViews` | boolean | true | Показать количество просмотров |
| `showChannel` | boolean | true | Показать название канала |
| `showCategory` | boolean | false | Показать категории/теги |
| `cardClass` | string | 'video-card' | CSS класс карточки |

### Предустановки
```javascript
// Использование предустановок
renderVideoGrid(container, videos, YouViCardsPresets.playlist);
renderVideoGrid(container, videos, YouViCardsPresets.subscription);
renderVideoGrid(container, videos, YouViCardsPresets.latest);
```

## 🎨 Типы карточек

### 1. Обычная карточка видео
```javascript
const card = createVideoCard(video, {
    showQuality: true,
    showNew: true,
    showDuration: true
});
```

### 2. Компактная карточка (для latest)
```javascript
const card = createLatestCard(video, {
    showChannel: true,
    showViews: false
});
```

## 📱 Адаптивность

Система автоматически адаптируется под размер экрана:
- **Десктоп**: 6+ колонок
- **Планшет**: 4-5 колонок  
- **Мобильный**: 2 колонки
- **Малые экраны**: 1 колонка

## 🔧 Кастомизация CSS

### CSS переменные
```css
:root {
    --latest-cols: 6; /* Количество колонок для latest grid */
}
```

### Кастомные стили
```css
.my-custom-card .video-card-title {
    font-size: 14px;
    color: #custom-color;
}
```

## 🎯 Интеграция с существующими страницами

### youvi_main.html
```javascript
// Заменить существующий код создания карточек на:
renderVideoGrid(document.querySelector('.video-grid'), videos, YouViCardsPresets.default);
```

### youvi_subscriptions.html
```javascript
// В функции renderVideosGrid:
renderVideoGrid(container, sortedVideos, YouViCardsPresets.subscription);
```

### youvi_playlists_view.html
```javascript
// Для просмотра плейлиста:
renderVideoGrid(container, playlistVideos, YouViCardsPresets.playlist);
```

## 🏷️ Система значков

### Управление видимостью значков
```javascript
// Переключить видимость значков качества и новизны
toggleVideoBadges();

// Проверить состояние
const badgesHidden = document.body.classList.contains('badges-hidden');
```

### Типы значков
- **Quality**: HD, SD, 4K
- **New**: Для видео младше 7 дней  
- **Duration**: Продолжительность видео
- **Number**: Порядковый номер в плейлисте

## 🔄 Интеграция с hover превью

Система автоматически подключается к hover превью:
```javascript
// Hover превью автоматически применяется при вызове renderVideoGrid
// если функция addHoverPreviewToCards доступна
```

## 📊 API функций

### Основные функции

#### `createVideoCard(video, options)`
Создает DOM элемент карточки видео.

#### `createLatestCard(video, options)`  
Создает компактную карточку для latest секции.

#### `renderVideoGrid(container, videos, options)`
Рендерит массив видео в контейнер.

#### `initVideoCards(options)`
Инициализирует систему карточек.

#### `toggleVideoBadges()`
Переключает видимость значков качества и новизны.

### Утилиты

#### `isNewVideo(video)`
Проверяет, является ли видео "новым".

#### `getFileNameWithoutExtension(name)`
Убирает расширение из имени файла.

#### `escapeHtml(text)`
Экранирует HTML в тексте.

#### `formatFileSize(bytes)`
Форматирует размер файла.

#### `getViewsText(count)`
Форматирует количество просмотров.

## 🐛 Отладка

```javascript
// Включить логирование
console.log('YouVi Cards initialized:', window.YouViCards);

// Проверить состояние значков
console.log('Badges hidden:', document.body.classList.contains('badges-hidden'));
```

## 🔧 Расширение системы

### Добавление нового типа карточки
```javascript
function createCustomCard(video, options = {}) {
    const card = createVideoCard(video, {
        ...options,
        cardClass: 'custom-card',
        titleClass: 'custom-title'
    });
    
    // Дополнительная кастомизация
    card.classList.add('my-custom-style');
    
    return card;
}
```

### Кастомный рендерер
```javascript
function renderCustomGrid(container, videos) {
    container.innerHTML = '';
    videos.forEach(video => {
        const card = createCustomCard(video);
        container.appendChild(card);
    });
}
```

## 📈 Производительность

- ✅ Lazy loading изображений
- ✅ Оптимизированные DOM операции  
- ✅ CSS containment для изоляции layout
- ✅ Минимальные reflow/repaint операции
- ✅ Адаптивные сетки без JavaScript расчетов
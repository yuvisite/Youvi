'use strict';

// POI Categories with icons and colors
const PLACES_CATEGORIES = {
  restaurant:  { label: 'Ресторан / Кафе',   icon: '🍽',  color: '#e67e22', group: 'Еда' },
  cafe:        { label: 'Кофейня',            icon: '☕',  color: '#b5651d', group: 'Еда' },
  fastfood:    { label: 'Фастфуд',            icon: '🍔',  color: '#e74c3c', group: 'Еда' },
  pizza:       { label: 'Пиццерия',           icon: '🍕',  color: '#e74c3c', group: 'Еда' },
  bar:         { label: 'Бар',                icon: '🍺',  color: '#f39c12', group: 'Еда' },
  bakery:      { label: 'Пекарня',            icon: '🥐',  color: '#d4a017', group: 'Еда' },
  supermarket: { label: 'Супермаркет',        icon: '🛒',  color: '#27ae60', group: 'Покупки' },
  shop:        { label: 'Магазин',            icon: '🏪',  color: '#2ecc71', group: 'Покупки' },
  pharmacy:    { label: 'Аптека',             icon: '💊',  color: '#1abc9c', group: 'Покупки' },
  clothes:     { label: 'Одежда',             icon: '👗',  color: '#9b59b6', group: 'Покупки' },
  electronics: { label: 'Электроника',        icon: '📱',  color: '#3498db', group: 'Покупки' },
  bookstore:   { label: 'Книжный',            icon: '📚',  color: '#8e44ad', group: 'Покупки' },
  hospital:    { label: 'Больница',           icon: '🏥',  color: '#e74c3c', group: 'Здоровье' },
  clinic:      { label: 'Клиника',            icon: '🩺',  color: '#c0392b', group: 'Здоровье' },
  dentist:     { label: 'Стоматология',       icon: '🦷',  color: '#e74c3c', group: 'Здоровье' },
  school:      { label: 'Школа',              icon: '🏫',  color: '#3498db', group: 'Образование' },
  university:  { label: 'Университет',        icon: '🎓',  color: '#2980b9', group: 'Образование' },
  kindergarten:{ label: 'Детский сад',        icon: '🧒',  color: '#1abc9c', group: 'Образование' },
  library:     { label: 'Библиотека',         icon: '📖',  color: '#16a085', group: 'Образование' },
  bank:        { label: 'Банк',               icon: '🏦',  color: '#2c3e50', group: 'Услуги' },
  atm:         { label: 'Банкомат',           icon: '💳',  color: '#34495e', group: 'Услуги' },
  post:        { label: 'Почта',              icon: '📮',  color: '#e67e22', group: 'Услуги' },
  police:      { label: 'Полиция',            icon: '👮',  color: '#2980b9', group: 'Услуги' },
  fire:        { label: 'Пожарная',           icon: '🚒',  color: '#e74c3c', group: 'Услуги' },
  gas_station: { label: 'АЗС',               icon: '⛽',  color: '#e67e22', group: 'Транспорт' },
  parking:     { label: 'Парковка',           icon: '🅿',  color: '#2980b9', group: 'Транспорт' },
  bus_stop:    { label: 'Остановка',          icon: '🚌',  color: '#3498db', group: 'Транспорт' },
  metro:       { label: 'Метро',              icon: '🚇',  color: '#8e44ad', group: 'Транспорт' },
  taxi:        { label: 'Такси',              icon: '🚕',  color: '#f1c40f', group: 'Транспорт' },
  hotel:       { label: 'Гостиница',          icon: '🏨',  color: '#d94b88', group: 'Проживание' },
  hostel:      { label: 'Хостел',             icon: '🛏',  color: '#e91e8c', group: 'Проживание' },
  museum:      { label: 'Музей',              icon: '🏛',  color: '#795548', group: 'Культура' },
  theater:     { label: 'Театр',              icon: '🎭',  color: '#9c27b0', group: 'Культура' },
  cinema:      { label: 'Кинотеатр',          icon: '🎬',  color: '#673ab7', group: 'Культура' },
  park:        { label: 'Парк / сквер',       icon: '🌳',  color: '#27ae60', group: 'Отдых' },
  playground:  { label: 'Детская площадка',   icon: '🛝',  color: '#2ecc71', group: 'Отдых' },
  sports:      { label: 'Спорткомплекс',      icon: '🏋',  color: '#16a085', group: 'Отдых' },
  stadium:     { label: 'Стадион',            icon: '🏟',  color: '#1abc9c', group: 'Отдых' },
  church:      { label: 'Церковь / Храм',     icon: '⛪',  color: '#7f8c8d', group: 'Прочее' },
  market:      { label: 'Рынок',              icon: '🛍',  color: '#e67e22', group: 'Прочее' },
  office:      { label: 'Офис',               icon: '🏢',  color: '#95a5a6', group: 'Прочее' },
  other:       { label: 'Другое',             icon: '📌',  color: '#d94b88', group: 'Прочее' },
};

// Get all unique groups
function getPlacesGroups() {
  const groups = {};
  for (const [key, cat] of Object.entries(PLACES_CATEGORIES)) {
    if (!groups[cat.group]) groups[cat.group] = [];
    groups[cat.group].push({ key, ...cat });
  }
  return groups;
}

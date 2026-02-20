/**
 * YouVi Shared Module
 * Общие функции для работы с файловой системой, пользователями и данными
 */

'use strict';

// Глобальная переменная для доступа к папке
let youviDirectoryHandle = null;

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function openYouviDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('8SiteDB', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
      
      if (!db.objectStoreNames.contains('videos')) {
        db.createObjectStore('videos', { keyPath: 'name' });
      }
      
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromYouviDB(db, key) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('handles', 'readonly');
      const store = tx.objectStore('handles');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function saveToYouviDB(db, key, value) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('handles', 'readwrite');
      const store = tx.objectStore('handles');
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

// ============================================
// DIRECTORY ACCESS
// ============================================

/**
 * Получить доступ к главной папке YouVi
 */
async function getYouviDirectory() {
  if (youviDirectoryHandle) {
    return youviDirectoryHandle;
  }
  
  try {
    const db = await openYouviDB();
    youviDirectoryHandle = await getFromYouviDB(db, 'videoDirectoryHandle');
    return youviDirectoryHandle;
  } catch (e) {
    console.error('Error getting YouVi directory:', e);
    return null;
  }
}

/**
 * Получить папку форума
 */
async function getForumDirectory() {
  const mainDir = await getYouviDirectory();
  if (!mainDir) return null;
  
  try {
    return await mainDir.getDirectoryHandle('forum', { create: true });
  } catch (e) {
    console.error('Error getting forum directory:', e);
    return null;
  }
}

/**
 * Получить папку с каналами (пользователями)
 */
async function getChannelsDirectory() {
  const mainDir = await getYouviDirectory();
  if (!mainDir) return null;
  
  try {
    return await mainDir.getDirectoryHandle('.channels', { create: true });
  } catch (e) {
    console.error('Error getting channels directory:', e);
    return null;
  }
}

// ============================================
// FILE OPERATIONS
// ============================================

async function readJSONFile(dirHandle, fileName, defaultValue = null) {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (e) {
    return defaultValue;
  }
}

async function writeJSONFile(dirHandle, fileName, data) {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  } catch (e) {
    console.error('Error writing JSON file:', fileName, e);
    throw e;
  }
}

async function saveImageFile(dirHandle, fileName, imageData) {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array(imageData));
    await writable.close();
  } catch (e) {
    console.error('Error saving image:', fileName, e);
    throw e;
  }
}

// ============================================
// USER/CHANNEL FUNCTIONS
// ============================================

// Profile cache with TTL (internal to YouviShared)
const youviProfileCache = new Map();
const PROFILE_CACHE_TTL = 60000; // 1 minute

/**
 * Получить профиль пользователя (канала)
 * @param {string} userName - имя пользователя/канала
 * @returns {Object|null} - данные профиля или null
 */
async function getUserProfile(userName) {
  if (!userName) return null;
  
  // Check cache first
  const cacheKey = `profile_${userName}`;
  if (youviProfileCache.has(cacheKey)) {
    const cached = youviProfileCache.get(cacheKey);
    if (Date.now() - cached.timestamp < PROFILE_CACHE_TTL) {
      return cached.data;
    }
    youviProfileCache.delete(cacheKey);
  }
  
  try {
    const channelsDir = await getChannelsDirectory();
    if (!channelsDir) return null;
    
    const userDir = await channelsDir.getDirectoryHandle(userName, { create: false });
    const profile = await readJSONFile(userDir, 'channel.json', {});
    
    // Обеспечиваем базовую структуру
    const profileData = {
      name: userName,
      description: profile.description || '',
      avatar: profile.avatar || null,
      stats: profile.stats || { videos: 0, forumPosts: 0 },
      joinedAt: profile.joinedAt || Date.now(),
      forumBio: profile.forumBio || '',
      ...profile
    };
    
    // Cache the result
    youviProfileCache.set(cacheKey, {
      data: profileData,
      timestamp: Date.now()
    });
    
    return profileData;
  } catch (e) {
    // Пользователь не существует
    return null;
  }
}

/**
 * Создать или обновить профиль пользователя
 * @param {string} userName - имя пользователя/канала
 * @param {Object} profileData - данные профиля
 */
async function saveUserProfile(userName, profileData) {
  if (!userName) throw new Error('Username is required');
  
  try {
    const channelsDir = await getChannelsDirectory();
    if (!channelsDir) throw new Error('Cannot access channels directory');
    
    const userDir = await channelsDir.getDirectoryHandle(userName, { create: true });
    
    // Получаем существующий профиль или создаем новый
    const existingProfile = await readJSONFile(userDir, 'channel.json', {});
    
    // Объединяем данные
    const updatedProfile = {
      name: userName,
      joinedAt: existingProfile.joinedAt || Date.now(),
      stats: existingProfile.stats || { videos: 0, forumPosts: 0 },
      ...existingProfile,
      ...profileData
    };
    
    await writeJSONFile(userDir, 'channel.json', updatedProfile);
    
    // Invalidate cache
    const cacheKey = `profile_${userName}`;
    youviProfileCache.delete(cacheKey);
    
    return updatedProfile;
  } catch (e) {
    console.error('Error saving user profile:', e);
    throw e;
  }
}

/**
 * Обновить статистику пользователя
 * @param {string} userName - имя пользователя
 * @param {string} field - поле статистики (videos, forumPosts)
 * @param {number} increment - на сколько увеличить (по умолчанию 1)
 */
async function updateUserStats(userName, field, increment = 1) {
  if (!userName) return;
  
  try {
    const profile = await getUserProfile(userName);
    if (!profile) {
      // Создаем новый профиль
      await saveUserProfile(userName, {
        stats: { [field]: increment }
      });
      return;
    }
    
    profile.stats = profile.stats || {};
    profile.stats[field] = (profile.stats[field] || 0) + increment;
    
    await saveUserProfile(userName, profile);
  } catch (e) {
    console.error('Error updating user stats:', e);
  }
}

/**
 * Получить аватарку пользователя
 * @param {string} userName - имя пользователя
 * @returns {string|null} - URL аватарки или null
 */
async function getUserAvatar(userName) {
  if (!userName) return null;
  
  try {
    const channelsDir = await getChannelsDirectory();
    if (!channelsDir) return null;
    
    const userDir = await channelsDir.getDirectoryHandle(userName, { create: false });
    const profile = await readJSONFile(userDir, 'channel.json', {});
    
    if (!profile.avatar) return null;
    
    const avatarHandle = await userDir.getFileHandle(profile.avatar);
    const avatarFile = await avatarHandle.getFile();
    return URL.createObjectURL(avatarFile);
  } catch (e) {
    return null;
  }
}

/**
 * Получить список всех пользователей
 * @returns {Array} - массив имен пользователей
 */
async function getAllUsers() {
  try {
    const channelsDir = await getChannelsDirectory();
    if (!channelsDir) return [];
    
    const users = [];
    for await (const [name, handle] of channelsDir.entries()) {
      if (handle.kind === 'directory' && !name.startsWith('.')) {
        users.push(name);
      }
    }
    
    return users;
  } catch (e) {
    console.error('Error getting all users:', e);
    return [];
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function slugifyNick(nick) {
  return (nick || 'anon')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-\.а-яё]/gi, '');
}

// ============================================
// EXPORTS (для использования в других скриптах)
// ============================================

if (typeof window !== 'undefined') {
  window.YouviShared = {
    // Database
    openYouviDB,
    getFromYouviDB,
    saveToYouviDB,
    
    // Directories
    getYouviDirectory,
    getForumDirectory,
    getChannelsDirectory,
    
    // Files
    readJSONFile,
    writeJSONFile,
    saveImageFile,
    
    // Users
    getUserProfile,
    saveUserProfile,
    updateUserStats,
    getUserAvatar,
    getAllUsers,
    
    // Utils
    escapeHtml,
    slugifyNick
  };
}

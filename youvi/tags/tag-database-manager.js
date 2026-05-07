/* 
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
 */
/**
 * Tag Database Manager
 * Manages centralized tag storage with file system and localStorage fallback
 */

const TAG_DB_DEBUG = false;

class TagDatabaseManager {
  constructor() {
    this.database = null;
    this.isLoaded = false;
    this.videoDirectoryHandle = null;
    this.useLocalStorageFallback = false;
    this.localStorageKey = 'youvi_tag_database';
    this.listeners = new Set();
    
    this.batchQueue = [];
    this.batchTimeout = null;
    this.batchConfig = {
      maxBatchSize: 100,
      batchDelay: 500,
      maxWaitTime: 5000
    };
    this.lastSaveTime = 0;
  }

  /**
   * Initialize the tag database
   * @param {FileSystemDirectoryHandle} videoDirectoryHandle - Video directory handle
   */
  async initialize(videoDirectoryHandle) {
    this.videoDirectoryHandle = videoDirectoryHandle;
    
    try {
      await this.loadDatabase();
      if (TAG_DB_DEBUG) console.log('[TagDB] ✅ Initialized successfully');
    } catch (error) {
      console.error('[TagDB] ❌ Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Load database from file or create new one
   */
  async loadDatabase() {
    try {
      const data = await this.loadFromFile();
      if (data) {
        this.database = TagDatabaseSchema.validate(data) ? 
          TagDatabaseSchema.migrate(data) : 
          TagDatabaseSchema.createEmpty();
        const purged = this.purgeZeroUsageTags();
        if (purged > 0) {
          await this._performSave();
        }
        this.isLoaded = true;
        if (TAG_DB_DEBUG) console.log('[TagDB] ✅ Loaded from file, tags:', Object.keys(this.database.tags).length);
        this._emitReadyEvent();
        return;
      }
    } catch (error) {
      console.warn('[TagDB] ⚠️ Failed to load from file:', error);
    }

    try {
      const data = await this.loadFromLocalStorage();
      if (data) {
        this.database = TagDatabaseSchema.validate(data) ? 
          TagDatabaseSchema.migrate(data) : 
          TagDatabaseSchema.createEmpty();
        const purged = this.purgeZeroUsageTags();
        if (purged > 0) {
          await this._performSave();
        }
        this.useLocalStorageFallback = true;
        this.isLoaded = true;
        if (TAG_DB_DEBUG) console.log('[TagDB] ✅ Loaded from localStorage (fallback), tags:', Object.keys(this.database.tags).length);
        this.notifyWarning('База тегов загружена из локального хранилища. Данные не портативны.');
        this._emitReadyEvent();
        return;
      }
    } catch (error) {
      console.warn('[TagDB] ⚠️ Failed to load from localStorage:', error);
    }

    this.database = TagDatabaseSchema.createEmpty();
    this.isLoaded = true;
    if (TAG_DB_DEBUG) console.log('[TagDB] ✅ Created new empty database');
    
    await this.saveDatabase();
    this._emitReadyEvent();
  }

  purgeZeroUsageTags() {
    if (!this.database || !this.database.tags) return 0;
    let removed = 0;
    const toDelete = [];
    Object.entries(this.database.tags).forEach(([key, tag]) => {
      const count = tag.usageCount || 0;
      if (count <= 0) {
        toDelete.push(key);
      }
    });
    if (toDelete.length > 0) {
      toDelete.forEach((key) => {
        delete this.database.tags[key];
      });
      Object.keys(this.database.aliasIndex).forEach(alias => {
        if (toDelete.includes(this.database.aliasIndex[alias])) {
          delete this.database.aliasIndex[alias];
        }
      });
      removed = toDelete.length;
    }
    return removed;
  }

  /**
   * Load database from .youvi/tag-database.json file
   */
  async loadFromFile() {
    if (!this.videoDirectoryHandle) return null;

    try {
      const youviDir = await this.videoDirectoryHandle.getDirectoryHandle('.youvi', { create: false });
      const fileHandle = await youviDir.getFileHandle('tag-database.json', { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        throw error;
      }
      return null;
    }
  }

  /**
   * Load database from localStorage
   */
  async loadFromLocalStorage() {
    try {
      const data = localStorage.getItem(this.localStorageKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[TagDB] Failed to parse localStorage data:', error);
      return null;
    }
  }

  /**
   * Save database to file or localStorage (optimized with batching)
   */
  async saveDatabase(immediate = false) {
    if (!this.database) return;

    if (immediate || this.shouldForceSave()) {
      return this._performSave();
    }
    
    return this._queueBatchSave();
  }
  
  /**
   * Check if we should force immediate save
   */
  shouldForceSave() {
    const timeSinceLastSave = Date.now() - this.lastSaveTime;
    return timeSinceLastSave > this.batchConfig.maxWaitTime;
  }
  
  /**
   * Queue operation for batch save
   */
  _queueBatchSave() {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({ resolve, reject, timestamp: Date.now() });
      
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }
      
      this.batchTimeout = setTimeout(async () => {
        try {
          await this._performSave();
          const queue = this.batchQueue.splice(0);
          queue.forEach(({ resolve }) => resolve());
        } catch (error) {
          const queue = this.batchQueue.splice(0);
          queue.forEach(({ reject }) => reject(error));
        }
        this.batchTimeout = null;
      }, this.batchConfig.batchDelay);
    });
  }
  
  /**
   * Perform actual database save
   */
  async _performSave() {
    if (!this.database) return;

    this.database.lastUpdated = Date.now();
    this.lastSaveTime = Date.now();

    try {
      if (!this.useLocalStorageFallback) {
        await this.saveToFile();
        if (Date.now() - this.lastSaveTime > 5000) {
          console.log('[TagDB] ✅ Saved to file');
        }
      }
    } catch (error) {
      console.warn('[TagDB] ⚠️ Failed to save to file, using localStorage fallback:', error);
      this.useLocalStorageFallback = true;
      this.notifyWarning('Не удалось сохранить в файл. Используется локальное хранилище.');
    }

    if (this.useLocalStorageFallback) {
      await this.saveToLocalStorage();
    }

    this.notifyListeners('saved');
  }

  /**
   * Save database to .youvi/tag-database.json file
   */
  async saveToFile() {
    if (!this.videoDirectoryHandle) {
      throw new Error('No video directory handle available');
    }

    const youviDir = await this.videoDirectoryHandle.getDirectoryHandle('.youvi', { create: true });
    const fileHandle = await youviDir.getFileHandle('tag-database.json', { create: true });
    const writable = await fileHandle.createWritable();
    
    const jsonData = JSON.stringify(this.database, null, 2);
    await writable.write(jsonData);
    await writable.close();
  }

  /**
   * Save database to localStorage
   */
  async saveToLocalStorage() {
    try {
      const jsonData = JSON.stringify(this.database);
      localStorage.setItem(this.localStorageKey, jsonData);
    } catch (error) {
      console.error('[TagDB] Failed to save to localStorage:', error);
      throw error;
    }
  }

  /**
   * Add or update a tag in the database (optimized)
   * @param {string} tagName - Full tag name (e.g., "Naruto (at)")
   * @param {object} options - Additional options
   */
  async addTag(tagName, options = {}) {
    if (!this.isLoaded) {
      throw new Error('Database not loaded');
    }

    const normalized = TagDatabaseSchema.normalizeTagName(tagName);
    const existing = this.database.tags[normalized];

    if (existing) {
      existing.usageCount = (existing.usageCount || 0) + (options.incrementUsage ? 1 : 0);
      if (options.aliases) {
        if (options.replaceAliases) {
          existing.aliases = [...new Set(options.aliases)];
        } else {
          existing.aliases = [...new Set([...existing.aliases, ...options.aliases])];
        }
        this.updateAliasIndex(normalized, tagName, existing.aliases);
      }
      if (options.implies) {
        existing.implies = [...new Set([...existing.implies, ...options.implies])];
      }
    } else {
      this.database.tags[normalized] = TagDatabaseSchema.createTag(tagName, {
        ...options,
        usageCount: options.usageCount || 1
      });
      this.updateAliasIndex(normalized, tagName, options.aliases || []);
    }

    await this.saveDatabase(options.immediate);
    this.notifyListeners('tagAdded', { tagName, normalized });

    return this.database.tags[normalized];
  }
  
  /**
   * Add multiple tags in batch (highly optimized)
   * @param {Array} tagOperations - Array of {tagName, options} objects
   */
  async addTagsBatch(tagOperations) {
    if (!this.isLoaded) {
      throw new Error('Database not loaded');
    }
    
    if (!Array.isArray(tagOperations) || tagOperations.length === 0) {
      return [];
    }
    
    const startTime = performance.now();
    
    const results = [];
    const addedTags = [];
    
    for (const { tagName, options = {} } of tagOperations) {
      const normalized = TagDatabaseSchema.normalizeTagName(tagName);
      const existing = this.database.tags[normalized];

      if (existing) {
        existing.usageCount = (existing.usageCount || 0) + (options.incrementUsage ? 1 : 0);
        if (options.aliases) {
          existing.aliases = [...new Set([...existing.aliases, ...options.aliases])];
        }
        if (options.implies) {
          existing.implies = [...new Set([...existing.implies, ...options.implies])];
        }
      } else {
        this.database.tags[normalized] = TagDatabaseSchema.createTag(tagName, {
          ...options,
          usageCount: options.usageCount || 1
        });
        addedTags.push(tagName);
      }

      this.updateAliasIndex(normalized, tagName, options.aliases || []);
      results.push(this.database.tags[normalized]);
    }
    
    await this._performSave();
    
    const duration = performance.now() - startTime;
    if (TAG_DB_DEBUG && duration > 100) {
      console.log('[TagDB] ✅ Batch completed in', duration.toFixed(2), 'ms -', addedTags.length, 'new tags');
    }
    
    this.notifyListeners('batchCompleted', { 
      operations: tagOperations.length,
      newTags: addedTags.length,
      duration 
    });
    
    return results;
  }

  /**
   * Update alias index for a tag
   */
  updateAliasIndex(normalizedTag, canonical, aliases) {
    const canonicalNormalized = TagDatabaseSchema.normalizeTagName(canonical);
    this.database.aliasIndex[canonicalNormalized] = normalizedTag;

    aliases.forEach(alias => {
      const aliasNormalized = TagDatabaseSchema.normalizeTagName(alias);
      this.database.aliasIndex[aliasNormalized] = normalizedTag;
    });
  }

  /**
   * Get tag by name (supports aliases)
   * @param {string} tagName - Tag name or alias
   * @returns {object|null} - Tag object or null
   */
  getTag(tagName) {
    if (!this.isLoaded) return null;

    const normalized = TagDatabaseSchema.normalizeTagName(tagName);
    
    if (this.database.tags[normalized]) {
      return this.database.tags[normalized];
    }

    const canonicalKey = this.database.aliasIndex[normalized];
    if (canonicalKey && this.database.tags[canonicalKey]) {
      return this.database.tags[canonicalKey];
    }

    return null;
  }

  /**
   * Get all tags, optionally filtered by type
   * @param {string} type - Optional tag type filter
   * @returns {Array} - Array of tag objects with keys
   */
  getAllTags(type = null) {
    if (!this.isLoaded) return [];

    const tags = Object.entries(this.database.tags).map(([key, tag]) => ({
      key,
      ...tag
    }));

    if (type) {
      return tags.filter(tag => tag.type === type);
    }

    return tags;
  }

  /**
   * Search tags by query
   * @param {string} query - Search query
   * @returns {Array} - Array of matching tags
   */
  searchTags(query) {
    if (!this.isLoaded || !query) return [];

    const queryLower = query.toLowerCase().trim();
    const results = [];

    Object.entries(this.database.tags).forEach(([key, tag]) => {
      let score = 0;

      if (tag.canonical.toLowerCase().includes(queryLower)) {
        score += tag.canonical.toLowerCase() === queryLower ? 100 : 50;
      }

      tag.aliases.forEach(alias => {
        if (alias.toLowerCase().includes(queryLower)) {
          score += alias.toLowerCase() === queryLower ? 90 : 40;
        }
      });

      if (score > 0) {
        results.push({ key, tag, score });
      }
    });

    return results
      .sort((a, b) => b.score - a.score)
      .map(item => ({ key: item.key, ...item.tag }));
  }

  /**
   * Get tags grouped by type
   * @returns {object} - Tags grouped by type
   */
  getTagsByType() {
    if (!this.isLoaded) return {};

    const grouped = {};
    
    Object.entries(this.database.tags).forEach(([key, tag]) => {
      const type = tag.type || 'general';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push({ key, ...tag });
    });

    Object.keys(grouped).forEach(type => {
      grouped[type].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    });

    return grouped;
  }

  /**
   * Increment tag usage count (optimized)
   * @param {string} tagName - Tag name
   * @param {boolean} immediate - Force immediate save
   */
  async incrementUsage(tagName, immediate = false) {
    const tag = this.getTag(tagName);
    if (tag) {
      const normalized = TagDatabaseSchema.normalizeTagName(tagName);
      this.database.tags[normalized].usageCount = (tag.usageCount || 0) + 1;
      await this.saveDatabase(immediate);
      this.notifyListeners('usageIncremented', { tagName, count: tag.usageCount });
    }
  }
  
  /**
   * Decrement tag usage count (and remove if reaches 0)
   * @param {string} tagName - Tag name
   * @param {boolean} immediate - Force immediate save
   */
  async decrementUsage(tagName, immediate = false) {
    const tag = this.getTag(tagName);
    if (tag) {
      const normalized = TagDatabaseSchema.normalizeTagName(tagName);
      const newCount = Math.max(0, (tag.usageCount || 1) - 1);
      
      if (newCount === 0) {
        delete this.database.tags[normalized];
        Object.keys(this.database.aliasIndex).forEach(alias => {
          if (this.database.aliasIndex[alias] === normalized) {
            delete this.database.aliasIndex[alias];
          }
        });
        if (TAG_DB_DEBUG) console.log('[TagDB] 🗑️ Removed tag with 0 usage:', tagName);
        this.notifyListeners('tagRemoved', { tagName, normalized });
      } else {
        this.database.tags[normalized].usageCount = newCount;
        if (TAG_DB_DEBUG) console.log('[TagDB] 📉 Decremented tag:', tagName, 'to', newCount);
        this.notifyListeners('usageDecremented', { tagName, count: newCount });
      }
      
      await this.saveDatabase(immediate);
    } else {
      if (TAG_DB_DEBUG) console.warn('[TagDB] ⚠️ Attempted to decrement non-existent tag:', tagName);
    }
  }
  
  /**
   * Batch increment usage for multiple tags
   * @param {Array} tagNames - Array of tag names
   */
  async incrementUsageBatch(tagNames) {
    if (!Array.isArray(tagNames) || tagNames.length === 0) {
      return;
    }
    
    const updates = [];
    
    for (const tagName of tagNames) {
      const tag = this.getTag(tagName);
      if (tag) {
        const normalized = TagDatabaseSchema.normalizeTagName(tagName);
        this.database.tags[normalized].usageCount = (tag.usageCount || 0) + 1;
        updates.push({ tagName, count: this.database.tags[normalized].usageCount });
      }
    }
    
    if (updates.length > 0) {
      await this._performSave();
      
      this.notifyListeners('usageBatchIncremented', { updates });
    }
  }
  
  /**
   * Batch decrement usage for multiple tags
   * @param {Array} tagNames - Array of tag names
   */
  async decrementUsageBatch(tagNames) {
    if (!Array.isArray(tagNames) || tagNames.length === 0) {
      return;
    }
    
    if (TAG_DB_DEBUG) console.log('[TagDB] 📉 Batch decrementing', tagNames.length, 'tags');
    const updates = [];
    const removedTags = [];
    
    for (const tagName of tagNames) {
      const tag = this.getTag(tagName);
      if (tag) {
        const normalized = TagDatabaseSchema.normalizeTagName(tagName);
        const newCount = Math.max(0, (tag.usageCount || 1) - 1);
        
        if (newCount === 0) {
          delete this.database.tags[normalized];
          Object.keys(this.database.aliasIndex).forEach(alias => {
            if (this.database.aliasIndex[alias] === normalized) {
              delete this.database.aliasIndex[alias];
            }
          });
          removedTags.push(tagName);
          if (TAG_DB_DEBUG) console.log('[TagDB] 🗑️ Removed tag with 0 usage:', tagName);
        } else {
          this.database.tags[normalized].usageCount = newCount;
          updates.push({ tagName, count: newCount });
          if (TAG_DB_DEBUG) console.log('[TagDB] 📉 Decremented tag:', tagName, 'to', newCount);
        }
      } else {
        if (TAG_DB_DEBUG) console.warn('[TagDB] ⚠️ Attempted to decrement non-existent tag:', tagName);
      }
    }
    
    if (updates.length > 0 || removedTags.length > 0) {
      await this._performSave();
      
      if (updates.length > 0) {
        this.notifyListeners('usageBatchDecremented', { updates });
      }
      if (removedTags.length > 0) {
        this.notifyListeners('tagsBatchRemoved', { removedTags });
      }
    }
  }

  /**
   * Add event listener
   * @param {function} listener - Event listener function
   */
  addEventListener(listener) {
    this.listeners.add(listener);
  }

  /**
   * Remove event listener
   * @param {function} listener - Event listener function
   */
  removeEventListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  notifyListeners(event, data = {}) {
    this.listeners.forEach(listener => {
      try {
        listener({ event, data, database: this.database });
      } catch (error) {
        console.error('[TagDB] Listener error:', error);
      }
    });
  }

  /**
   * Notify warning to user
   */
  notifyWarning(message) {
    console.warn('[TagDB] ⚠️', message);
    const event = new CustomEvent('tagDatabaseWarning', { detail: message });
    document.dispatchEvent(event);
  }
  
  /**
   * Emit database ready event for event-driven initialization
   */
  _emitReadyEvent() {
    document.dispatchEvent(new CustomEvent('tagDatabaseReady', {
      detail: { tagCount: Object.keys(this.database.tags).length }
    }));
  }

  /**
   * Get database statistics (with performance info)
   */
  getStats() {
    if (!this.isLoaded) return null;

    const tags = Object.values(this.database.tags);
    const totalUsage = tags.reduce((sum, tag) => sum + (tag.usageCount || 0), 0);
    const typeStats = {};

    tags.forEach(tag => {
      const type = tag.type || 'general';
      if (!typeStats[type]) {
        typeStats[type] = { count: 0, usage: 0 };
      }
      typeStats[type].count++;
      typeStats[type].usage += tag.usageCount || 0;
    });

    return {
      totalTags: tags.length,
      totalUsage,
      typeStats,
      lastUpdated: this.database.lastUpdated,
      usingFallback: this.useLocalStorageFallback,
      performance: {
        batchQueueSize: this.batchQueue.length,
        lastSaveTime: this.lastSaveTime,
        timeSinceLastSave: Date.now() - this.lastSaveTime
      }
    };
  }
  
  /**
   * Force immediate save of all pending operations
   */
  async flushPendingOperations() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    if (this.batchQueue.length > 0) {
      if (TAG_DB_DEBUG) console.log('[TagDB] 🚀 Flushing', this.batchQueue.length, 'pending operations');
      try {
        await this._performSave();
        const queue = this.batchQueue.splice(0);
        queue.forEach(({ resolve }) => resolve());
      } catch (error) {
        const queue = this.batchQueue.splice(0);
        queue.forEach(({ reject }) => reject(error));
        throw error;
      }
    }
  }
  
  /**
   * Fix tag usage count (for debugging/repair)
   * @param {string} tagName - Tag name
   * @param {number} correctCount - Correct usage count
   */
  async fixTagUsage(tagName, correctCount) {
    const normalized = TagDatabaseSchema.normalizeTagName(tagName);
    const tag = this.database?.tags?.[normalized];
    
    if (tag) {
      const oldCount = tag.usageCount || 0;
      tag.usageCount = Math.max(0, correctCount);
      
      if (tag.usageCount === 0) {
        delete this.database.tags[normalized];
        Object.keys(this.database.aliasIndex).forEach(alias => {
          if (this.database.aliasIndex[alias] === normalized) {
            delete this.database.aliasIndex[alias];
          }
        });
        if (TAG_DB_DEBUG) console.log('[TagDB] 🔧 Fixed and removed tag:', tagName, 'was:', oldCount, 'now: removed');
        this.notifyListeners('tagRemoved', { tagName, normalized });
      } else {
        if (TAG_DB_DEBUG) console.log('[TagDB] 🔧 Fixed tag usage:', tagName, 'was:', oldCount, 'now:', tag.usageCount);
        this.notifyListeners('usageFixed', { tagName, oldCount, newCount: tag.usageCount });
      }
      
      await this._performSave();
      return { tagName, oldCount, newCount: tag.usageCount };
    } else {
      if (TAG_DB_DEBUG) console.warn('[TagDB] ⚠️ Tag not found for fixing:', tagName);
      return null;
    }
  }
}

window.tagDatabaseManager = new TagDatabaseManager();

window.addEventListener('beforeunload', async () => {
  try {
    await window.tagDatabaseManager.flushPendingOperations();
  } catch (error) {
    console.warn('[TagDB] Failed to flush pending operations on unload:', error);
  }
});

window.debugTagUsage = {
  checkTag: (tagName) => {
    const normalized = TagDatabaseSchema.normalizeTagName(tagName);
    const tag = window.tagDatabaseManager.database?.tags?.[normalized];
    console.log('Tag check:', { original: tagName, normalized, tag });
    return tag;
  },
  fixTag: (tagName, correctCount) => {
    return window.tagDatabaseManager.fixTagUsage(tagName, correctCount);
  },
  listAllTags: () => {
    const tags = window.tagDatabaseManager.database?.tags || {};
    Object.entries(tags).forEach(([key, tag]) => {
      console.log(`${tag.canonical}: ${tag.usageCount} uses`);
    });
    return tags;
  },
  decrementTag: (tagName) => {
    return window.tagDatabaseManager.decrementUsage(tagName, true);
  }
};
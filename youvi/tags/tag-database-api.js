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
﻿/**
 * Tag Database API
 * Simple API for external integration with tag database system
 */

const TAG_DB_API_DEBUG = false;

class TagDatabaseAPI {
  constructor() {
    this.isReady = false;
    this.readyPromise = null;
    this.initializeAPI();
  }

  /**
   * Initialize API and wait for system to be ready
   */
  async initializeAPI() {
    this.readyPromise = new Promise((resolve) => {
      const checkReady = () => {
        if (window.tagDatabaseIntegration?.isInitialized) {
          this.isReady = true;
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });

    await this.readyPromise;
    if (TAG_DB_API_DEBUG) console.log('[TagDB API] ✅ API ready');
  }

  /**
   * Ensure system is ready before executing
   */
  async ensureReady() {
    if (!this.isReady) {
      await this.readyPromise;
    }
  }

  /**
   * Get all tags
   * @param {string} type - Optional tag type filter
   * @returns {Promise<Array>} Array of tags
   */
  async getTags(type = null) {
    await this.ensureReady();
    return window.tagDatabaseManager.getAllTags(type);
  }

  /**
   * Search tags by query
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching tags
   */
  async searchTags(query) {
    await this.ensureReady();
    return window.tagDatabaseManager.searchTags(query);
  }

  /**
   * Get tags grouped by type
   * @returns {Promise<Object>} Tags grouped by type
   */
  async getTagsByType() {
    await this.ensureReady();
    return window.tagDatabaseManager.getTagsByType();
  }

  /**
   * Add a new tag
   * @param {string} tagName - Tag name
   * @param {Object} options - Tag options
   * @returns {Promise<Object>} Created tag
   */
  async addTag(tagName, options = {}) {
    await this.ensureReady();
    return window.tagDatabaseManager.addTag(tagName, options);
  }

  /**
   * Get tag by name
   * @param {string} tagName - Tag name
   * @returns {Promise<Object|null>} Tag object or null
   */
  async getTag(tagName) {
    await this.ensureReady();
    return window.tagDatabaseManager.getTag(tagName);
  }

  /**
   * Increment tag usage
   * @param {string} tagName - Tag name
   * @returns {Promise<void>}
   */
  async incrementTagUsage(tagName) {
    await this.ensureReady();
    return window.tagDatabaseManager.incrementUsage(tagName);
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database statistics
   */
  async getStats() {
    await this.ensureReady();
    return window.tagDatabaseManager.getStats();
  }

  /**
   * Update videos list (triggers sync)
   * @param {Array} allVideos - Updated video list
   * @param {Object} options - Sync options (e.g., { force: true })
   * @returns {Promise<void>}
   */
  async updateVideosList(allVideos, options = {}) {
    await this.ensureReady();
    if (window.tagSyncManager) {
      return window.tagSyncManager.checkAndSync(allVideos, options);
    }
  }

  /**
   * Force full resync
   * @returns {Promise<void>}
   */
  async forceResync() {
    await this.ensureReady();
    if (window.tagDatabaseIntegration.forceFullResync) {
      return window.tagDatabaseIntegration.forceFullResync();
    }
  }

  /**
   * Get sync manager statistics
   * @returns {Promise<Object>} Sync statistics
   */
  async getSyncStats() {
    await this.ensureReady();
    if (window.tagSyncManager) {
      return window.tagSyncManager.getStats();
    }
    return null;
  }

  /**
   * Get metadata watcher statistics
   * @returns {Promise<Object>} Watcher statistics
   */
  async getWatcherStats() {
    await this.ensureReady();
    if (window.metadataWatcher) {
      return window.metadataWatcher.getStats();
    }
    return null;
  }

  /**
   * Add event listener for tag database events
   * @param {Function} listener - Event listener function
   */
  addEventListener(listener) {
    if (window.tagDatabaseManager) {
      window.tagDatabaseManager.addEventListener(listener);
    }
  }

  /**
   * Remove event listener
   * @param {Function} listener - Event listener function
   */
  removeEventListener(listener) {
    if (window.tagDatabaseManager) {
      window.tagDatabaseManager.removeEventListener(listener);
    }
  }

  /**
   * Check if system is ready
   * @returns {boolean} True if ready
   */
  isSystemReady() {
    return this.isReady;
  }

  /**
   * Get system status
   * @returns {Promise<Object>} System status
   */
  async getSystemStatus() {
    const status = {
      ready: this.isReady,
      components: {
        manager: !!window.tagDatabaseManager,
        scanner: !!window.tagScanner,
        syncManager: !!window.tagSyncManager,
        metadataWatcher: !!window.metadataWatcher,
        integration: !!window.tagDatabaseIntegration
      }
    };

    if (this.isReady) {
      try {
        status.stats = await this.getStats();
        status.syncStats = await this.getSyncStats();
        status.watcherStats = await this.getWatcherStats();
      } catch (error) {
        status.error = error.message;
      }
    }

    return status;
  }
}

window.TagDatabaseAPI = new TagDatabaseAPI();

window.tagDB = window.TagDatabaseAPI;

if (typeof console !== 'undefined') {
  if (TAG_DB_API_DEBUG) console.log('[TagDB API] 🚀 Tag Database API loaded. Use window.tagDB for access.');
  if (TAG_DB_API_DEBUG) console.log('[TagDB API] 📚 Available methods:', Object.getOwnPropertyNames(TagDatabaseAPI.prototype).filter(name => name !== 'constructor'));
}
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
 * Tag Sync Manager
 * Monitors video metadata changes and keeps tag database synchronized
 */

const TAG_SYNC_DEBUG = false;

class TagSyncManager {
  constructor(tagDatabaseManager, tagScanner) {
    this.tagManager = tagDatabaseManager;
    this.tagScanner = tagScanner;
    this.videoHashes = new Map();
    this.syncInProgress = false;
    this.lastSyncTime = 0;
    this.syncInterval = null;
    this.changeQueue = new Set();
    this.listeners = new Set();
    
    this.config = {
      autoSyncInterval: 30000,
      batchSize: 50,
      maxQueueSize: 1000,
      debounceDelay: 2000
    };
  }

  /**
   * Initialize sync manager
   * @param {Array} allVideos - Current video list
   */
  async initialize(allVideos) {
    if (TAG_SYNC_DEBUG) console.log('[TagSync] 🔄 Initializing sync manager...');
    
    await this.buildVideoHashMap(allVideos);
    
    this.startAutoSync();
    
    if (TAG_SYNC_DEBUG) console.log('[TagSync] ✅ Sync manager initialized with', this.videoHashes.size, 'videos');
  }

  /**
   * Build hash map of video metadata for change detection
   */
  async buildVideoHashMap(allVideos) {
    if (TAG_SYNC_DEBUG) console.log('[TagSync] 📊 Building video hash map...');
    
    this.videoHashes.clear();
    
    for (const video of allVideos) {
      const hash = this.calculateVideoHash(video);
      const key = this.getVideoKey(video);
      this.videoHashes.set(key, {
        hash,
        lastSeen: Date.now(),
        tags: [...(video.tags || [])],
        modified: video.modified || 0,
        metadataModified: video._metadataModified || video.modified || 0
      });
    }
  }

  /**
   * Calculate hash of video metadata (tags + modified time) - optimized
   */
  calculateVideoHash(video) {
    const tags = video.tags || [];
    const tagsStr = tags.length > 0 ? tags.slice().sort().join('|') : '';
    const modTime = video.modified || video.file?.lastModified || 0;
    const metaModTime = video._metadataModified || 0;
    
    const hashInput = `${video.name}:${tagsStr}:${modTime}:${metaModTime}`;
    
    let hash = 0;
    if (hashInput.length === 0) return hash;
    
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Get unique key for video
   */
  getVideoKey(video) {
    return video.name || video.title || 'unknown';
  }

  /**
   * Check for changes in video list and sync if needed
   * @param {Array} currentVideos - Current video list
   * @param {Object} options - Options for sync check
   */
  async checkAndSync(currentVideos, options = {}) {
    if (this.syncInProgress) {
      if (TAG_SYNC_DEBUG) console.log('[TagSync] ⏳ Sync already in progress, queuing...');
      this.queueVideosForSync(currentVideos);
      return;
    }

    const skipQuickCheck = options.force || false;
    
    if (!skipQuickCheck) {
      const quickCheck = await this.quickChangeCheck(currentVideos);
      if (!quickCheck.hasChanges) {
        if (TAG_SYNC_DEBUG) console.log('[TagSync] ⚡ Quick check: no changes detected');
        return;
      }
      if (TAG_SYNC_DEBUG) console.log('[TagSync] 🔍 Quick check detected changes:', quickCheck.reason);
    } else {
      if (TAG_SYNC_DEBUG) console.log('[TagSync] 🔍 Performing full sync check (quick check skipped)...');
    }

    const changes = this.detectChanges(currentVideos);
    
    if (changes.added.length > 0 || changes.modified.length > 0 || changes.removed.length > 0) {
      if (TAG_SYNC_DEBUG) console.log('[TagSync] 🔍 Changes detected:', {
        added: changes.added.length,
        modified: changes.modified.length,
        removed: changes.removed.length
      });
      
      await this.syncChanges(changes, currentVideos);
    } else {
      if (TAG_SYNC_DEBUG) console.log('[TagSync] ✅ No changes detected after full comparison');
    }
  }

  /**
   * Quick check for obvious changes without full comparison
   */
  async quickChangeCheck(currentVideos) {
    if (currentVideos.length !== this.videoHashes.size) {
      return { hasChanges: true, reason: 'video count changed' };
    }

    for (const video of currentVideos) {
      const key = this.getVideoKey(video);
      const stored = this.videoHashes.get(key);
      
      if (!stored) {
        return { hasChanges: true, reason: 'new video found' };
      }

      const currentMetaMod = video._metadataModified || video.modified || 0;
      const storedMetaMod = stored.metadataModified || stored.modified || 0;
      
      if (currentMetaMod > storedMetaMod) {
        return { hasChanges: true, reason: 'metadata newer than stored' };
      }
      
      const currentTags = (video.tags || []).sort().join('|');
      const storedTags = (stored.tags || []).sort().join('|');
      
      if (currentTags !== storedTags) {
        return { hasChanges: true, reason: 'tags changed' };
      }
    }

    return { hasChanges: false };
  }

  /**
   * Detect changes between current videos and stored hashes
   */
  detectChanges(currentVideos) {
    const changes = {
      added: [],
      modified: [],
      removed: [],
      unchanged: []
    };

    const currentKeys = new Set();

    for (const video of currentVideos) {
      const key = this.getVideoKey(video);
      const currentHash = this.calculateVideoHash(video);
      const stored = this.videoHashes.get(key);

      currentKeys.add(key);

      if (!stored) {
        changes.added.push(video);
      } else if (stored.hash !== currentHash) {
        changes.modified.push({
          video,
          oldTags: stored.tags,
          newTags: video.tags || []
        });
      } else {
        changes.unchanged.push(video);
        stored.lastSeen = Date.now();
      }
    }

    for (const [key, stored] of this.videoHashes.entries()) {
      if (!currentKeys.has(key)) {
        changes.removed.push({
          key,
          tags: stored.tags,
          reason: 'video_file_missing'
        });
      }
    }

    return changes;
  }

  /**
   * Sync detected changes to tag database (optimized)
   */
  async syncChanges(changes, currentVideos) {
    this.syncInProgress = true;
    const syncStartTime = Date.now();
    this.lastSyncTime = syncStartTime;
    
    try {
      if (TAG_SYNC_DEBUG) console.log('[TagSync] 🔄 Starting optimized sync process...');
      
      let totalTagsUpdated = 0;
      const promises = [];

      if (changes.added.length > 0) {
        if (TAG_SYNC_DEBUG) console.log('[TagSync] ➕ Processing', changes.added.length, 'new videos');
        promises.push(
          this.tagScanner.updateDatabase(changes.added).then(result => {
            totalTagsUpdated += result.tagsUpdated || 0;
            
            for (const video of changes.added) {
              const key = this.getVideoKey(video);
              const hash = this.calculateVideoHash(video);
              this.videoHashes.set(key, {
                hash,
                lastSeen: Date.now(),
                tags: [...(video.tags || [])],
                modified: video.modified || 0
              });
            }
            
            return result.tagsUpdated || 0;
          })
        );
      }

      if (changes.modified.length > 0) {
        if (TAG_SYNC_DEBUG) console.log('[TagSync] 🔄 Processing', changes.modified.length, 'modified videos');
        promises.push(
          this.processModifiedVideos(changes.modified).then(() => {
            return changes.modified.length;
          })
        );
      }

      if (changes.removed.length > 0) {
        if (TAG_SYNC_DEBUG) console.log('[TagSync] ➖ Processing', changes.removed.length, 'removed videos');
        promises.push(
          this.processRemovedVideos(changes.removed).then(() => {
            for (const removed of changes.removed) {
              this.videoHashes.delete(removed.key);
            }
            return 0;
          })
        );
      }

      const results = await Promise.all(promises);
      totalTagsUpdated += results.reduce((sum, count) => sum + count, 0);

      const now = Date.now();
      for (const video of changes.unchanged) {
        const key = this.getVideoKey(video);
        const stored = this.videoHashes.get(key);
        if (stored) {
          stored.lastSeen = now;
        }
      }

      const duration = Date.now() - syncStartTime;
      this.lastSyncDuration = duration;
      
      if (TAG_SYNC_DEBUG) console.log('[TagSync] ✅ Optimized sync completed in', duration.toFixed(2), 'ms, tags updated:', totalTagsUpdated);
      
      this.notifyListeners('syncCompleted', {
        changes,
        tagsUpdated: totalTagsUpdated,
        duration
      });

    } catch (error) {
      console.error('[TagSync] ❌ Sync failed:', error);
      this.notifyListeners('syncFailed', { error });
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Process videos with modified tags (optimized with batching)
   */
  async processModifiedVideos(modifiedVideos) {
    if (modifiedVideos.length === 0) return;
    
    if (TAG_SYNC_DEBUG) console.log('[TagSync] 📝 Processing', modifiedVideos.length, 'modified videos with batch operations');
    const startTime = performance.now();
    
    const tagOperations = [];
    const tagDecrements = [];
    const broadcastOperations = [];
    
    for (const { video, oldTags, newTags } of modifiedVideos) {
      const key = this.getVideoKey(video);
      
      const removedTags = oldTags.filter(tag => !newTags.includes(tag));
      
      const addedTags = newTags.filter(tag => !oldTags.includes(tag));
      
      if (TAG_SYNC_DEBUG) console.log('[TagSync] 📝 Video', key, '- removed:', removedTags.length, 'added:', addedTags.length);

      removedTags.forEach(tag => tagDecrements.push(tag));
      
      addedTags.forEach(tag => {
        tagOperations.push({
          tagName: tag,
          options: {
            usageCount: 1,
            incrementUsage: true
          }
        });
      });

      broadcastOperations.push({ key, oldTags, newTags });

      const newHash = this.calculateVideoHash(video);
      this.videoHashes.set(key, {
        hash: newHash,
        lastSeen: Date.now(),
        tags: [...newTags],
        modified: video.modified || 0
      });
    }
    
    const promises = [];
    
    if (tagDecrements.length > 0) {
      promises.push(this.tagManager.decrementUsageBatch(tagDecrements));
    }
    
    if (tagOperations.length > 0) {
      promises.push(this.tagManager.addTagsBatch(tagOperations));
    }
    
    await Promise.all(promises);
    
    if (window.tagBroadcastSync && broadcastOperations.length > 0) {
      broadcastOperations.forEach(({ key, oldTags, newTags }) => {
        window.tagBroadcastSync.broadcastTagsChanged(key, oldTags, newTags);
      });
    }
    
    const duration = performance.now() - startTime;
    if (TAG_SYNC_DEBUG) console.log('[TagSync] ✅ Batch processed', modifiedVideos.length, 'videos in', duration.toFixed(2), 'ms');
  }

  /**
   * Process removed videos (optimized with batch operations)
   */
  async processRemovedVideos(removedVideos) {
    if (removedVideos.length === 0) return;
    
    if (TAG_SYNC_DEBUG) console.log('[TagSync] 🗑️ Processing', removedVideos.length, 'removed videos with batch operations');
    
    const allTagsToDecrement = [];
    
    for (const { key, tags, reason } of removedVideos) {
      const reasonText = reason === 'video_file_missing' ? '(файл видео удален)' : '';
      if (TAG_SYNC_DEBUG) console.log('[TagSync] 🗑️ Removing video', key, reasonText, 'with', tags.length, 'tags');
      
      allTagsToDecrement.push(...tags);
    }
    
    if (allTagsToDecrement.length > 0) {
      await this.tagManager.decrementUsageBatch(allTagsToDecrement);
    }
  }

  /**
   * Decrement tag usage count (legacy method - use tagManager.decrementUsage)
   */
  async decrementTagUsage(tagName) {
    if (TAG_SYNC_DEBUG) console.log('[TagSync] 📉 Delegating decrement to tagManager for:', tagName);
    await this.tagManager.decrementUsage(tagName, true);
  }
  
  /**
   * Batch decrement tag usage for multiple tags (delegated to tagManager)
   * @param {Array} tagNames - Array of tag names to decrement
   */
  async decrementTagUsageBatch(tagNames) {
    if (TAG_SYNC_DEBUG) console.log('[TagSync] 📉 Delegating batch decrement to tagManager for', tagNames.length, 'tags');
    await this.tagManager.decrementUsageBatch(tagNames);
  }

  /**
   * Remove tag from database (legacy method - use removeTagFromDatabase)
   */
  async removeTag(tagName) {
    const normalized = TagDatabaseSchema.normalizeTagName(tagName);
    await this.removeTagFromDatabase(normalized);
    await this.tagManager.saveDatabase();
    
    if (window.tagBroadcastSync) {
      window.tagBroadcastSync.broadcast('tag_removed', {
        tagName: tagName,
        normalized: normalized,
        timestamp: Date.now()
      });
    }
    
    this.notifyListeners('tagRemoved', { tagName, normalized });
  }
  
  /**
   * Remove tag from database by normalized name (optimized)
   */
  async removeTagFromDatabase(normalizedTagName) {
    if (!this.tagManager.database) return;
    
    delete this.tagManager.database.tags[normalizedTagName];
    
    Object.keys(this.tagManager.database.aliasIndex).forEach(alias => {
      if (this.tagManager.database.aliasIndex[alias] === normalizedTagName) {
        delete this.tagManager.database.aliasIndex[alias];
      }
    });
  }

  /**
   * Queue videos for later sync (when sync is in progress)
   */
  queueVideosForSync(videos) {
    for (const video of videos) {
      const key = this.getVideoKey(video);
      this.changeQueue.add(key);
    }

    if (this.changeQueue.size > this.config.maxQueueSize) {
      const excess = this.changeQueue.size - this.config.maxQueueSize;
      const keysToRemove = Array.from(this.changeQueue).slice(0, excess);
      keysToRemove.forEach(key => this.changeQueue.delete(key));
    }
  }

  /**
   * Start automatic sync interval
   */
  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      if (this.changeQueue.size > 0) {
        if (TAG_SYNC_DEBUG) console.log('[TagSync] ⏰ Auto-sync triggered, queue size:', this.changeQueue.size);
        this.notifyListeners('autoSyncTriggered', { queueSize: this.changeQueue.size });
      }
    }, this.config.autoSyncInterval);

    if (TAG_SYNC_DEBUG) console.log('[TagSync] ⏰ Auto-sync started, interval:', this.config.autoSyncInterval, 'ms');
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      if (TAG_SYNC_DEBUG) console.log('[TagSync] ⏸️ Auto-sync stopped');
    }
  }

  /**
   * Force full resync
   */
  async forceFullResync(allVideos) {
    if (TAG_SYNC_DEBUG) console.log('[TagSync] 🔄 Force full resync requested...');
    
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.videoHashes.clear();
    this.changeQueue.clear();
    
    await this.tagScanner.scanAndBuildDatabase(allVideos, { 
      force: true,
      batchSize: this.config.batchSize 
    });
    
    await this.buildVideoHashMap(allVideos);
    
    if (TAG_SYNC_DEBUG) console.log('[TagSync] ✅ Full resync completed');
    this.notifyListeners('fullResyncCompleted', { videoCount: allVideos.length });
  }

  /**
   * Get sync statistics (enhanced with performance metrics)
   */
  getStats() {
    return {
      videosTracked: this.videoHashes.size,
      queueSize: this.changeQueue.size,
      syncInProgress: this.syncInProgress,
      lastSyncTime: this.lastSyncTime,
      autoSyncEnabled: !!this.syncInterval,
      config: { ...this.config },
      performance: {
        averageHashTime: this._getAverageHashTime(),
        cacheHitRate: this._getCacheHitRate(),
        lastSyncDuration: this.lastSyncDuration || 0
      }
    };
  }
  
  /**
   * Get average hash calculation time (for performance monitoring)
   */
  _getAverageHashTime() {
    return 0;
  }
  
  /**
   * Get cache hit rate (for performance monitoring)
   */
  _getCacheHitRate() {
    return 0;
  }

  /**
   * Add event listener
   */
  addEventListener(listener) {
    this.listeners.add(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Notify listeners
   */
  notifyListeners(event, data = {}) {
    this.listeners.forEach(listener => {
      try {
        listener({ event, data, stats: this.getStats() });
      } catch (error) {
        console.error('[TagSync] Listener error:', error);
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopAutoSync();
    this.videoHashes.clear();
    this.changeQueue.clear();
    this.listeners.clear();
    if (TAG_SYNC_DEBUG) console.log('[TagSync] 🧹 Cleanup completed');
  }
}

window.tagSyncManager = new TagSyncManager(
  window.tagDatabaseManager,
  window.tagScanner
);
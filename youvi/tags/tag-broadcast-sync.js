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
 * Tag Broadcast Sync
 * Synchronizes tag changes across browser tabs
 * Optimized for high-frequency updates and reliability
 */

class TagBroadcastSync {
  constructor(options = {}) {
    this.channel = null;
    this.isInitialized = false;
    this.listeners = new Set();
    this.storageListener = null;
    
    this.messageQueue = [];
    this.throttleTimer = null;
    this.throttleDelay = options.throttleDelay || 50;
    this.batchSize = options.batchSize || 10;
    
    this.processedMessages = new Map();
    this.maxCacheSize = 100;
    this.cleanupInterval = null;
    
    this.debug = options.debug || false;
    
    this.init();
  }

  /**
   * Initialize broadcast channel
   */
  init() {
    if (this.isInitialized) return;
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('youvi_tag_sync');
        this.setupChannelListeners();
        this.isInitialized = true;
        this.log('BroadcastChannel initialized');
      } catch (error) {
        console.warn('[TagBroadcast] BroadcastChannel failed:', error);
        this.fallbackToLocalStorage();
      }
    } else {
      this.log('BroadcastChannel not supported, using localStorage');
      this.fallbackToLocalStorage();
    }
    
    this.startCacheCleanup();
  }

  /**
   * Setup BroadcastChannel listeners
   */
  setupChannelListeners() {
    if (!this.channel) return;

    this.channel.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.channel.onerror = (error) => {
      console.error('[TagBroadcast] Channel error:', error);
    };
  }

  /**
   * Fallback to localStorage for older browsers
   */
  fallbackToLocalStorage() {
    this.isInitialized = true;
    this.storageListener = (event) => {
      if (!event.key || !event.newValue) return;
      if (!event.key.startsWith('youvi_tag_sync_message_')) return;
      try {
        const message = JSON.parse(event.newValue);
        this.handleMessage(message);
      } catch (error) {
        console.error('[TagBroadcast] Failed to parse localStorage message:', error);
      }
    };
    window.addEventListener('storage', this.storageListener);
    this.log('localStorage fallback initialized');
  }

  /**
   * Handle incoming message
   */
  handleMessage(message) {
    const { type, data, timestamp, tabId } = message;
    
    if (tabId === this.getTabId()) {
      return;
    }
    
    const messageKey = `${timestamp}_${type}_${tabId}`;
    if (this.processedMessages.has(messageKey)) {
      this.log('Duplicate message ignored:', messageKey);
      return;
    }
    
    this.processedMessages.set(messageKey, true);
    
    this.log('Message received:', type, data);
    this.notifyListeners(type, data, timestamp);
  }

  /**
   * Get unique tab ID
   */
  getTabId() {
    if (!this._tabId) {
      const existing = sessionStorage.getItem('youvi_tab_id');
      if (existing) {
        this._tabId = existing;
      } else {
        this._tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('youvi_tab_id', this._tabId);
      }
    }
    return this._tabId;
  }

  /**
   * Broadcast a message (with throttling)
   */
  broadcast(type, data) {
    if (!this.isInitialized) {
      console.error('[TagBroadcast] Not initialized');
      return;
    }

    this.messageQueue.push({ type, data });
    
    if (!this.throttleTimer) {
      this.throttleTimer = setTimeout(() => {
        this.flushMessageQueue();
        this.throttleTimer = null;
      }, this.throttleDelay);
    }
  }

  /**
   * Flush message queue (batch processing)
   */
  flushMessageQueue() {
    if (this.messageQueue.length === 0) return;
    
    const batch = this.messageQueue.splice(0, this.batchSize);
    
    for (const { type, data } of batch) {
      this.sendMessage(type, data);
    }
    
    if (this.messageQueue.length > 0) {
      this.throttleTimer = setTimeout(() => {
        this.flushMessageQueue();
        this.throttleTimer = null;
      }, this.throttleDelay);
    }
    
    this.log(`Flushed ${batch.length} messages, ${this.messageQueue.length} remaining`);
  }

  /**
   * Send single message
   */
  sendMessage(type, data) {
    const message = {
      type,
      data,
      timestamp: Date.now(),
      tabId: this.getTabId()
    };

    if (this.channel) {
      try {
        this.channel.postMessage(message);
        this.log('Sent via BroadcastChannel:', type);
      } catch (error) {
        console.error('[TagBroadcast] Broadcast failed:', error);
      }
    } else {
      try {
        const key = `youvi_tag_sync_message_${Date.now()}`;
        const messageStr = JSON.stringify(message);
        localStorage.setItem(key, messageStr);
        this.log('Sent via localStorage:', type);
        
        setTimeout(() => {
          try {
            localStorage.removeItem(key);
          } catch (e) {
          }
        }, 200);
      } catch (error) {
        console.error('[TagBroadcast] localStorage broadcast failed:', error);
      }
    }
  }

  /**
   * Broadcast tag changes
   */
  broadcastTagsChanged(videoName, oldTags, newTags) {
    this.broadcast('tags_changed', {
      videoName,
      oldTags,
      newTags,
      action: 'modified'
    });
  }

  /**
   * Broadcast video added
   */
  broadcastVideoAdded(videoName, tags) {
    this.broadcast('video_added', { videoName, tags });
  }

  /**
   * Broadcast video removed
   */
  broadcastVideoRemoved(videoName, tags) {
    this.broadcast('video_removed', { videoName, tags });
  }

  /**
   * Broadcast metadata changed
   */
  broadcastMetadataChanged(videoName) {
    this.broadcast('metadata_changed', { videoName, timestamp: Date.now() });
  }

  /**
   * Broadcast database updated
   */
  broadcastDatabaseUpdated() {
    this.broadcast('database_updated', { timestamp: Date.now() });
  }

  /**
   * Add event listener
   */
  addEventListener(listener) {
    if (typeof listener !== 'function') {
      console.error('[TagBroadcast] Listener must be a function');
      return;
    }
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
  notifyListeners(type, data, timestamp) {
    if (this.listeners.size === 0) {
      this.log('No listeners for message:', type);
      return;
    }
    
    this.listeners.forEach(listener => {
      try {
        listener({ type, data, timestamp });
      } catch (error) {
        console.error('[TagBroadcast] Listener error:', error);
      }
    });
  }

  /**
   * Start periodic cleanup of processed messages cache
   */
  startCacheCleanup() {
    this.cleanupInterval = setInterval(() => {
      if (this.processedMessages.size > this.maxCacheSize) {
        const toRemove = this.processedMessages.size - this.maxCacheSize;
        let removed = 0;
        
        for (const key of this.processedMessages.keys()) {
          this.processedMessages.delete(key);
          removed++;
          if (removed >= toRemove) break;
        }
        
        this.log(`Cleaned up ${removed} old message records`);
      }
    }, 30000);
  }

  /**
   * Conditional logging
   */
  log(...args) {
    if (this.debug) {
      console.log('[TagBroadcast]', ...args);
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    
    if (this.storageListener) {
      window.removeEventListener('storage', this.storageListener);
      this.storageListener = null;
    }
    
    this.listeners.clear();
    this.processedMessages.clear();
    this.messageQueue.length = 0;
    
    this.log('Cleanup completed');
  }
}

window.tagBroadcastSync = new TagBroadcastSync({
  throttleDelay: 50,
  batchSize: 10,
  debug: false
});


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.tagBroadcastSync.init();
  });
} else {
  window.tagBroadcastSync.init();
}
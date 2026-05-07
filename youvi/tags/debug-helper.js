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
 * Debug Helper for Tag Database System
 * Provides debugging utilities and console commands
 */

const TAG_DEBUG_HELPER_DEBUG = false;

class TagDatabaseDebugger {
  constructor() {
    this.setupConsoleCommands();
  }

  /**
   * Setup console debugging commands
   */
  setupConsoleCommands() {
    window.tagDebug = {
      status: () => this.getSystemStatus(),
      
      refresh: () => this.forceRefresh(),
      
      showDB: () => this.showDatabase(),
      
      syncStats: () => this.getSyncStats(),
      
      testSync: () => this.testSync(),
      
      clearDB: () => this.clearDatabase(),
      
      showHashes: () => this.showVideoHashes(),
      
      compareVideo: (videoName) => this.compareVideo(videoName)
    };

    if (TAG_DEBUG_HELPER_DEBUG) {
      console.log('[TagDebug] 🐛 Debug commands available:');
      console.log('  tagDebug.status() - Check system status');
      console.log('  tagDebug.refresh() - Force refresh database');
      console.log('  tagDebug.showDB() - Show database contents');
      console.log('  tagDebug.syncStats() - Show sync statistics');
      console.log('  tagDebug.testSync() - Test sync with current videos');
      console.log('  tagDebug.clearDB() - Clear database (WARNING!)');
      console.log('  tagDebug.showHashes() - Show video hashes');
      console.log('  tagDebug.compareVideo(name) - Compare video with stored hash');
    }
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      components: {
        manager: !!window.tagDatabaseManager,
        scanner: !!window.tagScanner,
        syncManager: !!window.tagSyncManager,
        metadataWatcher: !!window.metadataWatcher,
        integration: !!window.tagDatabaseIntegration
      },
      initialized: window.tagDatabaseIntegration?.isInitialized || false
    };

    if (window.tagDatabaseManager) {
      status.database = window.tagDatabaseManager.getStats();
    }

    if (window.tagSyncManager) {
      status.sync = window.tagSyncManager.getStats();
    }

    if (window.metadataWatcher) {
      status.watcher = window.metadataWatcher.getStats();
    }

    console.log('🔍 Tag Database System Status:', status);
    return status;
  }

  /**
   * Force refresh database
   */
  async forceRefresh() {
    console.log('🔄 Forcing database refresh...');
    
    try {
      if (window.tagDatabaseIntegration?.forceFullResync) {
        await window.tagDatabaseIntegration.forceFullResync();
        console.log('✅ Database refreshed successfully');
      } else {
        console.error('❌ Integration not available');
      }
    } catch (error) {
      console.error('❌ Refresh failed:', error);
    }
  }

  /**
   * Show database contents
   */
  showDatabase() {
    if (!window.tagDatabaseManager?.database) {
      console.log('❌ Database not available');
      return;
    }

    const db = window.tagDatabaseManager.database;
    console.log('📊 Database Contents:');
    console.log('  Version:', db.version);
    console.log('  Last Updated:', new Date(db.lastUpdated).toISOString());
    console.log('  Total Tags:', Object.keys(db.tags).length);
    console.log('  Alias Index Size:', Object.keys(db.aliasIndex).length);
    
    const sortedTags = Object.entries(db.tags)
      .sort(([,a], [,b]) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 10);
    
    console.log('  Top 10 Tags:');
    sortedTags.forEach(([key, tag]) => {
      console.log(`    ${tag.canonical} (${tag.usageCount || 0} uses)`);
    });

    return db;
  }

  /**
   * Get sync statistics
   */
  getSyncStats() {
    if (!window.tagSyncManager) {
      console.log('❌ Sync manager not available');
      return;
    }

    const stats = window.tagSyncManager.getStats();
    console.log('🔄 Sync Statistics:', stats);
    return stats;
  }

  /**
   * Test sync with current videos
   */
  async testSync() {
    console.log('🧪 Testing sync with current videos...');
    
    if (!window.tagSyncManager || !window.tagDatabaseIntegration?.currentVideos) {
      console.log('❌ Required components not available');
      return;
    }

    try {
      const videos = window.tagDatabaseIntegration.currentVideos;
      console.log('📹 Current videos:', videos.length);
      
      await window.tagSyncManager.checkAndSync(videos);
      console.log('✅ Sync test completed');
    } catch (error) {
      console.error('❌ Sync test failed:', error);
    }
  }

  /**
   * Clear database (WARNING!)
   */
  async clearDatabase() {
    const confirm = window.confirm('⚠️ WARNING: This will clear the entire tag database! Are you sure?');
    if (!confirm) return;

    console.log('🗑️ Clearing database...');
    
    try {
      if (window.tagDatabaseManager) {
        window.tagDatabaseManager.database = window.TagDatabaseSchema.createEmpty();
        await window.tagDatabaseManager.saveDatabase();
        console.log('✅ Database cleared');
        
        if (window.tagDatabaseIntegration?.buildTagCloudFromDatabase) {
          window.tagDatabaseIntegration.buildTagCloudFromDatabase();
        }
      }
    } catch (error) {
      console.error('❌ Clear failed:', error);
    }
  }

  /**
   * Show video hashes
   */
  showVideoHashes() {
    if (!window.tagSyncManager?.videoHashes) {
      console.log('❌ Video hashes not available');
      return;
    }

    const hashes = window.tagSyncManager.videoHashes;
    console.log('🔢 Video Hashes (' + hashes.size + ' videos):');
    
    for (const [key, data] of hashes.entries()) {
      console.log(`  ${key}:`, {
        hash: data.hash,
        tags: data.tags.length,
        modified: new Date(data.modified).toISOString(),
        lastSeen: new Date(data.lastSeen).toISOString()
      });
    }

    return Array.from(hashes.entries());
  }

  /**
   * Compare video with stored hash
   */
  compareVideo(videoName) {
    if (!window.tagSyncManager?.videoHashes || !window.tagDatabaseIntegration?.currentVideos) {
      console.log('❌ Required data not available');
      return;
    }

    const videos = window.tagDatabaseIntegration.currentVideos;
    const video = videos.find(v => v.name === videoName || v.name?.includes(videoName));
    
    if (!video) {
      console.log('❌ Video not found:', videoName);
      return;
    }

    const stored = window.tagSyncManager.videoHashes.get(window.tagSyncManager.getVideoKey(video));
    const currentHash = window.tagSyncManager.calculateVideoHash(video);

    console.log('🔍 Video Comparison for:', video.name);
    console.log('  Current Hash:', currentHash);
    console.log('  Stored Hash:', stored?.hash || 'not found');
    console.log('  Current Tags:', video.tags || []);
    console.log('  Stored Tags:', stored?.tags || []);
    console.log('  Hash Match:', currentHash === stored?.hash);
    console.log('  Tags Match:', JSON.stringify(video.tags || []) === JSON.stringify(stored?.tags || []));

    return {
      video,
      stored,
      currentHash,
      hashMatch: currentHash === stored?.hash,
      tagsMatch: JSON.stringify(video.tags || []) === JSON.stringify(stored?.tags || [])
    };
  }
}

const tagDebugger = new TagDatabaseDebugger();

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  setTimeout(() => {
    if (TAG_DEBUG_HELPER_DEBUG) console.log('[TagDebug] 🚀 Auto-running status check in development mode');
    tagDebugger.getSystemStatus();
  }, 2000);
}
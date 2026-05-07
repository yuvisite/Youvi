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
 * Metadata Watcher
 * Monitors changes in video metadata files and triggers tag database updates
 */

const METADATA_WATCHER_DEBUG = false;

class MetadataWatcher {
  constructor(tagSyncManager) {
    this.syncManager = tagSyncManager;
    this.videoDirectoryHandle = null;
    this.isWatching = false;
    this.watchInterval = null;
    this.metadataCache = new Map();
    this.lastScanTime = 0;
    this.listeners = new Set();
    
    this.config = {
      watchInterval: 30000,
      batchDelay: 2000,
      maxCacheSize: 50000,
      incrementalScan: true,
      maxBatchSize: 100
    };
    
    this.pendingChanges = new Set();
    this.changeTimeout = null;
  }

  /**
   * Initialize metadata watcher
   * @param {FileSystemDirectoryHandle} videoDirectoryHandle
   * @param {Array} allVideos - Current video list
   */
  async initialize(videoDirectoryHandle, allVideos) {
    this.videoDirectoryHandle = videoDirectoryHandle;
    
    if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 👀 Initializing metadata watcher...');
    
    await this.buildMetadataCache(allVideos);
    
    this.startWatching();
    
    if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] ✅ Metadata watcher initialized');
  }

  /**
   * Build cache of metadata file timestamps
   */
  async buildMetadataCache(allVideos) {
    if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 📊 Building metadata cache...');
    
    this.metadataCache.clear();
    
    try {
      const metadataDir = await this.videoDirectoryHandle.getDirectoryHandle('.metadata', { create: false });
      
      for await (const [name, handle] of metadataDir.entries()) {
        if (handle.kind === 'file' && name.endsWith('.meta.json')) {
          try {
            const file = await handle.getFile();
            const videoName = name.replace('.meta.json', '');
            
            this.metadataCache.set(videoName, {
              lastModified: file.lastModified,
              size: file.size,
              handle: handle
            });
          } catch (error) {
            console.warn('[MetadataWatcher] Failed to read metadata file:', name, error);
          }
        }
      }
      
      if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 📊 Cached', this.metadataCache.size, 'metadata files');
      
    } catch (error) {
      console.warn('[MetadataWatcher] No metadata directory found or accessible:', error);
    }
  }

  /**
   * Start watching for metadata changes
   */
  startWatching() {
    if (this.isWatching) return;
    
    this.isWatching = true;
    this.lastScanTime = Date.now();
    
    this.watchInterval = setInterval(async () => {
      await this.checkForChanges();
    }, this.config.watchInterval);
    
    if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 👀 Started watching metadata changes');
  }

  /**
   * Stop watching
   */
  stopWatching() {
    if (!this.isWatching) return;
    
    this.isWatching = false;
    
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout);
      this.changeTimeout = null;
    }
    
    if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] ⏸️ Stopped watching metadata changes');
  }

  /**
   * Check for metadata file changes with incremental scanning
   */
  async checkForChanges() {
    if (!this.videoDirectoryHandle) return;
    
    try {
      const metadataDir = await this.videoDirectoryHandle.getDirectoryHandle('.metadata', { create: false });
      const currentFiles = new Map();
      const changes = [];
      let processedCount = 0;
      
      const filesToProcess = [];
      
      for await (const [name, handle] of metadataDir.entries()) {
        if (handle.kind === 'file' && name.endsWith('.meta.json')) {
          const videoName = name.replace('.meta.json', '');
          const cached = this.metadataCache.get(videoName);
          
          if (!cached || this.config.incrementalScan) {
            filesToProcess.push({ name, handle, videoName, cached });
          } else {
            currentFiles.set(videoName, cached);
          }
        }
      }
      
      for (let i = 0; i < filesToProcess.length; i += this.config.maxBatchSize) {
        const batch = filesToProcess.slice(i, i + this.config.maxBatchSize);
        
        await Promise.all(batch.map(async ({ name, handle, videoName, cached }) => {
          try {
            const file = await handle.getFile();
            
            if (cached && cached.lastModified === file.lastModified && cached.size === file.size) {
              currentFiles.set(videoName, cached);
              return;
            }
            
            const videoExists = cached?.videoExists ?? await this.checkVideoFileExists(videoName);
            
            const fileInfo = {
              lastModified: file.lastModified,
              size: file.size,
              handle: handle,
              videoExists: videoExists
            };
            
            currentFiles.set(videoName, fileInfo);
            
            if (!cached) {
              changes.push({
                type: 'added',
                videoName,
                file: file,
                handle: handle,
                videoExists: videoExists
              });
            } else if (cached.lastModified !== file.lastModified || cached.size !== file.size) {
              changes.push({
                type: 'modified',
                videoName,
                file: file,
                handle: handle,
                oldModified: cached.lastModified,
                videoExists: videoExists
              });
            } else if (cached.videoExists && !videoExists) {
              changes.push({
                type: 'video_deleted',
                videoName,
                file: file,
                handle: handle
              });
            }
            
            processedCount++;
          } catch (error) {
            console.warn('[MetadataWatcher] Failed to read metadata file:', name, error);
          }
        }));
        
        if (i + this.config.maxBatchSize < filesToProcess.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      for (const [videoName, cached] of this.metadataCache.entries()) {
        if (!currentFiles.has(videoName)) {
          changes.push({
            type: 'removed',
            videoName
          });
        }
      }
      
      this.metadataCache = currentFiles;
      
      if (changes.length > 0) {
        if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 🔍 Detected', changes.length, 'metadata changes from', processedCount, 'processed files');
        const startTime = performance.now();
        await this.processMetadataChanges(changes);
        const duration = performance.now() - startTime;
        
        if (duration > 1000) {
          console.warn('[MetadataWatcher] ⚠️ Slow change processing:', duration.toFixed(2), 'ms');
        }
      } else if (processedCount > 0) {
        if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] ✅ No changes detected in', processedCount, 'processed files');
      }
      
    } catch (error) {
      console.warn('[MetadataWatcher] Error checking for changes:', error);
    }
  }

  /**
   * Process detected metadata changes
   */
  async processMetadataChanges(changes) {
    const videoUpdates = [];
    const orphanedMetadata = [];
    
    for (const change of changes) {
      try {
        if (change.type === 'added' || change.type === 'modified') {
          if (!change.videoExists) {
            console.warn('[MetadataWatcher] ⚠️ Orphaned metadata (video file missing):', change.videoName);
            orphanedMetadata.push(change.videoName);
            continue;
          }
          
          const text = await change.file.text();
          const metadata = JSON.parse(text);
          
          const video = await this.findVideoByName(change.videoName);
          if (video) {
            const updatedVideo = {
              ...video,
              ...metadata,
              _metadataModified: change.file.lastModified
            };
            
            videoUpdates.push(updatedVideo);
            
            if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 📝 Updated metadata for:', change.videoName);
          } else {
            console.warn('[MetadataWatcher] ⚠️ Video file not found for metadata:', change.videoName);
            orphanedMetadata.push(change.videoName);
          }
        } else if (change.type === 'removed') {
          if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 🗑️ Metadata removed for:', change.videoName);
          this.pendingChanges.add(change.videoName);
        } else if (change.type === 'video_deleted') {
          console.warn('[MetadataWatcher] 🗑️ Video file deleted (metadata orphaned):', change.videoName);
          orphanedMetadata.push(change.videoName);
          this.pendingChanges.add(change.videoName);
        }
      } catch (error) {
        console.error('[MetadataWatcher] Error processing change for', change.videoName, ':', error);
      }
    }
    
    if (orphanedMetadata.length > 0) {
      this.notifyListeners('orphanedMetadataDetected', {
        count: orphanedMetadata.length,
        videos: orphanedMetadata
      });
    }
    
    if (videoUpdates.length > 0) {
      this.queueVideoUpdates(videoUpdates);
    }
    
    this.notifyListeners('metadataChanged', {
      changes: changes.length,
      updates: videoUpdates.length
    });
  }

  /**
   * Check if video file exists
   * @param {string} videoName - Video name without extension
   * @returns {Promise<boolean>} True if video file exists
   */
  async checkVideoFileExists(videoName) {
    try {
      const video = await this.findVideoByName(videoName);
      return video !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find video file by name
   */
  async findVideoByName(videoName) {
    try {
      const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v'];
      
      for (const ext of videoExtensions) {
        try {
          const handle = await this.videoDirectoryHandle.getFileHandle(videoName + ext);
          const file = await handle.getFile();
          
          return {
            name: videoName + ext,
            handle: handle,
            file: file,
            size: file.size,
            modified: file.lastModified
          };
        } catch (e) {
        }
      }
      
      for await (const [name, handle] of this.videoDirectoryHandle.entries()) {
        if (handle.kind === 'directory') {
          try {
            const video = await this.findVideoInDirectory(handle, videoName);
            if (video) return video;
          } catch (e) {
          }
        }
      }
      
    } catch (error) {
      console.warn('[MetadataWatcher] Error finding video:', videoName, error);
    }
    
    return null;
  }

  /**
   * Find video in subdirectory
   */
  async findVideoInDirectory(dirHandle, videoName) {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v'];
    
    for (const ext of videoExtensions) {
      try {
        const handle = await dirHandle.getFileHandle(videoName + ext);
        const file = await handle.getFile();
        
        return {
          name: videoName + ext,
          handle: handle,
          file: file,
          size: file.size,
          modified: file.lastModified,
          dirHandle: dirHandle
        };
      } catch (e) {
      }
    }
    
    return null;
  }

  /**
   * Queue video updates for batched processing
   */
  queueVideoUpdates(videoUpdates) {
    for (const video of videoUpdates) {
      this.pendingChanges.add(video.name);
    }
    
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout);
    }
    
    this.changeTimeout = setTimeout(async () => {
      await this.processPendingChanges(videoUpdates);
      this.pendingChanges.clear();
      this.changeTimeout = null;
    }, this.config.batchDelay);
  }

  /**
   * Process pending changes
   */
  async processPendingChanges(videoUpdates) {
    if (videoUpdates.length === 0) return;
    
    if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 🔄 Processing', videoUpdates.length, 'pending video updates');
    
    try {
      await this.syncManager.checkAndSync(videoUpdates, { force: true });
      
      this.notifyListeners('changesProcessed', {
        videoCount: videoUpdates.length,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('[MetadataWatcher] Error processing pending changes:', error);
      this.notifyListeners('processingError', { error });
    }
  }

  /**
   * Force refresh of all metadata
   */
  async forceRefresh() {
    if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 🔄 Force refreshing all metadata...');
    
    try {
      const wasWatching = this.isWatching;
      this.stopWatching();
      
      this.metadataCache.clear();
      
      const allVideos = await this.getAllVideos();
      await this.buildMetadataCache(allVideos);
      
      if (wasWatching) {
        this.startWatching();
      }
      
      if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] ✅ Force refresh completed');
      this.notifyListeners('forceRefreshCompleted', {
        videoCount: allVideos.length,
        metadataCount: this.metadataCache.size
      });
      
    } catch (error) {
      console.error('[MetadataWatcher] Force refresh failed:', error);
      this.notifyListeners('forceRefreshFailed', { error });
    }
  }

  /**
   * Get all videos from directory (helper method)
   */
  async getAllVideos() {
    const videos = [];
    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v'];
    
    try {
      for await (const [name, handle] of this.videoDirectoryHandle.entries()) {
        if (handle.kind === 'file') {
          const isVideo = videoExtensions.some(ext => name.toLowerCase().endsWith(ext));
          if (isVideo) {
            const file = await handle.getFile();
            videos.push({
              name,
              handle,
              file,
              size: file.size,
              modified: file.lastModified
            });
          }
        }
      }
    } catch (error) {
      console.error('[MetadataWatcher] Error getting all videos:', error);
    }
    
    return videos;
  }

  /**
   * Get watcher statistics
   */
  getStats() {
    return {
      isWatching: this.isWatching,
      metadataCacheSize: this.metadataCache.size,
      pendingChanges: this.pendingChanges.size,
      lastScanTime: this.lastScanTime,
      config: { ...this.config }
    };
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
        console.error('[MetadataWatcher] Listener error:', error);
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopWatching();
    this.metadataCache.clear();
    this.pendingChanges.clear();
    this.listeners.clear();
    if (METADATA_WATCHER_DEBUG) console.log('[MetadataWatcher] 🧹 Cleanup completed');
  }
}

window.metadataWatcher = new MetadataWatcher(window.tagSyncManager);
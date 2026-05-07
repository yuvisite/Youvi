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
 * Utility to recover lost metadata
 * Use in browser console if metadata was accidentally cleared
 */

window.recoverMetadata = {
  /**
   * Check if video has metadata
   */
  checkVideo: async (videoName) => {
    if (!window.currentPlaylistHandle) {
      console.error('❌ No playlist handle available');
      return null;
    }
    
    try {
      const metadata = await getVideoMetadata(window.currentPlaylistHandle, videoName);
      console.log('Metadata for', videoName, ':', metadata);
      return metadata;
    } catch (error) {
      console.error('❌ Failed to load metadata:', error);
      return null;
    }
  },
  
  /**
   * Restore metadata with specific tags
   */
  restoreMetadata: async (videoName, tags) => {
    if (!window.currentPlaylistHandle) {
      console.error('❌ No playlist handle available');
      return false;
    }
    
    try {
      const metadata = {
        views: 0,
        likes: 0,
        dislikes: 0,
        tags: tags,
        created: Date.now(),
        description: ''
      };
      
      await saveVideoMetadata(window.currentPlaylistHandle, videoName, metadata);
      console.log('✅ Metadata restored for', videoName);
      return true;
    } catch (error) {
      console.error('❌ Failed to restore metadata:', error);
      return false;
    }
  },
  
  /**
   * List all metadata files
   */
  listAll: async () => {
    if (!window.currentPlaylistHandle) {
      console.error('❌ No playlist handle available');
      return [];
    }
    
    try {
      const metaDir = await window.currentPlaylistHandle.getDirectoryHandle('.metadata', { create: false });
      const files = [];
      
      for await (const entry of metaDir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.meta.json')) {
          const videoName = entry.name.replace('.meta.json', '');
          const file = await entry.getFile();
          const text = await file.text();
          const metadata = JSON.parse(text);
          
          files.push({
            videoName,
            metadata,
            size: file.size,
            modified: file.lastModified
          });
        }
      }
      
      console.log(`Found ${files.length} metadata files`);
      return files;
    } catch (error) {
      console.error('❌ Failed to list metadata:', error);
      return [];
    }
  },
  
  /**
   * Find videos with empty tags
   */
  findEmpty: async () => {
    const all = await window.recoverMetadata.listAll();
    const empty = all.filter(f => !f.metadata.tags || f.metadata.tags.length === 0);
    
    console.log(`Found ${empty.length} videos with empty tags:`);
    empty.forEach(f => {
      console.log(`  ${f.videoName}`);
    });
    
    return empty;
  },
  
  /**
   * Backup current metadata
   */
  backup: async (videoName) => {
    const metadata = await window.recoverMetadata.checkVideo(videoName);
    if (metadata) {
      const backup = JSON.stringify(metadata, null, 2);
      console.log('Backup (copy this):');
      console.log(backup);
      return backup;
    }
    return null;
  },
  
  /**
   * Restore from backup
   */
  restoreFromBackup: async (videoName, backupJson) => {
    try {
      const metadata = JSON.parse(backupJson);
      await saveVideoMetadata(window.currentPlaylistHandle, videoName, metadata);
      console.log('✅ Restored from backup');
      return true;
    } catch (error) {
      console.error('❌ Failed to restore from backup:', error);
      return false;
    }
  }
};

console.log('✅ Metadata recovery utilities loaded. Use window.recoverMetadata in console.');
console.log('Available commands:');
console.log('  recoverMetadata.checkVideo("video.mp4") - Check video metadata');
console.log('  recoverMetadata.restoreMetadata("video.mp4", ["tag1", "tag2"]) - Restore metadata');
console.log('  recoverMetadata.listAll() - List all metadata files');
console.log('  recoverMetadata.findEmpty() - Find videos with empty tags');
console.log('  recoverMetadata.backup("video.mp4") - Backup metadata');
console.log('  recoverMetadata.restoreFromBackup("video.mp4", json) - Restore from backup');
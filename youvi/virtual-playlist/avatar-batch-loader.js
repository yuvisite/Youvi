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

class AvatarBatchLoader {
    constructor() {
        this.queue = new Map();
        this.cache = new Map();
        this.processing = false;
        this.batchDelay = 50;
        this.batchTimer = null;
    }
    
    async load(channelName) {
        if (this.cache.has(channelName)) {
            return this.cache.get(channelName);
        }
        
        return new Promise((resolve) => {
            if (!this.queue.has(channelName)) {
                this.queue.set(channelName, []);
            }
            this.queue.get(channelName).push(resolve);
            
            this.scheduleBatch();
        });
    }
    
    scheduleBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }
        
        this.batchTimer = setTimeout(() => {
            this.processBatch();
        }, this.batchDelay);
    }
    
    async processBatch() {
        if (this.processing || this.queue.size === 0) {
            return;
        }
        
        this.processing = true;
        const batch = Array.from(this.queue.entries());
        this.queue.clear();
        
        const PARALLEL_LIMIT = 5;
        for (let i = 0; i < batch.length; i += PARALLEL_LIMIT) {
            const chunk = batch.slice(i, i + PARALLEL_LIMIT);
            await Promise.all(chunk.map(async ([channelName, callbacks]) => {
                try {
                    let avatarUrl = null;
                    
                    if (window.loadChannelAvatar) {
                        avatarUrl = await window.loadChannelAvatar(channelName);
                    }
                    
                    this.cache.set(channelName, avatarUrl);
                    
                    callbacks.forEach(callback => callback(avatarUrl));
                } catch (error) {
                    console.error('Error loading avatar for', channelName, error);
                    callbacks.forEach(callback => callback(null));
                }
            }));
        }
        
        this.processing = false;
        
        if (this.queue.size > 0) {
            this.scheduleBatch();
        }
    }
    
    clearCache() {
        this.cache.clear();
    }
    
    getCacheSize() {
        return this.cache.size;
    }
}

window.avatarBatchLoader = new AvatarBatchLoader();
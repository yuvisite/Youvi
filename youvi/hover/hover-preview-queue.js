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
 * Hover Preview Queue System
 * Manages hover video preview operations to prevent conflicts
 */

const HOVER_QUEUE_DEBUG = false;

let currentHoverCleanup = null;

class HoverPreviewQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxConcurrent = 1;
    this.activeCount = 0;
    this.currentHoverElement = null;
  }

  async add(task, priority = 0, element = null) {
    if (element && this.currentHoverElement && this.currentHoverElement !== element) {
      this.clear();
    }
    
    this.queue.push({ task, priority, element, resolve: null, reject: null });
    this.queue.sort((a, b) => b.priority - a.priority);
    
    if (element) {
      this.currentHoverElement = element;
    }
    
    if (!this.processing) {
      this.process();
    }
    
    if (element && this.currentHoverElement === element) {
      this.currentHoverElement = null;
    }
  }

  async process() {
    if (this.processing || this.queue.length === 0 || this.activeCount >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const item = this.queue.shift();
      this.activeCount++;

      try {
        await item.task();
      } catch (e) {
        if (HOVER_QUEUE_DEBUG) console.warn('Hover preview task failed:', e);
      } finally {
        this.activeCount--;
      }
    }

    this.processing = false;
  }

  clear() {
    this.queue = [];
    this.currentHoverElement = null;
  }
}

const hoverPreviewQueue = new HoverPreviewQueue();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HoverPreviewQueue, hoverPreviewQueue, currentHoverCleanup };
} else {
  window.HoverPreviewQueue = HoverPreviewQueue;
  window.hoverPreviewQueue = hoverPreviewQueue;
  window.currentHoverCleanup = currentHoverCleanup;
}
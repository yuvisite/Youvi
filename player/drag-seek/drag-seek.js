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
 * Drag-to-Seek Module
 * Allows users to seek through video by clicking and dragging horizontally within the player
 * The seek position is proportional to the horizontal mouse position relative to player width
 */

const DRAG_SEEK_DEBUG = false;

class DragSeek {
    constructor(videoElement, containerElement) {
        this.video = videoElement;
        this.container = containerElement;
        this.isDragging = false;
        this.isMouseDown = false;
        this.hasMoved = false;
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.seekPreview = null;
        this.dragThreshold = 10;
        this.enabled = true; 
        
        const savedState = localStorage.getItem("video_dragseek_enabled");
        if (savedState !== null) {
            this.enabled = savedState !== "false";
        }
        
        this.init();
    }
    
    init() {
        this.createSeekPreview();
        
        this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        this.container.addEventListener('selectstart', (e) => {
            if (this.isDragging) {
                e.preventDefault();
            }
        });
    }
    
    createSeekPreview() {
        this.seekPreview = document.createElement('div');
        this.seekPreview.className = 'drag-seek-preview';
        this.seekPreview.style.display = 'none';
        
        const timeDisplay = document.createElement('div');
        timeDisplay.className = 'drag-seek-time';
        timeDisplay.textContent = '00:00';
        
        const indicator = document.createElement('div');
        indicator.className = 'drag-seek-indicator';
        
        this.seekPreview.appendChild(indicator);
        this.seekPreview.appendChild(timeDisplay);
        this.container.appendChild(this.seekPreview);
    }
    
    handleMouseDown(e) {
        if (e.button !== 0) return;
        
        if (!this.enabled) return;
        
        if (window.videoSpeedLocked) return;
        
        if (this.isInteractiveElement(e.target)) return;
        
        this.isMouseDown = true;
        this.hasMoved = false;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.currentX = e.clientX;
        
    }
    
    handleMouseMove(e) {
        if (!this.isMouseDown) return;
        
        if (window.videoSpeedLocked) {
            this.isMouseDown = false;
            return;
        }
        
        const deltaX = Math.abs(e.clientX - this.startX);
        const deltaY = Math.abs(e.clientY - this.startY);
        const totalDelta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (!this.isDragging && totalDelta > this.dragThreshold) {
            if (window.videoSpeedHoldTimer) {
                clearTimeout(window.videoSpeedHoldTimer);
                window.videoSpeedHoldTimer = null;
            }
            
            if (window.videoSpeedHolding !== undefined) {
                window.videoSpeedHolding = false;
            }
            
            this.isDragging = true;
            this.hasMoved = true;
            
            this.container.style.cursor = 'ew-resize';
            
            this.container.classList.add('drag-seeking');
            
            this.seekPreview.style.display = 'flex';
        }
        
        if (window.videoSpeedHolding) {
            return;
        }
        
        if (!this.isDragging) return;
        
        this.currentX = e.clientX;
        this.updateSeekPreview(e);
        this.performSeek(e);
        
        e.preventDefault();
    }
    
    handleMouseUp(e) {
        this.isMouseDown = false;
        
        if (!this.isDragging) {
            return;
        }
        
        this.isDragging = false;
        this.hasMoved = false;
        this.container.style.cursor = '';
        this.seekPreview.style.display = 'none';
        
        this.container.classList.remove('drag-seeking');
        
        if (typeof window !== 'undefined') {
            window.suppressNextVideoClick = true;
            setTimeout(() => {
                window.suppressNextVideoClick = false;
            }, 50);
        }
        
        e.preventDefault();
        e.stopPropagation();
    }
    
    updateSeekPreview(e) {
        const rect = this.container.getBoundingClientRect();
        const percentage = this.calculateSeekPercentage(e.clientX, rect);
        const targetTime = (percentage / 100) * this.video.duration;
        
        this.seekPreview.style.left = `${percentage}%`;
        
        const timeDisplay = this.seekPreview.querySelector('.drag-seek-time');
        timeDisplay.textContent = this.formatTime(targetTime);
        
        const indicator = this.seekPreview.querySelector('.drag-seek-indicator');
        if (percentage > (this.video.currentTime / this.video.duration) * 100) {
            indicator.style.borderLeftColor = '#00cc66';
        } else {
            const accentColor = getComputedStyle(document.body).getPropertyValue('--channel-accent').trim() || '#ff69b4';
            indicator.style.borderLeftColor = accentColor;
        }
    }
    
    performSeek(e) {
        if (!this.video.duration) return;
        
        const rect = this.container.getBoundingClientRect();
        const percentage = this.calculateSeekPercentage(e.clientX, rect);
        const targetTime = (percentage / 100) * this.video.duration;
        
        if (!isNaN(targetTime) && targetTime >= 0 && targetTime <= this.video.duration) {
            this.video.currentTime = targetTime;
            
            if (typeof window.updateDanmakuTimePreview === 'function') {
                window.updateDanmakuTimePreview(targetTime);
            }
        }
    }
    
    calculateSeekPercentage(clientX, rect) {
        const x = clientX - rect.left;
        const width = rect.width;
        
        let percentage = (x / width) * 100;
        
        percentage = Math.max(0, Math.min(100, percentage));
        
        return percentage;
    }
    
    isInteractiveElement(element) {
        const interactiveSelectors = [
            'button',
            'a',
            'input',
            'select',
            'textarea',
            '.video-controls',
            '.progress-bar',
            '.control-btn',
            '.play-btn',
            '.settings-menu',
            '[role="button"]',
            '[tabindex]'
        ];
        
        for (const selector of interactiveSelectors) {
            if (element.matches(selector) || element.closest(selector)) {
                return true;
            }
        }
        
        return false;
    }
    
    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
        
        if (!enabled && this.isDragging) {
            this.isDragging = false;
            this.isMouseDown = false;
            this.hasMoved = false;
            this.container.style.cursor = '';
            this.seekPreview.style.display = 'none';
            this.container.classList.remove('drag-seeking');
        }
    }
    
    destroy() {
        this.container.removeEventListener('mousedown', this.handleMouseDown);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        
        if (this.seekPreview && this.seekPreview.parentNode) {
            this.seekPreview.parentNode.removeChild(this.seekPreview);
        }
    }
}

if (typeof window !== 'undefined') {
    window.DragSeek = DragSeek;
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDragSeek);
    } else {
        initDragSeek();
    }
}

function initDragSeek() {
    setTimeout(() => {
        const video = document.getElementById('video') || document.querySelector('video');
        const container = document.querySelector('.video-container') || 
                         document.querySelector('.video-player') ||
                         video?.parentElement;
        
        if (video && container) {
            window.dragSeekInstance = new DragSeek(video, container);
            if (DRAG_SEEK_DEBUG) console.log('DragSeek module initialized');
        }
    }, 500);
}
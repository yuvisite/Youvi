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
 * Timecode Loop Module
 * Right-click on description timecode shows context menu to loop from that timecode to next one
 * Uses existing AB repeat system (Shift+click on progress bar)
 */

const TIMECODE_LOOP_DEBUG = false;

(function() {
    'use strict';
    
    let contextMenuTarget = null;
    let contextMenuTimecodes = null;
    let contextMenuIndex = null;
    
    /**
     * Show context menu at cursor position
     */
    window.showTimecodeContextMenu = function(e, timecodeElement, allTimecodes, currentIndex) {
        e.preventDefault();
        e.stopPropagation();
        
        const menu = document.getElementById('timecodeContextMenu');
        if (!menu) {
            console.error('Timecode context menu element not found!');
            return;
        }
        
        contextMenuTarget = timecodeElement;
        contextMenuTimecodes = allTimecodes;
        contextMenuIndex = currentIndex;
        
        const hasActiveLoop = window.abSegmentA !== null && window.abSegmentB !== null;
        
        const loopBtn = menu.querySelector('[data-action="loop"]');
        const exitLoopBtn = menu.querySelector('[data-action="exit-loop"]');
        
        if (hasActiveLoop) {
            loopBtn.style.display = 'block';
            exitLoopBtn.style.display = 'block';
        } else {
            loopBtn.style.display = 'block';
            exitLoopBtn.style.display = 'none';
        }
        
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.classList.add('show');
    };
    
    /**
     * Hide context menu
     */
    window.hideTimecodeContextMenu = function() {
        const menu = document.getElementById('timecodeContextMenu');
        if (menu) {
            menu.classList.remove('show');
        }
        contextMenuTarget = null;
        contextMenuTimecodes = null;
        contextMenuIndex = null;
    };
    
    /**
     * Set loop from current timecode to next timecode in list
     */
    window.setTimecodeLoopToNext = function() {
        if (!contextMenuTarget || contextMenuTimecodes === null || contextMenuIndex === null) return;
        
        const startTime = parseFloat(contextMenuTarget.dataset.time);
        if (isNaN(startTime)) return;
        
        const video = document.querySelector('video');
        if (!video) return;
        
        let endTime;
        if (contextMenuIndex < contextMenuTimecodes.length - 1) {
            const nextTimecode = contextMenuTimecodes[contextMenuIndex + 1];
            endTime = parseFloat(nextTimecode.dataset.time);
            if (isNaN(endTime)) {
                endTime = video.duration;
            }
        } else {
            endTime = video.duration;
        }
        
        window.abSegmentA = startTime;
        window.abSegmentB = endTime;
        window.abSegmentMode = 2;
        
        if (typeof window.updateABMarkers === 'function') {
            window.updateABMarkers();
        }
        
        const currentTime = video.currentTime;
        if (currentTime < startTime || currentTime >= endTime) {
            video.currentTime = startTime;
        }
        video.play();
        
        if (TIMECODE_LOOP_DEBUG) console.log(`Loop set: ${formatTime(startTime)} - ${formatTime(endTime)}`);
    };
    
    /**
     * Exit current loop using existing AB repeat system
     */
    window.exitTimecodeLoop = function() {
        window.abSegmentA = null;
        window.abSegmentB = null;
        window.abSegmentMode = 0;
        
        if (typeof window.updateABMarkers === 'function') {
            window.updateABMarkers();
        }
        
        if (TIMECODE_LOOP_DEBUG) console.log('Loop exited');
    };
    
    /**
     * Format time in MM:SS format
     */
    function formatTime(seconds) {
        if (typeof window.formatDuration === 'function') {
            return window.formatDuration(seconds);
        }
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    /**
     * Initialize context menu handlers
     */
    function initContextMenu() {
        const menu = document.getElementById('timecodeContextMenu');
        if (!menu) {
            console.warn('Timecode context menu element not found during initialization');
            return;
        }
        
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.timecode-context-menu-item');
            if (!item) return;
            
            const action = item.dataset.action;
            
            if (action === 'loop') {
                window.setTimecodeLoopToNext();
            } else if (action === 'exit-loop') {
                window.exitTimecodeLoop();
            }
            
            window.hideTimecodeContextMenu();
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#timecodeContextMenu')) {
                window.hideTimecodeContextMenu();
            }
        });
        
        document.addEventListener('scroll', window.hideTimecodeContextMenu);
        
        if (TIMECODE_LOOP_DEBUG) console.log('Timecode loop module initialized');
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initContextMenu);
    } else {
        initContextMenu();
    }
})();
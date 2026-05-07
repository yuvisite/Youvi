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
 * Danmaku Scroll Sync Module
 * Синхронизация позиции скролла между сайдбаром и панелью в плеере
 * для всех режимов: widescreen, cinema, fullscreen
 */
(function() {
    'use strict';

    function saveSidebarScrollPosition() {
        const sidebarPanel = document.getElementById('sidebarPanelCombined');
        const isCollapsed = sidebarPanel && sidebarPanel.classList.contains('collapsed');
        
        if (isCollapsed) {
            console.log('[DanmakuScrollSync] Sidebar is collapsed, skipping save');
            return;
        }
        
        const danmakuTab = document.getElementById('danmakuTabContent');
        if (danmakuTab && danmakuTab.scrollHeight > 0) {
            window._savedDanmakuScrollTop = danmakuTab.scrollTop;
            const maxScroll = danmakuTab.scrollHeight - danmakuTab.clientHeight;
            window._savedDanmakuScrollRatio = maxScroll > 0 ? danmakuTab.scrollTop / maxScroll : 0;
            console.log('[DanmakuScrollSync] Saved sidebar scroll:', window._savedDanmakuScrollTop);
        }
    }
    
    function savePanelScrollPosition() {
        const panelList = document.getElementById('danmakuPanelList');
        const panelOverlay = document.getElementById('danmakuPanelOverlay');
        const panelWasOpen = panelOverlay && panelOverlay.classList.contains('open');
        
        if (panelList && panelList.scrollHeight > 0 && panelWasOpen) {
            window._savedPanelScrollTop = panelList.scrollTop;
            window._panelWasUsed = true;
            console.log('[DanmakuScrollSync] Saved panel scroll:', window._savedPanelScrollTop);
        } else {
            console.log('[DanmakuScrollSync] Panel was not open, keeping sidebar scroll');
        }
    }

    function syncPanelScrollPosition(panelList) {
        if (!panelList) return;
        
        window._danmakuPanelSkipSmoothScroll = true;
        
        requestAnimationFrame(() => {
            let targetScrollTop = null;
            
            if (window._danmakuFollowEnabled) {
                targetScrollTop = getScrollTopForCurrentTime(panelList, '.danmaku-panel-item', 'data-time');
            }
            
            if (targetScrollTop !== null) {
                panelList.scrollTop = targetScrollTop;
            } else if (window._panelWasUsed && typeof window._savedPanelScrollTop === 'number') {
                panelList.scrollTop = window._savedPanelScrollTop;
            } else if (typeof window._savedDanmakuScrollTop === 'number') {
                const sidebarPanel = document.getElementById('sidebarPanelCombined');
                const wasCollapsed = sidebarPanel && sidebarPanel.classList.contains('collapsed');
                if (!wasCollapsed) {
                    panelList.scrollTop = window._savedDanmakuScrollTop;
                }
            }
        });
    }

    function syncSidebarScrollPosition(danmakuContent) {
        if (!danmakuContent) return;
        
        const sidebarPanel = document.getElementById('sidebarPanelCombined');
        const isCollapsed = sidebarPanel && sidebarPanel.classList.contains('collapsed');
        
        if (isCollapsed) {
            console.log('[DanmakuScrollSync] Sidebar is collapsed, keeping saved position for later');
            return;
        }
        
        window._danmakuSkipSmoothScroll = true;
        
        console.log('[DanmakuScrollSync] syncSidebarScrollPosition called');
        console.log('[DanmakuScrollSync] _savedDanmakuScrollTop:', window._savedDanmakuScrollTop);
        console.log('[DanmakuScrollSync] _savedPanelScrollTop:', window._savedPanelScrollTop);
        console.log('[DanmakuScrollSync] _panelWasUsed:', window._panelWasUsed);
        console.log('[DanmakuScrollSync] _danmakuFollowEnabled:', window._danmakuFollowEnabled);
        
        setTimeout(() => {
            let targetScrollTop = null;
            
            if (window._danmakuFollowEnabled) {
                targetScrollTop = getScrollTopForCurrentTime(danmakuContent, '.danmaku-comment-item', null);
                console.log('[DanmakuScrollSync] Follow enabled, targetScrollTop:', targetScrollTop);
            }
            
            if (targetScrollTop !== null) {
                danmakuContent.scrollTop = targetScrollTop;
                console.log('[DanmakuScrollSync] Set scroll to current time:', targetScrollTop);
            } else if (window._panelWasUsed && typeof window._savedPanelScrollTop === 'number') {
                danmakuContent.scrollTop = window._savedPanelScrollTop;
                console.log('[DanmakuScrollSync] Set scroll from panel:', window._savedPanelScrollTop);
            } else if (typeof window._savedDanmakuScrollTop === 'number') {
                danmakuContent.scrollTop = window._savedDanmakuScrollTop;
                console.log('[DanmakuScrollSync] Set scroll from saved sidebar:', window._savedDanmakuScrollTop);
            } else {
                console.log('[DanmakuScrollSync] No saved position found!');
            }
            
            window._panelWasUsed = false;
        }, 50);
    }

    function getScrollTopForCurrentTime(container, itemSelector, timeAttr) {
        const video = document.getElementById('video');
        if (!video) return null;
        
        const currentTime = video.currentTime;
        const items = container.querySelectorAll(itemSelector);
        let targetItem = null;
        
        items.forEach(item => {
            let time;
            if (timeAttr) {
                time = parseFloat(item.getAttribute(timeAttr));
            } else {
                const timeSpan = item.querySelector('.danmaku-comment-time');
                if (!timeSpan) return;
                const timeText = timeSpan.textContent;
                const timeParts = timeText.split(':').map(Number);
                time = 0;
                if (timeParts.length === 3) {
                    time = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
                } else if (timeParts.length === 2) {
                    time = timeParts[0] * 60 + timeParts[1];
                }
            }
            
            if (Math.abs(time - currentTime) < 2 && !targetItem) {
                targetItem = item;
            }
        });
        
        if (targetItem) {
            const itemTop = targetItem.offsetTop;
            const listHeight = container.clientHeight;
            const itemHeight = targetItem.offsetHeight;
            return itemTop - (listHeight / 2) + (itemHeight / 2);
        }
        
        return null;
    }

    function scrollToCurrentTime(container, itemSelector, timeAttr) {
        const scrollTop = getScrollTopForCurrentTime(container, itemSelector, timeAttr);
        if (scrollTop !== null) {
            container.scrollTop = scrollTop;
        }
    }

    window.DanmakuScrollSync = {
        saveSidebarScrollPosition,
        savePanelScrollPosition,
        syncPanelScrollPosition,
        syncSidebarScrollPosition,
        scrollToCurrentTime
    };
})();
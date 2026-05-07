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
(function() {
    'use strict';

    const WIDE_MODE_CLASS = 'wide-screen-mode';
    const STORAGE_KEY = 'youvi_wide_mode';

    function initWideMode() {
        const controls = document.querySelector('.video-controls');
        if (!controls) return;

        if (!document.getElementById('wideModeBtn')) {
            const btn = document.createElement('button');
            btn.id = 'wideModeBtn';
            btn.className = 'control-btn';
            btn.title = typeof i18n !== 'undefined' ? i18n.t('player.widescreen', 'Widescreen') : 'Widescreen';
            btn.setAttribute('data-i18n-title', 'player.widescreen');
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor-icon lucide-monitor"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`;
            
            const fullscreenBtn = document.getElementById('fullscreenBtn');
            if (fullscreenBtn) {
                controls.insertBefore(btn, fullscreenBtn);
            } else {
                controls.appendChild(btn);
            }

            btn.addEventListener('click', toggleWideMode);
        }

        if (localStorage.getItem(STORAGE_KEY) === 'true') {
            toggleWideMode(null, true);
        }
    }

    function toggleWideMode(e, forceState) {
        const body = document.body;
        const isWide = typeof forceState === 'boolean' ? forceState : !body.classList.contains(WIDE_MODE_CLASS);

        if (isWide) {
            enableWideMode();
        } else {
            disableWideMode();
        }
    }

    let tabBeforeWidescreen = null;

    function enableWideMode() {
        if (window.DanmakuScrollSync) {
            window.DanmakuScrollSync.saveSidebarScrollPosition();
        }
        
        document.body.classList.add(WIDE_MODE_CLASS);
        localStorage.setItem(STORAGE_KEY, 'true');
        
        const wideModeBtn = document.getElementById('wideModeBtn');
        if (wideModeBtn) {
            wideModeBtn.classList.add('active');
        }
        
        const danmakuTabBtn = document.querySelector('.sidebar-panel-tab[data-tab="danmaku"]');
        const playlistTab = document.querySelector('.sidebar-panel-tab[data-tab="playlist"]');
        
        if (danmakuTabBtn && danmakuTabBtn.classList.contains('active')) {
            tabBeforeWidescreen = 'danmaku';
        } else {
            tabBeforeWidescreen = 'playlist';
        }
        
        if (playlistTab) {
            playlistTab.click();
        }
        
        if (danmakuTabBtn) {
            danmakuTabBtn.disabled = true;
            danmakuTabBtn.style.opacity = '0.5';
            danmakuTabBtn.style.cursor = 'not-allowed';
        }
        
        rearrangeDOMForWideMode();
    }

    function disableWideMode() {
        if (window.DanmakuScrollSync) {
            window.DanmakuScrollSync.savePanelScrollPosition();
        }
        
        document.body.classList.remove(WIDE_MODE_CLASS);
        localStorage.setItem(STORAGE_KEY, 'false');
        
        const wideModeBtn = document.getElementById('wideModeBtn');
        if (wideModeBtn) {
            wideModeBtn.classList.remove('active');
        }
        
        restoreDOM();
        
        const danmakuTabBtn = document.querySelector('.sidebar-panel-tab[data-tab="danmaku"]');
        if (danmakuTabBtn) {
            danmakuTabBtn.disabled = false;
            danmakuTabBtn.style.opacity = '';
            danmakuTabBtn.style.cursor = '';
        }
        
        if (tabBeforeWidescreen === 'danmaku' && danmakuTabBtn) {
            const playlistTab = document.querySelector('.sidebar-panel-tab[data-tab="playlist"]');
            const danmakuContent = document.getElementById('danmakuTabContent');
            const playlistContent = document.getElementById('playlistTabContent');
            const danmakuControls = document.getElementById('danmakuControls');
            const playlistControls = document.getElementById('playlistControls');
            
            if (playlistTab) playlistTab.classList.remove('active');
            danmakuTabBtn.classList.add('active');
            if (danmakuContent) danmakuContent.classList.add('active');
            if (playlistContent) playlistContent.classList.remove('active');
            if (danmakuControls) danmakuControls.style.display = '';
            if (playlistControls) playlistControls.style.display = 'none';
            
            if (window.DanmakuScrollSync && danmakuContent) {
                window.DanmakuScrollSync.syncSidebarScrollPosition(danmakuContent);
            }
        }
        tabBeforeWidescreen = null;
        
        const isCinema = document.body.classList.contains('cinema-mode');
        const isFullscreen = document.fullscreenElement;
        if (!isCinema && !isFullscreen) {
            const panelOverlay = document.getElementById('danmakuPanelOverlay');
            const panelBtn = document.getElementById('danmakuPanelBtn');
            if (panelOverlay) {
                panelOverlay.classList.remove('open');
                panelOverlay.classList.remove('expanded');
            }
            if (panelBtn) {
                panelBtn.classList.remove('active');
            }
        }
        
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }

    function rearrangeDOMForWideMode() {
        const mainContent = document.querySelector('.main-content');
        const rightSidebar = document.querySelector('.right-sidebar');
        const playerSection = document.querySelector('.player-section');
        const danmakuContent = document.querySelector('.danmaku-content');

        if (!mainContent || !rightSidebar || !playerSection) return;

        if (document.querySelector('.widescreen-bottom-layout')) return;

        const bottomLayout = document.createElement('div');
        bottomLayout.className = 'widescreen-bottom-layout';
        
        const leftColumn = document.createElement('div');
        leftColumn.className = 'widescreen-left-column';
        
        const rightColumn = document.createElement('div');
        rightColumn.className = 'widescreen-right-column';

        const children = Array.from(mainContent.children);
        children.forEach(child => {
            if (child !== playerSection && child !== danmakuContent && child !== bottomLayout) {
                leftColumn.appendChild(child);
            }
        });

        rightColumn.appendChild(rightSidebar);

        bottomLayout.appendChild(leftColumn);
        bottomLayout.appendChild(rightColumn);
        
        mainContent.appendChild(bottomLayout);
    }

    function restoreDOM() {
        const mainContent = document.querySelector('.main-content');
        const bottomLayout = document.querySelector('.widescreen-bottom-layout');
        const contentWrapper = document.querySelector('.content-wrapper');

        if (!bottomLayout || !mainContent || !contentWrapper) return;

        const leftColumn = bottomLayout.querySelector('.widescreen-left-column');
        const rightColumn = bottomLayout.querySelector('.widescreen-right-column');
        const rightSidebar = rightColumn ? rightColumn.querySelector('.right-sidebar') : null;

        if (leftColumn) {
            const children = Array.from(leftColumn.children);
            children.forEach(child => {
                mainContent.insertBefore(child, bottomLayout);
            });
        }

        if (rightSidebar) {
            contentWrapper.appendChild(rightSidebar);
        }

        bottomLayout.remove();
    }

    document.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea, [contenteditable="true"]')) return;
        if (e.shiftKey) return;
        
        const key = (e.key || '').toLowerCase();
        if (key === 'w' || key === 'ц') {
            e.preventDefault();
            toggleWideMode();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWideMode);
    } else {
        initWideMode();
    }

})();
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
 * Document Picture-in-Picture Manager
 * Handles moving the video player and danmaku interface to a separate window.
 */
class DocumentPiPManager {
    constructor() {
        this.pipWindow = null;
        this.videoContainer = document.getElementById('videoContainer');
        this.danmakuContent = document.getElementById('danmakuContent');
        this.pipBtn = document.getElementById('pipBtn');
        
        this.originalState = {
            videoParent: null,
            videoNextSibling: null,
            danmakuParent: null,
            danmakuNextSibling: null
        };
    }

    /**
     * Toggle Document Picture-in-Picture mode
     */
    async toggle() {
        if (!('documentPictureInPicture' in window)) {
            console.log('Document Picture-in-Picture API not supported, falling back to standard PiP');
            this.toggleStandardPiP();
            return;
        }

        if (this.pipWindow) {
            this.pipWindow.close();
            return;
        }

        if (document.fullscreenElement) {
            await document.exitFullscreen().catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.videoContainer = document.getElementById('videoContainer');
        this.danmakuContent = document.getElementById('danmakuContent');

        if (!this.videoContainer) {
            console.error('Video container not found');
            return;
        }

        const miniPlayerActive = document.querySelector('.mini-player.active');
        if (miniPlayerActive && typeof window.deactivateMiniPlayer === 'function') {
            console.log('Mini-player is active, deactivating before PiP...');
            window.deactivateMiniPlayer();
            await new Promise(resolve => setTimeout(resolve, 150));
            
            this.videoContainer = document.getElementById('videoContainer');
            this.danmakuContent = document.getElementById('danmakuContent');
        }

        const video = document.getElementById('video');
        if (video && !this.videoContainer.contains(video)) {
            console.log('Video not in container, moving it back...');
            this.videoContainer.appendChild(video);
        }

        const danmakuOverlay = document.getElementById('danmakuOverlay');
        if (danmakuOverlay && !this.videoContainer.contains(danmakuOverlay)) {
            console.log('Danmaku overlay not in container, moving it back...');
            this.videoContainer.appendChild(danmakuOverlay);
            delete danmakuOverlay.dataset.mini;
        }

        this.originalState.videoParent = this.videoContainer.parentNode;
        this.originalState.videoNextSibling = this.videoContainer.nextSibling;
        
        if (this.danmakuContent) {
            this.originalState.danmakuParent = this.danmakuContent.parentNode;
            this.originalState.danmakuNextSibling = this.danmakuContent.nextSibling;
        }

        try {
            const width = this.videoContainer.clientWidth || 800;
            const height = (this.videoContainer.clientHeight || 450) + 
                           (this.danmakuContent ? (this.danmakuContent.clientHeight || 50) : 0);

            this.pipWindow = await window.documentPictureInPicture.requestWindow({
                width: width,
                height: height
            });

            this.setupPiPWindow();
        } catch (error) {
            console.error('Failed to open Document PiP window:', error);
            this.toggleStandardPiP();
        }
    }

    /**
     * Fallback to standard Video Picture-in-Picture
     */
    toggleStandardPiP() {
        const video = document.getElementById('video');
        if (!video) return;
        
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(console.error);
        } else {
            video.requestPictureInPicture().catch(console.error);
        }
    }

    /**
     * Setup the PiP window content and styles
     */
    setupPiPWindow() {
        const pipDoc = this.pipWindow.document;
        const pipWin = this.pipWindow;

        const favicon = pipDoc.createElement('link');
        favicon.rel = 'icon';
        favicon.href = 'favicon/youvi/favicon.ico';
        favicon.type = 'image/x-icon';
        pipDoc.head.appendChild(favicon);

        [...document.styleSheets].forEach(styleSheet => {
            try {
                if (styleSheet.href) {
                    const link = pipDoc.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = styleSheet.href;
                    pipDoc.head.appendChild(link);
                } else if (styleSheet.cssRules) {
                    const style = pipDoc.createElement('style');
                    [...styleSheet.cssRules].forEach(rule => {
                        style.appendChild(pipDoc.createTextNode(rule.cssText));
                    });
                    pipDoc.head.appendChild(style);
                }
            } catch (e) {
                console.warn('Could not copy stylesheet:', e);
            }
        });

        const pipStyle = pipDoc.createElement('style');
        pipStyle.textContent = `
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                height: 100% !important;
                overflow: hidden !important;
                background: #000 !important;
            }
            .pip-wrapper {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                display: flex !important;
                flex-direction: column !important;
            }
            #videoContainer {
                contain: none !important;
                position: relative !important;
                width: 100% !important;
                height: 0 !important;
                flex: 1 1 auto !important;
                overflow: hidden !important;
            }
            #videoContainer video {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
            }
            .kaomoji-picker-popup:not(.show) {
                display: none !important;
            }
            #timecodeContextMenu:not(.show) {
                display: none !important;
            }
            .danmaku-overlay {
                --pip-font-scale: 1;
            }
            .danmaku-overlay .danmaku-item {
                font-size: calc(var(--base-size) * var(--danmaku-scale) * var(--pip-font-scale)) !important;
            }
            .video-container.in-pip .danmaku-item {
                /* 1. Максимально тонкая однопиксельная тень (text-stroke)
                   Используем мягкий, полупрозрачный черный (0.7) */
                text-shadow: 
                    0 0 1px rgba(0,0,0,0.7), 
                    0 0 1px rgba(0,0,0,0.7) !important;
                
                /* 2. Используем более тонкий шрифт (например, 400 или 500)
                   Это оставляет больше "белого" пространства, которое не будет "загрязняться" тенью. */
                font-weight: 500 !important; 
                
                filter: none !important;
                
            }
            #danmakuContent {
                width: 100% !important;
                padding: 0 !important;
                box-sizing: border-box;
                flex-shrink: 0;
                margin: 0 !important;
                background: #000 !important;
            }
            .danmaku-form {
                background: transparent !important;
                padding: 5px 15px 10px 15px !important;
                margin: 0 !important;
            }
            #danmakuContent input {
                background: #1a1a1a !important;
                border: 1px solid #555 !important;
            }
            #danmakuContent select:not(#danmakuColor) {
                background: #1a1a1a !important;
                color: #fff !important;
                border: 1px solid #555 !important;
            }
            #danmakuContent #danmakuColor {
                background: #1a1a1a !important;
                border: 1px solid #555 !important;
                color: #fff !important;
            }
            #danmakuContent #danmakuColor option[value="#ffffff"] { color: #ffffff !important; }
            #danmakuContent #danmakuColor option[value="#ff0000"] { color: #ff0000 !important; }
            #danmakuContent #danmakuColor option[value="#00ff00"] { color: #00ff00 !important; }
            #danmakuContent #danmakuColor option[value="#0000ff"] { color: #6666ff !important; }
            #danmakuContent #danmakuColor option[value="#ffff00"] { color: #ffff00 !important; }
            #danmakuContent #danmakuColor option[value="#ff69b4"] { color: #ff69b4 !important; }
            #danmakuContent input::placeholder {
                color: #888 !important;
            }
            #danmakuContent input:focus {
                background: #1a1a1a !important;
                border-color: #ff69b4 !important;
            }
            #danmakuContent select option {
                background: #1a1a1a !important;
            }
            #danmakuContent select:not(#danmakuColor) option {
                color: #fff !important;
            }
            #danmakuContent select:focus {
                border-color: #ff69b4 !important;
            }
            #danmakuContent .kaomoji-picker-btn,
            #danmakuContent button.kaomoji-picker-btn,
            #danmakuContent #danmakuKaomojiBtn,
            .danmaku-form .kaomoji-picker-btn,
            .danmaku-form #danmakuKaomojiBtn {
                background: #1a1a1a !important;
                color: #fff !important;
                border: 1px solid #555 !important;
            }
            #danmakuContent .kaomoji-picker-btn:hover,
            #danmakuContent button.kaomoji-picker-btn:hover,
            #danmakuContent #danmakuKaomojiBtn:hover,
            .danmaku-form .kaomoji-picker-btn:hover,
            .danmaku-form #danmakuKaomojiBtn:hover {
                background: #2a2a2a !important;
                border-color: #ff69b4 !important;
                color: #fff !important;
            }
            .danmaku-form {
                background: #2a2a2a !important;
                border-color: #444 !important;
            }
            #sendDanmaku {
                background: #ff69b4 !important;
                color: #fff !important;
            }
            #sendDanmaku:hover {
                background: #d94b88 !important;
            }
            .video-controls {
                background: linear-gradient(transparent, rgba(0,0,0,0.8)) !important;
            }
            .control-btn,
            .play-btn,
            .volume-btn,
            .fullscreen-btn {
                color: #ffffff !important;
            }
            .control-btn:hover,
            .volume-btn:hover,
            .fullscreen-btn:hover {
                background: rgba(255,255,255,0.2) !important;
            }
            .progress-bar {
                background: rgba(255,255,255,0.3) !important;
            }
            .progress-filled {
                background: #ff69b4 !important;
            }
            .progress-handle {
                background: #fff !important;
                border: 2px solid #ff69b4 !important;
            }
            .settings-menu {
                background: linear-gradient(180deg, #2a2a2a, #1a1a1a) !important;
                border: 1px solid rgba(255,255,255,0.2) !important;
            }
            .settings-label {
                color: #ffffff !important;
            }
            .settings-option {
                color: #cccccc !important;
            }
            .settings-option:hover {
                background: rgba(255,255,255,0.2) !important;
                color: #fff !important;
            }
            .settings-option.active {
                background: #ff69b4 !important;
                color: #ffffff !important;
            }
            .time-display {
                color: white !important;
            }
            .volume-slider {
                background: rgba(255,255,255,0.3) !important;
            }
            .volume-slider::-webkit-slider-thumb {
                background: #fff !important;
            }
            .volume-slider::-moz-range-thumb {
                background: #fff !important;
            }
            #cinemaModeBtn,
            #wideModeBtn {
                display: none !important;
            }
            #speedSettingsSubMenu > .settings-sub-options > div[style*="padding: 12px"] {
                display: none !important;
            }
            .video-container.in-pip .mini-progress-bar,
            .video-container .mini-progress-bar {
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                height: 3px;
                z-index: 10003;
                opacity: 0;
                transform: scaleY(0);
                transform-origin: bottom;
                transition: opacity 0.2s ease-out, transform 0.2s ease-out;
                pointer-events: none;
            }
            .video-container.in-pip .mini-progress-bar.show,
            .video-container .mini-progress-bar.show {
                opacity: 1;
                transform: scaleY(1);
            }
            .video-container .mini-progress-track {
                position: absolute;
                left: 0;
                right: 0;
                top: 0;
                bottom: 0;
                background: rgba(255,255,255,0.35);
                border-radius: 0;
            }
            .video-container .mini-progress-fill {
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 0%;
                background: #ff69b4;
                transition: width 0.1s linear;
                border-radius: 0;
            }
            .video-container.in-pip .mini-progress-bar .chapter-marker,
            .video-container .mini-progress-bar .chapter-marker {
                display: block !important;
            }
            .kaomoji-picker-popup {
                max-height: 300px !important;
                width: 280px !important;
                max-width: calc(100vw - 40px) !important;
            }
            .kaomoji-content {
                max-height: 220px !important;
            }
            .kaomoji-picker-header {
                padding: 8px !important;
            }
            .kaomoji-search {
                padding: 6px 8px !important;
                font-size: 12px !important;
            }
            .kaomoji-tabs {
                padding: 6px 8px !important;
                gap: 4px !important;
            }
            .kaomoji-tab {
                padding: 4px 8px !important;
                font-size: 10px !important;
            }
            .kaomoji-grid {
                grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)) !important;
                gap: 4px !important;
            }
            .kaomoji-item {
                padding: 4px 2px !important;
                font-size: 11px !important;
                height: 28px !important;
            }
            .kaomoji-picker-popup {
                z-index: 999999 !important;
                position: fixed !important;
            }
            @media (max-width: 500px), (max-height: 400px) {
                .kaomoji-picker-popup {
                    width: 240px !important;
                    max-height: 250px !important;
                }
                .kaomoji-content {
                    max-height: 170px !important;
                }
                .kaomoji-grid {
                    grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)) !important;
                }
            }
        `;
        pipDoc.head.appendChild(pipStyle);

        const wrapper = pipDoc.createElement('div');
        wrapper.className = 'pip-wrapper';
        pipDoc.body.appendChild(wrapper);

        if (this.videoContainer) {
            const pipIndicator = document.createElement('div');
            pipIndicator.id = 'pipIndicatorOverlay';
            pipIndicator.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #fff;
                font-size: 24px;
                z-index: 100;
                gap: 20px;
            `;
            
            const pipText = document.createElement('span');
            pipText.textContent = typeof i18n !== 'undefined' ? i18n.t('player.pipOverlayMessage') : 'Плеер открыт в Picture-in-Picture режиме';
            pipIndicator.appendChild(pipText);
            
            const returnBtn = document.createElement('button');
            returnBtn.textContent = typeof i18n !== 'undefined' ? i18n.t('player.returnToMain') : 'Вернуться';
            returnBtn.style.cssText = `
                padding: 10px 24px !important;
                background: #000 !important;
                color: #fff !important;
                border: 2px solid #fff !important;
                border-radius: 6px !important;
                font-size: 14px !important;
                font-weight: normal !important;
                cursor: pointer !important;
            `;
            returnBtn.addEventListener('mouseenter', () => {
                returnBtn.style.background = '#333';
            });
            returnBtn.addEventListener('mouseleave', () => {
                returnBtn.style.background = '#000';
            });
            returnBtn.addEventListener('click', () => {
                if (this.pipWindow) {
                    this.pipWindow.close();
                }
            });
            pipIndicator.appendChild(returnBtn);
            
            if (this.originalState.videoParent) {
                this.originalState.videoParent.insertBefore(
                    pipIndicator,
                    this.originalState.videoNextSibling
                );
            }
            
            this.pipIndicator = pipIndicator;
            
            wrapper.appendChild(this.videoContainer);
            this.videoContainer.classList.add('in-pip');
        }
        
        if (this.danmakuContent) {
            const danmakuPlaceholder = document.createElement('div');
            danmakuPlaceholder.id = 'danmakuContentPlaceholder';
            danmakuPlaceholder.className = 'danmaku-pip-placeholder';
            
            const isDarkTheme = document.documentElement.classList.contains('dark-theme');
            const isSkeuo = document.documentElement.classList.contains('skeuo-theme');
            
            danmakuPlaceholder.style.cssText = `
                background: ${isDarkTheme || isSkeuo ? '#1a1a1a' : '#f5f5f5'};
                height: ${this.danmakuContent.offsetHeight || 50}px;
                border-top: 1px solid ${isDarkTheme || isSkeuo ? '#333' : '#ddd'};
                border-radius: 0 0 8px 8px;
            `;
            
            if (this.originalState.danmakuParent) {
                this.originalState.danmakuParent.insertBefore(
                    danmakuPlaceholder,
                    this.originalState.danmakuNextSibling
                );
            }
            
            this.danmakuPlaceholder = danmakuPlaceholder;
            
            wrapper.appendChild(this.danmakuContent);
            this.danmakuContent.classList.add('in-pip');
        }

        const timecodeMenu = document.getElementById('timecodeContextMenu');
        if (timecodeMenu) {
            const menuClone = timecodeMenu.cloneNode(true);
            pipDoc.body.appendChild(menuClone);
            this.setupTimecodeMenuHandlers(pipDoc);
        }

        const pipColorSelect = pipDoc.getElementById('danmakuColor');
        const pipTextInput = pipDoc.getElementById('danmakuText');
        if (pipColorSelect && pipTextInput) {
            const applyPipInputColor = () => {
                const c = pipColorSelect.value || '#ffffff';
                pipTextInput.style.color = c;
                pipTextInput.style.caretColor = c;
            };
            applyPipInputColor();
            pipColorSelect.addEventListener('change', applyPipInputColor);
        }

        
        pipDoc.showSeekHUD = (direction, seconds) => {
            const container = pipDoc.getElementById('videoContainer');
            if (!container) return;
            
            pipDoc.querySelectorAll('.seek-hud-wrapper').forEach(n => n.remove());
            
            const seekHudEl = pipDoc.createElement('div');
            seekHudEl.className = 'seek-hud-wrapper';
            seekHudEl.style.position = 'absolute';
            seekHudEl.style.top = '50%';
            seekHudEl.style.transform = 'translateY(-50%)';
            seekHudEl.style.zIndex = '50';
            seekHudEl.style.display = 'flex';
            seekHudEl.style.flexDirection = 'column';
            seekHudEl.style.alignItems = 'center';
            seekHudEl.style.pointerEvents = 'none';
            seekHudEl.style.transition = 'opacity 120ms ease';
            seekHudEl.style.opacity = '0';
            
            const circle = pipDoc.createElement('div');
            circle.style.width = '56px';
            circle.style.height = '56px';
            circle.style.borderRadius = '50%';
            circle.style.background = 'rgba(0,0,0,0.7)';
            circle.style.display = 'flex';
            circle.style.flexDirection = 'column';
            circle.style.alignItems = 'center';
            circle.style.justifyContent = 'center';
            circle.style.color = '#fff';
            circle.style.fontSize = '12px';
            circle.style.fontWeight = '700';
            circle.style.textAlign = 'center';
            circle.style.lineHeight = '1.1';
            circle.className = 'seek-hud-circle';
            
            const arrow = direction === 'left' ? '←' : '→';
            circle.innerHTML = `<div style="font-size:14px;">${seconds} сек</div><div style="font-size:16px; margin-top:2px;">${arrow}</div>`;
            
            seekHudEl.appendChild(circle);
            seekHudEl.style.left = direction === 'left' ? '8%' : '';
            seekHudEl.style.right = direction === 'right' ? '8%' : '';
            
            container.appendChild(seekHudEl);
            
            void seekHudEl.offsetWidth;
            seekHudEl.style.opacity = '1';
            
            setTimeout(() => {
                seekHudEl.style.opacity = '0';
                setTimeout(() => seekHudEl.remove(), 120);
            }, 250);
        };
        
        pipDoc.showHud = (icon) => {
            const videoHud = pipDoc.getElementById('videoHud');
            if (videoHud) {
                if (icon === '▶') {
                    videoHud.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>';
                } else if (icon === '⏸') {
                    videoHud.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>';
                } else {
                    videoHud.textContent = icon;
                }
                videoHud.style.display = 'flex';
                setTimeout(() => {
                    videoHud.style.display = 'none';
                }, 400);
            }
        };
        
        let pipVolumeHudTimer = null;
        pipDoc.showVolumeHUD = (volumePercent) => {
            const volumeHud = pipDoc.getElementById('volumeHud');
            if (!volumeHud) return;
            volumeHud.textContent = `Громкость: ${Math.round(volumePercent)}%`;
            volumeHud.style.display = 'block';
            clearTimeout(pipVolumeHudTimer);
            pipVolumeHudTimer = setTimeout(() => {
                if (volumeHud) volumeHud.style.display = 'none';
            }, 800);
        };
        
        let pipAllowSpeedHUD = true;
        pipDoc.showSpeedHUD = (rate) => {
            if (!pipAllowSpeedHUD) return;
            const speedHud = pipDoc.getElementById('speedHud');
            if (!speedHud) return;
            speedHud.innerHTML = `
                <div style="font-size:16px;margin-bottom:3px;">Скорость: ${rate}x</div>
            `;
            speedHud.style.display = 'block';
        };
        
        pipDoc.showSpeedHUDKeyboard = (rate) => {
            if (!pipAllowSpeedHUD) return;
            const container = pipDoc.getElementById('videoContainer');
            if (!container) return;
            
            let speedHud = pipDoc.getElementById('speedHud');
            if (!speedHud) {
                speedHud = pipDoc.createElement('div');
                speedHud.id = 'speedHud';
                speedHud.className = 'speed-hud';
                container.appendChild(speedHud);
            }
            speedHud.innerHTML = `
                <div style="font-size:16px;margin-bottom:3px;">Скорость: ${rate}x</div>
                <div style="font-size:11px;opacity:0.8;">Shift +/- для смены скорости</div>
            `;
            speedHud.style.display = 'block';
        };
        
        let pipZoomHudTimer = null;
        pipDoc.showVideoZoomHUD = (level) => {
            const container = pipDoc.getElementById('videoContainer');
            if (!container) return;
            
            let hud = pipDoc.getElementById('zoomHudVideo');
            if (!hud) {
                hud = pipDoc.createElement('div');
                hud.id = 'zoomHudVideo';
                hud.style.position = 'absolute';
                hud.style.top = '15px';
                hud.style.left = '50%';
                hud.style.transform = 'translateX(-50%)';
                hud.style.padding = '6px 12px';
                hud.style.borderRadius = '8px';
                hud.style.background = 'rgba(0,0,0,0.8)';
                hud.style.color = '#fff';
                hud.style.fontWeight = '700';
                hud.style.fontSize = '14px';
                hud.style.zIndex = '30';
                hud.style.pointerEvents = 'none';
                hud.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
                container.appendChild(hud);
            }
            hud.innerHTML = `Масштаб: ${Math.round(level * 100)}%`;
            hud.style.display = 'block';
            if (pipZoomHudTimer) clearTimeout(pipZoomHudTimer);
            pipZoomHudTimer = setTimeout(() => {
                const h = pipDoc.getElementById('zoomHudVideo');
                if (h) h.style.display = 'none';
            }, 1500);
        };
        
        ['keydown', 'keyup', 'keypress'].forEach(eventType => {
            pipDoc.addEventListener(eventType, (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                    return;
                }
                
                if (eventType === 'keydown' && e.code === 'ArrowLeft') {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    if (video) {
                        video.currentTime = Math.max(0, video.currentTime - 5);
                        pipDoc.showSeekHUD('left', 5);
                    }
                    return;
                }
                
                if (eventType === 'keydown' && e.code === 'ArrowRight') {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    if (video) {
                        video.currentTime = Math.min(video.duration, video.currentTime + 5);
                        pipDoc.showSeekHUD('right', 5);
                    }
                    return;
                }
                
                if (eventType === 'keydown' && e.code === 'KeyJ') {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    if (video) {
                        video.currentTime = Math.max(0, video.currentTime - 10);
                        pipDoc.showSeekHUD('left', 10);
                    }
                    return;
                }
                
                if (eventType === 'keydown' && e.code === 'KeyL') {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    if (video) {
                        video.currentTime = Math.min(video.duration, video.currentTime + 10);
                        pipDoc.showSeekHUD('right', 10);
                    }
                    return;
                }
                
                if (eventType === 'keydown' && e.code === 'ArrowUp') {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    if (video) {
                        const volumeStep = 0.05;
                        const newVolumePercent = Math.min(100, (video.volume * 100) + (volumeStep * 100));
                        video.volume = newVolumePercent / 100;
                        pipDoc.showVolumeHUD(newVolumePercent);
                    }
                    return;
                }
                
                if (eventType === 'keydown' && e.code === 'ArrowDown') {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    if (video) {
                        const volumeStep = 0.05;
                        const newVolumePercent = Math.max(0, (video.volume * 100) - (volumeStep * 100));
                        video.volume = newVolumePercent / 100;
                        pipDoc.showVolumeHUD(newVolumePercent);
                    }
                    return;
                }
                
                if (eventType === 'keydown' && ((e.code === 'Equal' && e.shiftKey) || e.code === 'NumpadAdd')) {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    if (video) {
                        const availableSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
                        let idx = availableSpeeds.findIndex(s => Math.abs(s - video.playbackRate) < 0.001);
                        if (idx === -1) idx = availableSpeeds.indexOf(1);
                        if (idx < availableSpeeds.length - 1) {
                            const newRate = availableSpeeds[idx + 1];
                            video.playbackRate = newRate;
                            pipAllowSpeedHUD = true;
                            pipDoc.showSpeedHUDKeyboard(newRate);
                            setTimeout(() => {
                                const speedHud = pipDoc.getElementById('speedHud');
                                if (speedHud) speedHud.style.display = 'none';
                                pipAllowSpeedHUD = false;
                            }, 1000);
                        }
                    }
                    return;
                }
                
                if (eventType === 'keydown' && ((e.code === 'Minus' && e.shiftKey) || e.code === 'NumpadSubtract')) {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    if (video) {
                        const availableSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
                        let idx = availableSpeeds.findIndex(s => Math.abs(s - video.playbackRate) < 0.001);
                        if (idx === -1) idx = availableSpeeds.indexOf(1);
                        if (idx > 0) {
                            const newRate = availableSpeeds[idx - 1];
                            video.playbackRate = newRate;
                            pipAllowSpeedHUD = true;
                            pipDoc.showSpeedHUDKeyboard(newRate);
                            setTimeout(() => {
                                const speedHud = pipDoc.getElementById('speedHud');
                                if (speedHud) speedHud.style.display = 'none';
                                pipAllowSpeedHUD = false;
                            }, 1000);
                        }
                    }
                    return;
                }
                
                if (eventType === 'keydown' && e.code === 'KeyM') {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    if (video) {
                        if (video.muted || video.volume === 0) {
                            video.muted = false;
                            video.volume = 1;
                            pipDoc.showVolumeHUD(100);
                        } else {
                            video.muted = true;
                            pipDoc.showVolumeHUD(0);
                        }
                    }
                    return;
                }
                
                if (eventType === 'keydown' && (e.code === 'Space' || e.code === 'KeyK')) {
                    e.preventDefault();
                    const video = pipDoc.getElementById('video');
                    const overlay = pipDoc.getElementById('videoOverlay');
                    
                    if (video) {
                        if (video.paused || video.ended) {
                            if (overlay) {
                                overlay.style.opacity = '0';
                                setTimeout(() => overlay.style.display = 'none', 300);
                            }
                            video.play();
                            pipDoc.showHud('▶');
                        } else {
                            video.pause();
                            pipDoc.showHud('⏸');
                        }
                    }
                    return;
                }
                
                const newEvent = new KeyboardEvent(eventType, {
                    key: e.key,
                    code: e.code,
                    ctrlKey: e.ctrlKey,
                    shiftKey: e.shiftKey,
                    altKey: e.altKey,
                    metaKey: e.metaKey,
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                document.dispatchEvent(newEvent);
            });
        });

        ['mouseup', 'mousemove'].forEach(eventType => {
            pipDoc.addEventListener(eventType, (e) => {
                const newEvent = new MouseEvent(eventType, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    detail: e.detail,
                    screenX: e.screenX,
                    screenY: e.screenY,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    ctrlKey: e.ctrlKey,
                    altKey: e.altKey,
                    shiftKey: e.shiftKey,
                    metaKey: e.metaKey,
                    button: e.button,
                    buttons: e.buttons,
                    relatedTarget: e.relatedTarget
                });
                document.dispatchEvent(newEvent);
            });
        });


        const fullscreenBtn = pipDoc.getElementById('fullscreenBtn');
        if (fullscreenBtn) {
            const pipFullscreenHandler = async (e) => {
                if (e.target === fullscreenBtn || fullscreenBtn.contains(e.target)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    if (this.pipWindow) {
                        this.pipWindow.close();
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    const mainVideoContainer = document.getElementById('videoContainer');
                    if (mainVideoContainer && !document.fullscreenElement) {
                        try {
                            await mainVideoContainer.requestFullscreen();
                        } catch (err) {
                            console.error('Fullscreen request failed:', err);
                        }
                    }
                }
            };
            
            this.pipFullscreenHandler = pipFullscreenHandler;
            
            pipDoc.addEventListener('click', pipFullscreenHandler, true);
        }

        let pipControlsTimeout = null;
        const videoContainer = pipDoc.getElementById('videoContainer');
        const video = pipDoc.getElementById('video');
        
        if (video && videoContainer) {
            let pipSuppressNextClick = false;
            
            const pipClickHandler = (e) => {
                if (pipSuppressNextClick) {
                    pipSuppressNextClick = false;
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                
                if (e.target.closest('#bigPlayBtn')) {
                    const overlay = pipDoc.getElementById('videoOverlay');
                    if (overlay) {
                        overlay.style.opacity = '0';
                        setTimeout(() => overlay.style.display = 'none', 300);
                    }
                    video.play();
                    e.stopPropagation();
                    return;
                }
                
                if (e.target.closest('.video-controls') || 
                    e.target.closest('button') || 
                    e.target.closest('.progress-bar') ||
                    e.target.closest('#danmakuContent')) {
                    return;
                }
                
                const overlay = pipDoc.getElementById('videoOverlay');
                if (overlay && overlay.style.display !== 'none' && !e.target.closest('#bigPlayBtn')) {
                    return;
                }
                
                if (video.paused || video.ended) {
                    if (overlay) {
                        overlay.style.opacity = '0';
                        setTimeout(() => overlay.style.display = 'none', 300);
                    }
                    video.play();
                    pipDoc.showHud('▶');
                } else {
                    video.pause();
                    pipDoc.showHud('⏸');
                }
                
                e.stopPropagation();
            };
            
            videoContainer.addEventListener('click', pipClickHandler, true);
            
            this.pipClickHandler = pipClickHandler;
            
            let pipSuppressResetTimer = null;
            const resetPipSuppressNextClick = () => {
                if (pipSuppressResetTimer) clearTimeout(pipSuppressResetTimer);
                pipSuppressResetTimer = setTimeout(() => {
                    pipSuppressNextClick = false;
                }, 500);
            };
            
            pipDoc.addEventListener('touchend', resetPipSuppressNextClick);
            pipDoc.addEventListener('mouseup', resetPipSuppressNextClick);
            
            pipDoc.setPipSuppressNextClick = (value) => {
                pipSuppressNextClick = value;
                resetPipSuppressNextClick();
            };
            
            video.addEventListener('pause', () => {
                const playPauseBtn = pipDoc.getElementById('playPauseBtn');
                if (playPauseBtn) {
                    playPauseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>';
                }
                // Show controls briefly on pause, then allow them to hide
                const vc = pipDoc.querySelector('.video-controls');
                const pb = pipDoc.getElementById('progressBar');
                const miniProgressBar = pipDoc.getElementById('miniProgressBar');
                
                if (vc) {
                    vc.classList.remove('autohide');
                    vc.classList.add('show');
                }
                if (pb) {
                    pb.classList.remove('autohide');
                    pb.classList.add('show');
                }
                if (miniProgressBar) {
                    miniProgressBar.classList.remove('show');
                }
                if (videoContainer) {
                    videoContainer.classList.add('show-cursor');
                    videoContainer.classList.remove('hide-cursor');
                }
                // Start timer to hide controls even when paused
                clearTimeout(pipControlsTimeout);
                pipControlsTimeout = setTimeout(() => {
                    const vc = pipDoc.querySelector('.video-controls');
                    const pb = pipDoc.getElementById('progressBar');
                    const miniProgressBar = pipDoc.getElementById('miniProgressBar');
                    
                    if (vc) {
                        vc.classList.remove('show');
                        vc.classList.add('autohide');
                    }
                    if (pb) {
                        pb.classList.remove('show');
                        pb.classList.add('autohide');
                    }
                    if (miniProgressBar) {
                        miniProgressBar.classList.add('show');
                    }
                    if (videoContainer) {
                        videoContainer.classList.add('hide-cursor');
                        videoContainer.classList.remove('show-cursor');
                    }
                }, 3000);
            });
            
            video.addEventListener('play', () => {
                const playPauseBtn = pipDoc.getElementById('playPauseBtn');
                if (playPauseBtn) {
                    playPauseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>';
                }
                startPipControlsTimer();
            });
            
            video.addEventListener('timeupdate', () => {
                const miniProgressFill = pipDoc.getElementById('miniProgressFill');
                const miniProgressBar = pipDoc.getElementById('miniProgressBar');
                if (miniProgressFill && miniProgressBar && miniProgressBar.classList.contains('show') && video.duration) {
                    const progress = (video.currentTime / video.duration) * 100;
                    miniProgressFill.style.width = `${progress}%`;
                }
            });
        }
        
        const showPipControls = () => {
            const vc = pipDoc.querySelector('.video-controls');
            const pb = pipDoc.getElementById('progressBar');
            const miniProgressBar = pipDoc.getElementById('miniProgressBar');
            
            if (vc) {
                vc.classList.remove('autohide');
                vc.classList.add('show');
            }
            if (pb) {
                pb.classList.remove('autohide');
                pb.classList.add('show');
            }
            if (miniProgressBar) {
                miniProgressBar.classList.remove('show');
            }
            if (videoContainer) {
                videoContainer.classList.remove('hide-cursor');
                videoContainer.classList.add('show-cursor');
            }
        };
        
        const startPipControlsTimer = () => {
            clearTimeout(pipControlsTimeout);
            pipControlsTimeout = setTimeout(() => {
                const vc = pipDoc.querySelector('.video-controls');
                const pb = pipDoc.getElementById('progressBar');
                const miniProgressBar = pipDoc.getElementById('miniProgressBar');
                
                if (vc) {
                    vc.classList.remove('show');
                    vc.classList.add('autohide');
                }
                if (pb) {
                    pb.classList.remove('show');
                    pb.classList.add('autohide');
                }
                if (miniProgressBar) {
                    miniProgressBar.classList.add('show');
                }
                if (videoContainer) {
                    videoContainer.classList.add('hide-cursor');
                    videoContainer.classList.remove('show-cursor');
                }
            }, 3000);
        };
        
        if (videoContainer) {
            videoContainer.addEventListener('mousemove', () => {
                showPipControls();
                startPipControlsTimer();
            });
            
            videoContainer.addEventListener('mouseleave', () => {
                clearTimeout(pipControlsTimeout);
                const vc = pipDoc.querySelector('.video-controls');
                const pb = pipDoc.getElementById('progressBar');
                const miniProgressBar = pipDoc.getElementById('miniProgressBar');
                
                if (vc) {
                    vc.classList.remove('show');
                    vc.classList.add('autohide');
                }
                if (pb) {
                    pb.classList.remove('show');
                    pb.classList.add('autohide');
                }
                if (miniProgressBar) {
                    miniProgressBar.classList.add('show');
                }
                if (videoContainer) {
                    videoContainer.classList.add('hide-cursor');
                    videoContainer.classList.remove('show-cursor');
                }
            });
        }

        setTimeout(() => {
            this.setupSettingsMenuHandlers(pipDoc);
        }, 100);

        setTimeout(() => {
            if (typeof window.initDanmakuKaomojiPicker === 'function') {
                window.initDanmakuKaomojiPicker();
            }
        }, 150);

        const script = pipDoc.createElement('script');
        script.textContent = `
            (function() {
                const videoContainer = document.getElementById('videoContainer');
                
                function updatePiPDanmakuScale() {
                    if (!videoContainer) return;
                    
                    const danmakuOverlay = videoContainer.querySelector('.danmaku-overlay');
                    if (!danmakuOverlay) {
                        setTimeout(updatePiPDanmakuScale, 100);
                        return;
                    }

                    danmakuOverlay.style.setProperty('--pip-font-scale', 1);
                    
                    if (window.opener && typeof window.opener.updateDanmakuScale === 'function') {
                        window.opener.updateDanmakuScale();
                        
                        if (typeof window.opener.recheckScrollDanmakuAnimations === 'function') {
                            window.opener.recheckScrollDanmakuAnimations(danmakuOverlay);
                        }
                    }
                }
                
                const resizeObserver = new ResizeObserver(() => {
                    requestAnimationFrame(updatePiPDanmakuScale);
                });
                
                if (videoContainer) {
                    resizeObserver.observe(videoContainer);
                }
                
                window.addEventListener('resize', () => {
                    requestAnimationFrame(updatePiPDanmakuScale);
                });
                setTimeout(updatePiPDanmakuScale, 100);
            })();
        `;
        pipDoc.body.appendChild(script);

        pipWin.addEventListener('resize', () => {
            // Force layout recalculation on window resize
            const vc = pipDoc.getElementById('videoContainer');
            if (vc) void vc.offsetHeight;
            if (typeof window.updateDanmakuScale === 'function') {
                requestAnimationFrame(() => window.updateDanmakuScale());
            }
        });

        pipWin.addEventListener('pagehide', () => {
            this.restoreElements();
        });

        if (this.pipBtn) {
            this.pipBtn.classList.add('active');
            this.pipBtn.title = "Exit Picture-in-Picture";
        }
        
        const theme = localStorage.getItem('youvi-theme');
        if (theme === 'dark') pipDoc.body.classList.add('dark-theme');
        else if (theme === 'skeuo') pipDoc.body.classList.add('skeuo-theme');
        
        if (typeof window.blockMiniPlayer === 'function') {
            window.blockMiniPlayer();
        }
        
        const themeObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const mainHtml = document.documentElement;
                    const hasDark = mainHtml.classList.contains('dark-theme');
                    const hasSkeuo = mainHtml.classList.contains('skeuo-theme');
                    
                    if (this.pipWindow && this.pipWindow.document) {
                        const pipBody = this.pipWindow.document.body;
                        pipBody.classList.remove('dark-theme', 'skeuo-theme');
                        if (hasDark) pipBody.classList.add('dark-theme');
                        else if (hasSkeuo) pipBody.classList.add('skeuo-theme');
                    }
                    
                    if (this.danmakuPlaceholder) {
                        const isDark = hasDark || hasSkeuo;
                        this.danmakuPlaceholder.style.background = isDark ? '#1a1a1a' : '#f5f5f5';
                        this.danmakuPlaceholder.style.borderTopColor = isDark ? '#333' : '#ddd';
                    }
                }
            });
        });
        
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });
        
        this.themeObserver = themeObserver;
    }

    /**
     * Restore elements to the main window
     */
    restoreElements() {
        if (!this.pipWindow) return;

        if (this.pipClickHandler && this.videoContainer) {
            this.videoContainer.removeEventListener('click', this.pipClickHandler, true);
            this.pipClickHandler = null;
        }

        if (this.themeObserver) {
            this.themeObserver.disconnect();
            this.themeObserver = null;
        }

        if (this.pipIndicator && this.pipIndicator.parentNode) {
            this.pipIndicator.parentNode.removeChild(this.pipIndicator);
            this.pipIndicator = null;
        }

        if (this.danmakuPlaceholder && this.danmakuPlaceholder.parentNode) {
            this.danmakuPlaceholder.parentNode.removeChild(this.danmakuPlaceholder);
            this.danmakuPlaceholder = null;
        }

        if (this.videoContainer && this.originalState.videoParent) {
            this.originalState.videoParent.insertBefore(
                this.videoContainer, 
                this.originalState.videoNextSibling
            );
            this.videoContainer.classList.remove('in-pip');
            
            const video = document.getElementById('video');
            if (video && !this.videoContainer.contains(video)) {
                console.log('Restoring video to container after PiP close');
                this.videoContainer.appendChild(video);
            }
            
            const danmakuOverlay = document.getElementById('danmakuOverlay');
            if (danmakuOverlay && !this.videoContainer.contains(danmakuOverlay)) {
                console.log('Restoring danmaku overlay to container after PiP close');
                this.videoContainer.appendChild(danmakuOverlay);
            }
        }
        
        if (this.danmakuContent && this.originalState.danmakuParent) {
            this.originalState.danmakuParent.insertBefore(
                this.danmakuContent, 
                this.originalState.danmakuNextSibling
            );
            this.danmakuContent.classList.remove('in-pip');
        }

        this.pipWindow = null;
        
        if (typeof window.clearAllDanmaku === 'function') {
            window.clearAllDanmaku();
        }
        
        if (typeof window.updateDanmakuOverlay === 'function') {
            window.updateDanmakuOverlay();
        }
        
        const video = document.getElementById('video');
        if (video && typeof window.updateDanmakuVisibility === 'function') {
            setTimeout(() => {
                window.updateDanmakuVisibility(video.currentTime);
            }, 100);
        }
        
        if (this.pipBtn) {
            this.pipBtn.classList.remove('active');
            this.pipBtn.title = "Picture-in-Picture";
        }
        
        if (typeof window.initFullscreenHandler === 'function') {
            setTimeout(() => {
                window.initFullscreenHandler();
            }, 150);
        }
        
        if (typeof window.initDanmakuKaomojiPicker === 'function') {
            setTimeout(() => {
                window.initDanmakuKaomojiPicker();
            }, 200);
        }
        
        if (typeof window.initCommentKaomojiPicker === 'function') {
            setTimeout(() => {
                window.initCommentKaomojiPicker();
            }, 200);
        }
        
        if (typeof window.unblockMiniPlayer === 'function') {
            setTimeout(() => {
                window.unblockMiniPlayer();
            }, 250);
        }
    }

    /**
     * Setup settings menu handlers in PiP context
     */
    setupSettingsMenuHandlers(pipDoc) {
        const settingsMenu = pipDoc.getElementById('settingsMenu');
        const settingsBtn = pipDoc.getElementById('settingsBtn');
        
        if (!settingsMenu || !settingsBtn) return;

        function showMainMenu() {
            const mainMenu = pipDoc.getElementById('settingsMainMenu');
            const logoSettings = pipDoc.getElementById('logoSettingsSubMenu');
            const clockSettings = pipDoc.getElementById('clockSettingsSubMenu');
            const speedSettings = pipDoc.getElementById('speedSettingsSubMenu');
            const dragseekSettings = pipDoc.getElementById('dragseekSettingsSubMenu');
            
            if (mainMenu) mainMenu.style.display = 'flex';
            if (logoSettings) {
                logoSettings.style.display = 'none';
                logoSettings.style.position = 'absolute';
            }
            if (clockSettings) {
                clockSettings.style.display = 'none';
                clockSettings.style.position = 'absolute';
            }
            if (speedSettings) {
                speedSettings.style.display = 'none';
                speedSettings.style.position = 'absolute';
            }
            if (dragseekSettings) {
                dragseekSettings.style.display = 'none';
                dragseekSettings.style.position = 'absolute';
            }
        }
        
        showMainMenu();

        pipDoc.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                const tabType = tab.dataset.tab;
                
                const mainMenu = pipDoc.getElementById('settingsMainMenu');
                const logoSettings = pipDoc.getElementById('logoSettingsSubMenu');
                const clockSettings = pipDoc.getElementById('clockSettingsSubMenu');
                const speedSettings = pipDoc.getElementById('speedSettingsSubMenu');
                const dragseekSettings = pipDoc.getElementById('dragseekSettingsSubMenu');
                
                if (mainMenu) mainMenu.style.display = 'none';
                
                const mainMenuHeight = mainMenu ? mainMenu.offsetHeight : 0;
                
                if (tabType === 'logo' && logoSettings) {
                    logoSettings.style.display = 'flex';
                    logoSettings.style.position = 'static';
                    logoSettings.style.minHeight = mainMenuHeight + 'px';
                } else if (tabType === 'clock' && clockSettings) {
                    clockSettings.style.display = 'flex';
                    clockSettings.style.position = 'static';
                    clockSettings.style.minHeight = mainMenuHeight + 'px';
                } else if (tabType === 'speed' && speedSettings) {
                    speedSettings.style.display = 'flex';
                    speedSettings.style.position = 'static';
                    speedSettings.style.minHeight = mainMenuHeight + 'px';
                } else if (tabType === 'dragseek' && dragseekSettings) {
                    dragseekSettings.style.display = 'flex';
                    dragseekSettings.style.position = 'static';
                    dragseekSettings.style.minHeight = mainMenuHeight + 'px';
                }
            });
        });

        const logoBackBtn = pipDoc.getElementById('logoBackBtn');
        const clockBackBtn = pipDoc.getElementById('clockBackBtn');
        const speedBackBtn = pipDoc.getElementById('speedBackBtn');
        const dragseekBackBtn = pipDoc.getElementById('dragseekBackBtn');
        
        if (logoBackBtn) {
            logoBackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sub = pipDoc.getElementById('logoSettingsSubMenu');
                if (sub) {
                    sub.classList.remove('slide-out');
                    void sub.offsetWidth;
                    sub.classList.add('slide-out');
                    const onEnd = () => {
                        sub.classList.remove('slide-out');
                        sub.style.display = 'none';
                        sub.style.position = 'absolute';
                        sub.removeEventListener('animationend', onEnd);
                        showMainMenu();
                    };
                    sub.addEventListener('animationend', onEnd);
                } else {
                    showMainMenu();
                }
            });
        }
        
        if (clockBackBtn) {
            clockBackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sub = pipDoc.getElementById('clockSettingsSubMenu');
                if (sub) {
                    sub.classList.remove('slide-out');
                    void sub.offsetWidth;
                    sub.classList.add('slide-out');
                    const onEnd = () => {
                        sub.classList.remove('slide-out');
                        sub.style.display = 'none';
                        sub.style.position = 'absolute';
                        sub.removeEventListener('animationend', onEnd);
                        showMainMenu();
                    };
                    sub.addEventListener('animationend', onEnd);
                } else {
                    showMainMenu();
                }
            });
        }
        
        if (speedBackBtn) {
            speedBackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sub = pipDoc.getElementById('speedSettingsSubMenu');
                if (sub) {
                    sub.classList.remove('slide-out');
                    void sub.offsetWidth;
                    sub.classList.add('slide-out');
                    const onEnd = () => {
                        sub.classList.remove('slide-out');
                        sub.style.display = 'none';
                        sub.style.position = 'absolute';
                        sub.removeEventListener('animationend', onEnd);
                        showMainMenu();
                    };
                    sub.addEventListener('animationend', onEnd);
                } else {
                    showMainMenu();
                }
            });
        }
        
        if (dragseekBackBtn) {
            dragseekBackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sub = pipDoc.getElementById('dragseekSettingsSubMenu');
                if (sub) {
                    sub.classList.remove('slide-out');
                    void sub.offsetWidth;
                    sub.classList.add('slide-out');
                    const onEnd = () => {
                        sub.classList.remove('slide-out');
                        sub.style.display = 'none';
                        sub.style.position = 'absolute';
                        sub.removeEventListener('animationend', onEnd);
                        showMainMenu();
                    };
                    sub.addEventListener('animationend', onEnd);
                } else {
                    showMainMenu();
                }
            });
        }

        pipDoc.addEventListener('click', (e) => {
            if (!e.target.closest('.settings-container')) {
                settingsMenu.classList.remove('show');
                showMainMenu();
            }
        });
    }

    /**
     * Setup timecode context menu handlers in PiP
     */
    setupTimecodeMenuHandlers(pipDoc) {
        const menu = pipDoc.getElementById('timecodeContextMenu');
        if (!menu) return;

        const menuItems = menu.querySelectorAll('[data-action]');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                
                if (window.showTimecodeContextMenu) {
                    const mainMenu = document.getElementById('timecodeContextMenu');
                    if (mainMenu) {
                        const mainItem = mainMenu.querySelector(`[data-action="${action}"]`);
                        if (mainItem) {
                            mainItem.click();
                        }
                    }
                }
                
                menu.classList.remove('show');
            });
        });

        pipDoc.addEventListener('click', () => {
            menu.classList.remove('show');
        });
    }
}

window.documentPiPManager = new DocumentPiPManager();

window.togglePictureInPicture = function() {
    if (window.documentPiPManager) {
        window.documentPiPManager.toggle();
    } else {
        const video = document.getElementById('video');
        if (video) video.requestPictureInPicture().catch(console.error);
    }
};
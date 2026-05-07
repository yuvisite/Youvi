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
 * Multiview Module
 * Multi-video player overlay for youvi
 * 
 * Dependencies:
 * - youvi/multiview/multiview.css
 * - Main player must expose: window.allVideos, window.videoDirectoryHandle, window.currentVideo
 * 
 * Usage:
 * - Press N to toggle multiview (not in fullscreen)
 * - Click on empty slot to add video
 * - Use layout buttons to change grid
 */

const MULTIVIEW_DEBUG = false;

(function() {
    'use strict';

    const mvState = {
        active: false,
        layout: '2h',
        slots: [],
        currentSlotIndex: null,
        mainVideoWasMuted: false
    };

    const layoutSlotCounts = {
        '2h': 2,
        '2v': 2,
        '1v2h': 3,
        '2v2h': 4,
        '4h': 4
    };

    let overlay, grid, searchPanel, searchInput, searchResults;
    let multiviewBtn, closeBtn, searchCloseBtn, layoutBtns, fullscreenBtn;
    let mainVideo;

    const ICONS = {
        play: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>',
        pause: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>',
        volumeOff: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 9a5 5 0 0 1 .95 2.293"/><path d="M19.364 5.636a9 9 0 0 1 1.889 9.96"/><path d="m2 2 20 20"/><path d="m7 7-.587.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298V11"/><path d="M9.828 4.172A.686.686 0 0 1 11 4.657v.686"/></svg>',
        volumeLow: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/></svg>',
        volumeHigh: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>',
        fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
        fullscreenExit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8"/><path d="M9 19.8V15m0 0H4.2M9 15l-6 6"/><path d="M15 4.2V9m0 0h4.8M15 9l6-6"/><path d="M9 4.2V9m0 0H4.2M9 9 3 3"/></svg>'
    };

    function init() {
        overlay = document.getElementById('multiviewOverlay');
        grid = document.getElementById('multiviewGrid');
        searchPanel = document.getElementById('multiviewSearchPanel');
        searchInput = document.getElementById('multiviewSearchInput');
        searchResults = document.getElementById('multiviewSearchResults');
        multiviewBtn = document.getElementById('multiviewBtn');
        closeBtn = document.getElementById('multiviewCloseBtn');
        searchCloseBtn = document.getElementById('multiviewSearchClose');
        fullscreenBtn = document.getElementById('multiviewFullscreenBtn');
        layoutBtns = document.querySelectorAll('.multiview-layout-btn');
        mainVideo = document.getElementById('video');

        if (!overlay || !grid) {
            console.warn('[Multiview] Required elements not found');
            return;
        }

        if (typeof i18n !== 'undefined' && i18n.subscribe) {
            i18n.subscribe(() => {
                if (mvState.active) {
                    renderSlots();
                }
            });
        }

        if (multiviewBtn) {
            multiviewBtn.addEventListener('click', () => {
                if (document.fullscreenElement || document.webkitFullscreenElement) return;
                toggle();
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', close);
        }

        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', toggleFullscreen);
        }

        layoutBtns.forEach(btn => {
            btn.addEventListener('click', () => setLayout(btn.dataset.layout));
        });

        if (searchCloseBtn) {
            searchCloseBtn.addEventListener('click', closeSearchPanel);
        }

        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => performSearch(searchInput.value), 200);
            });
        }

        window.addEventListener('youvi:ratingFilterChanged', () => {
            if (searchPanel && searchPanel.classList.contains('active')) {
                performSearch(searchInput ? searchInput.value : '');
            }
        });

        document.addEventListener('keydown', handleKeydown);

        setLayout('2h');

        if (MULTIVIEW_DEBUG) console.log('[Multiview] Initialized');
    }

    function handleKeydown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if ((e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') && !e.ctrlKey && !e.altKey) {
            if (document.fullscreenElement || document.webkitFullscreenElement) return;
            e.preventDefault();
            toggle();
        }

        if ((e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') && !e.ctrlKey && !e.altKey && mvState.active) {
            e.preventDefault();
            toggleFullscreen();
        }

        if (e.key === 'Escape' && mvState.active) {
            if (searchPanel && searchPanel.classList.contains('active')) {
                closeSearchPanel();
            } else {
                close();
            }
        }
    }

    function toggleFullscreen() {
        if (!mvState.active) return;
        
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        } else {
            if (overlay.requestFullscreen) {
                overlay.requestFullscreen();
            } else if (overlay.webkitRequestFullscreen) {
                overlay.webkitRequestFullscreen();
            }
        }
    }
    
    function updateMainFullscreenIcon() {
        if (!fullscreenBtn) return;
        if (document.fullscreenElement === overlay || document.webkitFullscreenElement === overlay) {
            fullscreenBtn.innerHTML = ICONS.fullscreenExit;
        } else {
            fullscreenBtn.innerHTML = ICONS.fullscreen;
        }
    }
    
    document.addEventListener('fullscreenchange', updateMainFullscreenIcon);
    document.addEventListener('webkitfullscreenchange', updateMainFullscreenIcon);

    function toggle() {
        mvState.active ? close() : open();
    }

    function onMainVideoTimeUpdate() {
        if (!mvState.active) return;
        const slot0 = mvState.slots[0];
        if (!slot0 || !slot0.video) return;
        if (slot0.videoData !== window.currentVideo && 
            slot0.videoData?.name !== window.currentVideo?.name) return;
        
        const diff = Math.abs(mainVideo.currentTime - slot0.video.currentTime);
        if (diff > 1) {
            slot0.video.currentTime = mainVideo.currentTime;
        }
    }
    
    function onMainVideoSeeked() {
        if (!mvState.active) return;
        const slot0 = mvState.slots[0];
        if (!slot0 || !slot0.video) return;
        if (slot0.videoData !== window.currentVideo && 
            slot0.videoData?.name !== window.currentVideo?.name) return;
        
        slot0.video.currentTime = mainVideo.currentTime;
    }

    function open() {
        mvState.active = true;
        overlay.classList.add('active');
        if (multiviewBtn) multiviewBtn.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (mainVideo) {
            mvState.mainVideoWasMuted = mainVideo.muted;
            mvState.mainVideoWasPlaying = !mainVideo.paused;
            mvState.mainVideoVolume = mainVideo.volume;
            mvState.mainVideoTime = mainVideo.currentTime;
            mainVideo.muted = true;
            
            mainVideo.addEventListener('seeked', onMainVideoSeeked);
        }

        if (window.currentVideo) {
            if (!mvState.slots[0] || !mvState.slots[0].videoData) {
                mvState.slots[0] = { 
                    video: null, 
                    videoData: window.currentVideo,
                    blobUrl: null,
                    savedTime: mvState.mainVideoTime || 0,
                    wasPlaying: mvState.mainVideoWasPlaying || false
                };
            } else if (mvState.slots[0].videoData === window.currentVideo || 
                       mvState.slots[0].videoData.name === window.currentVideo.name) {
                mvState.slots[0].savedTime = mvState.mainVideoTime || 0;
                mvState.slots[0].wasPlaying = mvState.mainVideoWasPlaying || false;
            }
        }

        renderSlots();
    }

    function close() {
        if (document.fullscreenElement === overlay || document.webkitFullscreenElement === overlay) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
        
        mvState.active = false;
        overlay.classList.remove('active');
        if (multiviewBtn) multiviewBtn.classList.remove('active');
        document.body.style.overflow = '';
        closeSearchPanel();

        if (mainVideo) {
            mainVideo.removeEventListener('seeked', onMainVideoSeeked);
        }

        let syncTime = null;
        if (mvState.slots[0] && mvState.slots[0].video && !isNaN(mvState.slots[0].video.currentTime)) {
            syncTime = mvState.slots[0].video.currentTime;
        }

        mvState.slots.forEach(slot => {
            if (slot.video) {
                slot.video.pause();
                slot.video.muted = true;
            }
            if (slot.blobUrl) {
                URL.revokeObjectURL(slot.blobUrl);
                slot.blobUrl = null;
            }
        });

        if (mainVideo) {
            mainVideo.muted = mvState.mainVideoWasMuted || false;
            if (mvState.mainVideoVolume !== undefined) {
                mainVideo.volume = mvState.mainVideoVolume;
            }
            
            if (syncTime !== null && !isNaN(syncTime)) {
                mainVideo.currentTime = syncTime;
                
                const progressBarFilled = document.getElementById('progressBarFilled');
                const progressHandle = document.getElementById('progressHandle');
                const timeDisplay = document.getElementById('timeDisplay');
                const miniProgressFill = document.getElementById('miniProgressFill');
                
                if (mainVideo.duration) {
                    const percent = (syncTime / mainVideo.duration) * 100;
                    if (progressBarFilled) progressBarFilled.style.width = percent + '%';
                    if (progressHandle) progressHandle.style.left = percent + '%';
                    if (miniProgressFill) miniProgressFill.style.width = percent + '%';
                }
                if (timeDisplay && mainVideo.duration) {
                    timeDisplay.textContent = `${formatDuration(syncTime)} / ${formatDuration(mainVideo.duration)}`;
                }
            }
        }

        const videoControls = document.querySelector('.video-controls');
        if (videoControls) {
            videoControls.classList.remove('autohide');
            videoControls.classList.add('show');
        }

        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.classList.remove('autohide');
            progressBar.classList.add('show');
        }
        
        const miniProgressBar = document.getElementById('miniProgressBar');
        if (miniProgressBar) {
            miniProgressBar.classList.remove('show');
        }
    }

    function setLayout(layout) {
        mvState.layout = layout;
        grid.className = 'multiview-grid layout-' + layout;

        layoutBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.layout === layout);
        });

        const count = layoutSlotCounts[layout] || 2;

        mvState.slots.forEach(slot => {
            if (slot.video && !isNaN(slot.video.currentTime)) {
                slot.savedTime = slot.video.currentTime;
                slot.wasPlaying = !slot.video.paused;
            }
        });

        while (mvState.slots.length > count) {
            const removed = mvState.slots.pop();
            if (removed.video) {
                removed.video.pause();
                removed.video.src = '';
            }
            if (removed.blobUrl) URL.revokeObjectURL(removed.blobUrl);
        }

        while (mvState.slots.length < count) {
            mvState.slots.push({ video: null, videoData: null, blobUrl: null });
        }

        renderSlots();
    }

    function renderSlots() {
        const existingVideos = grid.querySelectorAll('video');
        existingVideos.forEach((vid, i) => {
            if (mvState.slots[i] && !isNaN(vid.currentTime) && vid.currentTime > 0) {
                if (MULTIVIEW_DEBUG) console.log('[Multiview] Saving time for slot', i, ':', vid.currentTime);
                mvState.slots[i].savedTime = vid.currentTime;
                mvState.slots[i].wasPlaying = !vid.paused;
            }
        });
        
        grid.innerHTML = '';
        const count = layoutSlotCounts[mvState.layout] || 2;

        for (let i = 0; i < count; i++) {
            const slot = mvState.slots[i] || { video: null, videoData: null, blobUrl: null };
            mvState.slots[i] = slot;
            
            if (MULTIVIEW_DEBUG) console.log('[Multiview] Creating slot', i, 'savedTime:', slot.savedTime);

            const slotEl = createSlotElement(slot, i);
            grid.appendChild(slotEl);
        }
    }

    function createSlotElement(slot, index) {
        const slotEl = document.createElement('div');
        slotEl.className = 'multiview-slot';
        slotEl.dataset.index = index;
        slotEl.tabIndex = 0;

        if (slot.videoData) {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.playsInline = true;
            video.disablePictureInPicture = true;
            slot.video = video;

            loadVideoSource(slot, video);

            const spinner = document.createElement('div');
            spinner.className = 'mv-loading-spinner';
            
            const playHud = document.createElement('div');
            playHud.className = 'mv-play-hud';
            playHud.innerHTML = ICONS.play;

            const seekHud = document.createElement('div');
            seekHud.className = 'mv-seek-hud';
            seekHud.innerHTML = '<div class="mv-seek-hud-circle"></div>';

            const dragIndicator = document.createElement('div');
            dragIndicator.className = 'mv-drag-indicator';

            const controls = createPlayerControls(video, slotEl, slot);

            const topBar = createTopBar(slot, index);

            slotEl.appendChild(video);
            slotEl.appendChild(spinner);
            slotEl.appendChild(playHud);
            slotEl.appendChild(seekHud);
            slotEl.appendChild(dragIndicator);
            slotEl.appendChild(controls);
            slotEl.appendChild(topBar);

            setupSlotEvents(slotEl, video, slot, { spinner, playHud, seekHud, dragIndicator, controls });

        } else {
            const empty = document.createElement('div');
            empty.className = 'multiview-slot-empty';
            const addVideoText = typeof i18n !== 'undefined' ? i18n.t('multiview.addVideo', 'Add video') : 'Add video';
            empty.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="16"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                <span>${addVideoText}</span>
            `;
            empty.addEventListener('click', () => openSearchPanel(index));
            slotEl.appendChild(empty);
        }

        return slotEl;
    }

    function createPlayerControls(video, slotEl, slot) {
        const controls = document.createElement('div');
        controls.className = 'mv-player-controls';
        controls.innerHTML = `
            <div class="mv-progress-row">
                <div class="mv-progress">
                    <div class="mv-progress-filled"></div>
                    <div class="mv-progress-handle"></div>
                    <div class="mv-progress-preview"></div>
                </div>
            </div>
            <div class="mv-buttons-row">
                <button class="mv-play-btn">${ICONS.play}</button>
                <span class="mv-time">0:00 / 0:00</span>
                <div class="mv-volume-container">
                    <button class="mv-volume-btn">${ICONS.volumeHigh}</button>
                    <input type="range" class="mv-volume-slider" min="0" max="100" value="100">
                </div>
                <div class="mv-controls-spacer"></div>
                <button class="mv-fullscreen-btn">${ICONS.fullscreen}</button>
            </div>
        `;
        return controls;
    }

    function createTopBar(slot, index) {
        const topBar = document.createElement('div');
        topBar.className = 'multiview-slot-controls';
        const swapTitle = typeof i18n !== 'undefined' ? i18n.t('multiview.swap', 'Swap') : 'Swap';
        const removeTitle = typeof i18n !== 'undefined' ? i18n.t('multiview.remove', 'Remove') : 'Remove';
        topBar.innerHTML = `
            <span class="multiview-slot-title">${removeExtension(slot.videoData?.name || '')}</span>
            <div class="multiview-slot-actions">
                <button class="multiview-slot-btn" data-action="swap" title="${swapTitle}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
                    </svg>
                </button>
                <button class="multiview-slot-btn" data-action="remove" title="${removeTitle}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;

        topBar.querySelector('[data-action="swap"]').addEventListener('click', (e) => {
            e.stopPropagation();
            openSearchPanel(index);
        });

        topBar.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromSlot(index);
        });

        return topBar;
    }


    function setupSlotEvents(slotEl, video, slot, elements) {
        const { spinner, playHud, seekHud, dragIndicator, controls } = elements;
        
        const playBtn = controls.querySelector('.mv-play-btn');
        const timeDisplay = controls.querySelector('.mv-time');
        const progress = controls.querySelector('.mv-progress');
        const progressFilled = controls.querySelector('.mv-progress-filled');
        const progressHandle = controls.querySelector('.mv-progress-handle');
        const progressPreview = controls.querySelector('.mv-progress-preview');
        const volumeBtn = controls.querySelector('.mv-volume-btn');
        const volumeSlider = controls.querySelector('.mv-volume-slider');
        const fullscreenBtn = controls.querySelector('.mv-fullscreen-btn');

        video.addEventListener('waiting', () => spinner.classList.add('show'));
        video.addEventListener('seeking', () => spinner.classList.add('show'));
        video.addEventListener('canplay', () => spinner.classList.remove('show'));
        video.addEventListener('playing', () => spinner.classList.remove('show'));

        let playHudTimer = null;
        function showPlayHud(isPlaying) {
            playHud.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
            playHud.classList.add('show');
            clearTimeout(playHudTimer);
            playHudTimer = setTimeout(() => playHud.classList.remove('show'), 400);
        }

        function togglePlay() {
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        }

        video.addEventListener('play', () => {
            playBtn.innerHTML = ICONS.pause;
            showPlayHud(true);
        });

        video.addEventListener('pause', () => {
            playBtn.innerHTML = ICONS.play;
            showPlayHud(false);
        });

        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            slotEl.focus();
            togglePlay();
        });

        video.addEventListener('click', () => {
            slotEl.focus();
            togglePlay();
        });

        let lastTimeUpdate = 0;
        video.addEventListener('timeupdate', () => {
            const now = performance.now();
            if (now - lastTimeUpdate < 250) return;
            lastTimeUpdate = now;

            const current = formatDuration(video.currentTime);
            const total = formatDuration(video.duration || 0);
            timeDisplay.textContent = `${current} / ${total}`;

            const percent = (video.currentTime / video.duration) * 100 || 0;
            progressFilled.style.width = percent + '%';
            progressHandle.style.left = percent + '%';
        });

        let isScrubbing = false;
        
        function seekFromClientX(clientX) {
            const rect = progress.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const newTime = pos * (video.duration || 0);
            if (isFinite(newTime)) {
                video.currentTime = newTime;
            }
            progressFilled.style.width = (pos * 100) + '%';
            progressHandle.style.left = (pos * 100) + '%';
            if (!isNaN(video.currentTime) && !isNaN(video.duration)) {
                timeDisplay.textContent = `${formatDuration(video.currentTime)} / ${formatDuration(video.duration)}`;
            }
        }
        
        function onMouseMoveScrub(e) {
            if (!isScrubbing) return;
            seekFromClientX(e.clientX);
        }
        
        function onMouseUpScrub() {
            if (!isScrubbing) return;
            isScrubbing = false;
            progress.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMoveScrub);
            document.removeEventListener('mouseup', onMouseUpScrub);
            video.play();
        }
        
        function startDrag(e) {
            e.preventDefault();
            isScrubbing = true;
            progress.classList.add('dragging');
            video.pause();
            seekFromClientX(e.clientX);
            document.addEventListener('mousemove', onMouseMoveScrub);
            document.addEventListener('mouseup', onMouseUpScrub);
        }

        progress.addEventListener('mousemove', (e) => {
            if (!video.duration) return;
            const rect = progress.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const time = percent * video.duration;

            progressPreview.textContent = formatDuration(time);
            progressPreview.style.left = (percent * 100) + '%';
            progressPreview.classList.add('show');
        });

        progress.addEventListener('mouseleave', () => {
            progressPreview.classList.remove('show');
        });

        progressHandle.addEventListener('mousedown', startDrag);
        progress.addEventListener('mousedown', (e) => {
            if (e.target === progressHandle) return;
            startDrag(e);
        });

        let dragStartX = 0, dragStartTime = 0, isDragging = false;

        video.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragStartX = e.clientX;
            dragStartTime = video.currentTime;
            isDragging = false;
        });

        video.addEventListener('mousemove', (e) => {
            if (dragStartX === 0 || !video.duration) return;
            const deltaX = e.clientX - dragStartX;
            if (Math.abs(deltaX) > 10) {
                isDragging = true;
                const seekAmount = deltaX / 5;
                const newTime = Math.max(0, Math.min(video.duration, dragStartTime + seekAmount));
                video.currentTime = newTime;

                const delta = newTime - dragStartTime;
                dragIndicator.textContent = (delta >= 0 ? '+' : '') + formatDuration(Math.abs(delta));
                dragIndicator.classList.add('show');
            }
        });

        video.addEventListener('mouseup', () => {
            if (isDragging) {
                video.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, { once: true, capture: true });
            }
            dragStartX = 0;
            isDragging = false;
            dragIndicator.classList.remove('show');
        });

        video.addEventListener('mouseleave', () => {
            dragStartX = 0;
            isDragging = false;
            dragIndicator.classList.remove('show');
        });

        const mainPlayerVolume = mainVideo ? mainVideo.volume : 1;
        video.volume = mainPlayerVolume;
        video.muted = false;
        
        function updateVolumeSlider() {
            const val = video.muted ? 0 : video.volume * 100;
            volumeSlider.value = val;
            volumeSlider.style.setProperty('--vol-pos', val + '%');
        }

        function updateVolumeIcon() {
            if (video.muted || video.volume === 0) {
                volumeBtn.innerHTML = ICONS.volumeOff;
            } else if (video.volume < 0.5) {
                volumeBtn.innerHTML = ICONS.volumeLow;
            } else {
                volumeBtn.innerHTML = ICONS.volumeHigh;
            }
        }
        
        updateVolumeSlider();
        updateVolumeIcon();

        volumeSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const val = parseFloat(volumeSlider.value);
            video.volume = val / 100;
            video.muted = val === 0;
            updateVolumeSlider();
            updateVolumeIcon();
        });

        volumeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            video.muted = !video.muted;
            updateVolumeSlider();
            updateVolumeIcon();
        });

        function updateFullscreenIcon() {
            if (document.fullscreenElement === slotEl || document.webkitFullscreenElement === slotEl) {
                fullscreenBtn.innerHTML = ICONS.fullscreenExit;
            } else {
                fullscreenBtn.innerHTML = ICONS.fullscreen;
            }
        }
        
        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.fullscreenElement === slotEl || document.webkitFullscreenElement === slotEl) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            } else {
                if (slotEl.requestFullscreen) slotEl.requestFullscreen();
                else if (slotEl.webkitRequestFullscreen) slotEl.webkitRequestFullscreen();
            }
        });
        
        slotEl.addEventListener('fullscreenchange', updateFullscreenIcon);
        slotEl.addEventListener('webkitfullscreenchange', updateFullscreenIcon);

        let seekHudTimer = null;
        function showSeekHUD(direction, seconds) {
            seekHud.className = 'mv-seek-hud ' + direction;
            const circle = seekHud.querySelector('.mv-seek-hud-circle');
            if (circle) {
                const arrow = direction === 'left' ? '←' : '→';
                const secLabel = typeof i18n !== 'undefined' ? i18n.t('player.sec', 'sec') : 'sec';
                circle.innerHTML = `<div style="font-size:14px;">${seconds} ${secLabel}</div><div style="font-size:16px; margin-top:2px;">${arrow}</div>`;
            }
            seekHud.classList.add('show');
            clearTimeout(seekHudTimer);
            seekHudTimer = setTimeout(() => seekHud.classList.remove('show'), 250);
        }

        slotEl.addEventListener('mousedown', (e) => {
            if (!e.target.closest('button') && !e.target.closest('input')) {
                slotEl.focus();
            }
        });

        slotEl.addEventListener('keydown', (e) => {
            const handled = [' ', 'k', 'K', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                             'm', 'M', 'f', 'F', 'j', 'J', 'l', 'L', 'Home', 'End'];
            if (handled.includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
            }

            if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
                togglePlay();
            } else if (e.key === 'ArrowLeft') {
                video.currentTime = Math.max(0, video.currentTime - 5);
                showSeekHUD('left', 5);
            } else if (e.key === 'ArrowRight') {
                video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
                showSeekHUD('right', 5);
            } else if (e.key === 'j' || e.key === 'J') {
                video.currentTime = Math.max(0, video.currentTime - 10);
                showSeekHUD('left', 10);
            } else if (e.key === 'l' || e.key === 'L') {
                video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
                showSeekHUD('right', 10);
            } else if (e.key === 'Home') {
                video.currentTime = 0;
            } else if (e.key === 'End') {
                video.currentTime = video.duration || 0;
            } else if (e.key === 'ArrowUp') {
                video.volume = Math.min(1, video.volume + 0.1);
                updateVolumeSlider();
                updateVolumeIcon();
            } else if (e.key === 'ArrowDown') {
                video.volume = Math.max(0, video.volume - 0.1);
                updateVolumeSlider();
                updateVolumeIcon();
            } else if (e.key === 'm' || e.key === 'M') {
                video.muted = !video.muted;
                updateVolumeSlider();
                updateVolumeIcon();
            } else if (e.key === 'f' || e.key === 'F') {
                if (document.fullscreenElement === slotEl || document.webkitFullscreenElement === slotEl) {
                    if (document.exitFullscreen) document.exitFullscreen();
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                } else {
                    if (slotEl.requestFullscreen) slotEl.requestFullscreen();
                    else if (slotEl.webkitRequestFullscreen) slotEl.webkitRequestFullscreen();
                }
            }
        });
    }

    async function loadVideoSource(slot, videoEl) {
        if (!slot.videoData || !videoEl) return;

        const targetTime = slot.savedTime || slot.startTime || 0;
        const shouldPlay = slot.wasPlaying || false;
        
        slot.savedTime = undefined;
        slot.wasPlaying = undefined;
        slot.startTime = undefined;

        try {
            let file = null;
            const videoData = slot.videoData;

            if (videoData.file) {
                file = videoData.file;
            }

            if (!file && videoData.dirHandle && videoData.name) {
                try {
                    const fileHandle = await videoData.dirHandle.getFileHandle(videoData.name);
                    file = await fileHandle.getFile();
                } catch (e) {}
            }

            if (!file && videoData.handle) {
                try {
                    file = await videoData.handle.getFile();
                } catch (e) {}
            }

            if (!file && videoData.name && window.videoDirectoryHandle) {
                file = await searchFileInDirectory(window.videoDirectoryHandle, videoData.name, videoData);
            }

            if (file) {
                if (slot.blobUrl) URL.revokeObjectURL(slot.blobUrl);
                slot.blobUrl = URL.createObjectURL(file);
                
                const syncTime = () => {
                    if (MULTIVIEW_DEBUG) console.log('[Multiview] syncTime called, targetTime:', targetTime, 'duration:', videoEl.duration);
                    if (targetTime > 0 && !isNaN(videoEl.duration) && targetTime < videoEl.duration) {
                        videoEl.currentTime = targetTime;
                        if (MULTIVIEW_DEBUG) console.log('[Multiview] Set currentTime to:', targetTime);
                    }
                    if (shouldPlay) {
                        videoEl.play().catch(() => {});
                    }
                };
                
                videoEl.addEventListener('loadedmetadata', syncTime, { once: true });
                videoEl.src = slot.blobUrl;
                
            } else {
                console.error('[Multiview] No file source for:', videoData.name);
            }
        } catch (e) {
            console.error('[Multiview] Load error:', e);
        }
    }

    async function searchFileInDirectory(dirHandle, fileName, videoData, depth = 0) {
        if (depth > 3) return null;
        try {
            for await (const [name, handle] of dirHandle.entries()) {
                if (handle.kind === 'file' && name === fileName) {
                    const file = await handle.getFile();
                    if (videoData) videoData.dirHandle = dirHandle;
                    return file;
                } else if (handle.kind === 'directory' && !name.startsWith('.')) {
                    const found = await searchFileInDirectory(handle, fileName, videoData, depth + 1);
                    if (found) return found;
                }
            }
        } catch (e) {}
        return null;
    }

    function removeFromSlot(index) {
        if (mvState.slots[index]) {
            if (mvState.slots[index].video) mvState.slots[index].video.pause();
            if (mvState.slots[index].blobUrl) URL.revokeObjectURL(mvState.slots[index].blobUrl);
            mvState.slots[index] = { video: null, videoData: null, blobUrl: null };
            renderSlots();
        }
    }

    function openSearchPanel(slotIndex) {
        mvState.currentSlotIndex = slotIndex;
        searchPanel.classList.add('active');
        searchInput.value = '';
        searchInput.focus();
        performSearch('');
    }

    function closeSearchPanel() {
        searchPanel.classList.remove('active');
        mvState.currentSlotIndex = null;
    }

    function performSearch(query) {
        const baseVideos = window.allVideos || [];
        const ratingMode = window.currentRatingFilter || 'all';
        const sourceVideos = (typeof window.applyRatingFilterToList === 'function')
            ? window.applyRatingFilterToList(baseVideos, ratingMode)
            : baseVideos;

        if (typeof evaluateBooleanQuery !== 'function') {
            if (!query) {
                renderSearchResults(sourceVideos.slice(0, 50));
                return;
            }
            const lowerQ = query.toLowerCase();
            const results = sourceVideos.filter(v => v.name && v.name.toLowerCase().includes(lowerQ));
            renderSearchResults(results.slice(0, 50));
            return;
        }

        if (!query) {
            renderSearchResults(sourceVideos.slice(0, 50));
            return;
        }

        try {
            const results = evaluateBooleanQuery(query, sourceVideos, (basicQuery) => {
                const lowerQ = basicQuery.toLowerCase();
                return sourceVideos.filter(v =>
                    (v.name && v.name.toLowerCase().includes(lowerQ)) ||
                    (v.tags && v.tags.some(t => t.toLowerCase().includes(lowerQ)))
                );
            });
            renderSearchResults(results.slice(0, 50));
        } catch (e) {
            console.error('[Multiview] Search error:', e);
            const lowerQ = query.toLowerCase();
            const results = sourceVideos.filter(v => v.name && v.name.toLowerCase().includes(lowerQ));
            renderSearchResults(results.slice(0, 50));
        }
    }

    function renderSearchResults(videos) {
        searchResults.innerHTML = '';

        if (videos.length === 0) {
            const noVideosText = typeof i18n !== 'undefined' ? i18n.t('search.noResults', 'Nothing found') : 'Nothing found';
            searchResults.innerHTML = `<div style="padding:20px;text-align:center;color:#888;">${noVideosText}</div>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        const thumbsToLoad = [];

        videos.forEach(v => {
            const item = document.createElement('div');
            item.className = 'multiview-search-item';
            const ratingBadgeHtml = (typeof window.getVideoRatingBadgeHtmlForVideo === 'function')
                ? window.getVideoRatingBadgeHtmlForVideo(v)
                : '';

            let tagsHtml = '';
            if (window.TagTypes && v.tags && v.tags.length > 0) {
                tagsHtml = `<div class="multiview-search-item-tags">${window.TagTypes.renderTags(v.tags, 6, false)}</div>`;
            }

            item.innerHTML = `
                <div class="multiview-search-item-thumb loading">${ratingBadgeHtml}</div>
                <div class="multiview-search-item-info">
                    <div class="multiview-search-item-title">${removeExtension(v.name || '')}</div>
                    ${tagsHtml}
                </div>
            `;

            const thumbEl = item.querySelector('.multiview-search-item-thumb');
            thumbsToLoad.push({ thumbEl, video: v });

            item.addEventListener('click', () => selectVideo(v));
            fragment.appendChild(item);
        });

        searchResults.appendChild(fragment);

        if (typeof getPreviewAndDuration === 'function') {
            const BATCH_SIZE = 5;
            let batchIndex = 0;
            
            const loadBatch = () => {
                const batch = thumbsToLoad.slice(batchIndex, batchIndex + BATCH_SIZE);
                if (batch.length === 0) return;
                
                batch.forEach(({ thumbEl, video }) => {
                    getPreviewAndDuration(video).then(({ preview, duration }) => {
                        thumbEl.classList.remove('loading');
                        if (preview) thumbEl.style.backgroundImage = `url(${preview})`;
                        if (duration) {
                            const dur = document.createElement('div');
                            dur.className = 'multiview-search-item-duration';
                            dur.textContent = duration;
                            thumbEl.appendChild(dur);
                        }
                    }).catch(() => thumbEl.classList.remove('loading'));
                });
                
                batchIndex += BATCH_SIZE;
                if (batchIndex < thumbsToLoad.length) {
                    requestIdleCallback(loadBatch, { timeout: 100 });
                }
            };
            
            requestIdleCallback(loadBatch, { timeout: 50 });
        }
    }

    function selectVideo(videoData) {
        if (mvState.currentSlotIndex === null) return;

        const slot = mvState.slots[mvState.currentSlotIndex];
        if (slot && slot.blobUrl) URL.revokeObjectURL(slot.blobUrl);

        mvState.slots[mvState.currentSlotIndex] = { video: null, videoData: videoData, blobUrl: null };
        closeSearchPanel();
        renderSlots();
    }

    function formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function removeExtension(name) {
        return name ? name.replace(/\.[^/.]+$/, '') : '';
    }

    window.Multiview = {
        open,
        close,
        toggle,
        setLayout,
        isActive: () => mvState.active
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

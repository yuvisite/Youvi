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
(function(){
	let root, inner, overlay, ppBtn, scrollBtn, toggleBtn;
	let isActive = false;
	let isEnabled = true;
	let isPipBlocking = false;
	let ox = 0, oy = 0, startX = 0, startY = 0, dragging = false;
	let observer;
	const MINI_PLAYER_STATE_KEY = 'miniPlayerEnabled';

    function hideMainPlayerPreview(){
        const overlay = document.getElementById('videoOverlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 300);
        }
        
        const progressPreview = document.getElementById('progressPreview');
        if (progressPreview) {
            progressPreview.style.display = 'none';
        }
        
        const playPauseBtn = document.querySelector('.video-controls .control-btn[title*="Play"], .video-controls .control-btn[title*="Pause"]');
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>';
        }
        
        const videoClock = document.getElementById('videoClock');
        if (videoClock) {
            videoClock.style.display = 'block';
        }
    }

    function ensureDom(){
		if (root) return;
		root = document.createElement('div');
		root.className = 'mini-player';
		root.setAttribute('aria-label', 'Mini player');

		inner = document.createElement('div');
		inner.className = 'mini-player-inner';

		overlay = document.createElement('div');
		overlay.className = 'mini-overlay';
		ppBtn = document.createElement('button');
		ppBtn.className = 'mini-pp-btn';
		ppBtn.type = 'button';
		ppBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>';
		overlay.appendChild(ppBtn);
		inner.appendChild(overlay);
		root.appendChild(inner);
		document.body.appendChild(root);

		scrollBtn = document.createElement('button');
		scrollBtn.className = 'scroll-to-top-btn';
		scrollBtn.type = 'button';
		scrollBtn.setAttribute('aria-label', 'Scroll to top');
		scrollBtn.innerHTML = `
			<svg viewBox="0 0 24 24">
				<path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
			</svg>
		`;
		document.body.appendChild(scrollBtn);

		toggleBtn = document.createElement('button');
		toggleBtn.className = 'mini-player-toggle-btn enabled';
		toggleBtn.type = 'button';
		toggleBtn.setAttribute('aria-label', 'Toggle mini player');
		toggleBtn.innerHTML = `
			<svg viewBox="0 0 24 24">
				<path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l-1 1v1h12v-1l-1-1h3c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/>
			</svg>
		`;
		document.body.appendChild(toggleBtn);

		ppBtn.addEventListener('click', function(e){
			e.stopPropagation();
			const v = document.getElementById('video');
			if (!v) return;
			if (v.paused) { 
				v.play(); 
				hideMainPlayerPreview();
			} else { 
				v.pause(); 
				const playPauseBtn = document.querySelector('.video-controls .control-btn[title*="Play"], .video-controls .control-btn[title*="Pause"]');
				if (playPauseBtn) {
					playPauseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>';
				}
			}
			ppBtn.innerHTML = v.paused ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>';
		});

		scrollBtn.addEventListener('click', function(e){
			e.stopPropagation();
			window.scrollTo({
				top: 0,
				behavior: 'smooth'
			});
		});

		toggleBtn.addEventListener('click', function(e){
			e.stopPropagation();
			isEnabled = !isEnabled;
			localStorage.setItem(MINI_PLAYER_STATE_KEY, isEnabled.toString());
			updateToggleButton();
			
			if (!isEnabled && isActive) {
				deactivate();
			} else if (isEnabled) {
				const target = document.querySelector('.player-section');
				if (target) {
					const rect = target.getBoundingClientRect();
					const isVisible = rect.top < 0 || rect.bottom < window.innerHeight;
					if (isVisible) {
						activate();
					}
				}
			}
		});

		root.addEventListener('mousedown', startDrag);
		root.addEventListener('touchstart', startDrag, { passive: true });
		document.addEventListener('mousemove', onDrag);
		document.addEventListener('touchmove', onDrag, { passive: false });
		document.addEventListener('mouseup', endDrag);
		document.addEventListener('touchend', endDrag);
	}

	function startDrag(e){
		dragging = true;
		root.classList.add('grabbing');
		const rect = root.getBoundingClientRect();
		startX = (e.touches ? e.touches[0].clientX : e.clientX);
		startY = (e.touches ? e.touches[0].clientY : e.clientY);
		ox = startX - rect.left;
		oy = startY - rect.top;
	}

	function onDrag(e){
		if (!dragging) return;
		e.preventDefault();
		const x = (e.touches ? e.touches[0].clientX : e.clientX) - ox;
		const y = (e.touches ? e.touches[0].clientY : e.clientY) - oy;
		const maxX = window.innerWidth - root.offsetWidth;
		const maxY = window.innerHeight - root.offsetHeight;
		root.style.left = Math.min(Math.max(0, x), maxX) + 'px';
		root.style.top  = Math.min(Math.max(0, y), maxY) + 'px';
		root.style.right = 'auto';
		root.style.bottom = 'auto';
	}

    function endDrag(){
        if (!dragging) return;
        dragging = false;
        root.classList.remove('grabbing');
    }

    function updateToggleButton(){
        if (!toggleBtn) return;
        if (isEnabled) {
            toggleBtn.classList.add('enabled');
            toggleBtn.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l-1 1v1h12v-1l-1-1h3c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/>
                </svg>
            `;
        } else {
            toggleBtn.classList.remove('enabled');
            toggleBtn.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l-1 1v1h12v-1l-1-1h3c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/>
                </svg>
            `;
        }
    }

    function initializeMiniPlayerState(){
        const savedState = localStorage.getItem(MINI_PLAYER_STATE_KEY);
        if (savedState !== null) {
            isEnabled = savedState === 'true';
        }
        updateToggleButton();
    }

	function notifyDanmakuEngine(isMini){
		const video = document.getElementById('video');
		
		if (typeof window.clearAllDanmaku === 'function') {
			window.clearAllDanmaku();
		}
		
		if (typeof window.updateDanmakuOverlay === 'function') {
			window.updateDanmakuOverlay();
		}
		
		if (video && typeof window.updateDanmakuVisibility === 'function') {
			setTimeout(() => {
				window.updateDanmakuVisibility(video.currentTime);
			}, 100);
		}
	}

    function moveToMini(){
        const v = document.getElementById('video');
        const dm = document.getElementById('danmakuOverlay');
        if (v && !inner.contains(v)) inner.insertBefore(v, overlay);
        if (dm && !inner.contains(dm)) {
            dm.dataset.mini = '1';
            inner.appendChild(dm);
            notifyDanmakuEngine(true);
        }
        ensureProgress();
    }

    function moveToMain(){
        const container = document.getElementById('videoContainer');
        const v = document.getElementById('video');
        const dm = document.getElementById('danmakuOverlay');
        if (container){
            if (v && !container.contains(v)) container.appendChild(v);
            if (dm && !container.contains(dm)) container.appendChild(dm);
        }
        if (dm) delete dm.dataset.mini;
        notifyDanmakuEngine(false);
    }

    let progressRoot, progressTrack, progressFill, rafId;
    let timeDisplay, timeCurrent, timeDuration;

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function ensureProgress(){
        if (progressRoot) return;
        progressRoot = document.createElement('div');
        progressRoot.className = 'mini-progress';
        progressTrack = document.createElement('div');
        progressTrack.className = 'mini-progress-track';
        progressFill = document.createElement('div');
        progressFill.className = 'mini-progress-fill';
        progressRoot.appendChild(progressTrack);
        progressRoot.appendChild(progressFill);
        inner.appendChild(progressRoot);
        
        timeDisplay = document.createElement('div');
        timeDisplay.className = 'mini-time-display';
        timeCurrent = document.createElement('span');
        timeCurrent.className = 'mini-time-current';
        timeCurrent.textContent = '0:00';
        timeDuration = document.createElement('span');
        timeDuration.className = 'mini-time-duration';
        timeDuration.textContent = '0:00';
        timeDisplay.appendChild(timeCurrent);
        timeDisplay.appendChild(timeDuration);
        inner.appendChild(timeDisplay);
        
        renderMiniChapterMarkers();
    }

    function renderMiniChapterMarkers() {
        if (!progressRoot) return;
        
        const existingMarkers = progressRoot.querySelectorAll('.mini-chapter-marker');
        existingMarkers.forEach(marker => marker.remove());
        
        const chapters = window.currentChapters || [];
        const video = document.getElementById('video');
        
        if (!video || chapters.length === 0) return;
        
        chapters.forEach(chapter => {
            const marker = document.createElement('div');
            marker.className = 'mini-chapter-marker';
            marker.dataset.time = chapter.time;
            marker.dataset.title = chapter.title;
            
            const updateMarkerPosition = () => {
                if (video.duration > 0) {
                    const percentage = (chapter.time / video.duration) * 100;
                    marker.style.left = `${percentage}%`;
                }
            };
            
            if (video.duration > 0) {
                updateMarkerPosition();
            } else {
                video.addEventListener('loadedmetadata', updateMarkerPosition, { once: true });
            }
            
            progressRoot.appendChild(marker);
        });
    }

    function tickProgress(){
        const v = document.getElementById('video');
        if (!v || v.duration === 0 || isNaN(v.duration)) return;
        const pct = Math.max(0, Math.min(1, v.currentTime / v.duration));
        if (progressFill) progressFill.style.width = (pct * 100).toFixed(3) + '%';
        if (timeCurrent) timeCurrent.textContent = formatTime(v.currentTime);
        if (timeDuration) timeDuration.textContent = formatTime(v.duration);
        if (isActive) rafId = requestAnimationFrame(tickProgress);
    }

    function activate(){
		if (isActive || !isEnabled || isPipBlocking) return;
		ensureDom();
		isActive = true;
		root.classList.add('active');
        
        const isPipActive = window.documentPiPManager && window.documentPiPManager.pipWindow;
        
        if (isPipActive) {
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            const pipMessage = typeof i18n !== 'undefined' ? i18n.t('player.pipOverlayMessage') : 'Плеер открыт в Picture-in-Picture режиме';
            overlay.innerHTML = `<div style="color: white; font-size: 14px; font-weight: 600; text-align: center; padding: 20px; line-height: 1.4;">${pipMessage.replace('Picture-in-Picture', '<br>Picture-in-Picture')}</div>`;
            
            if (progressRoot) progressRoot.style.display = 'none';
            if (timeDisplay) timeDisplay.style.display = 'none';
        } else {
            overlay.style.display = '';
            overlay.style.alignItems = '';
            overlay.style.justifyContent = '';
            
            if (!ppBtn || !overlay.contains(ppBtn)) {
                overlay.innerHTML = '';
                ppBtn = document.createElement('button');
                ppBtn.className = 'mini-pp-btn';
                ppBtn.type = 'button';
                overlay.appendChild(ppBtn);
                
                ppBtn.addEventListener('click', function(e){
                    e.stopPropagation();
                    const v = document.getElementById('video');
                    if (!v) return;
                    if (v.paused) { 
                        v.play(); 
                        hideMainPlayerPreview();
                    } else { 
                        v.pause(); 
                        const playPauseBtn = document.querySelector('.video-controls .control-btn[title*="Play"], .video-controls .control-btn[title*="Pause"]');
                        if (playPauseBtn) {
                            playPauseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>';
                        }
                    }
                    ppBtn.innerHTML = v.paused ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>';
                });
            }
            
            moveToMini();
            const v = document.getElementById('video');
            if (v) ppBtn.innerHTML = v.paused ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>';
            
            if (progressRoot) progressRoot.style.display = '';
            if (timeDisplay) timeDisplay.style.display = '';
        }
        
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tickProgress);
        renderMiniChapterMarkers();
	}

	function deactivate(){
		if (!isActive) return;
		isActive = false;
		root.classList.remove('active');
        moveToMain();
        cancelAnimationFrame(rafId);
        if (typeof window.parseAndRenderChapters === 'function' && window.currentRawDescription) {
            window.parseAndRenderChapters(window.currentRawDescription);
        }
	}

	function setupObserver(){
		const target = document.querySelector('.player-section');
		if (!target) return;
		observer = new IntersectionObserver((entries)=>{
			const entry = entries[0];
			if (!entry) return;
			if (entry.isIntersecting && entry.intersectionRatio > 0){
				deactivate();
				if (scrollBtn) scrollBtn.style.display = 'none';
				if (toggleBtn) toggleBtn.style.display = 'none';
			}else{
				activate();
				if (scrollBtn) scrollBtn.style.display = 'flex';
				if (toggleBtn) toggleBtn.style.display = 'flex';
			}
		},{ threshold: [0, 0.01, 0.1, 0.5, 1] });
		observer.observe(target);
	}

	function blockMiniPlayer(){
		isPipBlocking = true;
		if (isActive) {
			deactivate();
		}
	}

	function unblockMiniPlayer(){
		isPipBlocking = false;
		if (observer) {
			const target = document.querySelector('.player-section');
			if (target) {
				observer.disconnect();
				observer.observe(target);
			}
		}
	}

	function refreshMiniPlayerState(){
		if (isActive) {
			deactivate();
			const target = document.querySelector('.player-section');
			if (target) {
				const rect = target.getBoundingClientRect();
				const isVisible = rect.top < 0 || rect.bottom < window.innerHeight;
				if (!isVisible) {
					activate();
				}
			}
		}
	}

	function init(){
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', init);
			return;
		}
		ensureDom();
		initializeMiniPlayerState();
		setupObserver();
		const v = document.getElementById('video');
		if (v){
			['play','pause'].forEach(ev=>v.addEventListener(ev, ()=>{
				ppBtn.innerHTML = v.paused ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>';
				
				const playPauseBtn = document.querySelector('.video-controls .control-btn[title*="Play"], .video-controls .control-btn[title*="Pause"]');
				if (playPauseBtn) {
					playPauseBtn.innerHTML = v.paused ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>';
				}
				
				if (ev === 'play') {
					hideMainPlayerPreview();
				}
			}));
		}
	}

	window.refreshMiniPlayerState = refreshMiniPlayerState;
	window.deactivateMiniPlayer = deactivate;
	window.blockMiniPlayer = blockMiniPlayer;
	window.unblockMiniPlayer = unblockMiniPlayer;

	init();
})();


// Simple Audio Player for Blognote

class BlognoteAudioPlayer {
    constructor(container, audioSrc, title = 'Аудио', coverSrc = null) {
        this.container = container;
        this.audioSrc = audioSrc;
        this.title = title;
        this.coverSrc = coverSrc;
        this.isPlaying = false;
        this.init();
    }

    init() {
        this.render();
        this.setupElements();
        this.attachEvents();
        this.loadMetadata();
    }

    async loadMetadata() {
        // Metadata extraction removed (jsmediatags not available)
    }

    render() {
        const coverHtml = this.coverSrc 
            ? `<img src="${this.coverSrc}" alt="${this.title}">`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2"/>
                <circle cx="12" cy="12" r="5"/>
                <path d="M12 12h.01"/>
            </svg>`;
        
        const iconClass = this.coverSrc ? 'blognote-audio-icon has-cover' : 'blognote-audio-icon';
        
        this.container.innerHTML = `
            <div class="blognote-audio-player">
                <div class="blognote-audio-info">
                    <div class="${iconClass}">
                        ${coverHtml}
                    </div>
                    <div class="blognote-audio-details">
                        <h4 class="blognote-audio-title">${this.title}</h4>
                        <div class="blognote-audio-metadata"></div>
                    </div>
                </div>
                
                <div class="blognote-audio-progress">
                    <div class="blognote-audio-progress-bar">
                        <div class="blognote-audio-progress-filled"></div>
                    </div>
                    <div class="blognote-audio-time">
                        <span class="current-time">0:00</span>
                        <span class="duration">0:00</span>
                    </div>
                </div>
                
                <div class="blognote-audio-controls-row">
                    <div class="blognote-audio-controls">
                        <button class="blognote-audio-control-btn secondary skip-back" title="Назад 10 сек">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                                <text x="8.5" y="16" font-size="7" fill="currentColor" font-weight="bold">10</text>
                            </svg>
                        </button>
                        
                        <button class="blognote-audio-control-btn main play-pause" title="Play/Pause">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        </button>
                        
                        <button class="blognote-audio-control-btn secondary skip-forward" title="Вперед 10 сек">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
                                <text x="9" y="16" font-size="7" fill="currentColor" font-weight="bold">10</text>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="blognote-audio-volume">
                        <button class="blognote-audio-volume-btn" title="Mute/Unmute">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                            </svg>
                        </button>
                        <input type="range" class="blognote-audio-volume-slider" min="0" max="100" value="100">
                    </div>
                </div>
                
                <audio preload="metadata">
                    <source src="${this.audioSrc}">
                    Ваш браузер не поддерживает аудио.
                </audio>
            </div>
        `;
    }

    setupElements() {
        this.audio = this.container.querySelector('audio');
        this.playPauseBtn = this.container.querySelector('.play-pause');
        this.skipBackBtn = this.container.querySelector('.skip-back');
        this.skipForwardBtn = this.container.querySelector('.skip-forward');
        this.progressBar = this.container.querySelector('.blognote-audio-progress-bar');
        this.progressFilled = this.container.querySelector('.blognote-audio-progress-filled');
        this.currentTimeEl = this.container.querySelector('.current-time');
        this.durationEl = this.container.querySelectorAll('.duration');
        this.volumeBtn = this.container.querySelector('.blognote-audio-volume-btn');
        this.volumeSlider = this.container.querySelector('.blognote-audio-volume-slider');
    }

    attachEvents() {
        // Play/Pause
        this.playPauseBtn.addEventListener('click', () => this.togglePlay());

        // Skip buttons
        this.skipBackBtn.addEventListener('click', () => {
            this.audio.currentTime -= 10;
        });

        this.skipForwardBtn.addEventListener('click', () => {
            this.audio.currentTime += 10;
        });

        // Progress bar
        this.progressBar.addEventListener('click', (e) => this.seek(e));

        // Volume
        this.volumeBtn.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));

        // Audio events
        this.audio.addEventListener('loadedmetadata', () => {
            this.durationEl.forEach(el => {
                el.textContent = this.formatTime(this.audio.duration);
            });
        });

        this.audio.addEventListener('timeupdate', () => {
            this.updateProgress();
        });

        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            this.updatePlayButton();
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });

        this.audio.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });

        this.audio.addEventListener('error', () => {
            this.showError();
        });

        // Initialize volume slider appearance
        this.updateVolumeSlider();
    }

    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
        } else {
            this.audio.pause();
        }
    }

    updatePlayButton() {
        const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        const pauseIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
        
        this.playPauseBtn.innerHTML = this.isPlaying ? pauseIcon : playIcon;
    }

    seek(e) {
        const rect = this.progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        this.audio.currentTime = pos * this.audio.duration;
    }

    updateProgress() {
        const percent = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressFilled.style.width = percent + '%';
        this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
    }

    toggleMute() {
        this.audio.muted = !this.audio.muted;
        this.updateVolumeIcon();
    }

    setVolume(value) {
        this.audio.volume = value / 100;
        this.audio.muted = false;
        this.updateVolumeIcon();
        this.updateVolumeSlider();
    }

    updateVolumeSlider() {
        const value = this.audio.muted ? 0 : this.audio.volume * 100;
        this.volumeSlider.value = value;
        this.volumeSlider.style.background = `linear-gradient(to right, #888 0%, #888 ${value}%, #ddd ${value}%, #ddd 100%)`;
    }

    updateVolumeIcon() {
        const mutedIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2"/></svg>';
        const volumeIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';
        
        this.volumeBtn.innerHTML = this.audio.muted ? mutedIcon : volumeIcon;
        this.updateVolumeSlider();
    }

    showError() {
        this.container.innerHTML = `
            <div class="blognote-audio-player">
                <div class="blognote-audio-error">
                    <h3>Ошибка загрузки аудио</h3>
                    <p>Не удалось загрузить аудио файл</p>
                </div>
            </div>
        `;
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize all audio players on page
function initBlognoteAudioPlayers() {
    document.querySelectorAll('[data-blognote-audio]').forEach(container => {
        const audioSrc = container.getAttribute('data-blognote-audio');
        const title = container.getAttribute('data-audio-title') || 'Аудио';
        const coverSrc = container.getAttribute('data-audio-cover') || null;
        new BlognoteAudioPlayer(container, audioSrc, title, coverSrc);
    });
}

// Auto-init on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBlognoteAudioPlayers);
} else {
    initBlognoteAudioPlayers();
}

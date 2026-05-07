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
 * Hover Video Preview System
 * Creates hover preview functionality for video cards
 */

const HOVER_DEBUG = false;

/**
 * Add hover preview functionality to a video card
 * @param {HTMLElement} thumbElement - The thumbnail element to add hover to
 * @param {Object} videoData - Video data object containing file and handle
 * @param {Object} options - Configuration options
 */
function addHoverPreview(thumbElement, videoData, options = {}) {
  const config = {
    hoverDelay: 500,
    segmentDuration: 4,
    segmentCount: 8,
    longVideoThreshold: 1800,
    maxBaseOffset: 600,
    borderRadius: '6px',
    estimatedDuration: null,
    seekTimeout: 3000,
    metadataTimeout: 2000,
    enableDanmaku: true,
    ...options
  };

  if (!videoData || !videoData.file || !videoData.handle) {
    return;
  }

  const cardState = {
    hoverTimer: null,
    hoverUrl: null,
    hoverVideo: null,
    segmentTimer: null,
    starts: [],
    segIndex: 0,
    hoverStartTime: null,
    isInitialized: false,
    danmakuIndex: null,
    danmakuStarted: false
  };

  thumbElement.addEventListener('mouseenter', () => {
    if (cardState.hoverTimer) return;
    
    cardState.hoverTimer = setTimeout(() => {
      if (typeof currentHoverCleanup === 'function') currentHoverCleanup();
      
      if (thumbElement.querySelector('video')) {
        return;
      }
      
      hoverPreviewQueue.add(async () => {
        cardState.starts = [];
        cardState.segIndex = 0;
        cardState.isInitialized = false;
        cardState.hoverStartTime = Date.now();
        
        cardState.hoverUrl = URL.createObjectURL(videoData.file);
        cardState.hoverVideo = document.createElement('video');
        cardState.hoverVideo.muted = true;
        cardState.hoverVideo.autoplay = true;
        cardState.hoverVideo.playsInline = true;
        cardState.hoverVideo.preload = 'none';
        cardState.hoverVideo.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:${config.borderRadius};z-index:1;`;
        cardState.hoverVideo.controls = false;
        try { cardState.hoverVideo.disablePictureInPicture = true; } catch (_) {}
        cardState.hoverVideo.setAttribute('disablepictureinpicture', '');
        cardState.hoverVideo.setAttribute('controlsList', 'nodownload noplaybackrate nofullscreen');
        cardState.hoverVideo.src = cardState.hoverUrl;
        thumbElement.appendChild(cardState.hoverVideo);
        
        // Add Archived badge if video has restricted rating
        if (videoData.tags && Array.isArray(videoData.tags)) {
          // Check for rating tags - use getVideoRating if available, otherwise check directly
          let rating = 'safe';
          if (typeof getVideoRating === 'function') {
            rating = getVideoRating(videoData.tags);
          } else {
            // Fallback: check tags directly
            for (const rawTag of videoData.tags) {
              const normalized = String(rawTag).toLowerCase().trim();
              const match = normalized.match(/^(.+?)\s*\(ra\)$/);
              if (!match) continue;
              const value = match[1].trim();
              if (value === 'explicit') {
                rating = 'explicit';
                break;
              }
              if (value === 'questionable' && rating !== 'explicit') {
                rating = 'questionable';
              }
            }
          }
          
          if (rating === 'questionable' || rating === 'explicit') {
            const badge = document.createElement('div');
            badge.className = `video-rating-badge rating-${rating}`;
            badge.textContent = 'Archived';
            badge.style.cssText = 'position:absolute;bottom:5px;left:5px;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:700;color:#fff;z-index:10;';
            thumbElement.appendChild(badge);
          }
        }

        const playNextSegment = () => {
          if (!cardState.hoverVideo || cardState.segmentTimer) return;
          
          if (cardState.segIndex >= cardState.starts.length) {
            const timeSinceStart = Date.now() - cardState.hoverStartTime;
            if (timeSinceStart < 45000) {
              return;
            }
            cardState.segIndex = 0;
          }
          
          const startTime = cardState.starts[cardState.segIndex];
          const isFirstSegment = cardState.segIndex === 0;
          cardState.segIndex++;
          
          try {
            let segmentDelay = config.segmentDuration * 1000;
            if (isFirstSegment && (videoData.duration || cardState.hoverVideo.duration || 0) > config.longVideoThreshold) {
              segmentDelay = Math.min(config.segmentDuration * 2 * 1000, 8000);
            }
            
            const seekTimeout = setTimeout(() => {
              if (HOVER_DEBUG) console.warn('Seek timeout, skipping to next segment');
              if (cardState.segmentTimer) {
                clearTimeout(cardState.segmentTimer);
                cardState.segmentTimer = null;
              }
              cardState.segmentTimer = setTimeout(() => {
                cardState.segmentTimer = null;
                playNextSegment();
              }, 300);
            }, config.seekTimeout);
            
            cardState.hoverVideo.addEventListener('seeked', () => {
              clearTimeout(seekTimeout);
            }, { once: true });
            
            cardState.hoverVideo.currentTime = startTime;
            
            cardState.hoverVideo.play().catch(() => {});
            
            cardState.segmentTimer = setTimeout(() => {
              cardState.segmentTimer = null;
              playNextSegment();
            }, segmentDelay);
            
          } catch (e) {
            if (HOVER_DEBUG) console.warn('Error seeking video:', e);
            if (cardState.segmentTimer) {
              clearTimeout(cardState.segmentTimer);
              cardState.segmentTimer = null;
            }
            cardState.segmentTimer = setTimeout(() => {
              cardState.segmentTimer = null;
              playNextSegment();
            }, 300);
          }
        };

        const quickStart = () => {
          const estimatedDuration = videoData.duration || config.estimatedDuration || null;
          
          if (estimatedDuration && estimatedDuration > config.longVideoThreshold) {
            const quickSegments = calculateQuickSegments(estimatedDuration, config);
            cardState.starts = quickSegments;
            cardState.isInitialized = true;
            
            const startTime = cardState.starts[0] || 0;
            cardState.hoverVideo.currentTime = startTime;
            cardState.hoverVideo.play().then(() => {
              if (cardState.hoverVideo && !cardState.segmentTimer) {
                playNextSegment();
              }
            }).catch(() => {
              cardState.hoverVideo.addEventListener('loadedmetadata', onMeta, { once: true });
            });
            return true;
          }
          return false;
        };

        const onMeta = () => {
          if (cardState.isInitialized || cardState.segmentTimer) {
            return;
          }
          
          cardState.isInitialized = true;
          
          const d = cardState.hoverVideo.duration;
          if (!isFinite(d) || d <= 0) {
            return;
          }
          
          const segments = calculateVideoSegments(d, config);
          cardState.starts = segments;
          
          if (cardState.hoverVideo && !cardState.segmentTimer) {
            playNextSegment();
          }
          
          if (config.enableDanmaku && !cardState.danmakuStarted) {
            startHoverDanmaku();
          }
        };

        const startHoverDanmaku = async () => {
          if (!config.enableDanmaku || cardState.danmakuStarted) return;
          if (!window.hoverDanmakuRenderer) return;
          
          cardState.danmakuStarted = true;
          
          const playlistHandle = videoData.dirHandle || videoData._playlistHandle;
          if (!playlistHandle || !videoData.name) return;
          
          try {
            cardState.danmakuIndex = await window.hoverDanmakuRenderer.loadDanmakuForVideo(
              videoData.name,
              playlistHandle
            );
            
            if (cardState.danmakuIndex && cardState.danmakuIndex.count > 0 && cardState.hoverVideo) {
              window.hoverDanmakuRenderer.startRendering(cardState.hoverVideo, cardState.danmakuIndex);
            }
          } catch (e) {
            if (HOVER_DEBUG) console.warn('Error loading hover danmaku:', e);
          }
        };

        if (!quickStart()) {
          const metaTimeout = setTimeout(() => {
            if (HOVER_DEBUG) console.warn('Metadata loading timeout, starting with estimated segments');
            if (!cardState.isInitialized) {
              cardState.starts = [5, 30, 90, 180, 300, 480, 720, 1020];
              cardState.isInitialized = true;
              if (cardState.hoverVideo && !cardState.segmentTimer) {
                playNextSegment();
              }
              if (config.enableDanmaku && !cardState.danmakuStarted) {
                startHoverDanmaku();
              }
            }
          }, config.metadataTimeout);

          cardState.hoverVideo.addEventListener('loadedmetadata', () => {
            clearTimeout(metaTimeout);
            onMeta();
          }, { once: true });
          
          cardState.hoverVideo.addEventListener('error', () => {
            clearTimeout(metaTimeout);
            onError();
          }, { once: true });
        } else {
          if (config.enableDanmaku && !cardState.danmakuStarted) {
            startHoverDanmaku();
          }
        }

        const onError = (e) => {
          if (HOVER_DEBUG) console.warn('Hover video error:', e);
          cleanup();
        };
        
        const cleanup = () => {
          if (cardState.hoverTimer) { 
            clearTimeout(cardState.hoverTimer); 
            cardState.hoverTimer = null; 
          }
          if (cardState.segmentTimer) { 
            clearTimeout(cardState.segmentTimer); 
            cardState.segmentTimer = null; 
          }
          
          if (cardState.hoverVideo && window.hoverDanmakuRenderer) {
            window.hoverDanmakuRenderer.stopRendering(cardState.hoverVideo);
          }
          
          cardState.starts = [];
          cardState.segIndex = 0;
          cardState.hoverStartTime = null;
          cardState.isInitialized = false;
          cardState.danmakuIndex = null;
          cardState.danmakuStarted = false;
          
          if (cardState.hoverVideo) {
            try { 
              cardState.hoverVideo.pause(); 
              cardState.hoverVideo.removeEventListener('loadedmetadata', onMeta);
              cardState.hoverVideo.removeEventListener('error', onError);
            } catch (_) {}
            cardState.hoverVideo.src = '';
            cardState.hoverVideo.remove();
            cardState.hoverVideo = null;
          }
          if (cardState.hoverUrl) { 
            URL.revokeObjectURL(cardState.hoverUrl); 
            cardState.hoverUrl = null; 
          }
          if (currentHoverCleanup === cleanup) currentHoverCleanup = null;
        };
        
        currentHoverCleanup = cleanup;
      }, 10, thumbElement);
    }, config.hoverDelay);
  });

  thumbElement.addEventListener('mouseleave', () => {
    if (typeof currentHoverCleanup === 'function') {
      currentHoverCleanup();
    }
    hoverPreviewQueue.clear();
    
    if (cardState.hoverTimer) {
      clearTimeout(cardState.hoverTimer);
      cardState.hoverTimer = null;
    }
    if (cardState.segmentTimer) {
      clearTimeout(cardState.segmentTimer);
      cardState.segmentTimer = null;
    }
  });
}

/**
 * Calculate video segments for preview
 * @param {number} duration - Video duration in seconds
 * @param {Object} config - Configuration options
 * @returns {Array} Array of segment start times
 */
function calculateVideoSegments(duration, config) {
  const segments = [];
  
  let baseOffset = 0;
  if (duration > config.longVideoThreshold) {
    baseOffset = Math.min(duration * 0.15, config.maxBaseOffset);
  }
  
  const availableDuration = duration - baseOffset - config.segmentDuration;
  
  if (availableDuration > 0) {
    const step = availableDuration / config.segmentCount;
    for (let i = 0; i < config.segmentCount; i++) {
      const start = baseOffset + (i * step);
      if (start + config.segmentDuration <= duration) {
        segments.push(start);
      }
    }
  }
  
  if (segments.length === 0) {
    for (let i = 0; i < config.segmentCount; i++) {
      segments.push(baseOffset + (i * 60));
    }
  }
  
  return segments;
}

/**
 * Calculate quick segments for estimated duration (faster for long videos)
 * @param {number} estimatedDuration - Estimated video duration
 * @param {Object} config - Configuration options
 * @returns {Array} Array of segment start times
 */
function calculateQuickSegments(estimatedDuration, config) {
  const segments = [];
  
  const step = Math.floor(estimatedDuration / (config.segmentCount + 2));
  const baseOffset = Math.min(step, 60);
  
  for (let i = 0; i < config.segmentCount; i++) {
    const start = baseOffset + (i * step);
    if (start < estimatedDuration - 30) {
      segments.push(start);
    }
  }
  
  if (segments.length === 0) {
    segments.push(10, 60, 120, 240);
  }
  
  return segments;
}

/**
 * Clear all active hover previews
 */
function clearAllHoverPreviews() {
  if (typeof currentHoverCleanup === 'function') {
    try { 
      currentHoverCleanup(); 
    } catch (_) {} 
    currentHoverCleanup = null;
  }
  hoverPreviewQueue.clear();
}

/**
 * Add hover preview to multiple video cards
 * @param {NodeList|Array} videoCards - Collection of video card elements
 * @param {Array} videoDataArray - Array of video data objects
 * @param {Object} options - Configuration options
 */
function addHoverPreviewToCards(videoCards, videoDataArray, options = {}) {
  videoCards.forEach((card, index) => {
    const thumbElement = card.querySelector('.video-thumbnail, a.video-thumbnail');
    const videoData = videoDataArray[index];
    
    if (thumbElement && videoData) {
      addHoverPreview(thumbElement, videoData, options);
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    addHoverPreview,
    calculateVideoSegments,
    calculateQuickSegments,
    clearAllHoverPreviews,
    addHoverPreviewToCards
  };
} else {
  window.addHoverPreview = addHoverPreview;
  window.calculateVideoSegments = calculateVideoSegments;
  window.calculateQuickSegments = calculateQuickSegments;
  window.clearAllHoverPreviews = clearAllHoverPreviews;
  window.addHoverPreviewToCards = addHoverPreviewToCards;
}

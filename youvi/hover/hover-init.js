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
 * Hover Preview Initialization Utilities
 * Helper functions to initialize hover previews on different video layouts
 */

const HOVER_INIT_DEBUG = false;

/**
 * Initialize hover previews for carousel videos
 * @param {string} carouselId - ID of the carousel container
 * @param {Array} videosData - Array of video data objects
 * @param {Object} options - Configuration options
 */
function initCarouselHoverPreviews(carouselId, videosData, options = {}) {
  const carousel = document.getElementById(carouselId);
  if (!carousel) return;
  
  const videoCards = carousel.querySelectorAll('.video-card');
  
  videoCards.forEach((card, index) => {
    const thumbElement = card.querySelector('a.video-thumbnail');
    const videoData = videosData[index];
    
    if (thumbElement && videoData && videoData.file && videoData.handle) {
      addHoverPreview(thumbElement, videoData, {
        borderRadius: '6px',
        ...options
      });
    }
  });
}

/**
 * Initialize hover previews for grid videos
 * @param {string} gridId - ID of the grid container
 * @param {Array} videosData - Array of video data objects
 * @param {Object} options - Configuration options
 */
function initGridHoverPreviews(gridId, videosData, options = {}) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  
  const videoCards = grid.querySelectorAll('.video-card');
  
  videoCards.forEach((card, index) => {
    const thumbElement = card.querySelector('a.video-thumbnail');
    const videoData = videosData[index];
    
    if (thumbElement && videoData && videoData.file && videoData.handle) {
      addHoverPreview(thumbElement, videoData, {
        borderRadius: '6px',
        ...options
      });
    }
  });
}

/**
 * Initialize hover previews for search results
 * @param {string} containerId - ID of the search results container
 * @param {Array} videosData - Array of video data objects
 * @param {Object} options - Configuration options
 */
function initSearchHoverPreviews(containerId, videosData, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const videoCards = container.querySelectorAll('.video-card');
  
  videoCards.forEach((card, index) => {
    const thumbElement = card.querySelector('a.video-thumbnail, .video-thumbnail');
    const videoData = videosData[index];
    
    if (thumbElement && videoData && videoData.file && videoData.handle) {
      addHoverPreview(thumbElement, videoData, options);
    }
  });
}

/**
 * Auto-detect and initialize hover previews for all video cards in a container
 * @param {string|HTMLElement} container - Container element or its ID
 * @param {Array} videosData - Array of video data objects (optional, will try to extract from data attributes)
 * @param {Object} options - Configuration options
 */
function autoInitHoverPreviews(container, videosData = null, options = {}) {
  const containerElement = typeof container === 'string' 
    ? document.getElementById(container) 
    : container;
    
  if (!containerElement) return;
  
  const videoCards = containerElement.querySelectorAll('.video-card');
  
  videoCards.forEach((card, index) => {
    const thumbElement = card.querySelector('a.video-thumbnail, .video-thumbnail');
    if (!thumbElement) return;
    
    let videoData = null;
    
    if (videosData && videosData[index]) {
      videoData = videosData[index];
    } else {
      const videoName = thumbElement.getAttribute('data-video-name');
      const videoFile = thumbElement.getAttribute('data-video-file');
      if (videoName && videoFile) {
        videoData = {
          name: videoName,
          file: videoFile,
          handle: null
        };
      }
    }
    
    if (videoData && videoData.file && videoData.handle) {
      addHoverPreview(thumbElement, videoData, options);
    }
  });
}

/**
 * Initialize hover previews with cleanup on render
 * Clears existing previews before adding new ones
 * @param {Function} initFunction - Function to call for initialization
 * @param {...any} args - Arguments to pass to the init function
 */
function initHoverWithCleanup(initFunction, ...args) {
  clearAllHoverPreviews();
  initFunction(...args);
}

/**
 * Batch initialize hover previews for multiple containers
 * @param {Array} containers - Array of container configurations
 * @param {Object} globalOptions - Global configuration options
 */
function batchInitHoverPreviews(containers, globalOptions = {}) {
  clearAllHoverPreviews();
  
  containers.forEach(config => {
    const { type, containerId, videosData, options = {} } = config;
    const mergedOptions = { ...globalOptions, ...options };
    
    switch (type) {
      case 'carousel':
        initCarouselHoverPreviews(containerId, videosData, mergedOptions);
        break;
      case 'grid':
        initGridHoverPreviews(containerId, videosData, mergedOptions);
        break;
      case 'search':
        initSearchHoverPreviews(containerId, videosData, mergedOptions);
        break;
      case 'auto':
        autoInitHoverPreviews(containerId, videosData, mergedOptions);
        break;
      default:
        if (HOVER_INIT_DEBUG) console.warn('Unknown hover preview type:', type);
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initCarouselHoverPreviews,
    initGridHoverPreviews,
    initSearchHoverPreviews,
    autoInitHoverPreviews,
    initHoverWithCleanup,
    batchInitHoverPreviews
  };
} else {
  window.initCarouselHoverPreviews = initCarouselHoverPreviews;
  window.initGridHoverPreviews = initGridHoverPreviews;
  window.initSearchHoverPreviews = initSearchHoverPreviews;
  window.autoInitHoverPreviews = autoInitHoverPreviews;
  window.initHoverWithCleanup = initHoverWithCleanup;
  window.batchInitHoverPreviews = batchInitHoverPreviews;
}
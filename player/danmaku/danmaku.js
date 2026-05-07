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

// Danmaku variables
let danmakuData = [];
let danmakuEnabled = true;


function getDanmakuContext() {
  if (window.documentPiPManager && window.documentPiPManager.pipWindow) {
    return window.documentPiPManager.pipWindow.document;
  }
  return document;
}

function getDanmakuElement(id) {

  if (window.documentPiPManager && window.documentPiPManager.pipWindow) {
    const el = window.documentPiPManager.pipWindow.document.getElementById(id);
    if (el) return el;
  }

  return document.getElementById(id);
}

function getDanmakuContainer(selector) {

  if (window.documentPiPManager && window.documentPiPManager.pipWindow) {
    const el = window.documentPiPManager.pipWindow.document.querySelector(selector);
    if (el) return el;
  }
  return document.querySelector(selector);
}

let danmakuVisible = true;
let activeDanmaku = [];
let activeDanmakuIds = new Set(); // Fast lookup for duplicates
let danmakuFormCollapsed = false;
let saveTimeout = null;
let mutationObserver = null;
let resizeObserver = null;
let videoListenersAttached = false;
let danmakuCursor = 0;
let densityGraphObserver = null;

function binarySearchDanmaku(time) {
  let l = 0, r = danmakuData.length - 1;
  while (l <= r) {
    let m = Math.floor((l + r) / 2);
    if (danmakuData[m].time < time) l = m + 1;
    else r = m - 1;
  }
  return l;
}

let danmakuTracks = {
  scroll: [],
  top: [],
  bottom: []
};

const BASE_TRACK_HEIGHT = 26; 
const DANMAKU_DURATION_S = 7; 
const SAVE_DEBOUNCE_MS = 500;

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

// Canvas renderer state
let danmakuCanvas = null;
let danmakuCtx = null;
let canvasAnimationId = null;
let lastCanvasRenderTime = 0;

function getDanmakuFontSize(scale, size) {
  const isFullscreen = document.fullscreenElement || document.querySelector('.video-container.fullscreen');
  const isCinema = document.body.classList.contains('cinema-mode');

  if (isFullscreen) {
    if (size === 'small') return 32;
    if (size === 'big') return 48;
    return 40;
  }

  if (isCinema) {
    if (size === 'small') return 32;
    if (size === 'big') return 52;
    return 40;
  }

  let baseSize = 25;
  if (size === 'small') baseSize = 18;
  if (size === 'big') baseSize = 36;
  
  if (!size) {
      baseSize = 24; 
  }

  return baseSize * scale;
}

// Fast width estimation for layout (avoids expensive measureText)
function estimateDanmakuWidth(text, scale, size) {
  if (!text) return 0;
  const fontSize = getDanmakuFontSize(scale, size);
  // Average char width ~0.6 of font size, CJK chars ~1.0
  // Use conservative estimate to avoid collisions
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK ranges: common Chinese/Japanese/Korean characters
    if (code > 0x2E80) {
      width += fontSize * 1.0;
    } else {
      width += fontSize * 0.6;
    }
  }
  return width + (50 * scale);
}

// Precise width measurement (used only for rendering)
function getDanmakuWidth(text, scale, size) {
  if (!text) return 0;
  
  const fontSize = getDanmakuFontSize(scale, size);
  
  measureCtx.font = `bold ${fontSize}px "Segoe UI", "Microsoft YaHei", "SimHei", sans-serif`;
  return measureCtx.measureText(text).width + (50 * scale); 
}

let currentScale = 1;
let currentTrackHeight = BASE_TRACK_HEIGHT;

function getPlaybackRate() {
  const videoEl = getDanmakuElement('video');
  return videoEl ? (videoEl.playbackRate || 1) : 1;
}

function updateDanmakuScale() {
  let container = getDanmakuContainer('.video-container');

  const miniPlayerInner = document.querySelector('.mini-player-inner');
  const overlay = getDanmakuElement('danmakuOverlay');

  if (overlay && miniPlayerInner && miniPlayerInner.contains(overlay)) {
    container = miniPlayerInner;
  }

  if (!container) return;

  const height = container.clientHeight;
  const isFullscreen = document.fullscreenElement || document.querySelector('.video-container.fullscreen');
  const isCinema = document.body.classList.contains('cinema-mode');
  
  currentScale = Math.max(0.7, Math.min(height / 500, 2.5));
  
  // In fullscreen/cinema, use fixed track height matching font size
  if (isFullscreen || isCinema) {
    currentTrackHeight = 44; // Slightly larger than 40px font
  } else {
    currentTrackHeight = BASE_TRACK_HEIGHT * currentScale;
  }

  const overlays = getDanmakuOverlays();
  overlays.forEach(overlay => {
    overlay.style.setProperty('--danmaku-scale', currentScale);

    if (currentScale < 0.6) {
      overlay.classList.add('small-scale');
    } else {
      overlay.classList.remove('small-scale');
    }
  });
}

function getAvailableTrack(position, videoHeight, item, overrideWidth) {
  if (position === 'scroll' && item && item._trackIndex !== undefined && item._trackReserved) {
    return item._trackIndex;
  }

  const tracks = danmakuTracks[position];
  const video = getDanmakuElement('video');
  const currentTime = video ? video.currentTime : 0;

  const effectiveHeight = (!videoHeight || videoHeight < 100) ? 500 : videoHeight;
  const maxVisibleTracks = Math.floor((effectiveHeight - 4) / currentTrackHeight);
  const limit = Math.max(1, Math.min(maxVisibleTracks, 60));

  if (position === 'top' || position === 'bottom') {
    const STATIC_DURATION = 4;

    for (let i = 0; i < limit; i++) {
      const track = tracks[i];
      if (!track || currentTime >= track.endTime) {
        tracks[i] = { endTime: currentTime + STATIC_DURATION, itemId: item.id };
        item._trackIndex = i;
        return i;
      }
    }

    let bestIdx = 0;
    let bestEnd = tracks[0] ? tracks[0].endTime : Infinity;
    for (let i = 1; i < limit; i++) {
      if (tracks[i] && tracks[i].endTime < bestEnd) {
        bestEnd = tracks[i].endTime;
        bestIdx = i;
      }
    }
    tracks[bestIdx] = { endTime: currentTime + STATIC_DURATION, itemId: item.id };
    item._trackIndex = bestIdx;
    return bestIdx;
  }

  const overlay = getDanmakuElement('danmakuOverlay');
  const containerWidth = overrideWidth || (overlay ? overlay.clientWidth : 800);

  const w2 = item._cachedWidth || item._estimatedWidth || estimateDanmakuWidth(item.text, currentScale, item.size);
  const v2 = (containerWidth + w2) / DANMAKU_DURATION_S;

  for (let i = 0; i < limit; i++) {
    const track = tracks[i];

    if (!track) {
      tracks[i] = {
        lastEndTime: currentTime + DANMAKU_DURATION_S,
        lastWidth: w2,
        lastSpeed: v2,
        lastStartTime: currentTime,
        itemId: item.id,
        burstCount: 1
      };
      if (item) {
        item._trackIndex = i;
        item._trackReserved = true;
      }
      return i;
    }

    const t1 = track.lastStartTime;
    const w1 = track.lastWidth;
    const v1 = track.lastSpeed;
    const t2 = currentTime;

    if (t2 > t1 + DANMAKU_DURATION_S) {
      tracks[i] = {
        lastEndTime: currentTime + DANMAKU_DURATION_S,
        lastWidth: w2,
        lastSpeed: v2,
        lastStartTime: currentTime,
        itemId: item.id,
        burstCount: 1
      };
      if (item) {
        item._trackIndex = i;
        item._trackReserved = true;
      }
      return i;
    }

    const margin = 20 * currentScale;
    const startClear = v1 * (t2 - t1) > w1 + margin;

    if (!startClear) continue;

    let endClear = true;
    if (v2 > v1) {
      const t_critical = t2 + containerWidth / v2;
      const dist1_at_critical = v1 * (t_critical - t1) - w1;
      if (dist1_at_critical < containerWidth + margin) {
        endClear = false;
      }
    }

    if (startClear && endClear) {
      tracks[i] = {
        lastEndTime: currentTime + DANMAKU_DURATION_S,
        lastWidth: w2,
        lastSpeed: v2,
        lastStartTime: currentTime,
        itemId: item.id,
        burstCount: 1
      };
      if (item) {
        item._trackIndex = i;
        item._trackReserved = true;
      }
      return i;
    }
  }

  return -1;
}


function releaseTrack(position, trackIndex, itemId) {
}




async function loadDanmaku() {
  if (!window.currentPlaylistHandle || !window.currentVideoName) return [];
  const metaDir = await window.currentPlaylistHandle.getDirectoryHandle('.metadata', { create: true });
  const fileName = window.currentVideoName + '.danmaku.json';
  const data = await window.readJSONFile(metaDir, fileName, []);

  data.sort((a, b) => a.time - b.time);

  // Restore _trackIndex from staticTrackIndex for items that have it
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item.staticTrackIndex !== undefined) {
      item._trackIndex = item.staticTrackIndex;
    }
  }

  // Check if staticTrackIndex needs to be calculated for any items
  let needsLayout = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i].staticTrackIndex === undefined) {
      needsLayout = true;
      break;
    }
  }

  if (needsLayout && data.length > 0) {
    // Calculate staticTrackIndex in background (chunked to avoid blocking)
    setTimeout(() => calculateStaticTrackIndices(data), 100);
  }

  // Defer density graph rendering to not block load
  requestAnimationFrame(() => renderDensityGraph(data));

  return data;
}

// Calculate staticTrackIndex for all items in chunks to avoid blocking UI
function calculateStaticTrackIndices(data) {
  const overlay = getDanmakuElement('danmakuOverlay');
  const containerWidth = overlay ? overlay.clientWidth : 800;
  const containerHeight = overlay ? overlay.clientHeight : 500;
  
  const effectiveHeight = (!containerHeight || containerHeight < 100) ? 500 : containerHeight;
  const scale = Math.max(0.5, Math.min(effectiveHeight / 500, 2.5));
  const trackHeight = BASE_TRACK_HEIGHT * scale;
  const maxVisibleTracks = Math.floor((effectiveHeight - 4) / trackHeight);
  const limit = Math.max(1, Math.min(maxVisibleTracks, 60));
  
  const simTracks = { scroll: [], top: [], bottom: [] };
  const CHUNK_SIZE = 1000;
  let index = 0;
  
  function processChunk() {
    const end = Math.min(index + CHUNK_SIZE, data.length);
    
    for (let i = index; i < end; i++) {
      if (data[i].staticTrackIndex === undefined) {
        layoutSingleDanmaku(data[i], simTracks, containerWidth, scale, limit);
        // Also set _trackIndex for immediate use
        if (data[i].staticTrackIndex !== undefined) {
          data[i]._trackIndex = data[i].staticTrackIndex;
        }
      }
    }
    
    index = end;
    
    if (index < data.length) {
      // Process next chunk
      setTimeout(processChunk, 0);
    } else {
      console.log('Static track indices calculated for', data.length, 'danmaku');
    }
  }
  
  processChunk();
}

// Sync layout for resize and new danmaku
// For large datasets, only layout items near current time
function layoutDanmaku(data, currentTime = 0, windowSize = 120) {
  const simTracks = { scroll: [], top: [], bottom: [] };
  
  const overlay = getDanmakuElement('danmakuOverlay');
  let containerWidth = overlay ? overlay.clientWidth : 800;
  let containerHeight = overlay ? overlay.clientHeight : 500;
  
  const effectiveHeight = (!containerHeight || containerHeight < 100) ? 500 : containerHeight;
  const scale = Math.max(0.5, Math.min(effectiveHeight / 500, 2.5));
  const trackHeight = BASE_TRACK_HEIGHT * scale;
  const maxVisibleTracks = Math.floor((effectiveHeight - 4) / trackHeight);
  const limit = Math.max(1, Math.min(maxVisibleTracks, 60));

  // For small datasets, layout all
  if (data.length <= 1000) {
    for (let i = 0; i < data.length; i++) {
      layoutSingleDanmaku(data[i], simTracks, containerWidth, scale, limit);
    }
    return;
  }

  // For large datasets, only layout items within time window
  const startTime = Math.max(0, currentTime - DANMAKU_DURATION_S);
  const endTime = currentTime + windowSize;
  
  // Use binary search to find start index
  const startIdx = binarySearchDanmaku(startTime);
  
  for (let i = startIdx; i < data.length; i++) {
    const item = data[i];
    if (item.time > endTime) break;
    layoutSingleDanmaku(item, simTracks, containerWidth, scale, limit);
  }
}

function layoutSingleDanmaku(item, simTracks, containerWidth, scale, limit) {
  delete item.shouldSkip;
  const position = item.position || 'scroll';
  if (!simTracks[position]) simTracks[position] = [];
  const tracks = simTracks[position];

  if (position === 'top' || position === 'bottom') {
    const STATIC_DURATION = 4.0; 
    const tEnd = item.time + STATIC_DURATION;
    let found = false;

    for (let i = 0; i < limit; i++) {
      const track = tracks[i];
      if (!track || item.time >= track.endTime) {
        tracks[i] = { endTime: tEnd, itemId: item.id };
        item.staticTrackIndex = i;
        found = true;
        break;
      }
    }

    if (!found) {
      let bestIdx = 0;
      let bestEnd = tracks[0] ? tracks[0].endTime : Infinity;
      for (let i = 1; i < limit; i++) {
        if (tracks[i] && tracks[i].endTime < bestEnd) {
          bestEnd = tracks[i].endTime;
          bestIdx = i;
        }
      }
      tracks[bestIdx] = { endTime: tEnd, itemId: item.id };
      item.staticTrackIndex = bestIdx;
    }
    return;
  }

  const w2 = estimateDanmakuWidth(item.text, scale, item.size);
  item._estimatedWidth = w2; // Store estimate, real width calculated at render time
  const v2 = (containerWidth + w2) / DANMAKU_DURATION_S;
  const t2 = item.time;

  let found = false;

  for (let i = 0; i < limit; i++) {
    const track = tracks[i];
    if (!track) {
      tracks[i] = { lastEndTime: t2 + DANMAKU_DURATION_S, lastWidth: w2, lastSpeed: v2, lastStartTime: t2, stackCount: 1 };
      item.staticTrackIndex = i;
      found = true;
      break;
    }

    const t1 = track.lastStartTime;
    const w1 = track.lastWidth;
    const v1 = track.lastSpeed;

    if (t2 > t1 + DANMAKU_DURATION_S) {
      tracks[i] = { lastEndTime: t2 + DANMAKU_DURATION_S, lastWidth: w2, lastSpeed: v2, lastStartTime: t2, stackCount: 1 };
      item.staticTrackIndex = i;
      found = true;
      break;
    }

    const margin = 20 * scale;
    const startClear = v1 * (t2 - t1) > w1 + margin;

    if (!startClear) continue;

    let endClear = true;
    if (v2 > v1) {
      const t_critical = t2 + containerWidth / v2;
      const dist1_at_critical = v1 * (t_critical - t1) - w1;
      if (dist1_at_critical < containerWidth + margin) {
        endClear = false;
      }
    }

    if (startClear && endClear) {
      tracks[i] = { lastEndTime: t2 + DANMAKU_DURATION_S, lastWidth: w2, lastSpeed: v2, lastStartTime: t2, stackCount: 1 };
      item.staticTrackIndex = i;
      found = true;
      break;
    }
  }

  if (!found) {
    item.shouldSkip = true;
  }
}


async function saveDanmaku() {
  if (!window.currentPlaylistHandle || !window.currentVideoName) {
    console.warn('Cannot save danmaku: missing playlist handle or video name');
    return;
  }

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    try {
      const metaDir = await window.currentPlaylistHandle.getDirectoryHandle('.metadata', { create: true });
      const fileName = window.currentVideoName + '.danmaku.json';

      const dataToSave = danmakuData.map(item => ({
        id: item.id,
        text: item.text,
        time: item.time,
        color: item.color,
        size: item.size,
        position: item.position,
        created: item.created
      }));

      await window.writeJSONFile(metaDir, fileName, dataToSave);
      console.log('Danmaku saved successfully:', dataToSave.length, 'items');

      // Update danmakuCount in meta (separate try-catch to not break main save)
      try {
        const metaFileName = window.currentVideoName + '.meta.json';
        let existingMeta = {};
        try {
          const metaHandle = await metaDir.getFileHandle(metaFileName);
          const metaFile = await metaHandle.getFile();
          existingMeta = JSON.parse(await metaFile.text());
        } catch (e) { /* no existing meta */ }
        existingMeta.danmakuCount = dataToSave.length;
        await window.writeJSONFile(metaDir, metaFileName, existingMeta);
      } catch (e) { /* ignore meta errors */ }

      if (typeof renderDensityGraph === 'function') {
        renderDensityGraph(dataToSave);
      }

      if (typeof window.refreshDanmakuComments === 'function') {
        const commentsList = document.getElementById('danmakuCommentsList');
        if (commentsList && commentsList.children.length !== dataToSave.length) {
          window.refreshDanmakuComments();
        }
      }
    } catch (error) {
      console.error('Error saving danmaku:', error);
    }
  }, SAVE_DEBOUNCE_MS);
}

// Canvas-based danmaku rendering
let lastOverlayParent = null;

function ensureDanmakuCanvas() {
  // Find the active overlay - could be in main player or miniplayer
  let overlay = getDanmakuElement('danmakuOverlay');
  if (!overlay) return null;

  // Check if overlay is visible (has dimensions)
  let rect = overlay.getBoundingClientRect();
  
  // If overlay has no size, it might be hidden or in wrong container
  if (rect.width === 0 || rect.height === 0) {
    // Try to find overlay in miniplayer
    const miniPlayerInner = document.querySelector('.mini-player-inner');
    if (miniPlayerInner) {
      const miniOverlay = miniPlayerInner.querySelector('#danmakuOverlay, .danmaku-overlay');
      if (miniOverlay) {
        overlay = miniOverlay;
        rect = overlay.getBoundingClientRect();
      }
    }
  }
  
  if (rect.width === 0 || rect.height === 0) return null;

  // Check if overlay moved to different parent (miniplayer transition)
  const currentParent = overlay.parentElement;
  if (lastOverlayParent && lastOverlayParent !== currentParent) {
    // Parent changed - remove old canvas, will create new one
    const oldCanvas = overlay.querySelector('canvas.danmaku-canvas');
    if (oldCanvas) oldCanvas.remove();
    danmakuCanvas = null;
    danmakuCtx = null;
  }
  lastOverlayParent = currentParent;

  let canvas = overlay.querySelector('canvas.danmaku-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'danmaku-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    overlay.appendChild(canvas);
  }

  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.floor(rect.width * dpr);
  const targetHeight = Math.floor(rect.height * dpr);
  
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  danmakuCanvas = canvas;
  danmakuCtx = canvas.getContext('2d');
  if (!danmakuCtx) return null;
  
  danmakuCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  return { canvas, ctx: danmakuCtx, width: rect.width, height: rect.height };
}

function addActiveDanmaku(item, canvasWidth, canvasHeight) {
  if (!danmakuVisible || item.shouldSkip) return;
  if (activeDanmakuIds.has(item.id)) return; // O(1) lookup

  const duration = item.position === 'scroll' ? DANMAKU_DURATION_S : 3.5;
  
  // Use cached width if available, otherwise estimate
  const textWidth = item._cachedWidth || item._estimatedWidth || estimateDanmakuWidth(item.text, currentScale, item.size);

  let trackIndex = item.staticTrackIndex;
  if (trackIndex === undefined) {
    trackIndex = item._trackIndex;
  }
  if (trackIndex === undefined) {
    trackIndex = getAvailableTrack(item.position, canvasHeight, item, canvasWidth);
  }
  if (trackIndex === -1) return;
  
  item._trackIndex = trackIndex;

  // Minimal object - no _item reference to avoid memory retention
  activeDanmaku.push({
    id: item.id,
    text: item.text,
    color: item.color,
    size: item.size,
    position: item.position,
    startTime: item.time,
    expiry: item.time + duration,
    trackIndex: trackIndex,
    textWidth: textWidth
  });
  activeDanmakuIds.add(item.id);
}

function renderDanmakuCanvas() {
  const setup = ensureDanmakuCanvas();
  if (!setup) return;
  
  const { ctx, width, height } = setup;
  
  // Safety check - context might be lost
  try {
    ctx.clearRect(0, 0, width, height);
  } catch (e) {
    // Canvas context lost, reset and retry next frame
    danmakuCanvas = null;
    danmakuCtx = null;
    return;
  }

  if (!danmakuVisible || activeDanmaku.length === 0) return;

  const videoEl = getDanmakuElement('video');
  const currentTime = videoEl ? videoEl.currentTime : 0;
  const isFullscreen = document.fullscreenElement || document.querySelector('.video-container.fullscreen');
  const isCinema = document.body.classList.contains('cinema-mode');

  // Separate danmaku by type for layered rendering, filter expired
  const scrollDanmaku = [];
  const staticDanmaku = []; // top and bottom
  const keepDanmaku = [];
  
  for (let i = 0; i < activeDanmaku.length; i++) {
    const d = activeDanmaku[i];
    
    if (currentTime > d.expiry + 0.5) {
      // Mark for removal
      activeDanmakuIds.delete(d.id);
      continue;
    }

    keepDanmaku.push(d);
    
    if (d.position === 'scroll') {
      scrollDanmaku.push(d);
    } else {
      staticDanmaku.push(d);
    }
  }

  // Replace array only if items were removed (avoid allocation if nothing changed)
  if (keepDanmaku.length !== activeDanmaku.length) {
    activeDanmaku = keepDanmaku;
  }

  // Render scroll danmaku first (bottom layer)
  for (let i = 0; i < scrollDanmaku.length; i++) {
    renderSingleDanmaku(ctx, scrollDanmaku[i], width, height, currentTime, isFullscreen, isCinema);
  }

  // Render top/bottom danmaku last (top layer)
  for (let i = 0; i < staticDanmaku.length; i++) {
    renderSingleDanmaku(ctx, staticDanmaku[i], width, height, currentTime, isFullscreen, isCinema);
  }
}

function renderSingleDanmaku(ctx, d, width, height, currentTime, isFullscreen, isCinema) {
  // Calculate font size
  let fontSize;
  if (isFullscreen) {
    fontSize = d.size === 'small' ? 32 : d.size === 'big' ? 48 : 40;
  } else if (isCinema) {
    fontSize = d.size === 'small' ? 32 : d.size === 'big' ? 52 : 40;
  } else {
    const baseSize = d.size === 'small' ? 18 : d.size === 'big' ? 36 : 25;
    fontSize = baseSize * currentScale;
  }

  ctx.font = `bold ${fontSize}px "Segoe UI", "Microsoft YaHei", "SimHei", sans-serif`;
  ctx.textBaseline = 'top';

  let x, y;

  if (d.position === 'scroll') {
    const elapsed = Math.max(0, currentTime - d.startTime);
    const speed = (width + d.textWidth) / DANMAKU_DURATION_S;
    x = width - elapsed * speed;
    y = d.trackIndex * currentTrackHeight;
  } else if (d.position === 'top') {
    const textW = ctx.measureText(d.text).width;
    x = (width - textW) / 2;
    y = (isFullscreen ? 20 : 10) + d.trackIndex * currentTrackHeight;
  } else if (d.position === 'bottom') {
    const textW = ctx.measureText(d.text).width;
    x = (width - textW) / 2;
    const bottomBase = isFullscreen ? 80 : 50;
    y = height - bottomBase - (d.trackIndex + 1) * currentTrackHeight;
  }

  // Draw text shadow/stroke
  ctx.strokeStyle = '#000';
  ctx.lineWidth = currentScale < 0.6 ? 1 : 2;
  ctx.lineJoin = 'round';
  ctx.strokeText(d.text, x, y);

  // Draw text fill
  ctx.fillStyle = d.color;
  ctx.fillText(d.text, x, y);
}

function startCanvasRenderLoop() {
  if (canvasAnimationId) return;
  
  function loop(timestamp) {
    // Throttle to ~60fps
    if (timestamp - lastCanvasRenderTime >= 16) {
      lastCanvasRenderTime = timestamp;
      
      if (danmakuVisible && activeDanmaku.length > 0) {
        renderDanmakuCanvas();
      }
    }
    
    canvasAnimationId = requestAnimationFrame(loop);
  }
  
  canvasAnimationId = requestAnimationFrame(loop);
}

function stopCanvasRenderLoop() {
  if (canvasAnimationId) {
    cancelAnimationFrame(canvasAnimationId);
    canvasAnimationId = null;
  }
}

// Legacy function kept for compatibility - now adds to canvas render list
function createDanmakuElement(item, precalcRect) {
  if (!danmakuVisible) return;
  if (item.shouldSkip) return;

  const overlay = getDanmakuElement('fullscreen-danmaku-overlay') || getDanmakuElement('danmakuOverlay');
  if (!overlay) return;

  const rect = precalcRect || overlay.getBoundingClientRect();
  addActiveDanmaku(item, rect.width, rect.height);
}



function updateDanmakuVisibility(currentTime) {
  const videoEl = getDanmakuElement('video');
  if (!videoEl) return;

  if (!danmakuVisible) {
    return;
  }

  const overlay = getDanmakuElement('fullscreen-danmaku-overlay') || getDanmakuElement('danmakuOverlay');
  if (!overlay) return;

  const videoRect = overlay.getBoundingClientRect();

  let processedCount = 0;
  const SAFETY_LIMIT = 200;

  while (danmakuCursor < danmakuData.length) {
    if (processedCount++ > SAFETY_LIMIT) {
      console.warn('Danmaku processing limit reached');
      break;
    }
    const item = danmakuData[danmakuCursor];

    if (item.time > currentTime + 0.1) {
      break;
    }

    const duration = item.position === 'scroll' ? DANMAKU_DURATION_S : 3.5;
    const endTime = item.time + duration;

    if (currentTime < endTime) {
      addActiveDanmaku(item, videoRect.width, videoRect.height);
    }

    danmakuCursor++;
  }

  // Canvas rendering handles expiry cleanup in renderDanmakuCanvas
}



function clearAllDanmaku() {
  // Clear canvas
  if (danmakuCtx && danmakuCanvas) {
    danmakuCtx.clearRect(0, 0, danmakuCanvas.width, danmakuCanvas.height);
  }

  // Clear active danmaku
  activeDanmaku = [];
  activeDanmakuIds.clear();
  danmakuCursor = 0;

  danmakuTracks = {
    scroll: [],
    top: [],
    bottom: []
  };

  // Clear track indices on data
  for (let i = 0; i < danmakuData.length; i++) {
    delete danmakuData[i]._trackIndex;
    delete danmakuData[i]._trackReserved;
  }

  if (typeof window.refreshDanmakuComments === 'function') {
    window.refreshDanmakuComments();
  }
}

function cleanupDanmaku() {
  stopCanvasRenderLoop();
  clearAllDanmaku();

  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  danmakuData = [];
}

function getDanmakuOverlays() {
  const overlays = [];
  const standard = getDanmakuElement('danmakuOverlay');
  if (standard) overlays.push(standard);
  return overlays;
}

function applyOverlayVisibility() {
  const danmakuOverlay = getDanmakuElement('danmakuOverlay');
  if (danmakuOverlay) {
    danmakuOverlay.style.display = danmakuVisible ? 'block' : 'none';
  }

  // Force canvas re-render or clear
  if (danmakuVisible) {
    renderDanmakuCanvas();
  } else if (danmakuCtx && danmakuCanvas) {
    danmakuCtx.clearRect(0, 0, danmakuCanvas.width, danmakuCanvas.height);
  }
}

function toggleDanmakuVisibility() {
  danmakuVisible = !danmakuVisible;
  window.danmakuVisible = danmakuVisible;

  if (danmakuVisible) {
    const videoEl = getDanmakuElement('video');
    if (videoEl) {
      const currentTime = videoEl.currentTime;
      requestAnimationFrame(() => {
        updateDanmakuVisibility(currentTime);
      });
    }
  }

  applyOverlayVisibility();
  return danmakuVisible;
}
function hideDanmaku() {
  danmakuVisible = false;
  window.danmakuVisible = danmakuVisible;
  applyOverlayVisibility();
}

function showDanmaku() {
  danmakuVisible = true;
  window.danmakuVisible = danmakuVisible;
  applyOverlayVisibility();
}

function toggleDanmakuForm() {
  danmakuFormCollapsed = !danmakuFormCollapsed;
  const content = document.getElementById('danmakuContent');
  const icon = document.getElementById('danmakuToggleIcon');

  if (danmakuFormCollapsed) {
    content.classList.add('collapsed');
    icon.textContent = 'â–²';
  } else {
    content.classList.remove('collapsed');
    icon.textContent = 'â–¼';
  }
}

function updateDanmakuOverlay() {
  // With canvas rendering, we just need to resize the canvas on mode changes
  updateDanmakuScale();
  ensureDanmakuCanvas();
}

// recheckScrollDanmakuAnimations removed - canvas handles this automatically



function initDanmaku() {
  if (mutationObserver) {
    mutationObserver.disconnect();
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  applyOverlayVisibility();

  updateDanmakuScale();

  const videoContainer = getDanmakuContainer('.video-container');
  const miniPlayer = document.querySelector('.mini-player');
  const danmakuOverlay = getDanmakuElement('danmakuOverlay');

  resizeObserver = new ResizeObserver(() => {
    updateDanmakuScale();
    // Re-setup canvas for new size (handles miniplayer transitions)
    ensureDanmakuCanvas();
  });

  if (videoContainer) {
    resizeObserver.observe(videoContainer);
  }
  if (miniPlayer) {
    resizeObserver.observe(miniPlayer);
  }
  if (danmakuOverlay) {
    resizeObserver.observe(danmakuOverlay);
  }
  
  // Also observe mini-player-inner for transitions
  const miniPlayerInner = document.querySelector('.mini-player-inner');
  if (miniPlayerInner) {
    resizeObserver.observe(miniPlayerInner);
  }

  const danmakuToggleBtn = document.getElementById('danmakuToggleBtn');
  if (danmakuToggleBtn) {
    danmakuToggleBtn.addEventListener('click', () => {
      const isVisible = toggleDanmakuVisibility();
      danmakuToggleBtn.classList.toggle('active', isVisible);

      if (isVisible) {
        danmakuToggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-icon lucide-message-square"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>';
      } else {
        danmakuToggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-x-icon lucide-message-square-x"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="m14.5 8.5-5 5"/><path d="m9.5 8.5 5 5"/></svg>';
      }
    });

    danmakuToggleBtn.classList.toggle('active', danmakuVisible);

    if (danmakuVisible) {
      danmakuToggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-icon lucide-message-square"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>';
    } else {
      danmakuToggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-x-icon lucide-message-square-x"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="m14.5 8.5-5 5"/><path d="m9.5 8.5 5 5"/></svg>';
    }
  }

  const danmakuControlBtn = document.getElementById('danmakuControlBtn');
  if (danmakuControlBtn) {
    danmakuControlBtn.addEventListener('click', () => {
      danmakuEnabled = !danmakuEnabled;
      danmakuVisible = danmakuEnabled;
      window.danmakuVisible = danmakuVisible;

      const btn = getDanmakuElement('danmakuControlBtn');
      if (btn) {
        btn.textContent = danmakuEnabled ? 'Ð”Ð°Ð½Ð¼Ð°ÐºÑƒ Ð’ÐšÐ›' : 'Ð”Ð°Ð½Ð¼Ð°ÐºÑƒ Ð’Ð«ÐšÐ›';
        btn.classList.toggle('disabled', !danmakuEnabled);
      }

      if (!danmakuEnabled) {
        clearAllDanmaku();
      } else {
        applyOverlayVisibility();
      }
    });

    danmakuControlBtn.textContent = danmakuEnabled ? 'Ð”Ð°Ð½Ð¼Ð°ÐºÑƒ Ð’ÐšÐ›' : 'Ð”Ð°Ð½Ð¼Ð°ÐºÑƒ Ð’Ð«ÐšÐ›';
    danmakuControlBtn.classList.toggle('disabled', !danmakuEnabled);
  }

  const sendDanmaku = document.getElementById('sendDanmaku');
  if (sendDanmaku) {
    sendDanmaku.addEventListener('click', async () => {
      const textInput = getDanmakuElement('danmakuText');
      if (!textInput) return;
      const text = textInput.value.trim();
      if (!text) return;

      const videoEl = getDanmakuElement('video');
      if (!videoEl) return;

      const colorSelect = getDanmakuElement('danmakuColor');
      const sizeSelect = getDanmakuElement('danmakuSize');
      const posSelect = getDanmakuElement('danmakuPos');

      if (!colorSelect || !sizeSelect || !posSelect) return;

      const danmakuItem = {
        id: Date.now().toString(),
        text: text,
        time: videoEl.currentTime,
        color: colorSelect.value,
        size: sizeSelect.value,
        position: posSelect.value,
        created: Date.now()
      };

      danmakuData.push(danmakuItem);

      danmakuData.sort((a, b) => a.time - b.time);
      layoutDanmaku(danmakuData, videoEl.currentTime);

      updateDanmakuVisibility(videoEl.currentTime);

      if (typeof window.addDanmakuComment === 'function') {
        window.addDanmakuComment(danmakuItem);
      }

      await saveDanmaku();

      textInput.value = '';
    });
  }

  if (!window.danmakuKeyListenerAttached) {
    document.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.code === 'KeyD' && !e.shiftKey) {
        if (document.body.classList.contains('error-state')) {
          e.preventDefault();
          return;
        }
        e.preventDefault();

        const isVisible = toggleDanmakuVisibility();

        const danmakuToggleBtn = getDanmakuElement("danmakuToggleBtn");
        if (danmakuToggleBtn) {
          danmakuToggleBtn.classList.toggle('active', isVisible);

          if (isVisible) {
            danmakuToggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-icon lucide-message-square"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>';
          } else {
            danmakuToggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-x-icon lucide-message-square-x"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="m14.5 8.5-5 5"/><path d="m9.5 8.5 5 5"/></svg>';
          }
        }

        const btn = getDanmakuElement("danmakuControlBtn");
        if (btn) {
          danmakuEnabled = isVisible;
          btn.textContent = isVisible ? "Ð”Ð°Ð½Ð¼Ð°ÐºÑƒ Ð’ÐšÐ›" : "Ð”Ð°Ð½Ð¼Ð°ÐºÑƒ Ð’Ð«ÐšÐ›";
          btn.classList.toggle('disabled', !isVisible);
        }
      }
    });
    window.danmakuKeyListenerAttached = true;
  }

  document.addEventListener('fullscreenchange', updateDanmakuOverlay);

  mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        updateDanmakuOverlay();
      }
    });
  });
  mutationObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  if (!videoListenersAttached) {
    setupVideoListeners();
    videoListenersAttached = true;
  }

  function setupVideoListeners() {
    const videoEl = getDanmakuElement('video');
    if (!videoEl) return;

    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 100;

    // Start canvas render loop
    startCanvasRenderLoop();

    videoEl.addEventListener('timeupdate', () => {
      if (!danmakuEnabled || !danmakuVisible) return;
      const now = Date.now();
      if (now - lastUpdateTime >= UPDATE_INTERVAL) {
        lastUpdateTime = now;
        updateDanmakuVisibility(videoEl.currentTime);
      }
    });

    videoEl.addEventListener('seeked', () => {
      if (danmakuEnabled) {
        // Clear active danmaku
        if (danmakuCtx && danmakuCanvas) {
          danmakuCtx.clearRect(0, 0, danmakuCanvas.width, danmakuCanvas.height);
        }
        activeDanmaku = [];
        activeDanmakuIds.clear();
        
        // Reset runtime track state (but keep staticTrackIndex!)
        danmakuTracks = { scroll: [], top: [], bottom: [] };
        
        // Clear only runtime track indices, preserve staticTrackIndex
        for (let i = 0; i < danmakuData.length; i++) {
          delete danmakuData[i]._trackReserved;
          // Restore _trackIndex from staticTrackIndex if available
          if (danmakuData[i].staticTrackIndex !== undefined) {
            danmakuData[i]._trackIndex = danmakuData[i].staticTrackIndex;
          } else {
            delete danmakuData[i]._trackIndex;
          }
        }

        const currentTime = videoEl.currentTime;
        const startTime = Math.max(0, currentTime - DANMAKU_DURATION_S);
        danmakuCursor = binarySearchDanmaku(startTime);

        const overlay = getDanmakuElement('fullscreen-danmaku-overlay') || getDanmakuElement('danmakuOverlay');
        if (!overlay) return;
        
        const videoRect = overlay.getBoundingClientRect();
        const containerWidth = videoRect.width;
        const containerHeight = videoRect.height;
        
        // Add danmaku that should be visible now
        for (let i = danmakuCursor; i < danmakuData.length; i++) {
          const item = danmakuData[i];
          
          // Stop if danmaku starts too far in future
          if (item.time > currentTime + 0.5) {
            danmakuCursor = i;
            break;
          }
          
          const duration = item.position === 'scroll' ? DANMAKU_DURATION_S : 3.5;
          const endTime = item.time + duration;
          
          // Skip if already expired
          if (currentTime >= endTime) {
            continue;
          }
          
          // For scroll danmaku, check if it's still on screen
          if (item.position === 'scroll') {
            const elapsed = currentTime - item.time;
            const textWidth = item._estimatedWidth || estimateDanmakuWidth(item.text, currentScale, item.size);
            const speed = (containerWidth + textWidth) / DANMAKU_DURATION_S;
            const currentX = containerWidth - elapsed * speed;
            
            // Skip if already scrolled off screen
            if (currentX + textWidth < 0) {
              continue;
            }
          }
          
          // Use staticTrackIndex - danmaku should always be on same track
          // addActiveDanmaku will use item._trackIndex (restored from staticTrackIndex above)
          // or item.staticTrackIndex directly
          addActiveDanmaku(item, containerWidth, containerHeight);
          
          danmakuCursor = i + 1;
        }
        
        // Force immediate render
        renderDanmakuCanvas();
      }
    });

    // Canvas rendering doesn't need play/pause/rate handlers - it renders based on video.currentTime
  }
}

async function loadDanmakuData() {
  cleanupDanmaku();

  if (window.currentPlaylistHandle && window.currentVideoName) {
    danmakuData = await loadDanmaku();
    console.log('Danmaku data loaded:', danmakuData.length, 'items');
    
    // Restart canvas render loop after loading data
    startCanvasRenderLoop();
  }
}

window.loadDanmakuData = loadDanmakuData;
window.updateDanmakuOverlay = updateDanmakuOverlay;
window.updateDanmakuVisibility = updateDanmakuVisibility;
window.danmakuEnabled = danmakuEnabled;
window.danmakuVisible = danmakuVisible;
window.clearAllDanmaku = clearAllDanmaku;
window.toggleDanmakuVisibility = toggleDanmakuVisibility;
window.hideDanmaku = hideDanmaku;
window.showDanmaku = showDanmaku;
window.cleanupDanmaku = cleanupDanmaku;
window.layoutDanmaku = layoutDanmaku;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initDanmaku();
    setTimeout(() => {
      loadDanmakuData();
    }, 100);
  });
} else {
  initDanmaku();
  setTimeout(() => {
    loadDanmakuData();
  }, 100);
}

function renderDensityGraph(data) {
  const container = document.getElementById('danmakuDensity');
  if (!container) return;

  if (densityGraphObserver) {
    densityGraphObserver.disconnect();
    densityGraphObserver = null;
  }

  container.innerHTML = '';

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  densityGraphObserver = new ResizeObserver(() => {
    drawDensity(canvas, data);
  });
  densityGraphObserver.observe(container);

  drawDensity(canvas, data);
}

function drawDensity(canvas, data) {
  const container = canvas.parentElement;
  const width = container.clientWidth;
  const height = container.clientHeight;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (!data || data.length === 0) return;

  const video = getDanmakuElement('video');
  const duration = video ? video.duration : 0;

  let maxTime = duration;
  if (!maxTime || isNaN(maxTime) || maxTime === Infinity) {
    maxTime = data.length > 0 ? data[data.length - 1].time + 10 : 600;
  }

  const minPixelsPerBucket = 5;
  const maxBuckets = Math.max(1, Math.floor(width / minPixelsPerBucket));

  let bucketSize = maxTime / maxBuckets;
  if (bucketSize < 1) bucketSize = 1;

  const bucketCount = Math.ceil(maxTime / bucketSize);
  const buckets = new Array(bucketCount).fill(0);

  let maxCount = 0;
  for (const item of data) {
    const idx = Math.floor(item.time / bucketSize);
    if (idx >= 0 && idx < bucketCount) {
      buckets[idx]++;
      if (buckets[idx] > maxCount) maxCount = buckets[idx];
    }
  }

  if (maxCount === 0) return;

  const stepX = width / bucketCount;
  
  const points = [];
  for (let i = 0; i < bucketCount; i++) {
    const x = i * stepX + stepX / 2;
    const normalizedHeight = (buckets[i] / maxCount) * height * 0.9;
    const y = height - normalizedHeight;
    points.push({ x, y });
  }

  if (points.length === 0) return;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }

  if (points.length > 1) {
    const last = points[points.length - 1];
    ctx.quadraticCurveTo(points[points.length - 2].x, points[points.length - 2].y, last.x, last.y);
  }

  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  const accentColor = getComputedStyle(document.body).getPropertyValue('--channel-accent').trim() || '#ff69b4';
  ctx.strokeStyle = accentColor;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }

  if (points.length > 1) {
    const last = points[points.length - 1];
    ctx.quadraticCurveTo(points[points.length - 2].x, points[points.length - 2].y, last.x, last.y);
  }

  ctx.stroke();
  ctx.globalAlpha = 1;
}

const videoEl = getDanmakuElement('video');
if (videoEl) {
  videoEl.addEventListener('durationchange', () => {
    if (typeof danmakuData !== 'undefined' && danmakuData.length > 0) {
      renderDensityGraph(danmakuData);
    }
  });
}

function syncDensityWithControls() {
  const controls = document.querySelector('.video-controls');
  const progressBar = document.getElementById('progressBar');
  const density = document.getElementById('danmakuDensity');

  if (!controls || !density) return;

  if (controls.style.display === 'flex' || controls.style.display === 'block') {
    density.style.display = 'block';
  } else if (controls.style.display === 'none') {
    density.style.display = 'none';
  }

  if (controls.classList.contains('autohide')) {
    density.classList.add('autohide');
    density.classList.remove('show');
  } else if (controls.classList.contains('show')) {
    density.classList.add('show');
    density.classList.remove('autohide');
  } else {
    density.classList.add('autohide');
  }

  const observer = new MutationObserver(() => {
    if (controls.style.display === 'flex' || controls.style.display === 'block') {
      density.style.display = 'block';
    } else if (controls.style.display === 'none') {
      density.style.display = 'none';
    }

    if (controls.classList.contains('show')) {
      density.classList.add('show');
      density.classList.remove('autohide');
    } else if (controls.classList.contains('autohide')) {
      density.classList.add('autohide');
      density.classList.remove('show');
    }

    if (controls.classList.contains('no-transition')) {
      density.classList.add('no-transition');
    } else {
      density.classList.remove('no-transition');
    }

    if (progressBar) {
      if (progressBar.style.display === 'block') {
        density.style.display = 'block';
      }
      if (progressBar.classList.contains('show')) {
        density.classList.add('show');
        density.classList.remove('autohide');
      } else if (progressBar.classList.contains('autohide')) {
        density.classList.add('autohide');
        density.classList.remove('show');
      }
    }
  });

  observer.observe(controls, { attributes: true, attributeFilter: ['class', 'style'] });
  if (progressBar) {
    observer.observe(progressBar, { attributes: true, attributeFilter: ['class', 'style'] });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(syncDensityWithControls, 100);
  });
} else {
  setTimeout(syncDensityWithControls, 100);
}
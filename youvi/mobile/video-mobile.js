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
(function () {
  'use strict';

  var PHONE_BREAKPOINT = 760;
  var MOBILE_COMMENTS_BATCH_SIZE = 20;
  var mounted = false;
  var currentData = null;
  var stickyBound = false;
  var refreshTimer = null;
  var mutationObserver = null;
  var desktopPlayerBridge = {
    sourceNode: null,
    sourceParent: null,
    sourceNextSibling: null,
    mounted: false
  };
  var state = {
    colorIndex: 0,
    danmakuPos: 'scroll',
    transcriptIndex: 0,
    danmakuIndex: 0,
    transcriptTimer: null,
    danmakuTimer: null,
    followTranscript: false,
    followDanmaku: false,
    playerFollowing: false,
    replyTargetId: null,
    replyDraftText: '',
    openReplies: {},
    replyToReplyId: null,
    replyToNick: '',
    avatarLookupChannel: '',
    playlistMode: 'site',
    playlistPreviewCache: {},
    playlistPreviewPending: {},
    pcPreviewCache: {},
    pcPreviewPending: {},
    commentsLoadMoreInFlight: false,
    commentsVisibleCount: MOBILE_COMMENTS_BATCH_SIZE,
    commentsContextKey: '',
    lastCommentsLoadedCount: 0,
    lastPlaylistRenderSignature: '',
    lastPlaylistVisualSignature: '',
    lastPlaybackClockSignature: '',
    lastDesktopRefreshAt: 0,
    playlistHydrationAttempts: 0,
    lastPlaylistHydrationRefreshAt: 0,
    lastPlaylistHydrationCheckAt: 0,
    lastParentChildQueueAt: 0,
    dbPlaylists: [],
    dbPlaylistsLoaded: false,
    dbPlaylistsLoading: false,
    videoIndex: null,
    videoIndexSourceLength: -1,
    videoIndexSourceRef: null,
    miniPlayerGuardTimer: null,
    followTimeUpdateBound: false,
    commentsExtractCacheSig: '',
    commentsExtractCacheData: [],
    commentChannelAvatarCache: {},
    commentChannelAvatarPending: {},
    desktopFollowBackup: null
  };

  function applyMobilePrebootClass() {
    if ((window.innerWidth || 0) > PHONE_BREAKPOINT) return;
    document.documentElement.classList.add('youvi-mobile-boot');
    if (document.body) {
      document.body.classList.add('youvi-mobile-mode');
    }
  }

  function clearMobilePrebootClass() {
    document.documentElement.classList.remove('youvi-mobile-boot');
  }

  applyMobilePrebootClass();

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(null, args);
      }, wait);
    };
  }

  function bindMobileKeyboardGuard() {
    if (document.documentElement.dataset.mvvKeyboardGuardBound === '1') return;
    document.documentElement.dataset.mvvKeyboardGuardBound = '1';

    function isEditableTarget(target) {
      if (!target || !target.tagName) return false;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return true;
      if (typeof target.closest === 'function') {
        return !!target.closest('#mvv-comment-input, #mvv-inline-reply-input, #mvv-danmaku-text');
      }
      return false;
    }

    function guard(event) {
      if (!document.body.classList.contains('youvi-mobile-mode')) return;

      if (isEditableTarget(event.target)) {
        return;
      }

      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }

    document.addEventListener('keydown', guard, true);
    document.addEventListener('keypress', guard, true);
    document.addEventListener('keyup', guard, true);
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function parseBackgroundImageUrl(raw) {
    var value = String(raw || '').trim();
    if (!value || value === 'none') return '';
    var m = value.match(/url\(["']?(.*?)["']?\)/i);
    return (m && m[1]) ? m[1] : '';
  }

  function detectDesktopPlaylistMode() {
    var desktopToggle = qs('#playlistToggle');
    if (desktopToggle) {
      return desktopToggle.classList.contains('rotated') ? 'folder' : 'site';
    }
    return state.playlistMode || 'site';
  }

  function detectCommentsSortValue() {
    var desktopSort = qs('#commentsSort');
    var value = desktopSort ? String(desktopSort.value || '').trim() : '';
    if (!/^(new|old|best|worst)$/.test(value)) {
      try {
        value = String(localStorage.getItem('youvi_comments_sort') || '').trim();
      } catch (e) {
        value = '';
      }
    }
    return /^(new|old|best|worst)$/.test(value) ? value : 'new';
  }

  function commentsSortLabel(value) {
    if (value === 'old') return 'Old';
    if (value === 'best') return 'Best';
    if (value === 'worst') return 'Worst';
    return 'New';
  }

  function getDesktopCommentsShowMoreInfo() {
    var desktopBtn = qs('.comments-show-more-lazy');
    if (!desktopBtn) {
      return { hasMore: false, remaining: 0 };
    }
    var remaining = firstNumberFromText(desktopBtn.textContent || '');
    return {
      hasMore: true,
      remaining: remaining
    };
  }

  function getDesktopRenderedCommentsCount() {
    return qsa('#commentsList .comment-item').length;
  }

  function scheduleCommentsRefreshAfterDesktopLoad(previousCount) {
    var beforeCount = Number(previousCount) || 0;
    var tries = 0;
    var maxTries = 45;

    function finish() {
      state.commentsLoadMoreInFlight = false;
      refreshFromDesktop();
    }

    function tick() {
      tries += 1;
      var nowCount = getDesktopRenderedCommentsCount();
      var desktopBtn = qs('.comments-show-more-lazy');
      var desktopLoading = !!(desktopBtn && desktopBtn.disabled);
      var changed = nowCount > beforeCount;
      var noMore = !desktopBtn;
      if ((changed && !desktopLoading) || noMore || tries >= maxTries) {
        finish();
        return;
      }
      setTimeout(tick, 90);
    }

    setTimeout(tick, 100);
  }

  function extractVideoNameFromHref(href) {
    var raw = String(href || '');
    var match = raw.match(/[?&]name=([^&#]+)/i);
    if (!match || !match[1]) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch (e) {
      return match[1];
    }
  }

  function getAllVideosSource() {
    return (typeof allVideos !== 'undefined' && Array.isArray(allVideos))
      ? allVideos
      : (Array.isArray(window.allVideos) ? window.allVideos : []);
  }

  function ensureVideoIndex() {
    var source = getAllVideosSource();
    if (!source.length) {
      state.videoIndex = null;
      state.videoIndexSourceLength = 0;
      state.videoIndexSourceRef = source;
      return null;
    }

    var needsRebuild = !state.videoIndex
      || state.videoIndexSourceRef !== source
      || state.videoIndexSourceLength !== source.length;
    if (!needsRebuild) return state.videoIndex;

    var map = new Map();
    source.forEach(function (video) {
      if (!video || !video.name) return;
      if (!map.has(video.name)) {
        map.set(video.name, video);
      }
    });
    state.videoIndex = map;
    state.videoIndexSourceRef = source;
    state.videoIndexSourceLength = source.length;
    return state.videoIndex;
  }

  function findVideoByName(name) {
    var target = String(name || '').trim();
    if (!target) return null;
    var index = ensureVideoIndex();
    if (!index) return null;
    return index.get(target) || null;
  }

  function extractCardThumb(card) {
    if (!card) return '';
    var thumbRoot = qs('.pc-video-thumb,.video-thumb,.video-thumbnail,.related-thumb,.thumb,.thumbnail', card) || card;
    var img = qs('.pc-video-thumb img,.video-thumb img,.video-thumbnail img,.related-thumb img,.thumb img,.thumbnail img,img', card);
    if (img) {
      var src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
      if (src) return String(src).trim();
    }

    var bg = parseBackgroundImageUrl((thumbRoot.style && thumbRoot.style.backgroundImage) || '');
    if (bg) return bg;

    bg = parseBackgroundImageUrl((card.style && card.style.backgroundImage) || '');
    if (bg) return bg;

    var dataThumb = card.getAttribute('data-thumbnail') || card.getAttribute('data-thumb') || card.getAttribute('data-image');
    if (dataThumb) return String(dataThumb).trim();
    return '';
  }

  function applyPreviewToParentChildDom(itemKey, payload) {
    var key = String(itemKey || '');
    if (!key) return;

    qsa('.mvv-pc-card').forEach(function (node) {
      if (String(node.getAttribute('data-video-key') || '') !== key) return;

      var thumbNode = qs('.mvv-thumb', node);
      if (thumbNode && payload && payload.thumb) {
        thumbNode.classList.add('has-image');
        thumbNode.style.backgroundImage = 'url("' + payload.thumb + '")';
        thumbNode.style.backgroundSize = 'cover';
        thumbNode.style.backgroundPosition = 'center';
        thumbNode.style.backgroundRepeat = 'no-repeat';
      }

      var badgeNode = qs('.mvv-thumb-badge', node);
      if (badgeNode && payload && payload.duration) {
        badgeNode.textContent = payload.duration;
      }
    });
  }

  function queueParentChildPreviewLoading(items) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) return;
    if (typeof window.getPreviewAndDuration !== 'function') return;

    var nowTs = Date.now();
    var queue = list.filter(function (item) {
      if (!item || !item.videoName) return false;
      var key = String(item.key || item.videoName || item.href || '');
      if (!key) return false;
      if (state.pcPreviewPending[key]) return false;
      if (!findVideoByName(item.videoName)) return false;

      var cache = state.pcPreviewCache[key] || null;
      var itemDuration = normalizeDuration(item.duration || '0:00');
      var cacheDuration = normalizeDuration((cache && cache.duration) || '0:00');
      var itemHasThumb = !!item.thumb;
      var cacheHasThumb = !!(cache && cache.thumb);
      var needsThumb = !(itemHasThumb || cacheHasThumb);
      var needsDuration = itemDuration === '0:00' && cacheDuration === '0:00';
      if (!needsThumb && !needsDuration) return false;

      var retryCount = Number((cache && cache.retryCount) || 0);
      var lastAttempt = Number((cache && cache.lastAttempt) || 0);
      if (needsDuration && !needsThumb && retryCount >= 12) return false;
      if (lastAttempt && (nowTs - lastAttempt) < 2500) return false;
      return true;
    }).slice(0, 24);

    if (!queue.length) return;

    var batchSize = 2;
    function loadBatch(offset) {
      var batch = queue.slice(offset, offset + batchSize);
      if (!batch.length) return;

      Promise.all(batch.map(function (item) {
        var key = String(item.key || item.videoName || item.href || '');
        if (!key) return Promise.resolve();

        state.pcPreviewPending[key] = true;
        var prePayload = state.pcPreviewCache[key] || {};
        prePayload.lastAttempt = Date.now();
        prePayload.retryCount = Number(prePayload.retryCount || 0) + 1;
        state.pcPreviewCache[key] = prePayload;

        var sourceVideo = resolveVideoForPreviewLikePc(findVideoByName(item.videoName));
        if (!sourceVideo) {
          delete state.pcPreviewPending[key];
          return Promise.resolve();
        }

        return window.getPreviewAndDuration(sourceVideo).then(function (result) {
          var preview = result && result.preview ? String(result.preview).trim() : '';
          var duration = result && result.duration ? normalizeDuration(result.duration) : '';
          var fallbackDuration = normalizeDuration(sourceVideo && (sourceVideo.duration || sourceVideo.length || sourceVideo.time || '0:00'));
          if ((!duration || duration === '0:00') && fallbackDuration !== '0:00') {
            duration = fallbackDuration;
          }
          if (!preview && !duration) {
            return;
          }

          var payload = state.pcPreviewCache[key] || {};
          if (preview) payload.thumb = preview;
          if (duration && duration !== '0:00') payload.duration = duration;
          state.pcPreviewCache[key] = payload;
          if (preview || (duration && duration !== '0:00')) {
            applyPreviewToParentChildDom(key, payload);
          }
        }).catch(function () {}).then(function () {
          delete state.pcPreviewPending[key];
        });
      })).then(function () {
        var next = offset + batchSize;
        if (next >= queue.length) return;
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(function () { loadBatch(next); }, { timeout: 140 });
        } else {
          setTimeout(function () { loadBatch(next); }, 70);
        }
      });
    }

    loadBatch(0);
  }

  function safeStripExt(name) {
    var raw = String(name || '');
    if (typeof getFileNameWithoutExtension === 'function') {
      try { return String(getFileNameWithoutExtension(raw)); } catch (e) {}
    }
    if (typeof window.getFileNameWithoutExtension === 'function') {
      try { return String(window.getFileNameWithoutExtension(raw)); } catch (e) {}
    }
    return raw.replace(/\.[^/.]+$/, '');
  }

  function safeNaturalSort(a, b) {
    if (typeof naturalSort === 'function') {
      try { return Number(naturalSort(a, b)) || 0; } catch (e) {}
    }
    if (typeof window.naturalSort === 'function') {
      try { return Number(window.naturalSort(a, b)) || 0; } catch (e) {}
    }
    return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
  }

  function ensureChannelNameFromTags(video) {
    if (!video || video.channelName || !Array.isArray(video.tags)) return video;
    try {
      if (window.TagTypes && typeof window.TagTypes.getChannelFromTags === 'function') {
        video.channelName = window.TagTypes.getChannelFromTags(video.tags);
      } else {
        var chTags = video.tags.filter(function (t) {
          return typeof t === 'string' && /\(\s*(РєР°|ka)\s*\)$/i.test(t);
        });
        if (chTags.length) {
          video.channelName = chTags.map(function (t) {
            return String(t).replace(/\s*\(\s*(РєР°|ka)\s*\)\s*$/i, '');
          }).join(', ');
        }
      }
    } catch (e) {}
    return video;
  }

  function resolveVideoForPreviewLikePc(video) {
    if (!video) return video;
    if (video.handle || video.file) return video;

    var allVideosSource = getAllVideosSource();
    if (!allVideosSource.length || !video.name) return video;

    var match = allVideosSource.find(function (v) {
      return v && v.name === video.name && (v.handle || v.file || v.dirHandle);
    });
    if (!match) return video;
    return Object.assign({}, video, match);
  }

  function buildPlaylistHref(video, mode, playlistId) {
    var name = video && video.name ? String(video.name) : '';
    if (!name) return '#';

    if (window.VideoID && typeof window.VideoID.buildVideoUrl === 'function') {
      try {
        if (mode === 'site') return String(window.VideoID.buildVideoUrl(name, playlistId || null) || '#');
        return String(window.VideoID.buildVideoUrl(name) || '#');
      } catch (e) {}
    }

    var base = 'youvi_video.html?name=' + encodeURIComponent(name);
    if (mode === 'site' && playlistId) {
      return base + '&playlist=' + encodeURIComponent(String(playlistId));
    }
    return base;
  }

  function ensureDbPlaylistsLoaded() {
    if (state.dbPlaylistsLoaded || state.dbPlaylistsLoading) return;
    var loader = null;
    if (typeof getPlaylistsFromDB === 'function') {
      loader = getPlaylistsFromDB;
    } else if (typeof window.getPlaylistsFromDB === 'function') {
      loader = window.getPlaylistsFromDB;
    }
    if (!loader) return;

    state.dbPlaylistsLoading = true;
    Promise.resolve().then(function () {
      return loader();
    }).then(function (list) {
      state.dbPlaylists = Array.isArray(list) ? list : [];
      state.dbPlaylistsLoaded = true;
    }).catch(function () {}).finally(function () {
      state.dbPlaylistsLoading = false;
      setTimeout(refreshFromDesktop, 80);
    });
  }

  function applyPreviewToPlaylistDom(itemKey, payload) {
    var key = String(itemKey || '');
    if (!key) return;
    var foundCount = 0;
    qsa('.mvv-playlist-item').forEach(function (node) {
      if (String(node.getAttribute('data-video-key') || '') !== key) return;
      foundCount++;
      var thumbNode = qs('.mvv-thumb', node);
      if (thumbNode && payload && payload.thumb) {
        thumbNode.classList.add('has-image');
        thumbNode.style.backgroundImage = 'url("' + payload.thumb + '")';
        thumbNode.style.backgroundSize = 'cover';
        thumbNode.style.backgroundPosition = 'center';
        thumbNode.style.backgroundRepeat = 'no-repeat';
      }
      var badge = qs('.mvv-thumb-badge', node);
      if (badge && payload && payload.duration) {
        badge.textContent = payload.duration;
      }
    });
  }

  function queuePlaylistPreviewLoading(items) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return;
    }
    
    // Guard: wait for the desktop helper to become available naturally.
    if (typeof window.getPreviewAndDuration !== 'function') {
      return;
    }
    

    var nowTs = Date.now();
    var queue = list.filter(function (item) {
      if (!item || !item.video || !item.key) return false;
      if (state.playlistPreviewPending[item.key]) return false;

      var cache = state.playlistPreviewCache[item.key] || null;
      var itemDuration = normalizeDuration(item.duration || '0:00');
      var cacheDuration = normalizeDuration((cache && cache.duration) || '0:00');
      var itemHasThumb = !!item.thumb;
      var cacheHasThumb = !!(cache && cache.thumb);

      var needsThumb = !(itemHasThumb || cacheHasThumb);
      var needsDuration = itemDuration === '0:00' && cacheDuration === '0:00';
      if (!needsThumb && !needsDuration) return false;

      if (!cache) return true;
      var retryCount = Number(cache.retryCount || 0);
      var lastAttempt = Number(cache.lastAttempt || 0);

      if (needsDuration && !needsThumb && retryCount >= 12) return false;
      if (lastAttempt && (nowTs - lastAttempt) < 2500) return false;
      return true;
    }).slice(0, 80);
    if (!queue.length) {
      return;
    }

    var batchSize = 3;
    function loadBatch(offset) {
      var batch = queue.slice(offset, offset + batchSize);
      if (!batch.length) {
        return;
      }
      

      Promise.all(batch.map(function (item) {
        state.playlistPreviewPending[item.key] = true;
        var prePayload = state.playlistPreviewCache[item.key] || {};
        prePayload.lastAttempt = Date.now();
        prePayload.retryCount = Number(prePayload.retryCount || 0) + 1;
        state.playlistPreviewCache[item.key] = prePayload;

        return window.getPreviewAndDuration(item.video).then(function (result) {
          var preview = result && result.preview ? String(result.preview).trim() : '';
          var duration = result && result.duration ? normalizeDuration(result.duration) : '';
          if (!preview && !duration) {
            return;
          }

          var payload = state.playlistPreviewCache[item.key] || {};
          if (preview) payload.thumb = preview;
          if (duration && duration !== '0:00') payload.duration = duration;
          state.playlistPreviewCache[item.key] = payload;
          if (preview || (duration && duration !== '0:00')) {
            applyPreviewToPlaylistDom(item.key, payload);
          }
        }).catch(function (err) {
        }).then(function () {
          delete state.playlistPreviewPending[item.key];
        });
      })).then(function () {
        var next = offset + batchSize;
        if (next >= queue.length) return;
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(function () { loadBatch(next); }, { timeout: 140 });
        } else {
          setTimeout(function () { loadBatch(next); }, 70);
        }
      });
    }

    loadBatch(0);
  }

  function text(sel) {
    var el = qs(sel);
    return el ? String(el.textContent || '').trim() : '';
  }

  function escapeHtml(textValue) {
    return String(textValue || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getInitial(v) {
    var s = String(v || '').trim();
    return s ? s.charAt(0).toUpperCase() : 'U';
  }

  // Keep avatar colors identical to the PC version.
  function getNickColor(nick) {
    var colors = [
      '#d94b88', '#ff69b4', '#ff1493', '#c71585', '#db7093',
      '#ff6347', '#ff4500', '#ff8c00', '#ffa500', '#ffd700',
      '#32cd32', '#00ff7f', '#00ced1', '#1e90ff', '#4169e1',
      '#8a2be2', '#9932cc', '#da70d6', '#ff69b4', '#ff1493'
    ];

    var s = String(nick || '');
    var hash = 0;
    for (var i = 0; i < s.length; i++) {
      hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  var CHANNEL_NICK_RE = /\s\((ка|ka)\)$/;
  function getChannelNameFromNick(nick) {
    var s = String(nick || '');
    if (!CHANNEL_NICK_RE.test(s)) return '';
    return s.replace(CHANNEL_NICK_RE, '').trim();
  }

  function hydrateMobileCommentChannelAvatars(commentsHost) {
    try {
      if (!commentsHost) return;
      if (typeof window.loadChannelAvatar !== 'function') return;

      var avatars = qsa('.mvv-comment-avatar', commentsHost);
      if (!avatars.length) return;

      function applyAvatar(avatarEl, avatarUrl, channelName) {
        if (!avatarEl || !avatarEl.isConnected) return;
        if (!avatarUrl) {
          avatarEl.dataset.mvvAvatarHydrated = '1';
          avatarEl.dataset.mvvAvatarHydrating = '';
          return;
        }
        avatarEl.style.background = 'none';
        avatarEl.textContent = '';
        var img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = channelName;
        img.className = 'mvv-comment-avatar-img';
        avatarEl.appendChild(img);
        avatarEl.dataset.mvvAvatarHydrated = '1';
        avatarEl.dataset.mvvAvatarHydrating = '';
      }

      avatars.forEach(function (avatarEl) {
        if (!avatarEl || avatarEl.dataset.mvvAvatarHydrated === '1' || avatarEl.dataset.mvvAvatarHydrating === '1') return;

        var article = avatarEl.closest('.mvv-comment-item');
        var nickNode = article ? qs('.mvv-comment-author', article) : null;
        var nick = nickNode ? String(nickNode.textContent || '') : '';
        var channelName = getChannelNameFromNick(nick);

        if (!channelName) {
          avatarEl.dataset.mvvAvatarHydrated = '1';
          return;
        }

        if (Object.prototype.hasOwnProperty.call(state.commentChannelAvatarCache, channelName)) {
          applyAvatar(avatarEl, state.commentChannelAvatarCache[channelName], channelName);
          return;
        }

        avatarEl.dataset.mvvAvatarHydrating = '1';

        var pending = state.commentChannelAvatarPending[channelName];
        if (!pending) {
          pending = window.loadChannelAvatar(channelName)
            .then(function (url) {
              state.commentChannelAvatarCache[channelName] = url || null;
              return url || null;
            })
            .catch(function () {
              state.commentChannelAvatarCache[channelName] = null;
              return null;
            })
            .then(function (url) {
              delete state.commentChannelAvatarPending[channelName];
              return url;
            });
          state.commentChannelAvatarPending[channelName] = pending;
        }

        pending.then(function (url) {
          applyAvatar(avatarEl, url, channelName);
        });
      });
    } catch (e) {}
  }

  function stringToColor(str) {
    var hash = 0;
    var source = String(str || 'U');
    for (var i = 0; i < source.length; i++) {
      hash = source.charCodeAt(i) + ((hash << 5) - hash);
    }
    var color = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + ('000000'.substring(0, 6 - color.length) + color);
  }

  function normalizeDuration(v) {
    var s = String(v || '').trim();
    if (/^\d+:\d{2}(:\d{2})?$/.test(s)) {
      return s;
    }
    var n = Number(s);
    if (Number.isFinite(n) && n > 0) {
      var h = Math.floor(n / 3600);
      var m = Math.floor((n % 3600) / 60);
      var sec = Math.floor(n % 60);
      return h > 0 ? (h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')) : (m + ':' + String(sec).padStart(2, '0'));
    }
    return '0:00';
  }

  function cleanText(v) {
    return String(v || '').replace(/\s+/g, ' ').trim();
  }

  function firstNumberFromText(v) {
    var m = String(v || '').match(/\d+/);
    return m ? Number(m[0]) : 0;
  }

  function tagTypeFromCode(codeRaw) {
    var code = String(codeRaw || '').toLowerCase();
    if (code === 'ka' || code === 'ка') return 'channel';
    if (code === 'gt') return 'general';
    if (code === 'ch') return 'character';
    if (code === 'ar' || code === 'au') return 'author';
    if (code === 'ge') return 'genre';
    if (code === 'tp') return 'type';
    if (code === 'yr') return 'year';
    if (code === 'sd' || code === 'st') return 'studio';
    if (code === 'ct') return 'category';
    if (code === 'ra' || code === 'rt') return 'rating';
    if (code === 'at') return 'anime';
    if (code === 'ser') return 'serial';
    if (code === 'mt') return 'movie';
    if (code === 'nat' || code === 'ant') return 'animation';
    return 'general';
  }

  function normalizeTags(rawTags) {
    var list = Array.isArray(rawTags) ? rawTags : [];
    return list.map(function (item) {
      var raw = '';
      if (typeof item === 'string') {
        raw = item;
      } else if (item && typeof item === 'object') {
        raw = item.name || item.tag || item.text || '';
      }
      raw = cleanText(raw);
      if (!raw) return null;

      var m = /\(([^)]+)\)\s*$/.exec(raw);
      var code = m ? String(m[1] || '').trim().toLowerCase() : '';
      if (code === 'ka' || code === 'ка') {
        return null;
      }

      var label = cleanText(raw.replace(/\s*\([^)]+\)\s*$/, ''));
      if (!label) return null;

      return {
        label: label,
        raw: raw,
        type: tagTypeFromCode(code),
        code: code
      };
    }).filter(Boolean);
  }

  function getPrimaryChannelName(video, uploaderText) {
    var fromWindow = cleanText(window.currentChannelName || '');
    if (fromWindow) return fromWindow;

    var fromVideo = cleanText(video && video.channelName ? String(video.channelName).split(',')[0] : '');
    if (fromVideo) return fromVideo;

    var fromUploader = cleanText(String(uploaderText || '').split(',')[0]);
    if (fromUploader && !/^(channel|no channel)$/i.test(fromUploader)) return fromUploader;
    return '';
  }

  function isMobileTypingActive() {
    var active = document.activeElement;
    if (!active) return false;
    if (typeof active.matches === 'function' && active.matches('#mvv-comment-input, #mvv-inline-reply-input, #mvv-danmaku-text')) {
      return true;
    }
    return false;
  }

  function timecodeToSeconds(value) {
    var raw = String(value || '').trim();
    if (!raw) return NaN;
    var parts = raw.split(':').map(function (x) { return Number(x); });
    if (parts.some(function (n) { return !Number.isFinite(n) || n < 0; })) return NaN;
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return NaN;
  }

  // More tolerant parsing for danmaku/transcript timestamps.
  // Supports "MM:SS", "HH:MM:SS", and also "MM SS" (e.g. "20 00").
  function flexClockToSeconds(value) {
    var raw = String(value || '').trim();
    if (!raw) return NaN;

    // Keep only digits, spaces and ':' to be tolerant of UI formatting (e.g. "[20:00]").
    raw = raw.replace(/[^\d:\s]/g, '').replace(/\s+/g, ' ').replace(/\./g, ':');

    // HH MM SS (spaces)
    var m3 = raw.match(/^(\d+)\s+(\d+)\s+(\d+)$/);
    if (m3) {
      var hh = Number(m3[1]);
      var mm = Number(m3[2]);
      var ss = Number(m3[3]);
      if ([hh, mm, ss].some(function (n) { return !Number.isFinite(n); })) return NaN;
      return hh * 3600 + mm * 60 + ss;
    }

    // HH:MM:SS or HH:MM:SS-ish (colons or spaces)
    m3 = raw.match(/^(\d+)\s*[:]\s*(\d+)\s*[:]\s*(\d+)$/);
    if (m3) {
      var hh2 = Number(m3[1]);
      var mm2 = Number(m3[2]);
      var ss2 = Number(m3[3]);
      if ([hh2, mm2, ss2].some(function (n) { return !Number.isFinite(n); })) return NaN;
      return hh2 * 3600 + mm2 * 60 + ss2;
    }

    // MM SS (spaces)
    var m2 = raw.match(/^(\d+)\s+(\d+)$/);
    if (m2) {
      var mm3 = Number(m2[1]);
      var ss3 = Number(m2[2]);
      if ([mm3, ss3].some(function (n) { return !Number.isFinite(n); })) return NaN;
      return mm3 * 60 + ss3;
    }

    // MM:SS
    m2 = raw.match(/^(\d+)\s*[:]\s*(\d+)$/);
    if (m2) {
      var mm4 = Number(m2[1]);
      var ss4 = Number(m2[2]);
      if ([mm4, ss4].some(function (n) { return !Number.isFinite(n); })) return NaN;
      return mm4 * 60 + ss4;
    }

    // Fallback to the strict parser (HH:MM:SS or MM:SS)
    return timecodeToSeconds(raw);
  }

  function formatSecondsToTimecode(totalSeconds) {
    var n = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    var h = Math.floor(n / 3600);
    var m = Math.floor((n % 3600) / 60);
    var s = n % 60;
    if (h > 0) {
      return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    return m + ':' + String(s).padStart(2, '0');
  }

  function linkifyDescriptionText(textValue) {
    var safe = escapeHtml(String(textValue || '')).replace(/\n/g, '<br>');
    return safe.replace(/(^|\s)(\d{1,2}:\d{2}(?::\d{2})?)(?=\s|$|<br>)/g, function (_, pfx, token) {
      var seconds = timecodeToSeconds(token);
      if (!Number.isFinite(seconds)) {
        return pfx + token;
      }
      return pfx + '<a href="#" class="mvv-timecode" data-seconds="' + seconds + '">' + token + '</a>';
    });
  }

  function readDescriptionHtml() {
    var desktop = qs('#descriptionText');
    if (desktop && String(desktop.innerHTML || '').trim()) {
      return String(desktop.innerHTML);
    }
    var fallback = text('#descriptionText') || ((window.currentVideo && window.currentVideo.description) || 'No description');
    return linkifyDescriptionText(fallback);
  }

  function extractMetaPart(sel) {
    var el = qs(sel);
    if (!el) return '';
    var clone = el.cloneNode(true);
    qsa('span', clone).forEach(function (n) {
      n.remove();
    });
    return cleanText(clone.textContent);
  }

  function extractComments(maxMainComments, maxRepliesPerComment) {
    var list = qs('#commentsList');
    if (!list) {
      return [];
    }

    var safeMaxMain = Number.isFinite(Number(maxMainComments)) ? Math.max(0, Number(maxMainComments)) : 300;
    var safeMaxReplies = Number.isFinite(Number(maxRepliesPerComment)) ? Math.max(0, Number(maxRepliesPerComment)) : 60;

    function extractReplies(commentItem) {
      return qsa('.reply-item', commentItem).slice(0, safeMaxReplies).map(function (reply, ridx) {
        return {
          id: reply.getAttribute('data-reply-id') || ('r' + ridx),
          nick: cleanText((qs('.reply-nick,.comment-author', reply) || {}).textContent || 'User'),
          text: (qs('.reply-text,.comment-text', reply) || {}).textContent || '',
          likes: Number(((qs('.like-count,.comment-like-count', reply) || {}).textContent || '0').replace(/\D+/g, '')) || 0,
          dateText: cleanText((qs('.reply-date,.comment-date', reply) || {}).textContent || '')
        };
      }).filter(function (x) { return x.text || x.nick; });
    }

    return qsa('.comment-item', list).slice(0, safeMaxMain).map(function (item, idx) {
      return {
        id: item.getAttribute('data-comment-id') || ('c' + idx),
        nick: cleanText((qs('.comment-author,.comment-nick', item) || {}).textContent || 'User'),
        text: (qs('.comment-text', item) || {}).textContent || '',
        likes: Number(((qs('.like-count,.comment-like-count', item) || {}).textContent || '0').replace(/\D+/g, '')) || 0,
        dateText: cleanText((qs('.comment-date', item) || {}).textContent || ''),
        replies: extractReplies(item)
      };
    }).filter(function (x) { return x.text || x.nick; });
  }

  function getCommentsCached(videoKey, commentSort) {
    var list = qs('#commentsList');
    if (!list) return [];

    var visibleCount = Math.max(MOBILE_COMMENTS_BATCH_SIZE, Number(state.commentsVisibleCount) || MOBILE_COMMENTS_BATCH_SIZE);
    var maxMain = Math.min(300, visibleCount + MOBILE_COMMENTS_BATCH_SIZE * 3);
    var maxReplies = 60;

    var count = list.querySelectorAll('.comment-item').length;
    var firstEl = list.querySelector('.comment-item');
    var lastEl = list.querySelector('.comment-item:last-child');
    var firstId = firstEl ? (firstEl.getAttribute('data-comment-id') || '') : '';
    var lastId = lastEl ? (lastEl.getAttribute('data-comment-id') || '') : '';

    var sig = [String(videoKey || ''), String(commentSort || ''), String(count), String(firstId), String(lastId), String(maxMain)].join('|');
    if (state.commentsExtractCacheSig === sig) return state.commentsExtractCacheData;

    var data = extractComments(maxMain, maxReplies);
    state.commentsExtractCacheSig = sig;
    state.commentsExtractCacheData = data;
    return data;
  }

  function formatCommentTime(dateText) {
    return dateText || 'now';
  }

  function extractTranscript() {
    var nodes = qsa('#transcriptList .transcript-cue-item, #transcriptList .transcript-line');
    if (!nodes.length) {
      return [];
    }
    return nodes.map(function (n) {
      var t = (qs('.transcript-cue-time,.transcript-time', n) || {}).textContent || '00:00';
      var x = (qs('.transcript-cue-text,.transcript-text', n) || {}).textContent || n.textContent || '';
      var timeText = String(t).trim();
      var timeSeconds = flexClockToSeconds(timeText);
      return { time: timeText, timeSeconds: timeSeconds, text: String(x).trim() };
    }).filter(function (x) { return x.text; }).slice(0, 120);
  }

  function extractDanmakuPrint() {
    var nodes = qsa('#danmakuCommentsList .danmaku-comment-item');
    return nodes.map(function (n) {
      var t = (qs('.danmaku-comment-time', n) || {}).textContent || '00:00';
      var x = (qs('.danmaku-comment-text', n) || {}).textContent || n.textContent || '';
      var timeText = String(t).trim();
      var timeSeconds = flexClockToSeconds(timeText);
      return { time: timeText, timeSeconds: timeSeconds, text: String(x).trim() };
    }).filter(function (x) { return x.text; }).slice(0, 120);
  }

  function extractRelated() {
    var items = qsa('#recommendationsSidebar .related-video, #recommendationsSidebar .video-card, #recommendationsSidebar .related-item').slice(0, 24);

    function thumbFrom(item) {
      var thumbRoot = qs('.related-thumb,.video-thumb,.video-thumbnail,.thumb,.thumbnail', item) || item;
      var img = qs('img', thumbRoot);
      if (img) {
        var src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
        if (src) return String(src).trim();
      }

      var bgNode = qs('.related-thumb,.video-thumb,.video-thumbnail,.thumb,.thumbnail', item);
      var bg = bgNode ? String(bgNode.style.backgroundImage || '') : '';
      var m = bg.match(/url\(["']?(.*?)["']?\)/i);
      if (m && m[1]) return m[1];

      var dataThumb = item.getAttribute('data-thumbnail') || item.getAttribute('data-thumb') || item.getAttribute('data-image');
      return dataThumb ? String(dataThumb).trim() : '';
    }

    return items.map(function (item) {
      var title = textFrom(item, '.related-title') || textFrom(item, '.video-card-title') || textFrom(item, '.video-title') || cleanText(item.getAttribute('data-title'));
      var meta = textFrom(item, '.related-meta') || textFrom(item, '.video-category') || textFrom(item, '.video-channel') || textFrom(item, '.video-stats');
      var duration = textFrom(item, '.related-duration') || textFrom(item, '.video-duration') || '0:00';
      var href = '#';
      var link = qs('a', item);
      if (link) href = String(link.getAttribute('href') || '#');
      return {
        title: title || 'Video',
        meta: meta || '',
        duration: normalizeDuration(duration),
        href: href,
        thumb: thumbFrom(item)
      };
    }).filter(function (x) { return x.title; });
  }

  function extractPlaylistCards(rootSelector, sourceType) {
    var rows = qsa(rootSelector + ' .video-card, ' + rootSelector + ' .related-video, ' + rootSelector + ' .related-item').slice(0, 120);
    return rows.map(function (item) {
      var titleValue = textFrom(item, '.video-card-title') || textFrom(item, '.related-title') || textFrom(item, '.video-title') || 'Playlist video';
      var meta = textFrom(item, '.video-playlist') || textFrom(item, '.video-category') || textFrom(item, '.related-meta') || '';
      var duration = textFrom(item, '.video-duration') || textFrom(item, '.related-duration') || '0:00';
      var linkNode = qs('.video-thumbnail[href]', item) || qs('.related-video-link[href]', item) || qs('a[href]', item);
      var hrefValue = linkNode ? String(linkNode.getAttribute('href') || '#') : '#';
      var thumbRoot = qs('.video-thumbnail,.related-thumb,.playlist-thumb,.video-thumb,.thumb,.thumbnail', item) || item;
      var img = qs('img', thumbRoot);
      var thumb = '';
      if (img) {
        thumb = String(
          img.getAttribute('src') ||
          img.getAttribute('data-src') ||
          img.getAttribute('data-lazy-src') ||
          img.getAttribute('data-original') ||
          ''
        ).trim();
      }
      if (!thumb) {
        thumb = parseBackgroundImageUrl((thumbRoot && thumbRoot.style && thumbRoot.style.backgroundImage) || '');
      }
      return {
        title: titleValue,
        meta: meta,
        duration: normalizeDuration(duration),
        href: hrefValue || '#',
        thumb: thumb,
        isCurrent: item.classList.contains('current-video'),
        sourceType: sourceType,
        key: encodeURIComponent(String(hrefValue || titleValue || 'playlist')),
        video: null
      };
    }).filter(function (x) { return x.title; });
  }

  function getDesktopPlaylistVideos(mode) {
    var list = [];
    try {
      var activeMode = mode === 'folder' ? 'folder' : 'site';
      var cv = window.currentVideo || null;
      var playlistIdFromUrl = '';
      try {
        var urlParams = new URLSearchParams(window.location.search);
        playlistIdFromUrl = urlParams.get('playlist') || urlParams.get('userPlaylist') || '';
      } catch (e) {}
      if (!playlistIdFromUrl) {
        var openLink = qs('#playlistOpenLink');
        var openHref = openLink ? String(openLink.getAttribute('href') || '') : '';
        var match = openHref.match(/[?&]playlistId=([^&]+)/i);
        if (match && match[1]) {
          playlistIdFromUrl = decodeURIComponent(match[1]);
        }
      }

      var currentFilter = (typeof currentRatingFilter !== 'undefined') ? currentRatingFilter : (window.currentRatingFilter || 'all');
      var applyFilter = null;
      if (typeof applyRatingFilterToList === 'function') {
        applyFilter = function (videos) { return applyRatingFilterToList(videos, currentFilter); };
      } else if (typeof window.applyRatingFilterToList === 'function') {
        applyFilter = function (videos) { return window.applyRatingFilterToList(videos, currentFilter); };
      } else {
        applyFilter = function (videos) { return Array.isArray(videos) ? videos.slice() : []; };
      }

      if (activeMode === 'site') {
        var playlistsSource = (typeof allPlaylists !== 'undefined' && Array.isArray(allPlaylists)) ? allPlaylists : (Array.isArray(window.allPlaylists) ? window.allPlaylists : []);
        if (!playlistsSource.length && Array.isArray(state.dbPlaylists) && state.dbPlaylists.length) {
          playlistsSource = state.dbPlaylists;
        }
        var playlistId = playlistIdFromUrl || (cv && cv._playlistId ? String(cv._playlistId) : '');
        var playlist = playlistsSource.find(function (pl) { return String(pl && pl.id) === String(playlistId); });
        var videos = (playlist && Array.isArray(playlist.videos)) ? playlist.videos : [];
        list = applyFilter(videos).map(function (video) {
          return resolveVideoForPreviewLikePc(ensureChannelNameFromTags(video));
        });
      } else {
        var allVideosSource = (typeof allVideos !== 'undefined' && Array.isArray(allVideos)) ? allVideos : (Array.isArray(window.allVideos) ? window.allVideos : []);
        var dirHandle = cv && cv.dirHandle;
        var folderVideos = dirHandle ? allVideosSource.filter(function (video) { return video && video.dirHandle === dirHandle; }) : [];
        list = applyFilter(folderVideos).slice().sort(function (a, b) {
          return safeNaturalSort(safeStripExt(a && a.name), safeStripExt(b && b.name));
        }).map(function (video) {
          return resolveVideoForPreviewLikePc(ensureChannelNameFromTags(video));
        });
      }

      if (window._playlistInverted) {
        list = list.slice().reverse();
      }
    } catch (e) {
      list = [];
    }
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  function mapVideosToPlaylistItems(videos, mode) {
    var activeMode = mode === 'folder' ? 'folder' : 'site';
    var cv = window.currentVideo || null;
    var playlistId = '';
    try {
      var params = new URLSearchParams(window.location.search);
      playlistId = params.get('playlist') || params.get('userPlaylist') || '';
    } catch (e) {}
    if (!playlistId && cv && cv._playlistId) {
      playlistId = String(cv._playlistId);
    }


    return (Array.isArray(videos) ? videos : []).map(function (video) {
      var href = buildPlaylistHref(video, activeMode, playlistId);
      var key = encodeURIComponent(String((video && video.name) || href || Math.random()));
      var cached = state.playlistPreviewCache[key] || {};
      var title = safeStripExt(video && video.name) || 'Playlist video';
      var meta = (video && (video.channelName || video.author || video.uploader)) ? String(video.channelName || video.author || video.uploader) : '';
      var durationRaw = (cached.duration || (video && video.duration) || '0:00');
      var duration = normalizeDuration(durationRaw);
      var thumb = cached.thumb || (video && (video.preview || video.thumbnail || video.thumb)) || '';
      return {
        title: title,
        meta: meta,
        duration: duration,
        href: href,
        thumb: thumb,
        isCurrent: !!(cv && video && cv.name && video.name && String(cv.name) === String(video.name)),
        sourceType: activeMode,
        key: key,
        video: video || null
      };
    });
  }

  function normalizePlaylistMatchKey(item) {
    if (!item) return '';
    var title = item.title || (item.video && item.video.name) || '';
    var normalized = safeStripExt(title).trim().toLowerCase();
    return normalized;
  }

  function playlistItemRichness(item) {
    if (!item) return 0;
    var score = 0;
    if (item.thumb) score += 3;
    if (item.duration && normalizeDuration(item.duration) !== '0:00') score += 2;
    if (item.meta) score += 1;
    return score;
  }

  function playlistListRichness(items) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) return 0;
    return list.reduce(function (sum, item) {
      return sum + playlistItemRichness(item);
    }, 0);
  }

  function enrichPlaylistItemsWithFallback(primary, fallback) {
    var primaryList = Array.isArray(primary) ? primary : [];
    var fallbackList = Array.isArray(fallback) ? fallback : [];
    if (!primaryList.length || !fallbackList.length) return primaryList;

    var byHref = new Map();
    var byTitle = new Map();
    fallbackList.forEach(function (item) {
      if (!item) return;
      var href = String(item.href || '').trim();
      if (href && href !== '#') byHref.set(href, item);
      var titleKey = normalizePlaylistMatchKey(item);
      if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, item);
    });

    return primaryList.map(function (item) {
      if (!item) return item;
      var href = String(item.href || '').trim();
      var titleKey = normalizePlaylistMatchKey(item);
      var fallbackItem = (href && byHref.get(href)) || (titleKey && byTitle.get(titleKey));
      if (!fallbackItem) return item;

      var merged = Object.assign({}, item);
      if (!merged.thumb && fallbackItem.thumb) merged.thumb = fallbackItem.thumb;
      if ((!merged.duration || normalizeDuration(merged.duration) === '0:00') && fallbackItem.duration) {
        var normalizedFallbackDuration = normalizeDuration(fallbackItem.duration);
        if (normalizedFallbackDuration !== '0:00') merged.duration = normalizedFallbackDuration;
      }
      if (!merged.meta && fallbackItem.meta) merged.meta = fallbackItem.meta;
      return merged;
    });
  }

  function chooseBestPlaylistSource(primary, fallback) {
    var primaryList = Array.isArray(primary) ? primary : [];
    var fallbackList = Array.isArray(fallback) ? fallback : [];
    // Critical: keep model-backed items whenever available, because only they carry
    // full video objects needed for async preview/duration loading.
    if (primaryList.length) return primaryList;
    return fallbackList;
  }

  function extractPlaylists(mode) {
    var activeMode = mode === 'folder' ? 'folder' : 'site';
    var siteFromModel = mapVideosToPlaylistItems(getDesktopPlaylistVideos('site'), 'site');
    var folderFromModel = mapVideosToPlaylistItems(getDesktopPlaylistVideos('folder'), 'folder');

    var fromPlaylistPanel = extractPlaylistCards('#playlistContent', activeMode);
    var fromSiteCarousel = extractPlaylistCards('#currentPlaylistCarousel', 'site');
    var fromFolderCarousel = extractPlaylistCards('#folderPlaylistCarousel', 'folder');

    function pickRichestList(candidates) {
      var best = [];
      var bestScore = -1;
      (Array.isArray(candidates) ? candidates : []).forEach(function (list) {
        if (!Array.isArray(list) || !list.length) return;
        var score = playlistListRichness(list);
        if (score > bestScore || (score === bestScore && list.length > best.length)) {
          best = list;
          bestScore = score;
        }
      });
      return bestScore >= 0 ? best : [];
    }

    // Active desktop panel has the closest-to-PC metadata for the currently visible playlist.
    var siteFallback = pickRichestList([
      fromSiteCarousel,
      activeMode === 'site' ? fromPlaylistPanel : []
    ]);
    var folderFallback = pickRichestList([
      fromFolderCarousel,
      activeMode === 'folder' ? fromPlaylistPanel : []
    ]);

    var siteEnriched = enrichPlaylistItemsWithFallback(siteFromModel, siteFallback);
    var folderEnriched = enrichPlaylistItemsWithFallback(folderFromModel, folderFallback);

    var site = chooseBestPlaylistSource(siteEnriched, siteFallback);
    var folder = chooseBestPlaylistSource(folderEnriched, folderFallback);
    var active = activeMode === 'folder' ? folder : site;

    return {
      active: active,
      site: site,
      folder: folder
    };
  }

  function extractParentChildList(carouselSelector) {
    var container = qs(carouselSelector);
    if (!container) return [];

    var items = qsa('.pc-video-card, .video-card, .related-video, .related-item', container).slice(0, 24);
    return items.map(function (item) {
      var titleValue = textFrom(item, '.pc-video-title a') || textFrom(item, '.pc-video-title') || textFrom(item, '.video-card-title') || textFrom(item, '.related-title') || textFrom(item, '.video-title');
      var metaValue = textFrom(item, '.pc-video-meta')
        || textFrom(item, '.pc-video-channel')
        || textFrom(item, '.pc-video-views')
        || textFrom(item, '.video-category')
        || textFrom(item, '.video-channel')
        || textFrom(item, '.video-stats')
        || '';
      var durationValue = textFrom(item, '.pc-video-duration') || textFrom(item, '.video-duration') || textFrom(item, '.related-duration') || '0:00';
      var linkNode = qs('.pc-video-title a', item) || qs('a', item);
      var hrefValue = linkNode ? String(linkNode.getAttribute('href') || '#') : '#';
      var thumbNode = qs('.pc-video-thumb', item);
      var videoNameValue = (thumbNode && String(thumbNode.getAttribute('data-video-name') || '').trim())
        || String(item.getAttribute('data-video-name') || '').trim()
        || extractVideoNameFromHref(hrefValue);
      var previewKey = String(videoNameValue || hrefValue || titleValue || '').trim();
      var fullVideo = videoNameValue ? findVideoByName(videoNameValue) : null;
      var fullVideoDuration = normalizeDuration(fullVideo && (fullVideo.duration || fullVideo.length || fullVideo.time || '0:00'));
      var cachedPreview = previewKey ? (state.pcPreviewCache[previewKey] || null) : null;
      var thumbValue = extractCardThumb(item) || (cachedPreview && cachedPreview.thumb) || '';
      var durationResolved = normalizeDuration(durationValue || (cachedPreview && cachedPreview.duration) || fullVideoDuration || '0:00');

      return {
        title: titleValue || 'Video',
        meta: metaValue,
        duration: durationResolved,
        href: hrefValue || '#',
        thumb: thumbValue,
        videoName: videoNameValue,
        key: previewKey
      };
    }).filter(function (x) { return x.title; });
  }

  function textFrom(root, sel) {
    var el = qs(sel, root);
    return el ? String(el.textContent || '').trim() : '';
  }

  function buildData() {
    var cv = window.currentVideo || null;
    var titleValue = (cv && (cv.title || cv.name)) ? String(cv.title || cv.name).replace(/\.[^/.]+$/, '') : (text('#videoTitle') || 'Video');
    var uploader = (cv && cv.channelName) || text('#uploaderName') || 'Channel';
    var channelName = getPrimaryChannelName(cv, uploader);
    var tags = [];
    if (cv && Array.isArray(cv.tags) && cv.tags.length) {
      tags = cv.tags;
    } else {
      tags = qsa('#videoTags .video-tag, #videoTags a, #videoTags span').map(function (t) { return cleanText(t.textContent); }).filter(Boolean);
    }
    tags = normalizeTags(tags);

    var viewsText = extractMetaPart('#videoViews') || text('#videoViews') || (cv && Number.isFinite(cv.views) ? String(cv.views) + ' просмотров' : '0 просмотров');
    var likesText = extractMetaPart('#videoLikes') || text('#videoLikes') || (cv && Number.isFinite(cv.likes) ? String(cv.likes) + ' лайков' : '0 лайков');
    var dislikesText = extractMetaPart('#videoDislikes') || text('#videoDislikes') || (cv && Number.isFinite(cv.dislikes) ? String(cv.dislikes) + ' дизлайков' : '0 дизлайков');

    var qualityText = 'HD';
    if (cv && cv.quality) qualityText = cleanText(cv.quality);
    var timeDisplayParts = text('#timeDisplay').split('/');
    var currentTimeText = normalizeDuration((timeDisplayParts[0] || '').trim() || '0:00');
    var durationText = normalizeDuration((timeDisplayParts[1] || '').trim() || (cv && cv.duration) || '0:00');
    var subscribeBtn = qs('#subscribeBtn');
    var subscribeText = subscribeBtn ? cleanText(subscribeBtn.textContent) : 'Subscribe';
    var subscribeActive = !!(subscribeBtn && subscribeBtn.classList.contains('subscribed'));
    var uploaderAvatar = qs('#uploaderAvatar');
    var uploaderAvatarUrl = parseBackgroundImageUrl((uploaderAvatar && uploaderAvatar.style && uploaderAvatar.style.backgroundImage) || '');

    var playlistMode = detectDesktopPlaylistMode();
    state.playlistMode = playlistMode;
    var playlists = extractPlaylists(playlistMode);
    var invertBtn = qs('#playlistInvertBtn');
    var loopBtn = qs('#playlistLoopBtn');
    var shuffleBtn = qs('#playlistShuffleBtn');
    var commentSort = detectCommentsSortValue();
    var videoKey = String(window.currentVideoName || ((cv && cv.name) ? cv.name : '') || '').trim();

    return {
      title: titleValue,
      uploader: uploader,
      channelName: channelName,
      views: viewsText,
      likes: likesText,
      dislikes: dislikesText,
      likesCount: firstNumberFromText(likesText),
      dislikesCount: firstNumberFromText(dislikesText),
      date: text('#videoDate') || 'Today',
      quality: qualityText,
      currentTime: currentTimeText,
      duration: durationText,
      subscribeText: subscribeText || 'Subscribe',
      subscribeActive: subscribeActive,
      uploaderAvatarUrl: uploaderAvatarUrl,
      descriptionHtml: readDescriptionHtml(),
      tags: tags,
      comments: getCommentsCached(videoKey, commentSort),
      transcript: extractTranscript(),
      danmaku: extractDanmakuPrint(),
      related: extractRelated(),
      playlists: playlists,
      playlistMode: playlistMode,
      playlistControls: {
        invert: !!((invertBtn && invertBtn.classList.contains('active')) || window._playlistInverted),
        loop: !!((loopBtn && loopBtn.classList.contains('active')) || window._playlistLoop),
        shuffle: !!((shuffleBtn && shuffleBtn.classList.contains('active')) || window._playlistShuffle)
      },
      commentSort: commentSort,
      childVideos: extractParentChildList('#childVideosCarousel'),
      parentVideos: extractParentChildList('#parentVideosCarousel')
    };
  }

  function syncPlaybackClockOnly() {
    if (!currentData) return;

    var timeDisplayRaw = text('#timeDisplay');
    if (!timeDisplayRaw) return;

    var parts = String(timeDisplayRaw).split('/');
    var currentTimeText = normalizeDuration((parts[0] || '').trim() || '0:00');
    var durationText = normalizeDuration((parts[1] || '').trim() || currentData.duration || '0:00');
    var signature = currentTimeText + '|' + durationText;
    if (signature === state.lastPlaybackClockSignature) return;
    state.lastPlaybackClockSignature = signature;

    currentData.currentTime = currentTimeText;
    currentData.duration = durationText;
    setText('#mvv-duration', durationText);
    setText('#mvv-time-label', currentTimeText + ' / ' + durationText);
  }

  function hasIncompleteVisiblePlaylistItems() {
    var nodes = qsa('#mvv-playlists .mvv-playlist-item, #mvv-playlists-site .mvv-playlist-item, #mvv-playlists-folder .mvv-playlist-item');
    if (!nodes.length) return false;
    return nodes.some(function (node) {
      var thumbNode = qs('.mvv-thumb', node);
      var durationNode = qs('.mvv-thumb-badge', node);
      var durationText = normalizeDuration(durationNode ? durationNode.textContent : '0:00');
      var hasThumb = !!(thumbNode && thumbNode.classList.contains('has-image'));
      return !hasThumb || durationText === '0:00';
    });
  }

  function proxyClick(fromId, toSel) {
    var from = qs(fromId);
    if (!from) return;
    from.addEventListener('click', function () {
      var target = qs(toSel);
      if (target) target.click();
    });
  }

  function render(data) {
    var root = qs('#mvv-root');
    if (!root) return;

    setText('#mvv-title-top', data.title);
    var uploaderNode = qs('#mvv-uploader');
    if (uploaderNode) {
      var channelName = cleanText(data.channelName || '');
      if (channelName) {
        uploaderNode.innerHTML = '<a class="mvv-channel-link" href="youvi_ch_view.html?channel=' + encodeURIComponent(channelName) + '">' + escapeHtml(data.uploader || channelName) + '</a>';
      } else {
        uploaderNode.textContent = data.uploader || 'Channel';
      }
    }
    setText('#mvv-views', data.views);
    setText('#mvv-like-count', String(data.likesCount || 0));
    setText('#mvv-dislike-count', String(data.dislikesCount || 0));
    setText('#mvv-date', data.date);
    setText('#mvv-quality', data.quality);
    setText('#mvv-duration', data.duration);
    setText('#mvv-time-label', (data.currentTime || '0:00') + ' / ' + data.duration);
    setHtml('#mvv-description', data.descriptionHtml || 'No description');

    var avatar = qs('#mvv-avatar');
    if (avatar) {
      if (data.uploaderAvatarUrl) {
        avatar.textContent = '';
        avatar.style.backgroundImage = 'url("' + data.uploaderAvatarUrl + '")';
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
        avatar.style.backgroundRepeat = 'no-repeat';
        state.avatarLookupChannel = '';
      } else {
        avatar.textContent = getInitial(data.uploader);
        avatar.style.background = stringToColor(data.uploader);
        avatar.style.color = '#fff';
        avatar.style.backgroundImage = '';
        avatar.style.backgroundSize = '';
        avatar.style.backgroundPosition = '';
        avatar.style.backgroundRepeat = '';

        var channelName = String(window.currentChannelName || '').trim();
        if (channelName && typeof window.loadChannelAvatar === 'function' && state.avatarLookupChannel !== channelName) {
          state.avatarLookupChannel = channelName;
          window.loadChannelAvatar(channelName).then(function (avatarUrl) {
            if (!avatarUrl) return;
            if (String(window.currentChannelName || '').trim() !== channelName) return;
            var avatarNode = qs('#mvv-avatar');
            if (!avatarNode) return;
            avatarNode.textContent = '';
            avatarNode.style.backgroundImage = 'url("' + avatarUrl + '")';
            avatarNode.style.backgroundSize = 'cover';
            avatarNode.style.backgroundPosition = 'center';
            avatarNode.style.backgroundRepeat = 'no-repeat';
          }).catch(function () {});
        }
      }
    }

    var subBtn = qs('#mvv-subscribe');
    if (subBtn) {
      subBtn.textContent = data.subscribeText || 'Subscribe';
      subBtn.classList.toggle('subscribed', !!data.subscribeActive);
    }

    var tagsHost = qs('#mvv-tags');
    if (tagsHost) {
      tagsHost.innerHTML = (data.tags || []).slice(0, 24).map(function (tag) {
        var typeClass = 'mvv-tag-type-' + escapeHtml(tag.type || 'general');
        var tagValue = tag.raw || tag.label || '';
        var href = 'youvi_main.html?tag=' + encodeURIComponent(tagValue);
        return '<a class="mvv-tag ' + typeClass + '" href="' + href + '">' + escapeHtml(tag.label || '') + '</a>';
      }).join('');
    }

    var relatedHost = qs('#mvv-related');
    if (relatedHost) {
      var relatedItems = Array.isArray(data.related) ? data.related.slice() : [];
      if (relatedItems.length % 2 === 1) {
        relatedItems.pop();
      }
      relatedHost.innerHTML = relatedItems.map(function (it) {
        var thumbStyle = it.thumb ? (' style="background-image:url(\'' + escapeHtml(it.thumb) + '\');background-size:cover;background-position:center;"') : '';
        var thumbClass = it.thumb ? 'mvv-thumb has-image' : 'mvv-thumb';
        return '<a class="mvv-related-item" href="' + escapeHtml(it.href || '#') + '"><div class="' + thumbClass + '"' + thumbStyle + '><span class="mvv-thumb-badge">' + escapeHtml(it.duration) + '</span></div><div class="mvv-related-title">' + escapeHtml(it.title) + '</div><div class="mvv-related-meta">' + escapeHtml(it.meta) + '</div></a>';
      }).join('');
    }

    var playlistControls = data.playlistControls || {};
    var invertControl = qs('#mvv-playlist-invert');
    var loopControl = qs('#mvv-playlist-loop');
    var shuffleControl = qs('#mvv-playlist-shuffle');
    if (invertControl) invertControl.classList.toggle('active', !!playlistControls.invert);
    if (loopControl) loopControl.classList.toggle('active', !!playlistControls.loop);
    if (shuffleControl) shuffleControl.classList.toggle('active', !!playlistControls.shuffle);

    var playlists = data.playlists || {};
    var siteItems = Array.isArray(playlists.site) ? playlists.site : [];
    var folderItems = Array.isArray(playlists.folder) ? playlists.folder : [];
    var activeItemsFromPanel = Array.isArray(playlists.active) ? playlists.active : [];
    var activePlaylistMode = (data.playlistMode === 'folder') ? 'folder' : 'site';
    state.playlistMode = activePlaylistMode;
    var playlistSignature = [
      activePlaylistMode,
      (siteItems || []).map(function (it) {
        return [it.key || '', it.title || '', it.href || ''].join('|');
      }).join('~'),
      (folderItems || []).map(function (it) {
        return [it.key || '', it.title || '', it.href || ''].join('|');
      }).join('~'),
      (activeItemsFromPanel || []).map(function (it) {
        return [it.key || '', it.title || '', it.href || ''].join('|');
      }).join('~')
    ].join('||');
    var activeVisualItems = activePlaylistMode === 'folder' ? folderItems : siteItems;
    if (!activeVisualItems.length && activeItemsFromPanel.length) {
      activeVisualItems = activeItemsFromPanel;
    }
    var playlistVisualSignature = (activeVisualItems || []).map(function (it) {
      return [it.key || '', normalizeDuration(it.duration || '0:00'), it.thumb ? '1' : '0'].join('|');
    }).join('~');
    var playlistChanged = playlistSignature !== state.lastPlaylistRenderSignature || playlistVisualSignature !== state.lastPlaylistVisualSignature;

    if (playlistChanged) {
      var siteHost = qs('#mvv-playlists-site');
      if (siteHost) {
        siteHost.innerHTML = activePlaylistMode === 'site'
          ? renderPlaylistItems(siteItems, 'No site playlist videos yet.')
          : '';
      }

      var folderHost = qs('#mvv-playlists-folder');
      if (folderHost) {
        folderHost.innerHTML = activePlaylistMode === 'folder'
          ? renderPlaylistItems(folderItems, 'No folder playlist videos yet.')
          : '';
      }
    }

    var siteGroup = qs('#mvv-playlist-group-site');
    if (siteGroup) {
      siteGroup.classList.toggle('is-empty', !siteItems.length);
      siteGroup.style.display = activePlaylistMode === 'site' ? '' : 'none';
    }

    var folderGroup = qs('#mvv-playlist-group-folder');
    if (folderGroup) {
      folderGroup.classList.toggle('is-empty', !folderItems.length);
      folderGroup.style.display = activePlaylistMode === 'folder' ? '' : 'none';
    }

    var sourceToggle = qs('#mvv-playlist-source-toggle');
    if (sourceToggle) {
      sourceToggle.textContent = activePlaylistMode === 'folder' ? 'Folder playlist' : 'Site playlist';
      sourceToggle.classList.toggle('active', activePlaylistMode === 'folder');
    }

    var legacyPlaylistsHost = qs('#mvv-playlists');
    if (legacyPlaylistsHost && playlistChanged) {
      var activeItems = activePlaylistMode === 'folder' ? folderItems : siteItems;
      if (!activeItems.length && activeItemsFromPanel.length) {
        activeItems = activeItemsFromPanel;
      }
      
      
      // Only re-render if items truly changed (check keys, not just signature)
      var currentKeys = Array.from(legacyPlaylistsHost.querySelectorAll('[data-video-key]')).map(function(el) {
        return el.getAttribute('data-video-key');
      });
      var newKeys = activeItems.map(function(it) { return String(it.key || ''); });
      var keysChanged = currentKeys.length !== newKeys.length || 
                        !currentKeys.every(function(k, i) { return k === newKeys[i]; });
      
      
      if (keysChanged) {
        legacyPlaylistsHost.innerHTML = renderPlaylistItems(activeItems, 'No playlists yet.');
      } else {
      }
    }

    // Always queue preview loading for the currently visible list.
    queuePlaylistPreviewLoading(activeVisualItems);

    if (playlistChanged) {
      state.lastPlaylistRenderSignature = playlistSignature;
      state.lastPlaylistVisualSignature = playlistVisualSignature;
    }
    var sortText = qs('.mvv-comments-sort');
    if (sortText) {
      sortText.textContent = 'Sort: ' + commentsSortLabel(data.commentSort || 'new');
    }

    var commentsHost = qs('#mvv-comments');
    if (commentsHost) {
      var allComments = Array.isArray(data.comments) ? data.comments : [];
      var videoKey = String(window.currentVideoName || ((window.currentVideo && window.currentVideo.name) || data.title || '')).trim();
      var commentsContextKey = videoKey + '|' + String(data.commentSort || 'new');
      if (state.commentsContextKey !== commentsContextKey) {
        state.commentsContextKey = commentsContextKey;
        state.commentsVisibleCount = MOBILE_COMMENTS_BATCH_SIZE;
        state.lastCommentsLoadedCount = 0;
        state.commentsLoadMoreInFlight = false;
      }

      var loadedCount = allComments.length;
      if (state.commentsLoadMoreInFlight && loadedCount > state.lastCommentsLoadedCount) {
        state.commentsLoadMoreInFlight = false;
      }
      state.lastCommentsLoadedCount = loadedCount;

      if (!Number.isFinite(Number(state.commentsVisibleCount)) || state.commentsVisibleCount < MOBILE_COMMENTS_BATCH_SIZE) {
        state.commentsVisibleCount = MOBILE_COMMENTS_BATCH_SIZE;
      }
      if (state.commentsVisibleCount > loadedCount) {
        state.commentsVisibleCount = loadedCount || MOBILE_COMMENTS_BATCH_SIZE;
      }

      var visibleCount = Math.min(loadedCount, Math.max(MOBILE_COMMENTS_BATCH_SIZE, Number(state.commentsVisibleCount) || MOBILE_COMMENTS_BATCH_SIZE));
      var visibleComments = allComments.slice(0, visibleCount);

      var upvoteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l-8 8h6v8h4v-8h6z"></path></svg>';
      commentsHost.innerHTML = visibleComments.map(function (c, idx) {
        var replies = Array.isArray(c.replies) ? c.replies : [];
        var commentId = String(c.id || ('c_' + idx));
        var isRepliesOpen = !!state.openReplies[commentId];
        var replyTargetLabel = state.replyToNick ? state.replyToNick : (c.nick || 'user');
        var inlineReplyHtml = (state.replyTargetId === commentId && !state.replyToReplyId)
          ? '<div class="mvv-inline-reply" data-comment-id="' + escapeHtml(commentId) + '"><input class="mvv-inline-reply-input" id="mvv-inline-reply-input" type="text" placeholder="Reply to ' + escapeHtml(replyTargetLabel) + '..." value="' + escapeHtml(state.replyDraftText || '') + '"><button class="mvv-inline-reply-cancel" type="button" data-action="cancel-reply">Cancel</button><button class="mvv-inline-reply-send" type="button" data-action="send-reply" data-comment-id="' + escapeHtml(commentId) + '">→</button></div>'
          : '';
        var repliesHtml = '';
        if (replies.length) {
          repliesHtml = '<button class="mvv-view-replies-btn" type="button" data-action="toggle-replies" data-comment-id="' + escapeHtml(commentId) + '" aria-expanded="' + (isRepliesOpen ? 'true' : 'false') + '">Replies (' + replies.length + ')</button><div class="mvv-comment-replies" style="display:' + (isRepliesOpen ? 'grid' : 'none') + ';">' + replies.map(function (r) {
            var rn = r.nick || 'User';
            var replyId = String(r.id || ('r_' + idx));
            var inlineReplyToReplyHtml = (state.replyTargetId === commentId && state.replyToReplyId === replyId)
              ? '<div class="mvv-inline-reply" data-comment-id="' + escapeHtml(commentId) + '" data-reply-id="' + escapeHtml(replyId) + '"><input class="mvv-inline-reply-input" id="mvv-inline-reply-input" type="text" placeholder="Reply to ' + escapeHtml(rn) + '..." value="' + escapeHtml(state.replyDraftText || '') + '"><button class="mvv-inline-reply-cancel" type="button" data-action="cancel-reply">Cancel</button><button class="mvv-inline-reply-send" type="button" data-action="send-reply" data-comment-id="' + escapeHtml(commentId) + '">→</button></div>'
              : '';
            return '<article class="mvv-comment-item mvv-reply" data-reply-id="' + escapeHtml(replyId) + '" data-parent-comment-id="' + escapeHtml(commentId) + '"><div class="mvv-comment-avatar" style="background:' + getNickColor(rn) + ';color:#fff;">' + escapeHtml(getInitial(rn)) + '</div><div class="mvv-comment-content"><div class="mvv-comment-header"><span class="mvv-comment-author">' + escapeHtml(rn) + '</span></div><p class="mvv-comment-text">' + escapeHtml(r.text || '') + '</p><div class="mvv-comment-actions"><span class="mvv-comment-meta">' + escapeHtml(formatCommentTime(r.dateText || '')) + '</span><button class="mvv-comment-action" data-action="reply-to-reply" data-comment-id="' + escapeHtml(commentId) + '" data-reply-id="' + escapeHtml(replyId) + '" data-reply-nick="' + escapeHtml(rn) + '" type="button">Reply</button></div>' + inlineReplyToReplyHtml + '</div><div class="mvv-comment-like-stack"><button class="mvv-comment-like-btn" type="button" data-action="like" aria-label="Upvote">' + upvoteIcon + '</button><span class="mvv-comment-like-count">' + (Number(r.likes) || 0) + '</span></div></article>';
          }).join('') + '</div>';
        }

        return '<article class="mvv-comment-item" data-comment-id="' + escapeHtml(commentId) + '"><div class="mvv-comment-avatar" style="background:' + getNickColor(c.nick) + ';color:#fff;">' + escapeHtml(getInitial(c.nick)) + '</div><div class="mvv-comment-content"><div class="mvv-comment-header"><span class="mvv-comment-author">' + escapeHtml(c.nick) + '</span></div><p class="mvv-comment-text">' + escapeHtml(c.text) + '</p><div class="mvv-comment-actions"><span class="mvv-comment-meta">' + escapeHtml(formatCommentTime(c.dateText)) + '</span><button class="mvv-comment-action" data-action="reply" data-comment-id="' + escapeHtml(commentId) + '" type="button">Reply</button></div></div><div class="mvv-comment-like-stack"><button class="mvv-comment-like-btn" type="button" data-action="like" aria-label="Upvote">' + upvoteIcon + '</button><span class="mvv-comment-like-count">' + (Number(c.likes) || 0) + '</span></div>' + (inlineReplyHtml || repliesHtml ? '<div class="mvv-comment-thread">' + inlineReplyHtml + repliesHtml + '</div>' : '') + '</article>';
      }).join('');
      if (!allComments.length) {
        state.commentsLoadMoreInFlight = false;
        commentsHost.innerHTML = '<p class="mvv-comments-empty">No comments yet.</p>';
      } else {
        var localRemaining = Math.max(0, loadedCount - visibleCount);
        var showMoreInfo = getDesktopCommentsShowMoreInfo();
        if (localRemaining > 0 || showMoreInfo.hasMore) {
          // Prefer the desktop "real remaining" counter when it exists;
          // localRemaining is based on the cached/limited extraction and can look like "20" repeatedly.
          var baseLabel = showMoreInfo.hasMore
            ? (showMoreInfo.remaining > 0 ? ('Show more (' + showMoreInfo.remaining + ')') : 'Show more')
            : ('Show more (' + localRemaining + ')');
          var loading = !!state.commentsLoadMoreInFlight;
          var buttonLabel = loading ? 'Loading...' : baseLabel;
          var disabledAttr = loading ? ' disabled' : '';
          commentsHost.insertAdjacentHTML('beforeend', '<button class="mvv-comments-more" type="button" data-action="comments-more"' + disabledAttr + '>' + buttonLabel + '</button>');
        } else {
          state.commentsLoadMoreInFlight = false;
        }
      }

      // Hydrate channel avatars (nicks like "... (ка)/(ka)") to match PC.
      hydrateMobileCommentChannelAvatars(commentsHost);
    }

    var transcriptHost = qs('#mvv-transcript');
    if (transcriptHost) {
      transcriptHost.innerHTML = (data.transcript || []).map(function (line, idx) {
        var active = idx === state.transcriptIndex ? ' active' : '';
        return '<div class="mvv-line' + active + '" data-i="' + idx + '"><span>' + escapeHtml(line.time) + '</span><span>' + escapeHtml(line.text) + '</span></div>';
      }).join('');
    }

    var danmakuHost = qs('#mvv-danmaku-list');
    if (danmakuHost) {
      danmakuHost.innerHTML = (data.danmaku || []).map(function (line, idx) {
        var active = idx === state.danmakuIndex ? ' active' : '';
        return '<div class="mvv-line' + active + '" data-i="' + idx + '"><span>' + escapeHtml(line.time) + '</span><span>' + escapeHtml(line.text) + '</span></div>';
      }).join('');
    }

    renderParentChild(data);
  }

  function renderParentChild(data) {
    var child = qs('#mvv-child');
    var parent = qs('#mvv-parent');
    if (!child || !parent) return;

    var children = Array.isArray(data.childVideos) ? data.childVideos : [];
    var parents = Array.isArray(data.parentVideos) ? data.parentVideos : [];

    child.innerHTML = children.length ? children.map(cardHtml).join('') : '<div class="mvv-pc-empty">No child videos</div>';
    parent.innerHTML = parents.length ? parents.map(cardHtml).join('') : '<div class="mvv-pc-empty">No parent videos</div>';

    queueParentChildPreviewLoading(children.concat(parents));
  }

  function cardHtml(item) {
    var key = String(item.key || item.videoName || item.href || item.title || '');
    var thumbStyle = item.thumb ? (' style="background-image:url(\'' + escapeHtml(item.thumb) + '\');background-size:cover;background-position:center;background-repeat:no-repeat;"') : '';
    var thumbClass = item.thumb ? 'mvv-thumb has-image' : 'mvv-thumb';
    var videoNameAttr = item.videoName ? (' data-video-name="' + escapeHtml(item.videoName) + '"') : '';
    return '<a class="mvv-pc-card" data-video-key="' + escapeHtml(key) + '"' + videoNameAttr + ' href="' + escapeHtml(item.href || '#') + '"><div class="' + thumbClass + '"' + thumbStyle + '><span class="mvv-thumb-badge">' + escapeHtml(item.duration) + '</span></div><div class="mvv-pc-name">' + escapeHtml(item.title || item.name || 'Video') + '</div><div class="mvv-pc-meta">' + escapeHtml(item.meta || '') + '</div></a>';
  }

  function renderPlaylistItems(items, emptyLabel) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return '<p class="mvv-playlist-empty">' + escapeHtml(emptyLabel || 'No playlist videos yet.') + '</p>';
    }

    return list.map(function (it) {
      var href = String(it.href || '#');
      var thumbStyle = it.thumb ? (' style="background-image:url(\'' + escapeHtml(it.thumb) + '\');background-size:cover;background-position:center;background-repeat:no-repeat;"') : '';
      var thumbClass = it.thumb ? 'mvv-thumb has-image' : 'mvv-thumb';
      var cardClass = 'mvv-playlist-item' + (it.isCurrent ? ' is-current' : '');
      var key = String(it.key || '');
      return '<a class="' + cardClass + '" data-video-key="' + escapeHtml(key) + '" href="' + escapeHtml(href) + '"><div class="' + thumbClass + '"' + thumbStyle + '><span class="mvv-thumb-badge">' + escapeHtml(it.duration) + '</span></div><div><div class="mvv-playlist-title">' + escapeHtml(it.title) + '</div><div class="mvv-playlist-meta">' + escapeHtml(it.meta) + '</div></div></a>';
    }).join('');
  }

  function setText(sel, value) {
    var el = qs(sel);
    if (el) el.textContent = value;
  }

  function setHtml(sel, value) {
    var el = qs(sel);
    if (el) el.innerHTML = value;
  }

  function seekToSeconds(seconds) {
    var s = Math.max(0, Number(seconds) || 0);
    if (!Number.isFinite(s)) return;

    // Prefer bridged mobile player video.
    var directVideo = getBridgedVideo();
    if (!directVideo) {
      directVideo = qs('#videoContainer video') || qs('#mvv-player-bridge video') || qs('video');
    }
    if (directVideo) {
      try {
        function doSeek() {
          try {
            // Clamp to duration when available to avoid "seek ignored" edge cases.
            var d = Number(directVideo.duration);
            var ss = s;
            if (Number.isFinite(d) && d > 0) {
              ss = Math.max(0, Math.min(ss, d));
            }
            directVideo.currentTime = ss;
            if (typeof directVideo.play === 'function') {
              var p = directVideo.play();
              if (p && typeof p.catch === 'function') p.catch(function () {});
            }
          } catch (e) {}
        }

        // If metadata isn't ready yet, apply seek after it loads.
        if (!Number.isFinite(directVideo.duration) || directVideo.duration <= 0 || directVideo.readyState < 1) {
          directVideo.addEventListener('loadedmetadata', doSeek, { once: true, passive: true });
          directVideo.addEventListener('canplay', doSeek, { once: true, passive: true });
        } else {
          doSeek();
        }
        return;
      } catch (e) {}
    }

    // Fallback to legacy globals (if bridged video not found).
    if (typeof window.seekToTime === 'function') {
      try { window.seekToTime(s); return; } catch (e) {}
    }
    if (typeof window.seekTo === 'function') {
      try { window.seekTo(s); return; } catch (e) {}
    }
  }

  function bindDescriptionTimecodes() {
    var host = qs('#mvv-description');
    if (!host || host.dataset.timecodeBound === '1') return;
    host.dataset.timecodeBound = '1';

    host.addEventListener('click', function (event) {
      var target = event.target.closest('a,button');
      if (!target) return;

      var seconds = NaN;
      var ds = target.getAttribute('data-seconds') || target.getAttribute('data-time') || target.getAttribute('data-timestamp');
      if (ds) {
        seconds = Number(ds);
      }

      if (!Number.isFinite(seconds)) {
        var textToken = cleanText(target.textContent || '');
        seconds = timecodeToSeconds(textToken);
      }

      if (!Number.isFinite(seconds)) {
        var href = String(target.getAttribute('href') || '');
        var match = href.match(/[?&#]t=(\d{1,6})/) || href.match(/[?&#]time=(\d{1,6})/);
        if (match) {
          seconds = Number(match[1]);
        }
      }

      if (!Number.isFinite(seconds)) return;

      event.preventDefault();
      seekToSeconds(seconds);
      target.classList.add('mvv-timecode-active');
      setTimeout(function () { target.classList.remove('mvv-timecode-active'); }, 280);
    });
  }

  function bindNav() {
    var nav = qs('#mvv-nav');
    if (!nav) return;
    nav.addEventListener('click', function (event) {
      var link = event.target.closest('a[data-target]');
      if (!link) return;
      event.preventDefault();
      var target = link.getAttribute('data-target');
      qsa('a[data-target]', nav).forEach(function (a) {
        a.classList.toggle('active', a === link);
      });
      qsa('.mvv-panel').forEach(function (panel) {
        panel.classList.toggle('active', panel.id === target);
      });
      var compose = qs('#mvv-compose');
      if (compose) compose.classList.toggle('hidden', target !== 'mvv-panel-comments');
      if (target === 'mvv-panel-playlists') {
        setTimeout(refreshFromDesktop, 60);
      }
      // Enable follow timers when user is on the corresponding tab.
      state.followDanmaku = (target === 'mvv-panel-danmaku');
      state.followTranscript = (target === 'mvv-panel-transcript');
      updateStickyPlayer();
    });
  }

  function bindTranscriptListInteractions() {
    var host = qs('#mvv-transcript');
    if (!host || host.dataset.transcriptBound === '1') return;
    host.dataset.transcriptBound = '1';

    function setActiveIndex(idx, shouldSeek) {
      if (!currentData || !Array.isArray(currentData.transcript)) return;
      if (!Number.isFinite(idx) || idx < 0 || idx >= currentData.transcript.length) return;
      state.transcriptIndex = idx;
      updateTranscriptUI();
      if (shouldSeek) {
        var item = currentData.transcript[idx];
        var sec = Number(item && item.timeSeconds);
        if (!Number.isFinite(sec)) sec = timecodeToSeconds(item && item.time);
        if (Number.isFinite(sec)) seekToSeconds(sec);
      }
    }

    host.addEventListener('click', function (event) {
      var line = event.target.closest('.mvv-line[data-i]');
      if (!line) return;
      var idx = Number(line.getAttribute('data-i'));
      setActiveIndex(idx, true);
      // PC behavior: clicking a transcript line seeks and resumes playback.
      try {
        var v = getBridgedVideo();
        if (v && typeof v.play === 'function') {
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        }
      } catch (e) {}
    });
  }

  function bindDanmakuListInteractions() {
    var host = qs('#mvv-danmaku-list');
    if (!host || host.dataset.danmakuBound === '1') return;
    host.dataset.danmakuBound = '1';

    function setActiveIndex(idx, shouldSeek) {
      if (!currentData || !Array.isArray(currentData.danmaku)) return;
      if (!Number.isFinite(idx) || idx < 0 || idx >= currentData.danmaku.length) return;
      state.danmakuIndex = idx;
      updateDanmakuUI();
      if (shouldSeek) {
        var sec = Number(currentData.danmaku[idx] && currentData.danmaku[idx].timeSeconds);
        if (!Number.isFinite(sec)) {
          var tc = currentData.danmaku[idx] && currentData.danmaku[idx].time;
          sec = timecodeToSeconds(tc);
        }
        var seconds = sec;
        if (Number.isFinite(seconds)) seekToSeconds(seconds);
      }
    }

    host.addEventListener('click', function (event) {
      var line = event.target.closest('.mvv-line[data-i]');
      if (!line) return;
      var idx = Number(line.getAttribute('data-i'));
      setActiveIndex(idx, true);
      // PC behavior: clicking a danmaku line seeks and resumes playback.
      try {
        var v = getBridgedVideo();
        if (v && typeof v.play === 'function') {
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        }
      } catch (e) {}
    });

    // Hover should update active UI, but avoid aggressive seeking (touch devices).
    host.addEventListener('mouseover', function (event) {
      var line = event.target.closest('.mvv-line[data-i]');
      if (!line) return;
      var idx = Number(line.getAttribute('data-i'));
      state.followDanmaku = true;
      setActiveIndex(idx, false);
    });

    host.addEventListener('mouseout', function (event) {
      // If pointer leaves the list entirely, stop auto-follow.
      // Switching tabs also turns it off via bindNav().
      if (!event.relatedTarget || !host.contains(event.relatedTarget)) {
        var danmakuPanel = qs('#mvv-panel-danmaku');
        state.followDanmaku = !!(danmakuPanel && danmakuPanel.classList.contains('active'));
      }
    });
  }

  function bindDanmakuInput() {
    var colors = ['#ffffff', '#ff4f9f', '#ffcc00', '#00d1ff'];
    var colorBtn = qs('#mvv-danmaku-color');
    var dot = qs('#mvv-danmaku-dot');
    var posBtn = qs('#mvv-danmaku-pos');
    var posIcon = qs('#mvv-danmaku-pos-icon');

    function syncColor() {
      if (dot) dot.style.background = colors[state.colorIndex];
    }

    function syncPos() {
      if (!posIcon) return;
      if (state.danmakuPos === 'top') {
        posIcon.innerHTML = '<path d="M4 8h16"></path><path d="m12 4 4 4"></path><path d="m12 4-4 4"></path>';
      } else {
        posIcon.innerHTML = '<path d="M3 12h18"></path><path d="m14 7 5 5-5 5"></path>';
      }
    }

    if (colorBtn) {
      colorBtn.addEventListener('click', function () {
        state.colorIndex = (state.colorIndex + 1) % colors.length;
        syncColor();
      });
    }

    if (posBtn) {
      posBtn.addEventListener('click', function () {
        state.danmakuPos = state.danmakuPos === 'scroll' ? 'top' : 'scroll';
        syncPos();
      });
    }

    syncColor();
    syncPos();
  }

  function bindProxyActions() {
    function bindDesktopAction(fromId, targetSelector, fallbackFns) {
      var from = qs(fromId);
      if (!from) return;
      from.addEventListener('click', function () {
        var target = qs(targetSelector);
        if (target) {
          target.click();
          return;
        }
        (fallbackFns || []).some(function (fnName) {
          var fn = window[fnName];
          if (typeof fn === 'function') {
            try {
              fn();
              return true;
            } catch (e) {
              return false;
            }
          }
          return false;
        });
      });
    }

    bindDesktopAction('#mvv-big-play', '#bigPlayBtn', ['togglePlayPause']);
    bindDesktopAction('#mvv-like', '#likeBtn', []);
    bindDesktopAction('#mvv-dislike', '#dislikeBtn', []);
    bindDesktopAction('#mvv-favorite', '#favoriteBtn', []);
    bindDesktopAction('#mvv-download', '#downloadBtn', []);
    var mobileSubscribeBtn = qs('#mvv-subscribe');
    if (mobileSubscribeBtn && mobileSubscribeBtn.dataset.bound !== '1') {
      mobileSubscribeBtn.dataset.bound = '1';
      mobileSubscribeBtn.addEventListener('click', function () {
        var desktopSubscribeBtn = qs('#subscribeBtn');
        if (desktopSubscribeBtn) {
          desktopSubscribeBtn.click();
        }
        setTimeout(refreshFromDesktop, 80);
        setTimeout(refreshFromDesktop, 300);
      });
    }

    function bindPlaylistControlProxy(fromId, toId) {
      var controlBtn = qs(fromId);
      if (!controlBtn || controlBtn.dataset.bound === '1') return;
      controlBtn.dataset.bound = '1';
      controlBtn.addEventListener('click', function () {
        var desktopControl = qs(toId);
        if (desktopControl) desktopControl.click();
        setTimeout(refreshFromDesktop, 70);
        setTimeout(refreshFromDesktop, 260);
      });
    }

    bindPlaylistControlProxy('#mvv-playlist-invert', '#playlistInvertBtn');
    bindPlaylistControlProxy('#mvv-playlist-loop', '#playlistLoopBtn');
    bindPlaylistControlProxy('#mvv-playlist-shuffle', '#playlistShuffleBtn');

    var playlistSourceToggleBtn = qs('#mvv-playlist-source-toggle');
    if (playlistSourceToggleBtn && playlistSourceToggleBtn.dataset.bound !== '1') {
      playlistSourceToggleBtn.dataset.bound = '1';
      playlistSourceToggleBtn.addEventListener('click', function () {
        state.playlistMode = state.playlistMode === 'folder' ? 'site' : 'folder';
        var desktopToggleBtn = qs('#playlistToggle');
        if (desktopToggleBtn) {
          desktopToggleBtn.click();
        }
        if (currentData) {
          currentData.playlistMode = state.playlistMode;
          render(currentData);
        }
        setTimeout(refreshFromDesktop, 90);
        setTimeout(refreshFromDesktop, 300);
      });
    }

    var commentsSortLabelNode = qs('.mvv-comments-sort');
    if (commentsSortLabelNode && commentsSortLabelNode.dataset.bound !== '1') {
      commentsSortLabelNode.dataset.bound = '1';
      commentsSortLabelNode.style.cursor = 'pointer';
      commentsSortLabelNode.addEventListener('click', function () {
        var current = detectCommentsSortValue();
        var raw = window.prompt('Sort: new / old / best / worst', current);
        if (raw === null) return;
        var nextValue = String(raw || '').trim().toLowerCase();
        if (!/^(new|old|best|worst)$/.test(nextValue)) {
          nextValue = current;
        }

        var desktopCommentsSort = qs('#commentsSort');
        if (desktopCommentsSort) {
          desktopCommentsSort.value = nextValue;
          desktopCommentsSort.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          try { localStorage.setItem('youvi_comments_sort', nextValue); } catch (e) {}
        }
        setTimeout(refreshFromDesktop, 80);
      });
    }

    var back = qs('#mvv-back');
    if (back) {
      back.addEventListener('click', function (event) {
        if (window.history.length > 1) {
          event.preventDefault();
          window.history.back();
        }
      });
    }

    var share = qs('#mvv-share');
    if (share) {
      share.addEventListener('click', function () {
        var href = window.location.href;
        if (navigator.share) {
          navigator.share({ title: document.title, url: href }).catch(function () {});
          return;
        }
        window.prompt('Copy video URL:', href);
      });
    }

    var mDanmakuInput = qs('#mvv-danmaku-text');
    var mDanmakuSend = qs('#mvv-danmaku-send');
    function submitDanmaku() {
      var textValue = String((mDanmakuInput && mDanmakuInput.value) || '').trim();
      if (!textValue) return;

      var desktopInput = qs('#danmakuText');
      var desktopSend = qs('#sendDanmaku');
      if (desktopInput && desktopSend) {
        desktopInput.value = textValue;
        desktopInput.dispatchEvent(new Event('input', { bubbles: true }));
        desktopSend.click();
      } else if (typeof window.addDanmakuComment === 'function') {
        try {
          window.addDanmakuComment({
            id: 'm_' + Date.now(),
            text: textValue,
            time: formatSecondsToTimecode(0),
            timestamp: Date.now(),
            position: state.danmakuPos,
            color: ['#ffffff', '#ff4f9f', '#ffcc00', '#00d1ff'][state.colorIndex] || '#ffffff'
          });
        } catch (e) {}
      }

      if (mDanmakuInput) mDanmakuInput.value = '';
      refreshFromDesktop();
    }

    if (mDanmakuInput && mDanmakuSend) {
      mDanmakuSend.addEventListener('click', submitDanmaku);
      mDanmakuInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitDanmaku();
        }
      });
    }

    var cInput = qs('#mvv-comment-input');
    var cSend = qs('#mvv-comment-send');
    if (cInput && cSend) {
      cSend.addEventListener('click', function () {
        var comment = String(cInput.value || '').trim();
        if (!comment) return;
        var nickInput = qs('#nickInput');
        var desktopComment = qs('#commentText');
        var desktopSend = qs('#postComment');
        if (nickInput && !nickInput.value.trim()) {
          nickInput.value = 'Mobile';
        }
        if (desktopComment && desktopSend) {
          desktopComment.value = comment;
          desktopSend.click();
        }
        cInput.value = '';
        refreshFromDesktop();
      });
    }
  }

  function bindCommentReplyActions() {
    var host = qs('#mvv-comments');
    if (!host || host.dataset.replyBound === '1') return;
    host.dataset.replyBound = '1';

    host.addEventListener('click', function (event) {
      var loadMoreBtn = event.target.closest('[data-action="comments-more"]');
      if (loadMoreBtn) {
        event.preventDefault();
        if (state.commentsLoadMoreInFlight) return;

        var loadedCount = getDesktopRenderedCommentsCount();
        var currentVisible = Math.max(MOBILE_COMMENTS_BATCH_SIZE, Number(state.commentsVisibleCount) || MOBILE_COMMENTS_BATCH_SIZE);
        if (loadedCount > currentVisible) {
          state.commentsVisibleCount = Math.min(loadedCount, currentVisible + MOBILE_COMMENTS_BATCH_SIZE);
          if (currentData) render(currentData);
          return;
        }

        var desktopBtn = qs('.comments-show-more-lazy');
        if (desktopBtn && !desktopBtn.disabled) {
          state.commentsLoadMoreInFlight = true;
          var prevCount = getDesktopRenderedCommentsCount();
          state.commentsVisibleCount = currentVisible + MOBILE_COMMENTS_BATCH_SIZE;
          if (currentData) render(currentData);
          desktopBtn.click();
          scheduleCommentsRefreshAfterDesktopLoad(prevCount);
        } else {
          state.commentsLoadMoreInFlight = false;
          refreshFromDesktop();
        }
        return;
      }

      var likeBtn = event.target.closest('[data-action="like"], .mvv-comment-like-btn');
      if (likeBtn) {
        var replyItem = likeBtn.closest('.mvv-comment-item.mvv-reply');
        var commentItem = likeBtn.closest('.mvv-comment-item:not(.mvv-reply)');
        var parentCommentId = replyItem ? String(replyItem.getAttribute('data-parent-comment-id') || '') : '';
        var replyId = replyItem ? String(replyItem.getAttribute('data-reply-id') || '') : '';
        var commentIdForLike = commentItem ? String(commentItem.getAttribute('data-comment-id') || '') : '';

        if (replyId && typeof window.toggleReplyLike === 'function') {
          try { window.toggleReplyLike(replyId); } catch (e) {}
        } else if (commentIdForLike && typeof window.toggleLike === 'function') {
          try { window.toggleLike(commentIdForLike); } catch (e) {}
        }

        var countNode = likeBtn.parentNode ? likeBtn.parentNode.querySelector('.mvv-comment-like-count') : null;
        if (countNode) {
          var currentCount = Number(String(countNode.textContent || '0').replace(/\D+/g, '')) || 0;
          countNode.textContent = String(currentCount + 1);
        }
        likeBtn.classList.add('active');

        if (replyId && parentCommentId && currentData && Array.isArray(currentData.comments)) {
          var pcIdx = currentData.comments.findIndex(function (c) { return String(c.id) === parentCommentId; });
          if (pcIdx >= 0 && Array.isArray(currentData.comments[pcIdx].replies)) {
            var prIdx = currentData.comments[pcIdx].replies.findIndex(function (r) { return String(r.id) === replyId; });
            if (prIdx >= 0) currentData.comments[pcIdx].replies[prIdx].likes = Number(currentData.comments[pcIdx].replies[prIdx].likes || 0) + 1;
          }
        }
        if (commentIdForLike && currentData && Array.isArray(currentData.comments)) {
          var cIdx = currentData.comments.findIndex(function (c) { return String(c.id) === commentIdForLike; });
          if (cIdx >= 0) currentData.comments[cIdx].likes = Number(currentData.comments[cIdx].likes || 0) + 1;
        }

        setTimeout(refreshFromDesktop, 100);
        return;
      }

      var toggleRepliesBtn = event.target.closest('[data-action="toggle-replies"]');
      if (toggleRepliesBtn) {
        var toggleId = String(toggleRepliesBtn.getAttribute('data-comment-id') || '');
        if (!toggleId) return;
        state.openReplies[toggleId] = !state.openReplies[toggleId];
        if (currentData) render(currentData);
        return;
      }

      var replyBtn = event.target.closest('[data-action="reply"]');
      if (replyBtn) {
        var commentId = String(replyBtn.getAttribute('data-comment-id') || '');
        if (!commentId) return;
        state.replyTargetId = commentId;
        state.replyToReplyId = null;
        state.replyToNick = '';
        state.replyDraftText = '';
        if (currentData) render(currentData);
        setTimeout(function () {
          var input = qs('#mvv-inline-reply-input');
          if (input) input.focus();
        }, 0);
        return;
      }

      var replyToReplyBtn = event.target.closest('[data-action="reply-to-reply"]');
      if (replyToReplyBtn) {
        var parentCommentId = String(replyToReplyBtn.getAttribute('data-comment-id') || '');
        var replyId = String(replyToReplyBtn.getAttribute('data-reply-id') || '');
        var replyNick = String(replyToReplyBtn.getAttribute('data-reply-nick') || '').trim();
        if (!parentCommentId || !replyId) return;
        state.openReplies[parentCommentId] = true;
        state.replyTargetId = parentCommentId;
        state.replyToReplyId = replyId;
        state.replyToNick = replyNick;
        state.replyDraftText = '';
        if (currentData) render(currentData);
        setTimeout(function () {
          var input = qs('#mvv-inline-reply-input');
          if (input) {
            input.focus();
            input.selectionStart = input.value.length;
            input.selectionEnd = input.value.length;
          }
        }, 0);
        return;
      }

      var cancelBtn = event.target.closest('[data-action="cancel-reply"]');
      if (cancelBtn) {
        state.replyTargetId = null;
        state.replyToReplyId = null;
        state.replyToNick = '';
        state.replyDraftText = '';
        if (currentData) render(currentData);
        return;
      }

      var sendBtn = event.target.closest('[data-action="send-reply"]');
      if (sendBtn) {
        var targetId = String(sendBtn.getAttribute('data-comment-id') || '');
        var replyText = String(state.replyDraftText || '').trim();
        if (!targetId || !replyText) return;

        var nickInput = qs('#nickInput');
        if (nickInput && !nickInput.value.trim()) {
          nickInput.value = 'Mobile';
        }

        if (state.replyToReplyId) {
          var replyIdTarget = String(state.replyToReplyId);
          if (typeof window.toggleReplyToReplyForm === 'function') {
            try { window.toggleReplyToReplyForm(replyIdTarget); } catch (e) {}
          }

          var desktopReplyToReplyText = document.getElementById('replyToReplyText_' + replyIdTarget);
          var desktopReplyToReplyNick = document.getElementById('replyToReplyNick_' + replyIdTarget);
          if (desktopReplyToReplyNick && !desktopReplyToReplyNick.value.trim()) {
            desktopReplyToReplyNick.value = (nickInput && nickInput.value.trim()) || 'Mobile';
          }

          var replyTextForDesktop = replyText;
          if (state.replyToNick) {
            var nickBare = String(state.replyToNick).replace(/\s\((ка|ka)\)$/i, '').trim();
            var escapedNick = nickBare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            replyTextForDesktop = replyTextForDesktop.replace(new RegExp('^@' + escapedNick + '\\s+', 'i'), '');
          }

          if (desktopReplyToReplyText && typeof window.addReplyToReply === 'function') {
            desktopReplyToReplyText.value = replyTextForDesktop;
            try { window.addReplyToReply(replyIdTarget); } catch (e) {}
          } else {
            var localList = currentData && currentData.comments ? currentData.comments : [];
            var localIdx = localList.findIndex(function (c) { return String(c.id) === targetId; });
            if (localIdx >= 0) {
              if (!Array.isArray(localList[localIdx].replies)) localList[localIdx].replies = [];
              localList[localIdx].replies.push({ id: 'm_' + Date.now(), nick: 'Mobile', text: replyText, likes: 0, dateText: 'now' });
            }
          }
        } else {
          if (typeof window.toggleReplyForm === 'function') {
            try { window.toggleReplyForm(targetId); } catch (e) {}
          }

          var desktopReplyText = document.getElementById('replyText_' + targetId);
          var desktopReplyNick = document.getElementById('replyNick_' + targetId);
          if (desktopReplyNick && !desktopReplyNick.value.trim()) {
            desktopReplyNick.value = (nickInput && nickInput.value.trim()) || 'Mobile';
          }

          if (desktopReplyText && typeof window.addReply === 'function') {
            desktopReplyText.value = replyText;
            try { window.addReply(targetId); } catch (e) {}
          } else {
            var list = currentData && currentData.comments ? currentData.comments : [];
            var idx = list.findIndex(function (c) { return String(c.id) === targetId; });
            if (idx >= 0) {
              if (!Array.isArray(list[idx].replies)) list[idx].replies = [];
              list[idx].replies.push({ id: 'm_' + Date.now(), nick: 'Mobile', text: replyText, likes: 0, dateText: 'now' });
            }
          }
        }

        state.replyTargetId = null;
        state.replyToReplyId = null;
        state.replyToNick = '';
        state.replyDraftText = '';
        setTimeout(refreshFromDesktop, 120);
      }
    });

    host.addEventListener('input', function (event) {
      var input = event.target.closest('#mvv-inline-reply-input');
      if (!input) return;
      state.replyDraftText = String(input.value || '');
    });

    host.addEventListener('keydown', function (event) {
      var input = event.target.closest('#mvv-inline-reply-input');
      if (!input) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        var send = host.querySelector('[data-action="send-reply"]');
        if (send) send.click();
      }
    });
  }

  function bindDescriptionToggle() {
    var toggle = qs('#mvv-desc-toggle');
    var card = qs('#mvv-desc-card');
    if (!toggle || !card) return;
    toggle.addEventListener('click', function () {
      card.classList.toggle('collapsed');
    });
  }

  function runFollowTimers() {
    if (state.transcriptTimer) clearInterval(state.transcriptTimer);
    if (state.danmakuTimer) clearInterval(state.danmakuTimer);
    state.transcriptTimer = null;
    state.danmakuTimer = null;

    // PC "follow" highlights by currentTime (not by cycling an index).
    // Rebind once to video timeupdate.
    if (state.followTimeUpdateBound) return;
    state.followTimeUpdateBound = true;

    var video = getBridgedVideo();
    if (!video) {
      // Video may not be bridged yet; retry shortly.
      setTimeout(function () { runFollowTimers(); }, 350);
      return;
    }

    var lastFollowUpdateAt = 0;
    function findClosestIndex(lines, currentTimeSeconds, toleranceSeconds) {
      if (!Array.isArray(lines) || !lines.length) return -1;
      var bestIdx = -1;
      var bestDiff = toleranceSeconds;
      for (var i = 0; i < lines.length; i++) {
        var sec = lines[i] && lines[i].timeSeconds;
        if (!Number.isFinite(sec)) continue;
        var diff = Math.abs(sec - currentTimeSeconds);
        if (diff <= bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    function updateFromVideoTime() {
      if (!document.body.classList.contains('youvi-mobile-mode')) return;
      if (!currentData) return;
      var t = Number(video.currentTime);
      if (!Number.isFinite(t)) return;

      if (state.followTranscript && Array.isArray(currentData.transcript) && currentData.transcript.length) {
        var ti = findClosestIndex(currentData.transcript, t, 1.6);
        if (ti >= 0 && ti !== state.transcriptIndex) {
          state.transcriptIndex = ti;
          updateTranscriptUI();
        }
      }

      if (state.followDanmaku && Array.isArray(currentData.danmaku) && currentData.danmaku.length) {
        var di = findClosestIndex(currentData.danmaku, t, 2.0);
        if (di >= 0 && di !== state.danmakuIndex) {
          state.danmakuIndex = di;
          updateDanmakuUI();
        }
      }
    }

    video.addEventListener('timeupdate', function () {
      var now = Date.now();
      if (now - lastFollowUpdateAt < 240) return;
      lastFollowUpdateAt = now;
      updateFromVideoTime();
    }, { passive: true });

    // Ensure follow updates even when user scrubs while paused.
    video.addEventListener('seeked', function () {
      updateFromVideoTime();
    }, { passive: true });
  }

  function bindStickyPlayer() {
    if (stickyBound) return;
    stickyBound = true;

    var player = qs('#mvv-player');
    var placeholder = qs('#mvv-player-placeholder');
    if (!player || !placeholder) return;

    var followThresholdY = 0;
    var followReleaseY = 0;

    function syncMetrics() {
      var root = qs('#mvv-root');
      if (!root) return;
      var rect = root.getBoundingClientRect();
      document.documentElement.style.setProperty('--mvv-fixed-width', rect.width + 'px');
      document.documentElement.style.setProperty('--mvv-fixed-left', rect.left + 'px');

      var topBar = qs('.mvv-top');
      var topHeight = topBar ? topBar.offsetHeight : 52;
      var triggerAnchor = qs('.mvv-danmaku-box') || qs('.mvv-section-nav') || player;
      var anchorBottom = window.scrollY + triggerAnchor.getBoundingClientRect().bottom;
      followThresholdY = Math.max(0, anchorBottom - topHeight - 2);
      followReleaseY = Math.max(0, anchorBottom - topHeight + 14);
    }

    function update() {
      updateStickyPlayer();
    }

    function updateStickyPlayerInternal() {
      var mobileMode = document.body.classList.contains('youvi-mobile-mode');
      if (!mobileMode) {
        state.playerFollowing = false;
      } else {
        syncMetrics();
        var y = Number(window.scrollY) || 0;
        // When scrolling down past a threshold, enable following.
        // When scrolling back up a bit, disable to avoid sticking forever.
        if (!state.playerFollowing && y >= followThresholdY) {
          state.playerFollowing = true;
        } else if (state.playerFollowing && y <= followReleaseY) {
          state.playerFollowing = false;
        }
      }

      player.classList.toggle('following', state.playerFollowing);
      placeholder.classList.toggle('active', state.playerFollowing);
      placeholder.style.height = state.playerFollowing ? player.offsetHeight + 'px' : '0px';
      // Used by sticky tabs so they remain visible under the fixed player.
      try {
        document.documentElement.style.setProperty('--mvv-follow-player-height', state.playerFollowing ? (player.offsetHeight + 'px') : '0px');
      } catch (e) {}
    }

    updateStickyPlayer = updateStickyPlayerInternal;

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  var updateStickyPlayer = function () {};

  function updateTranscriptUI() {
    if (!currentData || !Array.isArray(currentData.transcript)) return;
    var transcriptHost = qs('#mvv-transcript');
    if (!transcriptHost) return;
    var idx = state.transcriptIndex;
    var desiredCount = currentData.transcript.length;
    var existingCount = transcriptHost.querySelectorAll('.mvv-line').length;

    // Rebuild only if structure doesn't match (first render / data swap).
    if (existingCount !== desiredCount) {
      transcriptHost.innerHTML = (currentData.transcript || []).map(function (line, i) {
        var active = i === idx ? ' active' : '';
        return '<div class="mvv-line' + active + '" data-i="' + i + '"><span>' +
          escapeHtml(line.time) + '</span><span>' + escapeHtml(line.text) + '</span></div>';
      }).join('');
      return;
    }

    // Otherwise, just toggle active class (no auto-scroll).
    var prev = transcriptHost.querySelector('.mvv-line.active');
    if (prev) prev.classList.remove('active');
    var next = transcriptHost.querySelector('.mvv-line[data-i="' + idx + '"]');
    if (next) next.classList.add('active');
  }

  function updateDanmakuUI() {
    if (!currentData || !Array.isArray(currentData.danmaku)) return;
    var danmakuHost = qs('#mvv-danmaku-list');
    if (!danmakuHost) return;
    var idx = state.danmakuIndex;
    var desiredCount = currentData.danmaku.length;
    var existingCount = danmakuHost.querySelectorAll('.mvv-line').length;

    if (existingCount !== desiredCount) {
      danmakuHost.innerHTML = (currentData.danmaku || []).map(function (line, i) {
        var active = i === idx ? ' active' : '';
        return '<div class="mvv-line' + active + '" data-i="' + i + '"><span>' +
          escapeHtml(line.time) + '</span><span>' + escapeHtml(line.text) + '</span></div>';
      }).join('');
      return;
    }

    var prev = danmakuHost.querySelector('.mvv-line.active');
    if (prev) prev.classList.remove('active');
    var next = danmakuHost.querySelector('.mvv-line[data-i="' + idx + '"]');
    if (next) next.classList.add('active');
  }

  function stopMiniPlayerGuard() {
    if (!state.miniPlayerGuardTimer) return;
    clearInterval(state.miniPlayerGuardTimer);
    state.miniPlayerGuardTimer = null;
  }

  function guardMiniPlayerForMobile() {
    if (!document.body || !document.body.classList.contains('youvi-mobile-mode')) {
      stopMiniPlayerGuard();
      return;
    }

    var enforceNow = function () {
      var handled = false;
      if (typeof window.blockMiniPlayer === 'function') {
        try {
          window.blockMiniPlayer();
          handled = true;
        } catch (e) {}
      }
      if (typeof window.deactivateMiniPlayer === 'function') {
        try {
          window.deactivateMiniPlayer();
          handled = true;
        } catch (e) {}
      }
      return handled;
    };

    if (enforceNow()) {
      stopMiniPlayerGuard();
      return;
    }

    if (state.miniPlayerGuardTimer) return;
    state.miniPlayerGuardTimer = setInterval(function () {
      if (!document.body || !document.body.classList.contains('youvi-mobile-mode')) {
        stopMiniPlayerGuard();
        return;
      }
      if (enforceNow()) {
        stopMiniPlayerGuard();
      }
    }, 300);
  }

  function enforceBasicMobilePlayerState() {
    if (!document.body.classList.contains('youvi-mobile-mode')) return;

    var body = document.body;

    if (body.classList.contains('cinema-mode') && typeof window.toggleCinemaMode === 'function') {
      try { window.toggleCinemaMode(); } catch (e) {}
    }

    body.classList.remove('cinema-mode');
    body.classList.remove('cinema-mode-entering');
    body.classList.remove('wide-screen-mode');
    body.classList.remove('sidebar-open');
    body.classList.remove('sidebar-collapsed');
    body.classList.remove('error-state');
    document.documentElement.classList.remove('cinema-mode');

    try { localStorage.setItem('youvi_wide_mode', 'false'); } catch (e) {}

    // Mini-player can load later and steal #video into a hidden floating root.
    // Keep it blocked while adaptive mobile mode is active.
    guardMiniPlayerForMobile();

    var wideBtn = qs('#wideModeBtn');
    if (wideBtn && wideBtn.classList.contains('active')) {
      try { wideBtn.click(); } catch (e) {}
    }

    var videoPlayer = qs('.video-player');
    if (videoPlayer) videoPlayer.classList.remove('error-state');

    var videoContainer = qs('#videoContainer');
    if (videoContainer) {
      videoContainer.classList.remove('fullscreen');

      var mainVideo = qs('#video');
      if (mainVideo && !videoContainer.contains(mainVideo)) {
        try { videoContainer.appendChild(mainVideo); } catch (e) {}
      }

      var danmakuOverlay = qs('#danmakuOverlay');
      if (danmakuOverlay && !videoContainer.contains(danmakuOverlay)) {
        try { videoContainer.appendChild(danmakuOverlay); } catch (e) {}
      }

      // Subtitles overlay container may get attached to the "desktop" container,
      // which is hidden in mobile mode. Re-attach it into the bridged container.
      var subtitleContainer = qs('.subtitle-container');
      var bridgedVideoContainer = qs('#mvv-player-bridge #videoContainer') ||
        qs('#mvv-player-bridge .video-container') ||
        videoContainer;
      if (subtitleContainer && bridgedVideoContainer && !bridgedVideoContainer.contains(subtitleContainer)) {
        try { bridgedVideoContainer.appendChild(subtitleContainer); } catch (e) {}
      }
    }
  }

  function getBridgedVideo() {
    return qs('#mvv-player-bridge video') || qs('#videoContainer video') || qs('#video');
  }

  function seekVideoBy(deltaSeconds) {
    var video = getBridgedVideo();
    if (!video) return;
    var delta = Number(deltaSeconds) || 0;
    if (!Number.isFinite(delta) || !delta) return;
    var duration = Number(video.duration);
    var current = Number(video.currentTime) || 0;
    var next = current + delta;
    if (Number.isFinite(duration) && duration > 0) {
      next = Math.max(0, Math.min(duration, next));
    } else {
      next = Math.max(0, next);
    }
    video.currentTime = next;
  }

  function toggleBridgedPlayback() {
    var video = getBridgedVideo();
    if (!video) return;
    if (video.paused || video.ended) {
      var p = video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {});
      }
    } else {
      video.pause();
    }
  }

  function bindPlayerTouchControls() {
    var player = qs('#mvv-player');
    if (!player || player.dataset.touchBound === '1') return;
    player.dataset.touchBound = '1';

    player.addEventListener('click', function (event) {
      if (!document.body.classList.contains('youvi-mobile-mode')) return;

      var blocked = event.target.closest('button,a,input,textarea,.video-controls,#progressBarContainer,.control-bar,.timeline-container');
      if (blocked) return;

      var rect = player.getBoundingClientRect();
      if (!rect.width) return;
      var x = event.clientX - rect.left;
      var ratio = x / rect.width;

      if (ratio <= 0.28) {
        seekVideoBy(-10);
      } else if (ratio >= 0.72) {
        seekVideoBy(10);
      } else {
        toggleBridgedPlayback();
      }
    }, { passive: true });
  }

  function bridgeDesktopPlayer() {
    var host = qs('#mvv-player-bridge');
    var mvvPlayer = qs('#mvv-player');
    var source = qs('.video-player');
    if (!host || !mvvPlayer || !source) return;

    enforceBasicMobilePlayerState();

    if (!desktopPlayerBridge.mounted) {
      desktopPlayerBridge.sourceNode = source;
      desktopPlayerBridge.sourceParent = source.parentNode;
      desktopPlayerBridge.sourceNextSibling = source.nextSibling;
      host.appendChild(source);
      desktopPlayerBridge.mounted = true;
    }

    bindPlayerTouchControls();
    mvvPlayer.classList.add('bridged');
  }

  function restoreDesktopPlayer() {
    if (!desktopPlayerBridge.mounted || !desktopPlayerBridge.sourceNode || !desktopPlayerBridge.sourceParent) return;
    var parent = desktopPlayerBridge.sourceParent;
    var node = desktopPlayerBridge.sourceNode;
    var next = desktopPlayerBridge.sourceNextSibling;
    if (next && next.parentNode === parent) {
      parent.insertBefore(node, next);
    } else {
      parent.appendChild(node);
    }
    desktopPlayerBridge.mounted = false;

    var mvvPlayer = qs('#mvv-player');
    if (mvvPlayer) {
      mvvPlayer.classList.remove('bridged');
    }
  }

  function refreshFromDesktop() {
    var now = Date.now();
    if (now - state.lastDesktopRefreshAt < 180) {
      return;
    }
    state.lastDesktopRefreshAt = now;

    ensureDbPlaylistsLoaded();

    if (!qsa('#commentsList .comment-item').length && typeof window.renderComments === 'function') {
      try { window.renderComments(); } catch (e) {}
    }
    if (!qsa('#transcriptList .transcript-cue-item, #transcriptList .transcript-line').length && typeof window.refreshTranscriptTracks === 'function') {
      try { window.refreshTranscriptTracks(); } catch (e) {}
    }

    currentData = buildData();
    state.lastPlaybackClockSignature = (currentData.currentTime || '0:00') + '|' + (currentData.duration || '0:00');
    enforceBasicMobilePlayerState();
    if (isMobileTypingActive()) return;
    render(currentData);
    updateStickyPlayer();
  }

  function bindDesktopSync() {
    if (mutationObserver) return;

    var roots = [
      qs('#videoTitle'),
      qs('#videoViews'),
      qs('#videoLikes'),
      qs('#videoDate'),
      qs('#uploaderName'),
      qs('#uploaderAvatar'),
      qs('#subscribeBtn'),
      qs('#playlistToggle'),
      qs('#playlistInvertBtn'),
      qs('#playlistLoopBtn'),
      qs('#playlistShuffleBtn'),
      qs('#commentsSort'),
      qs('#descriptionText'),
      qs('#videoTags'),
      qs('#playlistContent'),
      qs('#childVideosCarousel'),
      qs('#parentVideosCarousel'),
      qs('#currentPlaylistCarousel'),
      qs('#folderPlaylistCarousel'),
      qs('#recommendationsSidebar')
    ].filter(Boolean);

    if (!roots.length) return;
    // Avoid rebuilding mobile UI on every tiny comment/metadata DOM mutation.
    var refreshDebounced = debounce(refreshFromDesktop, 260);
    mutationObserver = new MutationObserver(function () {
      if (!document.body.classList.contains('youvi-mobile-mode')) return;
      refreshDebounced();
    });

    roots.forEach(function (root) {
      mutationObserver.observe(root, { childList: true, subtree: true, characterData: true, attributes: false });
    });

    refreshTimer = setInterval(function () {
      if (!document.body.classList.contains('youvi-mobile-mode')) return;
      var now = Date.now();
      syncPlaybackClockOnly();

      // Parent/child hydration: keep trying in mobile mode even if desktop carousel
      // was not visible yet and did not trigger its own lazy preview pipeline.
      if (now - state.lastParentChildQueueAt >= 3000) {
        state.lastParentChildQueueAt = now;
        if (typeof window.getPreviewAndDuration === 'function' && currentData) {
          var pcItems = [];
          if (Array.isArray(currentData.childVideos) && currentData.childVideos.length) {
            pcItems = pcItems.concat(currentData.childVideos);
          }
          if (Array.isArray(currentData.parentVideos) && currentData.parentVideos.length) {
            pcItems = pcItems.concat(currentData.parentVideos);
          }
          if (pcItems.length) {
            queueParentChildPreviewLoading(pcItems);
          }
        }
      }

      // Hydration fallback: if playlist still shows placeholders, retry a few full syncs.
      if (now - state.lastPlaylistHydrationCheckAt >= 4000) {
        state.lastPlaylistHydrationCheckAt = now;
        if (typeof window.getPreviewAndDuration === 'function') {
          var incomplete = hasIncompleteVisiblePlaylistItems();
          if (!incomplete) {
            state.playlistHydrationAttempts = 0;
          } else if (state.playlistHydrationAttempts < 8 && (now - state.lastPlaylistHydrationRefreshAt >= 2800)) {
            state.lastPlaylistHydrationRefreshAt = now;
            state.playlistHydrationAttempts += 1;
            refreshFromDesktop();
          }
        }
      }
    }, 1000);
  }

  function mount() {
    if (mounted || !window.YouviMobileVideoTemplate) return;

    var mountPoint = document.createElement('div');
    mountPoint.id = 'youviMobileVideoMount';
    mountPoint.innerHTML = window.YouviMobileVideoTemplate.getMarkup();
    document.body.appendChild(mountPoint);

    currentData = buildData();
    render(currentData);

    bindNav();
    bindProxyActions();
    bindCommentReplyActions();
    bindDanmakuInput();
    bindDanmakuListInteractions();
    bindTranscriptListInteractions();
    bindDescriptionToggle();
    bindDescriptionTimecodes();
    bindPlayerTouchControls();
    bindMobileKeyboardGuard();
    bindStickyPlayer();
    bindDesktopSync();
    runFollowTimers();

    mounted = true;
  }

  function syncMode() {
    var width = window.innerWidth || 0;
    var isMobile = width <= PHONE_BREAKPOINT;
    document.body.classList.toggle('youvi-mobile-mode', isMobile);
    if (isMobile) {
      // Disable PC danmaku/transcript follow auto-scroll while mobile UI is used.
      try {
        var danmakuTab = document.getElementById('danmakuTabContent');
        var transcriptTab = document.getElementById('transcriptTabContent');

        if (!state.desktopFollowBackup) {
          state.desktopFollowBackup = {
            danmakuTabWasActive: !!(danmakuTab && danmakuTab.classList.contains('active')),
            transcriptTabWasActive: !!(transcriptTab && transcriptTab.classList.contains('active')),
            danmakuFollowEnabled: (typeof window._danmakuFollowEnabled !== 'undefined') ? window._danmakuFollowEnabled : null
          };
        }

        if (danmakuTab) danmakuTab.classList.remove('active');
        if (transcriptTab) transcriptTab.classList.remove('active');
        if (typeof window._danmakuFollowEnabled !== 'undefined') window._danmakuFollowEnabled = false;
      } catch (e) {}

      guardMiniPlayerForMobile();
      enforceBasicMobilePlayerState();
      bridgeDesktopPlayer();
      refreshFromDesktop();
    } else {
      // Restore PC follow state when leaving mobile mode.
      try {
        if (state.desktopFollowBackup) {
          var danmakuTab2 = document.getElementById('danmakuTabContent');
          var transcriptTab2 = document.getElementById('transcriptTabContent');
          if (danmakuTab2 && state.desktopFollowBackup.danmakuTabWasActive) danmakuTab2.classList.add('active');
          if (transcriptTab2 && state.desktopFollowBackup.transcriptTabWasActive) transcriptTab2.classList.add('active');
          if (typeof window._danmakuFollowEnabled !== 'undefined' && state.desktopFollowBackup.danmakuFollowEnabled !== null) {
            window._danmakuFollowEnabled = state.desktopFollowBackup.danmakuFollowEnabled;
          }
          state.desktopFollowBackup = null;
        }
      } catch (e) {}

      stopMiniPlayerGuard();
      var pipActive = !!(window.documentPiPManager && window.documentPiPManager.pipWindow);
      if (!pipActive && typeof window.unblockMiniPlayer === 'function') {
        try { window.unblockMiniPlayer(); } catch (e) {}
      }
      restoreDesktopPlayer();
      state.playerFollowing = false;
      updateStickyPlayer();
    }
  }

  function init() {
    ensureDbPlaylistsLoaded();
    syncMode();
    mount();
    syncMode();
    clearMobilePrebootClass();
    window.addEventListener('resize', syncMode);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

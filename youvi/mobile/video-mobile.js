(function () {
  'use strict';

  var PHONE_BREAKPOINT = 760;
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
    replyToNick: ''
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
        type: tagTypeFromCode(code),
        code: code
      };
    }).filter(Boolean);
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

  function extractComments() {
    var list = qs('#commentsList');
    if (!list) {
      return [];
    }

    function extractReplies(commentItem) {
      return qsa('.reply-item', commentItem).slice(0, 20).map(function (reply, ridx) {
        return {
          id: reply.getAttribute('data-reply-id') || ('r' + ridx),
          nick: cleanText((qs('.reply-nick,.comment-author', reply) || {}).textContent || 'User'),
          text: (qs('.reply-text,.comment-text', reply) || {}).textContent || '',
          likes: Number(((qs('.like-count,.comment-like-count', reply) || {}).textContent || '0').replace(/\D+/g, '')) || 0,
          dateText: cleanText((qs('.reply-date,.comment-date', reply) || {}).textContent || '')
        };
      }).filter(function (x) { return x.text || x.nick; });
    }

    return qsa('.comment-item', list).slice(0, 30).map(function (item, idx) {
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
      return { time: String(t).trim(), text: String(x).trim() };
    }).filter(function (x) { return x.text; }).slice(0, 120);
  }

  function extractDanmakuPrint() {
    var nodes = qsa('#danmakuCommentsList .danmaku-comment-item');
    return nodes.map(function (n) {
      var t = (qs('.danmaku-comment-time', n) || {}).textContent || '00:00';
      var x = (qs('.danmaku-comment-text', n) || {}).textContent || n.textContent || '';
      return { time: String(t).trim(), text: String(x).trim() };
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

  function extractPlaylists() {
    var rows = qsa('#currentPlaylistCarousel .video-card, #folderPlaylistCarousel .video-card').slice(0, 20);
    return rows.map(function (item) {
      var titleValue = textFrom(item, '.video-card-title') || 'Playlist video';
      var meta = textFrom(item, '.video-category') || '';
      var duration = textFrom(item, '.video-duration') || '0:00';
      return { title: titleValue, meta: meta, duration: normalizeDuration(duration) };
    });
  }

  function extractParentChildList(carouselSelector) {
    var container = qs(carouselSelector);
    if (!container) return [];

    var items = qsa('.pc-video-card, .video-card, .related-video, .related-item', container).slice(0, 24);
    return items.map(function (item) {
      var titleValue = textFrom(item, '.pc-video-title a') || textFrom(item, '.pc-video-title') || textFrom(item, '.video-card-title') || textFrom(item, '.related-title') || textFrom(item, '.video-title');
      var metaValue = textFrom(item, '.pc-video-meta') || textFrom(item, '.video-category') || textFrom(item, '.video-channel') || textFrom(item, '.video-stats') || '';
      var durationValue = textFrom(item, '.pc-video-duration') || textFrom(item, '.video-duration') || textFrom(item, '.related-duration') || '0:00';
      var linkNode = qs('.pc-video-title a', item) || qs('a', item);
      var hrefValue = linkNode ? String(linkNode.getAttribute('href') || '#') : '#';

      return {
        title: titleValue || 'Video',
        meta: metaValue,
        duration: normalizeDuration(durationValue),
        href: hrefValue || '#'
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
    var durationText = normalizeDuration((text('#timeDisplay').split('/')[1] || '').trim() || (cv && cv.duration) || '0:00');

    return {
      title: titleValue,
      uploader: uploader,
      views: viewsText,
      likes: likesText,
      dislikes: dislikesText,
      likesCount: firstNumberFromText(likesText),
      dislikesCount: firstNumberFromText(dislikesText),
      date: text('#videoDate') || 'Today',
      quality: qualityText,
      duration: durationText,
      descriptionHtml: readDescriptionHtml(),
      tags: tags,
      comments: extractComments(),
      transcript: extractTranscript(),
      danmaku: extractDanmakuPrint(),
      related: extractRelated(),
      playlists: extractPlaylists(),
      childVideos: extractParentChildList('#childVideosCarousel'),
      parentVideos: extractParentChildList('#parentVideosCarousel')
    };
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
    setText('#mvv-uploader', data.uploader);
    setText('#mvv-views', data.views);
    setText('#mvv-like-count', String(data.likesCount || 0));
    setText('#mvv-dislike-count', String(data.dislikesCount || 0));
    setText('#mvv-date', data.date);
    setText('#mvv-quality', data.quality);
    setText('#mvv-duration', data.duration);
    setText('#mvv-time-label', '0:00 / ' + data.duration);
    setHtml('#mvv-description', data.descriptionHtml || 'No description');

    var avatar = qs('#mvv-avatar');
    if (avatar) {
      avatar.textContent = getInitial(data.uploader);
      avatar.style.background = stringToColor(data.uploader);
      avatar.style.color = '#fff';
    }

    var tagsHost = qs('#mvv-tags');
    if (tagsHost) {
      tagsHost.innerHTML = (data.tags || []).slice(0, 24).map(function (tag) {
        var typeClass = 'mvv-tag-type-' + escapeHtml(tag.type || 'general');
        return '<span class="mvv-tag ' + typeClass + '">' + escapeHtml(tag.label || '') + '</span>';
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

    var playlistsHost = qs('#mvv-playlists');
    if (playlistsHost) {
      playlistsHost.innerHTML = (data.playlists || []).map(function (it) {
        return '<a class="mvv-playlist-item" href="#"><div class="mvv-thumb"><span class="mvv-thumb-badge">' + escapeHtml(it.duration) + '</span></div><div><div class="mvv-playlist-title">' + escapeHtml(it.title) + '</div><div class="mvv-playlist-meta">' + escapeHtml(it.meta) + '</div></div></a>';
      }).join('');
    }

    var commentsHost = qs('#mvv-comments');
    if (commentsHost) {
      var upvoteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l-8 8h6v8h4v-8h6z"></path></svg>';
      commentsHost.innerHTML = (data.comments || []).map(function (c, idx) {
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
            return '<article class="mvv-comment-item mvv-reply" data-reply-id="' + escapeHtml(replyId) + '" data-parent-comment-id="' + escapeHtml(commentId) + '"><div class="mvv-comment-avatar" style="background:' + stringToColor(rn) + ';color:#fff;">' + escapeHtml(getInitial(rn)) + '</div><div class="mvv-comment-content"><div class="mvv-comment-header"><span class="mvv-comment-author">' + escapeHtml(rn) + '</span></div><p class="mvv-comment-text">' + escapeHtml(r.text || '') + '</p><div class="mvv-comment-actions"><span class="mvv-comment-meta">' + escapeHtml(formatCommentTime(r.dateText || '')) + '</span><button class="mvv-comment-action" data-action="reply-to-reply" data-comment-id="' + escapeHtml(commentId) + '" data-reply-id="' + escapeHtml(replyId) + '" data-reply-nick="' + escapeHtml(rn) + '" type="button">Reply</button></div>' + inlineReplyToReplyHtml + '</div><div class="mvv-comment-like-stack"><button class="mvv-comment-like-btn" type="button" data-action="like" aria-label="Upvote">' + upvoteIcon + '</button><span class="mvv-comment-like-count">' + (Number(r.likes) || 0) + '</span></div></article>';
          }).join('') + '</div>';
        }

        return '<article class="mvv-comment-item" data-comment-id="' + escapeHtml(commentId) + '"><div class="mvv-comment-avatar" style="background:' + stringToColor(c.nick) + ';color:#fff;">' + escapeHtml(getInitial(c.nick)) + '</div><div class="mvv-comment-content"><div class="mvv-comment-header"><span class="mvv-comment-author">' + escapeHtml(c.nick) + '</span></div><p class="mvv-comment-text">' + escapeHtml(c.text) + '</p><div class="mvv-comment-actions"><span class="mvv-comment-meta">' + escapeHtml(formatCommentTime(c.dateText)) + '</span><button class="mvv-comment-action" data-action="reply" data-comment-id="' + escapeHtml(commentId) + '" type="button">Reply</button></div></div><div class="mvv-comment-like-stack"><button class="mvv-comment-like-btn" type="button" data-action="like" aria-label="Upvote">' + upvoteIcon + '</button><span class="mvv-comment-like-count">' + (Number(c.likes) || 0) + '</span></div>' + (inlineReplyHtml || repliesHtml ? '<div class="mvv-comment-thread">' + inlineReplyHtml + repliesHtml + '</div>' : '') + '</article>';
      }).join('');
      if (!data.comments || !data.comments.length) {
        commentsHost.innerHTML = '<p class="mvv-comments-empty">No comments yet.</p>';
      }
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
  }

  function cardHtml(item) {
    return '<a class="mvv-pc-card" href="' + escapeHtml(item.href || '#') + '"><div class="mvv-thumb"><span class="mvv-thumb-badge">' + escapeHtml(item.duration) + '</span></div><div class="mvv-pc-name">' + escapeHtml(item.title || item.name || 'Video') + '</div><div class="mvv-pc-meta">' + escapeHtml(item.meta || '') + '</div></a>';
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

    if (typeof window.seekToTime === 'function') {
      try { window.seekToTime(s); return; } catch (e) {}
    }
    if (typeof window.seekTo === 'function') {
      try { window.seekTo(s); return; } catch (e) {}
    }

    var directVideo = qs('#videoContainer video') || qs('#mvv-player-bridge video') || qs('video');
    if (directVideo) {
      try {
        directVideo.currentTime = s;
        return;
      } catch (e) {}
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
      updateStickyPlayer();
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
    bindDesktopAction('#mvv-subscribe', '#subscribeBtn', []);

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

    state.transcriptTimer = setInterval(function () {
      var data = currentData;
      if (!state.followTranscript || !data.transcript || !data.transcript.length) return;
      state.transcriptIndex = (state.transcriptIndex + 1) % data.transcript.length;
      render(data);
    }, 1800);

    state.danmakuTimer = setInterval(function () {
      var data = currentData;
      if (!state.followDanmaku || !data.danmaku || !data.danmaku.length) return;
      state.danmakuIndex = (state.danmakuIndex + 1) % data.danmaku.length;
      render(data);
    }, 1800);
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
      syncMetrics();
      if (!mobileMode) {
        state.playerFollowing = false;
      } else {
        state.playerFollowing = false;
      }

      player.classList.toggle('following', state.playerFollowing);
      placeholder.classList.toggle('active', state.playerFollowing);
      placeholder.style.height = state.playerFollowing ? player.offsetHeight + 'px' : '0px';
    }

    updateStickyPlayer = updateStickyPlayerInternal;

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  var updateStickyPlayer = function () {};

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

    var wideBtn = qs('#wideModeBtn');
    if (wideBtn && wideBtn.classList.contains('active')) {
      try { wideBtn.click(); } catch (e) {}
    }

    var videoPlayer = qs('.video-player');
    if (videoPlayer) videoPlayer.classList.remove('error-state');

    var videoContainer = qs('#videoContainer');
    if (videoContainer) {
      videoContainer.classList.remove('fullscreen');
      var overlay = qs('#videoOverlay', videoContainer) || qs('.video-overlay', videoContainer);
      if (overlay) {
        overlay.style.display = 'none';
        overlay.style.opacity = '0';
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
    if (!qsa('#commentsList .comment-item').length && typeof window.renderComments === 'function') {
      try { window.renderComments(); } catch (e) {}
    }
    if (!qsa('#transcriptList .transcript-cue-item, #transcriptList .transcript-line').length && typeof window.refreshTranscriptTracks === 'function') {
      try { window.refreshTranscriptTracks(); } catch (e) {}
    }

    currentData = buildData();
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
      qs('#descriptionText'),
      qs('#videoTags'),
      qs('#commentsList'),
      qs('#transcriptList'),
      qs('#danmakuCommentsList'),
      qs('#childVideosCarousel'),
      qs('#parentVideosCarousel'),
      qs('#currentPlaylistCarousel'),
      qs('#folderPlaylistCarousel'),
      qs('#recommendationsSidebar')
    ].filter(Boolean);

    if (!roots.length) return;
    var refreshDebounced = debounce(refreshFromDesktop, 120);
    mutationObserver = new MutationObserver(function () {
      if (!document.body.classList.contains('youvi-mobile-mode')) return;
      refreshDebounced();
    });

    roots.forEach(function (root) {
      mutationObserver.observe(root, { childList: true, subtree: true, characterData: true });
    });

    refreshTimer = setInterval(function () {
      if (!document.body.classList.contains('youvi-mobile-mode')) return;
      refreshFromDesktop();
    }, 1200);
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
      enforceBasicMobilePlayerState();
      bridgeDesktopPlayer();
      refreshFromDesktop();
    } else {
      restoreDesktopPlayer();
      state.playerFollowing = false;
      updateStickyPlayer();
    }
  }

  function init() {
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

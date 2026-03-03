(function () {
    if (window.YouviTvMode) return;

    const THEMES = new Set(['blue', 'pink']);
    const SOURCES = new Set(['folder', 'site']);
    const ACTION_ORDER = ['folder', 'site', 'theme', 'exit'];

    const state = {
        enabled: false,
        source: 'folder',
        theme: 'blue',
        focusZone: 'list',
        listIndex: 0,
        actionIndex: 0,
        totalItems: 0,
        playlistData: [],
        lastSignature: '',
        refreshTimer: null,
        clockTimer: null,
        keyHandler: null,
        shell: null,
        refs: {},
        originalPlayer: null
    };

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (ch) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
    }

    function getCurrentVideo() {
        if (window.currentVideo) return window.currentVideo;
        try {
            if (typeof currentVideo !== 'undefined') return currentVideo;
        } catch (_) { }
        return null;
    }

    function getAllVideos() {
        if (Array.isArray(window.allVideos)) return window.allVideos;
        try {
            if (typeof allVideos !== 'undefined' && Array.isArray(allVideos)) return allVideos;
        } catch (_) { }
        return [];
    }

    function getAllPlaylists() {
        try {
            if (typeof allPlaylists !== 'undefined' && Array.isArray(allPlaylists)) return allPlaylists;
        } catch (_) { }
        return [];
    }

    function getPlaylistContext() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('playlist')) {
            return { id: params.get('playlist'), paramName: 'playlist' };
        }
        if (params.get('userPlaylist')) {
            return { id: params.get('userPlaylist'), paramName: 'userPlaylist' };
        }
        return { id: '', paramName: 'playlist' };
    }

    function getVideoTitle(name) {
        if (!name) return 'Untitled';
        if (typeof getFileNameWithoutExtension === 'function') {
            try {
                return getFileNameWithoutExtension(name) || name;
            } catch (_) { }
        }
        return String(name).replace(/\.[^.]+$/, '');
    }

    function applyRatingFilterSafe(videos) {
        if (!Array.isArray(videos)) return [];
        if (typeof applyRatingFilterToList === 'function') {
            try {
                return applyRatingFilterToList(videos, window.currentRatingFilter || 'all') || videos;
            } catch (_) { }
        }
        return videos;
    }

    function sortByNaturalTitle(videos) {
        return videos.slice().sort((a, b) => {
            const aTitle = getVideoTitle(a && a.name ? a.name : '');
            const bTitle = getVideoTitle(b && b.name ? b.name : '');
            return aTitle.localeCompare(bTitle, undefined, { numeric: true, sensitivity: 'base' });
        });
    }

    function buildPlaylistModel() {
        const ctx = getPlaylistContext();
        const current = getCurrentVideo();

        if (state.source === 'site') {
            const playlists = getAllPlaylists();
            const playlist = playlists.find((pl) => String(pl && pl.id) === String(ctx.id));
            const videos = applyRatingFilterSafe(Array.isArray(playlist && playlist.videos) ? playlist.videos : []);
            const title = playlist && playlist.title ? playlist.title : 'Без названия';
            return {
                label: 'ТВ / ВСЕ / ПО НОМЕРУ /',
                meta: `Сайтовый плейлист: ${title}`,
                videos
            };
        }

        const all = getAllVideos();
        const currentDirHandle = current && current.dirHandle ? current.dirHandle : window.currentPlaylistHandle;
        const byFolder = currentDirHandle
            ? all.filter((v) => v && v.name && v.dirHandle === currentDirHandle)
            : all.filter((v) => v && v.name);
        const sorted = sortByNaturalTitle(applyRatingFilterSafe(byFolder));
        const folderName = currentDirHandle && currentDirHandle.name ? currentDirHandle.name : 'Текущая папка';

        return {
            label: 'ТВ / ВСЕ / ПО НОМЕРУ /',
            meta: `Папочный плейлист: ${folderName}`,
            videos: sorted
        };
    }

    function ensureShell() {
        if (state.shell) return state.shell;

        const shell = document.createElement('section');
        shell.className = 'tv-mode-shell';
        shell.id = 'tvModeShell';
        shell.innerHTML = `
            <div class="tv-mode-top">
                <div class="tv-mode-logo">youvi</div>
                <div class="tv-mode-headline">
                    <span id="tvModeLabel" class="tv-mode-path">ТВ / ВСЕ / ПО НОМЕРУ /</span>
                    <small id="tvModeMeta" class="tv-mode-meta"></small>
                </div>
                <div class="tv-mode-time" id="tvModeTime">--:--</div>
            </div>
            <div class="tv-mode-body">
                <div class="tv-mode-side-tab tv-mode-side-tab-left" aria-hidden="true">
                    <span class="arrow">◀</span>
                    <span class="label">НАЗАД</span>
                    <span class="arrow">◀</span>
                </div>
                <aside class="tv-mode-left">
                    <div class="tv-mode-playlist-wrap">
                        <ul class="tv-mode-playlist" id="tvModePlaylist"></ul>
                    </div>
                    <div class="tv-mode-stats" id="tvModeStats"></div>
                    <div class="tv-mode-controls" id="tvModeControls">
                        <button type="button" class="tv-mode-action" data-action="folder">
                            <span class="tv-mode-action-dot dot-red"></span>
                            <span>Папочный плейлист</span>
                        </button>
                        <button type="button" class="tv-mode-action" data-action="site">
                            <span class="tv-mode-action-dot dot-green"></span>
                            <span>Сайтовый плейлист</span>
                        </button>
                        <button type="button" class="tv-mode-action" data-action="theme">
                            <span class="tv-mode-action-dot dot-yellow"></span>
                            <span id="tvModeThemeActionLabel">Тема: синяя</span>
                        </button>
                        <button type="button" class="tv-mode-action" data-action="exit">
                            <span class="tv-mode-action-dot dot-blue"></span>
                            <span>Выйти</span>
                        </button>
                    </div>
                </aside>
                <section class="tv-mode-right">
                    <div class="tv-mode-video-shell">
                        <div class="tv-mode-video-host" id="tvModeVideoHost"></div>
                    </div>
                    <div class="tv-mode-guide" id="tvModeDescription"></div>
                </section>
                <div class="tv-mode-side-tab tv-mode-side-tab-right" aria-hidden="true">
                    <span class="arrow">▶</span>
                    <span class="label">ТВ ГИД</span>
                    <span class="arrow">▶</span>
                </div>
            </div>
        `;

        document.body.appendChild(shell);
        state.shell = shell;
        state.refs = {
            label: shell.querySelector('#tvModeLabel'),
            meta: shell.querySelector('#tvModeMeta'),
            time: shell.querySelector('#tvModeTime'),
            playlist: shell.querySelector('#tvModePlaylist'),
            stats: shell.querySelector('#tvModeStats'),
            controls: shell.querySelector('#tvModeControls'),
            actions: Array.from(shell.querySelectorAll('.tv-mode-action')),
            videoHost: shell.querySelector('#tvModeVideoHost'),
            description: shell.querySelector('#tvModeDescription'),
            themeActionLabel: shell.querySelector('#tvModeThemeActionLabel')
        };

        if (state.refs.playlist) {
            state.refs.playlist.addEventListener('click', (event) => {
                const item = event.target.closest('.tv-mode-item');
                if (!item) return;
                const index = Number(item.dataset.index);
                if (Number.isNaN(index)) return;
                state.listIndex = index;
                state.focusZone = 'list';
                updateFocus();
                playFromIndex(index);
            });
        }

        if (state.refs.controls) {
            state.refs.controls.addEventListener('click', (event) => {
                const btn = event.target.closest('.tv-mode-action');
                if (!btn) return;
                const action = btn.dataset.action;
                const index = ACTION_ORDER.indexOf(action);
                if (index >= 0) {
                    state.actionIndex = index;
                    state.focusZone = 'buttons';
                    updateFocus();
                }
                runAction(action);
            });
        }

        return shell;
    }

    function syncModeButton() {
        const tvBtn = document.getElementById('tvModeBtn');
        if (tvBtn) tvBtn.classList.toggle('active', !!state.enabled);
    }

    function syncTheme() {
        if (!state.shell) return;
        state.shell.classList.toggle('tv-theme-blue', state.theme === 'blue');
        state.shell.classList.toggle('tv-theme-pink', state.theme === 'pink');
        if (state.refs.themeActionLabel) {
            state.refs.themeActionLabel.textContent = state.theme === 'blue' ? 'Тема: синяя' : 'Тема: розовая';
        }
    }

    function syncActions() {
        if (!state.refs.actions) return;
        state.refs.actions.forEach((btn) => {
            const action = btn.dataset.action;
            const active = (action === 'folder' || action === 'site') && action === state.source;
            btn.classList.toggle('is-active', active);
        });
    }

    function updateClock() {
        if (!state.refs.time) return;
        state.refs.time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function syncDescription() {
        if (!state.refs.description) return;
        const titleEl = document.getElementById('videoTitle');
        const dateEl = document.getElementById('videoDate');
        const textEl = document.getElementById('descriptionText');
        const title = (titleEl && titleEl.textContent ? titleEl.textContent : 'Видео').trim();
        const date = (dateEl && dateEl.textContent ? dateEl.textContent : '').trim();
        const descriptionHtml = (textEl && textEl.innerHTML ? textEl.innerHTML.trim() : '') || 'Описание отсутствует.';

        state.refs.description.innerHTML = `
            <div class="tv-mode-guide-current">
                ${escapeHtml(title)}
            </div>
            ${date ? `<div class="tv-mode-guide-note">${escapeHtml(date)}</div>` : ''}
            <div class="tv-mode-guide-text">${descriptionHtml}</div>
        `;
    }

    function signatureForVideos(videos) {
        const current = getCurrentVideo();
        const head = `${state.source}::${current && current.name ? current.name : ''}`;
        const body = videos.map((video) => `${video && video.name ? video.name : ''}`).join('|');
        return `${head}::${body}`;
    }

    function updateStats() {
        if (!state.refs.stats) return;
        const perPage = 14;
        const total = Math.max(0, Number(state.totalItems) || 0);
        const pages = Math.max(1, Math.ceil(total / perPage));
        const currentIndex = state.listIndex >= 0 ? state.listIndex : 0;
        const page = Math.max(1, Math.min(pages, Math.floor(currentIndex / perPage) + 1));
        state.refs.stats.innerHTML = `СТР ${page} ИЗ <strong>${pages}</strong>. НАЙДЕНО <strong>${total}</strong> ЗАПИСЕЙ.`;
    }

    function renderPlaylist(force) {
        if (!state.refs.playlist) return;
        const model = buildPlaylistModel();
        const signature = signatureForVideos(model.videos);
        const current = getCurrentVideo();
        const currentName = current && current.name ? current.name : '';

        state.playlistData = model.videos;
        state.totalItems = model.videos.length;
        if (state.refs.label) state.refs.label.textContent = model.label;
        if (state.refs.meta) state.refs.meta.textContent = model.meta;

        if (!force && signature === state.lastSignature) {
            highlightCurrent(currentName);
            updateFocus();
            return;
        }

        state.lastSignature = signature;
        state.refs.playlist.innerHTML = '';

        if (!model.videos.length) {
            const empty = document.createElement('li');
            empty.className = 'tv-mode-empty';
            empty.textContent = state.source === 'site'
                ? 'Сайтовый плейлист недоступен для этого видео.'
                : 'В папке нет доступных видео.';
            state.refs.playlist.appendChild(empty);
            state.listIndex = -1;
            if (state.focusZone === 'list') state.focusZone = 'buttons';
            updateStats();
            updateFocus();
            return;
        }

        const fragment = document.createDocumentFragment();
        model.videos.forEach((video, index) => {
            const item = document.createElement('li');
            item.className = 'tv-mode-item';
            item.dataset.index = String(index);
            const title = getVideoTitle(video && video.name ? video.name : '');
            item.innerHTML = `
                <span class="tv-mode-item-index">${index + 1}</span>
                <span class="tv-mode-item-icon"></span>
                <span class="tv-mode-item-title">${escapeHtml(title)}</span>
            `;
            if (video && video.name === currentName) {
                item.classList.add('is-current');
            }
            fragment.appendChild(item);
        });

        state.refs.playlist.appendChild(fragment);

        if (state.listIndex < 0 || state.listIndex >= model.videos.length) {
            const currentIdx = model.videos.findIndex((video) => video && video.name === currentName);
            state.listIndex = currentIdx >= 0 ? currentIdx : 0;
        }

        updateStats();
        updateFocus();
    }

    function highlightCurrent(currentName) {
        if (!state.refs.playlist) return;
        state.refs.playlist.querySelectorAll('.tv-mode-item').forEach((item) => {
            const index = Number(item.dataset.index);
            const video = state.playlistData[index];
            item.classList.toggle('is-current', !!video && video.name === currentName);
        });
    }

    function ensureListItemVisible() {
        if (!state.refs.playlist || state.listIndex < 0) return;
        const item = state.refs.playlist.querySelector(`.tv-mode-item[data-index="${state.listIndex}"]`);
        if (item && typeof item.scrollIntoView === 'function') {
            item.scrollIntoView({ block: 'nearest' });
        }
    }

    function updateFocus() {
        if (!state.shell) return;
        state.shell.querySelectorAll('.is-focused').forEach((el) => el.classList.remove('is-focused'));

        if (state.focusZone === 'list' && state.listIndex >= 0) {
            const item = state.refs.playlist && state.refs.playlist.querySelector(`.tv-mode-item[data-index="${state.listIndex}"]`);
            if (item) {
                item.classList.add('is-focused');
                ensureListItemVisible();
            }
        } else if (state.focusZone === 'buttons') {
            const btn = state.refs.actions && state.refs.actions[state.actionIndex];
            if (btn) btn.classList.add('is-focused');
        } else if (state.focusZone === 'video') {
            if (state.refs.videoHost) state.refs.videoHost.classList.add('is-focused');
        } else if (state.focusZone === 'description') {
            if (state.refs.description) state.refs.description.classList.add('is-focused');
        }

        updateStats();
    }

    function getDescriptionScroller() {
        if (!state.refs.description) return null;
        const scroller = state.refs.description.querySelector('.tv-mode-guide-text');
        return scroller || state.refs.description;
    }

    function scrollDescriptionBy(delta) {
        const scroller = getDescriptionScroller();
        if (!scroller) return false;
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const next = Math.max(0, Math.min(maxScroll, scroller.scrollTop + delta));
        scroller.scrollTop = next;
        return true;
    }

    function scrollDescriptionTo(position) {
        const scroller = getDescriptionScroller();
        if (!scroller) return false;
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTop = position === 'end' ? maxScroll : 0;
        return true;
    }

    function setSource(nextSource) {
        if (!SOURCES.has(nextSource)) return;
        state.source = nextSource;
        state.actionIndex = state.source === 'site' ? 1 : 0;
        state.lastSignature = '';
        localStorage.setItem('youvi_tv_source', state.source);
        syncActions();
        syncUrl(true);
        renderPlaylist(true);
        syncDescription();
    }

    function setTheme(nextTheme) {
        if (!THEMES.has(nextTheme)) return;
        state.theme = nextTheme;
        localStorage.setItem('youvi_tv_theme', state.theme);
        syncTheme();
        syncUrl(true);
    }

    function toggleTheme() {
        setTheme(state.theme === 'blue' ? 'pink' : 'blue');
    }

    function runAction(action) {
        switch (action) {
            case 'folder':
                setSource('folder');
                break;
            case 'site':
                setSource('site');
                break;
            case 'theme':
                toggleTheme();
                break;
            case 'exit':
                exitTvMode();
                break;
            default:
                break;
        }
    }

    function buildVideoUrl(video) {
        const ctx = getPlaylistContext();
        let baseUrl;

        if (window.VideoID && typeof window.VideoID.buildVideoUrl === 'function') {
            baseUrl = (state.source === 'site' && ctx.id)
                ? window.VideoID.buildVideoUrl(video.name, ctx.id)
                : window.VideoID.buildVideoUrl(video.name);
        } else {
            const params = new URLSearchParams();
            params.set('name', video.name);
            if (state.source === 'site' && ctx.id) {
                params.set(ctx.paramName, ctx.id);
            }
            baseUrl = `youvi_video.html?${params.toString()}`;
        }

        const target = new URL(baseUrl, window.location.href);
        target.searchParams.set('tv', '1');
        target.searchParams.set('tvTheme', state.theme);
        target.searchParams.set('tvSource', state.source);
        target.searchParams.delete('playlist');
        target.searchParams.delete('userPlaylist');
        if (state.source === 'site' && ctx.id) {
            target.searchParams.set(ctx.paramName, ctx.id);
        }
        return target.toString();
    }

    function playFromIndex(index) {
        const video = state.playlistData[index];
        if (!video || !video.name) return;
        const targetUrl = buildVideoUrl(video);
        window.location.href = targetUrl;
    }

    function togglePlayback() {
        const video = document.getElementById('video');
        if (!video) return;
        if (video.paused || video.ended) {
            video.play().catch(() => { });
        } else {
            video.pause();
        }
    }

    function onArrowUp() {
        if (state.focusZone === 'list') {
            if (state.listIndex > 0) {
                state.listIndex -= 1;
                updateFocus();
            }
            return true;
        }
        if (state.focusZone === 'buttons') {
            state.focusZone = 'description';
            updateFocus();
            return true;
        }
        if (state.focusZone === 'video') {
            state.focusZone = 'list';
            updateFocus();
            return true;
        }
        if (state.focusZone === 'description') {
            return scrollDescriptionBy(-64);
        }
        return false;
    }

    function onArrowDown() {
        if (state.focusZone === 'list') {
            if (state.listIndex < state.playlistData.length - 1) {
                state.listIndex += 1;
                updateFocus();
            } else {
                state.focusZone = 'buttons';
                updateFocus();
            }
            return true;
        }
        if (state.focusZone === 'video') {
            state.focusZone = 'description';
            updateFocus();
            return true;
        }
        if (state.focusZone === 'description') {
            return scrollDescriptionBy(64);
        }
        if (state.focusZone === 'buttons') {
            return true;
        }
        return false;
    }

    function onArrowLeft() {
        if (state.focusZone === 'list') return true;
        if (state.focusZone === 'video') {
            state.focusZone = 'list';
            updateFocus();
            return true;
        }
        if (state.focusZone === 'description') {
            state.focusZone = 'video';
            updateFocus();
            return true;
        }
        if (state.focusZone === 'buttons') {
            state.actionIndex = (state.actionIndex - 1 + ACTION_ORDER.length) % ACTION_ORDER.length;
            updateFocus();
            return true;
        }
        return false;
    }

    function onArrowRight() {
        if (state.focusZone === 'list') {
            state.focusZone = 'video';
            updateFocus();
            return true;
        }
        if (state.focusZone === 'video') {
            state.focusZone = 'description';
            updateFocus();
            return true;
        }
        if (state.focusZone === 'description') {
            state.focusZone = 'buttons';
            updateFocus();
            return true;
        }
        if (state.focusZone === 'buttons') {
            state.actionIndex = (state.actionIndex + 1) % ACTION_ORDER.length;
            updateFocus();
            return true;
        }
        return false;
    }

    function activateFocused() {
        if (state.focusZone === 'list') {
            if (state.listIndex >= 0) {
                playFromIndex(state.listIndex);
            }
            return true;
        }
        if (state.focusZone === 'video') {
            togglePlayback();
            return true;
        }
        if (state.focusZone === 'buttons') {
            const action = ACTION_ORDER[state.actionIndex];
            runAction(action);
            return true;
        }
        if (state.focusZone === 'description') {
            return true;
        }
        return false;
    }

    function keydownHandler(event) {
        if (!state.enabled) return;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
            return;
        }

        let handled = false;
        const code = event.code || '';

        if (code === 'ArrowUp') handled = onArrowUp();
        else if (code === 'ArrowDown') handled = onArrowDown();
        else if (code === 'ArrowLeft') handled = onArrowLeft();
        else if (code === 'ArrowRight') handled = onArrowRight();
        else if (code === 'PageUp') handled = state.focusZone === 'description' ? scrollDescriptionBy(-220) : false;
        else if (code === 'PageDown') handled = state.focusZone === 'description' ? scrollDescriptionBy(220) : false;
        else if (code === 'End') handled = state.focusZone === 'description' ? scrollDescriptionTo('end') : false;
        else if (code === 'Enter' || code === 'NumpadEnter') handled = activateFocused();
        else if (code === 'Escape' || code === 'Backspace' || code === 'BrowserBack') {
            exitTvMode();
            handled = true;
        } else if (code === 'Home' && state.focusZone === 'description') {
            handled = scrollDescriptionTo('start');
        } else if (code === 'KeyY') {
            toggleTheme();
            handled = true;
        } else if (code === 'Home') {
            window.location.href = 'youvi_main.html';
            handled = true;
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }
    }

    function syncUrl(enabled) {
        const url = new URL(window.location.href);
        if (enabled) {
            url.searchParams.set('tv', '1');
            url.searchParams.set('tvTheme', state.theme);
            url.searchParams.set('tvSource', state.source);
        } else {
            url.searchParams.delete('tv');
            url.searchParams.delete('tvTheme');
            url.searchParams.delete('tvSource');
        }
        window.history.replaceState(window.history.state || {}, '', `${url.pathname}${url.search}${url.hash}`);
    }

    function mountPlayer() {
        const playerSection = document.querySelector('.player-section');
        if (!playerSection || !state.refs.videoHost) return false;
        if (!state.originalPlayer) {
            state.originalPlayer = {
                node: playerSection,
                parent: playerSection.parentNode,
                nextSibling: playerSection.nextSibling
            };
        }
        state.refs.videoHost.appendChild(playerSection);
        return true;
    }

    function restorePlayer() {
        if (!state.originalPlayer || !state.originalPlayer.parent || !state.originalPlayer.node) return;
        const node = state.originalPlayer.node;
        const parent = state.originalPlayer.parent;
        const nextSibling = state.originalPlayer.nextSibling;
        if (nextSibling && nextSibling.parentNode === parent) {
            parent.insertBefore(node, nextSibling);
        } else {
            parent.appendChild(node);
        }
    }

    function clearTimers() {
        if (state.clockTimer) {
            clearInterval(state.clockTimer);
            state.clockTimer = null;
        }
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
            state.refreshTimer = null;
        }
    }

    function startTimers() {
        clearTimers();
        updateClock();
        state.clockTimer = setInterval(updateClock, 1000);
        state.refreshTimer = setInterval(() => {
            if (!state.enabled) return;
            renderPlaylist(false);
            syncDescription();
        }, 2000);
    }

    function enterTvMode() {
        if (state.enabled) return;

        if (document.fullscreenElement && document.exitFullscreen) {
            try { document.exitFullscreen(); } catch (_) { }
        }

        try {
            const videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
                videoContainer.classList.remove('fullscreen', 'fs-form-hidden', 'show-cursor', 'hide-cursor');
                videoContainer.style.removeProperty('--fs-form-height');
            }
        } catch (_) { }

        if (document.body.classList.contains('cinema-mode')) {
            const cinemaBtn = document.getElementById('cinemaModeBtn');
            if (cinemaBtn) cinemaBtn.click();
        }

        ensureShell();
        if (!mountPlayer()) {
            if (state.shell) state.shell.remove();
            state.shell = null;
            state.refs = {};
            return;
        }

        document.body.classList.add('tv-mode');
        state.enabled = true;
        state.lastSignature = '';
        state.actionIndex = state.source === 'site' ? 1 : 0;

        syncTheme();
        syncActions();
        renderPlaylist(true);
        syncDescription();

        if (state.playlistData.length > 0) {
            state.focusZone = 'list';
        } else {
            state.focusZone = 'buttons';
        }
        updateFocus();

        if (!state.keyHandler) {
            state.keyHandler = keydownHandler;
            document.addEventListener('keydown', state.keyHandler, true);
        }

        startTimers();
        syncModeButton();
        syncUrl(true);
        window.dispatchEvent(new Event('resize'));
    }

    function exitTvMode() {
        if (!state.enabled) return;
        state.enabled = false;
        clearTimers();

        if (state.keyHandler) {
            document.removeEventListener('keydown', state.keyHandler, true);
            state.keyHandler = null;
        }

        restorePlayer();
        document.body.classList.remove('tv-mode');
        if (state.shell) {
            state.shell.remove();
            state.shell = null;
        }
        state.refs = {};
        state.lastSignature = '';
        syncModeButton();
        syncUrl(false);
        window.dispatchEvent(new Event('resize'));
    }

    function toggleTvMode() {
        if (state.enabled) exitTvMode();
        else enterTvMode();
    }

    function initDefaults() {
        const params = new URLSearchParams(window.location.search);
        const sourceFromUrl = params.get('tvSource');
        const themeFromUrl = params.get('tvTheme');
        const savedSource = localStorage.getItem('youvi_tv_source');
        const savedTheme = localStorage.getItem('youvi_tv_theme');
        const playlistCtx = getPlaylistContext();

        state.source = SOURCES.has(sourceFromUrl)
            ? sourceFromUrl
            : (SOURCES.has(savedSource) ? savedSource : (playlistCtx.id ? 'site' : 'folder'));

        state.theme = THEMES.has(themeFromUrl)
            ? themeFromUrl
            : (THEMES.has(savedTheme) ? savedTheme : 'blue');
    }

    function init() {
        initDefaults();
        syncModeButton();
        const button = document.getElementById('tvModeBtn');
        if (button) {
            button.addEventListener('click', () => {
                toggleTvMode();
            });
        }

        if (new URLSearchParams(window.location.search).get('tv') === '1') {
            setTimeout(() => {
                enterTvMode();
            }, 0);
        }
    }

    window.YouviTvMode = {
        enter: enterTvMode,
        exit: exitTvMode,
        toggle: toggleTvMode,
        setTheme
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

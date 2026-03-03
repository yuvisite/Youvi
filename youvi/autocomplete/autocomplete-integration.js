/**
 * Autocomplete Integration Helper
 * Provides easy integration with YouVi pages
 */

if (typeof AUTOCOMPLETE_INTEGRATION_DEBUG === 'undefined') {
  var AUTOCOMPLETE_INTEGRATION_DEBUG = false;
}

class AutocompleteIntegration {
  constructor() {
    this.autocomplete = null;
    this.initialized = false;
  }

  /**
   * Initialize autocomplete on a search input
   * @param {HTMLInputElement} inputElement - The search input element
   * @param {Object} options - Configuration options
   * @param {FileSystemDirectoryHandle} options.videoDirectoryHandle - Directory handle for videos
   * @param {Array} options.allVideos - Array of all videos
   * @param {Array} options.allPlaylists - Array of all playlists
   * @param {Function} options.onTagSelect - Callback when tag is selected
   * @param {Function} options.onVideoSelect - Callback when video is selected
   * @param {Function} options.onPlaylistSelect - Callback when playlist is selected
   * @param {Function} options.onChannelSelect - Callback when channel is selected
   */
  async init(inputElement, options = {}) {
    if (this.initialized) {
      if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.warn('Autocomplete already initialized');
      return;
    }

    await window.autocompleteCache.init();

    await this.updateCacheIfNeeded(options.allVideos, options.allPlaylists);

    this.autocomplete = new YouviAutocomplete(inputElement, {
      minChars: 1,
      debounceDelay: 150,
      filterResults: options.filterResults,
      videoDirectoryHandle: options.videoDirectoryHandle,
      avatarLoader: this.createAvatarLoader(options.videoDirectoryHandle),
      onSelect: (result) => this.handleSelection(result, options)
    });

    this.initialized = true;
    if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log('Autocomplete initialized successfully');
  }

  /**
   * Update cache if data has changed
   */
  async updateCacheIfNeeded(allVideos, allPlaylists) {
    if (!allVideos || !allPlaylists || (allVideos.length === 0 && allPlaylists.length === 0)) {
      if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log('[AutocompleteIntegration] No data provided, checking cache...');
      
      if (window.autocompleteCache.memoryIndex.videoTitles.size === 0) {
        if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log('[AutocompleteIntegration] Memory index empty, loading from IndexedDB...');
        try {
          await window.autocompleteCache.loadMemoryIndexFromCache();
          if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log('[AutocompleteIntegration] ✅ Memory index loaded from cache');
        } catch (error) {
          if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.error('[AutocompleteIntegration] Failed to load memory index:', error);
        }
      } else {
        if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log('[AutocompleteIntegration] ✅ Using existing memory index');
      }
      return;
    }

    try {
      const isCacheValid = await window.autocompleteCache.isCacheValid(
        allVideos.length,
        allPlaylists.length
      );
      
      if (isCacheValid) {
        if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log('[AutocompleteIntegration] ✅ Using existing cache (valid)');
        return;
      }
      
      if (AUTOCOMPLETE_INTEGRATION_DEBUG) {
        console.log('[AutocompleteIntegration] Updating autocomplete cache with page data...');
        console.log(`[AutocompleteIntegration] Videos: ${allVideos.length}, Playlists: ${allPlaylists.length}`);
      }
      
      if (typeof AutocompleteDataLoader !== 'undefined') {
        AutocompleteDataLoader.clearCache();
        if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log('[AutocompleteIntegration] Cleared AutocompleteDataLoader cache');
      }
      
      const playlistsWithCounts = allPlaylists.map(playlist => ({
        ...playlist,
        videoCount: playlist.videoCount || (playlist.videos ? playlist.videos.length : 0)
      }));
      
      await window.autocompleteCache.updateCache({
        videos: allVideos,
        playlists: playlistsWithCounts
      });
      
      if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log('[AutocompleteIntegration] ✅ Autocomplete cache updated successfully');
    } catch (error) {
      if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.error('[AutocompleteIntegration] Error updating autocomplete cache:', error);
    }
  }

  /**
   * Manually update cache with new data
   */
  async updateCache(allVideos, allPlaylists) {
    if (!allVideos || !allPlaylists) {
      if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.warn('Cannot update cache: missing video or playlist data');
      return;
    }

    try {
      await window.autocompleteCache.updateCache({
        videos: allVideos,
        playlists: allPlaylists
      });
      if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log('Autocomplete cache manually updated');
    } catch (error) {
      console.error('Error updating autocomplete cache:', error);
    }
  }

  /**
   * Handle selection based on type
   */
  handleSelection(result, options) {
    const { type, value } = result;

    switch (type) {
      case 'tag':
        window.location.href = `youvi_search.html?q=${encodeURIComponent(value)}`;
        break;
      
      case 'video':
        window.location.href = window.VideoID 
            ? window.VideoID.buildVideoUrl(value)
            : `youvi_video.html?name=${encodeURIComponent(value)}`;
        break;
      
      case 'playlist':
        window.location.href = `youvi_playlists_view.html?playlistId=${encodeURIComponent(value)}`;
        break;
      
      case 'channel':
        window.location.href = `youvi_ch_view.html?channel=${encodeURIComponent(value)}&tab=home`;
        break;
    }
  }

  /**
   * Create avatar loader function
   */
  createAvatarLoader(videoDirectoryHandle) {
    const avatarCache = new Map();
    
    this.avatarCache = avatarCache;

    const loader = async (channelName) => {
      if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] Loading avatar for channel: ${channelName}`);
      
      const cacheKey = `avatar_${channelName}`;
      if (avatarCache.has(cacheKey)) {
        const cached = avatarCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) {
          if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] Using cached avatar for ${channelName}`);
          return cached.url;
        }
        if (cached.url && cached.url.startsWith('blob:')) {
          URL.revokeObjectURL(cached.url);
        }
        avatarCache.delete(cacheKey);
      }

      if (!videoDirectoryHandle) {
        if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.warn(`[Avatar Loader] No videoDirectoryHandle available`);
        return null;
      }

      try {
        const channelsDir = await videoDirectoryHandle.getDirectoryHandle('.channels', { create: false });
        if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] Found .channels directory`);
        
        const channelDir = await channelsDir.getDirectoryHandle(channelName, { create: false });
        if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] Found channel directory: ${channelName}`);

        try {
          const channelJsonHandle = await channelDir.getFileHandle('channel.json', { create: false });
          const channelJsonFile = await channelJsonHandle.getFile();
          const channelData = JSON.parse(await channelJsonFile.text());
          if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] Loaded channel.json for ${channelName}:`, channelData);

          if (channelData.avatar) {
            const avatarHandle = await channelDir.getFileHandle(channelData.avatar, { create: false });
            const avatarFile = await avatarHandle.getFile();
            const avatarUrl = URL.createObjectURL(avatarFile);
            if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] Loaded avatar from channel.json: ${channelData.avatar}`);
            
            avatarCache.set(cacheKey, {
              url: avatarUrl,
              timestamp: Date.now()
            });
            return avatarUrl;
          }
        } catch (e) {
          if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] No channel.json or avatar field, trying default names`);
          const avatarNames = ['avatar.jpg', 'avatar.png', 'avatar.webp', 'avatar.gif'];
          
          for (const name of avatarNames) {
            try {
              const avatarHandle = await channelDir.getFileHandle(name, { create: false });
              const avatarFile = await avatarHandle.getFile();
              const avatarUrl = URL.createObjectURL(avatarFile);
              if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] Found avatar: ${name}`);
              
              avatarCache.set(cacheKey, {
                url: avatarUrl,
                timestamp: Date.now()
              });
              return avatarUrl;
            } catch (e) {
              continue;
            }
          }
        }
        
        if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] No avatar found for ${channelName}`);
        avatarCache.set(cacheKey, {
          url: null,
          timestamp: Date.now()
        });
        return null;
      } catch (error) {
        if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.warn(`[Avatar Loader] Error loading avatar for ${channelName}:`, error);
        avatarCache.set(cacheKey, {
          url: null,
          timestamp: Date.now()
        });
        return null;
      }
    };
    
    loader.cleanup = () => {
      if (AUTOCOMPLETE_INTEGRATION_DEBUG) console.log(`[Avatar Loader] Cleaning up ${avatarCache.size} cached avatars`);
      for (const cached of avatarCache.values()) {
        if (cached.url && cached.url.startsWith('blob:')) {
          URL.revokeObjectURL(cached.url);
        }
      }
      avatarCache.clear();
    };
    
    return loader;
  }

  /**
   * Destroy autocomplete instance
   */
  destroy() {
    if (this.autocomplete) {
      this.autocomplete.destroy();
      this.autocomplete = null;
      this.initialized = false;
    }
    
    if (this.autocomplete && this.autocomplete.options.avatarLoader?.cleanup) {
      this.autocomplete.options.avatarLoader.cleanup();
    }
    
    if (this.avatarCache) {
      for (const cached of this.avatarCache.values()) {
        if (cached.url && cached.url.startsWith('blob:')) {
          URL.revokeObjectURL(cached.url);
        }
      }
      this.avatarCache.clear();
      this.avatarCache = null;
    }
  }
}

if (typeof window !== 'undefined' && !window.YouviAutocompleteFilterHelper) {
  window.YouviAutocompleteFilterHelper = (function createAutocompleteFilterHelper() {
    const CHANNEL_SUFFIX_RE = /\s*\((?:ka|\u043A\u0430)\)\s*$/i;
    const GENERIC_SUFFIX_RE = /\s*\([a-z0-9\u0400-\u04FF]{2,10}\)\s*$/i;

    function toLowerText(value) {
      return String(value || '').trim().toLowerCase();
    }

    function getVideoName(item) {
      return String((item && (item.name || item.value)) || '').trim();
    }

    function getChannelName(item) {
      return toLowerText((item && (item.name || item.value)) || '');
    }

    function getPlaylistId(item) {
      return String((item && (item.id || item.value || item.playlistId)) || '').trim();
    }

    function getPlaylistTitle(item) {
      return toLowerText((item && (item.title || item.name || item.value)) || '');
    }

    function isChannelTag(tag) {
      const raw = String(tag || '').trim();
      if (!raw) return false;
      return CHANNEL_SUFFIX_RE.test(raw);
    }

    function stripChannelSuffix(tag) {
      return String(tag || '').replace(CHANNEL_SUFFIX_RE, '').trim();
    }

    function extractChannelNames(video) {
      const names = new Set();
      if (!video || typeof video !== 'object') return names;

      const directName = toLowerText(video.channelName);
      if (directName) names.add(directName);

      const tags = Array.isArray(video.tags) ? video.tags : [];
      for (const tag of tags) {
        if (!isChannelTag(tag)) continue;
        const channelName = toLowerText(stripChannelSuffix(tag));
        if (channelName) names.add(channelName);
      }
      return names;
    }

    function collectTagCounts(videos) {
      const counts = new Map();
      for (const video of Array.isArray(videos) ? videos : []) {
        const tags = Array.isArray(video && video.tags) ? video.tags : [];
        for (const rawTag of tags) {
          const tag = String(rawTag || '').trim();
          if (!tag || isChannelTag(tag)) continue;
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
      }
      return counts;
    }

    function tagVisible(tagName, visibleTagCounts) {
      const raw = String(tagName || '').trim();
      if (!raw) return false;
      if (visibleTagCounts.has(raw)) return true;

      const normalized = toLowerText(raw);
      const noSuffix = normalized.replace(GENERIC_SUFFIX_RE, '').trim();
      if (!noSuffix) return false;

      for (const key of visibleTagCounts.keys()) {
        const keyLower = toLowerText(key);
        if (keyLower === noSuffix || keyLower.startsWith(noSuffix + ' (')) return true;
      }
      return false;
    }

    function createPlaylistLookup(playlistsSource) {
      const byId = new Map();
      const byTitle = new Map();
      for (const playlist of Array.isArray(playlistsSource) ? playlistsSource : []) {
        const id = getPlaylistId(playlist);
        const title = getPlaylistTitle(playlist);
        if (id) byId.set(id, playlist);
        if (title) byTitle.set(title, playlist);
      }
      return { byId, byTitle };
    }

    function getPlaylistVideos(playlist) {
      if (!playlist) return [];
      const videos = Array.isArray(playlist.videos) ? playlist.videos : [];
      return videos
        .map(v => (typeof v === 'string' ? v : String((v && (v.name || v.value)) || '').trim()))
        .filter(Boolean);
    }

    function playlistVisible(playlistSuggestion, lookup, allowedVideoNames) {
      const byId = lookup.byId;
      const byTitle = lookup.byTitle;
      const id = getPlaylistId(playlistSuggestion);
      const title = getPlaylistTitle(playlistSuggestion);

      const fullPlaylist = (id && byId.get(id)) || (title && byTitle.get(title)) || playlistSuggestion;
      const playlistVideos = getPlaylistVideos(fullPlaylist);
      if (playlistVideos.length === 0) return false;

      return playlistVideos.some(name => allowedVideoNames.has(name));
    }

    function filterResultsByVisibleVideos(results, visibleVideos, playlistsSource) {
      if (!results || typeof results !== 'object') return results;

      const allowedVideoNames = new Set(
        (Array.isArray(visibleVideos) ? visibleVideos : []).map(v => v && v.name).filter(Boolean)
      );
      const visibleTagCounts = collectTagCounts(visibleVideos);
      const visibleChannels = new Set();
      for (const video of Array.isArray(visibleVideos) ? visibleVideos : []) {
        for (const channel of extractChannelNames(video)) {
          visibleChannels.add(channel);
        }
      }

      const playlistLookup = createPlaylistLookup(playlistsSource);

      return {
        ...results,
        videos: (results.videos || []).filter(v => allowedVideoNames.has(getVideoName(v))),
        tags: (results.tags || [])
          .map(tag => {
            const name = String((tag && (tag.name || tag.value || tag.content || tag.displayName)) || '').trim();
            if (!tagVisible(name, visibleTagCounts)) return null;
            const count = visibleTagCounts.get(name);
            return typeof count === 'number' ? { ...tag, count } : tag;
          })
          .filter(Boolean)
          .sort((a, b) => (b.count || 0) - (a.count || 0)),
        channels: (results.channels || []).filter(ch => visibleChannels.has(getChannelName(ch))),
        playlists: (results.playlists || []).filter(pl => playlistVisible(pl, playlistLookup, allowedVideoNames))
      };
    }

    return {
      filterResultsByVisibleVideos
    };
  })();
}

window.AutocompleteIntegration = AutocompleteIntegration;

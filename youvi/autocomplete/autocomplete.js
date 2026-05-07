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
 * Autocomplete Main Module
 * Handles search input autocomplete with tags, videos, playlists, and channels
 */

if (typeof AUTOCOMPLETE_DEBUG === 'undefined') {
  var AUTOCOMPLETE_DEBUG = false;
}

class YouviAutocomplete {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      minChars: 1,
      debounceDelay: 150,
      onSelect: null,
      filterResults: null,
      avatarLoader: null,
      videoDirectoryHandle: null,
      ...options
    };

    this.dropdown = null;
    this.cache = window.autocompleteCache;
    this.debounceTimer = null;
    this.selectedIndex = -1;
    this.currentResults = null;
    this.isOpen = false;
    
    this.currentSearchId = 0;

    this.init();
  }

  init() {
    if (!this.input) {
      console.error('[Autocomplete] Input element not found');
      return;
    }

    if (!this.input.parentElement) {
      console.error('[Autocomplete] Input element has no parent!', this.input);
      return;
    }

    if (!this.input.parentElement.classList.contains('autocomplete-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'autocomplete-wrapper';
      this.input.parentElement.insertBefore(wrapper, this.input);
      wrapper.appendChild(this.input);
    }

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'autocomplete-dropdown';
    if (!this.input.parentElement) {
      console.error('[Autocomplete] Input parent disappeared before dropdown mount');
      return;
    }
    this.input.parentElement.appendChild(this.dropdown);

    if (AUTOCOMPLETE_DEBUG) console.log('[Autocomplete] Created wrapper and dropdown:', {
      wrapper: this.input.parentElement,
      dropdown: this.dropdown,
      inputParent: this.input.parentElement.className
    });

    this.attachEventListeners();
  }

  attachEventListeners() {
    this.input.addEventListener('input', () => this.handleInput());
    this.input.addEventListener('focus', () => this.handleInput());
    this.input.addEventListener('blur', () => this.handleBlur());
    
    this.input.addEventListener('keydown', (e) => this.handleKeydown(e));

    this.dropdown.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.handleDropdownClick(e);
    });

    document.addEventListener('click', (e) => {
      if (this.input.parentElement && !this.input.parentElement.contains(e.target)) {
        this.close();
      }
    });
  }

  handleInput() {
    const query = this.input.value.trim();

    clearTimeout(this.debounceTimer);

    if (query.length < this.options.minChars) {
      this.close();
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.search(query);
    }, this.options.debounceDelay);
  }

  async search(query) {
    const searchId = ++this.currentSearchId;
    
    try {
      this.showLoading();
      let results = await this.cache.search(query);

      if (typeof this.options.filterResults === 'function') {
        const filteredResults = await this.options.filterResults(results, query);
        if (filteredResults && typeof filteredResults === 'object') {
          results = filteredResults;
        }
      }
      
      if (searchId !== this.currentSearchId) {
        if (AUTOCOMPLETE_DEBUG) console.log(`[Autocomplete] Ignoring outdated search #${searchId}, current is #${this.currentSearchId}`);
        return;
      }
      
      this.currentResults = results;
      this.render(results, query);
    } catch (error) {
      console.error('Autocomplete search error:', error);
      if (searchId === this.currentSearchId) {
        this.close();
      }
    }
  }

  render(results, query) {
    const { tags, videos, playlists, channels } = results;
    
    const limitedResults = {
      tags: tags.slice(0, 8),
      videos: videos.slice(0, 6),
      playlists: playlists.slice(0, 5),
      channels: channels.slice(0, 4)
    };
    
    const hasResults = limitedResults.tags.length || limitedResults.videos.length || 
                       limitedResults.playlists.length || limitedResults.channels.length;

    if (!hasResults) {
      this.renderEmpty();
      return;
    }

    let html = '';

    if (limitedResults.tags.length > 0) {
      html += this.renderSection('Tags', limitedResults.tags.map(tag => 
        this.renderTagItem(tag, query)
      ).join(''));
    }

    if (limitedResults.videos.length > 0) {
      html += this.renderSection('Videos', limitedResults.videos.map(video => 
        this.renderVideoItem(video, query)
      ).join(''));
    }

    if (limitedResults.playlists.length > 0) {
      html += this.renderSection('Playlists', limitedResults.playlists.map(playlist => 
        this.renderPlaylistItem(playlist, query)
      ).join(''));
    }

    if (limitedResults.channels.length > 0) {
      html += this.renderSection('Channels', limitedResults.channels.map(channel => 
        this.renderChannelItem(channel, query)
      ).join(''));
    }

    this.dropdown.innerHTML = html;
    this.selectedIndex = -1;
    this.open();

    if (channels.length > 0 && this.options.avatarLoader) {
      this.loadChannelAvatars(channels);
    }
  }

  renderSection(title, itemsHtml) {
    const i18nKeys = {
      'Tags': 'sidebar.tags',
      'Videos': 'main.videos',
      'Playlists': 'sidebar.playlists',
      'Channels': 'sidebar.channels'
    };
    
    const i18nKey = i18nKeys[title];
    const translatedTitle = (typeof i18n !== 'undefined' && i18nKey) 
      ? i18n.t(i18nKey) 
      : title;
    
    return `
      <div class="autocomplete-section">
        <div class="autocomplete-section-title">${translatedTitle}</div>
        ${itemsHtml}
      </div>
    `;
  }

  renderTagItem(tag, query) {
    const TAG_SUFFIX_TO_PREFIX = {
      'ка': 'channel',
      'ka': 'channel',
      'gt': 'general',
      'ch': 'character',
      'au': 'author',
      'ge': 'genre',
      'tp': 'type',
      'yr': 'year',
      'st': 'studio',
      'ct': 'category',
      'ra': 'rating',
      'at': 'anime',
      'ser': 'serial',
      'mt': 'movie',
      'nat': 'animation'
    };
    
    const TAG_TYPE_COLORS = {
      'ка': '#9ca3af',
      'ka': '#9ca3af',
      'gt': '#6b7280',
      'ch': '#6b9e4d',
      'au': '#ef6c7d',
      'ge': '#6b9bd1',
      'tp': '#f59e6c',
      'yr': '#eab676',
      'st': '#f28b8b',
      'ct': '#67c5d6',
      'ra': '#f5a3c7',
      'at': '#a78bdb',
      'ser': '#8db8d6',
      'mt': '#d4a373',
      'nat': '#9dd6a8'
    };
    
    let searchValue;
    let displayHtml;
    let tagColor = '#ff69b4';
    
    if (tag.prefix && tag.content) {
      searchValue = tag.fullValue || `${tag.prefix}:${tag.content}`;
      const highlightedContent = this.highlightMatch(tag.content, query);
      
      const suffix = this.cache?.TAG_TYPE_MAP?.[tag.prefix];
      if (suffix && TAG_TYPE_COLORS[suffix]) {
        tagColor = TAG_TYPE_COLORS[suffix];
        displayHtml = `<span class="tag-type-badge" style="background: ${tagColor};">${suffix}</span>${highlightedContent}`;
      } else {
        displayHtml = `<span class="tag-prefix">${this.escapeHtml(tag.prefix)}</span>${highlightedContent}`;
      }
    } else {
      const tagName = tag.name;
      const match = tagName.match(/^(.+?)\s*\(([a-zа-я]{2,3})\)$/i);
      
      if (match) {
        const content = match[1].trim();
        const suffix = match[2].toLowerCase();
        const prefix = TAG_SUFFIX_TO_PREFIX[suffix] || 'general';
        
        searchValue = tag.fullValue || tag.prefixValue || `${prefix}:${content}`;
        
        tagColor = TAG_TYPE_COLORS[suffix] || '#6b7280';
        const highlightedContent = this.highlightMatch(content, query);
        displayHtml = `<span class="tag-type-badge" style="background: ${tagColor};">${suffix}</span>${highlightedContent}`;
      } else {
        searchValue = tag.fullValue || tag.prefixValue || tagName;
        displayHtml = this.highlightMatch(tagName, query);
      }
    }
    
    return `
      <div class="autocomplete-item" data-type="tag" data-value="${this.escapeHtml(searchValue)}">
        <div class="autocomplete-item-icon tag-icon" style="color: ${tagColor};"></div>
        <div class="autocomplete-item-content">
          <div class="autocomplete-item-title">${displayHtml}</div>
        </div>
        <div class="autocomplete-item-count">${tag.count}</div>
      </div>
    `;
  }

  renderVideoItem(video, query) {
    const highlightedTitle = this.highlightMatch(video.title, query);
    return `
      <div class="autocomplete-item" data-type="video" data-value="${this.escapeHtml(video.name)}">
        <div class="autocomplete-item-icon video-icon"></div>
        <div class="autocomplete-item-content">
          <div class="autocomplete-item-title">${highlightedTitle}</div>
        </div>
      </div>
    `;
  }

  renderPlaylistItem(playlist, query) {
    const highlightedTitle = this.highlightMatch(playlist.title, query);
    const meta = playlist.channelName ? 
      `${playlist.channelName} · ${playlist.videoCount} videos` :
      `${playlist.videoCount} videos`;
    
    return `
      <div class="autocomplete-item" data-type="playlist" data-value="${playlist.id}">
        <div class="autocomplete-item-icon playlist-icon"></div>
        <div class="autocomplete-item-content">
          <div class="autocomplete-item-title">${highlightedTitle}</div>
          <div class="autocomplete-item-meta">${this.escapeHtml(meta)}</div>
        </div>
      </div>
    `;
  }

  renderChannelItem(channel, query) {
    const highlightedName = this.highlightMatch(channel.name, query);
    const firstLetter = channel.name.charAt(0).toUpperCase();
    
    return `
      <div class="autocomplete-item" data-type="channel" data-value="${this.escapeHtml(channel.name)}">
        <div class="autocomplete-item-avatar" data-channel="${this.escapeHtml(channel.name)}" style="background: #ff69b4; color: white; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center;">
          ${firstLetter}
        </div>
        <div class="autocomplete-item-content">
          <div class="autocomplete-item-title">${highlightedName}</div>
          <div class="autocomplete-item-meta">${channel.videoCount} videos</div>
        </div>
      </div>
    `;
  }

  async loadChannelAvatars(channels) {
    for (const channel of channels) {
      const avatarElement = this.dropdown.querySelector(
        `.autocomplete-item-avatar[data-channel="${channel.name}"]`
      );
      
      if (avatarElement && this.options.avatarLoader) {
        try {
          const avatarUrl = await this.options.avatarLoader(channel.name);
          if (avatarUrl) {
            const img = document.createElement('img');
            img.className = 'autocomplete-item-avatar';
            img.dataset.channel = channel.name;
            img.src = avatarUrl;
            img.alt = channel.name;
            avatarElement.replaceWith(img);
          }
        } catch (error) {
          if (AUTOCOMPLETE_DEBUG) console.error(`Failed to load avatar for ${channel.name}:`, error);
        }
      }
    }
  }

  renderEmpty() {
    this.dropdown.innerHTML = `
      <div class="autocomplete-empty">
        <div style="margin-bottom: 8px;">${typeof i18n !== 'undefined' ? i18n.t('search.noResults', 'Nothing found') : 'Nothing found'}</div>
        <div style="font-size: 12px; opacity: 0.7;">${typeof i18n !== 'undefined' ? i18n.t('search.clickSearchForMore', 'Click "Search" to see more') : 'Click "Search" to see more'}</div>
      </div>
    `;
    this.open();
  }

  showLoading() {
    this.dropdown.innerHTML = '<div class="autocomplete-loading">Поиск...</div>';
    this.open();
  }

  highlightMatch(text, query) {
    const escapedText = this.escapeHtml(text);
    
    let searchPart = query;
    if (query.includes(':')) {
      searchPart = query.split(':').slice(1).join(':');
    }
    
    if (!searchPart) return escapedText;
    
    const escapedQuery = this.escapeHtml(searchPart);
    const safeQuery = escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeQuery})`, 'gi');
    return escapedText.replace(regex, '<span class="autocomplete-highlight">$1</span>');
  }

  handleKeydown(e) {
    const items = Array.from(this.dropdown.querySelectorAll('.autocomplete-item'));
    
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!this.isOpen) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      if (e.key === 'ArrowDown') {
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
      } else {
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
      }
      this.updateSelection(items);
      return;
    }
    
    if (!this.isOpen) return;
    
    switch (e.key) {
      case 'Tab':
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          this.insertItem(items[this.selectedIndex]);
        }
        break;
      
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
          this.selectItem(items[this.selectedIndex]);
        } else {
          this.close();
        }
        break;
      
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }
  
  /**
   * Insert item value into input without navigating (for Tab key)
   */
  insertItem(item) {
    const value = item.dataset.value;
    
    this.input.value = value;
    
    this.input.setSelectionRange(value.length, value.length);
    
    this.close();
    
    this.input.focus();
  }

  updateSelection(items) {
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  handleDropdownClick(e) {
    const item = e.target.closest('.autocomplete-item');
    if (item) {
      this.selectItem(item);
    }
  }

  selectItem(item) {
    const type = item.dataset.type;
    const value = item.dataset.value;

    if (this.options.onSelect) {
      this.options.onSelect({ type, value });
    }

    this.close();
  }

  handleBlur() {
    setTimeout(() => {
      if (!this.dropdown.matches(':hover')) {
        this.close();
      }
    }, 200);
  }

  open() {
    this.dropdown.classList.add('active');
    this.isOpen = true;
  }

  close() {
    this.dropdown.classList.remove('active');
    this.isOpen = false;
    this.selectedIndex = -1;
  }

  destroy() {
    clearTimeout(this.debounceTimer);
    this.dropdown.remove();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

window.YouviAutocomplete = YouviAutocomplete;

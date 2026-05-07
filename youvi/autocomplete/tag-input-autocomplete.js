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
 * Tag Input Autocomplete Module
 * Provides autocomplete for tag input fields (comma-separated tags)
 * Uses tagDatabaseManager for suggestions with color-coded tag types
 */

if (typeof TAG_INPUT_AUTOCOMPLETE_DEBUG === 'undefined') {
  var TAG_INPUT_AUTOCOMPLETE_DEBUG = true;
}

class TagInputAutocomplete {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      minChars: 1,
      debounceDelay: 100,
      maxResults: 10,
      onSelect: null,
      ...options
    };

    this.dropdown = null;
    this.debounceTimer = null;
    this.selectedIndex = -1;
    this.currentResults = [];
    this.isOpen = false;
    this.currentSearchId = 0;

    this.TAG_TYPE_COLORS = {
      'channel': '#9ca3af',
      'general': '#6b7280',
      'character': '#6b9e4d',
      'author': '#ef6c7d',
      'genre': '#6b9bd1',
      'type': '#f59e6c',
      'year': '#eab676',
      'studio': '#f28b8b',
      'category': '#67c5d6',
      'rating': '#f5a3c7',
      'anime': '#a78bdb',
      'serial': '#8db8d6',
      'movie': '#d4a373',
      'animation': '#9dd6a8'
    };

    this.TAG_TYPE_ABBRS = {
      'channel': 'ка',
      'general': 'gt',
      'character': 'ch',
      'author': 'au',
      'genre': 'ge',
      'type': 'tp',
      'year': 'yr',
      'studio': 'st',
      'category': 'ct',
      'rating': 'ra',
      'anime': 'at',
      'serial': 'ser',
      'movie': 'mt',
      'animation': 'nat'
    };
    
    this.TAG_TYPE_MAP = {
      'channel': 'ка',
      'general': 'gt',
      'character': 'ch',
      'author': 'au',
      'artist': 'au',
      'genre': 'ge',
      'type': 'tp',
      'year': 'yr',
      'studio': 'st',
      'category': 'ct',
      'rating': 'ra',
      'anime': 'at',
      'serial': 'ser',
      'movie': 'mt',
      'animation': 'nat',
      'gt': 'gt',
      'ch': 'ch',
      'au': 'au',
      'ar': 'au',
      'ge': 'ge',
      'tp': 'tp',
      'yr': 'yr',
      'st': 'st',
      'ct': 'ct',
      'ra': 'ra',
      'at': 'at',
      'ser': 'ser',
      'mt': 'mt',
      'nat': 'nat',
      'ka': 'ка',
      'ка': 'ка',
      'аниме': 'at',
      'сериал': 'ser',
      'фильм': 'mt',
      'анимация': 'nat',
      'персонаж': 'ch',
      'автор': 'au',
      'жанр': 'ge',
      'тип': 'tp',
      'год': 'yr',
      'студия': 'st',
      'категория': 'ct',
      'рейтинг': 'ra',
      'канал': 'ка'
    };

    this.init();
  }

  init() {
    if (!this.input) {
      console.error('[TagInputAutocomplete] No input element provided');
      return;
    }

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'tag-autocomplete-dropdown';
    
    const isInModal = this.input.closest('.tag-implication-modal, .tag-alias-modal, .modal');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'tag-autocomplete-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'flex';
    wrapper.style.flex = '1';
    wrapper.style.minWidth = '0';
    
    if (isInModal) {
      this.dropdown.style.position = 'fixed';
      this.isInModal = true;
    }
    
    this.input.parentNode.insertBefore(wrapper, this.input);
    wrapper.appendChild(this.input);
    wrapper.appendChild(this.dropdown);

    this.attachEventListeners();
    
    if (TAG_INPUT_AUTOCOMPLETE_DEBUG) {
      console.log('[TagInputAutocomplete] Initialized');
    }
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
      if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
        this.close();
      }
    });
  }

  /**
   * Get the current tag being typed (after last comma)
   */
  getCurrentTag() {
    const value = this.input.value;
    const cursorPos = this.input.selectionStart;
    
    const beforeCursor = value.substring(0, cursorPos);
    const lastCommaIndex = beforeCursor.lastIndexOf(',');
    const currentTag = beforeCursor.substring(lastCommaIndex + 1).trim();
    
    return {
      tag: currentTag,
      startIndex: lastCommaIndex + 1,
      cursorPos: cursorPos
    };
  }

  handleInput() {
    const { tag } = this.getCurrentTag();

    clearTimeout(this.debounceTimer);

    if (tag.length < this.options.minChars) {
      this.close();
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.search(tag);
    }, this.options.debounceDelay);
  }

  /**
   * Parse tag type prefix (e.g., "ct:anime" -> {prefix: "ct", suffix: "ct", value: "anime"})
   */
  parseTagTypePrefix(term) {
    if (TAG_INPUT_AUTOCOMPLETE_DEBUG) {
      console.log(`[TagInputAutocomplete] Parsing term: "${term}"`);
    }
    
    const colonIndex = term.indexOf(':');
    if (colonIndex === -1) {
      if (TAG_INPUT_AUTOCOMPLETE_DEBUG) {
        console.log(`[TagInputAutocomplete] No colon found in term`);
      }
      return null;
    }
    
    const prefix = term.substring(0, colonIndex).toLowerCase();
    const value = term.substring(colonIndex + 1).trim();
    
    if (TAG_INPUT_AUTOCOMPLETE_DEBUG) {
      console.log(`[TagInputAutocomplete] Extracted - prefix: "${prefix}", value: "${value}"`);
    }
    
    const suffix = this.TAG_TYPE_MAP[prefix];
    if (!suffix) {
      if (TAG_INPUT_AUTOCOMPLETE_DEBUG) {
        console.log(`[TagInputAutocomplete] No suffix found for prefix: "${prefix}"`);
        console.log(`[TagInputAutocomplete] Available prefixes:`, Object.keys(this.TAG_TYPE_MAP));
      }
      return null;
    }
    
    if (TAG_INPUT_AUTOCOMPLETE_DEBUG) {
      console.log(`[TagInputAutocomplete] Success - prefix: "${prefix}", suffix: "${suffix}", value: "${value}"`);
    }
    
    return { prefix, suffix, value };
  }

  async search(query) {
    const searchId = ++this.currentSearchId;
    
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      if (TAG_INPUT_AUTOCOMPLETE_DEBUG) {
        console.log('[TagInputAutocomplete] Tag database not loaded');
      }
      this.close();
      return;
    }

    try {
      let results = [];
      
      const tagTypeInfo = this.parseTagTypePrefix(query);
      
      if (tagTypeInfo) {
        if (TAG_INPUT_AUTOCOMPLETE_DEBUG) {
          console.log(`[TagInputAutocomplete] Tag type search: prefix=${tagTypeInfo.prefix}, suffix=${tagTypeInfo.suffix}, value=${tagTypeInfo.value}`);
        }
        results = this.searchTagsByType(tagTypeInfo.suffix, tagTypeInfo.value, tagTypeInfo.prefix);
      } else {
        results = window.tagDatabaseManager.searchTags(query);
      }
      
      if (searchId !== this.currentSearchId) {
        return;
      }
      
      const existingTags = this.getExistingTags();
      let filteredResults = results.filter(tag => {
        const normalized = tag.canonical.toLowerCase();
        return !existingTags.some(existing => existing.toLowerCase() === normalized);
      });

      if (typeof this.options.filterResults === 'function') {
        try {
          const customFiltered = this.options.filterResults(filteredResults, query);
          if (Array.isArray(customFiltered)) {
            filteredResults = customFiltered;
          }
        } catch (filterError) {
          console.warn('[TagInputAutocomplete] filterResults hook failed:', filterError);
        }
      }
      
      this.currentResults = filteredResults.slice(0, this.options.maxResults);
      this.render(this.currentResults, query);
    } catch (error) {
      console.error('[TagInputAutocomplete] Search error:', error);
      this.close();
    }
  }

  /**
   * Get list of tags already entered in input
   */
  getExistingTags() {
    return this.input.value
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }

  render(results, query) {
    if (results.length === 0) {
      this.close();
      return;
    }

    const html = results.map((tag, index) => {
      let highlighted, typeBadge;
      
      if (tag.isTypeSearch && tag.prefix && tag.content) {
        const suffix = this.TAG_TYPE_MAP[tag.prefix];
        const color = this.getTagTypeColorByCode(suffix);
        highlighted = this.highlightMatch(tag.content, query.split(':')[1] || '');
        typeBadge = `<span class="tag-type-badge" style="background: ${color};">${suffix}</span>`;
      } else {
        const parsed = this.parseTagType(tag.canonical);
        highlighted = this.highlightMatch(parsed.content, query);
        typeBadge = parsed.typeCode ? 
          `<span class="tag-type-badge" style="background: ${parsed.color};">${parsed.typeCode}</span>` : '';
      }
      
      return `
        <div class="tag-autocomplete-item ${index === this.selectedIndex ? 'selected' : ''}" 
             data-index="${index}" 
             data-value="${this.escapeHtml(tag.canonical)}">
          ${typeBadge}
          <span class="tag-name">${highlighted}</span>
          <span class="tag-count">${tag.usageCount || 0}</span>
        </div>
      `;
    }).join('');

    this.dropdown.innerHTML = html;
    this.selectedIndex = -1;
    this.open();
  }

  /**
   * Parse tag string to extract type code and color
   * Format: "Content (typeCode)" e.g., "Naruto (at)"
   */
  parseTagType(tagString) {
    if (window.TagTypes && window.TagTypes.parseTag) {
      const parsed = window.TagTypes.parseTag(tagString);
      if (parsed) {
        return {
          content: parsed.content,
          typeCode: parsed.typeCode,
          color: parsed.color
        };
      }
    }
    
    const match = tagString.match(/^(.+?)\s*\(([a-zа-я]{2,3})\)$/iu);
    if (match) {
      const content = match[1].trim();
      const typeCode = match[2].toLowerCase();
      const color = this.getTagTypeColorByCode(typeCode);
      return { content, typeCode, color };
    }
    
    return { content: tagString, typeCode: null, color: '#ff69b4' };
  }

  /**
   * Search tags by type suffix (e.g., "ct" for category, "ch" for character)
   * Returns tags in format compatible with tag database manager
   */
  searchTagsByType(typeSuffix, searchValue, displayPrefix = '') {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      return [];
    }

    const results = [];
    const searchLower = searchValue.toLowerCase();
    
    const allTags = window.tagDatabaseManager.getAllTags();
    
    for (const tag of allTags) {
      const match = tag.canonical.match(/^(.+?)\s*\(([a-zа-я]{2,3})\)$/i);
      if (!match) continue;
      
      const tagContent = match[1].trim();
      const tagSuffix = match[2].toLowerCase();
      
      if (tagSuffix !== typeSuffix) continue;
      
      const tagContentLower = tagContent.toLowerCase();
      
      let matched = false;
      
      if (!searchLower) {
        matched = true;
      } else {
        matched = tagContentLower.includes(searchLower);
        
        if (!matched && tag.aliases) {
          for (const alias of tag.aliases) {
            if (alias.toLowerCase().includes(searchLower)) {
              matched = true;
              break;
            }
          }
        }
      }
      
      if (matched) {
        results.push({
          canonical: tag.canonical,
          usageCount: tag.usageCount || 0,
          displayName: `${displayPrefix}:${tagContent}`,
          isTypeSearch: true,
          prefix: displayPrefix,
          content: tagContent
        });
        
        if (results.length >= 15) break;
      }
    }
    
    results.sort((a, b) => {
      const aExact = a.content.toLowerCase() === searchLower ? 1 : 0;
      const bExact = b.content.toLowerCase() === searchLower ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      
      const aStarts = a.content.toLowerCase().startsWith(searchLower) ? 1 : 0;
      const bStarts = b.content.toLowerCase().startsWith(searchLower) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      
      return b.usageCount - a.usageCount;
    });
    
    return results.slice(0, 10);
  }

  /**
   * Get color by type code (short code like 'gt', 'at', 'ка')
   */
  getTagTypeColorByCode(typeCode) {
    const colors = {
      'ка': '#9ca3af',
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
    return colors[typeCode] || '#ff69b4';
  }

  getTagTypeColor(type) {
    return this.TAG_TYPE_COLORS[type] || '#ff69b4';
  }

  getTypeAbbr(type) {
    return this.TAG_TYPE_ABBRS[type] || type || '';
  }

  highlightMatch(text, query) {
    const escapedText = this.escapeHtml(text);
    if (!query) return escapedText;
    
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeQuery})`, 'gi');
    return escapedText.replace(regex, '<span class="tag-highlight">$1</span>');
  }

  handleKeydown(e) {
    if (!this.isOpen) {
      return;
    }

    const items = this.currentResults;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateSelection();
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateSelection();
        break;
        
      case 'Tab':
      case 'Enter':
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          this.selectItem(items[this.selectedIndex]);
        } else {
          this.close();
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        break;
    }
  }

  updateSelection() {
    const items = this.dropdown.querySelectorAll('.tag-autocomplete-item');
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
    const item = e.target.closest('.tag-autocomplete-item');
    if (item) {
      const index = parseInt(item.dataset.index, 10);
      if (this.currentResults[index]) {
        this.selectItem(this.currentResults[index]);
      }
    }
  }

  selectItem(tag) {
    const { startIndex, cursorPos } = this.getCurrentTag();
    const value = this.input.value;
    
    const afterCursor = value.substring(cursorPos);
    const nextCommaIndex = afterCursor.indexOf(',');
    const endIndex = nextCommaIndex >= 0 ? cursorPos + nextCommaIndex : value.length;
    
    const before = value.substring(0, startIndex);
    const after = value.substring(endIndex);
    
    const prefix = before.length > 0 && !before.endsWith(' ') && before.endsWith(',') ? ' ' : '';
    const newValue = before + prefix + tag.canonical + after;
    
    this.input.value = newValue;
    
    const newCursorPos = before.length + prefix.length + tag.canonical.length;
    this.input.setSelectionRange(newCursorPos, newCursorPos);
    
    if (this.options.onSelect) {
      this.options.onSelect(tag);
    }
    
    this.close();
    this.input.focus();
    
    if (TAG_INPUT_AUTOCOMPLETE_DEBUG) {
      console.log('[TagInputAutocomplete] Selected:', tag.canonical);
    }
  }

  handleBlur() {
    setTimeout(() => {
      if (!this.dropdown.matches(':hover')) {
        this.close();
      }
    }, 150);
  }

  open() {
    if (this.isInModal) {
      this.positionDropdownInModal();
    }
    
    this.dropdown.classList.add('active');
    this.isOpen = true;
  }

  positionDropdownInModal() {
    const rect = this.input.getBoundingClientRect();
    this.dropdown.style.position = 'fixed';
    this.dropdown.style.top = `${rect.bottom}px`;
    this.dropdown.style.left = `${rect.left}px`;
    this.dropdown.style.width = `${rect.width}px`;
    this.dropdown.style.zIndex = '10001';
  }

  close() {
    this.dropdown.classList.remove('active');
    this.isOpen = false;
    this.selectedIndex = -1;
  }

  destroy() {
    clearTimeout(this.debounceTimer);
    if (this.dropdown && this.dropdown.parentNode) {
      const wrapper = this.dropdown.parentNode;
      if (wrapper.classList.contains('tag-autocomplete-wrapper')) {
        wrapper.parentNode.insertBefore(this.input, wrapper);
        wrapper.remove();
      }
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

window.TagInputAutocomplete = TagInputAutocomplete;

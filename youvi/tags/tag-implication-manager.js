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
 * Tag Implication Manager UI Component
 * Manages tag implications with transitive closure and cycle detection
 */

const TAG_IMPL_MGR_DEBUG = false;

class TagImplicationManager {
  constructor(tagDatabaseManager, tagImplicationResolver) {
    this.tagDB = tagDatabaseManager;
    this.resolver = tagImplicationResolver;
    this.modal = null;
    this.currentTag = null;
    this.messageTimeouts = new Set();
    this.addImplicationDebounce = null;
    this.init();
  }

  /**
   * Initialize the implication manager
   */
  init() {
    this.createModal();
    this.attachGlobalListeners();
    if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] ✅ Initialized');
  }

  /**
   * Create the implication management modal
   */
  createModal() {
    const modalHTML = `
      <div id="tagImplicationModal" class="tag-implication-modal" style="display: none;">
        <div class="tag-implication-modal-content">
          <div class="tag-implication-header">
            <h3>Manage Tag Implications</h3>
            <button class="tag-implication-close">&times;</button>
          </div>
          
          <div class="tag-implication-body">
            <div class="current-tag-info">
              <strong>Tag:</strong> <span id="currentImplicationTagName"></span>
            </div>
            
            <div class="implications-section">
              <h4>Direct Implications</h4>
              <div id="implicationsList" class="implications-list">
                <p class="no-implications">No implications yet</p>
              </div>
            </div>
            
            <div class="computed-implications-section">
              <h4>
                All Implied Tags (Transitive)
                <span class="computed-badge" id="computedCount">0</span>
              </h4>
              <div id="computedImplicationsList" class="computed-implications-list">
                <p class="no-computed">No transitive implications</p>
              </div>
            </div>
            
            <div class="add-implication-section">
              <h4>Add New Implication</h4>
              <div class="add-implication-form">
                <input 
                  type="text" 
                  id="newImplicationInput" 
                  placeholder="Enter tag name to imply..." 
                  class="implication-input tag-input"
                />
                <button id="addImplicationBtn" class="btn-add-implication">Add</button>
              </div>
              <p class="implication-hint">
                Implications automatically add related tags (e.g., "windows_7" → "windows" → "os", "microsoft").
                System prevents cycles and computes transitive closure.
              </p>
            </div>
          </div>
          
          <div class="tag-implication-footer">
            <button id="closeImplicationModalBtn" class="btn-close">Close</button>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container.firstElementChild);
    
    this.modal = document.getElementById('tagImplicationModal');
    this.attachModalListeners();
  }

  /**
   * Attach modal event listeners
   */
  attachModalListeners() {
    const closeBtn = this.modal.querySelector('.tag-implication-close');
    const closeFooterBtn = document.getElementById('closeImplicationModalBtn');
    
    closeBtn.addEventListener('click', () => this.closeModal());
    closeFooterBtn.addEventListener('click', () => this.closeModal());
    
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });

    const addBtn = document.getElementById('addImplicationBtn');
    const input = document.getElementById('newImplicationInput');
    
    addBtn.addEventListener('click', () => this.addImplicationDebounced());
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addImplicationDebounced();
      }
    });
    
    this.initializeTagAutocomplete();
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.style.display === 'flex') {
        this.closeModal();
      }
    });
  }

  /**
   * Initialize tag input autocomplete for implication input
   */
  initializeTagAutocomplete() {
    const input = document.getElementById('newImplicationInput');
    
    if (!input) {
      console.warn('[TagImplicationManager] Implication input not found');
      return;
    }
    
    if (typeof TagInputAutocomplete === 'undefined') {
      console.warn('[TagImplicationManager] TagInputAutocomplete not available, retrying...');
      setTimeout(() => this.initializeTagAutocomplete(), 100);
      return;
    }
    
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.warn('[TagImplicationManager] Tag database not ready, retrying...');
      setTimeout(() => this.initializeTagAutocomplete(), 100);
      return;
    }
    
    this.tagAutocomplete = new TagInputAutocomplete(input, {
      minChars: 1,
      debounceDelay: 100,
      maxResults: 10,
      onSelect: (tag) => {
        console.log('[TagImplicationManager] Tag selected:', tag.canonical);
        setTimeout(() => {
          if (input.value.trim() === tag.canonical) {
            this.addImplicationDebounced();
          }
        }, 50);
      }
    });
    
    console.log('[TagImplicationManager] Tag autocomplete initialized successfully');
  }

  /**
   * Debounced add implication to prevent spam
   */
  addImplicationDebounced() {
    if (this.addImplicationDebounce) return;
    
    this.addImplicationDebounce = true;
    this.addImplication();
    
    setTimeout(() => {
      this.addImplicationDebounce = false;
    }, 500);
  }

  /**
   * Attach global listeners for tag elements
   */
  attachGlobalListeners() {
    if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] Global listeners ready');
  }

  /**
   * Open implication modal for a specific tag
   * @param {string} tagName - Tag name to manage implications for
   */
  async openModal(tagName) {
    this.currentTag = tagName;
    let tagData = this.tagDB.getTag(tagName);

    if (!tagData) {
      if (TAG_IMPL_MGR_DEBUG) console.warn('[TagImplicationManager] Tag not found, creating placeholder:', tagName);
      try {
        await this.tagDB.addTag(tagName, {
          usageCount: 0,
          immediate: true
        });
        tagData = this.tagDB.getTag(tagName);
      } catch (error) {
        console.error('[TagImplicationManager] Failed to create placeholder tag:', error);
        return;
      }
    }

    document.getElementById('currentImplicationTagName').textContent = tagData.canonical;
    this.renderImplications(tagData.implies || []);
    this.renderComputedImplications(tagData.canonical);
    
    this.modal.style.display = 'flex';
    document.getElementById('newImplicationInput').focus();
  }

  /**
   * Close the implication modal
   */
  closeModal() {
    this.modal.style.display = 'none';
    this.currentTag = null;
    document.getElementById('newImplicationInput').value = '';
    
    this.messageTimeouts.forEach(timeout => clearTimeout(timeout));
    this.messageTimeouts.clear();
    
    this.modal.querySelectorAll('.implication-message').forEach(msg => msg.remove());
  }

  /**
   * Render the list of direct implications
   * @param {Array} implications - Array of implication tag names
   */
  renderImplications(implications) {
    const listContainer = document.getElementById('implicationsList');
    
    if (!implications || implications.length === 0) {
      listContainer.innerHTML = '<p class="no-implications">No implications yet</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    
    for (const implication of implications) {
      const tagData = this.tagDB.getTag(implication);
      const implItem = document.createElement('div');
      implItem.className = 'implication-item';
      
      const implName = document.createElement('span');
      implName.className = 'implication-name';
      implName.textContent = tagData ? tagData.canonical : implication;
      
      if (tagData && tagData.type) {
        const typeSpan = document.createElement('span');
        typeSpan.className = 'implication-type';
        typeSpan.textContent = tagData.type;
        implName.appendChild(typeSpan);
      }
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove-implication';
      removeBtn.dataset.implication = implication;
      removeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      `;
      
      removeBtn.addEventListener('click', () => this.removeImplication(implication));
      
      implItem.appendChild(implName);
      implItem.appendChild(removeBtn);
      fragment.appendChild(implItem);
    }

    listContainer.innerHTML = '';
    listContainer.appendChild(fragment);
  }

  /**
   * Render computed (transitive) implications
   * @param {string} tagName - Tag name
   */
  renderComputedImplications(tagName) {
    const listContainer = document.getElementById('computedImplicationsList');
    const countBadge = document.getElementById('computedCount');
    
    const allImplied = this.resolver.resolveImplications(tagName);
    const directImplied = new Set(this.resolver.getDirectImplications(tagName).map(t => 
      window.TagDatabaseSchema ? 
        window.TagDatabaseSchema.normalizeTagName(t) : 
        t.toLowerCase()
    ));
    
    const transitiveOnly = Array.from(allImplied).filter(normalized => {
      return !directImplied.has(normalized);
    });
    
    countBadge.textContent = allImplied.size;
    
    if (transitiveOnly.length === 0) {
      listContainer.innerHTML = '<p class="no-computed">No transitive implications</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    
    for (const impliedNormalized of transitiveOnly) {
      const tagData = this.tagDB.database.tags[impliedNormalized];
      if (!tagData) continue;
      
      const tag = document.createElement('span');
      tag.className = 'computed-implication-tag';
      tag.textContent = tagData.canonical;
      tag.title = `Implied transitively through: ${this.getImplicationPath(tagName, tagData.canonical)}`;
      
      fragment.appendChild(tag);
    }

    listContainer.innerHTML = '';
    listContainer.appendChild(fragment);
  }

  /**
   * Get human-readable implication path
   * @param {string} fromTag - Source tag
   * @param {string} toTag - Target tag
   * @returns {string} - Path description
   */
  getImplicationPath(fromTag, toTag) {
    const chain = this.resolver.getImplicationChain(fromTag, toTag);
    if (!chain || chain.length === 0) {
      return 'unknown path';
    }
    return chain.join(' → ');
  }

  /**
   * Add a new implication with validation
   */
  async addImplication() {
    const input = document.getElementById('newImplicationInput');
    const implicationName = input.value.trim();

    if (!implicationName) {
      this.showMessage('Please enter a tag name', 'error');
      return;
    }

    if (!this.currentTag) {
      this.showMessage('No tag selected', 'error');
      return;
    }

    try {
      const tagData = this.tagDB.getTag(this.currentTag);
      
      if (!tagData) {
        this.showMessage('Tag not found in database', 'error');
        return;
      }

      let targetTag = this.tagDB.getTag(implicationName);
      if (!targetTag) {
        if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] Creating new tag:', implicationName);
        await this.tagDB.addTag(implicationName, {
          usageCount: 0,
          immediate: true
        });
        targetTag = this.tagDB.getTag(implicationName);
        
        if (!targetTag) {
          this.showMessage(`Failed to create tag "${implicationName}"`, 'error');
          return;
        }
        
        this.showMessage(`Created new tag: ${implicationName}`, 'info');
      }

      if (tagData.implies.includes(targetTag.canonical)) {
        this.showMessage('This implication already exists', 'warning');
        return;
      }
      
      if (this.resolver.wouldCreateCycle(this.currentTag, targetTag.canonical)) {
        this.showMessage('Cannot add: would create a cycle', 'error');
        return;
      }

      const updatedImplications = [...tagData.implies, targetTag.canonical];
      await this.tagDB.addTag(this.currentTag, {
        implies: updatedImplications,
        immediate: true
      });

      if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] ✅ Added implication:', targetTag.canonical, 'to', this.currentTag);

      this.resolver.invalidateCache();

      await this.applyImplicationsToVideos(this.currentTag);

      this.renderImplications(updatedImplications);
      this.renderComputedImplications(tagData.canonical);
      input.value = '';
      this.showMessage('Implication added and applied to videos', 'success');

      document.dispatchEvent(new CustomEvent('tagImplicationUpdated', {
        detail: { tagName: this.currentTag, implications: updatedImplications }
      }));

      if (window.tagBroadcastSync) {
        window.tagBroadcastSync.broadcast('tag_implication_added', {
          tagName: this.currentTag,
          implications: updatedImplications
        });
        if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] 📡 Broadcasted implication update to other tabs');
      }

    } catch (error) {
      console.error('[TagImplicationManager] ❌ Failed to add implication:', error);
      this.showMessage('Failed to add implication: ' + error.message, 'error');
    }
  }

  /**
   * Remove an implication
   * @param {string} implicationName - Implication to remove
   */
  async removeImplication(implicationName) {
    if (!this.currentTag) return;

    try {
      const tagData = this.tagDB.getTag(this.currentTag);
      
      if (!tagData) {
        this.showMessage('Tag not found in database', 'error');
        return;
      }

      const updatedImplications = tagData.implies.filter(i => i !== implicationName);
      
      const normalized = window.TagDatabaseSchema ? 
        window.TagDatabaseSchema.normalizeTagName(this.currentTag) : 
        this.currentTag.toLowerCase();
      
      if (this.tagDB.database && this.tagDB.database.tags && this.tagDB.database.tags[normalized]) {
        this.tagDB.database.tags[normalized].implies = updatedImplications;
        await this.tagDB.saveDatabase(true);
      } else {
        await this.tagDB.addTag(this.currentTag, {
          implies: updatedImplications,
          immediate: true
        });
      }

      if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] ✅ Removed implication:', implicationName, 'from', this.currentTag);

      this.resolver.invalidateCache();

      await this.removeImplicationsFromVideos(this.currentTag, implicationName);

      this.renderImplications(updatedImplications);
      this.renderComputedImplications(tagData.canonical);
      this.showMessage('Implication removed and updated in videos', 'success');

      document.dispatchEvent(new CustomEvent('tagImplicationUpdated', {
        detail: { tagName: this.currentTag, implications: updatedImplications }
      }));
      
      document.dispatchEvent(new CustomEvent('tagImplicationRemoved', {
        detail: { tagName: this.currentTag, removedImplication: implicationName }
      }));

      if (window.tagBroadcastSync) {
        window.tagBroadcastSync.broadcast('tag_implication_removed', {
          tagName: this.currentTag,
          removedImplication: implicationName,
          implications: updatedImplications
        });
        if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] 📡 Broadcasted implication removal to other tabs');
      }

    } catch (error) {
      console.error('[TagImplicationManager] ❌ Failed to remove implication:', error);
      this.showMessage('Failed to remove implication: ' + error.message, 'error');
    }
  }

  /**
   * Apply implications to all videos that have this tag
   * @param {string} tagName - Tag name
   */
  async applyImplicationsToVideos(tagName) {
    let updatedCount = 0;
    
    if (window.videoManager && window.videoManager.videos) {
      const videos = window.videoManager.videos;

      for (const video of videos) {
        if (!video.tags || !Array.isArray(video.tags)) continue;
        
        const hasTag = video.tags.some(t => {
          const tData = this.tagDB.getTag(t);
          const tagData = this.tagDB.getTag(tagName);
          if (!tData || !tagData) return false;
          return tData.canonical === tagData.canonical;
        });

        if (hasTag) {
          const expandedTags = this.resolver.applyImplications(video.tags);
          
          if (expandedTags.length > video.tags.length) {
            video.tags = expandedTags;
            video._tagsUpdated = true;
            updatedCount++;
          }
        }
      }

      if (updatedCount > 0) {
        if (TAG_IMPL_MGR_DEBUG) console.log(`[TagImplicationManager] ✅ Updated ${updatedCount} videos with new implications`);
        
        if (window.videoManager.saveVideos) {
          await window.videoManager.saveVideos();
        }
      }
    } else {
      if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] VideoManager not available, will update via events');
    }
    
    document.dispatchEvent(new CustomEvent('tagImplicationBulkUpdate', {
      detail: { 
        tagName: tagName,
        updatedCount: updatedCount,
        action: 'apply'
      }
    }));
  }
  
  /**
   * Remove implications from all videos that have this tag
   * @param {string} tagName - Tag name
   * @param {string} removedImplication - The implication that was removed
   */
  async removeImplicationsFromVideos(tagName, removedImplication) {
    let updatedCount = 0;
    
    if (window.videoManager && window.videoManager.videos) {
      const videos = window.videoManager.videos;

      for (const video of videos) {
        if (!video.tags || !Array.isArray(video.tags)) continue;
        
        const hasTag = video.tags.some(t => {
          const tData = this.tagDB.getTag(t);
          const tagData = this.tagDB.getTag(tagName);
          if (!tData || !tagData) return false;
          return tData.canonical === tagData.canonical;
        });

        if (hasTag) {
          const otherTags = video.tags.filter(t => {
            const tData = this.tagDB.getTag(t);
            const tagData = this.tagDB.getTag(tagName);
            if (!tData || !tagData) return t !== tagName;
            return tData.canonical !== tagData.canonical;
          });
          
          const stillImplied = this.resolver.resolveImplicationsBatch(otherTags);
          const removedImplicationNormalized = window.TagDatabaseSchema ? 
            window.TagDatabaseSchema.normalizeTagName(removedImplication) : 
            removedImplication.toLowerCase();
          
          if (!stillImplied.has(removedImplicationNormalized)) {
            const oldLength = video.tags.length;
            video.tags = video.tags.filter(t => {
              const tData = this.tagDB.getTag(t);
              const removedData = this.tagDB.getTag(removedImplication);
              if (!tData || !removedData) return t !== removedImplication;
              return tData.canonical !== removedData.canonical;
            });
            
            if (video.tags.length < oldLength) {
              video._tagsUpdated = true;
              updatedCount++;
            }
          }
        }
      }

      if (updatedCount > 0) {
        if (TAG_IMPL_MGR_DEBUG) console.log(`[TagImplicationManager] ✅ Removed implied tag from ${updatedCount} videos`);
        
        if (window.videoManager.saveVideos) {
          await window.videoManager.saveVideos();
        }
      }
    } else {
      if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] VideoManager not available, will update via events');
    }
    
    document.dispatchEvent(new CustomEvent('tagImplicationBulkUpdate', {
      detail: { 
        tagName: tagName,
        removedImplication: removedImplication,
        updatedCount: updatedCount,
        action: 'remove'
      }
    }));
  }

  /**
   * Show a temporary message
   * @param {string} message - Message text
   * @param {string} type - Message type (success, error, warning, info)
   */
  showMessage(message, type = 'info') {
    const msgDiv = document.createElement('div');
    msgDiv.className = `implication-message implication-message-${type}`;
    msgDiv.textContent = message;
    
    const modalContent = this.modal.querySelector('.tag-implication-modal-content');
    modalContent.appendChild(msgDiv);

    const timeout = setTimeout(() => {
      msgDiv.remove();
      this.messageTimeouts.delete(timeout);
    }, 3000);
    
    this.messageTimeouts.add(timeout);
  }
}

let tagImplicationManager = null;

function initTagImplicationManager() {
  if (window.tagDatabaseManager && 
      window.tagDatabaseManager.isLoaded && 
      window.tagImplicationResolver) {
    tagImplicationManager = new TagImplicationManager(
      window.tagDatabaseManager, 
      window.tagImplicationResolver
    );
    window.tagImplicationManager = tagImplicationManager;
    if (TAG_IMPL_MGR_DEBUG) console.log('[TagImplicationManager] ✅ Ready');
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!initTagImplicationManager()) {
    const tryInit = () => {
      if (initTagImplicationManager()) {
        document.removeEventListener('tagImplicationResolverReady', tryInit);
        document.removeEventListener('tagDatabaseReady', tryInit);
      }
    };
    
    document.addEventListener('tagImplicationResolverReady', tryInit);
    document.addEventListener('tagDatabaseReady', tryInit);
    
    setTimeout(() => {
      if (!window.tagImplicationManager) {
        initTagImplicationManager();
      }
    }, 1000);
  }
});
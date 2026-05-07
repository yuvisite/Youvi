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
 * Tag Alias Manager UI Component
 * Optimized for performance and reliability
 */

const TAG_ALIAS_DEBUG = false;

class TagAliasManager {
  constructor(tagDatabaseManager) {
    this.tagDB = tagDatabaseManager;
    this.modal = null;
    this.currentTag = null;
    this.messageTimeouts = new Set();
    this.addAliasDebounce = null;
    this.init();
  }

  /**
   * Initialize the alias manager
   */
  init() {
    this.createModal();
    this.attachGlobalListeners();
    if (TAG_ALIAS_DEBUG) console.log('[TagAliasManager] ✅ Initialized');
  }

  /**
   * Create the alias management modal
   */
  createModal() {
    const modalHTML = `
      <div id="tagAliasModal" class="tag-alias-modal" style="display: none;">
        <div class="tag-alias-modal-content">
          <div class="tag-alias-header">
            <h3>Manage Tag Aliases</h3>
            <button class="tag-alias-close">&times;</button>
          </div>
          
          <div class="tag-alias-body">
            <div class="current-tag-info">
              <strong>Tag:</strong> <span id="currentTagName"></span>
            </div>
            
            <div class="aliases-section">
              <h4>Current Aliases</h4>
              <div id="aliasesList" class="aliases-list">
                <p class="no-aliases">No aliases yet</p>
              </div>
            </div>
            
            <div class="add-alias-section">
              <h4>Add New Alias</h4>
              <div class="add-alias-form">
                <input 
                  type="text" 
                  id="newAliasInput" 
                  placeholder="Enter alias name..." 
                  class="alias-input"
                />
                <button id="addAliasBtn" class="btn-add-alias">Add</button>
              </div>
              <p class="alias-hint">Aliases help find tags using alternative names (e.g., "Something" → "smth", "Что-то")</p>
            </div>
          </div>
          
          <div class="tag-alias-footer">
            <button id="closeAliasModalBtn" class="btn-close">Close</button>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container.firstElementChild);
    
    this.modal = document.getElementById('tagAliasModal');
    this.attachModalListeners();
  }

  /**
   * Attach modal event listeners
   */
  attachModalListeners() {
    const closeBtn = this.modal.querySelector('.tag-alias-close');
    const closeFooterBtn = document.getElementById('closeAliasModalBtn');
    
    closeBtn.addEventListener('click', () => this.closeModal());
    closeFooterBtn.addEventListener('click', () => this.closeModal());
    
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });

    const addBtn = document.getElementById('addAliasBtn');
    const input = document.getElementById('newAliasInput');
    
    addBtn.addEventListener('click', () => this.addAliasDebounced());
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addAliasDebounced();
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.style.display === 'flex') {
        this.closeModal();
      }
    });
  }

  /**
   * Debounced add alias to prevent spam
   */
  addAliasDebounced() {
    if (this.addAliasDebounce) return;
    
    this.addAliasDebounce = true;
    this.addAlias();
    
    setTimeout(() => {
      this.addAliasDebounce = false;
    }, 500);
  }

  /**
   * Attach global listeners for tag elements
   */
  attachGlobalListeners() {
    if (TAG_ALIAS_DEBUG) console.log('[TagAliasManager] Global listeners ready');
  }

  /**
   * Open alias modal for a specific tag
   * @param {string} tagName - Tag name to manage aliases for
   */
  async openModal(tagName) {
    this.currentTag = tagName;
    let tagData = this.tagDB.getTag(tagName);

    if (!tagData) {
      if (TAG_ALIAS_DEBUG) console.warn('[TagAliasManager] Tag not found, creating placeholder:', tagName);
      try {
        await this.tagDB.addTag(tagName, {
          usageCount: 0,
          immediate: true
        });
        tagData = this.tagDB.getTag(tagName);
      } catch (error) {
        console.error('[TagAliasManager] Failed to create placeholder tag:', error);
        return;
      }
    }

    document.getElementById('currentTagName').textContent = tagData.canonical;
    this.renderAliases(tagData.aliases || []);
    
    this.modal.style.display = 'flex';
    document.getElementById('newAliasInput').focus();
  }

  /**
   * Close the alias modal
   */
  closeModal() {
    this.modal.style.display = 'none';
    this.currentTag = null;
    document.getElementById('newAliasInput').value = '';
    
    this.messageTimeouts.forEach(timeout => clearTimeout(timeout));
    this.messageTimeouts.clear();
    
    this.modal.querySelectorAll('.alias-message').forEach(msg => msg.remove());
  }

  /**
   * Render the list of aliases - optimized escaping
   * @param {Array} aliases - Array of alias strings
   */
  renderAliases(aliases) {
    const listContainer = document.getElementById('aliasesList');
    
    if (!aliases || aliases.length === 0) {
      listContainer.innerHTML = '<p class="no-aliases">No aliases yet</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    
    for (const alias of aliases) {
      const aliasItem = document.createElement('div');
      aliasItem.className = 'alias-item';
      
      const aliasName = document.createElement('span');
      aliasName.className = 'alias-name';
      aliasName.textContent = alias;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove-alias';
      removeBtn.dataset.alias = alias;
      removeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      `;
      
      removeBtn.addEventListener('click', () => this.removeAlias(alias));
      
      aliasItem.appendChild(aliasName);
      aliasItem.appendChild(removeBtn);
      fragment.appendChild(aliasItem);
    }

    listContainer.innerHTML = '';
    listContainer.appendChild(fragment);
  }

  /**
   * Add a new alias with validation
   */
  async addAlias() {
    const input = document.getElementById('newAliasInput');
    const aliasName = input.value.trim();

    if (!aliasName) {
      this.showMessage('Please enter an alias name', 'error');
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

      if (tagData.aliases.includes(aliasName)) {
        this.showMessage('This alias already exists', 'warning');
        return;
      }
      
      const aliasNormalized = aliasName.toLowerCase();
      const conflictTag = this.tagDB.getTag(aliasName);
      if (conflictTag && conflictTag.canonical.toLowerCase() === aliasNormalized) {
        this.showMessage(`Alias conflicts with existing tag: ${conflictTag.canonical}`, 'error');
        return;
      }

      const updatedAliases = [...tagData.aliases, aliasName];
      await this.tagDB.addTag(this.currentTag, {
        aliases: updatedAliases,
        immediate: true
      });

      if (TAG_ALIAS_DEBUG) console.log('[TagAliasManager] ✅ Added alias:', aliasName, 'to', this.currentTag);

      this.renderAliases(updatedAliases);
      input.value = '';
      this.showMessage('Alias added successfully', 'success');

      document.dispatchEvent(new CustomEvent('tagAliasUpdated', {
        detail: { tagName: this.currentTag, aliases: updatedAliases }
      }));

    } catch (error) {
      console.error('[TagAliasManager] ❌ Failed to add alias:', error);
      this.showMessage('Failed to add alias: ' + error.message, 'error');
    }
  }

  /**
   * Remove an alias
   * @param {string} aliasName - Alias to remove
   */
  async removeAlias(aliasName) {
    if (!this.currentTag) return;

    try {
      const tagData = this.tagDB.getTag(this.currentTag);
      
      if (!tagData) {
        this.showMessage('Tag not found in database', 'error');
        return;
      }

      const updatedAliases = tagData.aliases.filter(a => a !== aliasName);
      
      const normalized = window.TagDatabaseSchema ? 
        window.TagDatabaseSchema.normalizeTagName(this.currentTag) : 
        this.currentTag.toLowerCase();
      
      if (this.tagDB.database && this.tagDB.database.tags && this.tagDB.database.tags[normalized]) {
        this.tagDB.database.tags[normalized].aliases = updatedAliases;
        
        if (this.tagDB.updateAliasIndex) {
          this.tagDB.updateAliasIndex(normalized, this.currentTag, updatedAliases);
        }
        
        await this.tagDB.saveDatabase(true);
      } else {
        await this.tagDB.addTag(this.currentTag, {
          aliases: updatedAliases,
          immediate: true,
          replaceAliases: true
        });
      }

      if (TAG_ALIAS_DEBUG) console.log('[TagAliasManager] ✅ Removed alias:', aliasName, 'from', this.currentTag);

      this.renderAliases(updatedAliases);
      this.showMessage('Alias removed successfully', 'success');

      document.dispatchEvent(new CustomEvent('tagAliasUpdated', {
        detail: { tagName: this.currentTag, aliases: updatedAliases }
      }));

    } catch (error) {
      console.error('[TagAliasManager] ❌ Failed to remove alias:', error);
      this.showMessage('Failed to remove alias: ' + error.message, 'error');
    }
  }

  /**
   * Show a temporary message - with timeout tracking
   * @param {string} message - Message text
   * @param {string} type - Message type (success, error, warning)
   */
  showMessage(message, type = 'info') {
    const msgDiv = document.createElement('div');
    msgDiv.className = `alias-message alias-message-${type}`;
    msgDiv.textContent = message;
    
    const modalContent = this.modal.querySelector('.tag-alias-modal-content');
    modalContent.appendChild(msgDiv);

    const timeout = setTimeout(() => {
      msgDiv.remove();
      this.messageTimeouts.delete(timeout);
    }, 3000);
    
    this.messageTimeouts.add(timeout);
  }
}

let tagAliasManager = null;

function initTagAliasManager() {
  if (window.tagDatabaseManager && window.tagDatabaseManager.isLoaded) {
    tagAliasManager = new TagAliasManager(window.tagDatabaseManager);
    window.tagAliasManager = tagAliasManager;
    if (TAG_ALIAS_DEBUG) console.log('[TagAliasManager] ✅ Ready');
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!initTagAliasManager()) {
    const dbReadyListener = () => {
      if (initTagAliasManager()) {
        document.removeEventListener('tagDatabaseReady', dbReadyListener);
      }
    };
    document.addEventListener('tagDatabaseReady', dbReadyListener);
    
    setTimeout(() => {
      if (!window.tagAliasManager) {
        initTagAliasManager();
      }
    }, 1000);
  }
});
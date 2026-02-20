/**
 * Adaptive Grid System for YouVi
 * 
 * Automatically adjusts grid columns based on viewport width
 * while allowing manual user overrides.
 * User preferences reset when viewport size changes.
 */

class AdaptiveGridSystem {
  constructor() {
    this.DEBUG = false;
    
    this.breakpoints = [
      { width: 1800, cols: 6, name: 'ultrawide-6' },
      { width: 1600, cols: 5, name: 'ultrawide' },
      { width: 1400, cols: 5, name: 'wide' },
      { width: 1200, cols: 5, name: 'desktop' }, // 5 cols down to 1200 so right sidebar on 24" doesn't flip to 4
      { width: 1000, cols: 4, name: 'laptop' },
      { width: 850, cols: 4, name: 'tablet-landscape' },
      { width: 650, cols: 3, name: 'tablet' },
      { width: 480, cols: 2, name: 'mobile-large' },
      { width: 360, cols: 2, name: 'mobile' },
      { width: 0, cols: 1, name: 'mobile-small' }
    ];

    this.STORAGE_KEYS = {
      VIDEO_COLS: 'youvi_latest_cols',
      PLAYLIST_COLS: 'youvi_playlist_cols',
      IS_MANUAL_VIDEO: 'youvi_video_manual',
      IS_MANUAL_PLAYLIST: 'youvi_playlist_manual',
      LAST_BREAKPOINT: 'youvi_last_breakpoint'
    };

    this.currentBreakpoint = null;
    this.isInitialized = false;
    
    this.resizeTimer = null;
    this.resizeDelay = 300;

    this.init();
  }

  /**
   * Initialize the adaptive grid system
   */
  init() {
    if (this.isInitialized) return;
    
    this.currentBreakpoint = this.getCurrentBreakpoint();
    localStorage.setItem(this.STORAGE_KEYS.LAST_BREAKPOINT, this.currentBreakpoint.name);

    const lastBreakpoint = localStorage.getItem(this.STORAGE_KEYS.LAST_BREAKPOINT);
    if (lastBreakpoint && lastBreakpoint !== this.currentBreakpoint.name) {
      this.resetToAutoMode();
    }

    this.applyGridSettings();

    window.addEventListener('resize', () => this.handleResize());

    const contentEl = document.querySelector('.main-content') || document.querySelector('.content-wrapper');
    if (contentEl && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.handleResize());
      ro.observe(contentEl);
    }

    this.attachManualControls();

    // When sidebar is toggled, layout changes but resize/ResizeObserver may fire late — refresh so grid switcher (авто) updates
    window.addEventListener('youvi-sidebar-toggle', () => {
      setTimeout(() => this.refreshAfterLayoutChange(), 80);
    });

    // Clean-view toggle: content area grows/shrinks; wait for layout then refresh (avoids stale width when switching to clean)
    window.addEventListener('youvi-clean-view-toggle', () => {
      const run = () => this.refreshAfterLayoutChange();
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(run, 200)));
    });

    this.isInitialized = true;

    // First load: re-measure after layout is ready so right sidebar (tag panel) is taken into account
    const runAfterLayout = () => this.refreshAfterLayoutChange();
    if (document.readyState === 'complete') {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(runAfterLayout, 80)));
    } else {
      window.addEventListener('load', () => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(runAfterLayout, 80)));
      });
    }

    if (this.DEBUG) console.log('[AdaptiveGrid] Initialized with breakpoint:', this.currentBreakpoint.name);
  }

  /**
   * Re-read content width and update breakpoint + UI (e.g. after sidebar or clean-view toggle).
   */
  refreshAfterLayoutChange() {
    const contentEl = document.querySelector('.main-content') || document.querySelector('.content-wrapper');
    if (contentEl) void contentEl.offsetWidth;
    const newBreakpoint = this.getCurrentBreakpoint();
    const prevName = this.currentBreakpoint && this.currentBreakpoint.name;
    this.currentBreakpoint = newBreakpoint;
    if (newBreakpoint.name !== prevName) {
      localStorage.setItem(this.STORAGE_KEYS.LAST_BREAKPOINT, newBreakpoint.name);
      this.resetToAutoMode();
      this.triggerContentRerender();
    }
    this.applyGridSettings();
  }

  /**
   * Get width of the content area (grid container). When sidebar is open this is
   * narrower than the window, so columns adapt to actual space.
   */
  getContentWidth() {
    const el = document.querySelector('.main-content') || document.querySelector('.content-wrapper');
    if (!el) return window.innerWidth;
    if (el.clientWidth > 0) return el.clientWidth;
    void el.offsetWidth;
    return el.clientWidth || window.innerWidth;
  }

  /**
   * Get current breakpoint based on content area width (so sidebar open = fewer cols)
   */
  getCurrentBreakpoint() {
    const width = this.getContentWidth();
    
    for (const breakpoint of this.breakpoints) {
      if (width >= breakpoint.width) {
        return breakpoint;
      }
    }
    
    return this.breakpoints[this.breakpoints.length - 1];
  }

  /**
   * Handle window resize with debouncing
   */
  handleResize() {
    clearTimeout(this.resizeTimer);
    
    this.resizeTimer = setTimeout(() => {
      const newBreakpoint = this.getCurrentBreakpoint();
      const contentW = this.getContentWidth();
      
      if (newBreakpoint.name !== this.currentBreakpoint.name) {
        if (this.DEBUG) console.log('[AdaptiveGrid] Breakpoint changed:', 
          this.currentBreakpoint.name, '→', newBreakpoint.name,
          'Content width:', contentW);
        
        this.currentBreakpoint = newBreakpoint;
        localStorage.setItem(this.STORAGE_KEYS.LAST_BREAKPOINT, newBreakpoint.name);
        
        this.resetToAutoMode();
        
        this.applyGridSettings();
        
        this.triggerContentRerender();
      } else {
        this.currentBreakpoint = newBreakpoint;
        this.applyGridSettings();
      }
    }, this.resizeDelay);
  }

  /**
   * Reset manual mode to automatic
   */
  resetToAutoMode() {
    localStorage.removeItem(this.STORAGE_KEYS.IS_MANUAL_VIDEO);
    localStorage.removeItem(this.STORAGE_KEYS.IS_MANUAL_PLAYLIST);
    
    if (this.DEBUG) console.log('[AdaptiveGrid] Reset to auto mode');
  }

  /**
   * Apply grid settings based on current mode (auto or manual). Clean-view uses same adaptive breakpoints (no forced 6 on small screens).
   */
  applyGridSettings() {
    const isVideoManual = localStorage.getItem(this.STORAGE_KEYS.IS_MANUAL_VIDEO) === 'true';
    let videoCols;

    if (isVideoManual) {
      videoCols = parseInt(localStorage.getItem(this.STORAGE_KEYS.VIDEO_COLS)) || this.currentBreakpoint.cols;
    } else {
      videoCols = this.currentBreakpoint.cols;
      localStorage.setItem(this.STORAGE_KEYS.VIDEO_COLS, videoCols.toString());
    }

    document.documentElement.style.setProperty('--latest-cols', videoCols);

    const isPlaylistManual = localStorage.getItem(this.STORAGE_KEYS.IS_MANUAL_PLAYLIST) === 'true';
    let playlistCols;
    
    if (isPlaylistManual) {
      playlistCols = parseInt(localStorage.getItem(this.STORAGE_KEYS.PLAYLIST_COLS)) || this.currentBreakpoint.cols;
    } else {
      playlistCols = this.currentBreakpoint.cols;
      localStorage.setItem(this.STORAGE_KEYS.PLAYLIST_COLS, playlistCols.toString());
    }

    document.documentElement.style.setProperty('--playlist-cols', playlistCols);

    this.updateControlsUI();

    if (this.DEBUG) console.log('[AdaptiveGrid] Applied settings:', {
      videoCols,
      playlistCols,
      videoManual: isVideoManual,
      playlistManual: isPlaylistManual,
      breakpoint: this.currentBreakpoint.name
    });
  }

  /**
   * Attach event listeners to manual controls
   */
  attachManualControls() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.grid-btn[data-cols]');
      if (!btn) return;

      const cols = parseInt(btn.dataset.cols);
      const gridType = btn.dataset.gridType || 'video';
      
      this.setManualColumns(cols, gridType);
    });
  }

  /**
   * Set manual column count
   */
  setManualColumns(cols, gridType = 'video') {
    if (gridType === 'video') {
      localStorage.setItem(this.STORAGE_KEYS.VIDEO_COLS, cols.toString());
      localStorage.setItem(this.STORAGE_KEYS.IS_MANUAL_VIDEO, 'true');
      document.documentElement.style.setProperty('--latest-cols', cols);
    } else if (gridType === 'playlist') {
      localStorage.setItem(this.STORAGE_KEYS.PLAYLIST_COLS, cols.toString());
      localStorage.setItem(this.STORAGE_KEYS.IS_MANUAL_PLAYLIST, 'true');
      document.documentElement.style.setProperty('--playlist-cols', cols);
    }

    this.updateControlsUI();
    this.triggerContentRerender();

    if (this.DEBUG) console.log('[AdaptiveGrid] Manual override:', gridType, cols);
  }

  /**
   * Update UI controls to reflect current state
   */
  updateControlsUI() {
    const videoCols = parseInt(localStorage.getItem(this.STORAGE_KEYS.VIDEO_COLS)) || this.currentBreakpoint.cols;
    const playlistCols = parseInt(localStorage.getItem(this.STORAGE_KEYS.PLAYLIST_COLS)) || this.currentBreakpoint.cols;

    document.querySelectorAll('.grid-btn[data-grid-type="video"]').forEach(btn => {
      const cols = parseInt(btn.dataset.cols);
      btn.classList.toggle('active', cols === videoCols);
    });

    document.querySelectorAll('.grid-btn[data-grid-type="playlist"]').forEach(btn => {
      const cols = parseInt(btn.dataset.cols);
      btn.classList.toggle('active', cols === playlistCols);
    });

    document.querySelectorAll('.grid-btn:not([data-grid-type])').forEach(btn => {
      const cols = parseInt(btn.dataset.cols);
      btn.classList.toggle('active', cols === videoCols);
    });
  }

  /**
   * Trigger content re-render
   */
  triggerContentRerender() {
    const event = new CustomEvent('adaptiveGridChanged', {
      detail: {
        videoCols: parseInt(localStorage.getItem(this.STORAGE_KEYS.VIDEO_COLS)),
        playlistCols: parseInt(localStorage.getItem(this.STORAGE_KEYS.PLAYLIST_COLS)),
        breakpoint: this.currentBreakpoint.name
      }
    });
    
    window.dispatchEvent(event);

  }

  /**
   * Get recommended columns for current viewport
   */
  getRecommendedColumns() {
    return this.currentBreakpoint.cols;
  }

  /**
   * Check if currently in manual mode
   */
  isManualMode(gridType = 'video') {
    if (gridType === 'video') {
      return localStorage.getItem(this.STORAGE_KEYS.IS_MANUAL_VIDEO) === 'true';
    } else if (gridType === 'playlist') {
      return localStorage.getItem(this.STORAGE_KEYS.IS_MANUAL_PLAYLIST) === 'true';
    }
    return false;
  }

  /**
   * Get current column count (video and playlist follow breakpoint or manual override).
   */
  getCurrentColumns(gridType = 'video') {
    const isManual = this.isManualMode(gridType);

    if (gridType === 'video') {
      if (isManual) {
        return parseInt(localStorage.getItem(this.STORAGE_KEYS.VIDEO_COLS)) || this.currentBreakpoint.cols;
      } else {
        return this.currentBreakpoint.cols;
      }
    } else if (gridType === 'playlist') {
      if (isManual) {
        return parseInt(localStorage.getItem(this.STORAGE_KEYS.PLAYLIST_COLS)) || this.currentBreakpoint.cols;
      } else {
        return this.currentBreakpoint.cols;
      }
    }
    return this.currentBreakpoint.cols;
  }

  /**
   * Get current breakpoint info
   */
  getBreakpointInfo() {
    return {
      name: this.currentBreakpoint.name,
      width: this.currentBreakpoint.width,
      cols: this.currentBreakpoint.cols,
      viewportWidth: window.innerWidth
    };
  }

  /**
   * Reset to auto mode manually
   */
  resetManualMode(gridType = 'both') {
    if (gridType === 'video' || gridType === 'both') {
      localStorage.removeItem(this.STORAGE_KEYS.IS_MANUAL_VIDEO);
    }
    
    if (gridType === 'playlist' || gridType === 'both') {
      localStorage.removeItem(this.STORAGE_KEYS.IS_MANUAL_PLAYLIST);
    }

    this.applyGridSettings();
    this.triggerContentRerender();

    if (this.DEBUG) console.log('[AdaptiveGrid] Manual mode reset for:', gridType);
  }
}

const adaptiveGrid = new AdaptiveGridSystem();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdaptiveGridSystem;
}
/**
 * Global Sidebar Toggle System for YouVi
 * Uses localStorage to persist sidebar state across all pages
 */

(function() {
    'use strict';
    
    const SIDEBAR_STATE_KEY = 'sidebarCollapsed';
    
    /**
     * Toggle sidebar collapsed state
     */
    function toggleSidebar() {
        const body = document.body;
        const html = document.documentElement;
        const isCinemaMode = body.classList.contains('cinema-mode');
        
        if (isCinemaMode) {
            body.classList.toggle('sidebar-open');
        } else {
            const isCollapsed = body.classList.contains('sidebar-collapsed') || html.classList.contains('sidebar-collapsed');
            
            if (isCollapsed) {
                body.classList.remove('sidebar-collapsed');
                html.classList.remove('sidebar-collapsed');
                localStorage.setItem(SIDEBAR_STATE_KEY, 'false');
            } else {
                body.classList.add('sidebar-collapsed');
                html.classList.add('sidebar-collapsed');
                localStorage.setItem(SIDEBAR_STATE_KEY, 'true');
            }
            try {
                window.dispatchEvent(new CustomEvent('youvi-sidebar-toggle', { detail: { collapsed: !isCollapsed } }));
            } catch (e) {}
        }
    }
    
    /**
     * Initialize sidebar state from localStorage on page load
     */
    function initializeSidebarState() {
        const sidebarCollapsed = localStorage.getItem(SIDEBAR_STATE_KEY);
        if (sidebarCollapsed === 'true') {
            document.body.classList.add('sidebar-collapsed');
            document.documentElement.classList.add('sidebar-collapsed');
        }
    }
    
    /**
     * Setup sidebar toggle button event listener
     */
    function setupSidebarToggle() {
        const toggleBtn = document.getElementById('sidebarToggle');
        if (toggleBtn && !toggleBtn.dataset.listenerAttached) {
            toggleBtn.addEventListener('click', toggleSidebar);
            toggleBtn.dataset.listenerAttached = 'true';
        }
        
        document.addEventListener('click', (e) => {
            const body = document.body;
            const isCinemaMode = body.classList.contains('cinema-mode');
            const isSidebarOpen = body.classList.contains('sidebar-open');
            
            if (isCinemaMode && isSidebarOpen) {
                const sidebar = document.querySelector('.sidebar');
                const sidebarToggle = document.getElementById('sidebarToggle');
                
                if (sidebar && !sidebar.contains(e.target) && e.target !== sidebarToggle && !sidebarToggle.contains(e.target)) {
                    body.classList.remove('sidebar-open');
                }
            }
        });
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeSidebarState();
            setupSidebarToggle();
        });
    } else {
        initializeSidebarState();
        setupSidebarToggle();
    }
    
    window.youviSidebar = {
        toggle: toggleSidebar,
        initialize: initializeSidebarState
    };
})();
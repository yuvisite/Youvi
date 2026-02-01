
(function() {
  'use strict';
  
  function initSidebarScroll() {
    const sidebar = document.querySelector('.sidebar');
    const footer = document.querySelector('.footer, footer');
    
    if (!sidebar || !footer) return;
    
    let lastOverlap = 0;
    let savedScrollTop = null;
    
    function updateSidebarHeight() {
      if (document.body.classList.contains('cinema-mode')) {
        sidebar.style.setProperty('--sidebar-max-height', '100vh');
        lastOverlap = 0;
        savedScrollTop = null;
        return;
      }
      const footerRect = footer.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      
      if (footerRect.top < viewportHeight) {
        const overlap = viewportHeight - footerRect.top;
        const availableHeight = footerRect.top;
        sidebar.style.setProperty('--sidebar-max-height', availableHeight + 'px');
        
        if (lastOverlap === 0) {
          savedScrollTop = sidebar.scrollTop;
        }
        
        const delta = overlap - lastOverlap;
        if (delta !== 0) {
          sidebar.scrollTop += delta;
        }
        lastOverlap = overlap;
        
        const atBottom = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 5;
        if (atBottom) {
          savedScrollTop = 0;
        }
      } else {
        sidebar.style.setProperty('--sidebar-max-height', '100vh');
        
        if (savedScrollTop !== null) {
          sidebar.scrollTop = savedScrollTop;
          savedScrollTop = null;
        }
        lastOverlap = 0;
      }
    }
    
    window.addEventListener('scroll', updateSidebarHeight);
    window.addEventListener('resize', updateSidebarHeight);
    updateSidebarHeight();
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarScroll);
  } else {
    initSidebarScroll();
  }
})();
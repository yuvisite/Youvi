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
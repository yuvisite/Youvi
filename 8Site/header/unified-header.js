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

function initSearch() {
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');
  
  if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const query = searchInput.value.trim();
      if (query) {
        location.href = `youvi_search.html?q=${encodeURIComponent(query)}`;
      }
    });

    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const query = searchInput.value.trim();
        if (query) {
          location.href = `youvi_search.html?q=${encodeURIComponent(query)}`;
        }
      }
    });
  }
}

function initNavigationButtons() {
  const openInYouviBtn = document.getElementById('openInYouviBtn');
  const openInScreenBtn = document.getElementById('openInScreenBtn');
  const goHomeBtn = document.getElementById('goHome');

  if (openInYouviBtn) {
    openInYouviBtn.addEventListener('click', () => {
      const params = new URLSearchParams(location.search);
      if (params.get('channel')) {
        const activeTab = document.querySelector('.tab.active');
        const tabName = activeTab ? activeTab.dataset.tab : 'home';
        
        if (tabName === 'feed') {
          location.href = `youvi_ch_feed.html?channel=${encodeURIComponent(params.get('channel'))}`;
        } else if (tabName === 'analytics' || tabName === 'description') {
          location.href = `youvi_ch_view.html?channel=${encodeURIComponent(params.get('channel'))}&tab=${tabName}`;
        } else {
          location.href = `youvi_ch_view.html?channel=${encodeURIComponent(params.get('channel'))}`;
        }
      } else {
        location.href = 'youvi_main.html';
      }
    });
  }

  if (openInScreenBtn) {
    openInScreenBtn.addEventListener('click', () => {
      const params = new URLSearchParams(location.search);
      if (params.get('channel')) {
        location.href = `screen_video.html?${params.toString()}`;
      } else {
        location.href = 'screen_main.html';
      }
    });
  }

  if (goHomeBtn) {
    goHomeBtn.addEventListener('click', () => {
      location.href = 'youvi_main.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSearch();
  initNavigationButtons();
});
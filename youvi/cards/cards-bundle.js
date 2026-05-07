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
 * YouVi Video Cards System Bundle
 * Complete cards system with CSS and JavaScript
 * 
 * Usage:
 * <script src="youvi/cards/cards-bundle.js"></script>
 * 
 * Or include separately:
 * <link rel="stylesheet" href="youvi/cards/video-cards.css">
 * <script src="youvi/cards/video-cards.js"></script>
 */

(function() {
    const cssId = 'youvi-cards-css';
    if (!document.getElementById(cssId)) {
        const head = document.getElementsByTagName('head')[0];
        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = 'youvi/cards/video-cards.css';
        link.media = 'all';
        head.appendChild(link);
    }
})();

(function() {
    if (typeof window.YouViCards === 'undefined') {
        const script = document.createElement('script');
        script.src = 'youvi/cards/video-cards.js';
        script.onload = function() {
            if (typeof initVideoCards === 'function') {
                initVideoCards();
            }
        };
        document.head.appendChild(script);
    } else {
        if (typeof initVideoCards === 'function') {
            initVideoCards();
        }
    }
})();

window.YouViCardsPresets = {
    default: {
        showQuality: true,
        showNew: true,
        showDuration: true,
        showViews: true,
        showChannel: true,
        showCategory: false
    },
    
    playlist: {
        showNumber: true,
        showQuality: true,
        showNew: false,
        showDuration: true,
        showViews: true,
        showChannel: true,
        showCategory: false
    },
    
    subscription: {
        showQuality: true,
        showNew: true,
        showDuration: true,
        showViews: true,
        showChannel: true,
        showCategory: false
    },
    
    latest: {
        cardType: 'latest',
        showChannel: true,
        showViews: false
    },
    
    compact: {
        showQuality: false,
        showNew: false,
        showDuration: true,
        showViews: false,
        showChannel: false,
        showCategory: false,
        titleClass: 'video-card-title compact'
    }
};

console.log('YouVi Cards Bundle loaded successfully');
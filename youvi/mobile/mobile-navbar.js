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
 * Mobile Bottom Navigation Bar
 * Dynamically injects the mobile navbar into pages that include this script.
 * Highlights the active page based on the current URL.
 */
(function () {
    'use strict';

    if (document.querySelector('.mobile-bottom-nav')) return;

    var navItems = [
        {
            href: 'youvi_main.html',
            label: 'Главная',
            i18nKey: 'sidebar.home',
            icon: '<svg viewBox="0 0 24 24" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>'
        },
        {
            href: '#',
            label: 'Создать',
            i18nKey: 'playlist.create',
            className: 'upload-btn',
            icon: '<svg viewBox="0 0 24 24" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
        },
        {
            href: 'youvi_subscriptions.html',
            label: 'Подписки',
            i18nKey: 'sidebar.subscriptions',
            icon: '<svg viewBox="0 0 24 24" stroke-width="1.5"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>'
        },
        {
            href: '#',
            label: 'Библиотека',
            i18nKey: 'sidebar.library',
            id: 'mobileMenuBtn',
            icon: '<svg viewBox="0 0 24 24" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
        }
    ];

    var currentPage = location.pathname.split('/').pop() || 'index.html';

    var nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';

    for (var i = 0; i < navItems.length; i++) {
        var item = navItems[i];
        var a = document.createElement('a');
        a.href = item.href;
        a.className = 'mobile-nav-item';

        if (item.className) a.className += ' ' + item.className;
        if (item.id) a.id = item.id;
        if (item.href !== '#' && currentPage === item.href) a.className += ' active';

        a.innerHTML = item.icon + '<span>' + item.label + '</span>';
        nav.appendChild(a);
    }

    document.body.appendChild(nav);

    /* Menu button toggles sidebar on mobile */
    var menuBtn = nav.querySelector('#mobileMenuBtn');
    if (menuBtn) {
        menuBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (window.YouViSidebar && typeof window.YouViSidebar.toggle === 'function') {
                window.YouViSidebar.toggle();
            } else {
                var sidebar = document.querySelector('.sidebar');
                if (sidebar) {
                    document.body.classList.toggle('sidebar-open');
                }
            }
        });
    }

    /* i18n support — update labels when language changes */
    function updateLabels() {
        if (typeof i18n === 'undefined' || typeof i18n.t !== 'function') return;
        var links = nav.querySelectorAll('.mobile-nav-item');
        for (var j = 0; j < links.length; j++) {
            var key = navItems[j] && navItems[j].i18nKey;
            if (key) {
                var span = links[j].querySelector('span');
                if (span) span.textContent = i18n.t(key, navItems[j].label);
            }
        }
    }

    if (typeof i18n !== 'undefined' && typeof i18n.subscribe === 'function') {
        i18n.subscribe(updateLabels);
        updateLabels();
    } else {
        document.addEventListener('i18n-ready', function () {
            if (typeof i18n !== 'undefined' && typeof i18n.subscribe === 'function') {
                i18n.subscribe(updateLabels);
                updateLabels();
            }
        });
    }
})();

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
    
    const THEME_KEY = 'youvi-theme';
    const THEME_LIGHT = 'light';
    const THEME_DARK = 'dark';
    const THEME_SKEUO = 'skeuo';
    const THEME_OFF = 'off';
    const LAST_ENABLED_THEME_KEY = 'youvi-theme-last-enabled';
    const CUSTOM_BG_ENABLED_KEY = 'youvi-custom-bg-enabled';
    const CUSTOM_THEME_ENABLED_KEY = 'youvi-custom-theme-enabled';
    const VALID_THEMES = [THEME_LIGHT, THEME_DARK, THEME_SKEUO, THEME_OFF];

    function setupDropdownBehavior(trigger, dropdown, container, useFixedPosition) {
        if (!trigger || !dropdown) {
            return;
        }

        function positionDropdown() {
            if (!useFixedPosition) return;
            const rect = trigger.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 5) + 'px';
            dropdown.style.right = (window.innerWidth - rect.right) + 'px';
        }

        trigger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            const willOpen = !dropdown.classList.contains('show');
            if (willOpen) {
                document.querySelectorAll('.theme-dropdown.show, .view-dropdown.show, .settings-dropdown.show, .settings-menu.show').forEach(function(openDropdown) {
                    if (openDropdown !== dropdown) {
                        openDropdown.classList.remove('show');
                    }
                });
            }

            dropdown.classList.toggle('show', willOpen);
            if (willOpen) {
                positionDropdown();
            }
        });

        if (useFixedPosition) {
            window.addEventListener('scroll', function() {
                if (dropdown.classList.contains('show')) {
                    positionDropdown();
                }
            });

            window.addEventListener('resize', function() {
                if (dropdown.classList.contains('show')) {
                    positionDropdown();
                }
            });
        }

        document.addEventListener('click', function(e) {
            const root = container || trigger.parentElement;
            if (!root) {
                dropdown.classList.remove('show');
                return;
            }
            if (!root.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }
    
    function loadTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        return VALID_THEMES.includes(savedTheme) ? savedTheme : THEME_LIGHT;
    }

    function loadLastEnabledTheme() {
        const saved = localStorage.getItem(LAST_ENABLED_THEME_KEY);
        if (saved === THEME_DARK || saved === THEME_SKEUO || saved === THEME_LIGHT) {
            return saved;
        }
        return THEME_DARK;
    }

    function isCustomBackgroundEnabled() {
        return localStorage.getItem(CUSTOM_BG_ENABLED_KEY) !== 'false';
    }

    function setCustomBackgroundEnabled(enabled) {
        localStorage.setItem(CUSTOM_BG_ENABLED_KEY, enabled ? 'true' : 'false');
    }

    function isCustomThemeEnabled() {
        return localStorage.getItem(CUSTOM_THEME_ENABLED_KEY) !== 'false';
    }

    function setCustomThemeEnabled(enabled) {
        localStorage.setItem(CUSTOM_THEME_ENABLED_KEY, enabled ? 'true' : 'false');
    }

    function applyCustomThemeState() {
        const enabled = isCustomThemeEnabled();
        document.body.classList.toggle('custom-theme-disabled', !enabled);
    }
    
    function applyTheme(theme) {
        document.documentElement.classList.remove('dark-theme', 'skeuo-theme');
        document.body.classList.remove('dark-theme', 'skeuo-theme');
        
        const nextTheme = VALID_THEMES.includes(theme) ? theme : THEME_LIGHT;

        if (nextTheme === THEME_DARK) {
            document.documentElement.classList.add('dark-theme');
            document.body.classList.add('dark-theme');
        } else if (nextTheme === THEME_SKEUO) {
            document.documentElement.classList.add('skeuo-theme');
            document.body.classList.add('skeuo-theme');
        }

        if (nextTheme !== THEME_OFF) {
            localStorage.setItem(LAST_ENABLED_THEME_KEY, nextTheme);
        }

        localStorage.setItem(THEME_KEY, nextTheme);
    }
    
    function initTheme() {
        const currentTheme = loadTheme();
        applyTheme(currentTheme);
        applyCustomThemeState();
        updateDropdownText(currentTheme);
        updateThemeToggleControl();
        updateCustomThemeToggleControl();
    }
    
    function updateDropdownText(theme) {
        const dropdownItems = document.querySelectorAll('.theme-dropdown-item[data-theme]');
        dropdownItems.forEach(item => {
            if (item.dataset.theme === theme) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    function setTheme(theme) {
        applyTheme(theme);
        updateDropdownText(theme);
        window.dispatchEvent(new CustomEvent('youvi-theme-change', { detail: loadTheme() }));
    }

    function toggleThemeEnabled() {
        const nextState = !isCustomBackgroundEnabled();
        setCustomBackgroundEnabled(nextState);

        if (typeof window.applySiteBackgroundForChannel === 'function') {
            window.applySiteBackgroundForChannel(window.currentChannelName || null).catch(function() {});
        } else if (!nextState) {
            document.body.classList.remove('site-channel-background');
            document.body.style.removeProperty('--site-channel-bg-image');
        }

        updateThemeToggleControl();
    }

    function updateThemeToggleControl() {
        const toggleBtn = document.getElementById('themeToggleBtn');
        if (!toggleBtn) {
            return;
        }
        const enabled = isCustomBackgroundEnabled();
        toggleBtn.textContent = enabled ? 'Custom BG: On' : 'Custom BG: Off';
        toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        toggleBtn.classList.toggle('active', enabled);
    }

    function toggleCustomThemeEnabled() {
        const nextState = !isCustomThemeEnabled();
        setCustomThemeEnabled(nextState);
        applyCustomThemeState();
        if (typeof window.applySiteBackgroundForChannel === 'function') {
            window.applySiteBackgroundForChannel(window.currentChannelName || null).catch(function() {});
        }
        updateCustomThemeToggleControl();
    }

    function updateCustomThemeToggleControl() {
        const toggleBtn = document.getElementById('customThemeToggleBtn');
        if (!toggleBtn) {
            return;
        }
        const enabled = isCustomThemeEnabled();
        toggleBtn.textContent = enabled ? 'Custom Theme: On' : 'Custom Theme: Off';
        toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        toggleBtn.classList.toggle('active', enabled);
    }
    
    function setupThemeDropdown() {
        const settingsBtn = document.querySelector('.settings-btn');
        const dropdown = document.querySelector('.theme-dropdown');
        const settingsContainer = settingsBtn ? settingsBtn.closest('.settings-container') : null;
        
        if (!settingsBtn || !dropdown) {
            return;
        }

        setupDropdownBehavior(settingsBtn, dropdown, settingsContainer, true);
        
        const dropdownItems = document.querySelectorAll('.theme-dropdown-item[data-theme]');
        dropdownItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                const selectedTheme = this.dataset.theme;
                setTheme(selectedTheme);
                dropdown.classList.remove('show');
            });
        });
    }

    function setupViewDropdown() {
        const viewMenuBtn = document.getElementById('viewMenuBtn');
        const viewDropdown = document.getElementById('viewDropdown');
        const viewMenuContainer = document.getElementById('viewMenuContainer');
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        const customThemeToggleBtn = document.getElementById('customThemeToggleBtn');

        if (!viewMenuBtn || !viewDropdown) {
            return;
        }

        setupDropdownBehavior(viewMenuBtn, viewDropdown, viewMenuContainer, false);

        updateThemeToggleControl();
        updateCustomThemeToggleControl();

        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', function(e) {
                e.preventDefault();
                toggleThemeEnabled();
                viewDropdown.classList.remove('show');
            });
        }

        if (customThemeToggleBtn) {
            customThemeToggleBtn.addEventListener('click', function(e) {
                e.preventDefault();
                toggleCustomThemeEnabled();
                viewDropdown.classList.remove('show');
            });
        }
    }
    
    window.addEventListener('storage', function(e) {
        if (e.key === THEME_KEY && e.newValue) {
            applyTheme(e.newValue);
            updateDropdownText(e.newValue);
        }
        if (e.key === CUSTOM_BG_ENABLED_KEY) {
            updateThemeToggleControl();
        }
        if (e.key === CUSTOM_THEME_ENABLED_KEY) {
            applyCustomThemeState();
            if (typeof window.applySiteBackgroundForChannel === 'function') {
                window.applySiteBackgroundForChannel(window.currentChannelName || null).catch(function() {});
            }
            updateCustomThemeToggleControl();
        }
    });
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initTheme();
            setupThemeDropdown();
            setupViewDropdown();
        });
    } else {
        initTheme();
        setupThemeDropdown();
        setupViewDropdown();
    }
    
    window.youviTheme = {
        setTheme: setTheme,
        getTheme: loadTheme,
        toggleEnabled: toggleThemeEnabled,
        toggleCustomTheme: toggleCustomThemeEnabled
    };
})();
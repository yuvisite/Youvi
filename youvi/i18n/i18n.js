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

const I18N_DEBUG = false;

const i18nDebug = {
    log: (...args) => { if (I18N_DEBUG) console.log(...args); },
    warn: (...args) => { if (I18N_DEBUG) console.warn(...args); },
    error: (...args) => { if (I18N_DEBUG) console.error(...args); }
};

class YouViI18n {
    constructor() {
        this.currentLang = this.getStoredLanguage() || 'ru';
        this.translations = {};
        this.observers = [];
    }
    
    getStoredLanguage() {
        try {
            return localStorage.getItem('youvi_language') || 'ru';
        } catch (e) {
            i18nDebug.warn('Failed to get language from localStorage:', e);
            return 'ru';
        }
    }
    
    setStoredLanguage(lang) {
        try {
            localStorage.setItem('youvi_language', lang);
        } catch (e) {
            i18nDebug.warn('Failed to save language to localStorage:', e);
        }
    }
    
    async loadTranslations(lang) {
        if (this.translations[lang]) {
            return this.translations[lang];
        }
        
        if (window[lang]) {
            this.translations[lang] = window[lang];
            return this.translations[lang];
        }
        
        try {
            const script = document.createElement('script');
            script.src = `youvi/i18n/${lang}.js`;
            
            await new Promise((resolve, reject) => {
                script.onload = () => {
                    this.translations[lang] = window[lang];
                    resolve();
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
            
            return this.translations[lang];
        } catch (e) {
            i18nDebug.error(`Failed to load translations for ${lang}:`, e);
            if (lang !== 'ru') {
                return this.loadTranslations('ru');
            }
            return {};
        }
    }
    
    getCurrentLanguage() {
        return this.currentLang;
    }
    
    async setLanguage(lang) {
        i18nDebug.log('Changing language from', this.currentLang, 'to', lang);
        
        if (lang === this.currentLang && this.translations[lang]) {
            i18nDebug.log('Language already set and loaded');
            return;
        }
        
        await this.loadTranslations(lang);
        
        this.currentLang = lang;
        this.setStoredLanguage(lang);
        
        i18nDebug.log('Language changed to:', lang);
        i18nDebug.log('Translations loaded:', !!this.translations[lang]);
        
        this.notifyObservers();
        
        this.updateUI();
    }
    
    t(key, defaultValue = '') {
        const keys = key.split('.');
        let value = this.translations[this.currentLang];
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue || key;
            }
        }
        
        return value || defaultValue || key;
    }
    
    subscribe(callback) {
        this.observers.push(callback);
    }
    
    unsubscribe(callback) {
        this.observers = this.observers.filter(cb => cb !== callback);
    }
    
    notifyObservers() {
        this.observers.forEach(callback => {
            try {
                callback(this.currentLang);
            } catch (e) {
                i18nDebug.error('Observer callback error:', e);
            }
        });
    }
    
    updateUI() {
        i18nDebug.log('Updating UI to language:', this.currentLang);
        
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.placeholder = translation;
            } else {
                element.textContent = translation;
            }
        });
        
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.t(key);
        });
        
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            if (element.tagName === 'TITLE') {
                document.title = this.t(key);
            } else {
                element.title = this.t(key);
            }
        });
        
        document.querySelectorAll('[data-i18n-aria]').forEach(element => {
            const key = element.getAttribute('data-i18n-aria');
            element.setAttribute('aria-label', this.t(key));
        });
        
        i18nDebug.log('UI updated successfully');
    }
    
    getLanguageName(lang) {
        const names = {
            'ru': 'Русский',
            'en': 'English',
            'uk': 'Українська'
        };
        return names[lang] || lang;
    }
    
    getAvailableLanguages() {
        return [
            { code: 'ru', name: 'Русский' },
            { code: 'en', name: 'English' },
            { code: 'uk', name: 'Українська' }
        ];
    }
}

const i18n = new YouViI18n();

(function initI18nSync() {
    i18nDebug.log('Initializing i18n synchronously...');
    const lang = i18n.getCurrentLanguage();
    i18nDebug.log('Current language:', lang);
    
    if (window[lang]) {
        i18n.translations[lang] = window[lang];
        i18nDebug.log('Translations loaded from global:', lang);
    } else {
        i18nDebug.warn('Translations not preloaded for:', lang);
    }
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        i18nDebug.log('DOM loaded, updating UI...');
        i18n.updateUI();
    });
} else {
    i18nDebug.log('DOM already loaded, updating UI immediately...');
    i18n.updateUI();
}
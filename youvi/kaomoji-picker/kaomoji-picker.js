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
 * Kaomoji Picker Module
 * Provides a picker interface for inserting kaomoji emoticons into text inputs
 */

const KAOMOJI_DEBUG = false;

(function() {
    'use strict';

    const categoryKeys = {
        'all': 'kaomoji.all',
        'happy': 'kaomoji.happy',
        'love': 'kaomoji.love',
        'sad': 'kaomoji.sad',
        'angry': 'kaomoji.angry',
        'surprise': 'kaomoji.surprise',
        'laugh': 'kaomoji.laugh',
        'confused': 'kaomoji.confused',
        'kawaii': 'kaomoji.kawaii',
        'bears': 'kaomoji.bears',
        'cats': 'kaomoji.cats',
        'gestures': 'kaomoji.gestures',
        'other': 'kaomoji.other'
    };

    function getCategoryName(key) {
        const defaults = {
            'all': 'All',
            'happy': 'Happy',
            'love': 'Love',
            'sad': 'Sad',
            'angry': 'Angry',
            'surprise': 'Surprise',
            'laugh': 'Laugh',
            'confused': 'Confused',
            'kawaii': 'Kawaii',
            'bears': 'Bears',
            'cats': 'Cats',
            'gestures': 'Gestures',
            'other': 'Other'
        };
        if (typeof i18n !== 'undefined' && categoryKeys[key]) {
            return i18n.t(categoryKeys[key], defaults[key] || key);
        }
        return defaults[key] || key;
    }

    const kaomojiData = {
        'all': [
        ],
        'happy': [
            '(^▽^)', '(＾◡＾)', '(◕‿◕)', '(´｡• ᵕ •｡`)', '(≧◡≦)', 
            '(⌒‿⌒)', 'ヽ(>∀<☆)ノ', 'o(^▽^)o', '(☆^ー^☆)', '(✿◠‿◠)',
            '(◠‿◠✿)', '(◕‿◕✿)', '(◑‿◐)', '(*^‿^*)', '(◕‿-)✿',
            '(◔‿◔)', '(◡‿◡✿)', '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(*≧ω≦*)', '(☆▽☆)',
            '(⌒ω⌒)', '∩(︶▽︶)∩', '(〃^▽^〃)', '(✯◡✯)', '(≧▽≦)'
        ],
        'love': [
            '(♥ω♥)', '(´ ∀ ` *)', '(｡♥‿♥｡)', '(*♡∀♡)', '(°◡°♡)',
            '(♡˙︶˙♡)', '♥(ˆ⌣ˆԅ)', '(◍•ᴗ•◍)❤', '(♡°▽°♡)', '(◕‿◕)♡',
            '♥╣[-_-]╠♥', '(ღ˘⌣˘ღ)', '(♡-_-♡)', '(◕દ◕)', '(•ω•)',
            '(灬ºωº灬)', '(⺣◡⺣)♡*', '(´ε｀ )♡', '(◦˘ З(◦\'ںˉ◦)♡', '(♡˙︶˙♡)'
        ],
        'sad': [
            '(╥_╥)', '(｡•́︿•̀｡)', '(╯︵╰,)', '(ಥ﹏ಥ)', '(＞﹏＜)',
            '(｡•́_•̀｡)', '(╥﹏╥)', '(´；ω；`)', '(つ﹏⊂)', '(◕︿◕✿)',
            '(ಥ_ಥ)', '(⌣̩̩́_⌣̩̩̀)', '(◞‸◟)', '(´•̥̥̥ω•̥̥̥`)', '(つд⊂)',
            '(๑′°︿°๑)', '(-_-)', '(._. )', '(っ˘̩╭╮˘̩)っ', '(〒﹏〒)'
        ],
        'angry': [
            '(╬ಠ益ಠ)', '(ಠ_ಠ)', '(◣_◢)', '(ꐦ°᷄д°᷅)', '(╬ ̄皿 ̄)',
            '(ノಠ益ಠ)ノ', '(▼へ▼メ)', '(҂⌣̀_⌣́)', '(ᗒᗣᗕ)՞', '(눈_눈)',
            '(ಠ⌣ಠ)', '(ಠ‿ಠ)', '(¬_¬)', '(◣д◢)', '(-_-メ)',
            '(҂`_´)', '(╬▔皿▔)╯', '(ᗒᗣᗕ)', '(╯°□°）╯', '(ノ°益°)ノ'
        ],
        'surprise': [
            '(⊙_⊙)', '(°o°)', '(◎_◎)', '(☉_☉)', '(⊙.☉)',
            '(✪_✪)', '(⊙ω⊙)', '(°ロ°)', '(⊙△⊙)', '(O_O)',
            '(◉_◉)', '(°_°)', 'Σ(O_O)', 'Σ(°ロ°)', '⊙▂⊙',
            '(✪㉨✪)', '(@_@)', '(°o°)!', '(⊙0⊙)', '(☉д⊙)'
        ],
        'laugh': [
            '(≧▽≦)', '(^▽^)', 'ヽ(^o^)ノ', '(^∇^)', '(≧◡≦)',
            '(^◡^)', '(ノ∀`)', 'ヾ(≧▽≦*)o', '(^_^)', 'ヽ(^Д^)ノ',
            '(≧ω≦)', '(^ω^)', '(⌒▽⌒)', '(☆^O^☆)', '(≧∇≦)',
            '(*≧▽≦)', '(°∀°)', '(≧▽≦*)', '(^◇^)', 'ヽ(･∀･)ﾉ'
        ],
        'confused': [
            '(・_・?)', '(・・?)', '(・・ ) ?', '(？_？)', '(・。・)',
            '(◎ ◎)ゞ', '(°_°)?', '(・_・ヾ', '(・ω・)?', '┐(￣ヘ￣)┌',
            '¯\\_(ツ)_/¯', '┐(￣～￣)┌', '(￣ω￣;)', '(；一_一)', '(〃￣ω￣〃ゞ',
            '(・_・;)', '(^_^;)', '(・∀・;)', '(；￣Д￣)', '(⊙_☉)'
        ],
        'kawaii': [
            '(｡◕‿◕｡)', '(◕‿◕)', '(◠‿◠)', '(◕ω◕)', '(^-^*)',
            '(>^_^)>', '(◕‿◕✿)', '(◕ᴗ◕✿)', '(✿◠‿◠)', '(◠‿◠✿)',
            '(⁎˃ᆺ˂)', '(｡♥‿♥｡)', '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(◕‿-)✿', '(◕3◕)',
            '(◍•ᴗ•◍)', '(◕ᴗ◕✿)', '(*´ω`*)', '(◕▿◕)', '(｡•̀ᴗ-)✧'
        ],
        'bears': [
            'ʕ•ᴥ•ʔ', 'ʕ·ᴥ·ʔ', 'ʕ￫ᴥ￩ʔ', 'ʕ•̫͡•ʔ', 'ʕ◉ᴥ◉ʔ',
            'ʕ´•ᴥ•`ʔ', 'ʕ•͡ω•ʔ', 'ʕ⊙ᴥ⊙ʔ', 'ʕ·͡ᴥ·ʔ', 'ʕᵔᴥᵔʔ',
            'ʕ♡˙ᴥ˙♡ʔ', 'ʕ→ᴥ←ʔ', 'ʕ̯•͡˔•̯᷅ʔ', 'ʕ •́؈•̀ ₎', 'ʕっ•ᴥ•ʔっ'
        ],
        'cats': [
            '(=^･ω･^=)', '(=^･ｪ･^=)', '(^･o･^)ﾉ"', '(^人^)', '(=；ｪ；=)',
            '(^･ｪ･^)', '(=^‥^=)', '(=｀ω´=)', '(^._.^)ﾉ', '(＾• ω •＾)',
            'ฅ(•ㅅ•❀)ฅ', '(^▽^)', '(=ↀωↀ=)', '~(=^‥^)/', '(=ｘェｘ=)',
            '(=；ェ；=)', '(^._.^)', 'ฅ(⌯͒• ɪ •⌯͒)ฅ', '(=ＴェＴ=)', '(=ｘェｘ=)'
        ],
        'gestures': [
            '(╯°□°）╯︵ ┻━┻', '(ノ￣ω￣)ノ', '＼(^o^)／', 'ヽ(^o^)ノ', '＼(≧▽≦)／',
            '٩(◕‿◕｡)۶', '┬─┬ノ( º _ ºノ)', '(づ｡◕‿‿◕｡)づ', '(づ￣ ³￣)づ', '(⊃｡•́‿•̀｡)⊃',
            '(つ≧▽≦)つ', 'ヾ(≧▽≦*)o', 'ヽ(´▽`)/', '(ﾉ◕ヮ◕)ﾉ', '┏(＾0＾)┛',
            '┗(＾0＾)┓', 'ヽ(ﾟДﾟ)ﾉ', '(ﾉ≧∀≦)ﾉ', '(੭ु｡╹▿╹｡)੭ु⁾⁾', '(∩^o^)⊃━☆'
        ],
        'other': [
            '(╹◡╹)', '(｀・ω・´)', '(￣▽￣)', '(≧◡≦)', '(✿´‿`)',
            '(´｡• ω •｡`)', '(つ✧ω✧)つ', '(◉◡◉)', '(｡•̀ᴗ-)✧', '(◍•ᴗ•◍)✧*。',
            '(*¯︶¯*)', '(°◡°♡)', '✧*｡ヾ(｡>﹏<｡)ﾉﾞ✧*｡', '(◕‿◕✿)', '(ﾉ´ヮ`)ﾉ*: ･ﾟ',
            '(•̀ᴗ•́)و', '(ง •̀_•́)ง', '(ﾉ^_^)ﾉ', '(｡•̀ᴗ-)و ̑̑', '(♡°▽°♡)'
        ]
    };

    Object.keys(kaomojiData).forEach(category => {
        if (category !== 'all') {
            kaomojiData['all'].push(...kaomojiData[category]);
        }
    });

    kaomojiData['all'] = [...new Set(kaomojiData['all'])];

    /**
     * KaomojiPicker class
     */
    class KaomojiPicker {
        static instances = [];
        
        constructor(inputElement, options = {}) {
            this.input = inputElement;
            this.options = {
                compact: false,
                position: 'top',
                triggerElement: null,
                pipContext: null,
                ...options
            };
            
            this.doc = this.options.pipContext || document;
            
            this.currentCategory = 'all';
            this.searchQuery = '';
            
            this.init();
            
            KaomojiPicker.instances.push(this);
        }

        init() {
            this.createElements();
            this.attachEventListeners();
            
            if (typeof i18n !== 'undefined' && i18n.subscribe) {
                i18n.subscribe(() => {
                    this.updateCategoryTabs();
                });
            }
        }
        
        updateCategoryTabs() {
            if (!this.popup) return;
            const tabs = this.popup.querySelectorAll('.kaomoji-tab');
            tabs.forEach(tab => {
                const category = tab.dataset.category;
                if (category) {
                    tab.textContent = getCategoryName(category);
                }
            });
        }

        createElements() {
            this.container = this.doc.createElement('div');
            this.container.className = 'kaomoji-picker-container';
            if (this.options.compact) {
                this.container.className += ' compact';
            }

            if (this.options.triggerElement) {
                this.button = typeof this.options.triggerElement === 'string' 
                    ? this.doc.querySelector(this.options.triggerElement) 
                    : this.options.triggerElement;
                
                if (!this.button) {
                    console.error('KaomojiPicker: Trigger element not found, creating default');
                    this.createDefaultButton();
                } else {
                    if (KAOMOJI_DEBUG) console.log('KaomojiPicker: Using external trigger button', this.button);
                    this.container.style.display = 'none';
                    
                    this.popup = this.createPopup();
                    this.popup.style.position = 'fixed';
                    
                    const appendTarget = this.getAppendTarget();
                    appendTarget.appendChild(this.popup);
                    if (KAOMOJI_DEBUG) console.log('KaomojiPicker: Popup appended to', appendTarget);
                    this.isExternalTrigger = true;
                }
            } else {
                this.createDefaultButton();
            }
        }

        createDefaultButton() {
            this.button = this.doc.createElement('button');
            this.button.type = 'button';
            this.button.className = 'kaomoji-picker-btn';
            this.button.title = 'Вставить kaomoji';
            this.button.innerHTML = '(^‿^)';

            this.popup = this.createPopup();

            this.container.appendChild(this.button);
            this.container.appendChild(this.popup);

            if (this.input.parentNode) {
                this.input.parentNode.insertBefore(this.container, this.input.nextSibling);
            }
        }

        createPopup() {
            const popup = this.doc.createElement('div');
            popup.className = 'kaomoji-picker-popup';

            const tabs = this.doc.createElement('div');
            tabs.className = 'kaomoji-tabs';

            Object.keys(kaomojiData).forEach(category => {
                const tab = this.doc.createElement('button');
                tab.type = 'button';
                tab.className = 'kaomoji-tab' + (category === this.currentCategory ? ' active' : '');
                tab.textContent = getCategoryName(category);
                tab.dataset.category = category;
                tabs.appendChild(tab);
            });

            this.content = this.doc.createElement('div');
            this.content.className = 'kaomoji-content';

            popup.appendChild(tabs);
            popup.appendChild(this.content);

            this.setupTabsDragScroll(tabs);

            this.renderContent();

            return popup;
        }

        setupTabsDragScroll(tabs) {
            let isDown = false;
            let startX;
            let scrollLeft;

            tabs.addEventListener('mousedown', (e) => {
                if (e.target === tabs || e.target.closest('.kaomoji-tab')) {
                    isDown = true;
                    tabs.classList.add('dragging');
                    startX = e.pageX - tabs.offsetLeft;
                    scrollLeft = tabs.scrollLeft;
                    e.preventDefault();
                }
            });

            tabs.addEventListener('mouseleave', () => {
                isDown = false;
                tabs.classList.remove('dragging');
            });

            tabs.addEventListener('mouseup', () => {
                isDown = false;
                tabs.classList.remove('dragging');
            });

            tabs.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - tabs.offsetLeft;
                const walk = (x - startX) * 2;
                tabs.scrollLeft = scrollLeft - walk;
            });
        }

        renderContent() {
            const kaomojis = this.getFilteredKaomojis();

            if (kaomojis.length === 0) {
                this.content.innerHTML = '<div class="kaomoji-empty">Ничего не найдено</div>';
                return;
            }

            const grid = this.doc.createElement('div');
            grid.className = 'kaomoji-grid';

            kaomojis.forEach(kaomoji => {
                const item = this.doc.createElement('div');
                item.className = 'kaomoji-item';
                item.textContent = kaomoji;
                item.title = kaomoji;
                item.dataset.kaomoji = kaomoji;
                grid.appendChild(item);
            });

            this.content.innerHTML = '';
            this.content.appendChild(grid);
        }

        getFilteredKaomojis() {
            let kaomojis = kaomojiData[this.currentCategory] || [];
            return kaomojis;
        }

        getKaomojiCategories(kaomoji) {
            const categories = [];
            Object.keys(kaomojiData).forEach(category => {
                if (category !== 'all' && kaomojiData[category].includes(kaomoji)) {
                    categories.push(category);
                }
            });
            return categories;
        }

        attachEventListeners() {
            this.buttonClickHandler = (e) => {
                if (KAOMOJI_DEBUG) console.log('KaomojiPicker: Button clicked');
                e.preventDefault();
                e.stopPropagation();
                this.togglePopup();
            };
            this.button.addEventListener('click', this.buttonClickHandler);
            if (KAOMOJI_DEBUG) console.log('KaomojiPicker: Click listener attached to button');

            this.popup.addEventListener('click', (e) => {
                if (e.target.classList.contains('kaomoji-tab')) {
                    e.preventDefault();
                    this.switchCategory(e.target.dataset.category);
                }
            });

            this.popup.addEventListener('click', (e) => {
                if (e.target.classList.contains('kaomoji-item')) {
                    e.preventDefault();
                    this.insertKaomoji(e.target.dataset.kaomoji);
                }
            });

            this.outsideClickHandler = (e) => {
                const isClickInsideContainer = this.container.contains(e.target);
                const isClickInsideButton = this.button && this.button.contains(e.target);
                const isClickInsidePopup = this.popup && this.popup.contains(e.target);
                
                if (!isClickInsideContainer && !isClickInsideButton && !isClickInsidePopup) {
                    this.closePopup();
                }
            };
            this.doc.addEventListener('click', this.outsideClickHandler, true);

            this.escapeHandler = (e) => {
                if (e.key === 'Escape' && this.popup.classList.contains('show')) {
                    this.closePopup();
                }
            };
            this.doc.addEventListener('keydown', this.escapeHandler);
            
            const win = this.doc.defaultView || window;
            this.scrollHandler = () => {
                if (this.popup.classList.contains('show') && this.isExternalTrigger) {
                    this.updatePopupPosition();
                }
            };
            win.addEventListener('scroll', this.scrollHandler, true);
        }

        switchCategory(category) {
            this.currentCategory = category;
            
            this.popup.querySelectorAll('.kaomoji-tab').forEach(tab => {
                if (tab.dataset.category === category) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });

            this.renderContent();
        }

        togglePopup() {
            if (this.popup.classList.contains('show')) {
                this.closePopup();
            } else {
                this.openPopup();
            }
        }

        updatePopupPosition() {
            if (!this.isExternalTrigger || !this.button) return;
            
            const rect = this.button.getBoundingClientRect();
            const popupWidth = this.popup.offsetWidth || 320;
            const popupHeight = this.popup.offsetHeight || 400;
            const margin = 8;
            
            const viewportHeight = (this.doc.defaultView || window).innerHeight;
            
            const spaceAbove = rect.top;
            const spaceBelow = viewportHeight - rect.bottom;
            
            let top;
            if (this.options.position === 'bottom') {
                if (spaceBelow >= popupHeight + margin) {
                    top = rect.bottom + margin;
                } else if (spaceAbove >= popupHeight + margin) {
                    top = rect.top - popupHeight - margin;
                } else {
                    top = rect.bottom + margin;
                }
            } else {
                if (spaceAbove >= popupHeight + margin) {
                    top = rect.top - popupHeight - margin;
                } else if (spaceBelow >= popupHeight + margin) {
                    top = rect.bottom + margin;
                } else {
                    top = rect.top - popupHeight - margin;
                }
            }
            
            let left = rect.right - popupWidth;
            if (left < margin) {
                left = margin;
            } else if (left + popupWidth > window.innerWidth - margin) {
                left = window.innerWidth - popupWidth - margin;
            }
            
            this.popup.style.top = top + 'px';
            this.popup.style.left = left + 'px';
        }
        
        /**
         * Get appropriate parent element for popup
         * Returns fullscreen container if in fullscreen, otherwise body
         */
        getAppendTarget() {
            const fullscreenElement = this.doc.fullscreenElement || 
                                     this.doc.webkitFullscreenElement || 
                                     this.doc.mozFullScreenElement || 
                                     this.doc.msFullscreenElement;
            
            if (fullscreenElement) {
                return fullscreenElement;
            }
            
            if (this.button) {
                const videoContainer = this.button.closest('#videoContainer, .video-container');
                if (videoContainer && (videoContainer === fullscreenElement || 
                    videoContainer.classList.contains('fullscreen'))) {
                    return videoContainer;
                }
            }
            
            return this.doc.body;
        }
        
        /**
         * Ensure popup is in correct parent (for fullscreen transitions)
         */
        ensureCorrectParent() {
            if (!this.popup || !this.isExternalTrigger) return;
            
            const correctParent = this.getAppendTarget();
            if (this.popup.parentElement !== correctParent) {
                correctParent.appendChild(this.popup);
            }
        }
        
        openPopup() {
            KaomojiPicker.instances.forEach(instance => {
                if (instance !== this && instance.popup.classList.contains('show')) {
                    instance.closePopup();
                }
            });
            
            this.ensureCorrectParent();
            
            this.popup.classList.add('show');
            this.button.classList.add('active');
            
            if (this.isExternalTrigger) {
                this.updatePopupPosition();
                
                const targetWindow = this.doc.defaultView || window;
                
                this.positionUpdateHandler = () => this.updatePopupPosition();
                targetWindow.addEventListener('scroll', this.positionUpdateHandler, true);
                targetWindow.addEventListener('resize', this.positionUpdateHandler);
                this.doc.addEventListener('scroll', this.positionUpdateHandler, true);
            }
        }

        closePopup() {
            this.popup.classList.remove('show');
            this.button.classList.remove('active');
            
            if (this.positionUpdateHandler) {
                const targetWindow = this.doc.defaultView || window;
                targetWindow.removeEventListener('scroll', this.positionUpdateHandler, true);
                targetWindow.removeEventListener('resize', this.positionUpdateHandler);
                this.doc.removeEventListener('scroll', this.positionUpdateHandler, true);
                this.positionUpdateHandler = null;
            }
        }

        insertKaomoji(kaomoji) {
            const startPos = this.input.selectionStart;
            const endPos = this.input.selectionEnd;
            const textBefore = this.input.value.substring(0, startPos);
            const textAfter = this.input.value.substring(endPos);

            const needSpaceBefore = startPos > 0 && textBefore[startPos - 1] !== ' ';
            const needSpaceAfter = textAfter.length > 0 && textAfter[0] !== ' ';

            const kaomojiToInsert = 
                (needSpaceBefore ? ' ' : '') + 
                kaomoji + 
                (needSpaceAfter ? ' ' : '');

            this.input.value = textBefore + kaomojiToInsert + textAfter;

            const newPos = startPos + kaomojiToInsert.length;
            this.input.setSelectionRange(newPos, newPos);

            this.input.dispatchEvent(new Event('input', { bubbles: true }));

            this.input.focus();

            this.closePopup();
        }

        destroy() {
            const win = this.doc.defaultView || window;
            if (this.scrollHandler) {
                win.removeEventListener('scroll', this.scrollHandler, true);
            }
            if (this.outsideClickHandler) {
                this.doc.removeEventListener('click', this.outsideClickHandler, true);
            }
            if (this.escapeHandler) {
                this.doc.removeEventListener('keydown', this.escapeHandler);
            }
            if (this.button && this.buttonClickHandler) {
                this.button.removeEventListener('click', this.buttonClickHandler);
            }
            
            const index = KaomojiPicker.instances.indexOf(this);
            if (index > -1) {
                KaomojiPicker.instances.splice(index, 1);
            }
            
            if (this.isExternalTrigger && this.popup && this.popup.parentNode) {
                this.popup.parentNode.removeChild(this.popup);
            }
            
            if (this.container && this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }
        }
    }

    window.KaomojiPicker = KaomojiPicker;

    /**
     * Auto-initialize for elements with data-kaomoji-picker attribute
     */
    function autoInit() {
        document.querySelectorAll('[data-kaomoji-picker]').forEach(input => {
            if (!input._kaomojiPicker) {
                const options = {};
                if (input.dataset.kaomojiPickerCompact === 'true') {
                    options.compact = true;
                }
                if (input.dataset.kaomojiPickerPosition) {
                    options.position = input.dataset.kaomojiPickerPosition;
                }
                input._kaomojiPicker = new KaomojiPicker(input, options);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }

    window.initKaomojiPickers = autoInit;

})();
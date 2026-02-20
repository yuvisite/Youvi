// Search page functionality
let allPosts = [];
let allUsers = [];

async function initSearch() {
    console.log('[Search] Initializing...');
    
    if (!window.blognoteFS.hasFolder()) {
        console.log('[Search] No folder selected');
        document.getElementById('postsFeed').innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 64px; height: 64px; color: var(--text-secondary); margin: 0 auto 24px;">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <h2>Выберите папку с данными</h2>
                <p>Нажмите на иконку папки в шапке для начала работы</p>
            </div>
        `;
        return;
    }

    try {
        await loadData();
        setupSearch();
        
        // Check URL params for initial search
        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('q');
        if (query) {
            document.getElementById('searchInput').value = query;
            performSearch(query);
        }
    } catch (err) {
        console.error('[Search] Error loading:', err);
    }
}

async function loadData() {
    const [posts, users] = await Promise.all([
        window.blognoteFS.readJSON('posts.json'),
        window.blognoteFS.readJSON('users.json')
    ]);

    allPosts = posts || [];
    allUsers = users || [];

    await setupUserMenu(allUsers);
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (!query) {
                showEmptyState();
                return;
            }
            
            searchTimeout = setTimeout(() => {
                performSearch(query);
            }, 300);
        });
    }
}

function showEmptyState() {
    const postsFeed = document.getElementById('postsFeed');
    const searchInfo = document.getElementById('searchInfo');
    
    searchInfo.textContent = '';
    postsFeed.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 64px; height: 64px; color: var(--text-secondary); margin: 0 auto 24px;">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
            </svg>
            <h2 style="font-size: 24px; margin-bottom: 12px; color: var(--text-primary);">Начните поиск</h2>
            <p style="color: var(--text-secondary); margin-bottom: 8px;">Введите запрос в поле поиска выше</p>
            <p style="color: var(--text-secondary); font-size: 12px;">
                Используйте <strong>"точный поиск"</strong> в кавычках<br>
                Добавьте <strong>#тег</strong> для поиска по тегам
            </p>
        </div>
    `;
}

function performSearch(query) {
    const postsFeed = document.getElementById('postsFeed');
    const searchInfo = document.getElementById('searchInfo');
    
    postsFeed.innerHTML = '';
    
    // Parse search query
    const searchParams = parseSearchQuery(query);
    
    // Filter posts
    let results = allPosts.filter(post => matchesSearch(post, searchParams));
    
    // Sort by relevance and date
    results = results.sort((a, b) => {
        const scoreA = calculateRelevance(a, searchParams);
        const scoreB = calculateRelevance(b, searchParams);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return new Date(b.date) - new Date(a.date);
    });
    
    // Display results
    if (results.length === 0) {
        searchInfo.textContent = '';
        postsFeed.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px; color: var(--text-secondary); margin: 0 auto 16px;">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                </svg>
                <h3 style="margin-bottom: 8px; color: var(--text-primary);">Ничего не найдено</h3>
                <p style="color: var(--text-secondary); font-size: 14px;">Попробуйте изменить запрос</p>
            </div>
        `;
        return;
    }
    
    searchInfo.textContent = `Найдено: ${results.length} ${getPluralForm(results.length, 'пост', 'поста', 'постов')}`;
    
    results.forEach(post => {
        const feedPost = createFeedPost(post, searchParams);
        postsFeed.appendChild(feedPost);
    });
}

function parseSearchQuery(query) {
    const params = {
        exact: [],
        fuzzy: [],
        tags: []
    };
    
    // Extract exact phrases in quotes
    const exactMatches = query.match(/"([^"]+)"/g);
    if (exactMatches) {
        exactMatches.forEach(match => {
            params.exact.push(match.slice(1, -1).toLowerCase());
            query = query.replace(match, '');
        });
    }
    
    // Extract tags
    const tagMatches = query.match(/#\S+/g);
    if (tagMatches) {
        tagMatches.forEach(tag => {
            params.tags.push(tag.slice(1).toLowerCase());
            query = query.replace(tag, '');
        });
    }
    
    // Remaining words are fuzzy search
    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    params.fuzzy = words.map(w => w.toLowerCase());
    
    return params;
}

function matchesSearch(post, params) {
    const title = post.title.toLowerCase();
    const content = post.content.toLowerCase();
    const tags = (post.tags || []).map(t => t.toLowerCase());
    
    // Check exact matches
    for (const exact of params.exact) {
        if (!title.includes(exact) && !content.includes(exact)) {
            return false;
        }
    }
    
    // Check tags
    for (const tag of params.tags) {
        const found = tags.some(t => fuzzyMatch(t, tag));
        if (!found) return false;
    }
    
    // Check fuzzy matches
    if (params.fuzzy.length > 0) {
        const allMatched = params.fuzzy.every(word => {
            return fuzzyMatchInText(title, word) || fuzzyMatchInText(content, word) || 
                   tags.some(t => fuzzyMatch(t, word));
        });
        if (!allMatched) return false;
    }
    
    return true;
}

function fuzzyMatchInText(text, word) {
    // Check direct inclusion
    if (text.includes(word)) return true;
    
    // Check word stems (basic implementation)
    const words = text.split(/\s+/);
    return words.some(w => fuzzyMatch(w, word));
}

function fuzzyMatch(word1, word2) {
    // Normalize
    word1 = word1.toLowerCase().replace(/[^\wа-яё]/g, '');
    word2 = word2.toLowerCase().replace(/[^\wа-яё]/g, '');
    
    // Direct match
    if (word1 === word2) return true;
    
    // One contains another
    if (word1.includes(word2) || word2.includes(word1)) return true;
    
    // Stem matching - compare first 4 characters for Russian/English
    const minLen = Math.min(4, Math.min(word1.length, word2.length));
    if (minLen >= 3 && word1.slice(0, minLen) === word2.slice(0, minLen)) {
        return true;
    }
    
    // Levenshtein distance for typos
    const distance = levenshteinDistance(word1, word2);
    const maxLen = Math.max(word1.length, word2.length);
    return distance <= Math.floor(maxLen * 0.3); // 30% tolerance
}

function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

function calculateRelevance(post, params) {
    let score = 0;
    const title = post.title.toLowerCase();
    const content = post.content.toLowerCase();
    
    // Exact matches in title = high score
    params.exact.forEach(exact => {
        if (title.includes(exact)) score += 10;
        if (content.includes(exact)) score += 3;
    });
    
    // Tag matches = medium score
    const tags = (post.tags || []).map(t => t.toLowerCase());
    params.tags.forEach(tag => {
        if (tags.some(t => fuzzyMatch(t, tag))) score += 5;
    });
    
    // Fuzzy matches
    params.fuzzy.forEach(word => {
        if (title.includes(word)) score += 7;
        else if (fuzzyMatchInText(title, word)) score += 4;
        if (content.includes(word)) score += 2;
        else if (fuzzyMatchInText(content, word)) score += 1;
    });
    
    return score;
}

function createFeedPost(post, searchParams) {
    const author = allUsers.find(u => u.id === post.authorId);
    const imageMatch = post.content.match(/!\[.*?\]\((.*?)\)/);
    const firstImagePath = imageMatch ? imageMatch[1] : null;
    
    const feedPost = document.createElement('article');
    feedPost.className = 'feed-post';
    if (firstImagePath) {
        feedPost.classList.add('feed-post-with-image');
    }
    feedPost.onclick = () => {
        window.location.href = `post.html?id=${post.id}`;
    };

    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'feed-post-header-wrapper';

    const header = document.createElement('div');
    header.className = 'feed-post-header';

    const avatar = document.createElement('div');
    avatar.className = 'feed-post-avatar';
    
    if (author && author.avatar) {
        loadImageFromFS(author.avatar).then(blobUrl => {
            if (blobUrl) {
                avatar.style.backgroundImage = `url(${blobUrl})`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
                avatar.innerHTML = '';
            }
        }).catch(() => {
            avatar.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 10px; height: 10px;">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
            `;
        });
    } else {
        avatar.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 10px; height: 10px;">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
        `;
    }

    const authorInfo = document.createElement('div');
    authorInfo.className = 'feed-post-author-info';

    const authorLink = document.createElement('a');
    authorLink.className = 'feed-post-author';
    authorLink.href = `profile.html?id=${post.authorId}`;
    authorLink.textContent = author ? author.name : 'Неизвестный автор';
    authorLink.onclick = (e) => e.stopPropagation();

    const date = document.createElement('span');
    date.className = 'feed-post-date';
    date.textContent = '· ' + formatDate(post.date);

    authorInfo.appendChild(authorLink);
    authorInfo.appendChild(date);
    header.appendChild(avatar);
    header.appendChild(authorInfo);
    headerWrapper.appendChild(header);

    if (firstImagePath) {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'feed-post-thumbnail';
        const img = document.createElement('img');
        img.alt = post.title;
        
        loadImageFromFS(firstImagePath).then(blobUrl => {
            if (blobUrl) {
                img.src = blobUrl;
            }
        }).catch(err => {
            console.error('[Search] Error loading image:', err);
        });
        
        thumbnail.appendChild(img);
        headerWrapper.appendChild(thumbnail);
    }

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'feed-post-content-wrapper';

    const mainContent = document.createElement('div');
    mainContent.className = 'feed-post-main-content';

    const title = document.createElement('h2');
    title.className = 'feed-post-title';
    title.textContent = post.title;

    const excerpt = document.createElement('div');
    excerpt.className = 'feed-post-excerpt';
    excerpt.textContent = post.excerpt || post.content.substring(0, 120) + '...';

    mainContent.appendChild(title);
    mainContent.appendChild(excerpt);
    contentWrapper.appendChild(mainContent);

    const footer = document.createElement('div');
    footer.className = 'feed-post-footer';

    if (post.tags && post.tags.length > 0) {
        const tags = document.createElement('span');
        tags.className = 'feed-post-tags';
        post.tags.slice(0, 2).forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'feed-post-tag';
            tagEl.textContent = `#${tag}`;
            tags.appendChild(tagEl);
        });
        footer.appendChild(tags);
    }

    const viewsStat = document.createElement('div');
    viewsStat.className = 'feed-post-stat';
    viewsStat.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>${post.views || 0}</span>
    `;

    const likesStat = document.createElement('div');
    likesStat.className = 'feed-post-stat';
    likesStat.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span>${post.likes || 0}</span>
    `;

    footer.appendChild(viewsStat);
    footer.appendChild(likesStat);

    // Bookmark link
    const bookmarkLink = document.createElement('a');
    bookmarkLink.className = 'feed-post-bookmark-link';
    bookmarkLink.href = '#';
    bookmarkLink.textContent = 'В закладки';
    bookmarkLink.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePostBookmark(post.id, bookmarkLink);
    };
    footer.appendChild(bookmarkLink);

    feedPost.appendChild(headerWrapper);
    feedPost.appendChild(contentWrapper);
    feedPost.appendChild(footer);

    return feedPost;
}

async function togglePostBookmark(postId, link) {
    try {
        let bookmarkedPosts = await window.blognoteFS.readJSON('bookmarks.json') || [];
        const index = bookmarkedPosts.indexOf(postId);
        
        if (index > -1) {
            bookmarkedPosts.splice(index, 1);
            link.textContent = 'В закладки';
        } else {
            bookmarkedPosts.push(postId);
            link.textContent = 'Удалить из закладок';
        }
        
        await window.blognoteFS.writeJSON('bookmarks.json', bookmarkedPosts);
    } catch (err) {
        console.error('[Search] Error toggling bookmark:', err);
    }
}

async function loadImageFromFS(imagePath) {
    try {
        const file = await window.blognoteFS.readFile(imagePath);
        return URL.createObjectURL(file);
    } catch (err) {
        console.error('[Search] Failed to load image:', imagePath, err);
        return null;
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 7) return `${days} д назад`;
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPluralForm(n, form1, form2, form5) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return form5;
    if (n1 > 1 && n1 < 5) return form2;
    if (n1 === 1) return form1;
    return form5;
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initSearch();
    }, 200);
    
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
    }
    
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', async () => {
            await window.blognoteFS.selectFolder();
            window.location.reload();
        });
    }
    
    const createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', () => {
            window.location.href = 'editor.html';
        });
    }
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark-theme');
            const isDark = document.documentElement.classList.contains('dark-theme');
            localStorage.setItem('blognote-theme', isDark ? 'dark' : 'light');
        });
    }
});

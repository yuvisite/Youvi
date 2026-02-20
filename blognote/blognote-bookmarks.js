// Bookmarks page functionality
let allPosts = [];
let allUsers = [];

async function initBookmarks() {
    console.log('[Bookmarks] Initializing...');
    
    if (!window.blognoteFS.hasFolder()) {
        console.log('[Bookmarks] No folder selected');
        window.location.href = 'feed.html';
        return;
    }

    try {
        await loadData();
        renderBookmarks();
    } catch (err) {
        console.error('[Bookmarks] Error loading:', err);
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
    populatePopularTags();
    updateMyPostsLink();
}

function updateMyPostsLink() {
    const myPostsLink = document.getElementById('myPostsLink');
    if (!myPostsLink) return;
    
    const currentUserId = localStorage.getItem('blognote-current-user');
    if (currentUserId) {
        myPostsLink.href = `profile.html?id=${currentUserId}`;
    }
}

async function populatePopularTags() {
    const popularTagsEl = document.getElementById('popularTags');
    if (!popularTagsEl) return;

    try {
        const bookmarkedIds = await window.blognoteFS.readJSON('bookmarks.json') || [];
        const bookmarkedPosts = allPosts.filter(p => bookmarkedIds.includes(p.id));

        const tagCounts = {};
        bookmarkedPosts.forEach(post => {
            if (post.tags) {
                post.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });

        const sortedTags = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20);

        if (sortedTags.length === 0) {
            popularTagsEl.innerHTML = '<div style="padding: 0 12px; font-size: 12px; color: var(--text-secondary);">Нет тегов</div>';
            return;
        }

        popularTagsEl.innerHTML = '';
        sortedTags.forEach(([tag, count]) => {
            const tagEl = document.createElement('a');
        tagEl.className = 'sidebar-tag';
        tagEl.href = `feed.html`;
        tagEl.innerHTML = `
            <span>#${tag}</span>
            <span class="sidebar-tag-count">${count}</span>
        `;
        popularTagsEl.appendChild(tagEl);
    });
    } catch (err) {
        console.error('[Bookmarks] Error populating tags:', err);
    }
}

async function renderBookmarks() {
    const postsFeed = document.getElementById('postsFeed');
    postsFeed.innerHTML = '';

    try {
        const bookmarkedIds = await window.blognoteFS.readJSON('bookmarks.json') || [];
        const bookmarkedPosts = allPosts.filter(p => bookmarkedIds.includes(p.id));

        if (bookmarkedPosts.length === 0) {
            postsFeed.innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 64px; height: 64px; color: var(--text-secondary); margin: 0 auto 24px;">
                        <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                    </svg>
                    <h2 style="font-size: 24px; margin-bottom: 12px; color: var(--text-primary);">Нет сохраненных постов</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 24px;">Добавляйте посты в закладки, чтобы быстро находить их позже</p>
                    <button onclick="window.location.href='feed.html'" class="btn btn-primary">
                        Перейти к ленте
                    </button>
                </div>
            `;
        return;
    }

    bookmarkedPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
    bookmarkedPosts.forEach(post => {
        const feedPost = createFeedPost(post);
        postsFeed.appendChild(feedPost);
    });

    setupSearch();
    } catch (err) {
        console.error('[Bookmarks] Error rendering bookmarks:', err);
    }
}

function createFeedPost(post) {
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
        }).catch(err => {
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
            console.error('[Bookmarks] Error loading image:', err);
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

    // Remove bookmark link
    const bookmarkLink = document.createElement('a');
    bookmarkLink.className = 'feed-post-bookmark-link';
    bookmarkLink.href = '#';
    bookmarkLink.textContent = 'Удалить из закладок';
    bookmarkLink.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeFromBookmarks(post.id);
    };
    footer.appendChild(bookmarkLink);

    feedPost.appendChild(headerWrapper);
    feedPost.appendChild(contentWrapper);
    feedPost.appendChild(footer);

    return feedPost;
}

async function removeFromBookmarks(postId) {
    try {
        let bookmarkedPosts = await window.blognoteFS.readJSON('bookmarks.json') || [];
        const index = bookmarkedPosts.indexOf(postId);
        
        if (index > -1) {
            bookmarkedPosts.splice(index, 1);
            await window.blognoteFS.writeJSON('bookmarks.json', bookmarkedPosts);
            renderBookmarks();
        }
    } catch (err) {
        console.error('[Bookmarks] Error removing bookmark:', err);
    }
}

async function loadImageFromFS(imagePath) {
    try {
        const file = await window.blognoteFS.readFile(imagePath);
        return URL.createObjectURL(file);
    } catch (err) {
        console.error('[Bookmarks] Failed to load image:', imagePath, err);
        return null;
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    if (days === 0) return `Сегодня в ${timeStr}`;
    if (days === 1) return `Вчера в ${timeStr}`;
    if (days < 7) return `${days} дн. назад в ${timeStr}`;
    if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) + ` в ${timeStr}`;
}

async function setupSearch() {
    // Global search redirects to search page
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    window.location.href = `search.html?q=${encodeURIComponent(query)}`;
                }
            }
        });
        
        searchInput.addEventListener('focus', () => {
            searchInput.placeholder = 'Нажмите Enter для поиска...';
        });
        
        searchInput.addEventListener('blur', () => {
            searchInput.placeholder = 'Поиск постов...';
        });
    }
    
    // Local search for bookmarks on this page
    const localSearchInput = document.getElementById('localSearchInput');
    if (localSearchInput) {
        let searchTimeout;
        localSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                const query = localSearchInput.value.toLowerCase().trim();
                const postsFeed = document.getElementById('postsFeed');
                postsFeed.innerHTML = '';

                try {
                    const bookmarkedIds = await window.blognoteFS.readJSON('bookmarks.json') || [];
                    let bookmarkedPosts = allPosts.filter(p => bookmarkedIds.includes(p.id));

                    if (query) {
                        bookmarkedPosts = bookmarkedPosts.filter(post => {
                            return post.title.toLowerCase().includes(query) ||
                                   post.content.toLowerCase().includes(query) ||
                                   (post.tags && post.tags.some(tag => tag.toLowerCase().includes(query)));
                        });
                    }

                    bookmarkedPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
                    bookmarkedPosts.forEach(post => {
                        const feedPost = createFeedPost(post);
                        postsFeed.appendChild(feedPost);
                    });

                    if (bookmarkedPosts.length === 0) {
                        postsFeed.innerHTML = `
                            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                                <p>Ничего не найдено</p>
                            </div>
                        `;
                    }
                } catch (err) {
                    console.error('[Bookmarks] Error searching:', err);
                }
            }, 300);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initBookmarks();
    }, 200);
    
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
    }
    
    // Folder selection - redirect to feed
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', () => {
            window.location.href = 'feed.html';
        });
    }
    
    const createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', () => {
            window.location.href = 'editor.html';
        });
    }
    
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    if (sidebarToggle && sidebar) {
        const isCollapsed = localStorage.getItem('blognote-sidebar-collapsed') === 'true';
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
        }
        
        setTimeout(() => {
            sidebar.classList.add('sidebar-ready');
        }, 100);
        
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const collapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('blognote-sidebar-collapsed', collapsed);
            sidebarToggle.title = collapsed ? 'Развернуть' : 'Свернуть';
        });
    }
});

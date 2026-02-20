// Feed page functionality
let allPosts = [];
let allUsers = [];
let currentFilter = 'new';

async function initFeed() {
    console.log('[Feed] Initializing feed...');
    console.log('[Feed] Has folder:', window.blognoteFS.hasFolder());
    
    if (!window.blognoteFS.hasFolder()) {
        console.log('[Feed] No folder selected, showing empty state');
        showEmptyState();
        return;
    }

    showLoadingState();

    try {
        console.log('[Feed] Loading data...');
        await loadData();
        console.log('[Feed] Data loaded, rendering feed');
        renderFeed();
    } catch (err) {
        console.error('[Feed] Error loading feed:', err);
        showEmptyState();
    }
}

async function loadData() {
    console.log('[Feed] Reading JSON files...');
    const [posts, users] = await Promise.all([
        window.blognoteFS.readJSON('posts.json'),
        window.blognoteFS.readJSON('users.json')
    ]);

    console.log('[Feed] Posts loaded:', posts ? posts.length : 0);
    console.log('[Feed] Users loaded:', users ? users.length : 0);

    allPosts = posts || [];
    allUsers = users || [];

    // Populate user menu once
    await setupUserMenu(allUsers);
    populatePopularTags();
    updateMyPostsLink();
    
    // Check if tag in URL
    const urlParams = new URLSearchParams(window.location.search);
    const tagFromUrl = urlParams.get('tag');
    if (tagFromUrl) {
        currentFilter = 'tag';
        currentTag = tagFromUrl;
        const feedTitle = document.getElementById('feedTitle');
        if (feedTitle) {
            feedTitle.textContent = `Лента постов: #${tagFromUrl}`;
        }
        document.title = `#${tagFromUrl} | Blognote`;
    }
}

function updateMyPostsLink() {
    const myPostsLink = document.getElementById('myPostsLink');
    if (!myPostsLink) return;
    
    const currentUserId = localStorage.getItem('blognote-current-user');
    if (currentUserId) {
        myPostsLink.href = `profile.html?id=${currentUserId}`;
        console.log('[Feed] Updated "Мои посты" link with user ID:', currentUserId);
    } else {
        myPostsLink.href = 'profile.html';
        console.log('[Feed] No current user, using default profile link');
    }
}

function populatePopularTags() {
    const popularTagsEl = document.getElementById('popularTags');
    if (!popularTagsEl) return;

    // Count tags
    const tagCounts = {};
    allPosts.forEach(post => {
        if (post.tags) {
            post.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });

    // Sort by count
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
        tagEl.href = '#';
        tagEl.innerHTML = `
            <span>#${tag}</span>
            <span class="sidebar-tag-count">${count}</span>
        `;
        tagEl.onclick = (e) => {
            e.preventDefault();
            filterByTag(tag);
        };
        popularTagsEl.appendChild(tagEl);
    });
}

function filterByTag(tag) {
    console.log('[Feed] Filtering by tag:', tag);
    currentFilter = 'tag';
    currentTag = tag;
    
    // Update URL with tag
    const url = new URL(window.location);
    url.searchParams.set('tag', tag);
    window.history.pushState({}, '', url);
    
    // Update title
    const feedTitle = document.getElementById('feedTitle');
    if (feedTitle) {
        feedTitle.textContent = `Лента постов: #${tag}`;
    }
    
    // Update page title
    document.title = `#${tag} | Blognote`;
    
    renderFeed();
}

let currentTag = null;

function renderFeed() {
    console.log('[Feed] === RENDER FEED START ===');
    console.log('[Feed] Total posts loaded:', allPosts.length);
    console.log('[Feed] All posts:', allPosts);
    
    const emptyState = document.getElementById('emptyState');
    const loadingState = document.getElementById('loadingState');
    const feedContent = document.getElementById('feedContent');
    
    emptyState.style.display = 'none';
    loadingState.style.display = 'none';
    feedContent.style.display = 'block';

    const postsFeed = document.getElementById('postsFeed');
    postsFeed.innerHTML = '';

    let filteredPosts = getFilteredPosts();
    console.log('[Feed] Filtered posts count:', filteredPosts.length);
    console.log('[Feed] Filtered posts:', filteredPosts);
    
    // Sort based on current filter
    if (currentFilter === 'old') {
        // Sort by date (oldest first)
        filteredPosts.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (currentFilter === 'random') {
        // Shuffle array randomly
        for (let i = filteredPosts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [filteredPosts[i], filteredPosts[j]] = [filteredPosts[j], filteredPosts[i]];
        }
    } else {
        // Default: new posts first (newest first)
        filteredPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    
    console.log('[Feed] Posts after sorting:', filteredPosts.map(p => ({ id: p.id, date: p.date, title: p.title })));

    if (filteredPosts.length === 0) {
        postsFeed.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 64px; height: 64px; color: var(--text-secondary); margin: 0 auto 24px;">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <h2 style="font-size: 24px; margin-bottom: 12px; color: var(--text-primary);">Начните писать</h2>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">Создайте свой первый пост и поделитесь мыслями с миром</p>
                <button onclick="window.location.href='editor.html'" class="btn-primary" style="padding: 12px 24px; font-size: 16px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px; margin-right: 8px;">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Создать первый пост
                </button>
            </div>
        `;
        return;
    }

    filteredPosts.forEach(post => {
        console.log('[Feed] Creating post card for:', post.id, post.title);
        try {
            const feedPost = createFeedPost(post);
            postsFeed.appendChild(feedPost);
            console.log('[Feed] Post card created successfully:', post.id);
        } catch (err) {
            console.error('[Feed] ERROR creating post card:', post.id, err);
        }
    });

    console.log('[Feed] === RENDER FEED END ===');

    // Setup filters and search
    setupFilters();
    setupSearch();
}

function getFilteredPosts() {
    let filtered = allPosts;

    // Apply tag filter
    if (currentFilter === 'tag' && currentTag) {
        filtered = filtered.filter(post => post.tags && post.tags.includes(currentTag));
    }

    // Apply search filter
    const searchQuery = document.getElementById('searchInput')?.value.toLowerCase().trim();
    if (searchQuery) {
        filtered = filtered.filter(post => 
            post.title.toLowerCase().includes(searchQuery) ||
            post.content.toLowerCase().includes(searchQuery) ||
            (post.tags && post.tags.some(tag => tag.toLowerCase().includes(searchQuery)))
        );
    }

    return filtered;
}

function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter;
            currentTag = null;
            
            // Clear URL and reset title
            const url = new URL(window.location);
            url.searchParams.delete('tag');
            window.history.pushState({}, '', url);
            
            const feedTitle = document.getElementById('feedTitle');
            if (feedTitle) {
                feedTitle.textContent = 'Лента постов';
            }
            
            // Reset page title
            document.title = 'Лента | Blognote';
            
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderFeed();
        });
    });
}

function setupSearch() {
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
}

function createFeedPost(post) {
    console.log('[Feed] createFeedPost called for:', post.id);
    console.log('[Feed] Post data:', post);
    
    const author = allUsers.find(u => u.id === post.authorId);
    console.log('[Feed] Author found:', author ? author.name : 'NOT FOUND');
    
    // Extract first image from content
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

    // Header wrapper (contains header + thumbnail)
    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'feed-post-header-wrapper';

    // Header
    const header = document.createElement('div');
    header.className = 'feed-post-header';

    const avatar = document.createElement('div');
    avatar.className = 'feed-post-avatar';
    
    if (author && author.avatar) {
        // Load custom avatar
        loadImageFromFS(author.avatar).then(blobUrl => {
            if (blobUrl) {
                avatar.style.backgroundImage = `url(${blobUrl})`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
                avatar.innerHTML = '';
            }
        }).catch(err => {
            console.error('[Feed] Error loading avatar:', err);
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

    // Thumbnail if image exists (in header wrapper)
    if (firstImagePath) {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'feed-post-thumbnail';
        const img = document.createElement('img');
        img.alt = post.title;
        
        // Load image from FileSystem API
        loadImageFromFS(firstImagePath).then(blobUrl => {
            if (blobUrl) {
                img.src = blobUrl;
            }
        }).catch(err => {
            console.error('[Feed] Error loading image:', err);
        });
        
        thumbnail.appendChild(img);
        headerWrapper.appendChild(thumbnail);
    }

    // Content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'feed-post-content-wrapper';

    // Main content
    const mainContent = document.createElement('div');
    mainContent.className = 'feed-post-main-content';

    // Title
    const title = document.createElement('h2');
    title.className = 'feed-post-title';
    title.textContent = post.title;

    // Excerpt
    const excerpt = document.createElement('div');
    excerpt.className = 'feed-post-excerpt';
    excerpt.textContent = post.excerpt || post.content.substring(0, 120) + '...';

    mainContent.appendChild(title);
    mainContent.appendChild(excerpt);
    contentWrapper.appendChild(mainContent);

    // Footer
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
        console.error('[Feed] Error toggling bookmark:', err);
    }
}

async function loadImageFromFS(imagePath) {
    try {
        const file = await window.blognoteFS.readFile(imagePath);
        return URL.createObjectURL(file);
    } catch (err) {
        console.error('[Feed] Failed to load image:', imagePath, err);
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

function showEmptyState() {
    console.log('[Feed] Showing empty state');
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('feedContent').style.display = 'none';
}

function showLoadingState() {
    console.log('[Feed] Showing loading state');
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('feedContent').style.display = 'none';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Feed] DOM loaded');
    
    // Wait a bit for BlognoteFS to initialize
    setTimeout(() => {
        console.log('[Feed] Starting initialization');
        initFeed();
    }, 200);
    
    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
    }
    
    // Folder selection button - select folder
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', async () => {
            await window.blognoteFS.selectFolder();
            window.location.reload();
        });
    }
    
    // Create post button
    const createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', () => {
            console.log('[Feed] Create post button clicked');
            window.location.href = 'editor.html';
        });
    }
    
    // Select folder button on empty state
    const selectFolderBtnEmpty = document.getElementById('selectFolderBtnEmpty');
    if (selectFolderBtnEmpty) {
        selectFolderBtnEmpty.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Feed] Select folder button clicked');
            const success = await window.blognoteFS.selectFolder();
            console.log('[Feed] Selection result:', success);
            if (success) {
                console.log('[Feed] Initializing feed...');
                await initFeed();
            }
        });
    }
    
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    if (sidebarToggle && sidebar) {
        // Load saved state
        const isCollapsed = localStorage.getItem('blognote-sidebar-collapsed') === 'true';
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
        }
        
        // Enable transitions after initial render
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

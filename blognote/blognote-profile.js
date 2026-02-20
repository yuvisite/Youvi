// Profile page functionality
let currentUser = null;
let allPosts = [];
let allUsers = [];

async function loadUsers() {
    console.log('[Profile] Loading users...');
    console.log('[Profile] Has folder:', window.blognoteFS.hasFolder());
    
    if (!window.blognoteFS.hasFolder()) {
        console.log('[Profile] No folder selected');
        showEmptyState();
        return;
    }

    try {
        allUsers = await window.blognoteFS.readJSON('users.json') || [];
        console.log('[Profile] Users loaded:', allUsers.length);
        
        if (allUsers && allUsers.length > 0) {
            populateUserMenu();
            
            // Check URL for user ID
            const urlParams = new URLSearchParams(window.location.search);
            const userId = urlParams.get('id');
            
            if (userId) {
                loadUserProfile(userId);
            } else {
                // Load current user from localStorage, or first user as fallback
                const currentUserId = localStorage.getItem('blognote-current-user');
                if (currentUserId && allUsers.find(u => u.id === currentUserId)) {
                    loadUserProfile(currentUserId);
                } else {
                    loadUserProfile(allUsers[0].id);
                }
            }
        } else {
            console.log('[Profile] No users found, redirecting to editor');
            alert('Сначала создайте пользователя');
            window.location.href = 'editor.html';
        }
    } catch (err) {
        console.error('[Profile] Error loading users:', err);
        showEmptyState();
    }
}

function populateUserMenu() {
    setupUserMenu(allUsers);
}

async function loadUserProfile(userId) {
    try {
        if (!allUsers || allUsers.length === 0) {
            allUsers = await window.blognoteFS.readJSON('users.json');
        }
        
        currentUser = allUsers.find(u => u.id === userId);
        
        if (!currentUser) return;

        // Load posts
        const posts = await window.blognoteFS.readJSON('posts.json');
        allPosts = posts ? posts.filter(p => p.authorId === userId) : [];

        renderProfile();
    } catch (err) {
        console.error('Error loading profile:', err);
    }
}

function renderProfile() {
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const profileContent = document.getElementById('profileContent');
    const profileBanner = document.getElementById('profileBanner');
    
    loadingState.style.display = 'none';
    emptyState.style.display = 'none';
    profileContent.style.display = 'block';
    
    // Show and load banner
    if (profileBanner) {
        if (currentUser.banner) {
            profileBanner.style.display = 'block';
            window.blognoteFS.readFile(currentUser.banner).then(file => {
                const url = URL.createObjectURL(file);
                profileBanner.style.backgroundImage = `url(${url})`;
            }).catch(err => {
                console.error('[Profile] Error loading banner:', err);
                profileBanner.style.background = '#757575';
            });
        } else {
            profileBanner.style.display = 'block';
            profileBanner.style.background = '#757575';
        }
    }

    // Update page title with user name
    document.title = `${currentUser.name} | Blognote`;
    
    // Profile header
    const avatar = document.getElementById('profileAvatar');
    const name = document.getElementById('profileName');
    const postsCount = document.getElementById('postsCount');
    const joinDate = document.getElementById('joinDate');
    const bio = document.getElementById('profileBio');

    avatar.textContent = currentUser.name.charAt(0).toUpperCase();
    if (currentUser.avatar) {
        window.blognoteFS.readFile(currentUser.avatar).then(file => {
            const url = URL.createObjectURL(file);
            avatar.style.backgroundImage = `url(${url})`;
            avatar.textContent = '';
        }).catch(err => {
            console.error('[Profile] Error loading avatar:', err);
        });
    }

    name.textContent = currentUser.name;
    postsCount.textContent = `${allPosts.length} ${allPosts.length === 1 ? 'пост' : 'постов'}`;
    joinDate.textContent = currentUser.joinDate || 'Дата не указана';
    bio.innerHTML = `<h3 class="bio-title">О себе</h3><p>${currentUser.bio || 'Биография не указана'}</p>`;

    // Render posts
    renderPosts();
    
    // Render tags
    renderTopTags();
}

let currentSort = 'new';
let currentTagFilter = null;
let currentSearchQuery = '';

function renderTopTags() {
    const tagsContainer = document.getElementById('profileTags');
    if (!tagsContainer) return;
    
    // Count tags
    const tagCounts = {};
    allPosts.forEach(post => {
        if (post.tags) {
            post.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });
    
    // Sort and get top 10
    const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    tagsContainer.innerHTML = '';
    
    if (sortedTags.length === 0) {
        tagsContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 12px; padding: 0 12px;">Тегов пока нет</p>';
        return;
    }
    
    sortedTags.forEach(([tag, count]) => {
        const tagBtn = document.createElement('button');
        tagBtn.className = 'sidebar-tag';
        tagBtn.innerHTML = `
            <span>#${tag}</span>
            <span class="sidebar-tag-count">${count}</span>
        `;
        tagBtn.onclick = () => filterByTag(tag, tagBtn);
        tagsContainer.appendChild(tagBtn);
    });
}

function filterByTag(tag, element) {
    // Toggle tag filter
    if (currentTagFilter === tag) {
        currentTagFilter = null;
        document.querySelectorAll('.sidebar-tag').forEach(el => el.classList.remove('active'));
        
        // Clear URL
        const url = new URL(window.location);
        url.searchParams.delete('tag');
        window.history.pushState({}, '', url);
    } else {
        currentTagFilter = tag;
        document.querySelectorAll('.sidebar-tag').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        
        // Update URL with tag
        const url = new URL(window.location);
        url.searchParams.set('tag', tag);
        window.history.pushState({}, '', url);
    }
    renderPosts();
}

function renderPosts() {
    const postsGrid = document.getElementById('postsGrid');
    postsGrid.innerHTML = '';

    if (allPosts.length === 0) {
        postsGrid.innerHTML = '<p style="color: var(--text-secondary);">Постов пока нет</p>';
        return;
    }

    // Filter by tag
    let filteredPosts = allPosts;
    if (currentTagFilter) {
        filteredPosts = allPosts.filter(post => 
            post.tags && post.tags.includes(currentTagFilter)
        );
    }
    
    // Filter by local search query
    const localSearchInput = document.getElementById('localSearchInput');
    const searchQuery = localSearchInput ? localSearchInput.value.toLowerCase().trim() : '';
    if (searchQuery) {
        filteredPosts = filteredPosts.filter(post => 
            post.title.toLowerCase().includes(searchQuery) ||
            post.content.toLowerCase().includes(searchQuery) ||
            (post.tags && post.tags.some(tag => tag.toLowerCase().includes(searchQuery)))
        );
    }
    
    if (filteredPosts.length === 0) {
        postsGrid.innerHTML = '<p style="color: var(--text-secondary);">Постов не найдено</p>';
        return;
    }

    // Sort by date
    const sortedPosts = [...filteredPosts].sort((a, b) => {
        if (currentSort === 'new') {
            return new Date(b.date) - new Date(a.date);
        } else {
            return new Date(a.date) - new Date(b.date);
        }
    });

    sortedPosts.forEach(post => {
        const feedPost = createFeedPost(post);
        postsGrid.appendChild(feedPost);
    });
}

function createFeedPost(post) {
    const author = currentUser;
    
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
            console.error('[Profile] Error loading avatar:', err);
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
            console.error('[Profile] Error loading image:', err);
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
        console.error('[Profile] Error toggling bookmark:', err);
    }
}

async function loadImageFromFS(imagePath) {
    try {
        const file = await window.blognoteFS.readFile(imagePath);
        return URL.createObjectURL(file);
    } catch (err) {
        console.error('[Profile] Failed to load image:', imagePath, err);
        return null;
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Сегодня';
    if (days === 1) return 'Вчера';
    if (days < 7) return `${days} дн. назад`;
    if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showEmptyState() {
    console.log('[Profile] Showing empty state');
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('profileContent').style.display = 'none';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Profile] DOM loaded');
    
    setTimeout(() => {
        console.log('[Profile] Starting initialization');
        loadUsers();
    }, 200);
    
    // Subscribe button
    const subscribeBtn = document.getElementById('subscribeBtn');
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', () => {
            // Placeholder for subscribe functionality
            console.log('Subscribe clicked');
        });
    }
    
    // Create post button
    const createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', () => {
            window.location.href = 'editor.html';
        });
    }
    
    // Folder button - redirect to feed
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', () => {
            window.location.href = 'feed.html';
        });
    }
    
    // Settings button - redirect to settings
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
    }
    
    // Search input
    const searchInput = document.getElementById('profileSearchInput');
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
    
    // Local search for profile posts
    const localSearchInput = document.getElementById('localSearchInput');
    if (localSearchInput) {
        let searchTimeout;
        localSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                renderPosts();
            }, 300);
        });
    }
    
    // Sort filters
    document.querySelectorAll('.sidebar-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentSort = btn.dataset.sort;
            document.querySelectorAll('.sidebar-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPosts();
        });
    });
});

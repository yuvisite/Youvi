// Users page functionality
let allUsers = [];
let allPosts = [];

async function initUsers() {
    console.log('[Users] Initializing users page...');
    console.log('[Users] Has folder:', window.blognoteFS.hasFolder());
    
    if (!window.blognoteFS.hasFolder()) {
        console.log('[Users] No folder selected, showing empty state');
        showEmptyState();
        return;
    }

    try {
        console.log('[Users] Loading data...');
        await loadData();
        console.log('[Users] Data loaded, rendering users');
        renderUsers();
    } catch (err) {
        console.error('[Users] Error loading users:', err);
        showEmptyState();
    }
}

async function loadData() {
    console.log('[Users] Reading JSON files...');
    const [users, posts] = await Promise.all([
        window.blognoteFS.readJSON('users.json'),
        window.blognoteFS.readJSON('posts.json')
    ]);

    console.log('[Users] Users loaded:', users ? users.length : 0);
    console.log('[Users] Posts loaded:', posts ? posts.length : 0);

    allUsers = users || [];
    allPosts = posts || [];

    // Setup user menu
    await setupUserMenu(allUsers);
    populatePopularTags();
    updateMyPostsLink();
}

let currentTagFilter = null;

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
        const tagEl = document.createElement('button');
        tagEl.className = 'sidebar-tag';
        tagEl.innerHTML = `
            <span>#${tag}</span>
            <span class="sidebar-tag-count">${count}</span>
        `;
        tagEl.onclick = () => filterByTag(tag, tagEl);
        popularTagsEl.appendChild(tagEl);
    });
}

function filterByTag(tag, element) {
    // Toggle tag filter
    if (currentTagFilter === tag) {
        currentTagFilter = null;
        document.querySelectorAll('.sidebar-tag').forEach(el => el.classList.remove('active'));
        
        // Clear URL and reset title
        const url = new URL(window.location);
        url.searchParams.delete('tag');
        window.history.pushState({}, '', url);
        
        const usersTitle = document.getElementById('usersTitle');
        if (usersTitle) {
            usersTitle.textContent = 'Авторы';
        }
        
        // Reset page title
        document.title = 'Авторы | Blognote';
    } else {
        currentTagFilter = tag;
        document.querySelectorAll('.sidebar-tag').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        
        // Update URL with tag
        const url = new URL(window.location);
        url.searchParams.set('tag', tag);
        window.history.pushState({}, '', url);
        
        // Update title
        const usersTitle = document.getElementById('usersTitle');
        if (usersTitle) {
            usersTitle.textContent = `Авторы: #${tag}`;
        }
        
        // Update page title
        document.title = `Авторы: #${tag} | Blognote`;
    }
    renderUsers();
}

function renderUsers() {
    const emptyState = document.getElementById('emptyState');
    const usersContent = document.getElementById('usersContent');
    
    if (allUsers.length === 0) {
        showEmptyState();
        return;
    }

    emptyState.style.display = 'none';
    usersContent.style.display = 'block';

    const usersGrid = document.getElementById('usersGrid');
    usersGrid.innerHTML = '';

    // Apply search filter from local search input
    const localSearchInput = document.getElementById('localSearchInput');
    const searchQuery = localSearchInput ? localSearchInput.value.toLowerCase().trim() : '';
    let filteredUsers = allUsers;
    
    if (searchQuery) {
        filteredUsers = allUsers.filter(user => 
            user.name.toLowerCase().includes(searchQuery) ||
            (user.email && user.email.toLowerCase().includes(searchQuery)) ||
            (user.bio && user.bio.toLowerCase().includes(searchQuery))
        );
    }
    
    // Filter by tag - show users who have posts with this tag
    if (currentTagFilter) {
        filteredUsers = filteredUsers.filter(user => {
            const userPosts = allPosts.filter(p => p.authorId === user.id);
            return userPosts.some(post => post.tags && post.tags.includes(currentTagFilter));
        });
    }

    // Sort by post count
    filteredUsers.sort((a, b) => {
        const aCount = allPosts.filter(p => p.authorId === a.id).length;
        const bCount = allPosts.filter(p => p.authorId === b.id).length;
        return bCount - aCount;
    });

    if (filteredUsers.length === 0) {
        usersGrid.innerHTML = '<p style="color: var(--text-secondary); padding: 12px 0;">Авторов не найдено</p>';
        return;
    }

    filteredUsers.forEach(user => {
        const userCard = createUserCard(user);
        usersGrid.appendChild(userCard);
    });

    setupSearch();
}

function createUserCard(user) {
    const userPosts = allPosts.filter(p => p.authorId === user.id);
    const totalViews = userPosts.reduce((sum, post) => sum + (post.views || 0), 0);
    const totalLikes = userPosts.reduce((sum, post) => sum + (post.likes || 0), 0);

    const card = document.createElement('div');
    card.className = 'user-item-card';
    card.onclick = () => {
        window.location.href = `profile.html?id=${user.id}`;
    };

    const avatar = document.createElement('div');
    avatar.className = 'user-item-avatar';
    avatar.textContent = user.name.charAt(0).toUpperCase();
    
    // Load avatar if exists
    if (user.avatar) {
        window.blognoteFS.readFile(user.avatar).then(file => {
            const url = URL.createObjectURL(file);
            avatar.style.backgroundImage = `url(${url})`;
            avatar.textContent = '';
        }).catch(err => {
            console.error('[Users] Error loading avatar:', err);
        });
    }

    const info = document.createElement('div');
    info.className = 'user-item-info';

    const name = document.createElement('div');
    name.className = 'user-item-name';
    name.textContent = user.name;

    info.appendChild(name);

    if (user.bio) {
        const bio = document.createElement('div');
        bio.className = 'user-item-bio';
        bio.textContent = user.bio.length > 100 ? user.bio.substring(0, 100) + '...' : user.bio;
        info.appendChild(bio);
    }

    const stats = document.createElement('div');
    stats.className = 'user-item-stats';

    const postsCount = document.createElement('div');
    postsCount.className = 'user-item-stat';
    postsCount.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <span>${userPosts.length}</span>
    `;

    const viewsCount = document.createElement('div');
    viewsCount.className = 'user-item-stat';
    viewsCount.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>${totalViews}</span>
    `;

    const likesCount = document.createElement('div');
    likesCount.className = 'user-item-stat';
    likesCount.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span>${totalLikes}</span>
    `;

    stats.appendChild(postsCount);
    stats.appendChild(viewsCount);
    stats.appendChild(likesCount);

    card.appendChild(avatar);
    card.appendChild(info);
    card.appendChild(stats);

    return card;
}

function setupSearch() {
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
    
    // Local search for users on this page
    const localSearchInput = document.getElementById('localSearchInput');
    if (localSearchInput) {
        let searchTimeout;
        localSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                console.log('[Users] Local search query:', localSearchInput.value);
                renderUsers();
            }, 300);
        });
    }
}

function showEmptyState() {
    console.log('[Users] Showing empty state');
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('usersContent').style.display = 'none';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Users] DOM loaded');
    
    setTimeout(() => {
        console.log('[Users] Starting initialization');
        initUsers();
    }, 200);
    
    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
    }
    
    // Folder selection
    // Folder selection - redirect to feed
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', () => {
            window.location.href = 'feed.html';
        });
    }
    
    // Create post button
    const createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', () => {
            console.log('[Users] Create post button clicked');
            window.location.href = 'editor.html';
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

function updateMyPostsLink() {
    const myPostsLink = document.getElementById('myPostsLink');
    if (!myPostsLink) return;
    
    const currentUserId = localStorage.getItem('blognote-current-user');
    if (currentUserId) {
        myPostsLink.href = `profile.html?id=${currentUserId}`;
        console.log('[Users] Updated "Мои посты" link with user ID:', currentUserId);
    } else {
        myPostsLink.href = 'profile.html';
        console.log('[Users] No current user, using default profile link');
    }
}

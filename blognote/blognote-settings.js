// Settings page functionality
let allUsers = [];
let currentUser = null;
let avatarFile = null;
let bannerFile = null;

async function initSettings() {
    console.log('[Settings] Initializing settings...');
    console.log('[Settings] Has folder:', window.blognoteFS.hasFolder());
    
    if (!window.blognoteFS.hasFolder()) {
        console.log('[Settings] No folder selected, showing empty state');
        showEmptyState();
        return;
    }

    try {
        console.log('[Settings] Loading users...');
        allUsers = await window.blognoteFS.readJSON('users.json') || [];
        console.log('[Settings] Users loaded:', allUsers.length);
        
        if (allUsers.length === 0) {
            console.log('[Settings] No users found');
            alert('Нет пользователей. Создайте пользователя в редакторе.');
            window.location.href = 'editor.html';
            return;
        }

        await setupUserMenu(allUsers);
        
        const currentUserId = localStorage.getItem('blognote-current-user');
        if (!currentUserId) {
            console.log('[Settings] No current user selected');
            alert('Выберите пользователя из меню');
            window.location.href = 'feed.html';
            return;
        }

        currentUser = allUsers.find(u => u.id === currentUserId);
        if (!currentUser) {
            console.log('[Settings] Current user not found');
            alert('Пользователь не найден');
            window.location.href = 'feed.html';
            return;
        }

        console.log('[Settings] Current user:', currentUser.name);
        loadUserData();
        showSettingsContent();
    } catch (err) {
        console.error('[Settings] Error initializing settings:', err);
        showEmptyState();
    }
}

function loadUserData() {
    console.log('[Settings] Loading user data');
    
    document.getElementById('userName').value = currentUser.name || '';
    document.getElementById('userEmail').value = currentUser.email || '';
    document.getElementById('userBio').value = currentUser.bio || '';
    document.getElementById('userWebsite').value = currentUser.website || '';
    
    // Update avatar section info
    document.getElementById('avatarUserName').textContent = currentUser.name || 'Имя пользователя';
    const postCount = currentUser.posts || 0;
    const postWord = getPluralForm(postCount, 'пост', 'поста', 'постов');
    document.getElementById('avatarUserStats').textContent = `${postCount} ${postWord}`;
    
    // Load banner
    const bannerPreview = document.getElementById('bannerPreview');
    if (currentUser.banner) {
        window.blognoteFS.readFile(currentUser.banner).then(file => {
            const url = URL.createObjectURL(file);
            bannerPreview.style.backgroundImage = `url(${url})`;
            bannerPreview.innerHTML = '';
            document.getElementById('removeBannerBtn').style.display = 'inline-flex';
        }).catch(err => {
            console.error('[Settings] Error loading banner:', err);
            bannerPreview.style.backgroundImage = 'none';
            bannerPreview.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
            `;
        });
    } else {
        bannerPreview.style.backgroundImage = 'none';
        bannerPreview.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
        `;
    }
    
    const preview = document.getElementById('avatarPreview');
    
    if (currentUser.avatar) {
        // Load avatar from filesystem
        window.blognoteFS.readFile(currentUser.avatar).then(file => {
            const url = URL.createObjectURL(file);
            preview.style.backgroundImage = `url(${url})`;
            preview.innerHTML = '';
            document.getElementById('removeAvatarBtn').style.display = 'inline-flex';
        }).catch(err => {
            console.error('[Settings] Error loading avatar:', err);
            // Show icon if avatar fails to load
            preview.style.backgroundImage = 'none';
            preview.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
            `;
        });
    } else {
        // Show icon
        preview.style.backgroundImage = 'none';
        preview.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
        `;
    }
}

function getPluralForm(number, one, few, many) {
    const mod10 = number % 10;
    const mod100 = number % 100;
    
    if (mod10 === 1 && mod100 !== 11) {
        return one;
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
        return few;
    } else {
        return many;
    }
}

function handleBannerUpload() {
    const input = document.getElementById('bannerInput');
    const file = input.files[0];
    
    if (!file) return;
    
    console.log('[Settings] Banner file selected:', file.name);
    
    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение');
        return;
    }
    
    bannerFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('bannerPreview');
        preview.style.backgroundImage = `url(${e.target.result})`;
        preview.innerHTML = '';
        document.getElementById('removeBannerBtn').style.display = 'inline-flex';
        console.log('[Settings] Banner preview loaded');
    };
    reader.readAsDataURL(file);
}

function removeBanner() {
    console.log('[Settings] Removing banner');
    const preview = document.getElementById('bannerPreview');
    preview.style.backgroundImage = 'none';
    preview.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
        </svg>
    `;
    document.getElementById('removeBannerBtn').style.display = 'none';
    document.getElementById('bannerInput').value = '';
    bannerFile = 'remove';
}

function handleAvatarUpload() {
    const input = document.getElementById('avatarInput');
    const file = input.files[0];
    
    if (!file) return;
    
    console.log('[Settings] Avatar file selected:', file.name);
    
    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение');
        return;
    }
    
    // Open crop modal
    new ImageCropper(file, (croppedBlob) => {
        avatarFile = new File([croppedBlob], file.name, { type: file.type });
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('avatarPreview');
            preview.style.backgroundImage = `url(${e.target.result})`;
            preview.innerHTML = '';
            document.getElementById('removeAvatarBtn').style.display = 'inline-flex';
            console.log('[Settings] Avatar preview loaded');
        };
        reader.readAsDataURL(croppedBlob);
    });
}

function removeAvatar() {
    console.log('[Settings] Removing avatar');
    const preview = document.getElementById('avatarPreview');
    preview.style.backgroundImage = 'none';
    preview.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
        </svg>
    `;
    document.getElementById('removeAvatarBtn').style.display = 'none';
    document.getElementById('avatarInput').value = '';
    avatarFile = 'remove';
}

async function saveSettings() {
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const bio = document.getElementById('userBio').value.trim();
    const website = document.getElementById('userWebsite').value.trim();
    
    if (!name) {
        alert('Введите имя');
        return;
    }
    
    try {
        console.log('[Settings] Saving user settings...');
        
        // Update user data
        const userIndex = allUsers.findIndex(u => u.id === currentUser.id);
        if (userIndex === -1) {
            console.error('[Settings] User not found in array');
            return;
        }
        
        allUsers[userIndex] = {
            ...allUsers[userIndex],
            name,
            email,
            bio,
            website
        };
        
        // Handle banner
        if (bannerFile === 'remove') {
            delete allUsers[userIndex].banner;
            console.log('[Settings] Banner removed');
        } else if (bannerFile) {
            await window.blognoteFS.ensureFolder('banners');
            const bannerFileName = `${currentUser.id}_${bannerFile.name}`;
            const bannerPath = `banners/${bannerFileName}`;
            const arrayBuffer = await bannerFile.arrayBuffer();
            await window.blognoteFS.writeFile(bannerPath, arrayBuffer);
            allUsers[userIndex].banner = bannerPath;
            console.log('[Settings] Banner updated');
        }
        
        // Handle avatar
        if (avatarFile === 'remove') {
            // Remove avatar
            delete allUsers[userIndex].avatar;
            console.log('[Settings] Avatar removed');
        } else if (avatarFile) {
            // Save new avatar
            await window.blognoteFS.ensureFolder('avatars');
            const avatarFileName = `${currentUser.id}_${avatarFile.name}`;
            const avatarPath = `avatars/${avatarFileName}`;
            const arrayBuffer = await avatarFile.arrayBuffer();
            await window.blognoteFS.writeFile(avatarPath, arrayBuffer);
            allUsers[userIndex].avatar = avatarPath;
            console.log('[Settings] Avatar updated');
        }
        
        await window.blognoteFS.writeJSON('users.json', allUsers);
        console.log('[Settings] Settings saved successfully');
        
        alert('Настройки сохранены');
        window.location.href = 'feed.html';
    } catch (err) {
        console.error('[Settings] Error saving settings:', err);
        alert('Ошибка при сохранении настроек');
    }
}

function showEmptyState() {
    console.log('[Settings] Showing empty state');
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('settingsContent').style.display = 'none';
}

function showSettingsContent() {
    console.log('[Settings] Showing settings content');
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('settingsContent').style.display = 'block';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Settings] DOM loaded');
    
    setTimeout(() => {
        console.log('[Settings] Starting initialization');
        initSettings();
    }, 200);
    
    // Folder selection
    document.getElementById('selectFolderBtn').addEventListener('click', () => {
        window.location.href = 'feed.html';
    });
    
    document.getElementById('selectFolderBtnEmpty')?.addEventListener('click', () => {
        window.location.href = 'feed.html';
    });
    
    // Banner upload
    document.getElementById('uploadBannerBtn').addEventListener('click', () => {
        document.getElementById('bannerInput').click();
    });
    
    document.getElementById('bannerInput').addEventListener('change', handleBannerUpload);
    
    // Remove banner
    document.getElementById('removeBannerBtn').addEventListener('click', () => {
        if (confirm('Удалить баннер?')) {
            removeBanner();
        }
    });
    
    // Avatar upload
    document.getElementById('uploadAvatarBtn').addEventListener('click', () => {
        document.getElementById('avatarInput').click();
    });
    
    document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
    
    // Remove avatar
    document.getElementById('removeAvatarBtn').addEventListener('click', () => {
        if (confirm('Удалить аватар?')) {
            removeAvatar();
            avatarFile = '';
        }
    });
    
    // Save button
    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    
    // Cancel button
    document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = 'feed.html';
    });
    
    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'feed.html';
    });
});

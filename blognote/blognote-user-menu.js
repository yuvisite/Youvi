// Common user menu functionality for all pages

// Generate consistent avatar letter and color for user
function getUserAvatarLetter(userName) {
    if (!userName) return '?';
    return userName.charAt(0).toUpperCase();
}

function getUserAvatarColor(userId) {
    // Generate consistent color based on user ID
    const colors = [
        '#2ecc71', '#3498db', '#9b59b6', '#e74c3c', 
        '#f39c12', '#1abc9c', '#34495e', '#e67e22'
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

async function setupUserMenu(allUsers) {
    await populateUserMenuCommon(allUsers);
    setupUserMenuToggle();
}

async function populateUserMenuCommon(allUsers) {
    const userList = document.getElementById('userList');
    if (!userList) return;
    
    userList.innerHTML = '';

    const currentUserId = localStorage.getItem('blognote-current-user');

    // Load all users sequentially
    for (const user of allUsers) {
        const item = document.createElement('div');
        item.className = 'user-item';
        if (user.id === currentUserId) {
            item.classList.add('current');
        }
        
        const avatar = document.createElement('div');
        avatar.className = 'user-item-avatar';
        
        if (user.avatar) {
            // Load avatar from filesystem
            try {
                const file = await window.blognoteFS.readFile(user.avatar);
                const url = URL.createObjectURL(file);
                avatar.style.backgroundImage = `url(${url})`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
                avatar.innerHTML = '';
            } catch (err) {
                console.error('[UserMenu] Error loading avatar:', err);
                avatar.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                `;
            }
        } else {
            avatar.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
            `;
        }
        
        const name = document.createElement('div');
        name.className = 'user-item-name';
        name.textContent = user.name;
        
        item.appendChild(avatar);
        item.appendChild(name);
        
        item.addEventListener('click', () => {
            localStorage.setItem('blognote-current-user', user.id);
            updateHeaderAvatar(allUsers);
            // Close dropdown
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) dropdown.classList.remove('active');
            // Reload to update UI
            window.location.reload();
        });
        
        userList.appendChild(item);
    }

    // Add "Add User" button at the end
    const addUserBtn = document.createElement('div');
    addUserBtn.className = 'user-item add-user-btn';
    addUserBtn.innerHTML = `
        <div class="user-item-avatar" style="background: var(--accent);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        </div>
        <div class="user-item-name">Добавить пользователя</div>
    `;
    addUserBtn.addEventListener('click', () => {
        openAddUserModal();
    });
    userList.appendChild(addUserBtn);

    updateHeaderAvatar(allUsers);
}

function updateHeaderAvatar(allUsers) {
    const currentUserId = localStorage.getItem('blognote-current-user');
    const userMenuBtn = document.getElementById('userMenuBtn');
    
    if (!userMenuBtn) return;
    
    const defaultIcon = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
        </svg>
    `;
    
    if (!currentUserId) {
        userMenuBtn.style.backgroundImage = 'none';
        userMenuBtn.style.background = 'var(--accent)';
        userMenuBtn.innerHTML = defaultIcon;
        return;
    }
    
    const currentUser = allUsers.find(u => u.id === currentUserId);
    if (!currentUser) return;
    
    if (currentUser.avatar) {
        // Load avatar from filesystem
        window.blognoteFS.readFile(currentUser.avatar).then(file => {
            const url = URL.createObjectURL(file);
            userMenuBtn.innerHTML = '';
            userMenuBtn.style.backgroundImage = `url(${url})`;
        }).catch(err => {
            console.error('[UserMenu] Error loading header avatar:', err);
            userMenuBtn.style.backgroundImage = 'none';
            userMenuBtn.style.background = 'var(--accent)';
            userMenuBtn.innerHTML = defaultIcon;
        });
    } else {
        userMenuBtn.style.backgroundImage = 'none';
        userMenuBtn.style.background = 'var(--accent)';
        userMenuBtn.innerHTML = defaultIcon;
    }
}

function setupUserMenuToggle() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    
    if (!userMenuBtn || !userDropdown) return;
    
    userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('active');
    });
    
    document.addEventListener('click', () => {
        userDropdown.classList.remove('active');
    });
    
    userDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

function getCurrentUser(allUsers) {
    const currentUserId = localStorage.getItem('blognote-current-user');
    if (!currentUserId) return null;
    return allUsers.find(u => u.id === currentUserId);
}

function openAddUserModal() {
    // Close dropdown
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.remove('active');

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Добавить пользователя</h2>
                <button class="modal-close" id="closeModal">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="userName">Имя пользователя</label>
                    <input type="text" id="userName" placeholder="Введите имя" required>
                </div>
                <div class="form-group">
                    <label for="userBio">Биография</label>
                    <textarea id="userBio" placeholder="Расскажите о себе" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label>Аватар</label>
                    <div class="avatar-upload">
                        <div class="avatar-preview" id="avatarPreview">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                        </div>
                        <button type="button" class="btn" id="selectAvatarBtn">Выбрать изображение</button>
                        <input type="file" id="avatarInput" accept="image/*" style="display: none;">
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn" id="cancelBtn">Отмена</button>
                <button class="btn btn-primary" id="saveUserBtn">Создать</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Setup event listeners
    let selectedAvatarFile = null;

    document.getElementById('closeModal').addEventListener('click', () => {
        modal.remove();
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    document.getElementById('selectAvatarBtn').addEventListener('click', () => {
        document.getElementById('avatarInput').click();
    });

    document.getElementById('avatarInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                alert('Пожалуйста, выберите изображение');
                return;
            }
            
            // Open crop modal
            new ImageCropper(file, (croppedBlob) => {
                selectedAvatarFile = new File([croppedBlob], file.name, { type: file.type });
                const reader = new FileReader();
                reader.onload = (e) => {
                    const preview = document.getElementById('avatarPreview');
                    preview.style.backgroundImage = `url(${e.target.result})`;
                    preview.style.backgroundSize = 'cover';
                    preview.style.backgroundPosition = 'center';
                    preview.innerHTML = '';
                };
                reader.readAsDataURL(croppedBlob);
            });
        }
    });

    document.getElementById('saveUserBtn').addEventListener('click', async () => {
        const name = document.getElementById('userName').value.trim();
        const bio = document.getElementById('userBio').value.trim();

        if (!name) {
            alert('Введите имя пользователя');
            return;
        }

        try {
            await createNewUser(name, bio, selectedAvatarFile);
            modal.remove();
            window.location.reload();
        } catch (err) {
            console.error('[UserMenu] Error creating user:', err);
            alert('Ошибка при создании пользователя: ' + err.message);
        }
    });
}

async function createNewUser(name, bio, avatarFile) {
    // Load existing users
    const users = await window.blognoteFS.readJSON('users.json') || [];

    // Generate user ID
    const userId = 'user_' + Date.now();

    // Handle avatar
    let avatarPath = null;
    if (avatarFile) {
        // Create avatars folder if it doesn't exist
        await window.blognoteFS.ensureFolder('avatars');
        
        // Save avatar file
        const avatarFileName = `${userId}_${avatarFile.name}`;
        avatarPath = `avatars/${avatarFileName}`;
        
        // Read file as array buffer and save
        const arrayBuffer = await avatarFile.arrayBuffer();
        await window.blognoteFS.writeFile(avatarPath, arrayBuffer);
    }

    // Create new user
    const newUser = {
        id: userId,
        name: name,
        bio: bio || '',
        avatar: avatarPath,
        followers: 0,
        following: 0,
        posts: 0,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);

    // Save users
    await window.blognoteFS.writeJSON('users.json', users);

    // Set as current user
    localStorage.setItem('blognote-current-user', userId);

    console.log('[UserMenu] User created:', newUser);
}

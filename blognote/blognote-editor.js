// Editor page functionality
let allUsers = [];
let selectedAuthor = null;
let editingPostId = null;

async function initEditor() {
    console.log('[Editor] Initializing editor...');
    console.log('[Editor] Has folder:', window.blognoteFS.hasFolder());
    
    if (!window.blognoteFS.hasFolder()) {
        console.log('[Editor] No folder selected, showing empty state');
        showEmptyState();
        return;
    }

    try {
        console.log('[Editor] Loading users...');
        allUsers = await window.blognoteFS.readJSON('users.json') || [];
        console.log('[Editor] Users loaded:', allUsers.length);
        
        if (allUsers.length === 0) {
            console.log('[Editor] No users found');
            alert('Создайте пользователя через меню в правом верхнем углу');
            showEditorContent();
        } else {
            setupUserMenu(allUsers);
            showEditorContent();
            
            // Auto-select current user
            const currentUserId = localStorage.getItem('blognote-current-user');
            if (currentUserId) {
                const currentUser = allUsers.find(u => u.id === currentUserId);
                if (currentUser) {
                    selectedAuthor = currentUser;
                }
            }
        }

        // Check if editing existing post
        const urlParams = new URLSearchParams(window.location.search);
        editingPostId = urlParams.get('edit');
        
        if (editingPostId) {
            await loadPostForEditing(editingPostId);
        }
    } catch (err) {
        console.error('[Editor] Error initializing editor:', err);
        showEmptyState();
    }
}

function populateUserMenu() {
    // Handled by user-menu.js
}

async function loadPostForEditing(postId) {
    try {
        const posts = await window.blognoteFS.readJSON('posts.json');
        const post = posts.find(p => p.id === postId);
        
        if (!post) return;
        
        document.getElementById('editorTitle').textContent = 'Редактировать пост';
        document.getElementById('postTitle').value = post.title;
        document.getElementById('postExcerpt').value = post.excerpt || '';
        document.getElementById('postContent').value = post.content;
        document.getElementById('postTags').value = post.tags ? post.tags.join(', ') : '';
        
        const author = allUsers.find(u => u.id === post.authorId);
        if (author) {
            selectAuthor(author);
        }
    } catch (err) {
        console.error('Error loading post:', err);
    }
}

async function savePost() {
    const title = document.getElementById('postTitle').value.trim();
    const excerpt = document.getElementById('postExcerpt').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const tagsInput = document.getElementById('postTags').value.trim();
    
    if (!title || !content) {
        alert('Заполните заголовок и содержание поста');
        return;
    }
    
    if (!selectedAuthor) {
        alert('Выберите автора поста');
        return;
    }
    
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
    
    try {
        console.log('[Editor] Saving post...');
        let posts = await window.blognoteFS.readJSON('posts.json') || [];
        
        // Determine post ID - use existing editingPostId if available (for images)
        let postId;
        let isNewPost = false;
        
        if (editingPostId && editingPostId.startsWith('post_')) {
            // This is a temporary ID created during image upload
            postId = editingPostId;
            isNewPost = true;
        } else if (editingPostId) {
            // This is an existing post being edited
            postId = editingPostId;
        } else {
            // Create new post ID
            postId = 'post_' + Date.now();
            isNewPost = true;
        }
        
        if (isNewPost) {
            // Create new post
            const newPost = {
                id: postId,
                authorId: selectedAuthor.id,
                title,
                excerpt,
                content,
                tags,
                date: new Date().toISOString(),
                views: 0,
                likes: 0
            };
            posts.push(newPost);
            console.log('[Editor] New post created with ID:', postId);
        } else {
            // Update existing post
            const index = posts.findIndex(p => p.id === postId);
            if (index !== -1) {
                posts[index] = {
                    ...posts[index],
                    title,
                    excerpt,
                    content,
                    tags,
                    authorId: selectedAuthor.id
                };
                console.log('[Editor] Post updated:', postId);
            }
        }
        
        await window.blognoteFS.writeJSON('posts.json', posts);
        console.log('[Editor] Post saved successfully');
        
        // Redirect to feed
        window.location.href = 'feed.html';
    } catch (err) {
        console.error('[Editor] Error saving post:', err);
        alert('Ошибка при сохранении поста');
    }
}

function showEmptyState() {
    console.log('[Editor] Showing empty state');
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('editorContent').style.display = 'none';
}

function showEditorContent() {
    console.log('[Editor] Showing editor content');
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('editorContent').style.display = 'block';
}

// Toolbar formatting
function insertFormatting(format) {
    const textarea = document.getElementById('postContent');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const beforeText = textarea.value.substring(0, start);
    const afterText = textarea.value.substring(end);
    
    let formattedText = '';
    
    switch(format) {
        case 'bold':
            formattedText = `**${selectedText || 'текст'}**`;
            break;
        case 'italic':
            formattedText = `*${selectedText || 'текст'}*`;
            break;
        case 'code':
            formattedText = `\`${selectedText || 'код'}\``;
            break;
        case 'link':
            const url = prompt('Введите URL:');
            if (url) {
                formattedText = `[${selectedText || 'текст ссылки'}](${url})`;
            } else {
                return;
            }
            break;
        case 'image':
            document.getElementById('imageInput').click();
            return;
        case 'audio':
            document.getElementById('audioInput').click();
            return;
    }
    
    textarea.value = beforeText + formattedText + afterText;
    textarea.focus();
    
    const newCursorPos = start + formattedText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
}

async function handleImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение');
        return;
    }

    try {
        // Generate temporary post ID if creating new post
        if (!editingPostId) {
            editingPostId = 'post_' + Date.now();
        }

        // Create folder for post images
        const postFolder = `posts/${editingPostId}`;
        await window.blognoteFS.ensureFolder(postFolder);

        // Generate unique filename
        const timestamp = Date.now();
        const extension = file.name.split('.').pop();
        const filename = `image_${timestamp}.${extension}`;
        const imagePath = `${postFolder}/${filename}`;

        // Save image
        const arrayBuffer = await file.arrayBuffer();
        await window.blognoteFS.writeFile(imagePath, arrayBuffer);

        // Insert markdown image syntax
        const textarea = document.getElementById('postContent');
        const start = textarea.selectionStart;
        const beforeText = textarea.value.substring(0, start);
        const afterText = textarea.value.substring(start);
        
        const imageMarkdown = `![${file.name}](${imagePath})`;
        textarea.value = beforeText + imageMarkdown + afterText;
        
        const newCursorPos = start + imageMarkdown.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();

        console.log('[Editor] Image uploaded:', imagePath);
    } catch (err) {
        console.error('[Editor] Error uploading image:', err);
        alert('Ошибка при загрузке изображения');
    }
}

async function handleAudioUpload(file) {
    if (!file || !file.type.startsWith('audio/')) {
        alert('Пожалуйста, выберите аудио файл');
        return;
    }

    // Check audio size (limit 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
        alert('Размер аудио слишком большой! Максимальный размер: 50MB');
        return;
    }

    try {
        // Generate temporary post ID if creating new post
        if (!editingPostId) {
            editingPostId = 'post_' + Date.now();
        }

        // Create folder for post media
        const postFolder = `posts/${editingPostId}`;
        await window.blognoteFS.ensureFolder(postFolder);

        // Generate unique filename
        const timestamp = Date.now();
        const extension = file.name.split('.').pop();
        const filename = `audio_${timestamp}.${extension}`;
        const audioPath = `${postFolder}/${filename}`;

        // Save audio
        const arrayBuffer = await file.arrayBuffer();
        await window.blognoteFS.writeFile(audioPath, arrayBuffer);

        // Insert custom audio syntax [audio](path)
        const textarea = document.getElementById('postContent');
        const start = textarea.selectionStart;
        const beforeText = textarea.value.substring(0, start);
        const afterText = textarea.value.substring(start);
        
        const audioName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        const audioMarkdown = `[audio:${audioName}](${audioPath})`;
        textarea.value = beforeText + audioMarkdown + afterText;
        
        const newCursorPos = start + audioMarkdown.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();

        console.log('[Editor] Audio uploaded:', audioPath);
    } catch (err) {
        console.error('[Editor] Error uploading audio:', err);
        alert('Ошибка при загрузке аудио');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Editor] DOM loaded');
    
    setTimeout(() => {
        console.log('[Editor] Starting initialization');
        initEditor();
    }, 200);
    
    // Folder selection - redirect to feed
    document.getElementById('selectFolderBtn').addEventListener('click', () => {
        window.location.href = 'feed.html';
    });
    
    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
    }
    
    // Save button
    document.getElementById('saveBtn').addEventListener('click', savePost);
    
    // Cancel button
    document.getElementById('cancelBtn').addEventListener('click', () => {
        if (confirm('Отменить создание поста? Несохраненные изменения будут потеряны.')) {
            window.location.href = 'feed.html';
        }
    });
    
    // Toolbar buttons
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const format = btn.dataset.format;
            insertFormatting(format);
        });
    });
    
    // Image upload
    document.getElementById('imageInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageUpload(file);
        }
        e.target.value = ''; // Reset input
    });
    
    // Audio upload
    document.getElementById('audioInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleAudioUpload(file);
        }
        e.target.value = ''; // Reset input
    });
});

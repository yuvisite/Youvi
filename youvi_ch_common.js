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

let currentChannelName = '';
let channelData = {};
let videoDirectoryHandle = null;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getNickColor(nick) {
    const colors = ['#ff69b4', '#d94b88', '#c2185b', '#e91e63', '#f06292', '#f48fb1', '#f8bbd9'];
    let hash = 0;
    for (let i = 0; i < nick.length; i++) {
        hash = nick.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

function processContentWithImages(content) {
    if (!content) return '';
    
    return content.replace(/<img[^>]*>/g, (match) => {
        return match.replace(/onclick="[^"]*"/g, 'onclick="openImageModal(this)"');
    });
}

async function getChannelDirectory() {
    if (!videoDirectoryHandle || !currentChannelName) {
        throw new Error('No file system access or channel name');
    }
    
    try {
        const channelsDir = await videoDirectoryHandle.getDirectoryHandle('.channels', { create: true });
        return await channelsDir.getDirectoryHandle(currentChannelName, { create: true });
    } catch (e) {
        return await videoDirectoryHandle.getDirectoryHandle(currentChannelName, { create: true });
    }
}

async function readJSONFile(dirHandle, fileName, defaultValue = null) {
    try {
        console.log('Reading file: ' + fileName + ' from directory:', dirHandle);
        const fileHandle = await dirHandle.getFileHandle(fileName);
        console.log('File handle obtained:', fileHandle);
        const file = await fileHandle.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text);
        console.log('Successfully parsed:', parsed);
        return parsed;
    } catch (e) {
        console.log('Error reading ' + fileName + ':', e);
        console.log('Returning default value:', defaultValue);
        return defaultValue;
    }
}

async function writeJSONFile(dirHandle, fileName, data) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        console.log('Successfully wrote file:', fileName);
    } catch (e) {
        console.error('Error writing file:', fileName, e);
        throw e;
    }
}

async function loadChannelData() {
    try {
        if (videoDirectoryHandle) {
            try {
                const channelDir = await getChannelDirectory();
                const channelDataFile = await readJSONFile(channelDir, 'channel.json', {});
                
                if (channelDataFile && Object.keys(channelDataFile).length > 0) {
                    channelData = channelDataFile;
                    console.log('Loaded channel data from file system');
                    return;
                }
            } catch (e) {
                console.log('Could not load from file system, falling back to localStorage:', e.message);
            }
        }
        
        const channelId = getChannelIdFromUrl();
        console.log('Fallback: Loading from localStorage with key: channel_' + channelId);
        const storedData = localStorage.getItem('channel_' + channelId);
        if (storedData) {
            try {
                channelData = JSON.parse(storedData);
                console.log('Loaded channel data from localStorage');
            } catch (e) {
                console.error('Error parsing stored channel data:', e);
                channelData = {};
            }
        } else {
            console.log('No data found in localStorage, using empty channel data');
            channelData = {};
        }
        
        if (!channelData.feed) {
            console.log('Feed array not found, initializing empty array');
            channelData.feed = [];
        } else {
            console.log('Feed array found with', channelData.feed.length, 'posts');
        }
        
    } catch (e) {
        console.error('Error loading channel data:', e);
        channelData = {};
    }
    
    if (!channelData.feed) {
        channelData.feed = [];
    }
}

async function saveChannelData() {
    const channelId = getChannelIdFromUrl();
    console.log('Saving channel data:', channelData);
    try {
        const minimalChannelData = {
            name: channelData.name,
            description: channelData.description,
            avatar: channelData.avatar,
            header: channelData.header,
            background: channelData.background,
            textColor: channelData.textColor,
            theme: channelData.theme,
            playlists: channelData.playlists || [],
            stats: channelData.stats || { videos: 0, views: 0 },
            created: channelData.created,
            postIds: channelData.feed ? channelData.feed.map(post => post.id) : []
        };
        
        const dataString = JSON.stringify(minimalChannelData);
        const dataSize = new Blob([dataString]).size;
        console.log('Minimal channel data size:', dataSize, 'bytes');
        
        if (dataSize > 5 * 1024 * 1024) {
            console.warn('Data too large for localStorage, saving only to file system');
        } else {
            localStorage.setItem('channel_' + channelId, dataString);
            console.log('Saved channel data to localStorage');
        }
        
        if (videoDirectoryHandle) {
            try {
                const channelDir = await getChannelDirectory();
                await writeJSONFile(channelDir, 'channel.json', minimalChannelData);
                console.log('Saved channel data to file system');
            } catch (e) {
                console.error('Error saving to file system:', e);
            }
        }
        
    } catch (e) {
        console.error('Error saving channel data:', e);
    }
}

async function loadReplies() {
    try {
        if (!videoDirectoryHandle || !currentChannelName) {
            console.log('No file system access, cannot load replies');
            return;
        }

        const channelDir = await getChannelDirectory();
        const repliesData = await readJSONFile(channelDir, 'replies.json', {});
        
        if (channelData.feed && repliesData) {
            channelData.feed.forEach(post => {
                if (repliesData[post.id]) {
                    post.replies = repliesData[post.id];
                }
            });
        }
        
        console.log('Loaded replies from replies.json');
        
    } catch (e) {
        console.error('Error loading replies:', e);
    }
}

async function saveReplies() {
    try {
        if (!videoDirectoryHandle || !currentChannelName) {
            console.log('No file system access, cannot save replies');
            return;
        }

        const channelDir = await getChannelDirectory();
        
        const allReplies = {};
        if (channelData.feed) {
            channelData.feed.forEach(post => {
                if (post.replies && post.replies.length > 0) {
                    allReplies[post.id] = post.replies;
                }
            });
        }
        
        await writeJSONFile(channelDir, 'replies.json', allReplies);
        console.log('Saved replies to replies.json');
        
    } catch (e) {
        console.error('Error saving replies:', e);
    }
}

async function postReply(postId) {
    const post = channelData.feed.find(p => p.id === postId);
    if (!post) return;
    
    const replyInput = document.getElementById(`replyInput_${postId}`);
    const replyNick = document.getElementById(`replyNick_${postId}`);
    
    if (!replyInput || !replyNick) return;
    
    const replyText = replyInput.innerHTML.trim();
    const nick = replyNick.value.trim();
    
    console.log('Reply text:', replyText);
    console.log('Nick:', nick);
    
    if (!replyText) {
        alert('Введите текст ответа');
        return;
    }
    
    if (!nick) {
        alert('Введите ваш ник');
        return;
    }
    
    const processedText = await processImagesInContent(replyText);
    console.log('Processed text:', processedText);
    
    const reply = {
        id: Date.now().toString(),
        nick: nick,
        text: processedText,
        created: Date.now(),
        isAuthorPost: false
    };
    
    if (!post.replies) post.replies = [];
    post.replies.push(reply);
    
    await saveChannelData();
    await saveReplies();
    
    replyInput.innerHTML = '';
    replyNick.value = '';
    
    const replyForm = document.getElementById(`replyForm_${postId}`);
    if (replyForm) {
        replyForm.style.display = 'none';
    }
    
    if (typeof renderFeed === 'function') {
        await renderFeed();
    } else if (typeof displayReplies === 'function') {
        displayReplies();
    }
}

async function postAuthorReply(postId) {
    const post = channelData.feed.find(p => p.id === postId);
    if (!post) return;
    
    const replyInput = document.getElementById(`replyInput_${postId}`);
    
    if (!replyInput) return;
    
    const replyText = replyInput.innerHTML.trim();
    
    console.log('Author reply text:', replyText);
    
    if (!replyText) {
        alert('Введите текст ответа');
        return;
    }
    
    const processedText = await processImagesInContent(replyText);
    console.log('Processed text:', processedText);
    
    const reply = {
        id: Date.now().toString(),
        nick: currentChannelName,
        text: processedText,
        created: Date.now(),
        isAuthorPost: true
    };
    
    if (!post.replies) post.replies = [];
    post.replies.push(reply);
    
    await saveChannelData();
    await saveReplies();
    
    replyInput.innerHTML = '';
    
    const replyForm = document.getElementById(`replyForm_${postId}`);
    if (replyForm) {
        replyForm.style.display = 'none';
    }
    
    if (typeof renderFeed === 'function') {
        await renderFeed();
    } else if (typeof displayReplies === 'function') {
        displayReplies();
    }
}

async function postNestedReply(postId, replyId) {
    const post = channelData.feed.find(p => p.id === postId);
    if (!post || !post.replies) return;
    
    const reply = post.replies.find(r => r.id === replyId);
    if (!reply) return;
    
    const nestedReplyInput = document.getElementById(`nestedReplyInput_${postId}_${replyId}`);
    const nestedReplyNick = document.getElementById(`nestedReplyNick_${postId}_${replyId}`);
    
    if (!nestedReplyInput || !nestedReplyNick) return;
    
    const replyText = nestedReplyInput.innerHTML.trim();
    const nick = nestedReplyNick.value.trim();
    
    if (!replyText) {
        alert('Введите текст ответа');
        return;
    }
    
    if (!nick) {
        alert('Введите ваш ник');
        return;
    }
    
    const processedText = await processImagesInContent(replyText);
    
    const nestedReply = {
        id: Date.now().toString(),
        nick: nick,
        text: processedText,
        created: Date.now(),
        isAuthorPost: false
    };
    
    if (!reply.nestedReplies) reply.nestedReplies = [];
    reply.nestedReplies.push(nestedReply);
    
    await saveChannelData();
    await saveReplies();
    
    nestedReplyInput.innerHTML = '';
    nestedReplyNick.value = '';
    
    const nestedReplyForm = document.getElementById(`nestedReplyForm_${postId}_${replyId}`);
    if (nestedReplyForm) {
        nestedReplyForm.style.display = 'none';
    }
    
    if (typeof renderFeed === 'function') {
        await renderFeed();
    } else if (typeof displayReplies === 'function') {
        displayReplies();
    }
}

async function postAuthorNestedReply(postId, replyId) {
    const post = channelData.feed.find(p => p.id === postId);
    if (!post || !post.replies) return;
    
    const reply = post.replies.find(r => r.id === replyId);
    if (!reply) return;
    
    const nestedReplyInput = document.getElementById(`nestedReplyInput_${postId}_${replyId}`);
    
    if (!nestedReplyInput) return;
    
    const replyText = nestedReplyInput.innerHTML.trim();
    
    if (!replyText) {
        alert('Введите текст ответа');
        return;
    }
    
    const processedText = await processImagesInContent(replyText);
    
    const nestedReply = {
        id: Date.now().toString(),
        nick: currentChannelName,
        text: processedText,
        created: Date.now(),
        isAuthorPost: true
    };
    
    if (!reply.nestedReplies) reply.nestedReplies = [];
    reply.nestedReplies.push(nestedReply);
    
    await saveChannelData();
    await saveReplies();
    
    nestedReplyInput.innerHTML = '';
    
    const nestedReplyForm = document.getElementById(`nestedReplyForm_${postId}_${replyId}`);
    if (nestedReplyForm) {
        nestedReplyForm.style.display = 'none';
    }
    
    if (typeof renderFeed === 'function') {
        await renderFeed();
    } else if (typeof displayReplies === 'function') {
        displayReplies();
    }
}

function toggleReplyForm(postId) {
    const replyForm = document.getElementById(`replyForm_${postId}`);
    if (!replyForm) return;
    
    const isVisible = replyForm.style.display !== 'none';
    replyForm.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        const replyInput = document.getElementById(`replyInput_${postId}`);
        if (replyInput) {
            replyInput.focus();
        }
    }
}

function toggleReplyToReply(postId, replyId) {
    const nestedReplyForm = document.getElementById(`nestedReplyForm_${postId}_${replyId}`);
    if (!nestedReplyForm) return;
    
    const isVisible = nestedReplyForm.style.display !== 'none';
    nestedReplyForm.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        const nestedReplyInput = document.getElementById(`nestedReplyInput_${postId}_${replyId}`);
        if (nestedReplyInput) {
            nestedReplyInput.focus();
        }
    }
}

function toggleNestedRepliesVisibility(postId, replyId) {
    const nestedReplies = document.querySelector(`[data-post-id="${postId}"][data-reply-id="${replyId}"]`)?.closest('.reply-bubble')?.querySelector('.nested-replies');
    if (!nestedReplies) return;
    
    const isCollapsed = nestedReplies.classList.contains('collapsed');
    const replyCount = nestedReplies.querySelectorAll('.nested-reply-item').length;
    
    const collapseBtn = document.querySelector(`[data-post-id="${postId}"][data-reply-id="${replyId}"]`);
    if (!collapseBtn) return;
    
    if (isCollapsed) {
        nestedReplies.classList.remove('collapsed');
        collapseBtn.innerHTML = `▼ Свернуть (${replyCount})`;
        collapseBtn.classList.remove('collapsed');
    } else {
        nestedReplies.classList.add('collapsed');
        collapseBtn.innerHTML = `▶ Развернуть (${replyCount})`;
        collapseBtn.classList.add('collapsed');
    }
}

function toggleReplyLike(postId, replyId) {
    const post = channelData.feed.find(p => p.id === postId);
    if (!post || !post.replies) return;
    
    const reply = post.replies.find(r => r.id === replyId);
    if (!reply) return;
    
    reply.likes = (reply.likes || 0) + 1;
    
    saveChannelData();
    saveReplies();
    
    const likeCount = document.querySelector(`[onclick="toggleReplyLike('${postId}', '${replyId}')"] .like-count`);
    if (likeCount) {
        likeCount.textContent = reply.likes;
    }
}

function toggleReplyDislike(postId, replyId) {
    const post = channelData.feed.find(p => p.id === postId);
    if (!post || !post.replies) return;
    
    const reply = post.replies.find(r => r.id === replyId);
    if (!reply) return;
    
    reply.dislikes = (reply.dislikes || 0) + 1;
    
    saveChannelData();
    saveReplies();
    
    const dislikeCount = document.querySelector(`[onclick="toggleReplyDislike('${postId}', '${replyId}')"] .dislike-count`);
    if (dislikeCount) {
        dislikeCount.textContent = reply.dislikes;
    }
}

function deleteReply(postId, replyId) {
    if (!confirm('Вы уверены, что хотите пожаловаться на этот ответ?')) {
        return;
    }
    
    const post = channelData.feed.find(p => p.id === postId);
    if (!post || !post.replies) return;
    
    const replyIndex = post.replies.findIndex(r => r.id === replyId);
    if (replyIndex === -1) return;
    
    post.replies.splice(replyIndex, 1);
    
    saveChannelData();
    saveReplies();
    
    if (typeof renderFeed === 'function') {
        renderFeed();
    } else if (typeof displayReplies === 'function') {
        displayReplies();
    }
}

async function processImagesInContent(content) {
    return content;
}

function openImageModal(img) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    if (modal && modalImg) {
        modal.style.display = 'block';
        modalImg.src = img.src;
    }
}

function closeModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function getChannelIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const channel = urlParams.get('channel');
    const id = urlParams.get('id');
    const result = channel || id || '';
    console.log('getChannelIdFromUrl() = ' + result + ' (channel: ' + channel + ', id: ' + id + ')');
    return result;
}

async function loadChannelPosts() {
    try {
        if (!videoDirectoryHandle || !currentChannelName) {
            console.log('No file system access, cannot load posts from directories');
            return;
        }

        const channelDir = await getChannelDirectory();
        
        try {
            const postsDir = await channelDir.getDirectoryHandle('posts');
            console.log('Posts directory found, loading individual posts');
            
            const postDirs = [];
            for await (const [name, handle] of postsDir.entries()) {
                if (handle.kind === 'directory' && name.startsWith('post_')) {
                    postDirs.push(name);
                }
            }
            
            console.log(`Found ${postDirs.length} post directories`);
            
            const loadedPosts = [];
            for (const postDirName of postDirs) {
                const postId = postDirName.replace('post_', '');
                
                try {
                    const post = await loadPostFromDirectory(postId);
                    if (post && post.id) {
                        if (!post.author) post.author = 'Аноним';
                        if (!post.content) post.content = '';
                        if (!post.timestamp) post.timestamp = Date.now();
                        if (!post.replies) post.replies = [];
                        if (!post.likes) post.likes = 0;
                        if (!post.dislikes) post.dislikes = 0;
                        if (post.isAuthorPost === undefined) post.isAuthorPost = false;
                        if (post.hasImages === undefined) post.hasImages = false;
                        
                        loadedPosts.push(post);
                    }
                } catch (e) {
                    console.error('Error loading post:', postId, e);
                }
            }
            
            loadedPosts.sort((a, b) => b.timestamp - a.timestamp);
            
            channelData.feed = loadedPosts;
            console.log(`Loaded ${loadedPosts.length} posts from directories`);
            
        } catch (e) {
            console.log('No posts directory found, using existing feed data');
        }
        
    } catch (e) {
        console.error('Error loading posts from directories:', e);
    }
}

async function loadPostFromDirectory(postId) {
    try {
        if (!videoDirectoryHandle || !currentChannelName) {
            console.log('No file system access, cannot load post from directory');
            return null;
        }

        const channelDir = await getChannelDirectory();
        const postsDir = await channelDir.getDirectoryHandle('posts');
        const postDir = await postsDir.getDirectoryHandle(`post_${postId}`);

        const postData = await readJSONFile(postDir, 'post.json', {});
        
        if (!postData || !postData.id) {
            console.log('No valid post data found for:', postId);
            return null;
        }

        if (postData.deleted) {
            console.log(`Skipping deleted post: ${postId}`);
            return null;
        }

        await loadPostImages(postData, postDir);

        return postData;
        
    } catch (e) {
        console.error('Error loading post from directory:', postId, e);
        return null;
    }
}

async function loadPostImages(post, imagesDir) {
    try {
        if (!post.content) return;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = post.content;
        const images = tempDiv.querySelectorAll('img[data-filename]');

        for (const img of images) {
            const fileName = img.getAttribute('data-filename');
            if (fileName) {
                try {
                    const fileHandle = await imagesDir.getFileHandle(fileName);
                    const file = await fileHandle.getFile();
                    const dataUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.readAsDataURL(file);
                    });
                    img.src = dataUrl;
                    img.setAttribute('data-post-id', post.id);
                } catch (e) {
                    console.error('Error loading post image:', fileName, e);
                }
            }
        }

        post.content = tempDiv.innerHTML;

    } catch (e) {
        console.error('Error loading post images:', e);
    }
}

async function initializeCommon() {
    try {
        currentChannelName = getChannelIdFromUrl();
        if (!currentChannelName) {
            throw new Error('Имя канала не указано');
        }

        await loadChannelData();
        
        if (videoDirectoryHandle) {
            await loadChannelPosts();
        }
        
        console.log('Common functions initialized');
        
    } catch (e) {
        console.error('Error initializing common functions:', e);
        throw e;
    }
}

async function initializeCommonWithFileSystem() {
    try {
        currentChannelName = getChannelIdFromUrl();
        if (!currentChannelName) {
            throw new Error('Имя канала не указано');
        }

        try {
            videoDirectoryHandle = await window.showDirectoryPicker();
        } catch (e) {
            console.log('File system access denied, using localStorage fallback');
        }

        await loadChannelData();
        
        console.log('Common functions initialized with file system');
        
    } catch (e) {
        console.error('Error initializing common functions:', e);
        throw e;
    }
}

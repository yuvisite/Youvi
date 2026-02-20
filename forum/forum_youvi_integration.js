/**
 * Forum-YouVi Integration Module
 * Provides unified user profile management using YouVi's channel system
 */

'use strict';

// Get YouVi shared functions (don't destructure to avoid redeclaration)
const YouviShared = window.YouviShared || {};

/**
 * Get forum user profile (uses YouVi channels)
 * @param {string} nick - User nickname
 * @returns {Promise<Object|null>} User profile or null
 */
async function getForumUserProfile(nick) {
  if (!nick) return null;
  
  const userName = YouviShared.slugifyNick(nick);
  return await YouviShared.getUserProfile(userName);
}

/**
 * Save forum user profile (uses YouVi channels)
 * @param {string} nick - User nickname
 * @param {Object} profileData - Profile data to save
 * @returns {Promise<Object>} Saved profile
 */
async function saveForumUserProfile(nick, profileData) {
  if (!nick) throw new Error('Nickname is required');
  
  const userName = YouviShared.slugifyNick(nick);
  return await YouviShared.saveUserProfile(userName, profileData);
}

/**
 * Increment user's forum post count
 * @param {string} nick - User nickname
 */
async function incrementForumPostCount(nick) {
  if (!nick) return;
  
  const userName = YouviShared.slugifyNick(nick);
  await YouviShared.updateUserStats(userName, 'forumPosts', 1);
}

/**
 * Get user avatar URL
 * @param {string} nick - User nickname
 * @returns {Promise<string|null>} Avatar URL or null
 */
async function getForumUserAvatar(nick) {
  if (!nick) return null;
  
  const userName = YouviShared.slugifyNick(nick);
  return await YouviShared.getUserAvatar(userName);
}

/**
 * Get all forum users (from channels directory)
 * @returns {Promise<Array>} Array of user objects
 */
async function getAllForumUsers() {
  try {
    const userNames = await YouviShared.getAllUsers();
    const users = [];
    
    for (const userName of userNames) {
      const profile = await YouviShared.getUserProfile(userName);
      if (profile) {
        users.push({
          name: userName,
          nick: profile.name || userName,
          bio: profile.forumBio || profile.description || '',
          postsCount: profile.stats?.forumPosts || 0,
          joinedAt: profile.joinedAt || 0,
          avatar: profile.avatar
        });
      }
    }
    
    return users;
  } catch (e) {
    console.error('Error getting all forum users:', e);
    return [];
  }
}

/**
 * Save user avatar
 * @param {string} nick - User nickname
 * @param {File} file - Avatar file
 * @returns {Promise<string>} Avatar filename
 */
async function saveForumUserAvatar(nick, file) {
  if (!nick || !file) throw new Error('Nick and file are required');
  
  const userName = YouviShared.slugifyNick(nick);
  const channelsDir = await YouviShared.getChannelsDirectory();
  if (!channelsDir) throw new Error('Cannot access channels directory');
  
  const userDir = await channelsDir.getDirectoryHandle(userName, { create: true });
  
  // Generate filename
  const ext = file.name.split('.').pop().toLowerCase();
  const fileName = `avatar.${ext}`;
  
  // Save file
  const buffer = await file.arrayBuffer();
  await YouviShared.saveImageFile(userDir, fileName, buffer);
  
  // Update profile
  const profile = await YouviShared.getUserProfile(userName) || {};
  profile.avatar = fileName;
  await YouviShared.saveUserProfile(userName, profile);
  
  return fileName;
}

/**
 * Load user avatar as blob URL
 * @param {string} nick - User nickname
 * @param {string} fileName - Avatar filename
 * @returns {Promise<string|null>} Blob URL or null
 */
async function loadForumUserAvatar(nick, fileName) {
  if (!nick || !fileName) return null;
  
  try {
    const userName = YouviShared.slugifyNick(nick);
    const channelsDir = await YouviShared.getChannelsDirectory();
    if (!channelsDir) return null;
    
    const userDir = await channelsDir.getDirectoryHandle(userName, { create: false });
    const fileHandle = await userDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    
    return URL.createObjectURL(file);
  } catch (e) {
    console.error('Error loading avatar:', e);
    return null;
  }
}

/**
 * Check if forum is integrated with YouVi
 * @returns {Promise<boolean>} True if integrated
 */
async function isForumIntegrated() {
  try {
    const youviDir = await YouviShared.getYouviDirectory();
    return youviDir !== null;
  } catch (e) {
    return false;
  }
}

/**
 * Get forum directory handle (legacy support)
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function getForumDirectoryHandle() {
  return await YouviShared.getForumDirectory();
}

// Export functions
if (typeof window !== 'undefined') {
  window.ForumYouViIntegration = {
    // User profile functions
    getForumUserProfile,
    saveForumUserProfile,
    incrementForumPostCount,
    getForumUserAvatar,
    getAllForumUsers,
    
    // Avatar functions
    saveForumUserAvatar,
    loadForumUserAvatar,
    
    // Utility functions
    isForumIntegrated,
    getForumDirectoryHandle,
    slugifyNick: YouviShared.slugifyNick,
    escapeHtml: YouviShared.escapeHtml,
    
    // Re-export YouVi shared functions for convenience
    readJSONFile: YouviShared.readJSONFile,
    writeJSONFile: YouviShared.writeJSONFile,
    getChannelsDirectory: YouviShared.getChannelsDirectory,
    getForumDirectory: YouviShared.getForumDirectory
  };
}

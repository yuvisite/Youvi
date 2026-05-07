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
/* Shared filter engine for YouVi pages. Pure helpers only (no DOM access). */
(function initYouviFilterEngine(global) {
  'use strict';

  function parseStrictRatingTag(rawTag) {
    const normalized = String(rawTag || '').toLowerCase().trim();
    if (!normalized) return null;
    const match = normalized.match(/^(.+?)\s*\(ra\)$/);
    if (!match) return null;
    const value = match[1].trim();
    if (value === 'explicit') return 'explicit';
    if (value === 'questionable') return 'questionable';
    return null;
  }

  function getVideoRating(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return 'safe';

    let result = 'safe';
    for (const rawTag of tags) {
      const rating = parseStrictRatingTag(rawTag);
      if (!rating) continue;
      if (rating === 'explicit') return 'explicit';
      if (rating === 'questionable' && result !== 'explicit') result = 'questionable';
    }
    return result;
  }

  function applyRatingFilterToVideos(videos, mode) {
    if (!Array.isArray(videos) || videos.length === 0) return videos;
    const effectiveMode = mode || 'general';

    if (effectiveMode === 'all') return videos;

    if (effectiveMode === 'general') {
      return videos.filter(video => getVideoRating(video && video.tags ? video.tags : []) === 'safe');
    }

    if (effectiveMode === 'archived') {
      return videos.filter(video => {
        const rating = getVideoRating(video && video.tags ? video.tags : []);
        return rating === 'questionable' || rating === 'explicit';
      });
    }

    return videos;
  }

  function resolveCategoryAlias(tag, aliases) {
    if (!tag || tag === 'all') return tag;
    const lower = String(tag).toLowerCase().trim();
    return (aliases && aliases[lower]) || tag;
  }

  function filterVideosByCategory(videos, category, aliases) {
    if (!Array.isArray(videos) || videos.length === 0) return videos || [];
    const resolved = resolveCategoryAlias(category, aliases);
    if (!resolved || resolved === 'all') return videos;
    const resolvedLower = String(resolved).toLowerCase();

    return videos.filter(video => {
      const tags = Array.isArray(video && video.tags) ? video.tags : [];
      return tags.some(tag => {
        const tagStr = String(tag).trim();
        return !tagStr.includes('(ка)') && tagStr.toLowerCase() === resolvedLower;
      });
    });
  }

  function filterVideosByState(videos, state, aliases) {
    const list = Array.isArray(videos) ? videos : [];
    const current = state || {};
    const byCategory = filterVideosByCategory(list, current.tag || 'all', aliases);
    return applyRatingFilterToVideos(byCategory, current.rating || 'general');
  }

  function collectTagCounts(videos) {
    const counts = new Map();
    const list = Array.isArray(videos) ? videos : [];
    for (const video of list) {
      const tags = Array.isArray(video && video.tags) ? video.tags : [];
      for (const rawTag of tags) {
        const name = String(rawTag || '').trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    return counts;
  }

  function getCanonicalTagName(tag) {
    if (!tag) return '';
    if (typeof tag === 'string') return tag.trim();
    if (typeof tag.name === 'string' && tag.name.trim()) return tag.name.trim();
    return '';
  }

  global.YouviFilterEngine = {
    getVideoRating,
    applyRatingFilterToVideos,
    resolveCategoryAlias,
    filterVideosByCategory,
    filterVideosByState,
    collectTagCounts,
    getCanonicalTagName
  };
})(window);

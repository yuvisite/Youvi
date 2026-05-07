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

let currentQuery = '';
let currentSort = localStorage.getItem('youvi_sort') || 'newest';
let currentFilters = {
  quality: null,
  duration: null
};

let searchIndex = new Map();
let lastIndexBuild = 0;

function parseBooleanQuery(query) {
  if (!query) return { terms: [], operators: [], isBoolean: false };
  
  const tokens = query.trim().split(/\s+/);
  const terms = [];
  const operators = [];
  let isBoolean = false;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].toLowerCase();
    
    if (token === 'and' || token === '&&' || token === '&') {
      operators.push('AND');
      isBoolean = true;
    } else if (token === 'or' || token === '||' || token === '|') {
      operators.push('OR');
      isBoolean = true;
    } else if (token === 'not' || token === '!' || token === '-') {
      operators.push('NOT');
      isBoolean = true;
    } else if (token === '(' || token === ')') {
      operators.push(token);
      isBoolean = true;
    } else if (token.startsWith('"') && token.endsWith('"')) {
      terms.push({ text: token.slice(1, -1), type: 'exact' });
    } else if (token.startsWith('"')) {
      let phrase = token.slice(1);
      i++;
      while (i < tokens.length && !tokens[i].endsWith('"')) {
        phrase += ' ' + tokens[i];
        i++;
      }
      if (i < tokens.length) {
        phrase += ' ' + tokens[i].slice(0, -1);
      }
      terms.push({ text: phrase, type: 'exact' });
    } else if (token.startsWith('*') || token.endsWith('*')) {
      terms.push({ text: token, type: 'wildcard' });
    } else if (token.length > 0) {
      terms.push({ text: token, type: 'normal' });
    }
  }
  
  return { terms, operators, isBoolean };
}

function evaluateBooleanQuery(query, items, searchFunction) {
  const { terms, operators, isBoolean } = parseBooleanQuery(query);
  
  if (!isBoolean || terms.length === 0) {
    return searchFunction(query);
  }
  
  let results = new Set();
  let currentResults = new Set();
  let lastOperator = null;
  let negateNext = false;
  
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    let termResults = new Set();
    
    if (term.type === 'exact') {
      items.forEach(item => {
        const searchText = getSearchableText(item).toLowerCase();
        if (searchText.includes(term.text.toLowerCase())) {
          termResults.add(item);
        }
      });
    } else if (term.type === 'wildcard') {
      const pattern = term.text.replace(/\*/g, '.*');
      const regex = new RegExp(pattern, 'i');
      items.forEach(item => {
        const searchText = getSearchableText(item);
        if (regex.test(searchText)) {
          termResults.add(item);
        }
      });
    } else {
      const regularResults = searchFunction(term.text);
      regularResults.forEach(item => termResults.add(item));
    }
    
    if (i === 0) {
      currentResults = new Set(termResults);
    } else {
      if (lastOperator === 'AND') {
        currentResults = new Set([...currentResults].filter(item => termResults.has(item)));
      } else if (lastOperator === 'OR') {
        termResults.forEach(item => currentResults.add(item));
      } else if (lastOperator === 'NOT') {
        termResults.forEach(item => currentResults.delete(item));
      }
    }
    
    if (i < operators.length) {
      lastOperator = operators[i];
    }
  }
  
  return Array.from(currentResults);
}

function getSearchableText(item) {
  if (item.name) {
    return (item.name + ' ' + (item.tags || []).join(' ')).toLowerCase();
  } else if (item.title) {
    return (item.title + ' ' + (item.channelName || '')).toLowerCase();
  } else if (item.name && !item.title) {
    return item.name.toLowerCase();
  }
  return '';
}

function tokenizeQuery(q){ 
  const normalized = (q||'').toLowerCase()
    .replace(/ё/g, 'е').replace(/й/g, 'и')
    .replace(/ц/g, 'тс').replace(/щ/g, 'ш')
    .replace(/ь/g, '').replace(/ъ/g, '')
    .replace(/[^\w\s\u0400-\u04FF]/g,' ')
    .split(/\s+/)
    .filter(t=>t.length>1);
  
  return normalized;
}

function quickScore(queryTokens, text) {
  const content = (text||'').toLowerCase()
    .replace(/ё/g, 'е').replace(/й/g, 'и')
    .replace(/ц/g, 'тс').replace(/щ/g, 'ш')
    .replace(/ь/g, '').replace(/ъ/g, '');
  if (!content) return 0;
  
  let score = 0;
  for (const term of queryTokens) {
    if (content.includes(term)) {
      score += term.length * 3;
      continue;
    }
    
    const words = content.split(/\s+/);
    let foundMatch = false;
    
    for (const word of words) {
      if (word.startsWith(term)) {
        score += term.length * 2;
        foundMatch = true;
      } else if (word.includes(term) && term.length >= 3) {
        score += term.length;
        foundMatch = true;
      }
      
      if (!foundMatch && term.length >= 4) {
        if (Math.abs(word.length - term.length) <= 2) {
          let matches = 0;
          const minLen = Math.min(word.length, term.length);
          
          for (let i = 0; i < minLen; i++) {
            if (word[i] === term[i]) matches++;
          }
          
          const similarity = matches / Math.max(word.length, term.length);
          if (similarity >= 0.75) {
            score += term.length * 1.5;
            foundMatch = true;
          }
          else if (similarity >= 0.6 && term.length >= 6) {
            score += term.length * 1;
            foundMatch = true;
          }
        }
        
        if (!foundMatch && term.length >= 4 && word.length >= 4) {
          for (let i = 0; i < term.length - 1; i++) {
            const swapped = term.substring(0, i) + term[i+1] + term[i] + term.substring(i+2);
            if (word.includes(swapped)) {
              score += term.length * 1.2;
              foundMatch = true;
              break;
            }
          }
        }
      }
    }
  }
  return score;
}

function buildSearchIndex() {
  const now = Date.now();
  if (now - lastIndexBuild < 30000 && searchIndex.size > 0) {
    return;
  }
  
  searchIndex.clear();
  
  allVideos.forEach(video => {
    const text = ((video.name || '').replace(/\.[^/.]+$/, '') + ' ' + 
                 (video.tags || []).join(' ')).toLowerCase();
    const words = text.split(/\s+/);
    
    words.forEach(word => {
      if (word.length > 2) {
        if (!searchIndex.has(word)) {
          searchIndex.set(word, { videos: [], playlists: [], channels: [] });
        }
        searchIndex.get(word).videos.push(video);
      }
    });
  });
  
  allPlaylists.forEach(playlist => {
    const text = ((playlist.title || '') + ' ' + (playlist.channelName || '')).toLowerCase();
    const words = text.split(/\s+/);
    
    words.forEach(word => {
      if (word.length > 2) {
        if (!searchIndex.has(word)) {
          searchIndex.set(word, { videos: [], playlists: [], channels: [] });
        }
        searchIndex.get(word).playlists.push(playlist);
      }
    });
  });
  
  allChannels.forEach(channel => {
    const text = (channel.name || '').toLowerCase();
    const words = text.split(/\s+/);
    
    words.forEach(word => {
      if (word.length > 2) {
        if (!searchIndex.has(word)) {
          searchIndex.set(word, { videos: [], playlists: [], channels: [] });
        }
        searchIndex.get(word).channels.push(channel);
      }
    });
  });
  
  lastIndexBuild = now;
}

function sortVideos(videos, sortType) {
  if (!videos || videos.length === 0) return videos;
  
  const sorted = [...videos];
  
  switch (sortType) {
    case 'newest':
      return sorted.sort((a, b) => {
        const aTime = a.created || a.modified || 0;
        const bTime = b.created || b.modified || 0;
        return bTime - aTime;
      });
      
    case 'oldest':
      return sorted.sort((a, b) => {
        const aTime = a.created || a.modified || 0;
        const bTime = b.created || b.modified || 0;
        return aTime - bTime;
      });
      
    case 'popular':
      return sorted.sort((a, b) => {
        const aViews = a.views || 0;
        const bViews = b.views || 0;
        const aLikes = a.likes || 0;
        const bLikes = b.likes || 0;
        const aScore = aViews + (aLikes * 10);
        const bScore = bViews + (bLikes * 10);
        return bScore - aScore;
      });
      
    case 'alphabetical':
      return sorted.sort((a, b) => {
        const aName = getFileNameWithoutExtension(a.name || '').toLowerCase();
        const bName = getFileNameWithoutExtension(b.name || '').toLowerCase();
        return aName.localeCompare(bName, 'ru', { numeric: true });
      });
      
    default:
      return sorted;
  }
}

function filterVideosByQuality(videos, quality) {
  if (!quality) return videos;
  
  return videos.filter(video => {
    const videoQuality = getVideoQuality(video);
    return videoQuality === quality;
  });
}

function filterVideosByDuration(videos, durationFilter) {
  if (!durationFilter) return videos;
  
  return videos.filter(video => {
    const duration = video._cachedDuration || video.duration;
    if (!duration) return true;
    
    const timeParts = duration.split(':').map(Number);
    let totalSeconds = 0;
    
    if (timeParts.length === 2) {
      totalSeconds = timeParts[0] * 60 + timeParts[1];
    } else if (timeParts.length === 3) {
      totalSeconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    }
    
    switch (durationFilter) {
      case 'short':
        return totalSeconds <= 60;
      case '5min':
        return totalSeconds <= 300;
      case '10min':
        return totalSeconds <= 600;
      case '20min':
        return totalSeconds <= 1200;
      case '60min':
        return totalSeconds <= 3600;
      case 'long':
        return totalSeconds > 3600;
      default:
        return true;
    }
  });
}

function applyFiltersAndSort(videos) {
  let filtered = [...videos];
  
  if (currentFilters.quality) {
    filtered = filterVideosByQuality(filtered, currentFilters.quality);
  }
  
  if (currentFilters.duration) {
    filtered = filterVideosByDuration(filtered, currentFilters.duration);
  }
  
  filtered = sortVideos(filtered, currentSort);
  
  return filtered;
}

function filterVideosRegular(query) {
  buildSearchIndex();
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return allVideos;
  
  const candidateSet = new Set();
  
  for (const token of tokens) {
    if (searchIndex.has(token)) {
      searchIndex.get(token).videos.forEach(video => candidateSet.add(video));
    }
    
    if (token.length >= 3) {
      for (const [word, data] of searchIndex.entries()) {
        if (word.includes(token) || token.includes(word)) {
          data.videos.forEach(video => candidateSet.add(video));
        }
      }
    }
  }
  
  if (candidateSet.size === 0) {
    candidateSet.clear();
    allVideos.forEach(video => candidateSet.add(video));
  }
  
  const results = Array.from(candidateSet).map(v => {
    const fileName = getFileNameWithoutExtension(v.name);
    const nameScore = quickScore(tokens, fileName);
    
    let tagsScore = 0;
    if (Array.isArray(v.tags)) {
      const tagText = v.tags.join(' ');
      tagsScore = quickScore(tokens, tagText);
    }
    
    const maxScore = Math.max(nameScore, tagsScore);
    return { video: v, score: maxScore };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.1) {
      return (b.video.created || b.video.modified || 0) - (a.video.created || a.video.modified || 0);
    }
    return b.score - a.score;
  })
  .map(item => item.video);
  
  return results;
}

function filterVideos(query) {
  if (!query) return allVideos;
  
  const { isBoolean } = parseBooleanQuery(query);
  if (isBoolean) {
    return evaluateBooleanQuery(query, allVideos, filterVideosRegular);
  }
  
  return filterVideosRegular(query);
}

function filterPlaylistsRegular(query) {
  buildSearchIndex();
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return allPlaylists;
  
  const candidateSet = new Set();
  
  for (const token of tokens) {
    if (searchIndex.has(token)) {
      searchIndex.get(token).playlists.forEach(playlist => candidateSet.add(playlist));
    }
    
    if (token.length >= 3) {
      for (const [word, data] of searchIndex.entries()) {
        if (word.includes(token) || token.includes(word)) {
          data.playlists.forEach(playlist => candidateSet.add(playlist));
        }
      }
    }
  }
  
  if (candidateSet.size === 0) {
    candidateSet.clear();
    allPlaylists.forEach(playlist => candidateSet.add(playlist));
  }
  
  const results = Array.from(candidateSet).map(p => {
    const titleScore = quickScore(tokens, p.title||'');
    const channelScore = quickScore(tokens, p.channelName||'');
    return { item: p, score: Math.max(titleScore, channelScore) };
  }).filter(item => item.score > 0)
    .sort((a,b) => b.score - a.score)
    .map(it => it.item);
  
  return results;
}

function filterPlaylists(query) {
  if (!query) return allPlaylists;
  
  const { isBoolean } = parseBooleanQuery(query);
  if (isBoolean) {
    return evaluateBooleanQuery(query, allPlaylists, filterPlaylistsRegular);
  }
  
  return filterPlaylistsRegular(query);
}

function filterChannelsRegular(query) {
  buildSearchIndex();
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return allChannels;
  
  const candidateSet = new Set();
  
  for (const token of tokens) {
    if (searchIndex.has(token)) {
      searchIndex.get(token).channels.forEach(channel => candidateSet.add(channel));
    }
    
    if (token.length >= 3) {
      for (const [word, data] of searchIndex.entries()) {
        if (word.includes(token) || token.includes(word)) {
          data.channels.forEach(channel => candidateSet.add(channel));
        }
      }
    }
  }
  
  if (candidateSet.size === 0) {
    candidateSet.clear();
    allChannels.forEach(channel => candidateSet.add(channel));
  }
  
  const results = Array.from(candidateSet).map(c => {
    const nameScore = quickScore(tokens, c.name||'');
    return { item: c, score: nameScore };
  }).filter(item => item.score > 0)
    .sort((a,b) => b.score - a.score)
    .map(it => it.item);
  
  return results;
}

function filterChannels(query) {
  if (!query) return allChannels;
  
  const { isBoolean } = parseBooleanQuery(query);
  if (isBoolean) {
    return evaluateBooleanQuery(query, allChannels, filterChannelsRegular);
  }
  
  return filterChannelsRegular(query);
}

function runSearch(query){
  currentQuery = (query||'').trim();
  document.title = currentQuery ? `${currentQuery} | Поиск | Youvi` : 'Поиск | Youvi';
  if (!currentQuery){ renderResults([]); return; }
  
  if (currentType === 'videos'){
    const searchResults = filterVideos(currentQuery);
    const results = applyFiltersAndSort(searchResults);
    renderResults(results);
    return;
  }

  if (currentType === 'playlists'){
    const results = filterPlaylists(currentQuery);
    renderResults(results);
    return;
  }

  if (currentType === 'channels'){
    const results = filterChannels(currentQuery);
    renderResults(results);
    return;
  }
}

function updateSearchIndicators() {
  const input = document.getElementById('headerSearchInput');
  if (!input) return;
  
  const query = input.value.trim();
  const { isBoolean, terms, operators } = parseBooleanQuery(query);
  
  input.classList.remove('boolean-search', 'exact-search', 'wildcard-search');
  
  if (query.length === 0) return;
  
  if (isBoolean) {
    input.classList.add('boolean-search');
    input.title = `Булевый запрос: ${operators.join(' ')}`;
  } else if (query.includes('"')) {
    input.classList.add('exact-search');
    input.title = 'Точный поиск фразы';
  } else if (query.includes('*')) {
    input.classList.add('wildcard-search');
    input.title = 'Wildcard поиск';
  } else {
    input.title = 'Обычный поиск';
  }
}

function setSorting(sortType) {
  currentSort = sortType;
  localStorage.setItem('youvi_sort', sortType);
  updateSortingUI();
  refreshResults();
}

function toggleFilter(filterType, filterValue) {
  if (currentFilters[filterType] === filterValue) {
    currentFilters[filterType] = null;
  } else {
    currentFilters[filterType] = filterValue;
  }
  
  localStorage.setItem('youvi_filters', JSON.stringify(currentFilters));
  updateFilteringUI();
  refreshResults();
}

function clearAllFilters() {
  currentFilters = { quality: null, duration: null };
  currentSort = 'newest';
  
  localStorage.setItem('youvi_sort', currentSort);
  localStorage.setItem('youvi_filters', JSON.stringify(currentFilters));
  
  updateSortingUI();
  updateFilteringUI();
  refreshResults();
}

function updateSortingUI() {
  document.querySelectorAll('.sort-item').forEach(item => {
    item.classList.toggle('active', item.dataset.sort === currentSort);
  });
}

function updateFilteringUI() {
  document.querySelectorAll('.filter-item').forEach(item => {
    const filterType = item.dataset.filter;
    const filterValue = item.dataset.value;
    const isActive = currentFilters[filterType] === filterValue;
    item.classList.toggle('active', isActive);
  });
}

function refreshResults() {
  if (currentQuery) {
    runSearch(currentQuery);
  } else {
    const results = applyFiltersAndSort(allVideos);
    renderResults(results);
  }
}

function initializeCollapsiblePanel(initiallyCollapsed = false) {
  const panel = document.querySelector('.sorting-panel');
  const header = document.getElementById('sortingHeader');
  const toggle = document.getElementById('sortingToggle');
  
  if (!panel || !header || !toggle) return;
  
  if (initiallyCollapsed) {
    panel.classList.add('collapsed');
  }
  
  header.addEventListener('click', () => {
    toggleCollapsiblePanel();
  });
  
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCollapsiblePanel();
  });
}

function toggleCollapsiblePanel() {
  const panel = document.querySelector('.sorting-panel');
  if (!panel) return;
  
  const isCollapsed = panel.classList.contains('collapsed');
  
  if (isCollapsed) {
    panel.classList.remove('collapsed');
    localStorage.setItem('youvi_sorting_collapsed', 'false');
  } else {
    panel.classList.add('collapsed');
    localStorage.setItem('youvi_sorting_collapsed', 'true');
  }
}

function initializeSortingAndFiltering() {
  const savedSort = localStorage.getItem('youvi_sort');
  const savedFilters = localStorage.getItem('youvi_filters');
  const sortingCollapsed = localStorage.getItem('youvi_sorting_collapsed') === 'true';
  
  if (savedSort) currentSort = savedSort;
  if (savedFilters) {
    try {
      currentFilters = { ...currentFilters, ...JSON.parse(savedFilters) };
    } catch (e) {
      console.warn('Failed to parse saved filters:', e);
    }
  }
  
  initializeCollapsiblePanel(sortingCollapsed);
  
  updateSortingUI();
  updateFilteringUI();
  
  document.querySelectorAll('.sort-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const sortType = item.dataset.sort;
      if (sortType) {
        setSorting(sortType);
      }
    });
  });
  
  document.querySelectorAll('.filter-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const filterType = item.dataset.filter;
      const filterValue = item.dataset.value;
      if (filterType && filterValue) {
        toggleFilter(filterType, filterValue);
      }
    });
  });
  
  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearAllFilters();
    });
  }
}
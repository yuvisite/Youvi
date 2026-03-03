
let currentQuery = '';
let currentSort = localStorage.getItem('youvi_sort') || 'newest';
let currentRatingFilter = new URLSearchParams(window.location.search).get('rating') || localStorage.getItem('youvi_rating_filter') || 'all';
window.currentRatingFilter = currentRatingFilter;

let currentFilters = {
  quality: null,
  duration: null
};

try {
  const savedFilters = localStorage.getItem('youvi_filters');
  if (savedFilters) {
    const parsed = JSON.parse(savedFilters);
    currentFilters = { ...currentFilters, ...parsed };
  }
} catch (e) {
  console.warn('[Filters] Failed to parse saved filters:', e);
}

let searchIndex = new Map();
let lastIndexBuild = 0;

function getCurrentRatingMode() {
  return window.currentRatingFilter || currentRatingFilter || 'all';
}

function applyRatingModeToVideos(videos) {
  const list = Array.isArray(videos) ? videos : [];
  const mode = getCurrentRatingMode();
  if (window.YouviFilterEngine && typeof window.YouviFilterEngine.applyRatingFilterToVideos === 'function') {
    return window.YouviFilterEngine.applyRatingFilterToVideos(list, mode);
  }
  return list;
}

function applyRatingModeToPlaylists(playlists) {
  const list = Array.isArray(playlists) ? playlists : [];
  return list
    .map(playlist => {
      const sourceVideos = Array.isArray(playlist && playlist.videos) ? playlist.videos : [];
      const videos = applyRatingModeToVideos(sourceVideos);
      return { ...playlist, videos };
    })
    .filter(playlist => Array.isArray(playlist.videos) && playlist.videos.length > 0);
}

const TAG_TYPE_MAP = {
  'channel': 'ка',
  'general': 'gt',
  'character': 'ch',
  'author': 'au',
  'artist': 'au',
  'genre': 'ge',
  'type': 'tp',
  'year': 'yr',
  'studio': 'st',
  'category': 'ct',
  'rating': 'ra',
  'anime': 'at',
  'anime_title': 'at',
  'serial': 'ser',
  'serial_title': 'ser',
  'movie': 'mt',
  'movie_title': 'mt',
  'animation': 'nat',
  'animation_title': 'nat',
  'аниме': 'at',
  'сериал': 'ser',
  'фильм': 'mt',
  'анимация': 'nat'
};

function parseBooleanQuery(query) {
  if (!query) return { terms: [], operators: [], isBoolean: false };
  
  const tokens = query.trim().split(/\s+/);
  const terms = [];
  const operators = [];
  let isBoolean = false;
  let pendingOperator = null;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const tokenLower = token.toLowerCase();
    
    if (tokenLower === 'and' || tokenLower === '&&' || tokenLower === '&') {
      pendingOperator = 'AND';
      isBoolean = true;
    } else if (tokenLower === 'or' || tokenLower === '||' || tokenLower === '|') {
      pendingOperator = 'OR';
      isBoolean = true;
    } else if (tokenLower === 'not' || tokenLower === '!' || tokenLower === '-') {
      pendingOperator = 'NOT';
      isBoolean = true;
    } else if (token === '(' || token === ')') {
      operators.push(token);
      isBoolean = true;
    } else if (token.startsWith('"') && token.endsWith('"') && token.length > 2) {
      terms.push({ text: token.slice(1, -1), type: 'exact', operator: pendingOperator });
      operators.push(pendingOperator);
      pendingOperator = null;
      isBoolean = true;
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
      terms.push({ text: phrase, type: 'exact', operator: pendingOperator });
      operators.push(pendingOperator);
      pendingOperator = null;
      isBoolean = true;
    } else if (token.includes(':')) {
      const colonIndex = token.indexOf(':');
      const prefix = token.substring(0, colonIndex).toLowerCase();
      let value = token.substring(colonIndex + 1);
      
      if (value.startsWith('"')) {
        value = value.slice(1);
        i++;
        while (i < tokens.length && !tokens[i].endsWith('"')) {
          value += ' ' + tokens[i];
          i++;
        }
        if (i < tokens.length) {
          value += ' ' + tokens[i].slice(0, -1);
        }
      } else {
        const nextTokens = [];
        let j = i + 1;
        while (j < tokens.length) {
          const nextToken = tokens[j];
          const nextLower = nextToken.toLowerCase();
          if (nextLower === 'and' || nextLower === 'or' || nextLower === 'not' || 
              nextLower === '&&' || nextLower === '||' || nextLower === '!' || 
              nextLower === '&' || nextLower === '|' || nextLower === '-') {
            break;
          }
          if (nextToken.includes(':')) {
            break;
          }
          nextTokens.push(nextToken);
          j++;
        }
        if (nextTokens.length > 0) {
          value += ' ' + nextTokens.join(' ');
          i = j - 1;
        }
      }
      
      const tagType = TAG_TYPE_MAP[prefix];
      
      if (tagType && value) {
        terms.push({ text: value, type: 'tag_type', tagType: tagType, operator: pendingOperator });
        operators.push(pendingOperator);
        pendingOperator = null;
        isBoolean = true;
      } else {
        terms.push({ text: token, type: 'normal', operator: pendingOperator });
        operators.push(pendingOperator);
        pendingOperator = null;
      }
    } else if (token.startsWith('*') || token.endsWith('*')) {
      terms.push({ text: token, type: 'wildcard', operator: pendingOperator });
      operators.push(pendingOperator);
      pendingOperator = null;
    } else if (token.length > 0) {
      terms.push({ text: token, type: 'normal', operator: pendingOperator });
      operators.push(pendingOperator);
      pendingOperator = null;
    }
  }
  
  
  return { terms, operators, isBoolean };
}

function evaluateBooleanQuery(query, items, searchFunction) {
  const { terms, operators, isBoolean } = parseBooleanQuery(query);
  
  if (!isBoolean || terms.length === 0) {
    return searchFunction(query);
  }
  
  let currentResults = new Set();
  
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const operator = term.operator || null;
    let termResults = new Set();
    
    if (term.type === 'tag_type') {
      
      let searchTerms = [term.text.trim()];
      
      if (window.tagAliasSearch && window.tagAliasSearch.tagDB && window.tagAliasSearch.tagDB.isLoaded) {
        const resolved = window.tagAliasSearch.fastLookup(term.text.trim());
        
        if (resolved && resolved.length > 0 && resolved[0] !== term.text.trim()) {
          const matchingTypeResolved = resolved.filter(canonical => {
            const typeMatch = canonical.match(/\(([a-zа-я]{2,3})\)$/i);
            if (typeMatch) {
              const resolvedType = typeMatch[1].toLowerCase();
              return resolvedType === term.tagType;
            }
            return false;
          });
          
          if (matchingTypeResolved.length > 0) {
            searchTerms = matchingTypeResolved.map(t => t.replace(/\s*\([a-zа-я]{2,3}\)$/i, '').trim());
          }
        }
      }
      
      items.forEach(item => {
        if (Array.isArray(item.tags)) {
          for (const tag of item.tags) {
            const match = tag.match(/^(.+?)\s*\(([a-zа-я]{2,3})\)$/iu);
            if (match) {
              const tagContent = match[1].trim();
              const tagType = match[2].toLowerCase();
              
              if (tagType === term.tagType) {
                const normalizedTag = tagContent.toLowerCase().replace(/\s+/g, ' ').trim();
                
                for (const termText of searchTerms) {
                  const normalizedTerm = termText.toLowerCase().replace(/\s+/g, ' ').trim();
                  
                  if (normalizedTag === normalizedTerm || 
                      SearchTranslit.matchesExact(normalizedTag, normalizedTerm)) {
                    
                    
                    termResults.add(item);
                    break;
                  }
                }
                if (termResults.has(item)) break;
              }
            }
          }
        }
      });
    } else if (term.type === 'exact') {
      const exactPhrase = term.text.toLowerCase().trim();
      
      items.forEach(item => {
        const searchText = getSearchableText(item);
        
        const escapedPhrase = exactPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('(?:^|\\s)' + escapedPhrase + '(?:\\s|$)', 'i');
        
        if (regex.test(searchText)) {
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
      if (operator === 'NOT') {
        currentResults = new Set(items.filter(item => !termResults.has(item)));
      } else {
        currentResults = new Set(termResults);
      }
    } else {
      const beforeSize = currentResults.size;
      
      if (operator === 'NOT') {
        termResults.forEach(item => currentResults.delete(item));
      } else if (operator === 'AND') {
        currentResults = new Set([...currentResults].filter(item => termResults.has(item)));
      } else if (operator === 'OR') {
        termResults.forEach(item => currentResults.add(item));
      }
    }
  }
  
  return Array.from(currentResults);
}

function getSearchableText(item) {
  if (item.name) {
    const nameWithoutExt = getFileNameWithoutExtension(item.name);
    return (nameWithoutExt + ' ' + (item.tags || []).join(' ')).toLowerCase();
  } else if (item.title) {
    return (item.title + ' ' + (item.channelName || '')).toLowerCase();
  } else if (item.name && !item.title) {
    return getFileNameWithoutExtension(item.name).toLowerCase();
  }
  return '';
}

const SearchTranslit = {
  translitMap: {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'є': 'ye',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'і': 'i', 'ї': 'yi',
    'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
    'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e',
    'ю': 'yu', 'я': 'ya', 'ґ': 'g'
  },
  
  latinToCyrillicVariants: {
    'shch': ['щ'],
    'sh': ['ш'],
    'ch': ['ч'],
    'zh': ['ж'],
    'ts': ['ц'],
    'yo': ['ё'],
    'ya': ['я'],
    'yu': ['ю'],
    'ye': ['є', 'е'],
    
    'a': ['а'],
    'b': ['б'],
    'v': ['в'],
    'g': ['г'],
    'd': ['д'],
    'e': ['е'],
    'z': ['з'],
    'i': ['и'],
    'y': ['й', 'ы'],
    'k': ['к'],
    'l': ['л'],
    'm': ['м'],
    'n': ['н'],
    'o': ['о'],
    'p': ['п'],
    'r': ['р'],
    's': ['с'],
    't': ['т'],
    'u': ['у'],
    'f': ['ф'],
    'h': ['х'],
    'c': ['к', 'с']
  },
  
  toLatin(text) {
    return text.split('').map(char => this.translitMap[char.toLowerCase()] || char).join('');
  },
  
  _cyrillicCache: new Map(),
  
  generateCyrillicVariants(latinText) {
    const text = latinText.toLowerCase();
    
    if (this._cyrillicCache.has(text)) {
      return this._cyrillicCache.get(text);
    }
    
    const variants = new Set();
    const sortedKeys = Object.keys(this.latinToCyrillicVariants).sort((a, b) => b.length - a.length);
    const MAX_VARIANTS = 20;
    
    const generateRecursive = (str, index, currentResult, depth = 0) => {
      if (variants.size >= MAX_VARIANTS || depth > 10) return;
      
      if (index >= str.length) {
        variants.add(currentResult);
        return;
      }
      
      let matched = false;
      
      for (const latinSeq of sortedKeys) {
        if (str.substring(index, index + latinSeq.length) === latinSeq) {
          const cyrillicOptions = this.latinToCyrillicVariants[latinSeq];
          
          const limitedOptions = cyrillicOptions.slice(0, 2);
          
          for (const cyrVar of limitedOptions) {
            generateRecursive(str, index + latinSeq.length, currentResult + cyrVar, depth + 1);
          }
          
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        generateRecursive(str, index + 1, currentResult + str[index], depth + 1);
      }
    };
    
    generateRecursive(text, 0, '');
    
    const result = Array.from(variants).slice(0, MAX_VARIANTS);
    
    if (this._cyrillicCache.size > 500) {
      this._cyrillicCache.clear();
    }
    this._cyrillicCache.set(text, result);
    
    return result;
  },
  
  _latinCache: new Map(),
  
  generateLatinVariants(cyrillicText) {
    const text = cyrillicText.toLowerCase();
    
    if (this._latinCache.has(text)) {
      return this._latinCache.get(text);
    }
    
    const result = [this.toLatin(text)];
    
    if (this._latinCache.size > 500) {
      this._latinCache.clear();
    }
    this._latinCache.set(text, result);
    
    return result;
  },
  
  matches(text, query) {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    if (lowerText.includes(lowerQuery)) return true;
    
    const textNoSigns = lowerText.replace(/[ьъ]/g, '');
    const queryNoSigns = lowerQuery.replace(/[ьъj]/g, '');
    if (textNoSigns.includes(queryNoSigns)) return true;
    
    const textLatin = this.toLatin(lowerText);
    const queryLatin = this.toLatin(lowerQuery);
    if (textLatin.includes(queryLatin)) return true;
    
    if (lowerQuery.length <= 8) {
      const cyrillicCharsQuery = (lowerQuery.match(/[а-яёіїєґ]/g) || []).length;
      const latinCharsQuery = (lowerQuery.match(/[a-z]/g) || []).length;
      
      if (latinCharsQuery > cyrillicCharsQuery) {
        const cyrillicVariants = this.generateCyrillicVariants(lowerQuery);
        for (const variant of cyrillicVariants) {
          if (lowerText.includes(variant)) return true;
        }
      }
    }
    
    return false;
  },
  
  matchesExact(text, query) {
    const lowerText = text.toLowerCase().trim();
    const lowerQuery = query.toLowerCase().trim();
    
    if (lowerText === lowerQuery) return true;
    
    const textNoSigns = lowerText.replace(/[ьъ]/g, '');
    const queryNoSigns = lowerQuery.replace(/[ьъj]/g, '');
    if (textNoSigns === queryNoSigns) return true;
    
    const textLatin = this.toLatin(lowerText);
    const queryLatin = this.toLatin(lowerQuery);
    if (textLatin === queryLatin) return true;
    
    if (lowerQuery.length <= 8) {
      const cyrillicCharsQuery = (lowerQuery.match(/[а-яёіїєґ]/g) || []).length;
      const latinCharsQuery = (lowerQuery.match(/[a-z]/g) || []).length;
      
      if (latinCharsQuery > cyrillicCharsQuery) {
        const cyrillicVariants = this.generateCyrillicVariants(lowerQuery);
        for (const variant of cyrillicVariants) {
          if (lowerText === variant) return true;
        }
      }
    }
    
    return false;
  }
};

function tokenizeQuery(q){ 
  const original = (q||'').toLowerCase().trim();
  if (!original) return [];
  
  const tokens = new Set();
  
  tokens.add(original);
  
  tokens.add(SearchTranslit.toLatin(original));
  
  tokens.add(original.replace(/[ьъj]/g, ''));
  
  const words = original
    .replace(/[^\w\s\u0400-\u04FF]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
  
  words.forEach(w => tokens.add(w));
  
  return Array.from(tokens);
}

function quickScore(queryTokens, text) {
  const content = (text||'').toLowerCase();
  if (!content) return 0;
  
  let score = 0;
  
  for (const term of queryTokens) {
    if (content.includes(term)) {
      score += term.length * 3;
      continue;
    }
    
    if (SearchTranslit.matches(content, term)) {
      score += term.length * 2;
      continue;
    }
    
    const words = content.split(/\s+/);
    for (const word of words) {
      if (word.startsWith(term)) {
        score += term.length * 1.5;
        break;
      }
    }
  }
  
  return score;
}

function buildSearchIndex() {
  const now = Date.now();
  
  const hasData = (allVideos && allVideos.length > 0) || 
                  (allPlaylists && allPlaylists.length > 0) || 
                  (allChannels && allChannels.length > 0);
  
  if (now - lastIndexBuild < 30000 && searchIndex.size > 0) {
    return;
  }
  
  searchIndex.clear();
  
  allVideos.forEach(video => {
    const fileName = (video.name || '').replace(/\.[^/.]+$/, '').toLowerCase();
    const fileWords = fileName.split(/\s+/);
    
    fileWords.forEach(word => {
      if (word.length > 2) {
        if (!searchIndex.has(word)) {
          searchIndex.set(word, { videos: [], playlists: [], channels: [] });
        }
        searchIndex.get(word).videos.push(video);
      }
    });
    
    if (Array.isArray(video.tags)) {
      video.tags.forEach(tag => {
        const tagLower = tag.toLowerCase();
        if (tagLower.length > 0) {
          if (!searchIndex.has(tagLower)) {
            searchIndex.set(tagLower, { videos: [], playlists: [], channels: [] });
          }
          searchIndex.get(tagLower).videos.push(video);
        }
      });
    }
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
      
    case 'danmaku':
      return sorted.sort((a, b) => {
        const aDanmaku = a.danmakuCount || (window.DanmakuCounter ? window.DanmakuCounter.get(a.name) : 0) || 0;
        const bDanmaku = b.danmakuCount || (window.DanmakuCounter ? window.DanmakuCounter.get(b.name) : 0) || 0;
        return bDanmaku - aDanmaku;
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
    const before = filtered.length;
    filtered = filterVideosByQuality(filtered, currentFilters.quality);
  }
  
  if (currentFilters.duration) {
    const before = filtered.length;
    filtered = filterVideosByDuration(filtered, currentFilters.duration);
  }
  
  filtered = sortVideos(filtered, currentSort);
  
  return filtered;
}

function filterVideosRegular(query) {
  buildSearchIndex();
  const sourceVideos = applyRatingModeToVideos(allVideos);
  const sourceVideoSet = new Set(sourceVideos);
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return sourceVideos;
  
  let expandedTokens = [...tokens];
  if (window.tagAliasSearch && window.tagAliasSearch.tagDB && window.tagAliasSearch.tagDB.isLoaded) {
    const aliasTokens = [];
    for (const token of tokens) {
      const resolved = window.tagAliasSearch.fastLookup(token);
      if (resolved && resolved.length > 0) {
        resolved.forEach(canonical => {
          const withoutSuffix = canonical.replace(/\s*\([a-zа-я]{2,3}\)$/i, '').toLowerCase();
          aliasTokens.push(withoutSuffix);
        });
      }
    }
    if (aliasTokens.length > 0) {
      expandedTokens = [...tokens, ...aliasTokens];
    }
  }
  
  const candidateSet = new Set();
  
  for (const token of expandedTokens) {
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
    sourceVideos.forEach(video => candidateSet.add(video));
  }

  const results = Array.from(candidateSet)
  .filter(v => sourceVideoSet.has(v))
  .map(v => {
    const fileName = getFileNameWithoutExtension(v.name);
    const nameScore = quickScore(expandedTokens, fileName);
    
    let tagsScore = 0;
    if (Array.isArray(v.tags)) {
      const queryLower = query.toLowerCase().trim();
      for (const tag of v.tags) {
        if (tag.toLowerCase() === queryLower) {
          tagsScore = queryLower.length * 10;
          break;
        }
      }
      if (tagsScore === 0) {
        const tagText = v.tags.join(' ');
        tagsScore = quickScore(expandedTokens, tagText);
      }
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
  const sourceVideos = applyRatingModeToVideos(allVideos);
  if (!query) return sourceVideos;
  
  const { isBoolean } = parseBooleanQuery(query);
  if (isBoolean) {
    return evaluateBooleanQuery(query, sourceVideos, filterVideosRegular);
  }
  
  return filterVideosRegular(query);
}

function filterPlaylistsRegular(query) {
  buildSearchIndex();
  const sourcePlaylists = applyRatingModeToPlaylists(allPlaylists);
  const sourcePlaylistSet = new Set(sourcePlaylists.map(pl => (pl && pl.id) || (pl && pl.title) || ''));
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return sourcePlaylists;
  
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
    sourcePlaylists.forEach(playlist => candidateSet.add(playlist));
  }
  
  const results = Array.from(candidateSet)
  .filter(p => sourcePlaylistSet.has((p && p.id) || (p && p.title) || ''))
  .map(p => {
    const titleScore = quickScore(tokens, p.title||'');
    const channelScore = quickScore(tokens, p.channelName||'');
    return { item: p, score: Math.max(titleScore, channelScore) };
  }).filter(item => item.score > 0)
    .sort((a,b) => b.score - a.score)
    .map(it => it.item);
  
  return results;
}

function filterPlaylists(query) {
  const sourcePlaylists = applyRatingModeToPlaylists(allPlaylists);
  if (!query) return sourcePlaylists;
  
  const { isBoolean } = parseBooleanQuery(query);
  if (isBoolean) {
    return evaluateBooleanQuery(query, sourcePlaylists, filterPlaylistsRegular);
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
    const results = applyFiltersAndSort(applyRatingModeToVideos(allVideos));
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
  const sortingCollapsed = localStorage.getItem('youvi_sorting_collapsed') === 'true';
  
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

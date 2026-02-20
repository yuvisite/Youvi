(function(){
	'use strict';


	const DEFAULT_LIMIT = 12;
	const REBUILD_DEBOUNCE_MS = 150;


	let libraryVersion = 0;
	let lastVideosHash = 0;
	let allVideosRef = null;
	let idByName = new Map();
	let nameById = [];
	let tokensById = [];
	let tagsById = [];
	let tokenToIds = new Map();
	let tagToIds = new Map();
	let rebuildTimer = null;

	function toLowerSafe(s){ return (s||'').toLowerCase(); }

	/**
	 * Fast hash for change detection (FNV-1a variant)
	 */
	function computeVideosHash(videos){
		if (!Array.isArray(videos) || videos.length === 0) return 0;
		let h = 0x811c9dc5;
		h ^= videos.length;
		h = (h * 0x01000193) >>> 0;
		const indices = [0, Math.floor(videos.length / 2), videos.length - 1];
		for (const i of indices) {
			const v = videos[i];
			if (v && v.name) {
				for (let j = 0; j < v.name.length; j++) {
					h ^= v.name.charCodeAt(j);
					h = (h * 0x01000193) >>> 0;
				}
			}
		}
		return h;
	}

	/**
	 * Parse tag to extract content without type designation
	 * "Action (ge)" -> "action"
	 * "HDanime7 (ка)" -> "hdanime7"
	 */
	function parseTagContent(tagString){
		if (!tagString || typeof tagString !== 'string') return '';
		const trimmed = tagString.trim();
		const match = trimmed.match(/^(.+?)\s*\([a-zа-я]{2,3}\)$/iu);
		if (match) {
			return toLowerSafe(match[1].trim());
		}
		return toLowerSafe(trimmed);
	}

	/**
	 * Parse tag to extract type code
	 * "Action (ge)" -> "ge"
	 */
	function parseTagType(tagString){
		if (!tagString || typeof tagString !== 'string') return null;
		const match = tagString.trim().match(/\(([a-zа-я]{2,3})\)$/iu);
		return match ? toLowerSafe(match[1]) : null;
	}

	function tokenizeTitle(name){
		const base = toLowerSafe(name).replace(/\.[a-z0-9]{1,6}$/i,'');
		const raw = base.split(/[^a-zA-Z0-9а-яА-ЯёЁ]+/).filter(Boolean);
		const tokens = [];
		for (const w of raw){
			if (w.length >= 2) tokens.push(w);
		}
		return tokens;
	}

	function uniquePush(map, key, id){
		let set = map.get(key);
		if (!set){ set = new Set(); map.set(key, set); }
		set.add(id);
	}

	function rebuildIndex(allVideos){
		libraryVersion++;
		allVideosRef = allVideos;
		const len = allVideosRef ? allVideosRef.length : 0;
		idByName = new Map();
		nameById = new Array(len);
		tokensById = new Array(len);
		tagsById = new Array(len);
		tagTypesById = new Array(len);
		tokenToIds = new Map();
		tagToIds = new Map();

		for (let i = 0; i < len; i++){
			const v = allVideosRef[i];
			nameById[i] = v && v.name ? v.name : '';
			idByName.set(nameById[i], i);

			const tks = tokenizeTitle(nameById[i]);
			tokensById[i] = tks;
			for (const t of tks){ uniquePush(tokenToIds, t, i); }

			const rawTags = Array.isArray(v?.tags) ? v.tags : [];
			const vtags = rawTags.map(parseTagContent).filter(Boolean);
			const vtagTypes = rawTags.map(parseTagType);
			tagsById[i] = vtags;
			tagTypesById[i] = vtagTypes;
			for (const tg of vtags){ uniquePush(tagToIds, tg, i); }
		}
	}

	/**
	 * Debounced rebuild - prevents redundant index rebuilds
	 */
	function scheduleRebuild(allVideos, force = false){
		const newHash = computeVideosHash(allVideos);
		
		if (!force && newHash === lastVideosHash && allVideosRef) {
			return false;
		}
		
		if (rebuildTimer) {
			clearTimeout(rebuildTimer);
			rebuildTimer = null;
		}
		
		if (!allVideosRef || force) {
			lastVideosHash = newHash;
			rebuildIndex(allVideos);
			return true;
		}
		
		rebuildTimer = setTimeout(() => {
			lastVideosHash = newHash;
			rebuildIndex(allVideos);
			rebuildTimer = null;
		}, REBUILD_DEBOUNCE_MS);
		
		return true;
	}

	function ensureIndexed(getAllVideosFn){
		if (!allVideosRef && typeof getAllVideosFn === 'function'){
			const videos = getAllVideosFn() || [];
			scheduleRebuild(videos, true);
		}
	}

	const LOW_WEIGHT_TAG_TYPES = new Set(['ka', 'ка', 'author', 'au']);
	const LOW_WEIGHT_MULTIPLIER = 0.15;

	let tagTypesById = [];

	function scoreCandidate(curTokens, curTags, curTagTypes, candidateId){
		const candTokens = tokensById[candidateId] || [];
		const candTags = tagsById[candidateId] || [];
		const candTagTypes = tagTypesById[candidateId] || [];
		let tokenOverlap = 0;
		let tagScore = 0;

		if (curTokens.length && candTokens.length){
			const candSet = new Set(candTokens);
			for (const t of curTokens) if (candSet.has(t)) tokenOverlap++;
		}
		if (curTags.length && candTags.length){
			const candTagMap = new Map();
			for (let i = 0; i < candTags.length; i++) {
				const key = candTags[i] + '|' + (candTagTypes[i] || '');
				candTagMap.set(key, candTagTypes[i] || null);
			}
			for (let i = 0; i < curTags.length; i++) {
				const tg = curTags[i];
				const curType = curTagTypes[i] || null;
				const key = tg + '|' + (curType || '');
				if (candTagMap.has(key)) {
					const candType = candTagMap.get(key);
					const isLowWeight = (curType && LOW_WEIGHT_TAG_TYPES.has(curType)) || 
					                    (candType && LOW_WEIGHT_TAG_TYPES.has(candType));
					tagScore += isLowWeight ? LOW_WEIGHT_MULTIPLIER : 1;
				}
			}
		}
		return tagScore * 2 + tokenOverlap;
	}

	function gatherCandidates(curTokens, curTags, excludeId){
		const candidateSet = new Set();
		for (const t of curTokens){ const ids = tokenToIds.get(t); if (ids) for (const id of ids) if (id!==excludeId) candidateSet.add(id); }
		for (const tg of curTags){ const ids = tagToIds.get(tg); if (ids) for (const id of ids) if (id!==excludeId) candidateSet.add(id); }
		return candidateSet;
	}

let randomCursor = 0;
let sessionSalt = Math.floor(Math.random()*0x7fffffff);

function fnv1a(str){
    let h = 0x811c9dc5;
    for (let i=0;i<str.length;i++){
        h ^= str.charCodeAt(i);
        h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0;
    }
    return h >>> 0;
}

function getSeriesKey(name){
    const base = toLowerSafe(name).replace(/\.[a-z0-9]{1,6}$/i,'');
    let s = base
        .replace(/\[[^\]]*\]/g,' ')
        .replace(/\([^)]*\)/g,' ')
        .replace(/\b(s\d{1,2}e\d{1,3}|ep\.?\s?\d{1,3}|episode\s?\d{1,3})\b/gi,' ')
        .replace(/\b(part|серия|эпизод)\s?\d{1,3}\b/gi,' ')
        .replace(/[-_\s]+\d{1,3}\b/g,' ');
    const parts = s.trim().split(/[^a-z0-9а-яё]+/i).filter(Boolean);
    return parts.slice(0,3).join(' ') || base;
}

function interleaveBySeries(ids){
    const groupsMap = new Map();
    for (const id of ids){
        const k = getSeriesKey(nameById[id]||'');
        let g = groupsMap.get(k);
        if (!g){ g = []; groupsMap.set(k, g); }
        g.push(id);
    }
    const groups = Array.from(groupsMap.entries()).map(([k, list]) => {
        list.sort((a,b)=> (fnv1a((nameById[a]||'')+sessionSalt) - fnv1a((nameById[b]||'')+sessionSalt)));
        return { key:k, list };
    });
    groups.sort((a,b)=> fnv1a(a.key+sessionSalt) - fnv1a(b.key+sessionSalt));
    const flat = [];
    let idx = randomCursor % Math.max(1, groups.length);
    const remaining = groups.map(g=>g.list.slice());
    let added = true;
    while(added){
        added = false;
        for (let i=0;i<groups.length;i++){
            const gi = (idx + i) % groups.length;
            if (remaining[gi].length){ flat.push(remaining[gi].shift()); added = true; }
        }
    }
    return flat;
}

	function recommendFor(currentVideo, opts){
		const limit = Math.max(1, (opts && opts.limit) || DEFAULT_LIMIT);
		const videosLen = allVideosRef ? allVideosRef.length : 0;
		
        if (!currentVideo || !currentVideo.name || videosLen === 0){
            const poolIds = [];
            for (let i = 0; i < videosLen; i++){
                const v = allVideosRef[i];
                if (!v || !v.name) continue;
                if (currentVideo && v.name === currentVideo.name) continue;
                poolIds.push(i);
            }
            if (poolIds.length === 0) return [];
            const orderedIds = interleaveBySeries(poolIds);
            const start = 0;
            const take = orderedIds.slice(start, start+limit);
            randomCursor = (randomCursor + limit) % Math.max(1, poolIds.length);
            return take.map(id => allVideosRef[id]).filter(Boolean);
        }

		const curId = idByName.get(currentVideo.name);
		const curTokens = tokenizeTitle(currentVideo.name);
		const rawCurTags = Array.isArray(currentVideo.tags) ? currentVideo.tags : [];
		const curTags = rawCurTags.map(parseTagContent).filter(Boolean);
		const curTagTypes = rawCurTags.map(parseTagType);

		let candidates = gatherCandidates(curTokens, curTags, curId);
		let ranked = [];
		if (candidates.size){
			for (const id of candidates){
				const s = scoreCandidate(curTokens, curTags, curTagTypes, id);
				if (s > 0){ ranked.push({ id, s }); }
			}
			ranked.sort((a,b)=> b.s - a.s);
		}

        if (ranked.length < limit){
            const needed = limit - ranked.length;
            const used = new Set(ranked.map(r=>r.id));
            const pool = [];
            for (let i = 0; i < nameById.length; i++) if (i !== curId && !used.has(i)) pool.push(i);
            if (pool.length){
                const ordered = interleaveBySeries(pool);
                for (const id of ordered){ if (ranked.length < limit) ranked.push({ id, s:-1 }); else break; }
                randomCursor = (randomCursor + needed) % Math.max(1, pool.length);
            }
        }

		return ranked.slice(0, limit).map(r => allVideosRef[r.id]).filter(Boolean);
	}

	function onAllVideosUpdated(allVideos, options = {}){
		return scheduleRebuild(allVideos || [], options.force === true);
	}

	function warm(currentVideo){
		void currentVideo;
	}

	/**
	 * Check if index needs rebuild (for external callers)
	 */
	function needsRebuild(allVideos){
		const newHash = computeVideosHash(allVideos);
		return newHash !== lastVideosHash;
	}

	/**
	 * Get current video count in index
	 */
	function getIndexedCount(){
		return allVideosRef ? allVideosRef.length : 0;
	}

	const api = {
		init(getAllVideosFn){ ensureIndexed(getAllVideosFn); return api; },
		onAllVideosUpdated,
		recommendFor,
		warm,
		needsRebuild,
		getIndexedCount,
		get version(){ return libraryVersion; },
		get lastHash(){ return lastVideosHash; }
	};

	try { window.YouviRecommendations = api; } catch(_) {}
})();


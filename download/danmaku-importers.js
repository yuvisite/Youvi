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
'use strict';

const NICONICO_COLOR_MAP = {
    white: '#ffffff',
    red: '#ff0000',
    pink: '#ff8080',
    orange: '#ffcc00',
    yellow: '#ffff00',
    green: '#00ff00',
    cyan: '#00ffff',
    blue: '#0000ff',
    purple: '#c000ff',
    black: '#000000',
    white2: '#cccc99',
    niconicowhite: '#cccc99',
    red2: '#cc0033',
    truered: '#cc0033',
    orange2: '#ff6600',
    passionorange: '#ff6600',
    yellow2: '#999900',
    madyellow: '#999900',
    green2: '#00cc66',
    elementalgreen: '#00cc66',
    cyan2: '#00cccc',
    blue2: '#3399ff',
    marineblue: '#3399ff',
    purple2: '#6633cc',
    nobleviolet: '#6633cc',
    black2: '#666666'
};

function normalizeText(text) {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\u0000/g, '')
        .trim();
}

function normalizeTimestamp(value) {
    if (!value) return Date.now();

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
            const numeric = Number(trimmed);
            return numeric > 1e12 ? numeric : numeric * 1000;
        }

        const parsed = Date.parse(trimmed);
        if (!Number.isNaN(parsed)) return parsed;
        return Date.now();
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return Date.now();
    return numeric > 1e12 ? numeric : numeric * 1000;
}

function normalizeDanmakuPosition(position) {
    return position === 'top' || position === 'bottom' ? position : 'scroll';
}

function normalizeDanmakuSize(size) {
    return size === 'small' || size === 'big' ? size : 'normal';
}

function numberToHexColor(value, fallback = '#ffffff') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return fallback;
    const clamped = Math.max(0, Math.min(0xffffff, Math.trunc(numeric)));
    return `#${clamped.toString(16).padStart(6, '0')}`;
}

function resolveColorToken(token, fallback = '#ffffff') {
    if (!token) return fallback;

    const normalized = String(token).trim().toLowerCase();
    if (NICONICO_COLOR_MAP[normalized]) {
        return NICONICO_COLOR_MAP[normalized];
    }

    if (/^#?[0-9a-f]{6}$/i.test(normalized)) {
        return normalized.startsWith('#') ? normalized : `#${normalized}`;
    }

    return fallback;
}

function decodeXmlEntities(text) {
    return String(text ?? '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
        const lowered = entity.toLowerCase();

        if (lowered === 'amp') return '&';
        if (lowered === 'lt') return '<';
        if (lowered === 'gt') return '>';
        if (lowered === 'quot') return '"';
        if (lowered === 'apos') return '\'';

        if (lowered.startsWith('#x')) {
            const numeric = Number.parseInt(lowered.slice(2), 16);
            return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : '';
        }

        if (lowered.startsWith('#')) {
            const numeric = Number.parseInt(lowered.slice(1), 10);
            return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : '';
        }

        return `&${entity};`;
    });
}

function buildDanmakuItem({ id, text, time, color, size, position, created }) {
    return {
        id: String(id),
        text,
        time: Math.max(0, Number(time) || 0),
        color: resolveColorToken(color),
        size: normalizeDanmakuSize(size),
        position: normalizeDanmakuPosition(position),
        created: normalizeTimestamp(created),
        shown: false
    };
}

function bilibiliModeToPosition(mode) {
    switch (Number(mode)) {
    case 4:
        return 'bottom';
    case 5:
        return 'top';
    case 6:
        return 'scroll';
    default:
        return 'scroll';
    }
}

function bilibiliFontSizeToSize(fontSize) {
    const numeric = Number(fontSize) || 25;
    if (numeric <= 18) return 'small';
    if (numeric >= 36) return 'big';
    return 'normal';
}

function parseBilibiliDanmakuXml(xml) {
    if (!xml) return [];

    const items = [];
    const regex = /<d\b[^>]*\bp="([^"]+)"[^>]*>([\s\S]*?)<\/d>/g;
    let match;
    let index = 0;

    while ((match = regex.exec(xml)) !== null) {
        const params = String(match[1] || '').split(',');
        if (params.length < 4) continue;

        const mode = Number.parseInt(params[1], 10);
        if (Number.isFinite(mode) && mode >= 7) {
            index += 1;
            continue;
        }

        const text = normalizeText(decodeXmlEntities(match[2]));
        const time = Number.parseFloat(params[0]);
        if (!text || !Number.isFinite(time)) {
            index += 1;
            continue;
        }

        items.push(buildDanmakuItem({
            id: params[7] || `${params[6] || 'bili'}-${index}`,
            text,
            time,
            color: numberToHexColor(params[3]),
            size: bilibiliFontSizeToSize(params[2]),
            position: bilibiliModeToPosition(mode),
            created: params[4] || Date.now()
        }));

        index += 1;
    }

    return items.sort((a, b) => a.time - b.time);
}

function parseNiconicoCommentsJson(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;

    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function parseNiconicoCommands(commands) {
    let position = 'scroll';
    let size = 'normal';
    let color = '#ffffff';

    const tokens = Array.isArray(commands) ? commands : [];
    tokens.forEach(command => {
        const token = String(command || '').trim().toLowerCase();
        if (!token || token === '184' || token.startsWith('device:')) return;

        if (token === 'ue') {
            position = 'top';
            return;
        }

        if (token === 'shita') {
            position = 'bottom';
            return;
        }

        if (token === 'naka') {
            position = 'scroll';
            return;
        }

        if (token === 'big') {
            size = 'big';
            return;
        }

        if (token === 'small') {
            size = 'small';
            return;
        }

        if (token === 'medium') {
            size = 'normal';
            return;
        }

        const resolvedColor = resolveColorToken(token, null);
        if (resolvedColor) {
            color = resolvedColor;
        }
    });

    return { position, size, color };
}

function formatNiconicoNick(comment, index) {
    const userId = normalizeText(comment?.userId);
    if (/^\d+$/.test(userId)) return `user ${userId}`;
    if (userId.startsWith('nvc:') && userId.length > 8) return `user ${userId.slice(-8)}`;
    if (userId) return userId;

    const number = Number(comment?.no);
    if (Number.isFinite(number) && number > 0) return `comment ${number}`;

    return `nico ${index + 1}`;
}

function parseNiconicoDanmakuJson(raw) {
    return parseNiconicoCommentsJson(raw)
        .map((comment, index) => {
            const text = normalizeText(comment?.body);
            if (!text) return null;

            const vposMs = Number(comment?.vposMs);
            const legacyVpos = Number(comment?.vpos);
            const time = Number.isFinite(vposMs) ? vposMs / 1000 : (Number.isFinite(legacyVpos) ? legacyVpos / 100 : NaN);
            if (!Number.isFinite(time)) return null;

            const appearance = parseNiconicoCommands(comment?.commands);
            return buildDanmakuItem({
                id: comment?.id || `nico-danmaku-${index}`,
                text,
                time,
                color: appearance.color,
                size: appearance.size,
                position: appearance.position,
                created: comment?.postedAt || Date.now()
            });
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);
}

function convertNiconicoCommentsToYouviComments(raw) {
    return parseNiconicoCommentsJson(raw)
        .map((comment, index) => {
            const text = normalizeText(comment?.body);
            if (!text) return null;

            const item = {
                id: String(comment?.id || `nico-comment-${index}`),
                nick: formatNiconicoNick(comment, index),
                text,
                created: normalizeTimestamp(comment?.postedAt),
                replies: []
            };

            const nicoruCount = Number(comment?.nicoruCount);
            if (Number.isFinite(nicoruCount)) {
                item.likes = nicoruCount;
            }

            return item;
        })
        .filter(Boolean)
        .sort((a, b) => (a.created || 0) - (b.created || 0));
}

module.exports = {
    convertNiconicoCommentsToYouviComments,
    parseBilibiliDanmakuXml,
    parseNiconicoDanmakuJson
};

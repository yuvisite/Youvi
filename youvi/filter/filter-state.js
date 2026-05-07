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
/* Shared filter state store for YouVi pages (URL/localStorage sync optional by page). */
(function initYouviFilterState(global) {
  'use strict';

  function create(initialState) {
    const listeners = new Set();
    let state = { ...(initialState || {}) };

    function getState() {
      return { ...state };
    }

    function setState(partial) {
      const next = { ...state, ...(partial || {}) };
      const changed = Object.keys(next).some(key => next[key] !== state[key]);
      if (!changed) return;
      state = next;
      listeners.forEach(fn => {
        try { fn(getState()); } catch (_) {}
      });
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') return function noop() {};
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    return { getState, setState, subscribe };
  }

  global.YouviFilterState = { create };
})(window);

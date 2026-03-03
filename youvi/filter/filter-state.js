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

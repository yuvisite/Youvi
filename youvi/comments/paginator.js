
(function(){
    const BATCH_SIZE = 20;
    const stateByList = new WeakMap();

    function createShowMoreButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'comments-show-more';
        btn.textContent = 'Показать еще';
        btn.style.display = 'block';
        btn.style.margin = '12px auto 16px auto';
        return btn;
    }

    function ensureButton(listEl, state) {
        const controlsContainer = listEl.parentElement || listEl;
        let btn = state.button;
        if (!btn || !btn.isConnected) {
            btn = controlsContainer.querySelector('.comments-show-more');
            if (!btn) {
                btn = createShowMoreButton();
                btn.dataset.owned = '1';
                controlsContainer.appendChild(btn);
            }
            if (!btn.dataset.paginationBound) {
                btn.addEventListener('click', () => {
                    requestAnimationFrame(() => showNextBatch(listEl));
                }, { passive: true });
                btn.dataset.paginationBound = '1';
            }
            state.button = btn;
        }
        return btn;
    }

    function showNextBatch(listEl) {
        const state = stateByList.get(listEl);
        if (!state) return;
        const items = Array.from(listEl.children);
        const total = items.length;
        const nextEnd = Math.min(state.shownCount + BATCH_SIZE, total);
        for (let i = state.shownCount; i < nextEnd; i++) {
            const it = items[i];
            if (it) it.style.display = '';
        }
        state.shownCount = nextEnd;
        if (state.shownCount >= total && state.button) {
            if (state.button.dataset && state.button.dataset.owned === '1') {
                if (state.button.parentNode) state.button.parentNode.removeChild(state.button);
            } else {
                state.button.style.display = 'none';
            }
            state.button = null;
        }
    }

    function applyPagination(listEl) {
        if (!listEl) return;
        const items = Array.from(listEl.children);
        const total = items.length;

        if (total <= BATCH_SIZE) {
            const prev = stateByList.get(listEl);
            if (prev) {
                for (const it of items) it.style.display = '';
                if (prev.button) {
                    if (prev.button.dataset && prev.button.dataset.owned === '1') {
                        if (prev.button.parentNode) prev.button.parentNode.removeChild(prev.button);
                    } else {
                        prev.button.style.display = 'none';
                    }
                }
                stateByList.delete(listEl);
            }
            return;
        }

        let state = stateByList.get(listEl);
        if (!state) {
            state = { shownCount: 0, button: null };
            stateByList.set(listEl, state);
            for (let i = 0; i < total; i++) {
                const it = items[i];
                if (it) it.style.display = 'none';
            }
            ensureButton(listEl, state);
            showNextBatch(listEl);
            return;
        }

        for (let i = state.shownCount; i < total; i++) {
            const it = items[i];
            if (it) it.style.display = 'none';
        }
        if (state.shownCount < total) {
            const btn = ensureButton(listEl, state);
            btn.style.display = 'block';
        } else if (state.button) {
            if (state.button.dataset && state.button.dataset.owned === '1') {
                if (state.button.parentNode) state.button.parentNode.removeChild(state.button);
            } else {
                state.button.style.display = 'none';
            }
            state.button = null;
        }
    }

    function tryInitPagination(root=document) {
        const container = root.querySelector('#commentsContainer');
        if (!container) return;

        const listEl = container.querySelector('.comments-list');
        if (listEl && listEl.children && listEl.children.length) {
            applyPagination(listEl);
        }

        // NOTE: MutationObserver is no longer used here.
        // Lazy batch rendering in renderComments handles pagination directly,
        // avoiding the performance overhead of observing every DOM mutation
        // when thousands of comment nodes are appended.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => tryInitPagination());
    } else {
        tryInitPagination();
    }

    window.YouviCommentsPagination = {
        init: tryInitPagination,
        paginateList: applyPagination
    };
})();


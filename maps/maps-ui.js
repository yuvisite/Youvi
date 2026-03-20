'use strict';

/**
 * MapUI – manages all DOM interactions:
 *   toolbar buttons, sidebars, properties panel, modals, search.
 */
class MapUI {
  constructor(app) {
    this.app        = app;
    this._pendingObj = null; // object being edited in modal
    this._pendingType = null;
    this._init();
  }

  _init() {
    const app = this.app;

    const isEditableTarget = target => {
      if (!target) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    };

    // ── Toolbar buttons ──────────────────────────────────────────────────────
    document.getElementById('btnUndo')?.addEventListener('click', () => app.undo());
    document.getElementById('btnRedo')?.addEventListener('click', () => app.redo());
    document.getElementById('btnSave')?.addEventListener('click', async () => {
      this.flash(await app.saveCurrentMap() ? '💾 Сохранено' : 'Ошибка сохранения');
    });
    document.getElementById('btnExport')?.addEventListener('click', () => app.exportJSON());
    document.getElementById('btnExportAll')?.addEventListener('click', async () => {
      this.flash(await app.exportBackupJSON() ? '🗃 Backup экспортирован' : 'Ошибка экспорта backup');
    });
    document.getElementById('btnLoad')?.addEventListener('click', () => document.getElementById('fileInput')?.click());
    document.getElementById('fileInput')?.addEventListener('change', e => app.importJSON(e));

    document.getElementById('btnZoomIn' )?.addEventListener('click', () => { app.viewport.zoom(1.4, app.canvas.width/2, app.canvas.height/2); this.updateZoom(); });
    document.getElementById('btnZoomOut')?.addEventListener('click', () => { app.viewport.zoom(0.7, app.canvas.width/2, app.canvas.height/2); this.updateZoom(); });
    document.getElementById('btnZoomFit')?.addEventListener('click', () => { app.fitView(); this.updateZoom(); });

    // Grid / Snap toggle
    document.getElementById('btnGrid')?.addEventListener('click', () => {
      app.renderer.layers.grid = !app.renderer.layers.grid;
      document.getElementById('btnGrid').classList.toggle('active', app.renderer.layers.grid);
    });

    // Map name
    document.getElementById('mapNameInput')?.addEventListener('change', e => {
      app.data.name = e.target.value;
      app.scheduleAutosave();
    });

    // ── Tool buttons ─────────────────────────────────────────────────────────
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        app.tools.activate(btn.dataset.tool);
      });
    });

    // Road type radio
    document.querySelectorAll('input[name="roadType"]').forEach(r => {
      r.addEventListener('change', () => {
        if (app.tools.activeTool instanceof RoadTool) {
          app.tools.activeTool.setRoadType(r.value);
        }
      });
    });

    const laneInput = document.getElementById('roadLaneCountInput');
    const widthInput = document.getElementById('roadWidthScaleInput');
    const tramInput = document.getElementById('roadTramInput');
    const syncRoadToolGeometry = () => {
      const roadTool = app.tools?.tools?.road;
      if (roadTool) roadTool.setRoadGeometry(laneInput?.value, widthInput?.value);
    };
    laneInput?.addEventListener('input', syncRoadToolGeometry);
    widthInput?.addEventListener('input', syncRoadToolGeometry);
    tramInput?.addEventListener('change', () => {
      const roadTool = app.tools?.tools?.road;
      if (roadTool) roadTool.setRoadTram(tramInput.checked);
    });

    // Area type buttons
    document.querySelectorAll('.area-type-btn[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.area-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (app.tools.activeTool instanceof AreaTool) {
          app.tools.activeTool.setAreaType(btn.dataset.type);
        }
      });
    });

    // ── Layer checkboxes ─────────────────────────────────────────────────────
    document.querySelectorAll('.layer-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        app.renderer.layers[cb.dataset.layer] = cb.checked;
      });
    });

    // ── Template buttons ─────────────────────────────────────────────────────
    this._buildTemplates();

    // ── Search ───────────────────────────────────────────────────────────────
    const searchInput = document.getElementById('searchInput');
    const searchRes   = document.getElementById('searchResults');

    const doSearch = () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) { searchRes.style.display = 'none'; return; }
      const results = this._searchObjects(q);
      this._showSearchResults(results, searchRes);
    };

    searchInput?.addEventListener('input', doSearch);
    searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    document.querySelector('.maps-search-btn')?.addEventListener('click', doSearch);

    searchInput?.addEventListener('blur', () => {
      setTimeout(() => { if (searchRes) searchRes.style.display = 'none'; }, 200);
    });

    // ── Modal ────────────────────────────────────────────────────────────────
    document.getElementById('propsModalClose')?.addEventListener('click', () => this._closeModal());
    document.getElementById('propsModalCancel')?.addEventListener('click', () => this._closeModal());
    document.getElementById('propsModalSave')?.addEventListener('click', () => this._saveModal());
    document.getElementById('propsModalDelete')?.addEventListener('click', () => {
      if (this._pendingObj) {
        app.pushUndoCheckpoint();
        app.deleteById(this._pendingObj.id);
        app.renderer.selection.clear();
        this.clearProperties();
        this.updateStats();
      }
      this._closeModal();
    });
    document.getElementById('propsModal')?.addEventListener('click', e => {
      if (e.target.id === 'propsModal') this._closeModal();
    });

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    window.addEventListener('keydown', e => {
      const isShortcut = e.ctrlKey || e.metaKey;
      if (isShortcut && ['z', 'y', 's', 'c', 'v'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
      }

      const modalOpen = document.getElementById('propsModal')?.style.display !== 'none';
      const editingField = isEditableTarget(e.target);

      if ((e.ctrlKey||e.metaKey) && e.key === 'z') { app.undo(); return; }
      if ((e.ctrlKey||e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key==='z'))) { app.redo(); return; }
      if ((e.ctrlKey||e.metaKey) && e.key === 's') { app.saveCurrentMap().then(ok => this.flash(ok ? '💾 Сохранено' : 'Ошибка сохранения')); return; }
      if ((e.ctrlKey||e.metaKey) && e.key === 'c') { this.flash(app.copySelection() ? '📋 Скопировано' : 'Нечего копировать'); return; }
      if ((e.ctrlKey||e.metaKey) && e.key === 'v') { this.flash(app.pasteClipboard() ? '📌 Вставлено' : 'Буфер пуст'); return; }

      if (editingField || modalOpen) return;

      app.tools.activeTool?.onKeyDown(e);

      const KB = { v:'select', r:'road', a:'area', p:'poi', e:'eraser' };
      if (KB[e.key.toLowerCase()]) app.tools.activate(KB[e.key.toLowerCase()]);
      if (e.key === '+' || e.key === '=') app.viewport.zoom(1.3, app.canvas.width/2, app.canvas.height/2);
      if (e.key === '-') app.viewport.zoom(0.77, app.canvas.width/2, app.canvas.height/2);
    }, true);

    window.addEventListener('copy', e => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      this.flash(app.copySelection() ? '📋 Скопировано' : 'Нечего копировать');
    }, true);

    window.addEventListener('paste', e => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      this.flash(app.pasteClipboard() ? '📌 Вставлено' : 'Буфер пуст');
    }, true);
  }

  // ── Templates panel ─────────────────────────────────────────────────────────
  _buildTemplates() {
    const grid = document.getElementById('templatesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const tpl of MAP_TEMPLATES) {
      const btn = document.createElement('button');
      btn.className   = 'template-btn';
      btn.title       = tpl.description;
      btn.dataset.id  = tpl.id;
      btn.innerHTML   = `<span class="template-icon">${tpl.icon}</span><span class="template-name">${tpl.name}</span>`;
      btn.addEventListener('click', () => this._insertTemplate(tpl.id));
      grid.appendChild(btn);
    }
  }

  _insertTemplate(tplId) {
    const app = this.app;
    const cx  = app.viewport.s2w(app.canvas.width/2, app.canvas.height/2).x;
    const cy  = app.viewport.s2w(app.canvas.width/2, app.canvas.height/2).y;
    app.pushUndoCheckpoint();
    const res = insertTemplate(app.data, tplId, cx, cy);
    if (res) {
      app.renderer.selection.clear();
      [...res.roadIds, ...res.areaIds].forEach(id => app.renderer.selection.add(id));
      this.updateStats();
      this.flash('✅ Шаблон вставлен');
    }
  }

  // ── Tool sections visibility ─────────────────────────────────────────────
  setToolSections(toolName) {
    document.getElementById('roadTypeSection').style.display = toolName === 'road' ? '' : 'none';
    document.getElementById('areaTypeSection').style.display = toolName === 'area' ? '' : 'none';
    document.getElementById('poiTypeSection') && (document.getElementById('poiTypeSection').style.display = toolName === 'poi' ? '' : 'none');
  }

  setActiveTool(name) {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === name);
    });
  }

  syncRoadControls(type, laneCount, widthScale, tram = false) {
    document.querySelectorAll('input[name="roadType"]').forEach(radio => {
      radio.checked = radio.value === type;
    });
    const laneInput = document.getElementById('roadLaneCountInput');
    const widthInput = document.getElementById('roadWidthScaleInput');
    const tramInput = document.getElementById('roadTramInput');
    if (laneInput) laneInput.value = Math.max(1, Number(laneCount) || 2);
    if (widthInput) widthInput.value = Math.max(0.5, Number(widthScale) || 1);
    if (tramInput) tramInput.checked = !!tram;
  }

  // ── Properties panel ────────────────────────────────────────────────────────
  showProperties(type, obj) {
    const form  = document.getElementById('propertiesForm');
    const empty = document.getElementById('propertiesEmpty');
    if (!form || !empty) return;
    form.style.display  = '';
    empty.style.display = 'none';
    form.innerHTML = this._buildPropsHTML(type, obj, false);
    form.querySelectorAll('input,select,textarea').forEach(el => {
      el.addEventListener('change', () => {
        this._applyInlineProps(type, obj, form);
        this.app.markDirty();
        this.app.scheduleAutosave();
      });
    });
  }

  clearProperties() {
    const form  = document.getElementById('propertiesForm');
    const empty = document.getElementById('propertiesEmpty');
    if (form)  form.style.display = 'none';
    if (empty) empty.style.display = '';
  }

  // ── Modal dialog ───────────────────────────────────────────────────────────
  openPropertiesModal(type, obj) {
    this._pendingObj  = obj;
    this._pendingType = type;

    const modal = document.getElementById('propsModal');
    const title = document.getElementById('propsModalTitle');
    const body  = document.getElementById('propsModalBody');
    if (!modal) return;

    const labels = { road:'Дорога', area:'Область', poi:'Объект', node:'Узел' };
    title.textContent = labels[type] || 'Свойства';
    body.innerHTML    = this._buildPropsHTML(type, obj, true);
    modal.style.display = 'flex';
  }

  _closeModal() {
    const modal = document.getElementById('propsModal');
    if (modal) modal.style.display = 'none';
    this._pendingObj  = null;
    this._pendingType = null;
  }

  _saveModal() {
    const body = document.getElementById('propsModalBody');
    if (!body || !this._pendingObj) { this._closeModal(); return; }
    this.app.pushUndoCheckpoint();
    this._applyInlineProps(this._pendingType, this._pendingObj, body);
    this.showProperties(this._pendingType, this._pendingObj);
    this._closeModal();
    this.updateStats();
    this.flash('✅ Сохранено');
  }

  _buildPropsHTML(type, obj, full) {
    let html = '';
    if (type === 'road') {
      const typeOpts = ['highway','arterial','street','alley','pedestrian'];
      const typeLabels = { highway:'Шоссе', arterial:'Проспект', street:'Улица', alley:'Переулок', pedestrian:'Пешеходная' };
      html += `<div class="prop-field"><label>Название</label><input name="name" value="${this._esc(obj.name||'')}" placeholder="Название улицы"></div>`;
      html += `<div class="prop-field"><label>Тип</label><select name="type">${typeOpts.map(t=>`<option value="${t}"${obj.type===t?' selected':''}>${typeLabels[t]}</option>`).join('')}</select></div>`;
      html += `<div class="prop-field"><label>Полос</label><input name="laneCount" type="number" min="1" max="12" step="1" value="${Math.max(1, obj.laneCount || 2)}"></div>`;
      html += `<div class="prop-field"><label>Ширина</label><input name="widthScale" type="number" min="0.5" max="3" step="0.25" value="${obj.widthScale || 1}"></div>`;
      html += `<div class="prop-field prop-check"><label><input type="checkbox" name="tram"${obj.tram?' checked':''}> Трамвайные линии поверх дороги</label></div>`;
      html += `<div class="prop-field prop-check"><label><input type="checkbox" name="oneway"${obj.oneway?' checked':''}> Одностороннее движение</label></div>`;
    } else if (type === 'area') {
      const typeOpts = ['building','park','water','forest','industrial','residential','commercial','square','parking','stadium','concrete'];
      const typeLabels = { building:'Здание', park:'Парк', water:'Водоём', forest:'Лес', industrial:'Промзона', residential:'Жилой', commercial:'Торговый', square:'Площадь', parking:'Парковка', stadium:'Стадион', concrete:'Бетон' };
      html += `<div class="prop-field"><label>Название</label><input name="name" value="${this._esc(obj.name||'')}" placeholder="Название"></div>`;
      html += `<div class="prop-field"><label>Номер</label><input name="number" value="${this._esc(obj.number||'')}" placeholder="Номер дома"></div>`;
      html += `<div class="prop-field"><label>Тип</label><select name="type">${typeOpts.map(t=>`<option value="${t}"${obj.type===t?' selected':''}>${typeLabels[t]}</option>`).join('')}</select></div>`;
    } else if (type === 'poi') {
      const cat = PLACES_CATEGORIES[obj.type] || PLACES_CATEGORIES.other;
      html += this._buildPoiCard(obj, cat);
      html += `<div class="prop-field"><label>Название</label><input name="name" value="${this._esc(obj.name||'')}" placeholder="Название объекта"></div>`;
      html += `<div class="prop-field"><label>Адрес</label><input name="address" value="${this._esc(obj.address||'')}" placeholder="Адрес"></div>`;
      const groups = getPlacesGroups();
      html += `<div class="prop-field"><label>Категория</label><select name="type">`;
      for (const [group, cats] of Object.entries(groups)) {
        html += `<optgroup label="${group}">`;
        for (const cat of cats) {
          html += `<option value="${cat.key}"${obj.type===cat.key?' selected':''}>${cat.icon} ${cat.label}</option>`;
        }
        html += `</optgroup>`;
      }
      html += `</select></div>`;
    } else if (type === 'node') {
      html += `<div class="prop-field"><label>X</label><input name="x" type="number" value="${Math.round(obj.x)}"></div>`;
      html += `<div class="prop-field"><label>Y</label><input name="y" type="number" value="${Math.round(obj.y)}"></div>`;
    }
    return html;
  }

  _buildPoiCard(obj, cat) {
    const title = this._esc(obj.name || 'Без названия');
    const address = this._esc(obj.address || 'Адрес не указан');
    const category = this._esc(cat.label);
    return `
      <div class="place-card">
        <div class="place-card-hero" style="--place-accent:${cat.color};">
          <div class="place-card-icon">${cat.icon}</div>
          <div class="place-card-meta">
            <div class="place-card-type">${category}</div>
            <div class="place-card-title">${title}</div>
            <div class="place-card-address">${address}</div>
          </div>
        </div>
        <div class="place-card-actions">
          <button type="button" class="place-chip">Открыто на карте</button>
          <button type="button" class="place-chip">Редактируемый объект</button>
        </div>
      </div>
    `;
  }

  _applyInlineProps(type, obj, container) {
    const g = name => {
      const el = container.querySelector(`[name="${name}"]`);
      if (!el) return undefined;
      if (el.type === 'checkbox') return el.checked;
      return el.value;
    };
    if (type === 'road') {
      if (g('name') !== undefined) obj.name = g('name');
      if (g('type') !== undefined) obj.type = g('type');
      if (g('laneCount') !== undefined) obj.laneCount = Math.max(1, parseInt(g('laneCount'), 10) || 1);
      if (g('widthScale') !== undefined) obj.widthScale = Math.max(0.5, parseFloat(g('widthScale')) || 1);
      if (g('tram') !== undefined) obj.tram = g('tram');
      if (g('oneway') !== undefined) obj.oneway = g('oneway');
    } else if (type === 'area') {
      if (g('name')   !== undefined) obj.name   = g('name');
      if (g('number') !== undefined) obj.number = g('number');
      if (g('type')   !== undefined) obj.type   = g('type');
    } else if (type === 'poi') {
      if (g('name')    !== undefined) obj.name    = g('name');
      if (g('address') !== undefined) obj.address = g('address');
      if (g('type')    !== undefined) obj.type    = g('type');
    } else if (type === 'node') {
      const x = parseFloat(g('x')), y = parseFloat(g('y'));
      if (!isNaN(x)) obj.x = x;
      if (!isNaN(y)) obj.y = y;
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  _searchObjects(q) {
    const { data } = this.app;
    const results = [];
    for (const r of data.roads) {
      if (r.name && r.name.toLowerCase().includes(q)) results.push({ type:'road', obj:r, label:`🛣 ${r.name}` });
    }
    for (const a of data.areas) {
      const label = [a.name, a.number].filter(Boolean).join(' ');
      if (label.toLowerCase().includes(q)) results.push({ type:'area', obj:a, label:`🏠 ${label}` });
    }
    for (const p of data.pois) {
      if (p.name && p.name.toLowerCase().includes(q)) {
        const cat = PLACES_CATEGORIES[p.type] || PLACES_CATEGORIES.other;
        results.push({ type:'poi', obj:p, label:`${cat.icon} ${p.name}` });
      }
    }
    return results;
  }

  _showSearchResults(results, container) {
    const list = document.getElementById('searchResultsList');
    if (!list) return;
    if (!results.length) {
      list.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
      container.style.display = 'block';
      return;
    }
    list.innerHTML = results.slice(0, 15).map((r, i) =>
      `<div class="search-result-item" data-i="${i}">${r.label}</div>`
    ).join('');
    container.style.display = 'block';

    list.querySelectorAll('.search-result-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        const r = results[i];
        this._focusObject(r.type, r.obj);
        container.style.display = 'none';
        document.getElementById('searchInput').value = '';
      });
    });
  }

  _focusObject(type, obj) {
    const { app } = this;
    let cx, cy;
    if (type === 'poi') { cx = obj.x; cy = obj.y; }
    else if (type === 'road') {
      const ns = obj.nodes.map(id => app.data.getNode(id)).filter(Boolean);
      if (!ns.length) return;
      cx = ns.reduce((s,n)=>s+n.x,0)/ns.length;
      cy = ns.reduce((s,n)=>s+n.y,0)/ns.length;
    } else if (type === 'area') {
      if (!obj.points || !obj.points.length) return;
      cx = obj.points.reduce((s,p)=>s+p[0],0)/obj.points.length;
      cy = obj.points.reduce((s,p)=>s+p[1],0)/obj.points.length;
    }
    if (cx === undefined) return;
    const sp = app.viewport.w2s(cx, cy);
    app.viewport.pan(app.canvas.width/2 - sp.x, app.canvas.height/2 - sp.y);
    app.renderer.selection.clear();
    app.renderer.selection.add(obj.id);
    this.showProperties(type, obj);
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  setStatus(msg) {
    const el = document.getElementById('statusMessage');
    if (el) el.textContent = msg;
  }

  updateCoords(wx, wy) {
    const el = document.getElementById('coordsDisplay');
    if (el) el.textContent = `${Math.round(wx)}, ${Math.round(wy)}`;
  }

  updateZoom() {
    const el = document.getElementById('zoomLevel');
    if (el) el.textContent = this.app.viewport.zoomPct() + '%';
  }

  updateStats() {
    const s = this.app.data.getStats();
    const el = (id, v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    el('statsRoads', s.roads);
    el('statsAreas', s.areas);
    el('statsPois',  s.pois);
    const undo = document.getElementById('btnUndo');
    const redo = document.getElementById('btnRedo');
    if (undo) undo.disabled = this.app.undoStack.length === 0;
    if (redo) redo.disabled = this.app.redoStack.length === 0;
  }

  flash(msg, duration = 2000) {
    let el = document.getElementById('flashMsg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'flashMsg';
      el.className = 'flash-message';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => el.classList.remove('visible'), duration);
  }

  _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
}

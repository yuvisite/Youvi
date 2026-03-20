'use strict';

/**
 * MapApp – main application controller.
 * Wires together data, viewport, renderer, tools and UI.
 */
class MapApp {
  constructor() {
    this.root = document.getElementById('app');
    this.canvasContainer = document.getElementById('canvasContainer');
    this.canvas   = document.getElementById('mapCanvas');
    this.data     = new MapData();
    this.viewport = new MapViewport();
    this.renderer = new MapRenderer(this.canvas, this.data, this.viewport);
    this.ui       = new MapUI(this);
    this.tools    = new MapToolManager(this);

    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = null;
    this.clipboardPasteCount = 0;
    this.storage = window.YouviStorageManager ? new window.YouviStorageManager('youvi-maps') : null;
    this.currentMapId = null;
    this._saveTimer = null;

    this._panning    = false;
    this._panStart   = null;
    this._panOrigin  = null;
    this._rafId      = null;
    this._dirty      = true;

    this._initCanvas();
    this._initEvents();

    this._renderLoop();
  }

  async init() {
    const loaded = await this.loadCurrentMap();
    if (!loaded) {
      this._createDefaultMap();
      await this.saveCurrentMap();
    }
    document.getElementById('mapNameInput').value = this.data.name;
    this.fitView();
    this.ui.updateStats();
  }

  // ── Canvas setup ─────────────────────────────────────────────────────────
  _initCanvas() {
    this.renderer.resize();
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this._dirty = true;
    });
  }

  // ── Mouse/Touch events ───────────────────────────────────────────────────
  _initEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown',  e => this._onMouseDown(e));
    c.addEventListener('mousemove',  e => this._onMouseMove(e));
    c.addEventListener('mouseup',    e => this._onMouseUp(e));
    c.addEventListener('dblclick',   e => this._onDblClick(e));
    c.addEventListener('contextmenu',e => { e.preventDefault(); this._onRightClick(e); });
    c.addEventListener('wheel',      e => { e.preventDefault(); this._onWheel(e); }, { passive: false });

    const focusWorkspace = () => this.focusWorkspace();
    c.addEventListener('pointerdown', focusWorkspace);
    this.canvasContainer?.addEventListener('pointerdown', focusWorkspace);
    this.root?.addEventListener('pointerdown', focusWorkspace);
  }

  focusWorkspace() {
    this.canvas?.focus({ preventScroll: true });
    this.canvasContainer?.focus({ preventScroll: true });
    this.root?.focus({ preventScroll: true });
  }

  _evtCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wp = this.viewport.s2w(sx, sy);
    return { sx, sy, wx: wp.x, wy: wp.y };
  }

  _onMouseDown(e) {
    const { sx, sy, wx, wy } = this._evtCoords(e);
    // Middle mouse or Space+drag = pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this._panning  = true;
      this._panStart  = { x: sx, y: sy };
      this._panOrigin = { x: this.viewport.offsetX, y: this.viewport.offsetY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    this.tools.activeTool?.onMouseDown({ x: wx, y: wy }, { x: sx, y: sy }, e);
    this._dirty = true;
  }

  _onMouseMove(e) {
    const { sx, sy, wx, wy } = this._evtCoords(e);

    if (this._panning && this._panStart) {
      this.viewport.offsetX = this._panOrigin.x + (sx - this._panStart.x);
      this.viewport.offsetY = this._panOrigin.y + (sy - this._panStart.y);
      this._dirty = true;
      return;
    }

    this.ui.updateCoords(wx, wy);
    this.tools.activeTool?.onMouseMove({ x: wx, y: wy }, { x: sx, y: sy }, e);
    this._dirty = true;
  }

  _onMouseUp(e) {
    if (this._panning) {
      this._panning = false;
      this.canvas.style.cursor = '';
      this.tools.activate(this.tools.toolName); // restore cursor
      return;
    }
    const { sx, sy, wx, wy } = this._evtCoords(e);
    this.tools.activeTool?.onMouseUp({ x: wx, y: wy }, { x: sx, y: sy }, e);
    this._dirty = true;
  }

  _onDblClick(e) {
    const { sx, sy, wx, wy } = this._evtCoords(e);
    this.tools.activeTool?.onDblClick({ x: wx, y: wy }, { x: sx, y: sy }, e);
    this._dirty = true;
  }

  _onRightClick(e) {
    // Cancel current drawing operation
    const t = this.tools.activeTool;
    if (t && typeof t._cancel === 'function') t._cancel();
    this._dirty = true;
  }

  _onWheel(e) {
    const { sx, sy } = this._evtCoords(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.viewport.zoom(factor, sx, sy);
    this.ui.updateZoom();
    this._dirty = true;
  }

  // ── Render loop ──────────────────────────────────────────────────────────
  _renderLoop() {
    if (this._dirty) {
      this.renderer.render();
      this._dirty = false;
    }
    this._rafId = requestAnimationFrame(() => this._renderLoop());
  }

  markDirty() { this._dirty = true; }

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  pushUndoCheckpoint() {
    this.undoStack.push(this.data.snapshot());
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    this.ui.updateStats();
    this.scheduleAutosave();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.data.snapshot());
    this.data.restore(this.undoStack.pop());
    this.renderer.selection.clear();
    this.ui.clearProperties();
    this.ui.updateStats();
    this._dirty = true;
    this.scheduleAutosave();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.data.snapshot());
    this.data.restore(this.redoStack.pop());
    this.renderer.selection.clear();
    this.ui.updateStats();
    this._dirty = true;
    this.scheduleAutosave();
  }

  copySelection() {
    const selectedIds = [...this.renderer.selection];
    if (!selectedIds.length) return false;

    const selectedRoads = this.data.roads.filter(road => this.renderer.selection.has(road.id));
    const selectedAreas = this.data.areas.filter(area => this.renderer.selection.has(area.id));
    const selectedPois = this.data.pois.filter(poi => this.renderer.selection.has(poi.id));

    const roadNodeIds = new Set(selectedRoads.flatMap(road => road.nodes));
    const selectedStandaloneNodes = this.data.nodes.filter(node =>
      this.renderer.selection.has(node.id) && !roadNodeIds.has(node.id)
    );

    const roadNodes = new Map();
    for (const road of selectedRoads) {
      for (const nodeId of road.nodes) {
        const node = this.data.getNode(nodeId);
        if (node) roadNodes.set(node.id, { id: node.id, x: node.x, y: node.y });
      }
    }

    this.clipboard = {
      roads: selectedRoads.map(road => ({
        id: road.id,
        name: road.name,
        type: road.type,
        oneway: !!road.oneway,
        laneCount: road.laneCount,
        widthScale: road.widthScale,
        tram: !!road.tram,
        nodes: [...road.nodes],
      })),
      roadNodes: [...roadNodes.values()],
      areas: selectedAreas.map(area => ({
        id: area.id,
        type: area.type,
        name: area.name,
        number: area.number,
        points: area.points.map(point => [...point]),
      })),
      pois: selectedPois.map(poi => ({
        id: poi.id,
        x: poi.x,
        y: poi.y,
        type: poi.type,
        name: poi.name,
        address: poi.address,
      })),
      nodes: selectedStandaloneNodes.map(node => ({ id: node.id, x: node.x, y: node.y })),
    };
    this.clipboardPasteCount = 0;
    return true;
  }

  pasteClipboard() {
    if (!this.clipboard) return false;

    this.pushUndoCheckpoint();

    const offset = 60 + this.clipboardPasteCount * 20;
    const nodeIdMap = new Map();
    const newSelection = new Set();

    for (const node of this.clipboard.roadNodes) {
      const created = this.data.addNode(node.x + offset, node.y + offset);
      nodeIdMap.set(node.id, created.id);
    }

    for (const node of this.clipboard.nodes) {
      const created = this.data.addNode(node.x + offset, node.y + offset);
      nodeIdMap.set(node.id, created.id);
      newSelection.add(created.id);
    }

    for (const road of this.clipboard.roads) {
      const created = this.data.addRoad(road.nodes.map(nodeId => nodeIdMap.get(nodeId)), road.type, road.name || '', undefined, {
        laneCount: road.laneCount,
        widthScale: road.widthScale,
        tram: road.tram,
      });
      created.oneway = road.oneway;
      newSelection.add(created.id);
    }

    for (const area of this.clipboard.areas) {
      const created = this.data.addArea(
        area.points.map(point => [point[0] + offset, point[1] + offset]),
        area.type,
        area.name || '',
        area.number || ''
      );
      newSelection.add(created.id);
    }

    for (const poi of this.clipboard.pois) {
      const created = this.data.addPoi(poi.x + offset, poi.y + offset, poi.type, poi.name || '', poi.address || '');
      newSelection.add(created.id);
    }

    this.clipboardPasteCount += 1;
    this.renderer.selection = newSelection;
    this.ui.clearProperties();
    this.ui.updateStats();
    this._dirty = true;
    this.scheduleAutosave();
    return true;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  deleteById(id) {
    const { data } = this;
    if (data.getRoad(id))  data.removeRoad(id);
    else if (data.getArea(id))  data.removeArea(id);
    else if (data.getPoi(id))   data.removePoi(id);
    else if (data.getNode(id))  data.removeNode(id);
    this._dirty = true;
    this.scheduleAutosave();
  }

  fitView() {
    const bounds = this.data.getBounds();
    this.viewport.fitBounds(this.canvas, bounds);
    this.ui.updateZoom();
    this._dirty = true;
  }

  // ── Import / Export ───────────────────────────────────────────────────────
  exportJSON() {
    const json = this.data.toJSON();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = (this.data.name || 'map') + '.json';
    a.click();
    URL.revokeObjectURL(url);
    this.ui.flash('⬇ Экспортировано');
  }

  async exportBackupJSON() {
    try {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      const backup = {
        format: 'youvi-maps-backup',
        version: 1,
        exportedAt: Date.now(),
        currentMapId: this.currentMapId || null,
        maps: [],
      };

      if (this.storage) {
        await this.storage.open();
        const index = await this.storage.get('maps:index') || { currentId: null, items: [] };
        const items = Array.isArray(index.items) ? index.items : [];

        for (const item of items) {
          if (!item?.id) continue;
          const doc = await this.storage.get(`maps:doc:${item.id}`);
          if (!doc?.data) continue;
          backup.maps.push({
            id: item.id,
            meta: doc.meta || item,
            data: doc.data,
          });
        }
      }

      // Fallback: if persistent index is empty, export current in-memory map.
      if (!backup.maps.length) {
        backup.maps.push({
          id: this.currentMapId || null,
          meta: {
            id: this.currentMapId || null,
            name: this.data.name || 'Карта',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          data: this.data.toJSON(),
        });
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `youvi-maps-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      console.error('Backup export failed:', error);
      return false;
    }
  }

  importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        this.pushUndoCheckpoint();
        this.data.fromJSON(JSON.parse(ev.target.result));
        this.currentMapId = null;
        document.getElementById('mapNameInput').value = this.data.name;
        this.fitView();
        this.ui.updateStats();
        this.ui.flash('📂 Загружено: ' + this.data.name);
        this.saveCurrentMap();
      } catch(err) {
        this.ui.flash('❌ Ошибка файла');
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  scheduleAutosave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveCurrentMap(), 350);
  }

  async saveCurrentMap() {
    if (!this.storage) return false;
    try {
      await this.storage.open();
      if (!this.currentMapId) this.currentMapId = uid();

      const mapKey = `maps:doc:${this.currentMapId}`;
      const now = Date.now();
      const existingIndex = await this.storage.get('maps:index') || { currentId: null, items: [] };
      const items = existingIndex.items || [];
      const itemIndex = items.findIndex(item => item.id === this.currentMapId);
      const previous = itemIndex >= 0 ? items[itemIndex] : null;
      const meta = {
        id: this.currentMapId,
        name: this.data.name || 'Карта',
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      };

      await this.storage.set(mapKey, {
        meta,
        data: this.data.toJSON(),
      });

      if (itemIndex >= 0) items[itemIndex] = meta;
      else items.unshift(meta);

      await this.storage.set('maps:index', {
        currentId: this.currentMapId,
        items: items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
      });
      return true;
    } catch (error) {
      console.error('Persistent save failed:', error);
      return false;
    }
  }

  async loadCurrentMap() {
    if (!this.storage) return false;
    try {
      await this.storage.open();
      const index = await this.storage.get('maps:index');
      const currentId = index?.currentId || index?.items?.[0]?.id;
      if (!currentId) return false;
      const doc = await this.storage.get(`maps:doc:${currentId}`);
      if (!doc?.data) return false;
      this.currentMapId = currentId;
      this.data.fromJSON(doc.data);
      return true;
    } catch (error) {
      console.error('Persistent load failed:', error);
      return false;
    }
  }

  // ── Default map ──────────────────────────────────────────────────────────
  _createDefaultMap() {
    const d = this.data;
    d.name  = 'Мой город';

    const BS   = 200;   // block size in world units
    const GRID = 5;     // 5×5 blocks = 6×6 nodes
    const OX   = -(GRID * BS) / 2;
    const OY   = -(GRID * BS) / 2;

    const streetNames = ['ул. Ленина','ул. Пушкина','ул. Гагарина','ул. Садовая','ул. Набережная','ул. Центральная'];
    const avNames     = ['Проспект Мира','Октябрьский пр-т'];

    // Grid nodes
    const ns = [];
    for (let r = 0; r <= GRID; r++) {
      ns[r] = [];
      for (let c = 0; c <= GRID; c++) {
        ns[r][c] = d.addNode(OX + c * BS, OY + r * BS);
      }
    }

    // Horizontal roads
    for (let r = 0; r <= GRID; r++) {
      const isAv = r === 2 || r === 3;
      d.addRoad(ns[r].map(n=>n.id), isAv ? 'arterial' : 'street', isAv ? avNames[r-2]||'' : streetNames[r]||'');
    }
    // Vertical roads
    for (let c = 0; c <= GRID; c++) {
      const isAv = c === 2 || c === 3;
      d.addRoad(ns.map(row=>row[c].id), isAv ? 'arterial' : 'street', isAv ? '' : streetNames[GRID-c]||'');
    }

    // Central park
    const PX = OX + BS + 20, PY = OY + 2*BS + 20, PS = BS - 40;
    d.addArea([[PX,PY],[PX+PS,PY],[PX+PS,PY+PS],[PX,PY+PS]], 'park', 'Центральный парк', '');

    // River
    const RY = OY + 4.6*BS;
    d.addArea([[OX-60,RY],[OX+GRID*BS+60,RY],[OX+GRID*BS+60,RY+55],[OX-60,RY+55]], 'water', 'Река', '');

    // Buildings
    const blds = [
      [OX+20,      OY+20,       100, 150, 'Здание',         '1'],
      [OX+BS+20,   OY+20,       180,  80, 'Школа №3',       ''],
      [OX+3*BS+20, OY+3*BS+20,  120, 120, 'ТЦ «Ориент»',   ''],
      [OX+4*BS+20, OY+BS+20,    140,  90, 'Завод',          ''],
    ];
    for (const [x,y,w,h,name,num] of blds) {
      d.addArea([[x,y],[x+w,y],[x+w,y+h],[x,y+h]], 'building', name, num);
    }

    // POIs
    const pois = [
      [OX+BS*2.5,  OY+BS*1.2,  'cafe',       'Кафе «Уют»'],
      [OX+BS*0.5,  OY+BS*0.5,  'shop',       'Продукты'],
      [OX+BS*3.8,  OY+BS*0.5,  'hospital',   'Поликлиника №2'],
      [OX+BS*1.3,  OY+BS*3.5,  'school',     'Школа №7'],
      [OX+BS*4.2,  OY+BS*3.2,  'restaurant', 'Ресторан «Маяк»'],
      [OX+BS*0.5,  OY+BS*2.5,  'bank',       'Сбербанк'],
      [OX+BS*2.5,  OY+BS*4.5,  'bus_stop',   'Автобусная ост.'],
    ];
    for (const [x,y,type,name] of pois) d.addPoi(x, y, type, name);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
let mapApp;
document.addEventListener('DOMContentLoaded', async () => {
  mapApp = new MapApp();
  await mapApp.init();
  mapApp.focusWorkspace();
});

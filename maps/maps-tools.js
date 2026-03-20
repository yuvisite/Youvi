'use strict';

/**
 * MapToolManager – handles all mouse/keyboard interactions and
 * delegates to the active tool.
 *
 * Each tool exposes:
 *   onMouseDown(worldPt, screenPt, e)
 *   onMouseMove(worldPt, screenPt, e)
 *   onMouseUp(worldPt, screenPt, e)
 *   onDblClick(worldPt, screenPt, e)
 *   onKeyDown(e)
 *   activate()
 *   deactivate()
 */

const SNAP_GRID = 50;          // world-unit grid snap
const SNAP_NODE_PX = 18;       // pixel radius to snap to existing node

class MapToolManager {
  constructor(app) {
    this.app       = app;
    this.activeTool = null;
    this.toolName   = 'select';
    this.tools = {
      select:  new SelectTool(app),
      road:    new RoadTool(app),
      area:    new AreaTool(app),
      poi:     new PoiTool(app),
      eraser:  new EraserTool(app),
    };
    this.activate('select');
  }

  activate(name) {
    if (this.activeTool) this.activeTool.deactivate();
    this.toolName  = name;
    this.activeTool = this.tools[name];
    this.app.renderer.drawState = null;
    this.activeTool.activate();
    this.app.renderer.showNodes = (name === 'road');
    if (this.app.ui) {
      this.app.ui.setActiveTool(name);
      this.app.ui.setToolSections(name);
    }
  }

  // ── Snap helper ───────────────────────────────────────────────────────────
  snap(wx, wy, excludeNodeId = null) {
    const { data, viewport } = this.app;
    // 1. Snap to existing node
    const nearNode = data.findNearestNode(wx, wy, SNAP_NODE_PX / viewport.scale);
    if (nearNode && nearNode.id !== excludeNodeId) {
      this.app.renderer.snapPoint = { x: nearNode.x, y: nearNode.y };
      return { x: nearNode.x, y: nearNode.y, nodeId: nearNode.id };
    }
    // 2. Snap to grid
    const gx = Math.round(wx / SNAP_GRID) * SNAP_GRID;
    const gy = Math.round(wy / SNAP_GRID) * SNAP_GRID;
    this.app.renderer.snapPoint = { x: gx, y: gy };
    return { x: gx, y: gy, nodeId: null };
  }

  clearSnap() {
    this.app.renderer.snapPoint = null;
  }
}

// ─── SelectTool ─────────────────────────────────────────────────────────────

class SelectTool {
  constructor(app) {
    this.app        = app;
    this.dragging   = false;
    this.dragTarget = null;   // { type, id, offsetX, offsetY, origNodes }
    this.boxStart   = null;
  }

  activate()   { this.app.canvas.style.cursor = 'default'; }
  deactivate() { this.dragging = false; this.dragTarget = null; this.boxStart = null; }

  onMouseDown(wp, sp, e) {
    const { app } = this;
    const hit = app.data.hitTest(wp.x, wp.y, app.viewport.scale);

    if (!hit) {
      // Deselect and start box (future)
      if (!e.shiftKey) app.renderer.selection.clear();
      app.ui.clearProperties();
      return;
    }

    // Add / toggle selection
    if (e.shiftKey) {
      if (app.renderer.selection.has(hit.id)) app.renderer.selection.delete(hit.id);
      else app.renderer.selection.add(hit.id);
    } else {
      if (!app.renderer.selection.has(hit.id)) {
        app.renderer.selection.clear();
        app.renderer.selection.add(hit.id);
      }
    }

    // Show properties
    app.ui.showProperties(hit.type, hit.obj);

    // Set up drag
    this.dragging   = true;
    this.dragTarget = { ...hit, startWP: { ...wp } };

    // Store original positions for drag undo
    if (hit.type === 'node') {
      this.dragTarget.origX = hit.obj.x;
      this.dragTarget.origY = hit.obj.y;
    } else if (hit.type === 'road') {
      this.dragTarget.origNodes = hit.obj.nodes.map(nid => {
        const n = app.data.getNode(nid);
        return n ? { id: nid, x: n.x, y: n.y } : null;
      }).filter(Boolean);
    } else if (hit.type === 'area') {
      this.dragTarget.origPoints = hit.obj.points.map(p => [...p]);
    } else if (hit.type === 'poi') {
      this.dragTarget.origX = hit.obj.x;
      this.dragTarget.origY = hit.obj.y;
    }
  }

  onMouseMove(wp, sp, e) {
    const { app } = this;

    // Update hover
    const hit = app.data.hitTest(wp.x, wp.y, app.viewport.scale);
    app.renderer.hoveredId = hit ? hit.id : null;

    if (!this.dragging || !this.dragTarget) return;

    const dx = wp.x - this.dragTarget.startWP.x;
    const dy = wp.y - this.dragTarget.startWP.y;
    const tgt = this.dragTarget;

    if (tgt.type === 'node') {
      app.data.moveNode(tgt.id, tgt.origX + dx, tgt.origY + dy);
    } else if (tgt.type === 'road') {
      for (const n of tgt.origNodes) {
        app.data.moveNode(n.id, n.x + dx, n.y + dy);
      }
    } else if (tgt.type === 'area') {
      const area = app.data.getArea(tgt.id);
      if (area) {
        area.points = tgt.origPoints.map(pt => [pt[0]+dx, pt[1]+dy]);
      }
    } else if (tgt.type === 'poi') {
      const poi = app.data.getPoi(tgt.id);
      if (poi) { poi.x = tgt.origX + dx; poi.y = tgt.origY + dy; }
    }
  }

  onMouseUp(wp, sp, e) {
    if (this.dragging) {
      this.app.pushUndoCheckpoint();
    }
    this.dragging   = false;
    this.dragTarget = null;
  }

  onDblClick(wp, sp, e) {
    const { app } = this;
    const hit = app.data.hitTest(wp.x, wp.y, app.viewport.scale);
    if (hit) app.ui.openPropertiesModal(hit.type, hit.obj);
  }

  onKeyDown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const { app } = this;
      for (const id of app.renderer.selection) {
        app.deleteById(id);
      }
      app.renderer.selection.clear();
      app.ui.clearProperties();
      app.pushUndoCheckpoint();
    }
  }
}

// ─── RoadTool ────────────────────────────────────────────────────────────────

class RoadTool {
  constructor(app) {
    this.app      = app;
    this.points   = [];   // { x, y, nodeId? }
    this.roadType = 'street';
    this.laneCount = 2;
    this.widthScale = 1;
    this.tram = false;
    this.cursor   = null;
    this.extendRoadId = null;
    this.extendMode = null;
  }

  activate() {
    this.points = [];
    this.cursor = null;
    this.extendRoadId = null;
    this.extendMode = null;
    this.app.canvas.style.cursor = 'crosshair';
    this.app.renderer.drawState = {
      tool: 'road',
      points: this.points,
      cursor: this.cursor,
      roadType: this.roadType,
      laneCount: this.laneCount,
      widthScale: this.widthScale,
      tram: this.tram,
    };
    this.app.ui.setStatus('Кликните для начала дороги. Двойной клик / Enter — завершить. Esc — отмена.');
  }

  deactivate() {
    this.points = [];
    this.cursor = null;
    this.extendRoadId = null;
    this.extendMode = null;
    this.app.renderer.drawState = null;
  }

  setRoadType(type) {
    this.roadType = type;
    if (this.app.renderer.drawState) this.app.renderer.drawState.roadType = type;
  }

  setRoadGeometry(laneCount, widthScale) {
    this.laneCount = Math.max(1, Number(laneCount) || 2);
    this.widthScale = Math.max(0.5, Number(widthScale) || 1);
    if (this.app.renderer.drawState) {
      this.app.renderer.drawState.laneCount = this.laneCount;
      this.app.renderer.drawState.widthScale = this.widthScale;
    }
  }

  setRoadTram(tram) {
    this.tram = !!tram;
    if (this.app.renderer.drawState) this.app.renderer.drawState.tram = this.tram;
  }

  onMouseMove(wp, sp, e) {
    const snapped = this.points.length === 0
      ? this._resolveRoadStart(wp.x, wp.y)
      : this.app.tools.snap(wp.x, wp.y);
    this.cursor = snapped;
    if (this.app.renderer.drawState) {
      this.app.renderer.drawState.cursor   = snapped;
      this.app.renderer.drawState.roadType = this.roadType;
      this.app.renderer.drawState.laneCount = this.laneCount;
      this.app.renderer.drawState.widthScale = this.widthScale;
      this.app.renderer.drawState.tram = this.tram;
    }
  }

  onMouseDown(wp, sp, e) {
    if (e.button !== 0) return;
    const snapped = this.points.length === 0
      ? this._resolveRoadStart(wp.x, wp.y)
      : this.app.tools.snap(wp.x, wp.y);

    if (this.points.length === 0 && snapped.extendRoadId) {
      this.extendRoadId = snapped.extendRoadId;
      this.extendMode = snapped.extendMode;
      const baseRoad = this.app.data.getRoad(this.extendRoadId);
      if (baseRoad) {
        this.roadType = baseRoad.type;
        this.laneCount = Math.max(1, Number(baseRoad.laneCount) || this.laneCount);
        this.widthScale = Math.max(0.5, Number(baseRoad.widthScale) || this.widthScale);
        this.tram = !!baseRoad.tram;
        this.app.ui.syncRoadControls?.(this.roadType, this.laneCount, this.widthScale, this.tram);
      }
    }

    this.points.push({ ...snapped });
    if (this.app.renderer.drawState) {
      this.app.renderer.drawState.points   = this.points;
      this.app.renderer.drawState.roadType = this.roadType;
      this.app.renderer.drawState.laneCount = this.laneCount;
      this.app.renderer.drawState.widthScale = this.widthScale;
      this.app.renderer.drawState.tram = this.tram;
    }
    this.app.ui.setStatus(
      this.extendRoadId
        ? `Продление улицы: точек ${this.points.length}. Двойной клик / Enter — завершить.`
        : `Точек: ${this.points.length}. Двойной клик / Enter — завершить. Esc — отмена.`
    );
  }

  onMouseUp() {}

  onDblClick(wp, sp, e) {
    // Add final point and finish
    const snapped = this.app.tools.snap(wp.x, wp.y);
    // Don't duplicate last point
    const last = this.points[this.points.length - 1];
    if (!last || Math.hypot(last.x - snapped.x, last.y - snapped.y) > 1) {
      this.points.push({ ...snapped });
    }
    this._finish();
  }

  _finish() {
    if (this.points.length < 2) { this._cancel(); return; }
    this.app.pushUndoCheckpoint();

    const { data } = this.app;
    const nodeIds = this.points.map(pt => {
      if (pt.nodeId) return pt.nodeId;          // snap to existing node
      return data.addNode(pt.x, pt.y).id;       // create new node
    });
    if (this.extendRoadId) {
      const road = data.getRoad(this.extendRoadId);
      if (road) {
        const extraIds = nodeIds.slice(1);
        if (this.extendMode === 'prepend') {
          road.nodes = [...extraIds.reverse(), ...road.nodes];
        } else {
          road.nodes = [...road.nodes, ...extraIds];
        }
      }
    } else {
      data.addRoad(nodeIds, this.roadType, '', undefined, {
        laneCount: this.laneCount,
        widthScale: this.widthScale,
        tram: this.tram,
      });
    }

    this.points = [];
    this.cursor = null;
    this.extendRoadId = null;
    this.extendMode = null;
    if (this.app.renderer.drawState) {
      this.app.renderer.drawState.points = this.points;
      this.app.renderer.drawState.cursor = null;
      this.app.renderer.drawState.tram = this.tram;
    }
    this.app.tools.clearSnap();
    this.app.ui.setStatus('Дорога добавлена. Кликните для новой.');
    this.app.ui.updateStats();
  }

  _cancel() {
    this.points = [];
    this.cursor = null;
    this.extendRoadId = null;
    this.extendMode = null;
    if (this.app.renderer.drawState) {
      this.app.renderer.drawState.points = this.points;
      this.app.renderer.drawState.cursor = null;
    }
    this.app.tools.clearSnap();
    this.app.ui.setStatus('Кликните для начала дороги.');
  }

  onKeyDown(e) {
    if (e.key === 'Enter')  this._finish();
    if (e.key === 'Escape') this._cancel();
    if (e.key === 'Backspace' && this.points.length > 0) {
      this.points.pop();
      if (this.app.renderer.drawState) this.app.renderer.drawState.points = this.points;
    }
  }

  _resolveRoadStart(x, y) {
    const snap = this.app.tools.snap(x, y);
    const directNode = snap.nodeId ? this.app.data.getNode(snap.nodeId) : null;
    if (directNode) {
      const endpointRoad = this.app.data.getEndpointRoads(directNode.id)[0];
      if (endpointRoad) {
        return {
          x: directNode.x,
          y: directNode.y,
          nodeId: directNode.id,
          extendRoadId: endpointRoad.id,
          extendMode: endpointRoad.nodes[0] === directNode.id ? 'prepend' : 'append',
        };
      }
      return snap;
    }

    const hit = this.app.data.hitTest(x, y, this.app.viewport.scale);
    if (hit?.type === 'road') {
      const road = hit.obj;
      const startNode = this.app.data.getNode(road.nodes[0]);
      const endNode = this.app.data.getNode(road.nodes[road.nodes.length - 1]);
      if (startNode && endNode) {
        const startDist = Math.hypot(startNode.x - x, startNode.y - y);
        const endDist = Math.hypot(endNode.x - x, endNode.y - y);
        const chosenNode = startDist <= endDist ? startNode : endNode;
        return {
          x: chosenNode.x,
          y: chosenNode.y,
          nodeId: chosenNode.id,
          extendRoadId: road.id,
          extendMode: chosenNode.id === road.nodes[0] ? 'prepend' : 'append',
        };
      }
    }

    return snap;
  }
}

// ─── AreaTool ────────────────────────────────────────────────────────────────

class AreaTool {
  constructor(app) {
    this.app      = app;
    this.points   = [];   // [[x,y], ...]
    this.areaType = 'building';
    this.cursor   = null;
  }

  activate() {
    this.points = [];
    this.cursor = null;
    this.app.canvas.style.cursor = 'crosshair';
    this.app.renderer.drawState = { tool: 'area', points: this.points, cursor: null, areaType: this.areaType };
    this.app.ui.setStatus('Кликните для добавления вершин. Двойной клик / Enter — замкнуть. Esc — отмена.');
  }

  deactivate() {
    this.points = [];
    this.app.renderer.drawState = null;
  }

  setAreaType(type) {
    this.areaType = type;
    if (this.app.renderer.drawState) this.app.renderer.drawState.areaType = type;
  }

  onMouseMove(wp, sp, e) {
    const snapped = this.app.tools.snap(wp.x, wp.y);
    this.cursor = snapped;
    if (this.app.renderer.drawState) this.app.renderer.drawState.cursor = snapped;
  }

  onMouseDown(wp, sp, e) {
    if (e.button !== 0) return;
    const snapped = this.app.tools.snap(wp.x, wp.y);

    // Click near first point = close polygon
    if (this.points.length >= 3) {
      const fp = this.points[0];
      const d  = Math.hypot(fp[0]-snapped.x, fp[1]-snapped.y);
      if (d < SNAP_NODE_PX / this.app.viewport.scale) {
        this._finish(); return;
      }
    }

    this.points.push([snapped.x, snapped.y]);
    if (this.app.renderer.drawState) this.app.renderer.drawState.points = this.points;
    this.app.ui.setStatus(`Вершин: ${this.points.length}. Замкнуть: кликнуть на первую / Enter. Esc — отмена.`);
  }

  onMouseUp() {}

  onDblClick(wp, sp, e) {
    if (this.points.length >= 3) this._finish();
  }

  _finish() {
    if (this.points.length < 3) { this._cancel(); return; }
    this.app.pushUndoCheckpoint();
    this.app.data.addArea([...this.points.map(p=>[...p])], this.areaType, '', '');
    this.points = [];
    this.cursor = null;
    if (this.app.renderer.drawState) {
      this.app.renderer.drawState.points = this.points;
      this.app.renderer.drawState.cursor = null;
    }
    this.app.tools.clearSnap();
    this.app.ui.setStatus('Область добавлена. Кликните для новой.');
    this.app.ui.updateStats();
  }

  _cancel() {
    this.points = [];
    if (this.app.renderer.drawState) {
      this.app.renderer.drawState.points = this.points;
      this.app.renderer.drawState.cursor = null;
    }
    this.app.tools.clearSnap();
    this.app.ui.setStatus('Кликните для добавления вершин.');
  }

  onKeyDown(e) {
    if (e.key === 'Enter')  this._finish();
    if (e.key === 'Escape') this._cancel();
    if (e.key === 'Backspace' && this.points.length > 0) {
      this.points.pop();
      if (this.app.renderer.drawState) this.app.renderer.drawState.points = this.points;
    }
  }
}

// ─── PoiTool ─────────────────────────────────────────────────────────────────

class PoiTool {
  constructor(app) {
    this.app     = app;
    this.poiType = 'other';
    this.cursor  = null;
  }

  activate() {
    this.app.canvas.style.cursor = 'crosshair';
    this.app.renderer.drawState = { tool: 'poi', cursor: null, poiType: this.poiType };
    this.app.ui.setStatus('Кликните для размещения объекта.');
  }

  deactivate() { this.app.renderer.drawState = null; }

  setPoiType(type) {
    this.poiType = type;
    if (this.app.renderer.drawState) this.app.renderer.drawState.poiType = type;
  }

  onMouseMove(wp, sp, e) {
    const snapped = this.app.tools.snap(wp.x, wp.y);
    this.cursor = snapped;
    if (this.app.renderer.drawState) {
      this.app.renderer.drawState.cursor  = snapped;
      this.app.renderer.drawState.poiType = this.poiType;
    }
  }

  onMouseDown(wp, sp, e) {
    if (e.button !== 0) return;
    const snapped = this.app.tools.snap(wp.x, wp.y);
    this.app.pushUndoCheckpoint();
    const poi = this.app.data.addPoi(snapped.x, snapped.y, this.poiType, '', '');
    this.app.ui.updateStats();
    // Immediately open properties
    this.app.ui.openPropertiesModal('poi', poi);
  }

  onMouseUp() {}
  onDblClick() {}
  onKeyDown(e) { if (e.key === 'Escape') this.app.tools.activate('select'); }
}

// ─── EraserTool ──────────────────────────────────────────────────────────────

class EraserTool {
  constructor(app) {
    this.app = app;
    this.dragging = false;
    this.startScreen = null;
    this.startWorld = null;
  }

  activate() {
    this.app.canvas.style.cursor = 'not-allowed';
    this.app.renderer.drawState = { tool: 'eraser', rect: null };
    this.app.ui.setStatus('Кликните по объекту или протяните рамку для массового удаления.');
  }

  deactivate() {
    this.dragging = false;
    this.startScreen = null;
    this.startWorld = null;
    this.app.renderer.drawState = null;
  }

  onMouseMove(wp, sp, e) {
    if (this.dragging && this.startScreen) {
      this.app.renderer.hoveredId = null;
      this.app.renderer.drawState = {
        tool: 'eraser',
        rect: {
          x: Math.min(this.startScreen.x, sp.x),
          y: Math.min(this.startScreen.y, sp.y),
          w: Math.abs(sp.x - this.startScreen.x),
          h: Math.abs(sp.y - this.startScreen.y),
        },
      };
      this.app.canvas.style.cursor = 'crosshair';
      return;
    }

    const hit = this.app.data.hitTest(wp.x, wp.y, this.app.viewport.scale);
    this.app.renderer.hoveredId = hit ? hit.id : null;
    this.app.canvas.style.cursor = hit ? 'not-allowed' : 'crosshair';
  }

  onMouseDown(wp, sp, e) {
    if (e.button !== 0) return;
    this.dragging = true;
    this.startScreen = { x: sp.x, y: sp.y };
    this.startWorld = { x: wp.x, y: wp.y };
    this.app.renderer.drawState = { tool: 'eraser', rect: { x: sp.x, y: sp.y, w: 0, h: 0 } };
  }

  onMouseUp(wp, sp) {
    if (!this.dragging || !this.startScreen || !this.startWorld) return;

    const moved = Math.hypot(sp.x - this.startScreen.x, sp.y - this.startScreen.y);
    if (moved < 8) {
      const hit = this.app.data.hitTest(wp.x, wp.y, this.app.viewport.scale);
      if (hit) {
        this.app.pushUndoCheckpoint();
        this.app.deleteById(hit.id);
        this.app.ui.setStatus('Объект удалён. Кликните ещё раз или тяните рамку.');
      }
    } else {
      const ids = this._collectObjectsInRect(
        Math.min(this.startWorld.x, wp.x),
        Math.min(this.startWorld.y, wp.y),
        Math.max(this.startWorld.x, wp.x),
        Math.max(this.startWorld.y, wp.y)
      );

      if (ids.length) {
        this.app.pushUndoCheckpoint();
        for (const id of ids) this.app.deleteById(id);
        this.app.ui.setStatus(`Удалено объектов: ${ids.length}.`);
      } else {
        this.app.ui.setStatus('В рамке ничего не найдено.');
      }
    }

    this.dragging = false;
    this.startScreen = null;
    this.startWorld = null;
    this.app.renderer.drawState = { tool: 'eraser', rect: null };
    this.app.renderer.hoveredId = null;
    this.app.renderer.selection.clear();
    this.app.ui.clearProperties();
    this.app.ui.updateStats();
  }
  onDblClick() {}
  onKeyDown(e) { if (e.key === 'Escape') this.app.tools.activate('select'); }

  _collectObjectsInRect(minX, minY, maxX, maxY) {
    const { data } = this.app;
    const ids = new Set();

    const inRect = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
    const overlaps = bounds => bounds && !(bounds.maxX < minX || bounds.minX > maxX || bounds.maxY < minY || bounds.minY > maxY);

    for (const poi of data.pois) {
      if (inRect(poi.x, poi.y)) ids.add(poi.id);
    }

    for (const area of data.areas) {
      if (overlaps(this._areaBounds(area))) ids.add(area.id);
    }

    for (const road of data.roads) {
      if (overlaps(this._roadBounds(road))) ids.add(road.id);
    }

    return [...ids];
  }

  _roadBounds(road) {
    const nodes = road.nodes.map(id => this.app.data.getNode(id)).filter(Boolean);
    if (!nodes.length) return null;
    const xs = nodes.map(node => node.x);
    const ys = nodes.map(node => node.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }

  _areaBounds(area) {
    if (!area.points || !area.points.length) return null;
    const xs = area.points.map(point => point[0]);
    const ys = area.points.map(point => point[1]);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
}

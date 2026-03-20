'use strict';

let _idCounter = Date.now();
function uid() {
  return 'id_' + (++_idCounter) + '_' + Math.random().toString(36).slice(2, 6);
}

class MapData {
  constructor() {
    this.name = 'Мой город';
    this.nodes = [];
    this.roads = [];
    this.areas = [];
    this.pois  = [];
    this._nodeMap = new Map();
  }

  // ── Nodes ──────────────────────────────────────────────
  addNode(x, y, id) {
    const node = { id: id || uid(), x, y };
    this.nodes.push(node);
    this._nodeMap.set(node.id, node);
    return node;
  }

  getNode(id) { return this._nodeMap.get(id) || null; }

  removeNode(id) {
    this.nodes = this.nodes.filter(n => n.id !== id);
    this._nodeMap.delete(id);
    // Remove roads that only rely on this node
    this.roads = this.roads.filter(r => !r.nodes.includes(id));
  }

  moveNode(id, x, y) {
    const n = this._nodeMap.get(id);
    if (n) { n.x = x; n.y = y; }
  }

  // ── Roads ──────────────────────────────────────────────
  addRoad(nodeIds, type = 'street', name = '', id, options = {}) {
    const road = {
      id: id || uid(),
      nodes: nodeIds,
      type,
      name,
      oneway: false,
      laneCount: options.laneCount || this._defaultLaneCount(type),
      widthScale: options.widthScale || 1,
      tram: !!options.tram,
    };
    this.roads.push(road);
    return road;
  }

  getRoad(id) { return this.roads.find(r => r.id === id) || null; }

  getRoadsByNode(nodeId) {
    return this.roads.filter(road => road.nodes.includes(nodeId));
  }

  getEndpointRoads(nodeId) {
    return this.roads.filter(road => road.nodes[0] === nodeId || road.nodes[road.nodes.length - 1] === nodeId);
  }

  removeRoad(id) {
    const road = this.getRoad(id);
    if (!road) return;
    // Remove orphan nodes (nodes that belong only to this road)
    const usedElsewhere = new Set(
      this.roads.filter(r => r.id !== id).flatMap(r => r.nodes)
    );
    for (const nid of road.nodes) {
      if (!usedElsewhere.has(nid)) {
        this.nodes = this.nodes.filter(n => n.id !== nid);
        this._nodeMap.delete(nid);
      }
    }
    this.roads = this.roads.filter(r => r.id !== id);
  }

  // ── Areas ──────────────────────────────────────────────
  addArea(points, type = 'building', name = '', number = '', id) {
    const area = { id: id || uid(), points, type, name, number };
    this.areas.push(area);
    return area;
  }

  getArea(id) { return this.areas.find(a => a.id === id) || null; }
  removeArea(id) { this.areas = this.areas.filter(a => a.id !== id); }

  // ── POIs ───────────────────────────────────────────────
  addPoi(x, y, type = 'other', name = '', address = '', id) {
    const poi = { id: id || uid(), x, y, type, name, address };
    this.pois.push(poi);
    return poi;
  }

  getPoi(id) { return this.pois.find(p => p.id === id) || null; }
  removePoi(id) { this.pois = this.pois.filter(p => p.id !== id); }

  // ── Spatial Queries ────────────────────────────────────
  findNearestNode(x, y, maxWorldDist) {
    let best = null, bestD = maxWorldDist;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  /**
   * Hit test at world coords (x,y).
   * scale: viewport scale (pixels per world unit), used to compute screen threshold.
   * Returns { type, id, obj } or null.
   */
  hitTest(x, y, scale) {
    const thr = 12 / scale; // 12px tolerance in world units

    // POIs first (topmost visual layer)
    for (let i = this.pois.length - 1; i >= 0; i--) {
      const p = this.pois[i];
      if (Math.hypot(p.x - x, p.y - y) < thr + 6 / scale) {
        return { type: 'poi', id: p.id, obj: p };
      }
    }

    // Nodes (road edit handles)
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (Math.hypot(n.x - x, n.y - y) < thr) {
        return { type: 'node', id: n.id, obj: n };
      }
    }

    // Roads (line segment distance)
    const HALF = { highway: 10, arterial: 6, street: 4, alley: 3, pedestrian: 2 };
    const typeOrder = ['highway', 'arterial', 'street', 'alley', 'pedestrian'];
    const sorted = [...this.roads].sort((a, b) =>
      typeOrder.indexOf(b.type) - typeOrder.indexOf(a.type)
    );
    for (const road of sorted) {
      const ns = road.nodes.map(nid => this.getNode(nid)).filter(Boolean);
      const hw = this.getRoadHalfWidth(road) + thr;
      for (let i = 0; i < ns.length - 1; i++) {
        if (this._distSeg(x, y, ns[i].x, ns[i].y, ns[i+1].x, ns[i+1].y) < hw) {
          return { type: 'road', id: road.id, obj: road };
        }
      }
    }

    // Areas (point-in-polygon)
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      if (a.points && a.points.length >= 3 && this._pip(x, y, a.points)) {
        return { type: 'area', id: a.id, obj: a };
      }
    }

    return null;
  }

  _distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)));
    return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
  }

  _pip(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside = !inside;
    }
    return inside;
  }

  // ── World Bounds ───────────────────────────────────────
  getBounds() {
    const xs = [], ys = [];
    for (const n of this.nodes) { xs.push(n.x); ys.push(n.y); }
    for (const p of this.pois)  { xs.push(p.x); ys.push(p.y); }
    for (const a of this.areas) {
      if (a.points) for (const pt of a.points) { xs.push(pt[0]); ys.push(pt[1]); }
    }
    if (!xs.length) return { minX:-500,maxX:500,minY:-500,maxY:500,width:1000,height:1000,centerX:0,centerY:0 };
    const minX=Math.min(...xs), maxX=Math.max(...xs);
    const minY=Math.min(...ys), maxY=Math.max(...ys);
    return {
      minX, maxX, minY, maxY,
      width: maxX - minX || 1000,
      height: maxY - minY || 1000,
      centerX: (minX+maxX)/2,
      centerY: (minY+maxY)/2,
    };
  }

  // ── Serialize / Persist ────────────────────────────────
  toJSON() {
    return { version: 1, name: this.name, nodes: this.nodes, roads: this.roads, areas: this.areas, pois: this.pois };
  }

  fromJSON(d) {
    this.name  = d.name  || 'Карта';
    this.nodes = (d.nodes || []).map(n => ({ ...n }));
    this.roads = (d.roads || []).map(r => ({
      ...r,
      laneCount: r.laneCount || this._defaultLaneCount(r.type),
      widthScale: r.widthScale || 1,
      tram: !!r.tram,
    }));
    this.areas = (d.areas || []).map(a => ({ ...a }));
    this.pois  = (d.pois  || []).map(p => ({ ...p }));
    this._rebuildNodeMap();
  }

  _rebuildNodeMap() {
    this._nodeMap = new Map();
    for (const n of this.nodes) this._nodeMap.set(n.id, n);
  }

  save() {
    try { localStorage.setItem('youvi_maps_data', JSON.stringify(this.toJSON())); return true; }
    catch(e) { console.error('Map save failed:', e); return false; }
  }

  load() {
    try {
      const raw = localStorage.getItem('youvi_maps_data');
      if (!raw) return false;
      this.fromJSON(JSON.parse(raw));
      return true;
    } catch(e) { console.error('Map load failed:', e); return false; }
  }

  // ── Snapshot for Undo ──────────────────────────────────
  snapshot() {
    return JSON.parse(JSON.stringify(this.toJSON()));
  }

  restore(snap) {
    this.fromJSON(snap);
  }

  // ── Stats ──────────────────────────────────────────────
  getStats() {
    return { roads: this.roads.length, areas: this.areas.length, pois: this.pois.length };
  }

  getRoadHalfWidth(road) {
    const baseHalf = { highway: 10, arterial: 6, street: 4, alley: 3, pedestrian: 2 };
    const baseLanes = this._defaultLaneCount(road.type);
    const laneCount = Math.max(1, Number(road.laneCount) || baseLanes);
    const widthScale = Math.max(0.5, Number(road.widthScale) || 1);
    return (baseHalf[road.type] || 4) * Math.max(0.7, laneCount / baseLanes) * widthScale;
  }

  _defaultLaneCount(type) {
    return {
      highway: 4,
      arterial: 4,
      street: 2,
      alley: 1,
      pedestrian: 1,
    }[type] || 2;
  }
}

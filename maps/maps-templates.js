'use strict';

/**
 * Map Templates – pre-built road junction / city patterns.
 * Each template.create(cx, cy) returns { nodes, roads, areas }
 * with NEW IDs so they can be inserted at the given center point.
 */
const MAP_TEMPLATES = [
  // ── 4-way intersection ──────────────────────────────────
  {
    id: 'crossroads',
    name: 'Перекрёсток +',
    icon: '✚',
    description: '4-сторонний перекрёсток',
    create(cx, cy, type = 'street', arm = 150) {
      const C  = { id: uid(), x: cx, y: cy };
      const W  = { id: uid(), x: cx - arm, y: cy };
      const E  = { id: uid(), x: cx + arm, y: cy };
      const N  = { id: uid(), x: cx, y: cy - arm };
      const S  = { id: uid(), x: cx, y: cy + arm };
      return {
        nodes: [C, W, E, N, S],
        roads: [
          { id: uid(), nodes: [W.id, C.id, E.id], type, name: '' },
          { id: uid(), nodes: [N.id, C.id, S.id], type, name: '' },
        ],
        areas: [],
      };
    },
  },

  // ── T-intersection ──────────────────────────────────────
  {
    id: 'tjunction',
    name: 'Т-перекрёсток',
    icon: '⊤',
    description: 'Трёхсторонний перекрёсток',
    create(cx, cy, type = 'street', arm = 150) {
      const C = { id: uid(), x: cx, y: cy };
      const W = { id: uid(), x: cx - arm, y: cy };
      const E = { id: uid(), x: cx + arm, y: cy };
      const N = { id: uid(), x: cx, y: cy - arm };
      return {
        nodes: [C, W, E, N],
        roads: [
          { id: uid(), nodes: [W.id, C.id, E.id], type, name: '' },
          { id: uid(), nodes: [N.id, C.id],        type, name: '' },
        ],
        areas: [],
      };
    },
  },

  // ── Roundabout ─────────────────────────────────────────
  {
    id: 'roundabout',
    name: 'Кольцо',
    icon: '⊙',
    description: 'Круговое движение (4 въезда)',
    create(cx, cy, type = 'street', arm = 160, r = 60) {
      const STEPS = 12;
      const ringNodes = [];
      const entryNodes = [];
      const roads = [];

      // Ring nodes
      for (let i = 0; i < STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2 - Math.PI / 2;
        ringNodes.push({ id: uid(), x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }

      // Ring road (closed loop)
      roads.push({
        id: uid(),
        nodes: [...ringNodes.map(n => n.id), ringNodes[0].id],
        type: 'arterial',
        name: '',
        oneway: true,
      });

      // 4 entry arms at N/E/S/W
      const dirs = [
        { a: -Math.PI/2, label: 'N' },
        { a: 0,          label: 'E' },
        { a: Math.PI/2,  label: 'S' },
        { a: Math.PI,    label: 'W' },
      ];
      for (const dir of dirs) {
        const ringIdx = Math.round(((dir.a + Math.PI / 2) / (Math.PI * 2)) * STEPS + STEPS) % STEPS;
        const junction = ringNodes[ringIdx];
        const outer = {
          id: uid(),
          x: cx + Math.cos(dir.a) * (r + arm),
          y: cy + Math.sin(dir.a) * (r + arm),
        };
        entryNodes.push(outer);
        roads.push({ id: uid(), nodes: [outer.id, junction.id], type, name: '' });
      }

      return {
        nodes: [...ringNodes, ...entryNodes],
        roads,
        areas: [],
      };
    },
  },

  // ── City block ─────────────────────────────────────────
  {
    id: 'block',
    name: 'Квартал',
    icon: '⬜',
    description: 'Прямоугольный квартал',
    create(cx, cy, type = 'street', w = 300, h = 200) {
      const hw = w / 2, hh = h / 2;
      const NW = { id: uid(), x: cx-hw, y: cy-hh };
      const NE = { id: uid(), x: cx+hw, y: cy-hh };
      const SE = { id: uid(), x: cx+hw, y: cy+hh };
      const SW = { id: uid(), x: cx-hw, y: cy+hh };
      return {
        nodes: [NW, NE, SE, SW],
        roads: [
          { id: uid(), nodes: [NW.id, NE.id], type, name: '' },
          { id: uid(), nodes: [NE.id, SE.id], type, name: '' },
          { id: uid(), nodes: [SE.id, SW.id], type, name: '' },
          { id: uid(), nodes: [SW.id, NW.id], type, name: '' },
        ],
        areas: [],
      };
    },
  },

  // ── City grid 3×3 ─────────────────────────────────────
  {
    id: 'grid3x3',
    name: 'Сетка 3×3',
    icon: '⊞',
    description: '9 кварталов (4×4 перекрёстка)',
    create(cx, cy, type = 'street', block = 200) {
      const ROWS = 4, COLS = 4;
      const ox = cx - (COLS-1)*block/2;
      const oy = cy - (ROWS-1)*block/2;
      const ns = [];
      for (let r = 0; r < ROWS; r++) {
        ns[r] = [];
        for (let c = 0; c < COLS; c++) {
          ns[r][c] = { id: uid(), x: ox+c*block, y: oy+r*block };
        }
      }
      const all = ns.flat();
      const roads = [];
      for (let r = 0; r < ROWS; r++) {
        roads.push({ id: uid(), nodes: ns[r].map(n=>n.id), type, name: '' });
      }
      for (let c = 0; c < COLS; c++) {
        roads.push({ id: uid(), nodes: ns.map(r=>r[c].id), type, name: '' });
      }
      return { nodes: all, roads, areas: [] };
    },
  },

  // ── Avenue (dual carriageway) ──────────────────────────
  {
    id: 'avenue',
    name: 'Проспект',
    icon: '═',
    description: 'Проспект с разделителем (двойная дорога)',
    create(cx, cy, type = 'arterial', len = 600, gap = 20) {
      const W1 = { id: uid(), x: cx-len/2, y: cy-gap };
      const E1 = { id: uid(), x: cx+len/2, y: cy-gap };
      const W2 = { id: uid(), x: cx-len/2, y: cy+gap };
      const E2 = { id: uid(), x: cx+len/2, y: cy+gap };
      return {
        nodes: [W1, E1, W2, E2],
        roads: [
          { id: uid(), nodes: [W1.id, E1.id], type, name: '', oneway: true },
          { id: uid(), nodes: [E2.id, W2.id], type, name: '', oneway: true },
        ],
        areas: [],
      };
    },
  },

  // ── Highway on-ramp ────────────────────────────────────
  {
    id: 'onramp',
    name: 'Съезд',
    icon: '↗',
    description: 'Въезд / съезд на шоссе',
    create(cx, cy) {
      const A  = { id: uid(), x: cx - 350, y: cy };
      const B  = { id: uid(), x: cx + 350, y: cy };
      const R1 = { id: uid(), x: cx - 100, y: cy };
      const R2 = { id: uid(), x: cx + 100, y: cy };
      const OFF= { id: uid(), x: cx,       y: cy + 200 };
      const TS = { id: uid(), x: cx,       y: cy + 350 };
      return {
        nodes: [A, B, R1, R2, OFF, TS],
        roads: [
          { id: uid(), nodes: [A.id, R1.id, R2.id, B.id], type: 'highway',  name: '',  oneway: false },
          { id: uid(), nodes: [R2.id, OFF.id, TS.id],      type: 'arterial', name: '',  oneway: false },
        ],
        areas: [],
      };
    },
  },

  // ── Cul-de-sac ─────────────────────────────────────────
  {
    id: 'culdesac',
    name: 'Тупик',
    icon: '⊣',
    description: 'Тупиковая улица с разворотным кольцом',
    create(cx, cy, type = 'street', len = 300, r = 50) {
      const START = { id: uid(), x: cx, y: cy + len/2 };
      const END   = { id: uid(), x: cx, y: cy - len/2 };
      const STEPS = 10;
      const ring  = [];
      for (let i = 0; i < STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2 - Math.PI / 2;
        ring.push({ id: uid(), x: END.x + Math.cos(a)*r, y: END.y + Math.sin(a)*r });
      }
      return {
        nodes: [START, END, ...ring],
        roads: [
          { id: uid(), nodes: [START.id, END.id],                                type, name: '' },
          { id: uid(), nodes: [...ring.map(n=>n.id), ring[0].id], type, name: '' },
        ],
        areas: [],
      };
    },
  },

  // ── Y-junction ─────────────────────────────────────────
  {
    id: 'yjunction',
    name: 'Y-развязка',
    icon: 'Y',
    description: 'Трёх-лучевая развязка',
    create(cx, cy, type = 'street', arm = 180) {
      const C  = { id: uid(), x: cx, y: cy };
      const N  = { id: uid(), x: cx,            y: cy - arm };
      const SW = { id: uid(), x: cx - arm*0.87, y: cy + arm*0.5 };
      const SE = { id: uid(), x: cx + arm*0.87, y: cy + arm*0.5 };
      return {
        nodes: [C, N, SW, SE],
        roads: [
          { id: uid(), nodes: [N.id,  C.id],  type, name: '' },
          { id: uid(), nodes: [SW.id, C.id],  type, name: '' },
          { id: uid(), nodes: [SE.id, C.id],  type, name: '' },
        ],
        areas: [],
      };
    },
  },

  // ── Park block ─────────────────────────────────────────
  {
    id: 'parkblock',
    name: 'Парк-квартал',
    icon: '🌳',
    description: 'Квартал + парк внутри',
    create(cx, cy, type = 'street', block = 320) {
      const hw = block / 2;
      const NW = { id: uid(), x: cx-hw, y: cy-hw };
      const NE = { id: uid(), x: cx+hw, y: cy-hw };
      const SE = { id: uid(), x: cx+hw, y: cy+hw };
      const SW = { id: uid(), x: cx-hw, y: cy+hw };
      const pad = 30;
      const areas = [{
        id: uid(),
        points: [[cx-hw+pad,cy-hw+pad],[cx+hw-pad,cy-hw+pad],[cx+hw-pad,cy+hw-pad],[cx-hw+pad,cy+hw-pad]],
        type: 'park', name: 'Парк', number: '',
      }];
      return {
        nodes: [NW, NE, SE, SW],
        roads: [
          { id: uid(), nodes: [NW.id,NE.id], type, name: '' },
          { id: uid(), nodes: [NE.id,SE.id], type, name: '' },
          { id: uid(), nodes: [SE.id,SW.id], type, name: '' },
          { id: uid(), nodes: [SW.id,NW.id], type, name: '' },
        ],
        areas,
      };
    },
  },
];

/**
 * Insert a template into MapData at (cx, cy).
 * Returns a list of added IDs so they can be selected / undone.
 */
function insertTemplate(data, templateId, cx, cy) {
  const tpl = MAP_TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return null;

  const result = tpl.create(cx, cy);

  for (const n of result.nodes)  data.addNode(n.x, n.y, n.id);
  for (const r of result.roads)  data.addRoad(r.nodes, r.type, r.name || '', r.id);
  for (const a of result.areas)  data.addArea(a.points, a.type, a.name || '', a.number || '', a.id);

  return {
    nodeIds: result.nodes.map(n=>n.id),
    roadIds: result.roads.map(r=>r.id),
    areaIds: result.areas.map(a=>a.id),
  };
}

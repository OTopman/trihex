/**
 * TriHex 3D & 2D — Spherical Voronoi Discrete Global Grid Explorer
 * Integrated Three.js WebGL 3D Globe + Leaflet 2D Street Map powered by TriHex Core
 */

import {
  cellDisk,
  cellToBoundary,
  cellToChildrenRange,
  cellToLatLng,
  getCellBoundary,
  getCellNeighbors,
  getDirectedEdge,
  getDirectedEdgeBoundary,
  getDualBoundary,
  getDualNeighbors,
  getHexDual,
  getResolutionCellRadius,
  hexRing,
  isDualCellId,
  latLngToCell,
  polygonToCellsHierarchical,
  TriHex,
  unpackTriHexId,
} from './trihex.js';

// Global Configuration & State
const SPHERE_RADIUS = 100;
const state = {
  view: '3d', // '3d' | '2d' | 'split'
  mode: 'dual', // 'primal' | 'dual' | 'hybrid'
  resolution: 2,
  ringRadius: 1,
  showFaces: true,
  showEdges: true,
  showVertices: true,
  showGrid: true,
  showAtmosphere: true,
  showDirectedEdges: true,
  selectedCell: null,
  selectedIsDual: true,
  hoverCoord: { lat: 6.5244, lng: 3.3792 },
  activeGeofenceCells: [],

  // Enhanced 2D Map & HUD UX State
  autoLod: true,
  basemap: 'dark',
  showCentroids: false,
  showHeatmap: false,
  syncViews: false,
  mapStroke: true,
  mapFill: true,
  mapFillOpacity: 0.25,
  panelsCollapsed: {
    left: false,
    right: false,
  },
};

// 12 Canonical Icosahedron Vertices (Golden ratio phi)
const PHI = (1 + Math.sqrt(5)) / 2;
const K = Math.sqrt(1 + PHI * PHI);
const A = (1 / K) * SPHERE_RADIUS;
const B = (PHI / K) * SPHERE_RADIUS;

const ICO_VERTICES_3D = [
  [-A, B, 0], [A, B, 0], [-A, -B, 0], [A, -B, 0],
  [0, -A, B], [0, A, B], [0, -A, -B], [0, A, -B],
  [B, 0, -A], [B, 0, A], [-B, 0, -A], [-B, 0, A]
];

const ICO_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
];

// Helper: Convert GeoCoord (lat, lng) to Three.js 3D Vector on Sphere
function geoToThreeVec(lat, lng, radius = SPHERE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Helper: Convert 3D point to GeoCoord (lat, lng)
function threeVecToGeo(vec) {
  const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
  const normY = Math.max(-1, Math.min(1, vec.y / len));
  const lat = 90 - Math.acos(normY) * (180 / Math.PI);
  let lng = Math.atan2(vec.z, -vec.x) * (180 / Math.PI) - 180;
  if (lng < -180) lng += 360;
  if (lng > 180) lng -= 360;
  return { lat, lng };
}

// Spherical Slerp between two 3D vectors
function slerp3D(v1, v2, t) {
  const dot = Math.max(-1, Math.min(1, v1.clone().normalize().dot(v2.clone().normalize())));
  const omega = Math.acos(dot);
  if (Math.abs(omega) < 1e-6) return v1.clone();
  const sinOmega = Math.sin(omega);
  const s1 = Math.sin((1 - t) * omega) / sinOmega;
  const s2 = Math.sin(t * omega) / sinOmega;
  return v1.clone().multiplyScalar(s1).add(v2.clone().multiplyScalar(s2));
}

// =============================================================================
// Three.js 3D WebGL Scene Setup
// =============================================================================
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070e);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.set(0, 50, 280);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
canvasContainer.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 110;
controls.maxDistance = 600;
controls.rotateSpeed = 0.8;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);

const dirLight1 = new THREE.DirectionalLight(0x00f0ff, 1.2);
dirLight1.position.set(200, 200, 200);
scene.add(dirLight1);

const dirLight2 = new THREE.DirectionalLight(0xf59e0b, 0.8);
dirLight2.position.set(-200, -100, -200);
scene.add(dirLight2);

// Stars Background
const starGeo = new THREE.BufferGeometry();
const starCount = 1500;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i += 3) {
  const r = 800 + Math.random() * 800;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);
  starPos[i] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i + 1] = r * Math.cos(phi);
  starPos[i + 2] = r * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0x88a0c8, size: 1.5, transparent: true, opacity: 0.7 });
const starPoints = new THREE.Points(starGeo, starMat);
scene.add(starPoints);

// Earth Base Sphere
const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 64);
const sphereMat = new THREE.MeshStandardMaterial({
  color: 0x0a1122,
  roughness: 0.8,
  metalness: 0.2,
  transparent: true,
  opacity: 0.95,
});
const earthMesh = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(earthMesh);

// Atmospheric Rim Glow
const atmoGeo = new THREE.SphereGeometry(SPHERE_RADIUS * 1.025, 48, 48);
const atmoMat = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.BackSide,
  uniforms: {
    c: { value: 0.35 },
    p: { value: 3.5 },
    glowColor: { value: new THREE.Color(0x00f0ff) },
  },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 glowColor;
    uniform float c;
    uniform float p;
    varying vec3 vNormal;
    void main() {
      float intensity = pow(c - dot(vNormal, vec3(0.0, 0.0, 1.0)), p);
      gl_FragColor = vec4(glowColor, intensity * 0.5);
    }
  `,
});
const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
scene.add(atmoMesh);

// 3D Scene Groups
const icosahedronGroup = new THREE.Group();
const gridGroup = new THREE.Group();
const selectionGroup = new THREE.Group();
const flowGroup = new THREE.Group();
scene.add(icosahedronGroup);
scene.add(gridGroup);
scene.add(selectionGroup);
scene.add(flowGroup);

// =============================================================================
// Leaflet 2D Map Setup & Basemap Switcher
// =============================================================================
const BASEMAP_TILES = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_3q6d_1_68cacf218076d2013e2fcbb7',
    options: {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    },
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?key=cb1_3q6d_1_68cacf218076d2013e2fcbb7',
    options: {
      maxZoom: 19,
      attribution: '&copy; Esri &copy; Earthstar Geographics',
    },
  },
  voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    },
  },
  midnight: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png?key=cb1_3q6d_1_68cacf218076d2013e2fcbb7',
    options: {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    },
  },
};

const map = L.map('map-container', {
  zoomControl: false,
  attributionControl: true,
}).setView([6.5244, 3.3792], 11);

let currentBasemapLayer = L.tileLayer(BASEMAP_TILES.dark.url, BASEMAP_TILES.dark.options).addTo(map);

function setBasemap(theme) {
  if (!BASEMAP_TILES[theme]) return;
  if (currentBasemapLayer) {
    map.removeLayer(currentBasemapLayer);
  }
  state.basemap = theme;
  currentBasemapLayer = L.tileLayer(BASEMAP_TILES[theme].url, BASEMAP_TILES[theme].options).addTo(map);
  currentBasemapLayer.bringToBack();
}

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Leaflet Layer Groups for TriHex Cartography
const mapHeatmapLayer = L.layerGroup().addTo(map);
const mapGridLayer = L.layerGroup().addTo(map);
const mapCentroidsLayer = L.layerGroup().addTo(map);
const mapSelectionLayer = L.layerGroup().addTo(map);
const mapFlowLayer = L.layerGroup().addTo(map);

// Build Icosahedral Base Polyhedron (Faces, Edges, Vertices)
function buildIcosahedronBase() {
  while (icosahedronGroup.children.length > 0) {
    icosahedronGroup.remove(icosahedronGroup.children[0]);
  }

  // 12 Canonical Vertices
  const vertGeo = new THREE.SphereGeometry(1.6, 16, 16);
  const vertMat = new THREE.MeshBasicMaterial({ color: 0xec4899 });
  ICO_VERTICES_3D.forEach((v) => {
    const m = new THREE.Mesh(vertGeo, vertMat);
    m.position.set(v[0], v[1], v[2]);
    icosahedronGroup.add(m);
  });

  // 30 Edges (Arc segments)
  const edgeSet = new Set();
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.55, linewidth: 2 });
  
  ICO_FACES.forEach((face) => {
    for (let i = 0; i < 3; i++) {
      const vA = face[i];
      const vB = face[(i + 1) % 3];
      const key = vA < vB ? `${vA}-${vB}` : `${vB}-${vA}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        const p1 = new THREE.Vector3(...ICO_VERTICES_3D[vA]);
        const p2 = new THREE.Vector3(...ICO_VERTICES_3D[vB]);
        
        const arcPoints = [];
        const segments = 16;
        for (let s = 0; s <= segments; s++) {
          const t = s / segments;
          const arcP = slerp3D(p1, p2, t).normalize().multiplyScalar(SPHERE_RADIUS * 1.002);
          arcPoints.push(arcP);
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
        const line = new THREE.Line(lineGeo, edgeMat);
        icosahedronGroup.add(line);
      }
    }
  });

  // 20 Faces (Subtle translucent colored triangles)
  ICO_FACES.forEach((face, fIdx) => {
    const p0 = new THREE.Vector3(...ICO_VERTICES_3D[face[0]]);
    const p1 = new THREE.Vector3(...ICO_VERTICES_3D[face[1]]);
    const p2 = new THREE.Vector3(...ICO_VERTICES_3D[face[2]]);
    
    const triGeo = new THREE.BufferGeometry();
    const triPoints = [p0, p1, p2];
    const positions = [];
    triPoints.forEach(p => positions.push(p.x, p.y, p.z));
    triGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const hue = (fIdx / 20) * 0.8;
    const faceMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(hue, 0.6, 0.4),
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const faceMesh = new THREE.Mesh(triGeo, faceMat);
    icosahedronGroup.add(faceMesh);
  });
}

// Build 3D Grid Layer for Current Mode and Resolution
function buildGridLayer() {
  while (gridGroup.children.length > 0) {
    gridGroup.remove(gridGroup.children[0]);
  }

  if (!state.showGrid) return;

  const res = state.resolution;
  const lineMat = new THREE.LineBasicMaterial({
    color: state.mode === 'primal' ? 0x00f0ff : 0x10b981,
    transparent: true,
    opacity: 0.35,
  });

  const maxFacesToRender = res <= 3 ? 20 : 12;
  const step = Math.max(1, 1 << Math.max(0, res - 3));

  for (let f = 0; f < maxFacesToRender; f++) {
    const N = 1 << res;
    for (let I = 0; I < N; I += step) {
      for (let J = 0; I + J < N; J += step) {
        if (state.mode === 'primal' || state.mode === 'hybrid') {
          try {
            const morton = BigInt(I * N + J);
            const cellId = TriHex.pack(f, res, morton);
            const boundary = cellToBoundary(cellId);
            const pts = boundary.map(c => geoToThreeVec(c.lat, c.lng, SPHERE_RADIUS * 1.003));
            pts.push(pts[0]);
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            gridGroup.add(new THREE.Line(geo, lineMat));
          } catch (e) {}
        }

        if (state.mode === 'dual' || state.mode === 'hybrid') {
          try {
            const dualCell = getHexDual(TriHex.pack(f, res, 0n));
            if (dualCell && dualCell.boundary.length >= 5) {
              const isPentagon = dualCell.isPentagon;
              const dMat = new THREE.LineBasicMaterial({
                color: isPentagon ? 0xec4899 : 0xf59e0b,
                transparent: true,
                opacity: isPentagon ? 0.8 : 0.4,
                linewidth: isPentagon ? 2 : 1,
              });
              const pts = dualCell.boundary.map(c => geoToThreeVec(c.lat, c.lng, SPHERE_RADIUS * 1.004));
              pts.push(pts[0]);
              const geo = new THREE.BufferGeometry().setFromPoints(pts);
              gridGroup.add(new THREE.Line(geo, dMat));
            }
          } catch (e) {}
        }
      }
    }
  }

  // Also update 2D map grid
  renderMapGrid();
}

// Auto-LOD: Calculate optimal TriHex resolution from map zoom level
function getAutoResolution(zoom) {
  if (zoom <= 2) return 1;
  if (zoom <= 4) return 2;
  if (zoom <= 6) return 3;
  if (zoom <= 8) return 5;
  if (zoom <= 10) return 7;
  if (zoom <= 12) return 8;
  if (zoom <= 14) return 9;
  if (zoom <= 16) return 10;
  return 11;
}

// Update Resolution Slider and Metric Badges in HUD
function updateResolutionMetrics(res) {
  const badge = document.getElementById('res-badge');
  if (badge) badge.textContent = `Res ${res}`;
  const N = 1 << res;
  const primalCells = 20 * N * N;
  const dualCells = 10 * N * N + 2;
  const count = state.mode === 'primal' ? primalCells : dualCells;
  const radiusMeters = getResolutionCellRadius(res);

  const totalCountEl = document.getElementById('total-cells-count');
  if (totalCountEl) totalCountEl.textContent = count.toLocaleString();
  const radiusEl = document.getElementById('cell-circumradius');
  if (radiusEl) radiusEl.textContent = radiusMeters > 1000 ? `${(radiusMeters / 1000).toFixed(0)} km` : `${radiusMeters.toFixed(0)} m`;
  const edgeEl = document.getElementById('cell-edge-length');
  if (edgeEl) edgeEl.textContent = radiusMeters > 1000 ? `${(radiusMeters * 1.732 / 1000).toFixed(0)} km` : `${(radiusMeters * 1.732).toFixed(0)} m`;
}

// Render 2D Grid Cells, Centroids, and Heatmap on Leaflet Map
function renderMapGrid() {
  mapGridLayer.clearLayers();
  mapCentroidsLayer.clearLayers();
  mapHeatmapLayer.clearLayers();

  if (!state.showGrid) {
    const footerCount = document.getElementById('cell-counter-footer');
    if (footerCount) footerCount.textContent = 'Visible Cells: 0';
    return;
  }

  // If Auto-LOD is active, adapt resolution to current Leaflet zoom
  if (state.autoLod) {
    const autoRes = getAutoResolution(map.getZoom());
    if (autoRes !== state.resolution) {
      state.resolution = autoRes;
      const resSlider = document.getElementById('resolution-slider');
      if (resSlider) resSlider.value = autoRes;
      updateResolutionMetrics(autoRes);
    }
  }

  const bounds = map.getBounds();
  const south = Math.max(-85, bounds.getSouth());
  const north = Math.min(85, bounds.getNorth());
  const west = bounds.getWest();
  const east = bounds.getEast();

  // Multi-point viewport sampling across regular grid
  const cellSet = new Set();
  const latSteps = 7;
  const lngSteps = 9;

  for (let r = 0; r <= latSteps; r++) {
    const lat = south + (north - south) * (r / latSteps);
    for (let c = 0; c <= lngSteps; c++) {
      let lng = west + (east - west) * (c / lngSteps);
      while (lng < -180) lng += 360;
      while (lng > 180) lng -= 360;
      try {
        const cId = latLngToCell(lat, lng, state.resolution);
        cellSet.add(cId);
      } catch (e) {}
    }
  }

  // Expand with 1-ring neighbors to fill polygon gaps along viewport edges
  const expandedSet = new Set(cellSet);
  for (const cId of cellSet) {
    if (expandedSet.size >= 160) break;
    try {
      const neighbors = state.mode === 'primal' ? getCellNeighbors(cId) : getDualNeighbors(cId);
      for (const n of neighbors) {
        expandedSet.add(n);
        if (expandedSet.size >= 180) break;
      }
    } catch (e) {}
  }

  let visibleCount = 0;

  expandedSet.forEach((cellId) => {
    try {
      let bCoords = [];
      let isPentagon = false;
      let cellCenter = null;
      let targetId = cellId;

      if (state.mode === 'dual' || state.mode === 'hybrid') {
        const dual = getHexDual(cellId);
        bCoords = dual.boundary;
        isPentagon = dual.isPentagon;
        cellCenter = dual.center;
        targetId = dual.id;
      } else {
        bCoords = cellToBoundary(cellId);
        cellCenter = cellToLatLng(cellId);
        isPentagon = false;
        targetId = cellId;
      }

      if (bCoords && bCoords.length >= 3) {
        visibleCount++;
        const latlngs = bCoords.map((c) => [c.lat, c.lng]);
        const color = isPentagon ? '#ec4899' : (state.mode === 'primal' ? '#00f0ff' : '#f59e0b');
        const strokeColor = isPentagon ? '#ff5cb0' : (state.mode === 'primal' ? '#00f0ff' : '#f59e0b');

        const poly = L.polygon(latlngs, {
          color: strokeColor,
          weight: state.mapStroke ? (isPentagon ? 2.5 : 1.4) : 0,
          fillColor: color,
          fillOpacity: state.mapFill ? (isPentagon ? 0.35 : state.mapFillOpacity) : 0,
          className: 'trihex-cell-polygon',
        });

        poly.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectCell(targetId);
        });

        poly.on('mouseover', (e) => {
          poly.setStyle({
            weight: 2.8,
            fillOpacity: Math.min(0.65, state.mapFillOpacity + 0.3),
          });
          const tooltip = document.getElementById('cell-hover-tooltip');
          if (tooltip) {
            tooltip.classList.add('visible');
            tooltip.style.left = `${e.originalEvent.pageX}px`;
            tooltip.style.top = `${e.originalEvent.pageY}px`;
            document.getElementById('tooltip-type').textContent = isPentagon
              ? 'PENTAGON DUAL'
              : (state.mode === 'primal' ? 'PRIMAL TRI' : 'HEX DUAL');
            document.getElementById('tooltip-res').textContent = `R${state.resolution}`;
            document.getElementById('tooltip-hex').textContent = `0x${targetId.toString(16).slice(0, 14)}...`;
            document.getElementById('tooltip-coords').textContent = `${cellCenter.lat.toFixed(4)}°, ${cellCenter.lng.toFixed(4)}°`;
          }
          document.getElementById('footer-coords').textContent = `CURSOR: Lat: ${cellCenter.lat.toFixed(4)}°, Lng: ${cellCenter.lng.toFixed(4)}°`;
        });

        poly.on('mousemove', (e) => {
          const tooltip = document.getElementById('cell-hover-tooltip');
          if (tooltip) {
            tooltip.style.left = `${e.originalEvent.pageX}px`;
            tooltip.style.top = `${e.originalEvent.pageY}px`;
          }
        });

        poly.on('mouseout', () => {
          poly.setStyle({
            weight: state.mapStroke ? (isPentagon ? 2.5 : 1.4) : 0,
            fillOpacity: state.mapFill ? (isPentagon ? 0.35 : state.mapFillOpacity) : 0,
          });
          const tooltip = document.getElementById('cell-hover-tooltip');
          if (tooltip) tooltip.classList.remove('visible');
        });

        mapGridLayer.addLayer(poly);

        // Centroid Pins Layer
        if (state.showCentroids && cellCenter) {
          const pin = L.marker([cellCenter.lat, cellCenter.lng], {
            icon: L.divIcon({
              className: 'centroid-marker-wrap',
              html: '<div class="centroid-marker"></div>',
              iconSize: [8, 8],
              iconAnchor: [4, 4],
            }),
          });
          pin.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            selectCell(targetId);
          });
          mapCentroidsLayer.addLayer(pin);
        }

        // Fleet Heatmap Layer
        if (state.showHeatmap && cellCenter) {
          const rMeters = getResolutionCellRadius(state.resolution) * 0.75;
          const heatCircle = L.circle([cellCenter.lat, cellCenter.lng], {
            radius: rMeters,
            stroke: false,
            fillColor: '#00f0ff',
            fillOpacity: 0.12 + (Math.abs(Math.sin(Number(targetId & 0xfffn))) * 0.18),
          });
          mapHeatmapLayer.addLayer(heatCircle);
        }
      }
    } catch (e) {}
  });

  const footerCount = document.getElementById('cell-counter-footer');
  if (footerCount) {
    footerCount.textContent = `Visible Cells: ${visibleCount}`;
  }
}

// Highlight Selected Cell, Rings, and Directed Edges (3D + 2D)
function updateSelectionHighlight() {
  while (selectionGroup.children.length > 0) {
    selectionGroup.remove(selectionGroup.children[0]);
  }
  while (flowGroup.children.length > 0) {
    flowGroup.remove(flowGroup.children[0]);
  }

  mapSelectionLayer.clearLayers();
  mapFlowLayer.clearLayers();

  if (!state.selectedCell) return;

  const id = state.selectedCell;
  const isDual = isDualCellId(id);

  // 1. Selected Cell Boundary
  let boundaryCoords = [];
  try {
    boundaryCoords = isDual ? getDualBoundary(id) : getCellBoundary(id);
  } catch (e) {
    boundaryCoords = cellToBoundary(id);
  }

  if (boundaryCoords.length >= 3) {
    // 3D Rendering
    const pts = boundaryCoords.map(c => geoToThreeVec(c.lat, c.lng, SPHERE_RADIUS * 1.006));
    pts.push(pts[0]);
    
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
    });
    selectionGroup.add(new THREE.Line(lineGeo, lineMat));

    const triGeo = new THREE.BufferGeometry();
    const positions = [];
    const center = isDual ? getHexDual(id).center : cellToLatLng(id);
    const cVec = geoToThreeVec(center.lat, center.lng, SPHERE_RADIUS * 1.005);
    
    for (let i = 0; i < pts.length - 1; i++) {
      positions.push(cVec.x, cVec.y, cVec.z);
      positions.push(pts[i].x, pts[i].y, pts[i].z);
      positions.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
    triGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    selectionGroup.add(new THREE.Mesh(triGeo, fillMat));

    // 2D Map Rendering
    const mapLatLngs = boundaryCoords.map(c => [c.lat, c.lng]);
    const selPoly = L.polygon(mapLatLngs, {
      color: '#00f0ff',
      weight: 3,
      fillColor: '#00f0ff',
      fillOpacity: 0.35,
    });
    mapSelectionLayer.addLayer(selPoly);
  }

  // 2. Concentric k-Rings
  if (state.ringRadius > 0) {
    try {
      const ringCells = isDual ? hexRing(id, state.ringRadius) : cellDisk(id, state.ringRadius);
      const ringMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.6,
      });

      ringCells.forEach(rId => {
        if (rId === id) return;
        try {
          const rBoundary = isDual ? getDualBoundary(rId) : getCellBoundary(rId);
          // 3D
          const rPts = rBoundary.map(c => geoToThreeVec(c.lat, c.lng, SPHERE_RADIUS * 1.005));
          rPts.push(rPts[0]);
          selectionGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rPts), ringMat));

          // 2D
          const rLatLngs = rBoundary.map(c => [c.lat, c.lng]);
          const ringPoly = L.polygon(rLatLngs, {
            color: '#f59e0b',
            weight: 1.5,
            fillColor: '#f59e0b',
            fillOpacity: 0.15,
          });
          ringPoly.on('click', () => selectCell(rId));
          mapSelectionLayer.addLayer(ringPoly);
        } catch (e) {}
      });
    } catch (e) {}
  }

  // 3. Directed Edge Flow Vectors
  if (state.showDirectedEdges) {
    try {
      const neighbors = isDual ? getDualNeighbors(id) : getCellNeighbors(id);
      if (neighbors && neighbors.length > 0) {
        const originCenter = isDual ? getHexDual(id).center : cellToLatLng(id);
        const originVec = geoToThreeVec(originCenter.lat, originCenter.lng, SPHERE_RADIUS * 1.007);

        neighbors.forEach((destId, idx) => {
          try {
            const destCenter = isDual ? getHexDual(destId).center : cellToLatLng(destId);
            const destVec = geoToThreeVec(destCenter.lat, destCenter.lng, SPHERE_RADIUS * 1.007);
            
            // 3D Flow Arrow
            const arrowPts = [];
            const segments = 12;
            for (let s = 0; s <= segments; s++) {
              const t = s / segments;
              arrowPts.push(slerp3D(originVec, destVec, t).normalize().multiplyScalar(SPHERE_RADIUS * 1.008));
            }
            flowGroup.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(arrowPts),
              new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 })
            ));

            // 3D Shared boundary
            const edgeId = getDirectedEdge(id, destId);
            const [b1, b2] = getDirectedEdgeBoundary(edgeId);
            flowGroup.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                geoToThreeVec(b1.lat, b1.lng, SPHERE_RADIUS * 1.008),
                geoToThreeVec(b2.lat, b2.lng, SPHERE_RADIUS * 1.008),
              ]),
              new THREE.LineBasicMaterial({ color: 0xec4899, linewidth: 3 })
            ));

            // 2D Map Flow Arrow & Shared Boundary
            const arrowLine = L.polyline(
              [[originCenter.lat, originCenter.lng], [destCenter.lat, destCenter.lng]],
              { color: '#f59e0b', weight: 2.5, opacity: 0.85, dashArray: '4, 4' }
            );
            mapFlowLayer.addLayer(arrowLine);

            const boundaryLine = L.polyline([[b1.lat, b1.lng], [b2.lat, b2.lng]], {
              color: '#ec4899',
              weight: 3.5,
              opacity: 0.95,
            });
            mapFlowLayer.addLayer(boundaryLine);

            if (idx === 0) {
              document.getElementById('edge-hex-id').textContent = `0x${edgeId.toString(16)}`;
              document.getElementById('flow-origin').textContent = `0x${id.toString(16).slice(0, 8)}...`;
              document.getElementById('flow-dest').textContent = `0x${destId.toString(16).slice(0, 8)}...`;
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
  }
}

// Update Telemetry Panel with Selected Cell Details
function updateTelemetryPanel(cellId) {
  if (!cellId) return;

  const hexStr = `0x${cellId.toString(16)}`;
  const decStr = cellId.toString(10);
  const isDual = isDualCellId(cellId);

  document.getElementById('cell-hex-id').textContent = hexStr;
  document.getElementById('cell-dec-id').textContent = `Decimal: ${decStr}`;

  let degree = 3;
  let isPentagon = false;
  let center = { lat: 0, lng: 0 };
  let neighbors = [];

  if (isDual) {
    try {
      const dual = getHexDual(cellId);
      degree = dual.degree;
      isPentagon = dual.isPentagon;
      center = dual.center;
      neighbors = dual.neighbors;
    } catch (e) {
      degree = 6;
    }
  } else {
    degree = 3;
    center = cellToLatLng(cellId);
    neighbors = getCellNeighbors(cellId);
  }

  const typeBadge = document.getElementById('cell-type-badge');
  const degreeBadge = document.getElementById('cell-degree-badge');

  if (isDual) {
    typeBadge.textContent = isPentagon ? 'PENTAGONAL SINGULARITY' : 'HEXAGONAL DUAL CELL';
    degreeBadge.textContent = `DEGREE ${degree}`;
    degreeBadge.className = isPentagon ? 'cell-degree-badge pentagon' : 'cell-degree-badge';
  } else {
    typeBadge.textContent = 'PRIMAL TRIANGULAR CELL';
    degreeBadge.textContent = 'DEGREE 3';
    degreeBadge.className = 'cell-degree-badge';
  }

  const unpacked = unpackTriHexId(cellId);
  document.getElementById('telemetry-face').textContent = `${unpacked.face} / 20`;
  document.getElementById('telemetry-res').textContent = `Res ${unpacked.resolution}`;
  document.getElementById('telemetry-morton').textContent = isDual ? `Dual Mode` : `Morton: ${unpacked.morton}`;
  document.getElementById('telemetry-centroid').textContent = `${center.lat.toFixed(4)}°, ${center.lng.toFixed(4)}°`;

  try {
    const parentRes = Math.max(0, unpacked.resolution - 1);
    const parentCell = TriHex.cellToParent(cellId, parentRes);
    const range = cellToChildrenRange(parentCell, unpacked.resolution);
    document.getElementById('sql-box').innerHTML = `<code>SELECT * FROM driver_positions
WHERE cell_id BETWEEN 0x${range.start.toString(16)}
                  AND 0x${range.end.toString(16)};</code>`;
  } catch (e) {}

  const nList = document.getElementById('neighbors-list');
  nList.innerHTML = '';
  document.getElementById('neighbors-label').textContent = `IMMEDIATE ADJACENT NEIGHBORS (${neighbors.length} LINKS)`;

  neighbors.forEach(nId => {
    const chip = document.createElement('div');
    chip.className = 'neighbor-chip';
    chip.textContent = `0x${nId.toString(16)}`;
    chip.onclick = () => selectCell(nId);
    nList.appendChild(chip);
  });
}

function selectCell(cellId) {
  state.selectedCell = cellId;
  updateSelectionHighlight();
  updateTelemetryPanel(cellId);
}

// Raycaster for Mouse Coordinate & Cell Selection on 3D Globe
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onPointerMove(event) {
  mouse.x = (event.clientX / (state.view === 'split' ? window.innerWidth * 0.5 : window.innerWidth)) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(earthMesh);

  if (intersects.length > 0) {
    const pt = intersects[0].point;
    const geo = threeVecToGeo(pt);
    state.hoverCoord = geo;
    document.getElementById('footer-coords').textContent = `CURSOR: Lat: ${geo.lat.toFixed(4)}°, Lng: ${geo.lng.toFixed(4)}°`;
  }
}

function onPointerDown(event) {
  if (event.target.tagName !== 'CANVAS') return;

  mouse.x = (event.clientX / (state.view === 'split' ? window.innerWidth * 0.5 : window.innerWidth)) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(earthMesh);

  if (intersects.length > 0) {
    const pt = intersects[0].point;
    const geo = threeVecToGeo(pt);
    try {
      const cellId = latLngToCell(geo.lat, geo.lng, state.resolution);
      selectCell(state.mode === 'dual' ? getHexDual(cellId).id : cellId);
    } catch (e) {}
  }
}

window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerdown', onPointerDown);

// 2D Map Click, Move, Zoom & Sync Listeners
map.on('click', (e) => {
  try {
    const cellId = latLngToCell(e.latlng.lat, e.latlng.lng, state.resolution);
    selectCell(state.mode === 'dual' ? getHexDual(cellId).id : cellId);
  } catch (err) {}
});

map.on('mousemove', (e) => {
  document.getElementById('footer-coords').textContent = `CURSOR: Lat: ${e.latlng.lat.toFixed(4)}°, Lng: ${e.latlng.lng.toFixed(4)}°`;
});

map.on('moveend', () => {
  renderMapGrid();
});

map.on('zoomend', () => {
  renderMapGrid();
});

// Split View Camera Synchronization Logic
let isSyncingFromMap = false;
let isSyncingFrom3D = false;

function sync2DTo3D() {
  if (!state.syncViews || state.view !== 'split' || isSyncingFrom3D) return;
  isSyncingFromMap = true;
  const center = map.getCenter();
  const currentDist = camera.position.length();
  const targetVec = geoToThreeVec(center.lat, center.lng, currentDist);
  camera.position.copy(targetVec);
  controls.update();
  setTimeout(() => { isSyncingFromMap = false; }, 60);
}

function sync3DTo2D() {
  if (!state.syncViews || state.view !== 'split' || isSyncingFromMap) return;
  isSyncingFrom3D = true;
  const camDir = camera.position.clone().normalize();
  const geo = threeVecToGeo(camDir);
  map.setView([geo.lat, geo.lng], map.getZoom(), { animate: false });
  setTimeout(() => { isSyncingFrom3D = false; }, 60);
}

map.on('move', sync2DTo3D);
controls.addEventListener('change', sync3DTo2D);

// Preset Global Hubs for Geocoder & Quick Navigation
const PRESET_HUBS = [
  { name: 'Lagos, Nigeria', lat: 6.5244, lng: 3.3792 },
  { name: 'San Francisco, USA', lat: 37.7749, lng: -122.4194 },
  { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
  { name: 'London, United Kingdom', lat: 51.5074, lng: -0.1278 },
  { name: 'New York, USA', lat: 40.7128, lng: -74.0060 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Sydney, Australia', lat: -33.8688, lng: 151.2093 },
  { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
  { name: 'Berlin, Germany', lat: 52.5200, lng: 13.4050 },
  { name: 'Dubai, UAE', lat: 25.2048, lng: 55.2708 },
  { name: 'Nairobi, Kenya', lat: -1.2921, lng: 36.8219 },
  { name: 'São Paulo, Brazil', lat: -23.5505, lng: -46.6333 },
];

// Fly Camera to Geographic Coordinate (Both 3D Globe and 2D Map)
function flyTo(lat, lng) {
  // 3D Globe camera animation
  const targetVec = geoToThreeVec(lat, lng, 240);
  const startPos = camera.position.clone();
  const startTime = performance.now();
  const duration = 1200;

  function animateFly(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const ease = 0.5 - Math.cos(progress * Math.PI) / 2;

    camera.position.lerpVectors(startPos, targetVec, ease);
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(animateFly);
    } else {
      const cellId = latLngToCell(lat, lng, state.resolution);
      selectCell(state.mode === 'dual' ? getHexDual(cellId).id : cellId);
    }
  }
  requestAnimationFrame(animateFly);

  // 2D Map flyTo with Auto-LOD smart zoom
  const targetZoom = state.autoLod ? 12 : Math.min(15, Math.max(9, state.resolution + 3));
  map.flyTo([lat, lng], targetZoom, { duration: 1.2 });
}

// UI Event Listeners
function setupUI() {
  // View Switcher (3D Globe / 2D Map / Split View)
  const viewBtns = [
    { id: 'view-btn-3d', view: '3d' },
    { id: 'view-btn-2d', view: '2d' },
    { id: 'view-btn-split', view: 'split' },
  ];

  viewBtns.forEach(({ id, view }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const appEl = document.getElementById('app');
      appEl.className = `view-${view}`;
      state.view = view;

      setTimeout(() => {
        const width = view === 'split' ? window.innerWidth * 0.5 : window.innerWidth;
        camera.aspect = width / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(width, window.innerHeight);
        
        map.invalidateSize();
        renderMapGrid();
      }, 350);
    });
  });

  // Basemap Switcher Select
  const basemapSelect = document.getElementById('basemap-select');
  if (basemapSelect) {
    basemapSelect.addEventListener('change', (e) => {
      setBasemap(e.target.value);
    });
  }

  // Auto-LOD Toggle Button
  const autoLodBtn = document.getElementById('btn-auto-lod');
  const autoLodText = document.getElementById('auto-lod-text');
  if (autoLodBtn) {
    autoLodBtn.addEventListener('click', () => {
      state.autoLod = !state.autoLod;
      autoLodBtn.classList.toggle('active', state.autoLod);
      if (autoLodText) {
        autoLodText.textContent = state.autoLod ? 'Auto-LOD: ON' : 'Auto-LOD: OFF';
      }
      if (state.autoLod) {
        renderMapGrid();
      }
    });
  }

  // Centroid Pins Toggles (Toolbar Button + Left Panel Checkbox)
  function toggleCentroids(val) {
    state.showCentroids = val;
    const btn = document.getElementById('btn-toggle-centroids');
    const chk = document.getElementById('toggle-map-centroids');
    if (btn) btn.classList.toggle('active', val);
    if (chk) chk.checked = val;
    renderMapGrid();
  }

  const btnCentroids = document.getElementById('btn-toggle-centroids');
  if (btnCentroids) {
    btnCentroids.addEventListener('click', () => toggleCentroids(!state.showCentroids));
  }
  const chkCentroids = document.getElementById('toggle-map-centroids');
  if (chkCentroids) {
    chkCentroids.addEventListener('change', (e) => toggleCentroids(e.target.checked));
  }

  // Simulated Fleet Heatmap Toggles (Toolbar Button + Left Panel Checkbox)
  function toggleHeatmap(val) {
    state.showHeatmap = val;
    const btn = document.getElementById('btn-toggle-heatmap');
    const chk = document.getElementById('toggle-map-heatmap');
    if (btn) btn.classList.toggle('active', val);
    if (chk) chk.checked = val;
    renderMapGrid();
  }

  const btnHeatmap = document.getElementById('btn-toggle-heatmap');
  if (btnHeatmap) {
    btnHeatmap.addEventListener('click', () => toggleHeatmap(!state.showHeatmap));
  }
  const chkHeatmap = document.getElementById('toggle-map-heatmap');
  if (chkHeatmap) {
    chkHeatmap.addEventListener('change', (e) => toggleHeatmap(e.target.checked));
  }

  // Split View Camera Sync Toggle Button
  const btnSync = document.getElementById('btn-sync-views');
  const syncText = document.getElementById('sync-text');
  if (btnSync) {
    btnSync.addEventListener('click', () => {
      state.syncViews = !state.syncViews;
      btnSync.classList.toggle('active', state.syncViews);
      if (syncText) {
        syncText.textContent = state.syncViews ? 'Sync: ON' : 'Sync: OFF';
      }
      if (state.syncViews && state.view === 'split') {
        sync2DTo3D();
      }
    });
  }

  // Location Search & Geocoder Dropdown
  const searchInput = document.getElementById('map-search-input');
  const searchDropdown = document.getElementById('search-results-dropdown');
  if (searchInput && searchDropdown) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        searchDropdown.classList.remove('open');
        searchDropdown.innerHTML = '';
        return;
      }

      searchDropdown.innerHTML = '';

      // Direct Lat/Lng input check
      const coordMatch = q.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[3]);
        const item = document.createElement('div');
        item.className = 'search-item';
        item.textContent = `Jump to (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        item.onclick = () => {
          flyTo(lat, lng);
          searchDropdown.classList.remove('open');
          searchInput.value = '';
        };
        searchDropdown.appendChild(item);
      }

      // Filter global hubs
      const matches = PRESET_HUBS.filter(h => h.name.toLowerCase().includes(q));
      matches.forEach(hub => {
        const item = document.createElement('div');
        item.className = 'search-item';
        item.textContent = hub.name;
        item.onclick = () => {
          flyTo(hub.lat, hub.lng);
          searchDropdown.classList.remove('open');
          searchInput.value = '';
        };
        searchDropdown.appendChild(item);
      });

      if (searchDropdown.children.length > 0) {
        searchDropdown.classList.add('open');
      } else {
        searchDropdown.classList.remove('open');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-group')) {
        searchDropdown.classList.remove('open');
      }
    });
  }

  // GPS Locate Me Button
  const btnLocate = document.getElementById('btn-locate-me');
  if (btnLocate) {
    btnLocate.addEventListener('click', () => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => flyTo(pos.coords.latitude, pos.coords.longitude),
          () => flyTo(6.5244, 3.3792)
        );
      } else {
        flyTo(6.5244, 3.3792);
      }
    });
  }

  // Collapsible Side Panels & Floating Mini-Docks
  const leftPanel = document.getElementById('hud-panel-left');
  const rightPanel = document.getElementById('hud-panel-right');
  const dockLeft = document.getElementById('dock-btn-left');
  const dockRight = document.getElementById('dock-btn-right');
  const btnCollapseLeft = document.getElementById('btn-collapse-left');
  const btnCollapseRight = document.getElementById('btn-collapse-right');

  if (btnCollapseLeft && leftPanel && dockLeft) {
    btnCollapseLeft.addEventListener('click', () => {
      leftPanel.classList.add('collapsed');
      dockLeft.classList.add('active');
      state.panelsCollapsed.left = true;
    });
    dockLeft.addEventListener('click', () => {
      leftPanel.classList.remove('collapsed');
      dockLeft.classList.remove('active');
      state.panelsCollapsed.left = false;
    });
  }

  if (btnCollapseRight && rightPanel && dockRight) {
    btnCollapseRight.addEventListener('click', () => {
      rightPanel.classList.add('collapsed');
      dockRight.classList.add('active');
      state.panelsCollapsed.right = true;
    });
    dockRight.addEventListener('click', () => {
      rightPanel.classList.remove('collapsed');
      dockRight.classList.remove('active');
      state.panelsCollapsed.right = false;
    });
  }

  // Header Toggle Panels Button
  const btnToggleHud = document.getElementById('btn-toggle-hud');
  const hudToggleText = document.getElementById('hud-toggle-text');
  if (btnToggleHud && leftPanel && rightPanel && dockLeft && dockRight) {
    btnToggleHud.addEventListener('click', () => {
      const anyOpen = !leftPanel.classList.contains('collapsed') || !rightPanel.classList.contains('collapsed');
      if (anyOpen) {
        leftPanel.classList.add('collapsed');
        rightPanel.classList.add('collapsed');
        dockLeft.classList.add('active');
        dockRight.classList.add('active');
        state.panelsCollapsed.left = true;
        state.panelsCollapsed.right = true;
        if (hudToggleText) hudToggleText.textContent = 'Show Panels';
      } else {
        leftPanel.classList.remove('collapsed');
        rightPanel.classList.remove('collapsed');
        dockLeft.classList.remove('active');
        dockRight.classList.remove('active');
        state.panelsCollapsed.left = false;
        state.panelsCollapsed.right = false;
        if (hudToggleText) hudToggleText.textContent = 'Hide Panels';
      }
    });
  }

  // 2D Cartography Layer Controls (Borders, Fill, Opacity)
  const toggleMapGrid = document.getElementById('toggle-map-grid');
  if (toggleMapGrid) {
    toggleMapGrid.addEventListener('change', (e) => {
      state.mapStroke = e.target.checked;
      renderMapGrid();
    });
  }

  const toggleMapFill = document.getElementById('toggle-map-fill');
  if (toggleMapFill) {
    toggleMapFill.addEventListener('change', (e) => {
      state.mapFill = e.target.checked;
      renderMapGrid();
    });
  }

  const opacitySlider = document.getElementById('cell-opacity-slider');
  const opacityLabel = document.getElementById('opacity-label');
  if (opacitySlider) {
    opacitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.mapFillOpacity = val / 100;
      if (opacityLabel) opacityLabel.textContent = `${val}%`;
      renderMapGrid();
    });
  }

  // Mode Buttons
  const modeBtns = document.querySelectorAll('.mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      document.getElementById('mode-tag').textContent = state.mode.toUpperCase();
      buildGridLayer();
      if (state.selectedCell) {
        selectCell(state.selectedCell);
      }
    });
  });

  // Resolution Slider
  const resSlider = document.getElementById('resolution-slider');
  resSlider.addEventListener('input', (e) => {
    state.resolution = parseInt(e.target.value, 10);
    updateResolutionMetrics(state.resolution);
    buildGridLayer();
    if (state.selectedCell) {
      const geo = state.hoverCoord;
      const newCell = latLngToCell(geo.lat, geo.lng, state.resolution);
      selectCell(state.mode === 'dual' ? getHexDual(newCell).id : newCell);
    }
  });

  // Polyhedron Toggles
  document.getElementById('toggle-faces').addEventListener('change', (e) => {
    state.showFaces = e.target.checked;
    icosahedronGroup.visible = state.showFaces;
  });

  document.getElementById('toggle-grid').addEventListener('change', (e) => {
    state.showGrid = e.target.checked;
    gridGroup.visible = state.showGrid;
    if (state.showGrid) buildGridLayer();
    else {
      mapGridLayer.clearLayers();
      mapCentroidsLayer.clearLayers();
      mapHeatmapLayer.clearLayers();
    }
  });

  document.getElementById('toggle-atmosphere').addEventListener('change', (e) => {
    state.showAtmosphere = e.target.checked;
    atmoMesh.visible = state.showAtmosphere;
  });

  // Ring Radius Slider
  const ringSlider = document.getElementById('ring-slider');
  ringSlider.addEventListener('input', (e) => {
    state.ringRadius = parseInt(e.target.value, 10);
    const k = state.ringRadius;
    const count = 1 + 3 * k * (k + 1);
    document.getElementById('ring-radius-val').textContent = `k = ${k} (${k === 0 ? 1 : count} cells)`;
    updateSelectionHighlight();
  });

  // Directed Edge Flow Toggle
  document.getElementById('toggle-directed-edges').addEventListener('change', (e) => {
    state.showDirectedEdges = e.target.checked;
    flowGroup.visible = state.showDirectedEdges;
    updateSelectionHighlight();
  });

  // Copy ID Button
  document.getElementById('btn-copy-id').addEventListener('click', () => {
    if (state.selectedCell) {
      navigator.clipboard.writeText(`0x${state.selectedCell.toString(16)}`);
      const copyBtn = document.getElementById('btn-copy-id');
      copyBtn.style.color = '#10b981';
      setTimeout(() => { copyBtn.style.color = ''; }, 1000);
    }
  });

  // Preset Chips
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      flyTo(lat, lng);
    });
  });

  // Demo Polyfill Button
  document.getElementById('btn-demo-polyfill').addEventListener('click', () => {
    const demoGeofence = [
      { lat: 6.425, lng: 3.405 },
      { lat: 6.455, lng: 3.415 },
      { lat: 6.465, lng: 3.445 },
      { lat: 6.435, lng: 3.455 },
      { lat: 6.425, lng: 3.405 },
    ];
    flyTo(6.44, 3.43);
    
    setTimeout(() => {
      const polyRes = Math.max(state.resolution, 4);
      const cells = polygonToCellsHierarchical(demoGeofence, polyRes);
      
      while (selectionGroup.children.length > 0) {
        selectionGroup.remove(selectionGroup.children[0]);
      }
      mapSelectionLayer.clearLayers();

      const polyMat = new THREE.LineBasicMaterial({ color: 0xec4899, linewidth: 2 });
      cells.forEach(cId => {
        try {
          const b = cellToBoundary(cId);
          // 3D
          const pts = b.map(c => geoToThreeVec(c.lat, c.lng, SPHERE_RADIUS * 1.006));
          pts.push(pts[0]);
          selectionGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), polyMat));

          // 2D
          const latlngs = b.map(c => [c.lat, c.lng]);
          mapSelectionLayer.addLayer(L.polygon(latlngs, {
            color: '#ec4899',
            weight: 2,
            fillColor: '#ec4899',
            fillOpacity: 0.25,
          }));
        } catch (e) {}
      });

      if (cells.length > 0) {
        selectCell(cells[0]);
      }
    }, 1300);
  });
}

// Window Resize Handler
window.addEventListener('resize', () => {
  const width = state.view === 'split' ? window.innerWidth * 0.5 : window.innerWidth;
  camera.aspect = width / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(width, window.innerHeight);
  map.invalidateSize();
});

// Render Loop with FPS Counter
let lastTime = performance.now();
let frames = 0;
const fpsDisplay = document.getElementById('fps-counter');

function animate(time) {
  requestAnimationFrame(animate);

  frames++;
  if (time > lastTime + 1000) {
    const fps = Math.round((frames * 1000) / (time - lastTime));
    fpsDisplay.textContent = `${fps} FPS`;
    frames = 0;
    lastTime = time;
  }

  starPoints.rotation.y += 0.0001;

  controls.update();
  renderer.render(scene, camera);
}

// Initialization Entry Point
function init() {
  buildIcosahedronBase();
  buildGridLayer();
  setupUI();
  
  const initialCell = latLngToCell(6.5244, 3.3792, state.resolution);
  selectCell(state.mode === 'dual' ? getHexDual(initialCell).id : initialCell);

  animate(performance.now());
}

init();

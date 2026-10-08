import { useEffect, useRef } from 'react';
import {
  AmbientLight, Box3, BoxGeometry, Color, DirectionalLight, ExtrudeGeometry, Group,
  InstancedMesh, Mesh, MeshStandardMaterial, OrthographicCamera, Raycaster, Scene, Shape,
  Vector2, Vector3, WebGLRenderer,
} from 'three';

export interface CityTile {
  id: string;
  color?: string;
  model?: number;
  occupied?: boolean;
  selected?: boolean;
  inHand?: boolean;
  void?: boolean;
}
export interface CityTileLayout {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  columnLabelTop: number;
  clipPath: string;
}
interface Props {
  tiles: CityTile[];
  columns: number;
  rows: number;
  incline?: number;
  diorama?: boolean;
  onLayout?: (layout: CityTileLayout[]) => void;
  onReady?: () => void;
  onUnavailable?: () => void;
}

// The camera projects both the physical board and its native button hit areas.
// This keeps touch, keyboard and screen-reader play aligned with the 3D spaces.
export default function CityScene({ tiles, columns, rows, incline = 19, diorama = false, onLayout, onReady, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const state = useRef({ tiles, columns, rows, incline, onLayout, onReady, onUnavailable });
  state.current = { tiles, columns, rows, incline, onLayout, onReady, onUnavailable };
  const redraw = useRef<(() => void) | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // StrictMode must get a fresh canvas after the previous context is released.
    const element = document.createElement('canvas');
    element.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(element);
    let renderer: WebGLRenderer;
    try {
      const context = element.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
      if (!context || context.isContextLost() || !context.getShaderPrecisionFormat(context.FRAGMENT_SHADER, context.HIGH_FLOAT)) {
        element.remove(); state.current.onUnavailable?.(); return;
      }
      renderer = new WebGLRenderer({ canvas: element, context, alpha: true, antialias: true });
    } catch {
      element.remove(); state.current.onUnavailable?.(); return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 1000);
    scene.add(new AmbientLight('#d4e4fa', 2.1));
    const sun = new DirectionalLight('#fff2d6', 3.1);
    sun.position.set(-9, -12, 22); scene.add(sun);
    const fill = new DirectionalLight('#8db6ff', 1.5);
    fill.position.set(12, 6, 14); scene.add(fill);
    const cube = new BoxGeometry(1, 1, 1);
    const shape = new Shape();
    const r = .045, a = -.46, b = .46;
    shape.moveTo(a + r, a); shape.lineTo(b - r, a); shape.quadraticCurveTo(b, a, b, a + r);
    shape.lineTo(b, b - r); shape.quadraticCurveTo(b, b, b - r, b);
    shape.lineTo(a + r, b); shape.quadraticCurveTo(a, b, a, b - r);
    shape.lineTo(a, a + r); shape.quadraticCurveTo(a, a, a + r, a);
    const plotGeometry = new ExtrudeGeometry(shape, { depth: .045, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .012, bevelThickness: .012, curveSegments: 3 });
    const materials = new Map<string, MeshStandardMaterial>();
    const material = (color: string, glow = false) => {
      const key = `${color}:${glow}`;
      let result = materials.get(key);
      if (!result) {
        result = new MeshStandardMaterial({ color, roughness: .48, metalness: .12,
          emissive: glow ? color : '#000000', emissiveIntensity: glow ? .22 : 0 });
        materials.set(key, result);
      }
      return result;
    };
    const box = (parent: Group, color: string, x: number, y: number, z: number, w: number, d: number, h: number, glow = false) => {
      const mesh = new Mesh(cube, material(color, glow));
      mesh.position.set(x, y, z); mesh.scale.set(w, d, h); parent.add(mesh); return mesh;
    };
    const hotel = (tile: CityTile) => {
      const piece = new Group();
      const color = tile.color || '#e8e4d7';
      const style = Math.max(0, tile.model ?? 0) % 4;
      // Four silhouettes distinguish chain pieces even without their color.
      const height = tile.color ? [.63, .78, .58, .72][style] : .3;
      box(piece, color, 0, .055, .11, .62, .58, .1);
      box(piece, color, 0, .075, .16 + height / 2, .46, .42, height);
      box(piece, color, 0, .075, height + .185, .53, .48, .07);
      if (tile.color && style === 1) {
        box(piece, color, 0, .075, height + .29, .29, .27, .16);
        box(piece, '#f4cd80', 0, .075, height + .39, .16, .15, .05);
      } else if (tile.color && style === 2) {
        box(piece, color, -.19, .06, .48, .16, .46, .6);
        box(piece, color, .19, .06, .48, .16, .46, .6);
      } else if (tile.color && style === 3) {
        box(piece, color, 0, .075, height + .27, .36, .32, .12);
      }
      // A hotel sign, window bands and a dark entrance read as hotel pieces.
      box(piece, '#182a3e', 0, -.143, .24, .095, .018, .18);
      const floors = tile.color ? 3 : 1;
      for (let floor = 0; floor < floors; floor++) {
        const z = .34 + floor * (height - .18) / 3;
        for (const x of [-.15, .15]) box(piece, '#ffdf96', x, -.142, z, .065, .016, .072, true);
        for (const y of [-.04, .12]) box(piece, '#b6d9ee', .237, y, z, .014, .064, .072);
      }
      if (tile.color) box(piece, '#f4edd9', 0, -.153, height + .1, .27, .025, .075);
      return piece;
    };
    let city = new Group(); scene.add(city);
    const batches: InstancedMesh[] = [];
    // Shared GPU batches keep a populated expansion city inexpensive to draw.
    // Animated hotels remain separate until their placement animation finishes.
    const batchStatic = (animated: Set<Group>) => {
      city.updateMatrixWorld(true);
      const groups = new Map<string, Mesh[]>();
      city.traverse(object => {
        if (!(object instanceof Mesh) || object instanceof InstancedMesh || object.userData.highlight) return;
        for (let parent = object.parent; parent; parent = parent.parent) if (animated.has(parent as Group)) return;
        const key = `${object.geometry.uuid}:${(object.material as MeshStandardMaterial).uuid}`;
        const group = groups.get(key) ?? []; group.push(object); groups.set(key, group);
      });
      groups.forEach(meshes => {
        const batch = new InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
        meshes.forEach((mesh, i) => { batch.setMatrixAt(i, mesh.matrixWorld); mesh.removeFromParent(); });
        batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere();
        city.add(batch); batches.push(batch);
      });
    };
    let previous = new Map<string, string>();
    let ready = false, lost = false, layoutKey = '';
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const render = () => { if (!lost && !document.hidden) renderer.render(scene, camera); };
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let targets: Mesh[] = [];
    let hover: Mesh | undefined;
    const clearHover = () => {
      if (!hover) return;
      hover.visible = false; hover = undefined; render();
    };
    const board = host.parentElement!;
    const move = (event: PointerEvent) => {
      if (diorama || lost || event.pointerType === 'touch' || event.buttons) return;
      const bounds = element.getBoundingClientRect();
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(targets, false)[0]?.object as Mesh | undefined;
      const ring = hit?.userData.hover as Mesh | undefined;
      if (ring === hover) return;
      if (hover) hover.visible = false;
      hover = ring;
      if (hover) hover.visible = true;
      render();
    };
    const update = () => {
      if (lost) return;
      const { tiles: cells, columns: cols, rows: rowCount, incline } = state.current;
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      renderer.setAnimationLoop(null);
      renderer.setSize(width, height, false);
      batches.forEach(batch => batch.dispose()); batches.length = 0;
      scene.remove(city); city = new Group(); scene.add(city); targets = []; hover = undefined;
      const animations: { group: Group; delay: number }[] = [];
      const next = new Map<string, string>();
      camera.up.set(0, 0, 1);
      camera.position.set(diorama ? 17 : 0, diorama ? -23 : -incline, diorama ? 26 : 30);
      camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      // Fit the actual camera-space board bounds, including the hotel skyline.
      const corners: Vector3[] = [];
      for (const x of [-cols / 2 - .2, cols / 2 + .2])
        for (const y of [-rowCount / 2 - .2, rowCount / 2 + .2])
          for (const z of [-.28, diorama ? 1.3 : 1.1]) corners.push(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
      const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
      const aspect = width / height;
      const span = Math.max(maxY - minY, (maxX - minX) / aspect) * (diorama ? 1.09 : 1.015);
      const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
      camera.left = centerX - span * aspect / 2; camera.right = centerX + span * aspect / 2;
      camera.top = centerY + span / 2; camera.bottom = centerY - span / 2;
      camera.updateProjectionMatrix();
      // Anchor the number row to the brass edge. Only actual hotels along that
      // edge need extra clearance, rather than an empty, maximum-height skyline.
      const topEdge = new Vector3(0, rowCount / 2 + .1, .06).project(camera);
      let columnLabelTop = (1 - topEdge.y) * height / 2 - 14;
      box(city, '#0e1728', 0, 0, -.21, cols + .35, rowCount + .35, .4);
      box(city, '#516274', 0, 0, -.023, cols + .25, rowCount + .25, .06);
      box(city, '#172c3d', 0, 0, .007, cols + .1, rowCount + .1, .04);
      // A brass edge makes the slab feel like a physical Acquire table.
      for (const y of [-rowCount / 2 - .1, rowCount / 2 + .1]) box(city, '#b2935a', 0, y, .047, cols + .19, .018, .023);
      for (const x of [-cols / 2 - .1, cols / 2 + .1]) box(city, '#b2935a', x, 0, .047, .018, rowCount + .2, .023);
      const layout: CityTileLayout[] = [];
      cells.forEach((tile, i) => {
        const column = i % cols, row = Math.floor(i / cols);
        const x = column - (cols - 1) / 2, y = (rowCount - 1) / 2 - row;
        // Ground polygons are projected independently of any hotel above them.
        const points = [[-.46, .46], [.46, .46], [.46, -.46], [-.46, -.46]].map(([dx, dy]) => {
          const point = new Vector3(x + dx, y + dy, .08).project(camera);
          return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
        });
        const left = Math.min(...points.map(p => p.x)), top = Math.min(...points.map(p => p.y));
        const w = Math.max(...points.map(p => p.x)) - left, h = Math.max(...points.map(p => p.y)) - top;
        layout.push({ id: tile.id, left, top, width: w, height: h, columnLabelTop,
          clipPath: `polygon(${points.map(p => `${(p.x - left) / w * 100}% ${(p.y - top) / h * 100}%`).join(',')})` });
        if (tile.void) return;
        const cell = new Group(); cell.position.set(x, y, .04); city.add(cell);
        const plateColor = tile.selected ? '#e4b654' : tile.inHand ? '#4cbaa3' : tile.occupied ? tile.color ? new Color(tile.color).lerp(new Color('#162537'), .35).getStyle() : '#7d898b' : '#243c4c';
        const plate = new Mesh(plotGeometry, material(plateColor, tile.inHand || tile.selected)); cell.add(plate); targets.push(plate);
        const ring = new Mesh(plotGeometry, material('#9fe8d0', true));
        ring.position.z = .004; ring.scale.set(.93, .93, 1); ring.visible = false;
        ring.userData.highlight = true;
        cell.add(ring); plate.userData.hover = ring;
        // Subtle street intersections break up the empty board without tile art.
        if (!tile.occupied && !tile.inHand && !tile.selected) box(cell, '#455c66', 0, .29, .058, .035, .035, .005);
        if (tile.occupied || tile.selected) {
          const piece = hotel(tile.selected && !tile.occupied ? { ...tile, color: '#eac166' } : tile);
          cell.add(piece);
          if (row === 0) {
            piece.updateWorldMatrix(true, true);
            const bounds = new Box3().setFromObject(piece);
            for (const x of [bounds.min.x, bounds.max.x])
              for (const y of [bounds.min.y, bounds.max.y])
                for (const z of [bounds.min.z, bounds.max.z]) {
                  const roof = new Vector3(x, y, z).project(camera);
                  columnLabelTop = Math.min(columnLabelTop, (1 - roof.y) * height / 2 - 12);
                }
          }
          const signature = tile.color || 'independent';
          if (tile.occupied) {
            if (previous.size && previous.get(tile.id) !== signature && !motion.matches) animations.push({ group: piece, delay: Math.min(animations.length * 24, 140) });
            next.set(tile.id, signature);
          }
        }
      });
      layout.forEach(tile => { tile.columnLabelTop = columnLabelTop; });
      previous = next;
      animations.forEach(({ group }) => { group.scale.z = .03; });
      batchStatic(new Set(animations.map(animation => animation.group)));
      const key = `${width}:${height}:${incline}:${cols}:${rowCount}:${columnLabelTop}:${cells.map(t => t.id).join(',')}`;
      if (!diorama && key !== layoutKey) { layoutKey = key; state.current.onLayout?.(layout); }
      render();
      if (!ready) { ready = true; state.current.onReady?.(); }
      if (animations.length && !document.hidden) {
        const start = performance.now();
        renderer.setAnimationLoop(() => {
          const elapsed = performance.now() - start;
          for (const { group, delay } of animations) {
            const progress = Math.max(0, Math.min(1, (elapsed - delay) / 430));
            group.scale.z = .03 + .97 * (1 - Math.pow(1 - progress, 3));
          }
          render();
          if (elapsed > 600 || document.hidden || motion.matches) {
            animations.forEach(({ group }) => { group.scale.z = 1; });
            batchStatic(new Set()); renderer.setAnimationLoop(null); render();
          }
        });
      }
    };
    redraw.current = update;
    const resize = new ResizeObserver(update); resize.observe(element);
    const onLost = (event: Event) => { event.preventDefault(); lost = true; renderer.setAnimationLoop(null); ready = false; layoutKey = ''; state.current.onUnavailable?.(); };
    const onRestored = () => { lost = false; update(); };
    const visibility = () => { if (document.hidden) renderer.setAnimationLoop(null); else update(); };
    element.addEventListener('webglcontextlost', onLost);
    element.addEventListener('webglcontextrestored', onRestored);
    board.addEventListener('pointermove', move); board.addEventListener('pointerleave', clearHover);
    document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', update);
    update();
    return () => {
      redraw.current = null; resize.disconnect(); renderer.setAnimationLoop(null);
      element.removeEventListener('webglcontextlost', onLost); element.removeEventListener('webglcontextrestored', onRestored);
      board.removeEventListener('pointermove', move); board.removeEventListener('pointerleave', clearHover);
      document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', update);
      batches.forEach(batch => batch.dispose());
      cube.dispose(); plotGeometry.dispose(); materials.forEach(value => value.dispose());
      renderer.dispose(); renderer.forceContextLoss(); element.remove();
    };
  }, [diorama]);
  useEffect(() => { redraw.current?.(); }, [tiles, columns, rows, incline]);
  return <div className="city-canvas" ref={hostRef} aria-hidden="true" />;
}

import { useEffect, useRef } from 'react';
import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, ExtrudeGeometry, Group,
  Mesh, MeshStandardMaterial, OrthographicCamera, Scene, Shape, WebGLRenderer,
  type Material,
} from 'three';

export interface CityTile {
  id: string;
  color?: string;
  occupied?: boolean;
  selected?: boolean;
  inHand?: boolean;
  void?: boolean;
}
interface Props {
  tiles: CityTile[];
  columns: number;
  rows: number;
  diorama?: boolean;
  onReady?: () => void;
  onUnavailable?: () => void;
}

// Only the scenery lives in WebGL. The live board keeps its native, labelled
// buttons above the canvas, so mouse, keyboard and assistive input share a path.
export default function CityScene({ tiles, columns, rows, diorama = false, onReady, onUnavailable }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const state = useRef({ tiles, columns, rows, onReady, onUnavailable });
  state.current = { tiles, columns, rows, onReady, onUnavailable };
  const redraw = useRef<(() => void) | null>(null);
  useEffect(() => {
    const host = canvas.current;
    if (!host) return;
    // A fresh canvas also supports React Strict Mode's setup/cleanup/setup cycle;
    // a canvas whose context was released must not be reused by the next renderer.
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
      element.remove(); state.current.onUnavailable?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 2000);
    scene.add(new AmbientLight(0xffffff, 1.7));
    const sun = new DirectionalLight(0xfff2d7, 2.6);
    sun.position.set(-10, 8, 25);
    scene.add(sun);
    const fill = new DirectionalLight(0x93d8ef, 1.2);
    fill.position.set(10, -6, 10);
    scene.add(fill);
    const cube = new BoxGeometry(1, 1, 1);
    const shape = new Shape();
    const r = .06, a = -.45, b = .45;
    shape.moveTo(a + r, a); shape.lineTo(b - r, a); shape.quadraticCurveTo(b, a, b, a + r);
    shape.lineTo(b, b - r); shape.quadraticCurveTo(b, b, b - r, b);
    shape.lineTo(a + r, b); shape.quadraticCurveTo(a, b, a, b - r);
    shape.lineTo(a, a + r); shape.quadraticCurveTo(a, a, a + r, a);
    const tileGeometry = new ExtrudeGeometry(shape, { depth: .07, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .015, bevelThickness: .015, curveSegments: 3 });
    const materials = new Map<string, MeshStandardMaterial>();
    const material = (color: string) => {
      let result = materials.get(color);
      if (!result) { result = new MeshStandardMaterial({ color, roughness: .7, metalness: .08 }); materials.set(color, result); }
      return result;
    };
    const box = (parent: Group, color: string, x: number, y: number, z: number, w: number, d: number, h: number) => {
      const mesh = new Mesh(cube, material(color));
      mesh.position.set(x, y, z); mesh.scale.set(w, d, h); parent.add(mesh);
      return mesh;
    };
    let city = new Group(); scene.add(city);
    let previous = new Map<string, string>();
    let ready = false, lost = false;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const render = () => { if (!lost && !document.hidden) renderer.render(scene, camera); };
    const update = () => {
      if (lost) return;
      const { tiles: cells, columns: cols, rows: rowCount } = state.current;
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      renderer.setAnimationLoop(null);
      renderer.setSize(width, height, false);
      scene.remove(city); city = new Group(); scene.add(city);
      const animations: { group: Group; delay: number }[] = [];
      const next = new Map<string, string>();
      if (diorama) {
        const aspect = width / height, span = Math.max(cols * 1.27, rowCount * 1.27, cols / aspect * 1.5);
        camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
        camera.top = span / 2; camera.bottom = -span / 2;
        camera.up.set(0, 0, 1); camera.position.set(16, -21, 24); camera.lookAt(0, 0, .5);
        box(city, '#163b48', 0, 0, -.32, cols + .6, rowCount + .6, .6);
        box(city, '#3c7f85', 0, 0, -.07, cols + .38, rowCount + .38, .12);
      } else {
        // Match the CSS grid's 2px padding, 1px border and 1px gap exactly.
        camera.left = -width / 2; camera.right = width / 2;
        camera.top = height / 2; camera.bottom = -height / 2;
        camera.up.set(0, 1, 0); camera.position.set(0, 0, 1000); camera.lookAt(0, 0, 0);
      }
      camera.updateProjectionMatrix();
      const cellWidth = (width - 6 - (cols - 1)) / cols;
      const cellHeight = (height - 6 - (rowCount - 1)) / rowCount;
      cells.forEach((tile, i) => {
        if (tile.void) return;
        const cell = new Group();
        const column = i % cols, row = Math.floor(i / cols);
        if (diorama) cell.position.set(column - (cols - 1) / 2, (rowCount - 1) / 2 - row, 0);
        else {
          cell.position.set(3 + column * (cellWidth + 1) + cellWidth / 2 - width / 2, height / 2 - 3 - row * (cellHeight + 1) - cellHeight / 2, 0);
          cell.scale.set(cellWidth / .94, cellHeight / .94, Math.min(cellWidth, cellHeight) / .94);
        }
        const baseColor = tile.selected ? '#ffce70' : tile.inHand ? '#68ccb9' : tile.color ? new Color(tile.color).lerp(new Color('#fff6d9'), .38).getStyle() : tile.occupied ? '#e0d1ad' : '#668b8c';
        cell.add(new Mesh(tileGeometry, material(baseColor)));
        if (tile.occupied) {
          const building = new Group();
          // In play, each miniature is angled independently to preserve exact
          // hit targets and coordinates while showing its roof and two facades.
          if (!diorama) {
            building.rotation.set(-.85, -.4, -.3);
            const shortest = Math.min(cellWidth, cellHeight);
            building.scale.set(.76 * shortest / cellWidth, .76 * shortest / cellHeight, .76);
            building.position.set(.02, -.1, .2);
          }
          const tall = tile.color ? .48 + (i % 3) * .15 : .32;
          const color = tile.color || '#9b805f';
          box(building, color, 0, 0, tall / 2 + .09, .48, .44, tall);
          box(building, '#f5ebca', 0, 0, tall + .11, .54, .5, .06);
          box(building, color, 0, .025, tall + .19, .25, .26, .12);
          for (let floor = 0; floor < (tile.color ? 3 : 1); floor++) {
            const z = .19 + floor * (tall - .15) / 3;
            for (const x of [-.135, .035]) box(building, '#fdf4cf', x, -.226, z, .075, .016, .075);
            for (const y of [-.12, .05]) box(building, '#a9dfe1', .246, y, z, .016, .065, .075);
          }
          cell.add(building);
          const signature = tile.color || 'independent';
          if (previous.size && previous.get(tile.id) !== signature && !motion.matches) animations.push({ group: building, delay: Math.min(animations.length * 28, 180) });
          next.set(tile.id, signature);
        }
        city.add(cell);
      });
      previous = next;
      render();
      if (!ready) { ready = true; state.current.onReady?.(); }
      if (animations.length && !document.hidden) {
        const start = performance.now();
        renderer.setAnimationLoop(() => {
          const elapsed = performance.now() - start;
          for (const { group, delay } of animations) {
            const progress = Math.max(0, Math.min(1, (elapsed - delay) / 500));
            const ease = 1 - Math.pow(1 - progress, 3);
            group.scale.z = (diorama ? 1 : .76) * (.05 + .95 * ease);
          }
          render();
          if (elapsed > 700 || document.hidden || motion.matches) {
            animations.forEach(({ group }) => { group.scale.z = diorama ? 1 : .76; });
            renderer.setAnimationLoop(null); render();
          }
        });
      }
    };
    redraw.current = update;
    const resize = new ResizeObserver(update); resize.observe(element);
    const onLost = (event: Event) => { event.preventDefault(); lost = true; renderer.setAnimationLoop(null); ready = false; state.current.onUnavailable?.(); };
    const onRestored = () => { lost = false; update(); };
    const visibility = () => { if (document.hidden) renderer.setAnimationLoop(null); else update(); };
    element.addEventListener('webglcontextlost', onLost);
    element.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', update);
    update();
    return () => {
      redraw.current = null; resize.disconnect(); renderer.setAnimationLoop(null);
      element.removeEventListener('webglcontextlost', onLost); element.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', update);
      cube.dispose(); tileGeometry.dispose(); materials.forEach((value: Material) => value.dispose());
      renderer.dispose(); renderer.forceContextLoss(); element.remove();
    };
  }, [diorama]);
  useEffect(() => { redraw.current?.(); }, [tiles, columns, rows]);
  return <div className="city-canvas" ref={canvas} aria-hidden="true" />;
}

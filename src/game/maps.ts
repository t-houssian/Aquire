import type { MapId, Tile } from './types.ts';

export interface MapPalette {
  name: string;
  canvas: string;
  frame: string;
  tile: string;
  accent: string;
  ink: string;
  void: string;
}
export interface MapDefinition {
  id: MapId;
  name: string;
  description: string;
  tiles: Tile[];
  gridTiles: Tile[];
  columns: number;
  rows: number;
  maxPlayers: number;
  endSize: number;
  feature: string;
  palette: MapPalette;
}

const tile = (column: number, row: number) => `${column + 1}${String.fromCharCode(65 + row)}`;
const makeSizedMap = (
  id: MapId, name: string, description: string, feature: string, palette: MapPalette,
  columns: number, rows: number, maxPlayers: number, endSize: number,
  include: (c: number, r: number) => boolean,
): MapDefinition => {
  if (columns < 1 || columns > 99 || rows < 1 || rows > 26)
    throw new Error(`Invalid dimensions for ${id}`);
  const gridTiles = Array.from({ length: columns * rows }, (_, i) => tile(i % columns, Math.floor(i / columns)));
  return {
    id, name, description, feature, palette, columns, rows, maxPlayers, endSize, gridTiles,
    tiles: gridTiles.filter((coordinate) => {
      const column = Number(coordinate.slice(0, -1)) - 1;
      const row = coordinate.charCodeAt(coordinate.length - 1) - 65;
      return include(column, row);
    }),
  };
};
const makeMap = (
  id: MapId, name: string, description: string, feature: string, palette: MapPalette,
  include: (c: number, r: number) => boolean,
): MapDefinition => makeSizedMap(id, name, description, feature, palette, 12, 9, 6, 41, include);
/** Each # is one physical tile. Dots are absent from both the bag and the board. */
const shaped = (
  id: MapId, name: string, description: string, feature: string, palette: MapPalette,
  rows: readonly string[], maxPlayers = 6, endSize = 41,
) => {
  const columns = rows[0]?.length ?? 0;
  if (!columns || !rows.length || rows.some((row) => row.length !== columns || /[^#.]/.test(row)))
    throw new Error(`Invalid footprint for ${id}`);
  return makeSizedMap(id, name, description, feature, palette, columns, rows.length, maxPlayers, endSize, (c, r) => rows[r][c] === '#');
};

/** Printed rules remain the default; larger custom tables extend the tile grid and seat limit. */
export const MAPS: MapDefinition[] = [
  makeMap('classic', 'The Classic', 'The complete 2008 board.', 'The original city',
    { name: 'Sage & stone', canvas: '#f1f4e9', frame: '#e0e6d6', tile: '#f8f9f0', accent: '#69934b', ink: '#456144', void: '#edf1e6' }, () => true),
  shaped('duo-pocket-square', 'Pocket Square', 'A tiny city with nowhere to hide. Build a first hotel and contest every corner.', 'A compact classic',
    { name: 'Pocket linen', canvas: '#f8f0ec', frame: '#e2cfc5', tile: '#fdfbfa', accent: '#8e5739', ink: '#5b4133', void: '#d0ad9a' }, [
      '######', '######', '######',
      '######', '######', '######',
    ], 2, 21),
  shaped('duo-teacup-court', 'Teacup Court', 'Two investors circle a tiny tea garden. Both paths lead back to the same contest.', 'A little central court',
    { name: 'Porcelain tea', canvas: '#ecf8f4', frame: '#c5e2d8', tile: '#fafdfc', accent: '#398e70', ink: '#335b4d', void: '#9ad0bd' }, [
      '#######', '#######', '##...##',
      '##...##', '#######', '#######',
    ], 2, 21),
  shaped('duo-button-bay', 'Button Bay', 'Clipped corners turn a seaside pocket into a quick contest for the center.', 'Clipped seaside corners',
    { name: 'Blue buttons', canvas: '#f8ecf8', frame: '#e0c5e2', tile: '#fdfafd', accent: '#89398e', ink: '#59335b', void: '#cd9ad0' }, [
      '.######.', '########', '########',
      '########', '.######.',
    ], 2, 21),
  shaped('duo-sugar-steps', 'Sugar Steps', 'Two offset terraces climb across a narrow candy-colored city.', 'Stepped terraces',
    { name: 'Sugar apricot', canvas: '#f6f8ec', frame: '#dce2c5', tile: '#fcfdfa', accent: '#7b8e39', ink: '#525b33', void: '#c4d09a' }, [
      '####......', '######....', '##########',
      '....######', '......####',
    ], 2, 21),
  shaped('duo-moon-lock', 'Moon Lock', 'Claim the ends of a little moonlit lock before the middle changes hands.', 'Two rooms and a crossing',
    { name: 'Silver keyhole', canvas: '#ecf2f8', frame: '#c5d3e2', tile: '#fafbfd', accent: '#39628e', ink: '#33475b', void: '#9ab4d0' }, [
      '###..###', '###..###', '########',
      '########', '###..###', '###..###',
    ], 2, 21),
  shaped('duo-matchbox', 'The Matchbox', 'A long, shallow city makes each neighboring tile count.', 'A narrow classic',
    { name: 'Matchbox red', canvas: '#f8ecee', frame: '#e2c5cb', tile: '#fdfafb', accent: '#8e3949', ink: '#5b333b', void: '#d09aa4' }, [
      '#########', '#########', '#########',
      '#########',
    ], 2, 21),
  shaped('duo-fern-path', 'Fern Path', 'A tall garden path widens at the middle and tapers at both ends.', 'Tapered garden path',
    { name: 'Fern velvet', canvas: '#ecf8ed', frame: '#c5e2c8', tile: '#fafdfa', accent: '#398e41', ink: '#335b37', void: '#9ad09f' }, [
      '.###.', '#####', '#####',
      '#####', '#####', '#####',
      '#####', '#####', '.###.',
    ], 2, 21),
  shaped('duo-biscuit-ring', 'Biscuit Ring', 'A hollow biscuit-shaped city invites a race around the outside.', 'Small hollow ring',
    { name: 'Biscuit cream', canvas: '#f1ecf8', frame: '#d1c5e2', tile: '#fbfafd', accent: '#5a398e', ink: '#43335b', void: '#af9ad0' }, [
      '#######', '#######', '##...##',
      '##...##', '##...##', '#######',
      '#######',
    ], 2, 21),
  shaped('duo-koi-crossing', 'Koi Crossing', 'Two quiet shores meet on a broad crossing over the pond.', 'Twin pond shores',
    { name: 'Koi pond', canvas: '#f8f5ec', frame: '#e2d9c5', tile: '#fdfcfa', accent: '#8e7339', ink: '#5b4f33', void: '#d0bf9a' }, [
      '###...###', '#########', '#########',
      '#########', '###...###',
    ], 2, 21),
  shaped('duo-starlight-kite', 'Starlight Kite', 'A little diamond skyline puts long approaches around a busy heart.', 'Tall city kite',
    { name: 'Starlight ink', canvas: '#ecf8f8', frame: '#c5e2e1', tile: '#fafdfd', accent: '#398e8c', ink: '#335b5a', void: '#9ad0cf' }, [
      '...#...', '..###..', '.#####.',
      '#######', '#######', '#######',
      '.#####.', '..###..', '...#...',
    ], 2, 21),
  shaped('duo-coral-comb', 'Coral Comb', 'Four short reef fingers branch off a narrow central lane.', 'Four reef fingers',
    { name: 'Coral sherbet', canvas: '#f8ecf5', frame: '#e2c5da', tile: '#fdfafc', accent: '#8e3977', ink: '#5b3351', void: '#d09ac2' }, [
      '.##....##.', '.##....##.', '##########',
      '##########', '.##....##.', '.##....##.',
    ], 2, 21),
  shaped('duo-lemon-bow', 'Lemon Bow', 'Two little districts draw together at a two-column bow.', 'A tiny bow tie',
    { name: 'Lemon ribbon', canvas: '#f2f8ec', frame: '#d2e2c5', tile: '#fbfdfa', accent: '#5e8e39', ink: '#455b33', void: '#b2d09a' }, [
      '###...###', '###...###', '#########',
      '#########', '###...###', '###...###',
    ], 2, 21),
  shaped('duo-velvet-rail', 'Velvet Rail', 'Two sheltered station ends sit along a long two-track boulevard.', 'Pocket railway',
    { name: 'Velvet plum', canvas: '#eceef8', frame: '#c5cae2', tile: '#fafafd', accent: '#39458e', ink: '#33395b', void: '#9aa2d0' }, [
      '###.....###', '###########', '###########',
      '###.....###',
    ], 2, 21),
  shaped('duo-pebble-isle', 'Pebble Isle', 'Four small bays shape a bright island with room for one decisive meeting.', 'Four-corner island bays',
    { name: 'Pebble seafoam', canvas: '#f8eeec', frame: '#e2c9c5', tile: '#fdfafa', accent: '#8e4539', ink: '#5b3933', void: '#d0a29a' }, [
      '..####..', '..####..', '########',
      '########', '########', '..####..',
      '..####..',
    ], 2, 21),
  shaped('duo-jellybean', 'Jellybean', 'A slender city bends gently around opposite corners.', 'Curved pocket skyline',
    { name: 'Blackcurrant fizz', canvas: '#ecf8f1', frame: '#c5e2d2', tile: '#fafdfb', accent: '#398e5e', ink: '#335b45', void: '#9ad0b2' }, [
      '..###', '..###', '#####',
      '#####', '#####', '#####',
      '#####', '#####', '###..',
      '###..',
    ], 2, 21),
  shaped('four-market-square', 'Market Square', 'Four investors share a modest rectangular city. A familiar place to learn an unfamiliar rival.', 'A neighborhood classic',
    { name: 'Market morning', canvas: '#f5ecf8', frame: '#dac5e2', tile: '#fcfafd', accent: '#77398e', ink: '#50335b', void: '#c19ad0' }, [
      '#########', '#########', '#########',
      '#########', '#########', '#########',
      '#########', '#########',
    ], 4, 31),
  shaped('four-amber-court', 'Amber Court', 'A sunlit central courtyard splits the routes through this compact city.', 'Sunlit central courtyard',
    { name: 'Amber conservatory', canvas: '#f8f8ec', frame: '#e1e2c5', tile: '#fdfdfa', accent: '#8d8e39', ink: '#5b5b33', void: '#cfd09a' }, [
      '#########', '#########', '#########',
      '###...###', '###...###', '###...###',
      '#########', '#########', '#########',
    ], 4, 31),
  shaped('four-sailmakers', 'Sailmakers Wharf', 'Four little corner bays shape a long trading wharf.', 'Clipped trading wharf',
    { name: 'Sailcloth blue', canvas: '#ecf5f8', frame: '#c5d9e2', tile: '#fafcfd', accent: '#39748e', ink: '#334f5b', void: '#9abfd0' }, [
      '..########..', '..########..', '############',
      '############', '############', '..########..',
      '..########..',
    ], 4, 31),
  shaped('four-paper-lantern', 'Paper Lantern', 'A tall lantern city narrows at either tip, inviting careful vertical expansion.', 'Tall lantern silhouette',
    { name: 'Lantern blush', canvas: '#f8ecf1', frame: '#e2c5d1', tile: '#fdfafb', accent: '#8e395b', ink: '#5b3343', void: '#d09aaf' }, [
      '..###..', '.#####.', '.#####.',
      '#######', '#######', '#######',
      '#######', '#######', '#######',
      '#######', '.#####.', '.#####.',
      '..###..',
    ], 4, 31),
  shaped('four-crescent-pier', 'Crescent Pier', 'Two broad docks connect through a slim middle passage. Pick which waterfront to back.', 'Compact twin docks',
    { name: 'Crescent tide', canvas: '#edf8ec', frame: '#c8e2c5', tile: '#fafdfa', accent: '#428e39', ink: '#385b33', void: '#9fd09a' }, [
      '####.....####', '####.....####', '#############',
      '#############', '####.....####', '####.....####',
    ], 4, 31),
  shaped('four-foxglove', 'Foxglove', 'A clipped flower skyline brings four districts together around one crowded heart.', 'Flower-shaped neighborhood',
    { name: 'Foxglove mauve', canvas: '#eeecf8', frame: '#cbc5e2', tile: '#fafafd', accent: '#49398e', ink: '#3b335b', void: '#a49ad0' }, [
      '....###....', '...#####...', '..#######..',
      '.#########.', '###########', '.#########.',
      '..#######..', '...#####...', '....###....',
    ], 4, 31),
  shaped('four-copper-coil', 'Copper Coil', 'A two-tile-wide coil sends rival chains around the edges of a silent square.', 'Thin square loop',
    { name: 'Copper patina', canvas: '#f8f2ec', frame: '#e2d3c5', tile: '#fdfbfa', accent: '#8e6239', ink: '#5b4733', void: '#d0b49a' }, [
      '##########', '##########', '##......##',
      '##......##', '##......##', '##......##',
      '##......##', '##......##', '##########',
      '##########',
    ], 4, 31),
  shaped('four-blue-hour', 'Blue Hour', 'An offset promenade steps from the morning district into the evening district.', 'Stepped blue promenade',
    { name: 'Twilight cobalt', canvas: '#ecf8f6', frame: '#c5e2db', tile: '#fafdfc', accent: '#398e7b', ink: '#335b52', void: '#9ad0c4' }, [
      '#####.........', '#########.....', '##############',
      '##############', '.....#########', '.........#####',
    ], 4, 31),
  shaped('four-honey-arcade', 'Honey Arcade', 'Twin arcades sit beside a shared alley, with corner plazas opening the edges.', 'Two little arcades',
    { name: 'Honey glaze', canvas: '#f8ecf8', frame: '#e2c5e0', tile: '#fdfafd', accent: '#8e3989', ink: '#5b3359', void: '#d09acd' }, [
      '..########..', '..########..', '############',
      '##...##...##', '##...##...##', '############',
      '..########..', '..########..',
    ], 4, 31),
  shaped('four-pistachio-park', 'Pistachio Park', 'A narrow park divides an upright city between two looping paths.', 'Upright park loop',
    { name: 'Pistachio cream', canvas: '#f4f8ec', frame: '#d8e2c5', tile: '#fcfdfa', accent: '#708e39', ink: '#4d5b33', void: '#bdd09a' }, [
      '..####..', '..####..', '########',
      '###..###', '###..###', '###..###',
      '###..###', '########', '..####..',
      '..####..',
    ], 4, 31),
  shaped('four-vinyl-club', 'Vinyl Club', 'A bright record-shaped city circles a small open stage.', 'Record and center stage',
    { name: 'Vinyl burgundy', canvas: '#ecf0f8', frame: '#c5d0e2', tile: '#fafbfd', accent: '#39578e', ink: '#33425b', void: '#9aadd0' }, [
      '..#######..', '.#########.', '###########',
      '####...####', '###########', '.#########.',
      '..#######..',
    ], 4, 31),
  shaped('four-tulip-terminal', 'Tulip Terminal', 'A narrow north-south city fans out around a wide central terminal.', 'Tall stem, broad terminal',
    { name: 'Tulip terracotta', canvas: '#f8eced', frame: '#e2c5c7', tile: '#fdfafa', accent: '#8e393e', ink: '#5b3336', void: '#d09a9d' }, [
      '..#####..', '..#####..', '..#####..',
      '..#####..', '#########', '#########',
      '#########', '..#####..', '..#####..',
      '..#####..', '..#####..',
    ], 4, 31),
  shaped('four-kite-festival', 'Kite Festival', 'Two opposing kites meet at a short string of central tiles.', 'Paired city kites',
    { name: 'Festival ribbons', canvas: '#ecf8ef', frame: '#c5e2cc', tile: '#fafdfb', accent: '#398e4c', ink: '#335b3d', void: '#9ad0a6' }, [
      '...#.....#...', '..###...###..', '.###########.',
      '#############', '.###########.', '..###...###..',
      '...#.....#...',
    ], 4, 31),
  shaped('four-snowglobe', 'Snowglobe', 'A little frosted dome opens around a central viewing garden.', 'Rounded winter garden',
    { name: 'Snowglobe frost', canvas: '#f2ecf8', frame: '#d4c5e2', tile: '#fbfafd', accent: '#65398e', ink: '#48335b', void: '#b69ad0' }, [
      '..######..', '..######..', '##########',
      '####..####', '####..####', '####..####',
      '##########', '..######..', '..######..',
    ], 4, 31),
  shaped('four-rooftop-radio', 'Rooftop Radio', 'A long neighborhood has four small aerials reaching into the skyline.', 'Four rooftop aerials',
    { name: 'Radio mint', canvas: '#f8f6ec', frame: '#e2ddc5', tile: '#fdfcfa', accent: '#8e7e39', ink: '#5b5433', void: '#d0c69a' }, [
      '..###.....###..', '###############', '###############',
      '###############', '..###.....###..',
    ], 4, 31),
  makeMap('corner-plazas', 'Corner Plazas', 'Four open plazas push growth toward the center.', 'Open corners',
    { name: 'Rose garden', canvas: '#fff0ed', frame: '#efdad8', tile: '#fff9f6', accent: '#a95b72', ink: '#633e50', void: '#f5d7d6' },
    (c, r) => !((c < 2 || c > 9) && (r < 2 || r > 6))),
  makeMap('riverwalk', 'Riverwalk', 'Two waterfront promenades narrow the middle.', 'Side channels',
    { name: 'Blue harbor', canvas: '#e8f5f6', frame: '#cde4e9', tile: '#f5fcfb', accent: '#397f9a', ink: '#31546a', void: '#b2d7e4' },
    (c, r) => !((c < 2 || c > 9) && r >= 3 && r <= 5)),
  makeMap('grand-avenue', 'Grand Avenue', 'A broad north–south corridor opens the edges.', 'Open gateways',
    { name: 'Slate boulevard', canvas: '#e8edf2', frame: '#cdd9e3', tile: '#f8fafb', accent: '#526d91', ink: '#344a64', void: '#b3c5d7' },
    (c, r) => !((r === 0 || r === 8) && c >= 4 && c <= 7)),
  makeMap('courtyard', 'The Courtyard', 'A central plaza changes how chains meet.', 'Central plaza',
    { name: 'Golden garden', canvas: '#f9f1dc', frame: '#ebdcaf', tile: '#fffdf5', accent: '#9c7535', ink: '#67542f', void: '#e3ca89' },
    (c, r) => !(c >= 5 && c <= 6 && r >= 3 && r <= 5)),
  makeMap('peninsulas', 'Peninsulas', 'Narrow northern and southern approaches favor careful mergers.', 'Tapered ends',
    { name: 'Sea glass', canvas: '#e9f4ef', frame: '#cfe3dc', tile: '#f8fcf9', accent: '#428775', ink: '#345f56', void: '#a9d4cb' },
    (c, r) => !((r === 0 || r === 8) && (c < 3 || c > 8))),
  shaped('hourglass', 'The Hourglass', 'Two generous districts meet at a four-tile waist. A merger at the neck can transform the city.', 'Narrow central neck',
    { name: 'Desert dusk', canvas: '#fbebe0', frame: '#ecd0bc', tile: '#fff8ef', accent: '#b46b52', ink: '#704939', void: '#e9bfa9' }, [
      '############', '############', '.##########.', '...######...', '....####....',
      '...######...', '.##########.', '############', '############',
    ]),
  shaped('crossroads', 'Crossroads', 'A broad east–west avenue intersects a compact north–south corridor.', 'Four long arms',
    { name: 'Violet afterglow', canvas: '#f0eaf8', frame: '#dcd0eb', tile: '#fcf9ff', accent: '#8265a9', ink: '#55466b', void: '#c8b4df' }, [
      '...######...', '...######...', '.##########.', '############', '############',
      '############', '.##########.', '...######...', '...######...',
    ]),
  shaped('switchback', 'Switchback', 'The city bends from northwest to southeast, creating winding routes with rotationally fair starts.', 'Winding diagonal',
    { name: 'Alpine trail', canvas: '#eaf3e8', frame: '#cfdfcd', tile: '#f9fcf5', accent: '#587e58', ink: '#3e6149', void: '#a9c8aa' }, [
      '########....', '#########...', '##########..', '..##########', '.##########.',
      '##########..', '..##########', '...#########', '....########',
    ]),
  shaped('atoll', 'The Atoll', 'A wide lagoon splits the middle of the city. Chains can race around either shore.', 'Lagoon ring',
    { name: 'Coral lagoon', canvas: '#e5f5f2', frame: '#bde2dd', tile: '#f7fdfb', accent: '#258c91', ink: '#2e626b', void: '#85cbd0' }, [
      '.##########.', '############', '############', '###......###', '###......###',
      '###......###', '############', '############', '.##########.',
    ]),
  shaped('four-spires', 'Four Spires', 'Four slim towers open onto a crowded central district and many possible merger fronts.', 'Four corner spires',
    { name: 'Midnight & gold', canvas: '#dbe5e8', frame: '#263d56', tile: '#f2f5f1', accent: '#b18d43', ink: '#273f54', void: '#183149' }, [
      '..##....##..', '.##########.', '############', '.##########.', '..########..',
      '.##########.', '############', '.##########.', '..##....##..',
    ]),
  makeSizedMap('twin-docks', 'Twin Docks', 'Two busy waterfronts meet across a long, narrow shipping lane. The middle can turn into a merger corridor.', 'Two docks, one crossing',
    { name: 'Cobalt quay', canvas: '#e8effb', frame: '#b7c8e8', tile: '#f8fbff', accent: '#4274bd', ink: '#2d4c79', void: '#9cb6d9' },
    20, 7, 6, 41, (c, r) => Math.abs(r - 3) <= 1 || c <= 5 || c >= 14),
  makeSizedMap('obelisk', 'The Obelisk', 'A tall, tapered city rewards long vertical chains and careful claims around its narrow tips.', 'Tapered vertical skyline',
    { name: 'Orchid stone', canvas: '#f3edf7', frame: '#d9c8e4', tile: '#fffbff', accent: '#87589b', ink: '#5a3e68', void: '#c3a6d2' },
    11, 17, 6, 53, (c, r) => {
      const width = [5, 5, 7, 7, 9, 9, 11, 11, 11][Math.min(r, 16 - r)];
      return Math.abs(c - 5) <= Math.floor(width / 2);
    }),
  makeSizedMap('coral-crown', 'Coral Crown', 'A sheltered lagoon cuts through a crowned shoreline, sending hotel chains around two lively shores.', 'Crowned lagoon',
    { name: 'Apricot reef', canvas: '#fff0e6', frame: '#efcfbb', tile: '#fffaf4', accent: '#c36743', ink: '#754731', void: '#e4ae8c' },
    14, 12, 6, 52, (c, r) => !(c >= 5 && c <= 8 && r >= 4 && r <= 7)
      && !((c < 2 || c >= 12) && (r < 2 || r >= 10))),
  makeSizedMap('lightning-run', 'Lightning Run', 'A winding diagonal strike bends the city from one edge to the other. Every crossing feels consequential.', 'S-bend lightning corridor',
    { name: 'Electric current', canvas: '#e7f7f6', frame: '#bce0dc', tile: '#fbffff', accent: '#167f86', ink: '#22575e', void: '#83c2c6' },
    18, 9, 6, 45, (c, r) => Math.abs(r - (4 + Math.round(2 * Math.sin((c - 8.5) * Math.PI / 17)))) <= 3),
  makeSizedMap('compass-rose', 'Compass Rose', 'Four broad avenues radiate from a packed central market, with tapered approaches at every point.', 'Four-point city star',
    { name: 'Periwinkle compass', canvas: '#ebeef9', frame: '#ced6ef', tile: '#fbfcff', accent: '#5967b6', ink: '#38416e', void: '#aeb9de' },
    15, 13, 6, 48, (c, r) => Math.abs(c - 7) <= 2 || Math.abs(r - 6) <= 2
      || (Math.abs(c - 7) <= 4 && Math.abs(r - 6) <= 4 && Math.abs(c - 7) + Math.abs(r - 6) <= 7)),
  makeSizedMap('pinwheel', 'The Pinwheel', 'Four offset districts curl around the center. Ownership can grow clockwise or cut across the hub.', 'Four turning districts',
    { name: 'Cherry blossom', canvas: '#fff1f0', frame: '#f0d1d0', tile: '#fffaf8', accent: '#b84f68', ink: '#693d4b', void: '#e8b5bf' },
    15, 14, 6, 52, (c, r) => (c >= 5 && c <= 9 && r >= 4 && r <= 9)
      || (c >= 2 && c <= 6 && r <= 5) || (c >= 9 && r >= 2 && r <= 6)
      || (c >= 8 && c <= 12 && r >= 8) || (c <= 5 && r >= 7 && r <= 11)),
  makeSizedMap('starfall-x', 'Starfall X', 'Four diagonal arms collide in a dense center, making the routes toward a merger unusually direct.', 'Crossed diagonal arms',
    { name: 'Indigo starlight', canvas: '#eae9f8', frame: '#c9c8e8', tile: '#fdfcff', accent: '#6960a9', ink: '#433d72', void: '#a9a4d6' },
    17, 11, 6, 44, (c, r) => Math.abs(r - c * 10 / 16) <= 2.1 || Math.abs(r - (10 - c * 10 / 16)) <= 2.1),
  makeSizedMap('twin-lagoons', 'Twin Lagoons', 'Two neighboring lagoons divide the city into looping shores and a slim shared isthmus.', 'Double-lagoon loops',
    { name: 'Emerald shallows', canvas: '#e2f4e9', frame: '#b4dfc6', tile: '#fafffb', accent: '#2e9364', ink: '#285c47', void: '#8ed0b0' },
    16, 12, 6, 55, (c, r) => !((c >= 3 && c <= 6 || c >= 9 && c <= 12) && r >= 4 && r <= 7)
      && !((c <= 1 || c >= 14) && (r <= 1 || r >= 10))),
  shaped('lunar-moth', 'Lunar Moth', 'Moonlit wings fan out from a slender body. Race along the edges or bring rival chains together at the waist.', 'Four moonlit wings',
    { name: 'Moonstone silver', canvas: '#eef0fa', frame: '#ccd3e8', tile: '#fcfdff', accent: '#747ead', ink: '#414969', void: '#a8b3d5' }, [
      '#######.###.#######', '#######.###.#######', '.######.###.######.',
      '..#####.###.#####..', '....###########....', '....###########....',
      '....###########....', '..#####.###.#####..', '.######.###.######.',
      '#######.###.#######', '#######.###.#######',
    ], 6, 55),
  shaped('ember-gear', 'Ember Gear', 'A furnace glows at the heart of an eight-toothed city. Build around the hollow hub and claim the outer cogs.', 'Eight teeth, a hollow hub',
    { name: 'Molten copper', canvas: '#fff0df', frame: '#edcba6', tile: '#fffaf1', accent: '#b95e28', ink: '#703f29', void: '#e2a76c' }, [
      '......###......', '.###..###..###.', '.#############.',
      '.#############.', '..###########..', '..###########..',
      '######...######', '######...######', '######...######',
      '..###########..', '..###########..', '.#############.',
      '.#############.', '.###..###..###.', '......###......',
    ], 6, 55),
  shaped('jade-infinity', 'Jade Infinity', 'Two jade loops cross at one busy knot. Each shore offers a different path into the next merger.', 'Interlocking infinity loops',
    { name: 'Jade silk', canvas: '#e5f6ed', frame: '#b8ddc6', tile: '#f8fffb', accent: '#287b59', ink: '#28543f', void: '#86c5a5' }, [
      '...#####.....#####...', '..#######...#######..', '.####.####.####.####.',
      '####...#######...####', '###.....#####.....###', '####...#######...####',
      '.####.####.####.####.', '..#######...#######..', '...#####.....#####...',
    ], 6, 45),
  shaped('clockwork-keys', 'Clockwork Keys', 'Two ornate keys share a long shaft, with offset teeth opening side districts. Timing a merger can unlock the whole city.', 'Twin keys and offset teeth',
    { name: 'Brass workshop', canvas: '#f8efdd', frame: '#e6d1a4', tile: '#fffaf0', accent: '#977024', ink: '#5e4927', void: '#ceb578' }, [
      '######..###.......######', '######..###.......######', '#...##..###.......##...#',
      '########################', '########################', '#...##.......###..##...#',
      '######.......###..######', '######.......###..######',
    ], 6, 46),
  shaped('crystal-cascade', 'Crystal Cascade', 'Three crystal chambers climb a narrow spine. Small connecting passages put a premium on the right tile.', 'Three stacked crystal chambers',
    { name: 'Glacial quartz', canvas: '#e8f6fb', frame: '#bfdeec', tile: '#faffff', accent: '#447cba', ink: '#34516f', void: '#92c7e2' }, [
      '...###...', '..#####..', '.#######.',
      '#########', '.#######.', '..#####..',
      '...###...', '...###...', '..#####..',
      '.#######.', '#########', '.#######.',
      '..#####..', '...###...', '...###...',
      '..#####..', '.#######.', '#########',
      '.#######.', '..#####..', '...###...',
    ], 6, 44),
  shaped('cloud-palace', 'Cloud Palace', 'Four pointed sky palaces meet above a broad central promenade. Build in the towers before the clouds converge.', 'Four floating palaces',
    { name: 'Peach sunrise', canvas: '#fff0ec', frame: '#edccc4', tile: '#fffaf7', accent: '#be7580', ink: '#714954', void: '#e4abb2' }, [
      '...#.........#...', '..###.......###..', '.#####.###.#####.',
      '#################', '.#####.###.#####.', '#################',
      '#################', '#################', '.#####.###.#####.',
      '#################', '.#####.###.#####.', '..###.......###..',
      '...#.........#...',
    ], 6, 54),
  shaped('comet-arcade', 'Comet Arcade', 'A stepped comet trail joins two deep pockets of space. Follow the diagonal or grow across its bright middle.', 'Stepped comet trail',
    { name: 'Solar tangerine', canvas: '#fff1de', frame: '#f0d5a8', tile: '#fffaf2', accent: '#c98121', ink: '#755325', void: '#e8b66e' }, [
      '#####..................', '#########.........#####', '##############....#####',
      '#######################', '#######################', '#####....##############',
      '#####.........#########', '..................#####',
    ], 6, 45),
  shaped('saffron-labyrinth', 'Saffron Labyrinth', 'Two open outer walks lead into a sheltered inner ring. Winding approaches turn the timing of a crossing into a decision.', 'Nested maze and opposite gates',
    { name: 'Saffron lanterns', canvas: '#faf0df', frame: '#e9d0aa', tile: '#fffaf3', accent: '#b88739', ink: '#6d542f', void: '#d9b67e' }, [
      '#####...#######', '#####...#######', '##...........##',
      '##...........##', '##..#######..##', '##..#######..##',
      '######...##..##', '######...######', '##..##...######',
      '##..#######..##', '##..#######..##', '##...........##',
      '##...........##', '#######...#####', '#######...#####',
    ], 6, 51),
  shaped('biolume-reef', 'Biolume Reef', 'Glowing reef branches reach out from a narrow central channel. Parallel fronds create several separate merger fronts.', 'Branching luminous reef',
    { name: 'Bioluminescent mint', canvas: '#e1f6f3', frame: '#a6ddd6', tile: '#f7fffd', accent: '#168d78', ink: '#285a52', void: '#70c7bd' }, [
      '...##.######.##...', '...##.######.##...', '#####...##...#####',
      '#####...##...#####', '...##...##...##...', '...##...##...##...',
      '##################', '##################', '...##...##...##...',
      '...##...##...##...', '#####...##...#####', '#####...##...#####',
      '...##.######.##...', '...##.######.##...',
    ], 6, 53),
  shaped('lotus-gardens', 'Lotus Gardens', 'Pointed lotus petals unfold above and below a small garden court. Compact chambers keep six investors close to the action.', 'Stacked lotus petals',
    { name: 'Lotus blush', canvas: '#faeaf3', frame: '#e5c1d8', tile: '#fff9fd', accent: '#aa5484', ink: '#69405b', void: '#d49dbf' }, [
      '......#......', '.....###.....', '....#####....',
      '...#######...', '....#####....', '...#######...',
      '..#########..', '.#####.#####.', '#############',
      '.#####.#####.', '..#########..', '...#######...',
      '....#####....', '...#######...', '....#####....',
      '.....###.....', '......#......',
    ], 6, 41),
  makeSizedMap('big-rectangle', 'Grand Rectangle', 'A wider classic rectangle gives eight investors room to build on every side.', 'Expanded classic grid',
    { name: 'Emerald city', canvas: '#e9f0e6', frame: '#c5d7c1', tile: '#f8fcf6', accent: '#498161', ink: '#315749', void: '#a7c8ae' },
    16, 12, 8, 61, () => true),
  makeSizedMap('big-crater', 'Crater City', 'Eight investors circle a broad central plaza, with mergers racing around its rim.', 'Central crater',
    { name: 'Copper & cream', canvas: '#f7e8db', frame: '#e9c4a8', tile: '#fff8ee', accent: '#ad6942', ink: '#654632', void: '#d99871' },
    16, 12, 8, 61, (c, r) => !(c >= 5 && c <= 10 && r >= 4 && r <= 7)),
  makeSizedMap('big-harbors', 'Twin Harbors', 'Two long central inlets create broad east and west shores linked by a middle boulevard.', 'Twin inlets',
    { name: 'Glacier blue', canvas: '#e8f3f7', frame: '#c3dfea', tile: '#f8fdff', accent: '#4a86a3', ink: '#31566b', void: '#91c9de' },
    16, 12, 8, 61, (c, r) => !((r <= 3 || r >= 8) && c >= 6 && c <= 9)),
  makeSizedMap('big-aurora-gate', 'Aurora Gate', 'An unusually wide northern gateway and two inner sky courts put eight investors on a dramatic ring.', 'Twin sky courts',
    { name: 'Aurora orchid', canvas: '#f1eafa', frame: '#d7c5eb', tile: '#fdfaff', accent: '#a05fa5', ink: '#654d78', void: '#bfa8da' },
    23, 11, 8, 61, (c, r) => {
      const inset = Math.max(0, 4 - Math.min(r, 10 - r));
      return c >= inset && c < 23 - inset && !(c >= 8 && c <= 14 && r >= 3 && r <= 7 && r !== 5);
    }),
  makeSizedMap('big-trident-towers', 'Trident Towers', 'Three tall avenues rise from both sides of a broad city belt, creating separated fronts for eight.', 'Six skyline prongs',
    { name: 'Stormglass blue', canvas: '#e9f1f8', frame: '#bdd0e2', tile: '#fbfdff', accent: '#426e9f', ink: '#2e4b6a', void: '#91b4d4' },
    15, 18, 8, 61, (c, r) => !((r < 6 || r >= 12) && [4, 5, 9, 10].includes(c))
      && !((c < 2 || c >= 13) && (r < 2 || r >= 16))),
  shaped('big-dragon-spine', 'Dragon Spine', 'A long dragon spine connects ribbed trading districts and raised twin crests. Eight investors compete to control its crossings.', 'Ribs, crests and a long spine',
    { name: 'Dragon jade', canvas: '#e9f3df', frame: '#c6d9a7', tile: '#fbfdf5', accent: '#678d2f', ink: '#465b2b', void: '#a7c77c' }, [
      '.........#########.........', '...###...#########...###...', '...###...#########...###...',
      '######....###.###....######', '######....###.###....######', '###########################',
      '###########################', '###########################', '######....###.###....######',
      '######....###.###....######', '...###...#########...###...', '...###...#########...###...',
      '.........#########.........',
    ], 8, 61),
  shaped('big-moon-mosaic', 'Moon Mosaic', 'Five moon courts puncture a tiled observatory with four projecting gates. Take a circuit around the courts or cut between them.', 'Five observatory courts',
    { name: 'Moonlit lapis', canvas: '#eceffc', frame: '#c9d1ee', tile: '#fcfcff', accent: '#596eaa', ink: '#3c4972', void: '#9eaedb' }, [
      '.......#####.......', '.#################.', '.#################.',
      '.#################.', '.###...#####...###.', '.###...#####...###.',
      '.###...#####...###.', '###################', '########...########',
      '########...########', '########...########', '###################',
      '.###...#####...###.', '.###...#####...###.', '.###...#####...###.',
      '.#################.', '.#################.', '.#################.',
      '.......#####.......',
    ], 8, 61),
  makeSizedMap('mega-diamond', 'Diamond Dominion', 'Ten seats share a sweeping diamond with long diagonal approaches and a broad heart.', 'Clipped diamond',
    { name: 'Amethyst dusk', canvas: '#eeeaf6', frame: '#d2c9e9', tile: '#fbf9ff', accent: '#8068a8', ink: '#51466c', void: '#b7a4d4' },
    20, 14, 10, 81, (c, r) => { const inset = Math.max(0, 4 - Math.min(r, 13 - r)); return c >= inset && c < 20 - inset; }),
  makeSizedMap('mega-rivers', 'Three Rivers', 'Two long waterways divide three trading corridors; the far ends reconnect them.', 'Three land corridors',
    { name: 'Electric tide', canvas: '#e4f4f7', frame: '#b7dce7', tile: '#f7fdfe', accent: '#297f9e', ink: '#2c5668', void: '#76bfd1' },
    20, 14, 10, 81, (c, r) => !(r >= 2 && r <= 11 && [4, 5, 14, 15].includes(c))),
  makeSizedMap('mega-divide', 'The Great Divide', 'A huge central lake and two open gateways turn this ten-seat city into a looping contest.', 'Lake and gateways',
    { name: 'Basalt & mint', canvas: '#e9f0eb', frame: '#9dbbb5', tile: '#f7fcf8', accent: '#427b73', ink: '#325850', void: '#638f8c' },
    20, 14, 10, 81, (c, r) => !(c >= 6 && c <= 13 && r >= 5 && r <= 8) && !((r <= 1 || r >= 12) && c >= 8 && c <= 11)),
  makeSizedMap('mega-triple-arch', 'The Triple Arch', 'Three deep avenues reach inward from both horizons while a busy middle boulevard joins the city.', 'Six carved avenues',
    { name: 'Sunlit bronze', canvas: '#faf1df', frame: '#e7d4a6', tile: '#fffdf7', accent: '#ad7a2e', ink: '#67512e', void: '#dfbe78' },
    27, 13, 10, 81, (c, r) => !((r <= 4 || r >= 8) && (c >= 7 && c <= 10 || c >= 16 && c <= 19))
      && !((c < 2 || c >= 25) && (r < 2 || r >= 11))),
  makeSizedMap('mega-citadel-grid', 'Citadel Grid', 'Four enclosed plazas turn a tall ten-seat city into a lattice of crossroads and looping routes.', 'Four inner plazas',
    { name: 'Mint citadel', canvas: '#e5f4f0', frame: '#b7dad3', tile: '#fbfffd', accent: '#3d8a84', ink: '#2f5d59', void: '#94cbc1' },
    18, 19, 10, 81, (c, r) => !(((c >= 3 && c <= 6 || c >= 11 && c <= 14)
      && (r >= 4 && r <= 7 || r >= 11 && r <= 14)))
      && !((c < 2 || c >= 16) && (r < 2 || r >= 17))),
  shaped('mega-thunderbird', 'Thunderbird', 'Ten investors spread across a great feathered silhouette. Deep notches separate the wingtips before their routes meet at the body.', 'Notched thunderbird wings',
    { name: 'Storm violet', canvas: '#f0eafa', frame: '#d5c3e8', tile: '#fefbff', accent: '#8253a2', ink: '#583d6d', void: '#b598ce' }, [
      '###..##..##.#####.##..##..###', '###..##..##.#####.##..##..###', '..#########.#####.#########..',
      '....#######.#####.#######....', '......#####.#####.#####......', '.......####.#####.####.......',
      '........###.#####.###........', '#############################', '#############################',
      '#############################', '........###.#####.###........', '.......####.#####.####.......',
      '......#####.#####.#####......', '....#######.#####.#######....', '..#########.#####.#########..',
      '###..##..##.#####.##..##..###', '###..##..##.#####.##..##..###',
    ], 10, 81),
  shaped('mega-mirage-steps', 'Mirage Steps', 'A tall desert city rises through shifting terraces and four hidden courtyards. Broad chambers alternate with narrow approaches.', 'Terraced mirage city',
    { name: 'Desert rose', canvas: '#fbeee7', frame: '#e9c9b8', tile: '#fffaf5', accent: '#a76b58', ink: '#674639', void: '#d5a38e' }, [
      '.......#######.......', '.......#######.......', '....#############....',
      '....#############....', '.###################.', '.#####..#####..#####.',
      '######..#####..######', '######..#####..######', '..####..#####..####..',
      '..#################..', '....#############....', '....#############....',
      '....#############....', '..#################..', '..####..#####..####..',
      '######..#####..######', '######..#####..######', '.#####..#####..#####.',
      '.###################.', '....#############....', '....#############....',
      '.......#######.......', '.......#######.......',
    ], 10, 81),
  makeSizedMap('max-metropolis', 'Metropolis Max', 'A full 24-by-16 skyline stretches the classic rectangular fight to twelve investors.', 'Full megacity grid',
    { name: 'Night market', canvas: '#e6e9ee', frame: '#2d415b', tile: '#f7f8f5', accent: '#be9850', ink: '#30455d', void: '#1d334c' },
    24, 16, 12, 111, () => true),
  makeSizedMap('max-archipelago', 'Grand Archipelago', 'A vast inland sea and four corner bays force twelve investors around a scenic ring.', 'Inland sea and bays',
    { name: 'Aurora coast', canvas: '#e4f4ef', frame: '#acd8cd', tile: '#f7fdfa', accent: '#388b83', ink: '#305e5a', void: '#70c5bd' },
    24, 16, 12, 111, (c, r) => !(c >= 7 && c <= 16 && r >= 5 && r <= 10)
      && !((c <= 3 || c >= 20) && (r <= 1 || r >= 14))),
  makeSizedMap('max-cross', 'The Grand Cross', 'Four sweeping edge cuts leave a crowded center and branching districts for twelve.', 'Four great gateways',
    { name: 'Crimson boulevard', canvas: '#f8e9e7', frame: '#e6c4be', tile: '#fffaf7', accent: '#a95b58', ink: '#674443', void: '#d99d98' },
    24, 16, 12, 111, (c, r) => !((c >= 8 && c <= 15) && (r <= 2 || r >= 13))
      && !((r >= 6 && r <= 9) && (c <= 2 || c >= 21))),
  makeSizedMap('max-celestial-ring', 'Celestial Ring', 'A thirty-column cosmic ring wraps around a vast void, leaving twelve investors two long routes to the far side.', 'Wide galactic hollow',
    { name: 'Rose nebula', canvas: '#f5e9ee', frame: '#dfc2d0', tile: '#fffafd', accent: '#9a576e', ink: '#674552', void: '#cb9faf' },
    30, 17, 12, 111, (c, r) => {
      const inset = Math.max(0, 5 - Math.min(r, 16 - r));
      return c >= inset && c < 30 - inset && !(c >= 9 && c <= 20 && r >= 5 && r <= 11);
    }),
  makeSizedMap('max-orion-star', 'Orion Star', 'Eight vast rays meet in a crowded core; twelve investors can expand outward or converge for a showdown.', 'Eight-point megacity star',
    { name: 'Violet cosmos', canvas: '#eeeaf9', frame: '#d3cbee', tile: '#fdfcff', accent: '#7162bc', ink: '#493e77', void: '#aaa1dd' },
    23, 23, 12, 111, (c, r) => Math.min(Math.abs(c - 11), Math.abs(r - 11)) <= 3
      || Math.abs(Math.abs(c - 11) - Math.abs(r - 11)) <= 2),
  shaped('max-world-tree', 'World Tree', 'An enormous trunk links diamond canopies, spreading boughs and mirrored roots. Twelve investors build a city among the branches.', 'Canopies, boughs and mirrored roots',
    { name: 'Ancient forest', canvas: '#e7efde', frame: '#bfd0a3', tile: '#fafcf4', accent: '#567b38', ink: '#3c5430', void: '#99b77b' }, [
      '....#....#########........#....', '...###..##########.......###...', '..################......#####..',
      '.#################.....#######.', '##################....#########', '.#######..########.....#######.',
      '..###########################..', '...#########################...', '....#........#####........#....',
      '###############################', '###############################', '###############################',
      '....#........#####........#....', '...#########################...', '..###########################..',
      '.#######.....########..#######.', '#########....##################', '.#######.....#################.',
      '..#####......################..', '...###.......##########..###...', '....#........#########....#....',
    ], 12, 111),
  shaped('max-astral-loom', 'Astral Loom', 'Crossing celestial ribbons weave through a lattice of open sky. Diagonal approaches and layered crossings give twelve investors many routes to meet.', 'Woven celestial lattice',
    { name: 'Astral turquoise', canvas: '#e5f5f8', frame: '#b5dbe6', tile: '#f9feff', accent: '#337f95', ink: '#315965', void: '#83bfce' }, [
      '##.....................##', '###...................###', '.#######################.',
      '..#####################..', '..#####################..', '..#####.###...###.#####..',
      '..#########...#########..', '..###.#####...#####.###..', '..#####################..',
      '..#####################..', '..#####################..', '..###...#########...###..',
      '..###...#########...###..', '..###...#########...###..', '..#####################..',
      '..#####################..', '..#####################..', '..###.#####...#####.###..',
      '..#########...#########..', '..#####.###...###.#####..', '..#####################..',
      '..#####################..', '.#######################.', '###...................###',
      '##.....................##',
    ], 12, 111),
  makeSizedMap('goldspire-kingdom', 'Goldspire Kingdom', 'Five golden spires rise above a royal boulevard. Earn this crown by winning every story challenge and defeating the eleven monarchs.', 'The crown at the end of The Long Game',
    { name: 'Royal gold', canvas: '#faf2dc', frame: '#e0cb8f', tile: '#fffdf4', accent: '#aa7e20', ink: '#655020', void: '#c6a954' },
    25, 18, 12, 111, (c, r) => r >= 10 ? c >= 1 && c <= 23
      : [2, 7, 12, 17, 22].some((peak) => Math.abs(c - peak) <= Math.floor(r / 3))),

];
/** New map IDs are feature-gated online so an older room function cannot accept a selection it does not know. */
export const NEW_MAP_IDS: ReadonlySet<MapId> = new Set([
  'twin-docks', 'obelisk', 'coral-crown', 'lightning-run', 'compass-rose', 'pinwheel', 'starfall-x', 'twin-lagoons',
  'big-aurora-gate', 'big-trident-towers', 'mega-triple-arch', 'mega-citadel-grid', 'max-celestial-ring', 'max-orion-star',
]);

/** Creative expansion: requires the matching server engine and SQL map whitelist. */
export const CREATIVE_MAP_IDS: ReadonlySet<MapId> = new Set([
  'lunar-moth', 'ember-gear', 'jade-infinity', 'clockwork-keys', 'crystal-cascade', 'cloud-palace', 'comet-arcade', 'saffron-labyrinth', 'biolume-reef', 'lotus-gardens',
  'big-dragon-spine', 'big-moon-mosaic',
  'mega-thunderbird', 'mega-mirage-steps',
  'max-world-tree', 'max-astral-loom',
]);
/** Small-city and two-player house expansion, supported by matching online servers. */
export const SMALL_MAP_IDS: ReadonlySet<MapId> = new Set([
  'duo-pocket-square', 'duo-teacup-court', 'duo-button-bay', 'duo-sugar-steps', 'duo-moon-lock',
  'duo-matchbox', 'duo-fern-path', 'duo-biscuit-ring', 'duo-koi-crossing', 'duo-starlight-kite',
  'duo-coral-comb', 'duo-lemon-bow', 'duo-velvet-rail', 'duo-pebble-isle', 'duo-jellybean',
  'four-market-square', 'four-amber-court', 'four-sailmakers', 'four-paper-lantern', 'four-crescent-pier',
  'four-foxglove', 'four-copper-coil', 'four-blue-hour', 'four-honey-arcade', 'four-pistachio-park',
  'four-vinyl-club', 'four-tulip-terminal', 'four-kite-festival', 'four-snowglobe', 'four-rooftop-radio',
]);
export const MAP_SEAT_TIERS = [2, 4, 6, 8, 10, 12] as const;
export const getMap = (id: MapId | undefined): MapDefinition => MAPS.find((map) => map.id === id) ?? MAPS.find((map) => map.id === 'classic')!;
export const isMapId = (value: unknown): value is MapId => typeof value === 'string' && MAPS.some((map) => map.id === value);
export const mapHasTile = (id: MapId | undefined, tile: Tile) => getMap(id).tiles.includes(tile);

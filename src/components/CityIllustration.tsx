const buildings = [
  { x: 2, y: 2, w: 1, d: 2, h: 64, c: '#c29a46' },
  { x: 3, y: 2, w: 1, d: 1, h: 43, c: '#ddbb69' },
  { x: 5, y: 1, w: 1, d: 1, h: 95, c: '#6e9184' },
  { x: 5, y: 2, w: 1, d: 1, h: 71, c: '#89a397' },
  { x: 6, y: 4, w: 2, d: 1, h: 56, c: '#c96861' },
  { x: 7, y: 5, w: 1, d: 1, h: 37, c: '#d9867c' },
  { x: 3, y: 5, w: 1, d: 1, h: 115, c: '#667eaa' },
  { x: 3, y: 6, w: 1, d: 1, h: 65, c: '#8da3c0' },
  { x: 1, y: 5, w: 1, d: 1, h: 28, c: '#777c7e' },
  { x: 5, y: 6, w: 1, d: 1, h: 24, c: '#9479ab' },
].sort((a, b) => a.x + a.y - (b.x + b.y));
const point = (x: number, y: number, z = 0) => [310 + (x - y) * 31, 158 + (x + y) * 16 - z];
const p = (x: number, y: number, z = 0) => point(x, y, z).join(',');
export default function CityIllustration() {
  return (
    <svg
      className="city-illustration"
      viewBox="0 0 620 490"
      role="img"
      aria-label="An illustrated city of colorful hotel towers on an Acquire game board"
    >
      <defs>
        <radialGradient id="halo">
          <stop stopColor="#78afa8" stopOpacity=".8" />
          <stop offset="1" stopColor="#285b61" stopOpacity="0" />
        </radialGradient>
        <filter id="shadow">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>
      <ellipse cx="320" cy="282" rx="280" ry="200" fill="url(#halo)" />
      <ellipse
        cx="318"
        cy="374"
        rx="217"
        ry="62"
        fill="#183f35"
        opacity=".10"
        filter="url(#shadow)"
      />
      <polygon
        points={`${p(-0.4, -0.4)} ${p(9.4, -0.4)} ${p(9.4, 9.4)} ${p(-0.4, 9.4)}`}
        fill="#ccd5c4"
        transform="translate(0 13)"
      />
      <polygon
        points={`${p(-0.4, -0.4)} ${p(9.4, -0.4)} ${p(9.4, 9.4)} ${p(-0.4, 9.4)}`}
        fill="#e6e8db"
        stroke="#b8c6b2"
      />
      {Array.from({ length: 81 }, (_, i) => {
        const x = i % 9,
          y = Math.floor(i / 9);
        const colored = buildings.find(
          (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.d,
        );
        return (
          <polygon
            key={i}
            points={`${p(x + 0.08, y + 0.08)} ${p(x + 0.92, y + 0.08)} ${p(x + 0.92, y + 0.92)} ${p(x + 0.08, y + 0.92)}`}
            fill={colored ? colored.c : '#f5f5ec'}
            stroke="#d5dacb"
            strokeWidth=".6"
          />
        );
      })}
      {buildings.map((b, i) => (
        <g key={i} className="city-building" style={{ animationDelay: `${i * 70}ms` }}>
          <polygon
            points={`${p(b.x + 0.15, b.y + 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + b.d - 0.15, b.h)} ${p(b.x + 0.15, b.y + b.d - 0.15, b.h)}`}
            fill={b.c}
          />
          <polygon
            points={`${p(b.x + 0.15, b.y + b.d - 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + b.d - 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + b.d - 0.15, 3)} ${p(b.x + 0.15, b.y + b.d - 0.15, 3)}`}
            fill={b.c}
          />
          <polygon
            points={`${p(b.x + b.w - 0.15, b.y + 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + b.d - 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + b.d - 0.15, 3)} ${p(b.x + b.w - 0.15, b.y + 0.15, 3)}`}
            fill={b.c}
          />
          <polygon
            points={`${p(b.x + b.w - 0.15, b.y + 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + b.d - 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + b.d - 0.15, 3)} ${p(b.x + b.w - 0.15, b.y + 0.15, 3)}`}
            fill="#122f2a"
            opacity=".2"
          />
          <polygon
            points={`${p(b.x + 0.15, b.y + 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + 0.15, b.h)} ${p(b.x + b.w - 0.15, b.y + b.d - 0.15, b.h)} ${p(b.x + 0.15, b.y + b.d - 0.15, b.h)}`}
            fill="#fff"
            opacity=".22"
          />
          {Array.from({ length: Math.floor((b.h - 10) / 13) }, (_, j) => {
            const z = 12 + j * 13;
            return (
              <g key={j} opacity=".55">
                <line
                  x1={point(b.x + 0.3, b.y + b.d - 0.145, z)[0]}
                  y1={point(b.x + 0.3, b.y + b.d - 0.145, z)[1]}
                  x2={point(b.x + b.w - 0.3, b.y + b.d - 0.145, z)[0]}
                  y2={point(b.x + b.w - 0.3, b.y + b.d - 0.145, z)[1]}
                  stroke="#faf5de"
                  strokeWidth="3"
                />
                <line
                  x1={point(b.x + b.w - 0.14, b.y + 0.3, z)[0]}
                  y1={point(b.x + b.w - 0.14, b.y + 0.3, z)[1]}
                  x2={point(b.x + b.w - 0.14, b.y + b.d - 0.3, z)[0]}
                  y2={point(b.x + b.w - 0.14, b.y + b.d - 0.3, z)[1]}
                  stroke="#ecedd8"
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

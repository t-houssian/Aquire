import { decodeAvatar } from '../game/avatars';
import { getCharacter } from '../game/characters';
import '../characters.css';

/** Code-native portraits: no downloaded images, requests, or stored image blobs. */
export default function CharacterAvatar({
  characterId,
  avatar,
  name = '',
  className = '',
}: {
  characterId?: string;
  avatar?: string;
  name?: string;
  className?: string;
}) {
  const character = getCharacter(characterId);
  const custom = decodeAvatar(avatar);
  if (!character && !custom) return <>{name.slice(0, 1).toUpperCase()}</>;
  const n = character?.portrait ?? 0;
  const cut = custom?.cut ?? n % 4,
    mouth = custom?.mouth ?? n % 3;
  const hue = custom ? custom.color * 15 : (n * 137.5 + 24) % 360;
  const skin = [
    '#efc8a8',
    '#bf8666',
    '#e3aa86',
    '#885941',
    '#f5d8bf',
    '#a97050',
    '#d99c76',
    '#663f32',
    '#ffe4cc',
  ][custom?.skin ?? n % 7];
  const hair = [
    '#383d34',
    '#74462d',
    '#dfc697',
    '#49342f',
    '#a3a8a0',
    '#c56b3b',
    '#294e53',
    '#603d69',
    '#df718f',
    '#447cbd',
    '#70a67c',
    '#e3b939',
    '#b74d39',
    '#f5f1dd',
    '#8775bd',
    '#28a69c',
  ][custom?.hair ?? Math.floor(n / 7) % 8];
  const accent = `hsl(${hue} 35% 40%)`;
  const accessory = character?.royal ? 7 : (custom?.accessory ?? n % 8),
    eyes = custom?.eyes ?? Math.floor(n / 8) % 3;
  return (
    <svg
      className={`character-avatar ${className}`}
      viewBox="0 0 80 80"
      role="img"
      aria-label={
        character
          ? `${character.name}, ${character.title}`
          : `${name || 'Your character'}, custom face`
      }
    >
      <title>
        {character ? `${character.name} · ${character.title}` : name || 'Your character'}
      </title>
      <rect width="80" height="80" rx="22" fill={`hsl(${hue} 42% 89%)`} />
      {custom && custom.background > 0 && (
        <g opacity=".65" fill={accent}>
          {custom.background === 1 &&
            Array.from({ length: 5 }, (_, i) => (
              <circle key={i} cx={i * 21} cy={i % 2 ? 60 : 19} r="10" />
            ))}
          {custom.background === 2 &&
            Array.from({ length: 5 }, (_, i) => (
              <path key={i} d={`M${i * 22 - 35} 0h8l65 80h-8Z`} />
            ))}
          {custom.background === 3 && (
            <>
              <circle cx="40" cy="39" r="32" fill="#fff6be" />
              <circle cx="40" cy="39" r="27" fill="#f0c766" />
            </>
          )}
          {custom.background === 4 && <path d="M0 60L21 18L41 60L62 21L80 60V80H0Z" />}
          {custom.background === 5 && (
            <path d="M0 15Q20 3 40 15T80 15V27Q60 40 40 27T0 27ZM0 57Q20 45 40 57T80 57V69Q60 82 40 69T0 69Z" />
          )}
          {custom.background === 6 &&
            Array.from({ length: 8 }, (_, i) => (
              <path
                key={i}
                d={`M40 40L${40 + Math.cos((i * Math.PI) / 4) * 60} ${40 + Math.sin((i * Math.PI) / 4) * 60}`}
                stroke={accent}
                strokeWidth="8"
              />
            ))}
          {custom.background === 7 &&
            Array.from({ length: 8 }, (_, i) => (
              <path
                key={i}
                d={`M${(i % 4) * 22 + 5} ${Math.floor(i / 4) * 55 + 9}l2 -5l2 5l5 2l-5 2l-2 5l-2 -5l-5 -2Z`}
              />
            ))}
          {custom.background === 8 &&
            Array.from({ length: 7 }, (_, i) => (
              <rect key={i} x={i * 12} y={30 + (i % 3) * 9} width="9" height="50" rx="1" />
            ))}
          {custom.background === 9 &&
            Array.from({ length: 16 }, (_, i) => (
              <rect
                key={i}
                x={(i % 4) * 23 + 3}
                y={Math.floor(i / 4) * 22 + 3}
                width="3"
                height="7"
                fill={i % 2 ? '#dba72b' : '#fff7d7'}
                transform={`rotate(${i * 31} ${(i % 4) * 23 + 3} ${Math.floor(i / 4) * 22 + 3})`}
              />
            ))}
        </g>
      )}
      <path d="M9 80Q12 60 40 61Q68 60 71 80" fill={accent} />
      <path d="M30 62L40 75L50 62" fill="#fff9e9" />
      <path d="M37 69L43 69L45 80H35Z" fill={hair} />
      {custom && custom.outfit > 0 && (
        <g>
          <path
            d="M9 80Q12 60 40 61Q68 60 71 80"
            fill={custom.outfit === 7 ? '#642b75' : custom.outfit === 9 ? '#455666' : accent}
          />
          {[1, 2, 8].includes(custom.outfit) && (
            <path
              d="M29 62l11 15l11 -15M25 64l6 16M55 64l-6 16"
              fill="none"
              stroke="#fff9e9"
              strokeWidth={custom.outfit === 8 ? 3 : 1.5}
            />
          )}
          {custom.outfit === 2 && <path d="M31 67l9 4l9 -4v9l-9 -4l-9 4Z" fill="#e4bd64" />}
          {custom.outfit === 3 && <path d="M26 64q14 14 28 0v6q-14 15 -28 0Z" fill="#fff6de" />}
          {custom.outfit === 4 && (
            <>
              <path
                d="M26 63l14 12l14 -12M31 68l-2 12M49 68l2 12"
                stroke="#eee6c6"
                strokeWidth="3"
                fill="none"
              />
              <circle cx="40" cy="78" r="1.5" fill="#eee6c6" />
            </>
          )}
          {custom.outfit === 5 && (
            <path d="M21 65l38 13M21 78l38 -13" stroke="#cfe4ee" strokeWidth="4" />
          )}
          {custom.outfit === 6 && (
            <path d="M40 67l2 4h5l-4 3l2 5l-5 -3l-5 3l2 -5l-4 -3h5Z" fill="#ffe9a3" />
          )}
          {custom.outfit === 7 && (
            <>
              <path d="M12 80l15 -18l13 13l13 -13l16 18" fill="#723b83" />
              <path d="M27 62l13 13l13 -13" stroke="#fff0bc" strokeWidth="6" fill="none" />
            </>
          )}
          {custom.outfit === 8 && (
            <path d="M51 70l2 -3l2 3l3 1l-3 2l-2 3l-2 -3l-3 -2Z" fill="#ffdd7e" />
          )}
          {custom.outfit === 9 &&
            Array.from({ length: 9 }, (_, i) => (
              <path key={i} d={`M${16 + i * 6} 66v14`} stroke="#c7d1d9" strokeWidth="1" />
            ))}
        </g>
      )}
      <ellipse
        cx="40"
        cy="41"
        rx={custom ? [20, 23, 18, 21, 19][custom.shape] : 20 + (n % 3)}
        ry={custom ? [24, 22, 26, 25, 21][custom.shape] : 24 - (n % 3)}
        fill={skin}
      />
      <circle cx="19" cy="43" r="4" fill={skin} />
      <circle cx="61" cy="43" r="4" fill={skin} />
      {cut === 0 ? (
        <path d="M18 37Q13 13 38 13Q65 11 63 38L53 27L30 32L27 22Z" fill={hair} />
      ) : cut === 1 ? (
        <path d="M18 37Q15 15 36 13Q62 12 62 33Q52 21 43 27Q29 18 22 37" fill={hair} />
      ) : cut === 2 ? (
        <>
          <path d="M19 38Q12 18 25 18Q25 7 38 13Q49 6 56 19Q70 21 61 41L54 24L30 27Z" fill={hair} />
          <path d="M20 33L17 57M61 32L64 56" stroke={hair} strokeWidth="6" />
        </>
      ) : cut === 3 ? (
        <path d="M18 39Q15 21 25 21L25 41ZM55 21Q66 23 62 41H56ZM30 18Q39 10 48 19" fill={hair} />
      ) : cut === 4 ? (
        <path d="M18 40Q9 8 39 12Q69 7 63 42L55 30Q42 22 28 31L25 46L22 63H14Z" fill={hair} />
      ) : cut === 5 ? (
        <>
          <circle cx="40" cy="11" r="10" fill={hair} />
          <path d="M18 34Q18 13 40 14Q64 15 62 34L55 28Q40 22 24 31" fill={hair} />
        </>
      ) : cut === 6 ? (
        <path d="M17 36L21 12L30 24L37 5L45 23L56 10L64 37L51 28L29 29Z" fill={hair} />
      ) : cut === 7 ? (
        <path d="M18 32Q19 12 40 13Q62 13 62 32Q40 21 18 32" fill={hair} />
      ) : cut === 8 ? (
        <>
          <path
            d="M19 37Q13 20 23 20Q22 10 34 14Q39 6 48 14Q62 11 63 24Q70 31 61 38L52 29L29 28Z"
            fill={hair}
          />
          <g fill="none" stroke={skin} strokeWidth="1.2">
            <path d="M24 23q4 -7 8 0M37 20q4 -7 8 0M49 23q4 -7 8 0" />
          </g>
        </>
      ) : cut === 9 ? (
        <path
          d="M18 42Q13 10 40 11Q69 12 63 48L54 25L47 37L38 25L30 37L25 24L25 57H15Z"
          fill={hair}
        />
      ) : cut === 10 ? (
        <>
          <path d="M17 32Q20 12 40 13Q63 13 63 33L55 29L49 39L44 26L33 34L24 26Z" fill={hair} />
          <path d="M21 27v26M59 27v26" stroke={hair} strokeWidth="4" />
        </>
      ) : null}
      <path
        d={`M26 ${34 - Math.min(eyes, 2)}l9 ${Math.min(eyes, 2) - 1}M46 ${34 + Math.min(eyes, 2)}l9 ${-Math.min(eyes, 2) - 1}`}
        stroke={hair}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {eyes === 1 ? (
        <>
          <path
            d="M27 41q4 -4 8 0M46 41q4 -4 8 0"
            fill="none"
            stroke="#2d3430"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </>
      ) : eyes === 3 ? (
        <>
          <path d="M27 42l8 -1" stroke="#2d3430" strokeWidth="2.5" />
          <ellipse cx="50" cy="41" rx="2.2" ry="3" fill="#2d3430" />
        </>
      ) : eyes === 4 ? (
        <>
          <path d="M26 40l4 5l5 -5M46 40l4 5l5 -5" fill="none" stroke="#2d3430" strokeWidth="2" />
        </>
      ) : eyes === 5 ? (
        <>
          <circle cx="31" cy="41" r="4" fill="#fff9ec" />
          <circle cx="50" cy="41" r="4" fill="#fff9ec" />
          <circle cx="31" cy="41" r="2" fill="#2d3430" />
          <circle cx="50" cy="41" r="2" fill="#2d3430" />
        </>
      ) : eyes === 6 ? (
        <>
          <path d="M27 41l3 -3l4 3l-4 3ZM47 41l3 -3l4 3l-4 3Z" fill="#2d3430" />
        </>
      ) : (
        <>
          <ellipse cx="31" cy="41" rx="2.2" ry={eyes === 2 ? 2 : 3} fill="#2d3430" />
          <ellipse cx="50" cy="41" rx="2.2" ry="3" fill="#2d3430" />
        </>
      )}
      <path
        d={
          ['M41 41L38 49L44 49', 'M41 43q-5 7 3 6', 'M40 42v7h5', 'M40 43q6 0 5 6h-6', 'M40 47h3'][
            custom?.nose ?? 0
          ]
        }
        fill="none"
        stroke="#694935"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {custom && custom.facialHair > 0 && (
        <g fill={hair}>
          {custom.facialHair === 1 && (
            <path d="M28 53q6 -5 12 0q6 -5 12 0q-7 5 -12 1q-5 4 -12 -1" />
          )}
          {custom.facialHair === 2 && <path d="M34 60h12l-6 7Z" />}
          {custom.facialHair === 3 && (
            <path d="M21 48q5 15 19 14q14 1 19 -14q-1 22 -19 21q-18 1 -19 -21" />
          )}
          {custom.facialHair === 4 && <path d="M21 48q3 19 19 21q17 -3 19 -21l-7 12h-24Z" />}
          {custom.facialHair === 5 && (
            <path d="M24 51q3 4 6 0q5 -4 10 2q5 -6 10 -2q3 4 6 0q0 11 -16 3q-16 8 -16 -3" />
          )}
          {custom.facialHair === 6 && <path d="M18 36h6v19l-5 4ZM56 36h6l-1 23l-5 -4Z" />}
          {custom.facialHair === 7 && (
            <g opacity=".45">
              {Array.from({ length: 11 }, (_, i) => (
                <circle key={i} cx={27 + (i % 6) * 5} cy={57 + Math.floor(i / 6) * 5} r=".8" />
              ))}
            </g>
          )}
        </g>
      )}
      {mouth === 0 ? (
        <path d="M31 54Q40 64 51 53" fill="#fff9ec" stroke="#694935" strokeWidth="1.2" />
      ) : mouth === 1 ? (
        <path
          d="M32 56Q42 60 50 54"
          fill="none"
          stroke="#694935"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : mouth === 2 ? (
        <path d="M34 56L47 56" stroke="#694935" strokeWidth="2" strokeLinecap="round" />
      ) : mouth === 3 ? (
        <ellipse cx="40" cy="56" rx="3" ry="4" fill="#694935" />
      ) : mouth === 4 ? (
        <path d="M32 54q8 12 17 0Z" fill="#694935" />
      ) : mouth === 5 ? (
        <path d="M33 57l6 -3l9 3" stroke="#694935" strokeWidth="2" fill="none" />
      ) : (
        <path d="M32 56q10 5 17 -2" stroke="#a34b4b" strokeWidth="3" fill="none" />
      )}
      {accessory === 0 && (
        <g fill="none" stroke={hair} strokeWidth="2">
          <circle cx="30" cy="41" r="8" />
          <circle cx="51" cy="41" r="8" />
          <path d="M38 40h5" />
        </g>
      )}
      {accessory === 1 && (
        <>
          <path d="M14 27H67L58 20L54 10H29L25 20Z" fill={accent} />
          <path d="M26 21h32" stroke="#edd9ac" strokeWidth="3" />
        </>
      )}
      {accessory === 2 && (
        <>
          <circle cx="52" cy="42" r="9" fill="none" stroke="#e6bd56" strokeWidth="2.5" />
          <path d="M60 49Q68 65 56 68" fill="none" stroke="#bb9540" strokeWidth="1.5" />
        </>
      )}
      {accessory === 3 && (
        <path d="M27 52Q35 48 40 53Q45 48 55 52Q47 59 40 55Q31 59 27 52" fill={hair} />
      )}
      {accessory === 4 && (
        <>
          <path d="M13 27Q19 6 48 12Q69 16 64 27Z" fill={accent} />
          <circle cx="54" cy="17" r="4" fill="#f0d798" />
        </>
      )}
      {accessory === 5 && (
        <g fill="none" stroke={accent} strokeWidth="3">
          <rect x="22" y="36" width="17" height="12" rx="3" />
          <rect x="43" y="36" width="17" height="12" rx="3" />
          <path d="M39 40h4" />
        </g>
      )}
      {accessory === 6 && (
        <>
          <circle cx="62" cy="29" r="6" fill="#e9ad66" />
          <circle cx="62" cy="29" r="2" fill="#fdf5d9" />
          <path d="M29 65L40 70L51 65V77L40 71L29 77Z" fill={accent} />
        </>
      )}
      {accessory === 7 && (
        <>
          <path d="M26 24L22 9L36 16L42 6L47 17L59 10L55 25Z" fill="#d8ac45" />
          <path d="M28 22h25" stroke="#fff3c3" strokeWidth="2" />
        </>
      )}
      {accessory === 9 && (
        <>
          <path d="M20 39h19v8q-17 5 -19 -8ZM43 39h19q-2 13 -19 8Z" fill="#253f42" />
          <path d="M38 41h6" stroke="#253f42" strokeWidth="3" />
        </>
      )}
      {accessory === 10 && (
        <>
          <path d="M20 30q0 -18 20 -18q20 0 20 18" fill="none" stroke={accent} strokeWidth="6" />
          <rect x="15" y="29" width="8" height="19" rx="4" fill={accent} />
          <rect x="57" y="29" width="8" height="19" rx="4" fill={accent} />
        </>
      )}
      {accessory === 11 && (
        <>
          <path d="M21 28q-3 -23 17 -22q16 1 19 22Z" fill="#fffaf0" />
          <path d="M23 22h32v7H23Z" fill="#ede4cd" />
        </>
      )}
      {accessory === 12 && (
        <>
          <path d="M18 28q0 -22 22 -21q22 0 24 21Z" fill={accent} />
          <path d="M46 25h24v5H46Z" fill={hair} />
        </>
      )}
      {accessory === 13 && (
        <>
          <path d="M18 29q0 -18 22 -18q22 0 22 18Z" fill={accent} />
          <circle cx="40" cy="8" r="6" fill="#fff1d3" />
        </>
      )}
      {accessory === 14 && (
        <>
          <path d="M16 30q2 -22 24 -22q23 0 24 22Z" fill="#dfb541" />
          <path d="M40 9v19M29 12l-3 16M51 12l3 16M14 30h52" stroke="#ffe5a0" strokeWidth="3" />
        </>
      )}
      {accessory === 15 && (
        <>
          <path d="M18 27l-5 -21l16 10M53 16L67 6l-5 21" fill={accent} />
          <path d="M21 22l-4 -12l9 8M56 19l7 -8l-3 12" fill="#edb8aa" />
        </>
      )}
      {accessory === 16 && (
        <>
          <path d="M16 40q-4 -30 24 -32q29 2 24 32" fill="none" stroke="#e6eff0" strokeWidth="6" />
          <path d="M16 36q2 35 24 35q22 0 24 -35" fill="none" stroke="#e6eff0" strokeWidth="5" />
          <path d="M22 24q8 -13 20 -11" stroke="#fff" strokeWidth="2" fill="none" />
          <rect x="10" y="37" width="8" height="14" rx="3" fill={accent} />
          <rect x="62" y="37" width="8" height="14" rx="3" fill={accent} />
        </>
      )}
      {accessory === 17 && (
        <>
          <path
            d="M21 25Q2 10 18 4q-6 12 12 17M54 21Q73 10 62 4q18 8 -3 22"
            fill="#78a592"
            stroke="#356d55"
            strokeWidth="1"
          />
        </>
      )}
      {accessory === 18 && (
        <>
          <path
            d="M21 25L18 6l15 11l7 -15l8 15l15 -11l-4 19Z"
            fill="#e6b62c"
            stroke="#b78314"
            strokeWidth="1.5"
          />
          <path d="M23 24h34" stroke="#fff1bd" strokeWidth="3" />
          <circle cx="40" cy="20" r="3" fill="#863983" />
        </>
      )}
      {accessory === 19 && (
        <g fill="#b99c37">
          <path d="M22 32q-11 -12 -3 -23q0 14 10 18M57 29q9 -8 7 -20q8 11 -4 24" />
          {[15, 20, 25].map((y) => (
            <g key={y}>
              <ellipse cx="20" cy={y} rx="5" ry="2" transform={`rotate(40 20 ${y})`} />
              <ellipse cx="61" cy={y} rx="5" ry="2" transform={`rotate(-40 61 ${y})`} />
            </g>
          ))}
        </g>
      )}
      {accessory === 20 && (
        <>
          <circle
            cx="51"
            cy="42"
            r="9"
            fill="#def7ff"
            fillOpacity=".5"
            stroke="#7bb9c9"
            strokeWidth="3"
          />
          <path d="M46 39l4 -4l6 4l-5 5Z" fill="#eafaff" />
          <path d="M59 49l3 16" stroke="#7bb9c9" strokeWidth="1.5" />
        </>
      )}
      {accessory === 21 && (
        <>
          <path d="M18 28q0 -22 22 -21q22 0 24 21Z" fill="#a27d27" />
          <path d="M46 25h24v5H46Z" fill="#e5c96d" />
          <path d="M39 12l2 4h4l-3 3l1 4l-4 -2l-4 2l1 -4l-3 -3h4Z" fill="#fff0b5" />
        </>
      )}
      {accessory === 22 && (
        <>
          <path d="M14 27h53l-9 -7l-4 -15H28l-4 15Z" fill="#405462" />
          <path d="M26 21h31" stroke="#b7e3ec" strokeWidth="4" />
          <path d="M39 10l4 -4l4 4l-4 5Z" fill="#e1faff" />
        </>
      )}
      {custom && custom.earrings > 0 && (
        <g
          fill={custom.earrings === 4 ? '#ab669d' : '#e2c15a'}
          stroke={custom.earrings === 2 ? '#aa8430' : 'none'}
        >
          {[19, 61].map((x) =>
            custom.earrings === 1 ? (
              <circle key={x} cx={x} cy="47" r="2" />
            ) : custom.earrings === 2 ? (
              <circle key={x} cx={x} cy="49" r="4" fill="none" strokeWidth="2" />
            ) : custom.earrings === 3 ? (
              <path key={x} d={`M${x} 46l3 5l-3 4l-3 -4Z`} />
            ) : custom.earrings === 4 ? (
              <path key={x} d={`M${x} 47l2 3l3 1l-3 2l-2 3l-2 -3l-3 -2l3 -1Z`} />
            ) : (
              <circle key={x} cx={x} cy="48" r="3" fill="#fff9eb" />
            ),
          )}
        </g>
      )}
      {custom && custom.badge > 0 && (
        <g>
          <circle
            cx="58"
            cy="71"
            r="6"
            fill={custom.badge >= 5 ? '#d9b74e' : '#4d7d66'}
            stroke="#fff4d5"
            strokeWidth="1"
          />
          <text x="58" y="74" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#fff8e7">
            {['', '◆', '▤', '★', '♛', '1', '★', '◆'][custom.badge]}
          </text>
        </g>
      )}
    </svg>
  );
}

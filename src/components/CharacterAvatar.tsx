import { getCharacter } from '../game/characters';
import '../characters.css';

/** Code-native portraits: no downloaded images, requests, or stored image blobs. */
export default function CharacterAvatar({ characterId, name = '', className = '' }: { characterId?: string; name?: string; className?: string }) {
  const character = getCharacter(characterId);
  if (!character) return <>{name.slice(0, 1).toUpperCase()}</>;
  const n = character.portrait;
  const skin = ['#efc8a8', '#bf8666', '#e3aa86', '#885941', '#f5d8bf', '#a97050', '#d99c76'][n % 7];
  const hair = ['#383d34', '#74462d', '#dfc697', '#49342f', '#a3a8a0', '#c56b3b', '#294e53', '#603d69'][Math.floor(n / 7) % 8];
  const accent = `hsl(${(n * 137.5 + 24) % 360} 35% 40%)`;
  const accessory = n % 8, eyes = Math.floor(n / 8) % 3;
  return <svg className={`character-avatar ${className}`} viewBox="0 0 80 80" role="img" aria-label={`${character.name}, ${character.title}`}>
    <title>{character.name} · {character.title}</title>
    <rect width="80" height="80" rx="22" fill={`hsl(${(n * 137.5 + 24) % 360} 42% 89%)`} />
    <path d="M9 80Q12 60 40 61Q68 60 71 80" fill={accent} />
    <path d="M30 62L40 75L50 62" fill="#fff9e9" />
    <path d="M37 69L43 69L45 80H35Z" fill={hair} />
    <ellipse cx="40" cy="41" rx={20 + n % 3} ry={24 - n % 3} fill={skin} />
    <circle cx="19" cy="43" r="4" fill={skin} /><circle cx="61" cy="43" r="4" fill={skin} />
    {n % 4 === 0 ? <path d="M18 37Q13 13 38 13Q65 11 63 38L53 27L30 32L27 22Z" fill={hair} />
      : n % 4 === 1 ? <path d="M18 37Q15 15 36 13Q62 12 62 33Q52 21 43 27Q29 18 22 37" fill={hair} />
      : n % 4 === 2 ? <><path d="M19 38Q12 18 25 18Q25 7 38 13Q49 6 56 19Q70 21 61 41L54 24L30 27Z" fill={hair} /><path d="M20 33L17 57M61 32L64 56" stroke={hair} strokeWidth="6" /></>
      : <path d="M18 39Q15 21 25 21L25 41ZM55 21Q66 23 62 41H56ZM30 18Q39 10 48 19" fill={hair} />}
    <path d={`M26 ${34 - eyes}l9 ${eyes - 1}M46 ${34 + eyes}l9 ${-eyes - 1}`} stroke={hair} strokeWidth="2.5" strokeLinecap="round" />
    {eyes === 1 ? <><path d="M27 41q4 -4 8 0M46 41q4 -4 8 0" fill="none" stroke="#2d3430" strokeWidth="2.6" strokeLinecap="round" /></>
      : <><ellipse cx="31" cy="41" rx="2.2" ry={eyes === 2 ? 2 : 3} fill="#2d3430" /><ellipse cx="50" cy="41" rx="2.2" ry="3" fill="#2d3430" /></>}
    <path d="M41 41L38 49L44 49" fill="none" stroke="#694935" strokeWidth="1.5" strokeLinecap="round" />
    {n % 3 === 0 ? <path d="M31 54Q40 64 51 53" fill="#fff9ec" stroke="#694935" strokeWidth="1.2" />
      : n % 3 === 1 ? <path d="M32 56Q42 60 50 54" fill="none" stroke="#694935" strokeWidth="2" strokeLinecap="round" />
      : <path d="M34 56L47 56" stroke="#694935" strokeWidth="2" strokeLinecap="round" />}
    {accessory === 0 && <g fill="none" stroke={hair} strokeWidth="2"><circle cx="30" cy="41" r="8" /><circle cx="51" cy="41" r="8" /><path d="M38 40h5" /></g>}
    {accessory === 1 && <><path d="M14 27H67L58 20L54 10H29L25 20Z" fill={accent} /><path d="M26 21h32" stroke="#edd9ac" strokeWidth="3" /></>}
    {accessory === 2 && <><circle cx="52" cy="42" r="9" fill="none" stroke="#e6bd56" strokeWidth="2.5" /><path d="M60 49Q68 65 56 68" fill="none" stroke="#bb9540" strokeWidth="1.5" /></>}
    {accessory === 3 && <path d="M27 52Q35 48 40 53Q45 48 55 52Q47 59 40 55Q31 59 27 52" fill={hair} />}
    {accessory === 4 && <><path d="M13 27Q19 6 48 12Q69 16 64 27Z" fill={accent} /><circle cx="54" cy="17" r="4" fill="#f0d798" /></>}
    {accessory === 5 && <g fill="none" stroke={accent} strokeWidth="3"><rect x="22" y="36" width="17" height="12" rx="3" /><rect x="43" y="36" width="17" height="12" rx="3" /><path d="M39 40h4" /></g>}
    {accessory === 6 && <><circle cx="62" cy="29" r="6" fill="#e9ad66" /><circle cx="62" cy="29" r="2" fill="#fdf5d9" /><path d="M29 65L40 70L51 65V77L40 71L29 77Z" fill={accent} /></>}
    {accessory === 7 && <><path d="M26 24L22 9L36 16L42 6L47 17L59 10L55 25Z" fill="#d8ac45" /><path d="M28 22h25" stroke="#fff3c3" strokeWidth="2" /></>}
  </svg>;
}

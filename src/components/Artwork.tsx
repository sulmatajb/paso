export function Postcard({
  compact = false,
  greeting = '¡hola!',
}: {
  compact?: boolean;
  greeting?: string;
}) {
  return (
    <div className={`postcard ${compact ? 'compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 480 380" role="presentation">
        <defs>
          <pattern id="paper-grain" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".6" fill="#704b37" opacity=".07" />
          </pattern>
        </defs>
        <path d="M70 291V137a102 102 0 0 1 204 0v154" fill="#e7b39b" />
        <path d="M93 291V140a79 79 0 0 1 158 0v151" fill="#f4ddbd" />
        <circle cx="214" cy="95" r="36" fill="#ee744e" />
        <path d="M94 223q80-81 157-18v86H94" fill="#a7b4a0" />
        <path d="M94 247q93-66 157-8v52H94" fill="#44695d" />
        <path
          d="M166 291c-8-31 19-38 25-61s-10-25-4-42"
          fill="none"
          stroke="#f1cbb4"
          strokeWidth="16"
        />
        <path d="M60 292h224v12H60" fill="#bb7657" />
        <path
          d="M316 290v-87m0 58c-33 0-50-17-48-42 29-1 48 13 48 42Zm0-25c28 2 47-15 47-40-29 0-46 15-47 40Zm0-22c-19-18-17-42 1-60 19 20 17 44-1 60Z"
          fill="#315c4c"
          stroke="#315c4c"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="m287 272 11 48h37l11-48Z" fill="#d77c55" />
        <path d="M285 272h63v10h-63" fill="#e39169" />
        <path d="M52 321h323" stroke="#b17c58" strokeWidth="2" opacity=".4" />
        <g transform="rotate(9 341 88)">
          <rect x="265" y="42" width="159" height="78" rx="18" fill="#fffaf0" />
          <path d="m289 115 4 21 22-18" fill="#fffaf0" />
          <text
            x="344"
            y="97"
            textAnchor="middle"
            fontFamily="Fraunces, Georgia, serif"
            fontStyle="italic"
            fontSize="49"
            fill="#31594d"
          >
            {greeting}
          </text>
        </g>
        <path
          d="m402 181 4 13 13 4-13 4-4 13-4-13-13-4 13-4Zm-58-159 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"
          fill="#d49a42"
        />
        <rect width="480" height="380" fill="url(#paper-grain)" />
      </svg>
      <span className="postcard-caption">A NEW LANGUAGE. A NEW LITTLE WORLD.</span>
    </div>
  );
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'small' : ''}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <path d="M8 23V12a8 8 0 1 1 8 8h-2v7H8Zm6-9h2a2 2 0 1 0-2-2v2Z" fill="currentColor" />
        </svg>
      </span>
      paso<span className="brand-dot">.</span>
    </span>
  );
}

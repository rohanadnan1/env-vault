import { useId } from "react";
import type { AvatarConfig } from "@/lib/avatars";

type AvatarRendererProps = {
  config: AvatarConfig;
  className?: string;
};

export function AvatarRenderer({ config, className }: AvatarRendererProps) {
  const gradientId = useId();
  const faceId = useId();
  const shadowId = useId();
  const blushId = useId();

  const hair = getHairShape(config.hairStyle);
  const eyes = getEyeShape(config.eyeStyle);
  const mouth = getMouthShape(config.mouthStyle);

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Custom avatar"
    >
      <defs>
        <radialGradient id={gradientId} cx="28%" cy="22%" r="82%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
          <stop offset="100%" stopColor={config.bgColor} />
        </radialGradient>
        <radialGradient id={faceId} cx="36%" cy="28%" r="74%">
          <stop offset="0%" stopColor="#fff7ed" stopOpacity="0.68" />
          <stop offset="100%" stopColor={config.skinTone} />
        </radialGradient>
        <radialGradient id={blushId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fca5a5" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fca5a5" stopOpacity="0" />
        </radialGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.18" />
        </filter>
      </defs>

      <circle cx="50" cy="50" r="48" fill={`url(#${gradientId})`} />

      <g opacity="0.95">
        <path d="M28 92C32 74 42 68 50 68C58 68 68 74 72 92Z" fill={getOutfitColor(config.bgColor)} />
        <rect x="44" y="65" width="12" height="12" rx="5" fill={shade(config.skinTone, -12)} />
      </g>

      <g filter={`url(#${shadowId})`}>
        <ellipse cx="35.5" cy="51.5" rx="3.8" ry="6" fill={shade(config.skinTone, -10)} />
        <ellipse cx="64.5" cy="51.5" rx="3.8" ry="6" fill={shade(config.skinTone, -10)} />
        <path
          d="M50 26C61 26 69 34 69 46V58C69 69 61 78 50 78C39 78 31 69 31 58V46C31 34 39 26 50 26Z"
          fill={`url(#${faceId})`}
        />
      </g>

      <ellipse cx="39" cy="57" rx="5.5" ry="4" fill={`url(#${blushId})`} />
      <ellipse cx="61" cy="57" rx="5.5" ry="4" fill={`url(#${blushId})`} />

      <path d={hair.back} fill={config.hairColor} />
      <path d={hair.main} fill={config.hairColor} />
      {hair.front ? <path d={hair.front} fill={config.hairColor} /> : null}
      {hair.extra ? <path d={hair.extra} fill={config.hairColor} /> : null}

      <g fill={shade(config.hairColor, -16)}>
        <path d="M34 43C37 40 40 39 43 40L42 44C39 43 37 43 34.8 45Z" />
        <path d="M57 40C60 39 63 40 66 43L65.2 45C63 43 61 43 58 44Z" />
      </g>

      <g fill="#ffffff" stroke="#334155" strokeWidth="1.1">
        <path d={eyes.leftWhite} />
        <path d={eyes.rightWhite} />
      </g>

      <g fill="none" stroke={shade(config.skinTone, -24)} strokeWidth="1">
        <path d="M35.5 47.7C38 46.1 42.5 46.1 45 47.7" />
        <path d="M55 47.7C57.5 46.1 62 46.1 64.5 47.7" />
      </g>

      <g fill={config.bgColor} opacity="0.15">
        <path d={eyes.leftWhite} />
        <path d={eyes.rightWhite} />
      </g>

      <g fill={config.hairColor}>
        <path d={eyes.leftBrow} />
        <path d={eyes.rightBrow} />
      </g>

      <g fill="#0f172a">
        <ellipse cx={eyes.leftPupil.cx} cy={eyes.leftPupil.cy} rx={eyes.leftPupil.rx} ry={eyes.leftPupil.ry} />
        <ellipse cx={eyes.rightPupil.cx} cy={eyes.rightPupil.cy} rx={eyes.rightPupil.rx} ry={eyes.rightPupil.ry} />
      </g>

      <g fill="#ffffff" opacity="0.9">
        <circle cx={eyes.leftPupil.cx - 0.6} cy={eyes.leftPupil.cy - 0.7} r="0.8" />
        <circle cx={eyes.rightPupil.cx - 0.6} cy={eyes.rightPupil.cy - 0.7} r="0.8" />
      </g>

      <path
        d="M49 50C49.5 53 48.5 55.5 47 58C48.8 59.2 51.2 59.2 53 58"
        fill="none"
        stroke={shade(config.skinTone, -26)}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <g fill={shade(config.skinTone, -30)} opacity="0.55">
        <ellipse cx="47" cy="58.7" rx="0.7" ry="0.45" />
        <ellipse cx="53" cy="58.7" rx="0.7" ry="0.45" />
      </g>

      <path d={mouth.path} fill={mouth.fill} stroke={mouth.stroke} strokeWidth={mouth.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />

      {config.accessory === "glasses" && (
        <g stroke="#334155" strokeWidth="1.8" fill="none">
          <rect x="34.2" y="43.7" width="11.5" height="9" rx="4.5" />
          <rect x="54.3" y="43.7" width="11.5" height="9" rx="4.5" />
          <path d="M45.7 48.2H54.3" />
        </g>
      )}

      {config.accessory === "crown" && (
        <path
          d="M34 26L40 35L50 27L60 35L66 26L69 38H31Z"
          fill="#fcd34d"
          stroke="#d97706"
          strokeWidth="1.4"
        />
      )}

      {config.accessory === "headset" && (
        <g stroke="#334155" strokeWidth="1.8" fill="none">
          <path d="M32 47C32 36 39.5 30 50 30C60.5 30 68 36 68 47" />
          <rect x="27.5" y="47" width="5.5" height="10" rx="2.5" />
          <rect x="67" y="47" width="5.5" height="10" rx="2.5" />
        </g>
      )}
    </svg>
  );
}

function getHairShape(style: AvatarConfig["hairStyle"]) {
  switch (style) {
    case "wave":
      return {
        back: "M28 44C28 31 37 23 50 23C63 23 72 31 72 45V60C69 56 64 53 60 53V43C60 40 57 38 53 38H47C43 38 40 40 40 43V53C36 53 31 56 28 60Z",
        main: "M28 45C28 31 37 22 50 22C63 22 72 31 72 45C69 38 62 35 56 35C54 31 50 30 47 32C42 31 34 35 28 45Z",
        front: "M37 34C39 38 42 41 45 42C43 39 42 36 43 32Z",
        extra: "M57 32C58 37 60 40 65 42C63 38 62 34 57 32Z",
      };
    case "curly":
      return {
        back: "M30 45C30 32 38 24 50 24C62 24 70 32 70 46V58C67 56 64 54 60 54V46C60 42 56 40 50 40C44 40 40 42 40 46V54C36 54 33 56 30 58Z",
        main: "M30 45C30 31 38 22 50 22C62 22 70 31 70 45C67 36 63 33 58 33C57 29 53 27 50 29C47 26 43 27 41 31C37 31 33 35 30 45Z",
        front: "M36 33C34 36 34 39 36 41C38 41 39 39 39 37C39 35 38 33 36 33Z",
        extra: "M61 33C59 35 59 39 61 41C63 41 64 39 64 37C64 35 63 33 61 33Z",
      };
    case "bun":
      return {
        back: "M30 45C30 32 38 24 50 24C62 24 70 32 70 46V58C67 55 63 53 59 53V45C59 41 56 38 50 38C44 38 41 41 41 45V53C37 53 33 55 30 58Z",
        main: "M30 45C30 31 39 23 50 23C61 23 70 31 70 45C66 38 58 35 50 35C42 35 34 38 30 45Z",
        front: "M39 32C42 36 46 39 50 40C47 36 46 32 47 28Z",
        extra: "M43 18C43 13 46 10 50 10C54 10 57 13 57 18C57 23 54 26 50 26C46 26 43 23 43 18Z",
      };
    case "buzz":
      return {
        back: "M33 41C33 31 40 25 50 25C60 25 67 31 67 41V48C62 45 57 44 50 44C43 44 38 45 33 48Z",
        main: "M33 41C33 31 40 24 50 24C60 24 67 31 67 41C63 36 58 34 50 34C42 34 37 36 33 41Z",
        front: "",
        extra: "",
      };
    default:
      return {
        back: "M31 44C31 31 39 23 50 23C61 23 69 31 69 45V57C65 54 61 52 57 52V45C57 41 54 39 50 39C46 39 43 41 43 45V52C39 52 35 54 31 57Z",
        main: "M31 45C31 31 39 22 50 22C61 22 69 31 69 45C66 38 60 35 50 35C40 35 34 38 31 45Z",
        front: "M43 34C43 38 44 41 46.5 43C47 39 47 35 46 32Z",
        extra: "M54 32C53 36 53 40 54.5 43C57 41 58 37 58 34Z",
      };
  }
}

function getEyeShape(style: AvatarConfig["eyeStyle"]) {
  switch (style) {
    case "happy":
      return {
        leftWhite: "M36 49C38 46 43 46 45 49C43 51 38 51 36 49Z",
        rightWhite: "M55 49C57 46 62 46 64 49C62 51 57 51 55 49Z",
        leftBrow: "M35 42C38 40 42 39 45 40L44 42C41 41 38 41 35.8 43Z",
        rightBrow: "M55 40C58 39 62 40 65 42L64.2 43C62 41 59 41 56 42Z",
        leftPupil: { cx: 40.5, cy: 48.8, rx: 1.2, ry: 1.5 },
        rightPupil: { cx: 59.5, cy: 48.8, rx: 1.2, ry: 1.5 },
      };
    case "sleepy":
      return {
        leftWhite: "M36 50C38 48.5 43 48.5 45 50C43 51.2 38 51.2 36 50Z",
        rightWhite: "M55 50C57 48.5 62 48.5 64 50C62 51.2 57 51.2 55 50Z",
        leftBrow: "M35 43C38 42 42 42 45 42.5L44.4 44C41 43.5 38 43.5 35.5 44Z",
        rightBrow: "M55 42.5C58 42 62 42 65 43L64.5 44C62 43.5 59 43.5 55.6 44Z",
        leftPupil: { cx: 40.5, cy: 50.1, rx: 1.15, ry: 1.1 },
        rightPupil: { cx: 59.5, cy: 50.1, rx: 1.15, ry: 1.1 },
      };
    default:
      return {
        leftWhite: "M35.5 49C37 45.5 43.5 45.5 45 49C43.5 52.2 37 52.2 35.5 49Z",
        rightWhite: "M55 49C56.5 45.5 63 45.5 64.5 49C63 52.2 56.5 52.2 55 49Z",
        leftBrow: "M35 42C38 39.5 42 39 45 40.5L44.1 42.2C41.5 41.2 38.7 41.4 35.8 43.1Z",
        rightBrow: "M55 40.5C58 39 62 39.5 65 42L64.2 43.1C61.3 41.4 58.5 41.2 55.9 42.2Z",
        leftPupil: { cx: 40.3, cy: 49, rx: 1.55, ry: 2.1 },
        rightPupil: { cx: 59.7, cy: 49, rx: 1.55, ry: 2.1 },
      };
  }
}

function getMouthShape(style: AvatarConfig["mouthStyle"]) {
  switch (style) {
    case "smirk":
      return {
        path: "M43 63C46 66 52 65 57 61",
        fill: "none",
        stroke: "#7c2d12",
        strokeWidth: 1.8,
      };
    case "open":
      return {
        path: "M46 61C48 64 52 64 54 61C54 66 46 66 46 61Z",
        fill: "#9a3412",
        stroke: "#7c2d12",
        strokeWidth: 1.4,
      };
    default:
      return {
        path: "M42.5 61.5C45.5 65 54.5 65 57.5 61.5",
        fill: "none",
        stroke: "#9a3412",
        strokeWidth: 1.8,
      };
  }
}

function getOutfitColor(bgColor: string) {
  if (bgColor === "#EDE9FE") return "#c4b5fd";
  if (bgColor === "#FCE7F3") return "#f9a8d4";
  if (bgColor === "#ECFCCB") return "#bef264";
  if (bgColor === "#FEF9C3") return "#fde68a";
  return "#bfdbfe";
}

function shade(hex: string, amount: number) {
  const value = hex.replace("#", "");
  const parsed = Number.parseInt(value, 16);
  const clamp = (channel: number) => Math.max(0, Math.min(255, channel + amount));
  const r = clamp((parsed >> 16) & 0xff);
  const g = clamp((parsed >> 8) & 0xff);
  const b = clamp(parsed & 0xff);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

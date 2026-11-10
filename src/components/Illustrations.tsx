import React from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Pattern,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { colors, fileKinds } from '@/theme';

const FONT = 'PlusJakartaSans_800ExtraBold';

export function Logo({ size = 48, light = false }: { size?: number; light?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="logoG" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.royal} />
          <Stop offset="1" stopColor={colors.navy} />
        </LinearGradient>
      </Defs>
      <Path d="M14 14v20a16 16 0 0 0 32 0V14" fill="none" stroke={light ? '#FFFFFF' : 'url(#logoG)'} strokeWidth={9} strokeLinecap="round" />
      <Path d="M52 2c.9 4.6 2.6 6.3 7.2 7.2-4.6.9-6.3 2.6-7.2 7.2-.9-4.6-2.6-6.3-7.2-7.2 4.6-.9 6.3-2.6 7.2-7.2Z" fill={light ? colors.violetLight : colors.violet} />
    </Svg>
  );
}

/** Splash illustration: SUP'COM building with telecom antenna. */
export function CampusBuilding({ width = 350 }: { width?: number }) {
  return (
    <Svg width={width} height={(width * 290) / 350} viewBox="0 0 350 290">
      <Defs>
        <Pattern id="winS" width={22} height={30} patternUnits="userSpaceOnUse">
          <Rect x={4} y={6} width={14} height={18} rx={2.5} fill={colors.royal} opacity={0.55} />
        </Pattern>
        <LinearGradient id="faceS" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#DCDDFB" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={175} cy={268} rx={168} ry={16} fill="#FFFFFF" opacity={0.1} />
      <G stroke="#CFD1FF" strokeWidth={2.2} fill="none" strokeLinecap="round">
        <Path d="M296 44 279 250M296 44l17 206M283 200h26M286 160h20M289 120h14M292 84h8M283 200l23-40M309 200l-23-40M286 160l17-40M306 160l-17-40M289 120l11-36M303 120l-11-36" />
        <Path d="M282 30a20 20 0 0 1 28 0M274 22a31 31 0 0 1 44 0" opacity={0.7} />
      </G>
      <Circle cx={296} cy={42} r={5} fill={colors.violetLight} />
      <Rect x={30} y={118} width={230} height={138} rx={8} fill="url(#faceS)" />
      <Rect x={40} y={136} width={70} height={110} fill="url(#winS)" />
      <Rect x={180} y={136} width={70} height={110} fill="url(#winS)" />
      <Rect x={112} y={78} width={66} height={178} rx={8} fill="#FFFFFF" />
      <Rect x={120} y={90} width={50} height={16} rx={4} fill={colors.navy} />
      <SvgText x={145} y={102} textAnchor="middle" fontFamily={FONT} fontSize={9} fill="#FFFFFF">
        SUP'COM
      </SvgText>
      <Rect x={122} y={116} width={46} height={70} rx={4} fill={colors.violet} opacity={0.35} />
      <Path d="M145 116v70M122 140h46M122 163h46" stroke="#FFFFFF" strokeWidth={2} />
      <Rect x={130} y={204} width={30} height={52} rx={4} fill={colors.navy} />
      <Rect x={118} y={252} width={54} height={6} rx={3} fill="#C7C9F5" />
      <Rect x={12} y={214} width={5} height={40} rx={2} fill={colors.navy} opacity={0.6} />
      <Circle cx={14.5} cy={206} r={20} fill="#8E7CF7" />
      <Circle cx={22} cy={196} r={12} fill="#A99BFF" />
      <Rect x={331} y={222} width={5} height={34} rx={2} fill={colors.navy} opacity={0.6} />
      <Circle cx={333} cy={214} r={16} fill="#8E7CF7" />
      <Circle cx={327} cy={206} r={9} fill="#A99BFF" />
      <Path d="M58 52c.6 3 1.7 4.1 4.7 4.7-3 .6-4.1 1.7-4.7 4.7-.6-3-1.7-4.1-4.7-4.7 3-.6 4.1-1.7 4.7-4.7Z" fill="#FFFFFF" opacity={0.8} />
    </Svg>
  );
}

/** Small building silhouette used on the home hero banner. */
export function HeroBuilding() {
  return (
    <Svg width={170} height={140} viewBox="0 0 170 140">
      <Defs>
        <Pattern id="winH" width={16} height={20} patternUnits="userSpaceOnUse">
          <Rect x={3} y={4} width={10} height={12} rx={2} fill="#FFFFFF" opacity={0.35} />
        </Pattern>
      </Defs>
      <Path d="M140 18 130 128M140 18l10 110M133 98h14M135 70h10M133 98l12-28M147 98l-12-28M132 10a12 12 0 0 1 16 0" stroke="#FFFFFF" strokeWidth={1.6} fill="none" opacity={0.55} />
      <Rect x={10} y={62} width={118} height={78} rx={6} fill="#FFFFFF" opacity={0.16} />
      <Rect x={16} y={70} width={40} height={64} fill="url(#winH)" />
      <Rect x={84} y={70} width={40} height={64} fill="url(#winH)" />
      <Rect x={56} y={40} width={30} height={100} rx={5} fill="#FFFFFF" opacity={0.28} />
    </Svg>
  );
}

export function RideHero() {
  return (
    <Svg width={210} height={150} viewBox="0 0 210 150">
      <Circle cx={160} cy={40} r={22} fill="#FFFFFF" opacity={0.16} />
      <Path d="M60 110h20V82h14v28h10V70h18v40h8V90h16v20h12V60h16v50h36v40H60Z" fill="#FFFFFF" opacity={0.12} />
      <Path d="M40 150c30-30 80-34 120-40s50-8 50-8v48Z" fill={colors.navy} opacity={0.55} />
      <Path d="M80 146c26-20 60-26 100-30" stroke="#FFFFFF" strokeWidth={2.5} strokeDasharray="8 8" fill="none" opacity={0.7} />
      <G transform="translate(104 98)">
        <Path d="M6 18l6-12a6 6 0 0 1 5.4-3.4h20.4A6 6 0 0 1 43.2 6l6 12a5 5 0 0 1 4 4.9V31a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a5 5 0 0 1 4-5Z" fill="#FFFFFF" />
        <Path d="M14 17l4.5-9h18.6l4.5 9Z" fill={colors.violet} opacity={0.6} />
        <Circle cx={14} cy={33} r={6} fill={colors.navy} />
        <Circle cx={42} cy={33} r={6} fill={colors.navy} />
        <Circle cx={14} cy={33} r={2.4} fill="#FFFFFF" />
        <Circle cx={42} cy={33} r={2.4} fill="#FFFFFF" />
      </G>
    </Svg>
  );
}

export function LostBoxArt({ size = 124 }: { size?: number }) {
  return (
    <Svg width={size} height={(size * 104) / 124} viewBox="0 0 124 104">
      <Ellipse cx={58} cy={98} rx={50} ry={5} fill={colors.navy} opacity={0.08} />
      <Path d="M18 46l40-14 40 14v42L58 100 18 88Z" fill="#C7C9F5" />
      <Path d="M58 60v40L18 88V46Z" fill="#A9ACEB" />
      <Path d="M18 46l40 14 40-14-40-14Z" fill="#E3E4FB" />
      <Path d="M18 46 8 60l40 14 10-14Z" fill="#B7BAF0" />
      <Path d="M98 46l10 14-40 14-10-14Z" fill="#D2D4F7" />
      <Rect x={34} y={16} width={16} height={20} rx={3} fill={colors.violet} transform="rotate(-14 42 26)" />
      <Circle cx={66} cy={22} r={7} fill={colors.royal} />
      <Circle cx={86} cy={40} r={20} fill="#FFFFFF" fillOpacity={0.55} stroke={colors.navy} strokeWidth={6} />
      <Path d="M100 55l14 14" stroke={colors.navy} strokeWidth={8} strokeLinecap="round" />
    </Svg>
  );
}

/** Item illustration chosen from the item category (used when there's no photo). */
export function ItemArt({ category, size = 90 }: { category: string; size?: number }) {
  const c = category.toLowerCase();
  if (c.includes('furniture') || c.includes('desk'))
    return (
      <Svg width={size * 1.2} height={size * 0.92} viewBox="0 0 110 84">
        <Rect x={8} y={36} width={94} height={8} rx={3} fill={colors.navy} />
        <Rect x={14} y={44} width={5} height={34} rx={2} fill={colors.navy} />
        <Rect x={91} y={44} width={5} height={34} rx={2} fill={colors.navy} />
        <Rect x={58} y={44} width={34} height={18} rx={3} fill={colors.royal} />
        <Path d="M26 36V22l10-10" stroke={colors.violet} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Path d="M32 8l12 6-6 8Z" fill={colors.violet} />
        <Rect x={50} y={20} width={26} height={16} rx={2} fill="#FFFFFF" stroke={colors.navy} strokeWidth={2} />
      </Svg>
    );
  if (c.includes('electro') || c.includes('projector'))
    return (
      <Svg width={size * 1.2} height={size * 0.88} viewBox="0 0 110 80">
        <Path d="M72 30 108 12v52L72 46Z" fill={colors.violet} opacity={0.3} />
        <Rect x={8} y={26} width={64} height={32} rx={8} fill={colors.navy} />
        <Circle cx={58} cy={42} r={10} fill={colors.royal} />
        <Circle cx={58} cy={42} r={5} fill="#FFFFFF" />
        <Rect x={18} y={34} width={22} height={4} rx={2} fill="#FFFFFF" opacity={0.6} />
      </Svg>
    );
  if (c.includes('calc') || c.includes('exam'))
    return (
      <Svg width={size * 0.76} height={size} viewBox="0 0 70 92">
        <Rect x={6} y={2} width={58} height={88} rx={9} fill={colors.navy} />
        <Rect x={13} y={10} width={44} height={18} rx={4} fill="#C9F0DA" />
        <G fill="#FFFFFF" opacity={0.85}>
          <Rect x={13} y={36} width={10} height={8} rx={2} />
          <Rect x={30} y={36} width={10} height={8} rx={2} />
          <Rect x={47} y={36} width={10} height={8} rx={2} />
          <Rect x={13} y={50} width={10} height={8} rx={2} />
          <Rect x={30} y={50} width={10} height={8} rx={2} />
          <Rect x={13} y={64} width={10} height={8} rx={2} />
          <Rect x={30} y={64} width={10} height={8} rx={2} />
        </G>
        <Rect x={47} y={50} width={10} height={22} rx={2} fill={colors.violet} />
      </Svg>
    );
  if (c.includes('book'))
    return (
      <Svg width={size} height={size} viewBox="0 0 90 88">
        <Rect x={18} y={8} width={54} height={72} rx={5} fill={colors.royal} />
        <Rect x={18} y={8} width={10} height={72} rx={3} fill={colors.navy} />
        <Rect x={34} y={22} width={30} height={5} rx={2.5} fill="#FFFFFF" />
        <Path d="M34 56c4-10 8-10 12 0s8 10 12 0" stroke="#FFFFFF" strokeWidth={2.5} fill="none" />
      </Svg>
    );
  if (c.includes('lab') || c.includes('kit'))
    return (
      <Svg width={size * 1.15} height={size * 0.88} viewBox="0 0 104 80">
        <Rect x={10} y={12} width={84} height={56} rx={6} fill="#1F7A8C" />
        <Rect x={18} y={20} width={18} height={14} rx={2} fill="#C7CBD6" />
        <Rect x={44} y={30} width={30} height={20} rx={2} fill={colors.navy} />
        <Circle cx={84} cy={56} r={4} fill="#FFFFFF" />
      </Svg>
    );
  return (
    <Svg width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24">
      <Path d="M11.2 2.3a1.8 1.8 0 0 1 1.6 0l7.2 3.6L12 9.9 4 5.9l7.2-3.6ZM3 7.6l8 4v9.7l-7-3.5a1.8 1.8 0 0 1-1-1.6V7.6Zm18 0v8.6a1.8 1.8 0 0 1-1 1.6l-7 3.5v-9.7l8-4Z" fill={colors.navy} />
    </Svg>
  );
}

export function FileIcon({ ext, size = 24 }: { ext: string; size?: number }) {
  const kind = fileKinds[ext?.toLowerCase()] ?? (['png', 'jpg', 'jpeg'].includes(ext) ? fileKinds.img : fileKinds.other);
  return (
    <Svg width={size} height={(size * 26) / 22} viewBox="0 0 22 26">
      <Path d="M3 0h11l8 8v15a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3Z" fill={kind.fg} />
      <Path d="M14 0v5a3 3 0 0 0 3 3h5Z" fill={kind.bg} />
      <SvgText x={11} y={20} textAnchor="middle" fontSize={6.2} fontFamily={FONT} fill="#FFFFFF">
        {kind.label}
      </SvgText>
    </Svg>
  );
}

export function EventGlyph({ category, size = 64 }: { category: string; size?: number }) {
  const s = { stroke: '#FFFFFF', strokeWidth: 1.7, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" opacity={0.9}>
      {category === 'hackathon' ? (
        <Path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" {...s} />
      ) : category === 'workshop' ? (
        <>
          <Path d="M2 12c2.5-4.5 6-7 10-7s7.5 2.5 10 7c-2.5 4.5-6 7-10 7s-7.5-2.5-10-7Z" {...s} />
          <Circle cx={12} cy={12} r={3.5} fill="#FFFFFF" fillOpacity={0.3} stroke="#FFFFFF" strokeWidth={1.7} />
        </>
      ) : category === 'club' ? (
        <>
          <Circle cx={8} cy={8} r={3} fill="#FFFFFF" />
          <Circle cx={16.5} cy={9} r={2.5} fill="#FFFFFF" opacity={0.7} />
          <Path d="M2.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5Z" fill="#FFFFFF" />
          <Path d="M13 19c.3-2.6 1.7-4.4 3.5-4.4 2.2 0 4 1.9 4 4.4Z" fill="#FFFFFF" opacity={0.7} />
        </>
      ) : (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} fill="#FFFFFF" fillOpacity={0.25} stroke="#FFFFFF" strokeWidth={1.7} />
          <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" {...s} />
        </>
      )}
    </Svg>
  );
}

export const EVENT_GRADIENTS: Record<string, [string, string]> = {
  conference: [colors.navy, colors.royal],
  hackathon: [colors.royal, colors.violet],
  workshop: ['#2A2F8F', colors.violet],
  club: [colors.navy, colors.violetDeep],
};

import React from 'react';
import Svg, { Circle, G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { CAMPUS_PLACES, CampusPlace } from '@/data/campus';
import { colors } from '@/theme';

const R = [0.866, 0.5];
const L = [-0.866, 0.5];

function prism({ x, y, a, b, h }: CampusPlace['box']) {
  const p0 = [x, y];
  const p1 = [x + a * R[0], y + a * R[1]];
  const p2 = [p1[0] + b * L[0], p1[1] + b * L[1]];
  const p3 = [x + b * L[0], y + b * L[1]];
  const up = (p: number[]) => [p[0], p[1] - h];
  const pts = (...ps: number[][]) => ps.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  return {
    top: pts(up(p0), up(p1), up(p2), up(p3)),
    left: pts(up(p3), up(p2), p2, p3),
    right: pts(up(p2), up(p1), p1, p2),
    pin: { x: (up(p0)[0] + up(p2)[0]) / 2, y: (up(p0)[1] + up(p2)[1]) / 2 },
  };
}

/** Isometric illustrated campus. Tap a building to select it. */
export function CampusMapArt({ width, selectedId, onSelect }: { width: number; selectedId?: string; onSelect: (p: CampusPlace) => void }) {
  return (
    <Svg width={width} height={(width * 660) / 390} viewBox="0 0 390 660">
      <Path d="M0 290 390 515M390 250 0 475" stroke="#FFFFFF" strokeWidth={22} strokeLinecap="round" />
      <Path d="M60 140 330 296M195 120 20 221M370 360 230 441" stroke="#FFFFFF" strokeWidth={11} strokeLinecap="round" opacity={0.9} />
      <Path d="M170 520l70-40 70 40-70 40Z" fill="#D2EADB" />
      <Path d="M10 330l50-29 50 29-50 29Z" fill="#D2EADB" />
      <Path d="M300 300l40-23 40 23-40 23Z" fill="#D2EADB" />
      <Circle cx={240} cy={512} r={12} fill="#9ED3B4" />
      <Circle cx={262} cy={524} r={9} fill="#B5DFC6" />
      <Circle cx={210} cy={530} r={10} fill="#9ED3B4" />
      <Circle cx={60} cy={322} r={11} fill="#9ED3B4" />
      <Path d="M110 120V78M110 78l-8 42M110 78l8 42M104 100h12" stroke={colors.navy} strokeWidth={2} fill="none" />
      {CAMPUS_PLACES.map((p) => {
        const g = prism(p.box);
        const sel = p.id === selectedId;
        return (
          <G key={p.id} onPress={() => onSelect(p)}>
            <Polygon points={g.top} fill={sel ? '#EEE9FF' : '#FFFFFF'} />
            <Polygon points={g.left} fill={sel ? '#C9BDFA' : '#D3D5F5'} />
            <Polygon points={g.right} fill={sel ? '#A996F5' : '#B9BCEE'} />
          </G>
        );
      })}
      {CAMPUS_PLACES.map((p) => {
        const w = p.name.length > 14 ? 96 : 76;
        return (
          <G key={`l-${p.id}`} onPress={() => onSelect(p)}>
            <Rect x={p.label.x - w / 2} y={p.label.y - 15} width={w} height={22} rx={11} fill={p.id === selectedId ? colors.navy : '#FFFFFF'} />
            <SvgText x={p.label.x} y={p.label.y} textAnchor="middle" fontSize={10} fontFamily="PlusJakartaSans_700Bold" fill={p.id === selectedId ? '#FFFFFF' : colors.navy}>
              {p.name.split(' – ')[0].slice(0, 16)}
            </SvgText>
          </G>
        );
      })}
      {CAMPUS_PLACES.filter((p) => p.id === selectedId).map((p) => {
        const { pin } = prism(p.box);
        return (
          <G key="pin">
            <Circle cx={pin.x} cy={pin.y} r={26} fill={colors.violet} opacity={0.18} />
            <Path
              d={`M${pin.x - 18} ${pin.y - 38}c0-10 8-18 18-18s18 8 18 18c0 13-18 32-18 32s-18-19-18-32Z`}
              fill={colors.violet}
              stroke="#FFFFFF"
              strokeWidth={3}
            />
            <Circle cx={pin.x} cy={pin.y - 38} r={6.5} fill="#FFFFFF" />
          </G>
        );
      })}
    </Svg>
  );
}

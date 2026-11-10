import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme';

export function ViewToggle({ value, onChange }: { value: 'grid' | 'list'; onChange: (v: 'grid' | 'list') => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: colors.chip, borderRadius: 999, padding: 3, gap: 2 }}>
      {(['grid', 'list'] as const).map((v) => (
        <Pressable
          key={v}
          accessibilityRole="radio"
          accessibilityLabel={v === 'grid' ? 'Grid view' : 'List view'}
          accessibilityState={{ selected: value === v }}
          onPress={() => onChange(v)}
          style={{ width: 44, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: value === v ? colors.navy : 'transparent' }}
        >
          <Icon name={v} size={17} color={value === v ? colors.white : colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

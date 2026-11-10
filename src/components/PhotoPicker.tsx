import React from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

export function PhotoPicker({ uri, onChange }: { uri: string | null; onChange: (uri: string | null) => void }) {
  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow access to add a photo.');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [4, 3] };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled) onChange(res.assets[0].uri);
  };
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          Alert.alert('Add photo', undefined, [
            { text: 'Camera', onPress: () => pick(true) },
            { text: 'Gallery', onPress: () => pick(false) },
            { text: 'Cancel', style: 'cancel' },
          ])
        }
        style={{ flex: 1, height: 96, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.dashed, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <Icon name="camera" size={26} color={colors.royal} />
        <Txt size={13} weight={700} color={colors.royal}>
          {uri ? 'Change photo' : 'Add photo'}
        </Txt>
      </Pressable>
      {uri ? (
        <View>
          <Image source={{ uri }} style={{ width: 96, height: 96, borderRadius: 18 }} />
          <Pressable
            accessibilityLabel="Remove photo"
            onPress={() => onChange(null)}
            style={{ position: 'absolute', right: -6, top: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.navy, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="close" size={12} color={colors.white} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

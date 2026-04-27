import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Phone, PhoneOff, Video } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { getThemeColors } from '../constants/Colors';

interface IncomingCallModalProps {
  visible: boolean;
  callerName: string;
  callType: 'audio' | 'video';
  onAccept: () => void;
  onDecline: () => void;
  accepting?: boolean;
  declining?: boolean;
}

export default function IncomingCallModal({
  visible,
  callerName,
  callType,
  onAccept,
  onDecline,
  accepting = false,
  declining = false,
}: IncomingCallModalProps) {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.iconWrap}>
            {callType === 'video' ? <Video size={24} color="#FFFFFF" /> : <Phone size={24} color="#FFFFFF" />}
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Incoming {callType === 'video' ? 'video' : 'audio'} call</Text>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {callerName}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>Answer now or decline.</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.declineBtn, declining && styles.disabled]}
              onPress={onDecline}
              disabled={accepting || declining}
              activeOpacity={0.9}
            >
              <PhoneOff size={16} color="#FFFFFF" />
              <Text style={styles.btnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn, accepting && styles.disabled]}
              onPress={onAccept}
              disabled={accepting || declining}
              activeOpacity={0.9}
            >
              <Phone size={16} color="#FFFFFF" />
              <Text style={styles.btnText}>{accepting ? 'Joining...' : 'Answer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,111,174,0.86)',
  },
  title: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '800',
  },
  name: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '900',
  },
  sub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  row: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  acceptBtn: { backgroundColor: '#22C55E' },
  declineBtn: { backgroundColor: '#EF4444' },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  disabled: { opacity: 0.7 },
});


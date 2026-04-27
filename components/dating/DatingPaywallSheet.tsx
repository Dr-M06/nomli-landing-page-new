import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';

type Props = {
  visible: boolean;
  contextTitle?: string;
  subtitle?: string;
  features?: string[];
  dealHighlight?: string;
  monthlyLabel?: string;
  annualLabel?: string;
  basePlanLabel?: string;
  onBasePlan?: () => void;
  basePlanAnnualLabel?: string;
  onBasePlanAnnual?: () => void;
  pricingNote?: string;
  onClose: () => void;
  onMonthly: () => void;
  onAnnual: () => void;
};

export default function DatingPaywallSheet({
  visible,
  contextTitle = 'Unlock Dating Pro',
  subtitle = 'See who liked you, unlock filters, unlimited likes, read receipts, and call access.',
  features = [
    'Unlimited likes',
    'Who liked you',
    'Advanced filters',
    'Online now filter',
    'Read receipts + calls',
  ],
  dealHighlight = '',
  monthlyLabel = 'Go Monthly - from $5.99/month',
  annualLabel = 'Go Annual - from $59.99/year',
  basePlanLabel = '',
  onBasePlan,
  basePlanAnnualLabel = '',
  onBasePlanAnnual,
  pricingNote = 'Final price is set by App Store/Google Play and may include local tax or VAT.',
  onClose,
  onMonthly,
  onAnnual,
}: Props) {
  const { isDarkMode } = useTheme();
  const colors = getThemeColors(isDarkMode);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <Text style={[styles.title, { color: colors.text }]}>{contextTitle}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>

          {dealHighlight ? (
            <View style={styles.dealPill}>
              <Text style={styles.dealPillText}>{dealHighlight}</Text>
            </View>
          ) : null}

          <View style={[styles.planBlock, { borderColor: colors.border }]}>
            <View style={styles.recommendedTag}>
              <Text style={styles.recommendedTagText}>RECOMMENDED</Text>
            </View>
            <TouchableOpacity style={[styles.cta, styles.primary]} onPress={onAnnual} activeOpacity={0.9}>
              <Text style={styles.ctaPrimaryText}>{annualLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cta, styles.secondary]} onPress={onMonthly} activeOpacity={0.9}>
              <Text style={styles.ctaSecondaryText}>{monthlyLabel}</Text>
            </TouchableOpacity>
          </View>

          {features.length > 0 ? (
            <View style={styles.featureList}>
              {features.slice(0, 3).map((feature) => (
                <Text key={feature} style={[styles.feature, { color: colors.textSecondary }]}>
                  • {feature}
                </Text>
              ))}
            </View>
          ) : null}

          {(basePlanLabel && onBasePlan) || (basePlanAnnualLabel && onBasePlanAnnual) ? (
            <View style={styles.otherOptionsSection}>
              <Text style={[styles.otherOptionsTitle, { color: colors.textSecondary }]}>Other options</Text>
              {basePlanLabel && onBasePlan ? (
                <TouchableOpacity style={styles.basePlanBtn} onPress={onBasePlan} activeOpacity={0.85}>
            <View style={styles.basePlanRow}>
              <Text style={styles.basePlanIcon}>💕</Text>
              <Text style={styles.basePlanText}>{basePlanLabel}</Text>
            </View>
                </TouchableOpacity>
              ) : null}
              {basePlanAnnualLabel && onBasePlanAnnual ? (
                <TouchableOpacity style={styles.basePlanBtn} onPress={onBasePlanAnnual} activeOpacity={0.85}>
            <View style={styles.basePlanRow}>
              <Text style={styles.basePlanIcon}>🌹</Text>
              <Text style={styles.basePlanText}>{basePlanAnnualLabel}</Text>
            </View>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <Text style={[styles.pricingNote, { color: colors.textSecondary }]}>{pricingNote}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeText, { color: colors.textSecondary }]}>Not now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 18,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  featureList: {
    marginTop: 12,
    gap: 4,
  },
  feature: {
    fontSize: 13,
    fontWeight: '600',
  },
  planBlock: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    backgroundColor: 'rgba(255, 111, 174, 0.06)',
  },
  recommendedTag: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FF6FAE',
  },
  recommendedTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  dealPill: {
    marginTop: 10,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 111, 174, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 111, 174, 0.35)',
  },
  dealPillText: {
    color: '#FFD8EA',
    fontSize: 12,
    fontWeight: '800',
  },
  cta: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    marginTop: 6,
  },
  primary: {
    backgroundColor: '#FF6FAE',
  },
  secondary: {
    backgroundColor: '#111827',
  },
  ctaPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  ctaSecondaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  basePlanBtn: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  basePlanText: {
    color: '#CBD5E1',
    fontSize: 12.5,
    fontWeight: '700',
  },
  basePlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  basePlanIcon: {
    fontSize: 14,
  },
  otherOptionsSection: {
    marginTop: 10,
  },
  otherOptionsTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  pricingNote: {
    marginTop: 8,
    fontSize: 10.5,
    lineHeight: 14,
    textAlign: 'center',
    fontWeight: '500',
    opacity: 0.85,
  },
  closeText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

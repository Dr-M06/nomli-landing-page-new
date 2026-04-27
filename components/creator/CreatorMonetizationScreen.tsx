import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getThemeColors } from '../../constants/Colors';
import { FontFamily } from '../../constants/Theme';

type TabId = 'overview' | 'scoring' | 'payouts' | 'simulator' | 'backend';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'simulator', label: 'Simulator' },
  { id: 'backend', label: 'Backend' },
];

function fmtNaira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function CreatorMonetizationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isDarkMode } = useTheme();
  const c = getThemeColors(isDarkMode);
  const [tab, setTab] = useState<TabId>('overview');

  const [subs, setSubs] = useState(50);
  const [price, setPrice] = useState(3500);
  const [creators, setCreators] = useState(10);
  const [scoreShare, setScoreShare] = useState(10);

  const sim = useMemo(() => {
    const total = subs * price;
    const pool = total * 0.35;
    const platform = total * 0.5;
    const growth = total * 0.15;
    const myPayout = pool * (scoreShare / 100);
    const avgPayout = creators > 0 ? pool / creators : 0;
    return { total, pool, platform, growth, myPayout, avgPayout };
  }, [subs, price, creators, scoreShare]);

  const cardBg = c.neutral.surfaceVariant;
  const border = c.neutral.borderLight;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: c.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingBottom: 10,
          gap: 4,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: border,
        },
        headerTitle: {
          flex: 1,
          fontFamily: FontFamily.bold,
          fontSize: 17,
          color: c.neutral.text,
        },
        tabScroll: { maxHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border },
        tabScrollContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 4, flexDirection: 'row', alignItems: 'center' },
        tab: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        tabActive: { borderBottomColor: c.neutral.text },
        tabText: { fontFamily: FontFamily.regular, fontSize: 13, color: c.neutral.textSecondary },
        tabTextActive: { fontFamily: FontFamily.semibold, color: c.neutral.text },
        body: { flex: 1 },
        bodyContent: { padding: 16, paddingBottom: insets.bottom + 32 },
        section: { marginBottom: 24 },
        sectionTitle: {
          fontFamily: FontFamily.medium,
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: c.neutral.textTertiary,
          marginBottom: 12,
        },
        cardsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
        card: {
          backgroundColor: cardBg,
          borderRadius: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
          flexGrow: 1,
          minWidth: (width - 16 * 2 - 10) / 2,
          maxWidth: width - 32,
        },
        cardFull: { minWidth: width - 32, maxWidth: width - 32 },
        cardLabel: { fontFamily: FontFamily.regular, fontSize: 12, color: c.neutral.textSecondary, marginBottom: 4 },
        cardValue: { fontFamily: FontFamily.medium, fontSize: 16, color: c.neutral.text, marginTop: 4 },
        cardValueBig: { fontFamily: FontFamily.medium, fontSize: 22, color: c.neutral.text, lineHeight: 26 },
        cardSub: { fontFamily: FontFamily.regular, fontSize: 12, color: c.neutral.textTertiary, marginTop: 4, lineHeight: 18 },
        pill: {
          alignSelf: 'flex-start',
          marginTop: 10,
          paddingVertical: 3,
          paddingHorizontal: 8,
          borderRadius: 99,
        },
        pillText: { fontFamily: FontFamily.medium, fontSize: 11 },
        pillPro: { backgroundColor: isDarkMode ? 'rgba(91, 159, 255, 0.22)' : 'rgba(59, 130, 246, 0.12)' },
        pillProText: { color: isDarkMode ? '#93C5FD' : '#1D4ED8' },
        pillFree: {
          backgroundColor: cardBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.neutral.border,
        },
        pillFreeText: { color: c.neutral.textSecondary },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: border,
        },
        rowLast: { borderBottomWidth: 0 },
        rowLabel: { fontFamily: FontFamily.regular, fontSize: 13, color: c.neutral.textSecondary, flex: 1, paddingRight: 8 },
        rowVal: { fontFamily: FontFamily.medium, fontSize: 14, color: c.neutral.text, flexShrink: 1, textAlign: 'right' },
        highlight: { color: isDarkMode ? '#93C5FD' : '#2563EB', fontFamily: FontFamily.medium },
        check: { color: c.success.main, fontFamily: FontFamily.medium },
        cross: { color: c.error.main, fontFamily: FontFamily.medium },
        formulaBox: {
          backgroundColor: cardBg,
          borderRadius: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
        },
        formulaText: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 22, color: c.neutral.textSecondary },
        formulaBold: { fontFamily: FontFamily.medium, color: c.neutral.text },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: border, marginVertical: 20 },
        tableHeader: {
          fontFamily: FontFamily.medium,
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: c.neutral.textTertiary,
          marginBottom: 8,
        },
        tableRow: {
          flexDirection: 'row',
          paddingVertical: 8,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: border,
          gap: 8,
        },
        tableCellName: { fontFamily: FontFamily.medium, fontSize: 13, color: c.neutral.text, width: '32%' },
        tableCellVal: { fontFamily: FontFamily.regular, fontSize: 13, color: c.neutral.textSecondary, flex: 1 },
        rangeRow: { marginVertical: 10 },
        rangeLabel: { fontFamily: FontFamily.regular, fontSize: 13, color: c.neutral.textSecondary, marginBottom: 6 },
        rangeMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
        rangeValue: { fontFamily: FontFamily.medium, fontSize: 13, color: c.neutral.text },
        simBig: { fontFamily: FontFamily.medium, fontSize: 26, color: c.success.main, marginTop: 4 },
        simMid: { fontFamily: FontFamily.medium, fontSize: 22, color: c.neutral.text, marginTop: 4 },
        simNote: { fontFamily: FontFamily.regular, fontSize: 12, color: c.neutral.textTertiary, marginTop: 4 },
        simGrid: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
        simBox: {
          backgroundColor: cardBg,
          borderRadius: 12,
          padding: 14,
          flex: 1,
          minWidth: (width - 32 - 10) / 2,
        },
      }),
    [c, isDarkMode, cardBg, border, width, insets.bottom]
  );

  const backendRows = [
    ['users', 'id, is_pro, pro_since, status'],
    ['posts', 'id, creator_id, created_at, is_flagged'],
    ['post_metrics', 'post_id, date, views, likes, comments, shares, watch_time'],
    ['creator_scores', 'creator_id, month, raw_score, adjusted_score'],
    ['payouts', 'creator_id, month, amount, status, method'],
    ['gift_ledger', 'sender_id, receiver_id, amount, token_value, created_at'],
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={26} color={c.neutral.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Creator earnings
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabScrollContent}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {tab === 'overview' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Two earn layers</Text>
              <View style={styles.cardsRow}>
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Layer 1 — Everyone</Text>
                  <Text style={styles.cardValue}>Livestream gifts</Text>
                  <Text style={styles.cardSub}>Free users can receive gifts from any viewer at any time</Text>
                  <View style={[styles.pill, styles.pillFree]}>
                    <Text style={[styles.pillText, styles.pillFreeText]}>Free</Text>
                  </View>
                </View>
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Layer 2 — Pro only</Text>
                  <Text style={styles.cardValue}>Content earnings</Text>
                  <Text style={styles.cardSub}>Earn from post engagement via monthly creator pool</Text>
                  <View style={[styles.pill, styles.pillPro]}>
                    <Text style={[styles.pillText, styles.pillProText]}>Pro required</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Revenue flow</Text>
              <View style={styles.formulaBox}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Pro subscriptions (e.g. ₦3,500/mo)</Text>
                  <Text style={[styles.rowVal, styles.highlight]}>100%</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>→ Platform ops + profit</Text>
                  <Text style={styles.rowVal}>50%</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>→ Creator pool</Text>
                  <Text style={[styles.rowVal, styles.highlight]}>35%</Text>
                </View>
                <View style={[styles.row, styles.rowLast]}>
                  <Text style={styles.rowLabel}>→ Growth / bonuses</Text>
                  <Text style={styles.rowVal}>15%</Text>
                </View>
              </View>
              <Text style={[styles.cardSub, { marginTop: 8, paddingHorizontal: 4 }]}>
                Gift revenue: 70% to creator · 30% to platform
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pro eligibility gate</Text>
              <View style={[styles.card, styles.cardFull]}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Account age</Text>
                  <Text style={styles.rowVal}>≥ 7 days</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Followers</Text>
                  <Text style={styles.rowVal}>
                    ≥ 500 <Text style={{ fontWeight: '400', color: c.neutral.textTertiary }}>OR</Text> Monthly views ≥
                    2,000
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>No active violations</Text>
                  <Text style={[styles.rowVal, styles.check]}>✓ required</Text>
                </View>
                <View style={[styles.row, styles.rowLast]}>
                  <Text style={styles.rowLabel}>Payment method</Text>
                  <Text style={styles.rowVal}>Verified</Text>
                </View>
              </View>
              <Text style={[styles.cardSub, { marginTop: 8, paddingHorizontal: 4 }]}>
                Thresholds are tuned for early growth (e.g. ~3k user base). Adjust in product / admin as you scale.
              </Text>
            </View>
          </>
        )}

        {tab === 'scoring' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Engagement score formula</Text>
              <View style={styles.formulaBox}>
                <Text style={styles.formulaText}>
                  <Text style={styles.formulaBold}>score</Text> ={'\n'}
                  {'  '}(views × <Text style={styles.formulaBold}>0.1</Text>) +{'\n'}
                  {'  '}(likes × <Text style={styles.formulaBold}>1.0</Text>) +{'\n'}
                  {'  '}(comments × <Text style={styles.formulaBold}>2.5</Text>) +{'\n'}
                  {'  '}(shares × <Text style={styles.formulaBold}>4.0</Text>) +{'\n'}
                  {'  '}(watch_time_seconds × <Text style={styles.formulaBold}>0.03</Text>)
                </Text>
              </View>
              <Text style={[styles.cardSub, { marginTop: 8, paddingHorizontal: 4 }]}>
                Weighted toward shares and comments — harder to fake, more valuable for growth.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Score modifiers</Text>
              <View style={[styles.card, styles.cardFull]}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Watch time ratio &gt; 60%</Text>
                  <Text style={[styles.rowVal, styles.check]}>+20%</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Share rate &gt; 5%</Text>
                  <Text style={[styles.rowVal, styles.check]}>+15%</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>New follower from post</Text>
                  <Text style={[styles.rowVal, styles.check]}>+10 pts each</Text>
                </View>
                <View style={[styles.row, styles.rowLast]}>
                  <Text style={styles.rowLabel}>Flagged / reported</Text>
                  <Text style={[styles.rowVal, styles.cross]}>−100% (excluded)</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Anti-fraud rules</Text>
              <View style={[styles.card, styles.cardFull]}>
                <Text style={styles.formulaText}>
                  Flag creator if: same IP ≥ 30% of views · avg watch time &lt; 2s · views spike &gt; 10× daily avg ·
                  like rate &gt; 40% of views (bot signal).{'\n\n'}
                  Flagged creators: score zeroed for that month, notified, can appeal.
                </Text>
              </View>
            </View>
          </>
        )}

        {tab === 'payouts' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Monthly payout formula</Text>
              <View style={styles.formulaBox}>
                <Text style={styles.formulaText}>
                  <Text style={styles.formulaBold}>creator_share</Text> = creator_score ÷ total_all_scores{'\n'}
                  <Text style={styles.formulaBold}>payout</Text> = creator_share × monthly_creator_pool
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payout rules</Text>
              <View style={[styles.card, styles.cardFull]}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Minimum payout</Text>
                  <Text style={styles.rowVal}>₦5,000 / $3</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Payout cycle</Text>
                  <Text style={styles.rowVal}>Monthly (Net 15)</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Methods</Text>
                  <Text style={styles.rowVal}>Bank transfer / Paystack</Text>
                </View>
                <View style={[styles.row, styles.rowLast]}>
                  <Text style={styles.rowLabel}>Unpaid balance</Text>
                  <Text style={styles.rowVal}>Rolls over</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gift payout rules</Text>
              <View style={[styles.card, styles.cardFull]}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Creator cut</Text>
                  <Text style={[styles.rowVal, styles.check]}>70%</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Platform cut</Text>
                  <Text style={styles.rowVal}>30%</Text>
                </View>
                <View style={[styles.row, styles.rowLast]}>
                  <Text style={styles.rowLabel}>Payout timing</Text>
                  <Text style={styles.rowVal}>Instant to wallet, withdraw monthly</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Locked earnings teaser (pre-upgrade)</Text>
              <View style={[styles.card, styles.cardFull]}>
                <Text style={styles.formulaText}>
                  Free users with high engagement see a locked dashboard:{'\n\n'}
                  <Text style={styles.formulaBold}>
                    &quot;You would have earned ₦8,200 last month — upgrade to Pro to unlock.&quot;
                  </Text>
                  {'\n\n'}
                  Calculate from real engagement score. Even small numbers convert.
                </Text>
              </View>
            </View>
          </>
        )}

        {tab === 'simulator' && (
          <>
            <Text style={[styles.sectionTitle, { marginBottom: 16, textTransform: 'none', fontSize: 14 }]}>
              Payout estimator — tweak inputs to see earnings
            </Text>

            <View style={styles.rangeRow}>
              <Text style={styles.rangeLabel}>Pro subscribers</Text>
              <Slider
                minimumValue={10}
                maximumValue={500}
                step={1}
                value={subs}
                onValueChange={setSubs}
                minimumTrackTintColor={c.primary.main}
                maximumTrackTintColor={c.neutral.border}
                thumbTintColor={c.primary.main}
              />
              <View style={styles.rangeMeta}>
                <Text style={styles.rangeValue}>{Math.round(subs)}</Text>
              </View>
            </View>

            <View style={styles.rangeRow}>
              <Text style={styles.rangeLabel}>Pro price (₦/mo)</Text>
              <Slider
                minimumValue={1000}
                maximumValue={10000}
                step={500}
                value={price}
                onValueChange={setPrice}
                minimumTrackTintColor={c.primary.main}
                maximumTrackTintColor={c.neutral.border}
                thumbTintColor={c.primary.main}
              />
              <View style={styles.rangeMeta}>
                <Text style={styles.rangeValue}>₦{Math.round(price).toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.rangeRow}>
              <Text style={styles.rangeLabel}>Active creators</Text>
              <Slider
                minimumValue={1}
                maximumValue={100}
                step={1}
                value={creators}
                onValueChange={setCreators}
                minimumTrackTintColor={c.primary.main}
                maximumTrackTintColor={c.neutral.border}
                thumbTintColor={c.primary.main}
              />
              <View style={styles.rangeMeta}>
                <Text style={styles.rangeValue}>{Math.round(creators)}</Text>
              </View>
            </View>

            <View style={styles.rangeRow}>
              <Text style={styles.rangeLabel}>Your score share</Text>
              <Slider
                minimumValue={1}
                maximumValue={50}
                step={1}
                value={scoreShare}
                onValueChange={setScoreShare}
                minimumTrackTintColor={c.primary.main}
                maximumTrackTintColor={c.neutral.border}
                thumbTintColor={c.primary.main}
              />
              <View style={styles.rangeMeta}>
                <Text style={styles.rangeValue}>{Math.round(scoreShare)}%</Text>
              </View>
            </View>

            <View style={{ marginTop: 16 }}>
              <View style={styles.simBox}>
                <Text style={styles.cardLabel}>Creator pool this month</Text>
                <Text style={styles.simBig}>{fmtNaira(sim.pool)}</Text>
              </View>
              <View style={styles.simGrid}>
                <View style={styles.simBox}>
                  <Text style={styles.cardLabel}>Your payout</Text>
                  <Text style={styles.simMid}>{fmtNaira(sim.myPayout)}</Text>
                  <Text style={styles.simNote}>At {Math.round(scoreShare)}% score share</Text>
                </View>
                <View style={styles.simBox}>
                  <Text style={styles.cardLabel}>Avg creator payout</Text>
                  <Text style={styles.simMid}>{fmtNaira(sim.avgPayout)}</Text>
                  <Text style={styles.simNote}>Equal share baseline</Text>
                </View>
              </View>
              <Text style={[styles.cardSub, { marginTop: 10, paddingHorizontal: 4 }]}>
                Platform revenue: <Text style={{ fontFamily: FontFamily.medium }}>{fmtNaira(sim.platform)}</Text> ·
                Growth fund: <Text style={{ fontFamily: FontFamily.medium }}>{fmtNaira(sim.growth)}</Text>
              </Text>
            </View>
          </>
        )}

        {tab === 'backend' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Core tables</Text>
              <Text style={styles.tableHeader}>Table · Key fields</Text>
              {backendRows.map(([name, fields]) => (
                <View key={name} style={styles.tableRow}>
                  <Text style={styles.tableCellName}>{name}</Text>
                  <Text style={styles.tableCellVal}>{fields}</Text>
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cron jobs</Text>
              <View style={[styles.card, styles.cardFull]}>
                <Text style={[styles.formulaText, { lineHeight: 26 }]}>
                  <Text style={styles.formulaBold}>Daily (midnight)</Text> — aggregate post_metrics, run fraud checks,
                  update creator_scores{'\n\n'}
                  <Text style={styles.formulaBold}>Monthly (1st, 9am)</Text> — calculate creator_pool from last month
                  revenue, rank creators, write payout records with status=pending{'\n\n'}
                  <Text style={styles.formulaBold}>Monthly (15th)</Text> — process payouts, update status=paid, send
                  notifications
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Creator dashboard — what to show</Text>
              <View style={[styles.card, styles.cardFull]}>
                <Text style={[styles.formulaText, { lineHeight: 26 }]}>
                  Estimated earnings this month (live) · Engagement score · Score rank among creators · Breakdown by
                  post · Watch time avg · Tips to improve (e.g. &quot;Posts with shares earn 4× more&quot;) · Payout
                  history
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

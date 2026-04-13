import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, Lock, Check, Info } from 'lucide-react-native';
import { FontFamily } from '../../constants/Theme';
import { getFloatingTabBarReservedHeight } from '../../utils/tabBarInset';
import Toast from 'react-native-toast-message';
import { useCreatorMonetization } from '../../hooks/useCreatorMonetization';
import { tokensToUsd } from '../../utils/creatorMonetizationService';

/** Dark creator shell with mint highlights + lemon primary CTAs (no pink). */
const D = {
  screen: '#0E1211',
  card: '#161C1A',
  cardBorder: '#252E2C',
  rowBorder: '#1E2523',
  backCircle: '#1A2422',
  mint: '#6BC9B0',
  mintBright: '#9FE8D4',
  mintSoft: '#0F1F1C',
  mintBorder: '#284038',
  tipIconBg: '#1A2E28',
  lemon: '#E4EB8A',
  ctaText: '#121A18',
  pillMintBg: '#142620',
  green: '#7BC4A8',
  greenBg: '#0F221C',
  amber: '#D4A84B',
  amberBg: '#2A2210',
  text: '#F4F6F5',
  muted: '#8A9390',
  muted2: '#6B7572',
  meta: '#505A57',
  subtle: '#454D4B',
  segBg: '#141A18',
};

/** If `payment_plans` is missing or slow to load; match App Store / Play list price. */
const CREATOR_PRO_FALLBACK_USD = 4.99;
/** Yearly SKU list price (add matching IAP + `payment_plans` when you ship annual). */
const CREATOR_PRO_ANNUAL_USD = 44.99;

const H_PAD = 16;
const TAB_ROW_GAP = 6;

export type CreatorTabId = 'locked' | 'dashboard' | 'posts' | 'gifts' | 'history' | 'upgrade';

const TAB_LABELS: Record<CreatorTabId, string> = {
  locked: 'Teaser',
  dashboard: 'Home',
  posts: 'Posts',
  gifts: 'Gifts',
  history: 'Payouts',
  upgrade: 'Pro',
};

const TAB_ROWS: CreatorTabId[][] = [
  ['locked', 'dashboard', 'posts'],
  ['gifts', 'history', 'upgrade'],
];

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

/** Estimates & small balances: extra fraction digits under $1 so pool math is not shown as $0.00. */
function formatCreatorUsd(n: number) {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  if (abs === 0) return '$0.00';
  if (abs < 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(n);
  }
  return formatUsd(n);
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatRelative(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function giftInitials(description: string | null | undefined): string {
  if (!description) return '?';
  const parts = description.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return description.slice(0, 2).toUpperCase();
}

function thumbColorForPostId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  const r = 18 + (h & 0x1f) * 3;
  const g = 22 + ((h >> 5) & 0x1f) * 3;
  const b = 26 + ((h >> 10) & 0x1f) * 3;
  return `rgb(${Math.min(55, r)},${Math.min(60, g)},${Math.min(65, b)})`;
}

function SectionHead({ children }: { children: string }) {
  return <Text style={styles.sectionHead}>{children}</Text>;
}

function TopBar({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.topbar}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
        <ChevronLeft size={18} color={D.text} strokeWidth={2.2} />
      </Pressable>
      <Text style={styles.topbarTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.topbarRight}>{right ?? <View style={{ width: 28 }} />}</View>
    </View>
  );
}

function ProPill() {
  return (
    <View style={styles.proPill}>
      <Text style={styles.proPillText}>Pro</Text>
    </View>
  );
}

function CardD({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.cardD, style]}>{children}</View>;
}

function RowD({ label, value, valueColor, isLast }: { label: string; value: string; valueColor?: string; isLast?: boolean }) {
  return (
    <View style={[styles.rowD, isLast && styles.rowDLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowVal, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export type CreatorMonetizationFlowProps = {
  /** Used only until the first snapshot loads (e.g. session hint). RPC is source of truth after. */
  initialProUnlocked?: boolean;
};

export default function CreatorMonetizationFlow({ initialProUnlocked = false }: CreatorMonetizationFlowProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    snapshot,
    loading,
    checkoutLoading,
    creatorPlan,
    creatorAnnualPlan,
    refetch,
    subscribeCreatorPro,
  } = useCreatorMonetization();
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<CreatorTabId>('dashboard');
  const [postRange, setPostRange] = useState<'month' | 'last' | 'all'>('month');

  useEffect(() => {
    if (!loading) setHydrated(true);
  }, [loading]);

  const proUnlocked = !hydrated
    ? initialProUnlocked
    : snapshot !== null
      ? snapshot.creator_pro_active
      : initialProUnlocked;

  const rate = snapshot?.token_usd_rate ?? 0.01;
  const lastMonthCombinedUsd = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.estimated_content_usd_last_month + snapshot.estimated_gift_usd_last_month;
  }, [snapshot]);
  const thisMonthCombinedUsd = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.estimated_content_usd_month + snapshot.estimated_gift_usd_month;
  }, [snapshot]);
  const walletGiftUsd = useMemo(() => {
    if (!snapshot) return 0;
    const tokens = snapshot.wallet_earned_token_balance > 0 ? snapshot.wallet_earned_token_balance : snapshot.wallet_token_balance;
    return tokensToUsd(tokens, rate);
  }, [snapshot, rate]);
  const giftAllTimeUsd = useMemo(() => (snapshot ? tokensToUsd(snapshot.gift_tokens_all_time, rate) : 0), [snapshot, rate]);
  const breakdownBars = useMemo(() => {
    if (!snapshot?.breakdown_month?.length) return [];
    const pts = snapshot.breakdown_month.map((b) => Math.max(0, b.points));
    const max = Math.max(...pts, 1);
    return snapshot.breakdown_month.map((b, i) => ({
      label: b.label,
      ptsLabel: `${Math.round(b.points).toLocaleString()} pts`,
      pct: Math.round((Math.max(0, b.points) / max) * 100),
      key: `${b.label}-${i}`,
    }));
  }, [snapshot]);

  const activeTab: CreatorTabId = proUnlocked ? tab : 'upgrade';

  const bottomPad = getFloatingTabBarReservedHeight(insets.bottom) + 24;
  const colW = (width - H_PAD * 2 - 8) / 2;

  const onBack = useCallback(() => router.back(), [router]);

  const titleAndPill = useMemo(() => {
    switch (activeTab) {
      case 'locked':
        return { title: 'Earnings', right: null as React.ReactNode };
      case 'dashboard':
        return { title: 'Creator dashboard', right: <ProPill /> };
      case 'posts':
        return { title: 'Post earnings', right: <ProPill /> };
      case 'gifts':
        return { title: 'Gift earnings', right: <View style={{ width: 28 }} /> };
      case 'history':
        return { title: 'Payout history', right: <View style={{ width: 28 }} /> };
      case 'upgrade':
        return { title: 'Go Pro', right: <View style={{ width: 28 }} /> };
      default:
        return { title: 'Creator', right: null };
    }
  }, [activeTab]);

  const toastSoon = (msg: string) =>
    Toast.show({ type: 'info', text1: msg, text2: 'Coming soon.', position: 'bottom' });

  const subscribePriceLabel = useMemo(() => {
    if (!creatorPlan) return `$${CREATOR_PRO_FALLBACK_USD.toFixed(2)}`;
    const n = creatorPlan.currency === 'NGN' ? creatorPlan.price_ngn : creatorPlan.price_usd;
    if (creatorPlan.currency === 'NGN') {
      return `₦${Number(n).toLocaleString()}`;
    }
    return `$${Number(n).toFixed(Number(n) % 1 === 0 ? 0 : 2)}`;
  }, [creatorPlan]);

  const annualPayTeaserLabel = useMemo(() => {
    let annualUsd = CREATOR_PRO_ANNUAL_USD;
    if (creatorAnnualPlan && creatorAnnualPlan.currency !== 'NGN') {
      const a = Number(creatorAnnualPlan.price_usd);
      if (Number.isFinite(a) && a > 0) annualUsd = a;
    }
    let monthlyUsd = CREATOR_PRO_FALLBACK_USD;
    if (creatorPlan && creatorPlan.currency !== 'NGN') {
      const n = Number(creatorPlan.price_usd);
      if (Number.isFinite(n) && n > 0) monthlyUsd = n;
    }
    const vsPayMonthly = monthlyUsd * 12;
    const savePct =
      vsPayMonthly > annualUsd
        ? Math.round(((vsPayMonthly - annualUsd) / vsPayMonthly) * 100)
        : 0;
    const price = `$${annualUsd.toFixed(2)}`;
    if (savePct >= 1) {
      return `Save ${savePct}% — Pay annually (${price})`;
    }
    return `Pay annually (${price})`;
  }, [creatorPlan, creatorAnnualPlan]);

  const payFootNote = useMemo(() => {
    if (Platform.OS === 'ios') {
      return 'Cancel anytime · Billed through Apple';
    }
    if (Platform.OS === 'android') {
      return 'Cancel anytime · Billed through Google Play';
    }
    return 'Cancel anytime · Secure payment via Stripe';
  }, []);

  const subscribeLoadingLabel = useMemo(() => {
    if (Platform.OS === 'ios') return 'Opening App Store…';
    if (Platform.OS === 'android') return 'Opening Google Play…';
    return 'Opening checkout…';
  }, []);

  async function onSubscribe() {
    const res = await subscribeCreatorPro('monthly');
    if (res.ok) {
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        Toast.show({
          type: 'success',
          text1: 'Creator Pro',
          text2: 'Your subscription is active.',
          position: 'bottom',
        });
      } else {
        Toast.show({
          type: 'info',
          text1: 'Complete checkout',
          text2: 'Finish payment in the browser. Creator Pro unlocks when Stripe confirms.',
          position: 'bottom',
        });
      }
      refetch();
    } else {
      Toast.show({ type: 'error', text1: res.error || 'Checkout failed', position: 'bottom' });
    }
  }

  async function onSubscribeYearly() {
    const res = await subscribeCreatorPro('yearly');
    if (res.ok) {
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        Toast.show({
          type: 'success',
          text1: 'Creator Pro',
          text2: 'Your subscription is active.',
          position: 'bottom',
        });
      } else {
        Toast.show({
          type: 'info',
          text1: 'Complete checkout',
          text2: 'Finish payment in the browser. Creator Pro unlocks when Stripe confirms.',
          position: 'bottom',
        });
      }
      refetch();
    } else {
      Toast.show({ type: 'error', text1: res.error || 'Checkout failed', position: 'bottom' });
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: D.screen }]}>
      <StatusBar style="light" />

      {proUnlocked ? (
        <View style={styles.tabGrid}>
          {TAB_ROWS.map((row, ri) => (
            <View key={ri} style={styles.tabRow}>
              {row.map((id) => {
                const on = id === tab;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setTab(id)}
                    style={[styles.tabChip, on && styles.tabChipOn]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.tabChipText, on && styles.tabChipTextOn]} numberOfLines={1}>
                      {TAB_LABELS[id]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      <TopBar title={titleAndPill.title} onBack={onBack} right={titleAndPill.right} />

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={D.mint} />
          </View>
        ) : null}
        {activeTab === 'locked' && (
          <>
            <SectionHead>Your potential</SectionHead>
            <View style={styles.lockOverlay}>
              <View style={styles.lockIconWrap}>
                <Lock size={22} color={D.mint} strokeWidth={1.75} />
              </View>
              <Text style={styles.lockSub}>Last month you would have earned</Text>
              <Text style={styles.bigNumAccent}>{formatCreatorUsd(lastMonthCombinedUsd)}</Text>
              <Text style={styles.lockHint}>from your content engagement and gifts (est.)</Text>
              <View style={styles.stat3}>
                {[
                  [formatCount(snapshot?.views_last_month ?? 0), 'views'],
                  [formatCount(snapshot?.likes_last_month ?? 0), 'likes'],
                  [formatCount(snapshot?.comments_last_month ?? 0), 'comments'],
                ].map(([v, l]) => (
                  <View key={l} style={styles.statCell}>
                    <Text style={styles.statVal}>{v}</Text>
                    <Text style={styles.statLbl}>{l}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={styles.upgradeBtn} activeOpacity={0.9} onPress={() => setTab('upgrade')}>
                <Text style={styles.upgradeBtnTxt}>Unlock earnings — Go Pro</Text>
              </TouchableOpacity>
              <Text style={styles.priceHint}>
                {`${subscribePriceLabel}/month · Cancel anytime`}
              </Text>
            </View>
            <SectionHead>Gift earnings</SectionHead>
            <CardD>
              <RowD label="Wallet balance (est.)" value={formatCreatorUsd(walletGiftUsd)} valueColor={D.mintBright} />
              <RowD label="Total received (all time, est.)" value={formatCreatorUsd(giftAllTimeUsd)} />
              <RowD label="Min. withdrawal" value={formatUsd(2)} valueColor={D.muted} isLast />
            </CardD>
            <View style={{ paddingHorizontal: H_PAD, paddingBottom: 16 }}>
              <TouchableOpacity style={styles.outlineWithdraw} activeOpacity={0.85} onPress={() => toastSoon('Withdraw')}>
                <Text style={styles.outlineWithdrawTxt}>Withdraw gift balance</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {activeTab === 'dashboard' && (
          <>
            <View style={[styles.estimateRow, { paddingHorizontal: H_PAD }]}>
              <Text style={styles.bigNumAccent}>{formatCreatorUsd(thisMonthCombinedUsd)}</Text>
              <Text style={styles.estLbl}>est. this month</Text>
            </View>
            <Text style={[styles.subline, { paddingHorizontal: H_PAD }]}>Updates daily · Paid out on the 15th</Text>
            <View style={[styles.metricGrid, { paddingHorizontal: H_PAD, gap: 8 }]}>
              <View style={{ width: colW }}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLbl}>Engagement score</Text>
                  <Text style={styles.metricVal}>
                    {snapshot ? Math.round(snapshot.engagement_score_month).toLocaleString() : '—'}
                  </Text>
                </View>
              </View>
              <View style={{ width: colW }}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLbl}>Rank</Text>
                  <Text style={[styles.metricVal, { color: D.mintBright }]}>—</Text>
                </View>
              </View>
              <View style={{ width: colW }}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLbl}>Views this month</Text>
                  <Text style={styles.metricVal}>{formatCount(snapshot?.views_month ?? 0)}</Text>
                </View>
              </View>
              <View style={{ width: colW }}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLbl}>Likes this month</Text>
                  <Text style={styles.metricVal}>{formatCount(snapshot?.likes_month ?? 0)}</Text>
                </View>
              </View>
            </View>
            <SectionHead>Score breakdown</SectionHead>
            {breakdownBars.map((row) => (
              <View key={row.key} style={[styles.barWrap, { paddingHorizontal: H_PAD }]}>
                <View style={styles.barLblRow}>
                  <Text style={styles.barLbl}>{row.label}</Text>
                  <Text style={[styles.barLbl, { color: D.mintBright, fontFamily: FontFamily.semibold }]}>
                    {row.ptsLabel}
                  </Text>
                </View>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${row.pct}%` }]} />
                </View>
              </View>
            ))}
            <View style={[styles.tipCard, { marginHorizontal: H_PAD }]}>
              <View style={styles.tipIcon}>
                <Info size={14} color={D.mint} strokeWidth={2} />
              </View>
              <Text style={styles.tipTxt}>
                <Text style={{ color: D.mintBright, fontFamily: FontFamily.semibold }}>Weekly tip — </Text>
                Your watch time is great. Now focus on shares — end videos with “Send this to someone who needs
                this.”
              </Text>
            </View>
            <View style={{ height: 16 }} />
          </>
        )}

        {activeTab === 'posts' && (
          <>
            <View style={[styles.seg, { marginHorizontal: H_PAD }]}>
              {(['month', 'last', 'all'] as const).map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.segBtn, postRange === k && styles.segBtnOn]}
                  onPress={() => setPostRange(k)}
                >
                  <Text style={[styles.segBtnTxt, postRange === k && styles.segBtnTxtOn]}>
                    {k === 'month' ? 'Month' : k === 'last' ? 'Last' : 'All'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {postRange !== 'month' ? (
              <Text style={[styles.rangeHint, { paddingHorizontal: H_PAD }]}>
                Estimates use this calendar month; Last / All coming soon.
              </Text>
            ) : null}
            <SectionHead>Top earning posts</SectionHead>
            {(snapshot?.top_posts?.length ?? 0) === 0 ? (
              <Text style={[styles.emptyHint, { paddingHorizontal: H_PAD }]}>No posts this month yet.</Text>
            ) : (
              (snapshot?.top_posts ?? []).map((p, i, arr) => (
                <View
                  key={p.post_id || String(i)}
                  style={[styles.postRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <View
                    style={[
                      styles.postThumb,
                      { backgroundColor: p.post_id ? thumbColorForPostId(p.post_id) : '#1a2220' },
                    ]}
                  />
                  <View style={styles.postInfo}>
                    <Text style={styles.postTitle} numberOfLines={1}>
                      {p.title_snippet?.trim() || 'Post'}
                    </Text>
                    <Text style={styles.postMeta}>
                      {formatCount(p.views_count)} views · {formatCount(p.likes_count)} likes ·{' '}
                      {formatCount(p.comments_count)} comments
                    </Text>
                  </View>
                  <Text style={styles.postEarn}>{formatCreatorUsd(p.est_usd)}</Text>
                </View>
              ))
            )}
            <View style={{ paddingHorizontal: H_PAD, paddingVertical: 12 }}>
              <View style={styles.totalsRow}>
                <View>
                  <Text style={styles.totalsLbl}>Total from posts</Text>
                  <Text style={styles.totalsVal}>{formatCreatorUsd(snapshot?.estimated_content_usd_month ?? 0)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.totalsLbl}>Gift earnings (est.)</Text>
                  <Text style={[styles.totalsVal, { color: D.mintBright }]}>
                    {formatCreatorUsd(snapshot?.estimated_gift_usd_month ?? 0)}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}

        {activeTab === 'gifts' && (
          <>
            <View style={[styles.estimateRow, { paddingHorizontal: H_PAD }]}>
              <Text style={[styles.bigNumAccent, { color: D.mintBright }]}>{formatCreatorUsd(walletGiftUsd)}</Text>
              <Text style={styles.estLbl}>wallet (est. USD)</Text>
            </View>
            <View style={{ paddingHorizontal: H_PAD, paddingBottom: 12 }}>
              <TouchableOpacity style={styles.withdrawGreen} activeOpacity={0.9} onPress={() => toastSoon('Withdraw to bank')}>
                <Text style={styles.withdrawGreenTxt}>Withdraw to bank</Text>
              </TouchableOpacity>
            </View>
            <CardD style={{ marginBottom: 14 }}>
              <RowD label="You keep" value="70% of each gift" />
              <RowD label="Platform keeps" value="30%" valueColor={D.muted} />
              <RowD label="Min. withdrawal" value={formatUsd(2)} valueColor={D.muted} isLast />
            </CardD>
            <SectionHead>Recent gifts</SectionHead>
            {(snapshot?.recent_gifts?.length ?? 0) === 0 ? (
              <Text style={[styles.emptyHint, { paddingHorizontal: H_PAD }]}>No gift transactions yet.</Text>
            ) : (
              (snapshot?.recent_gifts ?? []).map((g, i, arr) => (
                <View key={`${g.created_at}-${i}`} style={[styles.giftRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>{giftInitials(g.description)}</Text>
                  </View>
                  <View style={styles.giftInfo}>
                    <Text style={styles.giftName}>Gift received</Text>
                    <Text style={styles.giftSub} numberOfLines={2}>
                      {(g.description || 'Gift').trim()} · {formatRelative(g.created_at)}
                    </Text>
                  </View>
                  <Text style={styles.giftAmt}>+{formatCreatorUsd(tokensToUsd(g.amount, rate))}</Text>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            <CardD style={{ marginTop: 8, marginHorizontal: H_PAD }}>
              <RowD label="Paid out (all time)" value={formatUsd(snapshot?.total_paid_out_usd ?? 0)} />
              <RowD label="This month (est.)" value={formatCreatorUsd(thisMonthCombinedUsd)} valueColor={D.mintBright} />
              <RowD label="Next payout date" value={snapshot?.next_payout_label ?? '—'} isLast />
            </CardD>
            <SectionHead>Previous payouts</SectionHead>
            {(snapshot?.payouts?.length ?? 0) === 0 ? (
              <Text style={[styles.emptyHint, { paddingHorizontal: H_PAD }]}>
                No payouts recorded yet. Paid runs appear here after settlement.
              </Text>
            ) : (
              (snapshot?.payouts ?? []).map((row, i, arr) => (
                <View key={`${row.period_label}-${i}`} style={[styles.payoutRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <View>
                    <Text style={styles.payoutMonth}>{row.period_label}</Text>
                    <Text style={styles.payoutSub}>{row.sublabel || 'Payout'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.payoutAmt}>{formatUsd(row.amount_usd)}</Text>
                    <View style={[styles.paidPill, row.status === 'pending' && styles.pendingPill]}>
                      <Text style={[styles.paidPillTxt, row.status === 'pending' && styles.pendingPillTxt]}>
                        {row.status === 'paid' ? 'Paid' : row.status === 'pending' ? 'Pending' : row.status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
            <View style={{ paddingHorizontal: H_PAD, paddingVertical: 14 }}>
              <View style={styles.bankFoot}>
                <Text style={styles.bankFootTxt}>Paid to bank account ••••4821 · Paystack</Text>
              </View>
            </View>
          </>
        )}

        {activeTab === 'upgrade' && (
          <>
            <View style={styles.upgradeHero}>
              <Text style={styles.upgradeHeroTitle}>Unlock your earnings</Text>
              <Text style={styles.upgradeHeroSub}>Your content is already earning. Start collecting.</Text>
            </View>
            <View style={[styles.cardHero, { marginHorizontal: H_PAD }]}>
              <Text style={styles.cardHeroLbl}>You would have earned last month</Text>
              <Text style={styles.cardHeroNum}>{formatCreatorUsd(lastMonthCombinedUsd)}</Text>
              <Text style={styles.cardHeroHint}>based on your posts and gifts (est.)</Text>
            </View>
            <View style={{ paddingHorizontal: H_PAD, marginBottom: 10 }}>
              <View style={styles.proFeatureCard}>
                <View style={styles.proPriceRow}>
                  <Text style={styles.proName}>Nomli Creator Pro</Text>
                  <Text>
                    <Text style={styles.proPrice}>{subscribePriceLabel}</Text>
                    <Text style={styles.proPriceSuffix}>/month</Text>
                  </Text>
                </View>
                {[
                  'Earn from post engagement monthly',
                  'Keep 70% of all livestream gifts',
                  'Creator dashboard and score tracking',
                  'Monthly payout on the 15th',
                ].map((line) => (
                  <View key={line} style={styles.benefitRow}>
                    <Check size={14} color={D.mint} strokeWidth={2.5} />
                    <Text style={styles.benefitTxt}>{line}</Text>
                  </View>
                ))}
                <View style={styles.benefitRowMuted}>
                  <Info size={14} color={D.meta} strokeWidth={2} />
                  <Text style={styles.benefitTxtMuted}>Ad revenue share — coming soon</Text>
                </View>
              </View>
            </View>
            <View style={{ paddingHorizontal: H_PAD, paddingBottom: 8 }}>
              <TouchableOpacity
                style={[styles.upgradeBtn, checkoutLoading && { opacity: 0.7 }]}
                activeOpacity={0.9}
                onPress={onSubscribe}
                disabled={checkoutLoading}
              >
                <Text style={styles.upgradeBtnTxt}>
                  {checkoutLoading ? subscribeLoadingLabel : `Subscribe — ${subscribePriceLabel}/month`}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: H_PAD, paddingBottom: 16 }}>
              <TouchableOpacity
                style={[styles.upgradeOutline, checkoutLoading && { opacity: 0.7 }]}
                activeOpacity={0.85}
                onPress={onSubscribeYearly}
                disabled={checkoutLoading}
              >
                <Text style={styles.upgradeOutlineTxt}>{annualPayTeaserLabel}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.payFoot}>{payFootNote}</Text>
            <View style={{ height: 16 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingRow: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: D.meta,
    fontFamily: FontFamily.regular,
    paddingBottom: 12,
  },
  rangeHint: {
    fontSize: 11,
    color: D.meta,
    fontFamily: FontFamily.regular,
    marginBottom: 6,
  },
  tabGrid: {
    paddingHorizontal: H_PAD,
    paddingTop: 6,
    paddingBottom: 4,
    gap: TAB_ROW_GAP,
  },
  tabRow: {
    flexDirection: 'row',
    gap: TAB_ROW_GAP,
  },
  tabChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: D.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabChipOn: {
    backgroundColor: D.lemon,
    borderColor: D.lemon,
  },
  tabChipText: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: D.muted2,
  },
  tabChipTextOn: {
    color: D.ctaText,
    fontFamily: FontFamily.semibold,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    backgroundColor: D.screen,
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: D.backCircle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topbarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: FontFamily.medium,
    color: D.text,
    marginHorizontal: 8,
  },
  topbarRight: {
    minWidth: 28,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  proPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: D.pillMintBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.mintBorder,
  },
  proPillText: {
    fontSize: 10,
    fontFamily: FontFamily.semibold,
    color: D.mintBright,
  },
  bodyScroll: {
    flex: 1,
  },
  sectionHead: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
    color: D.subtle,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: H_PAD,
    paddingTop: 10,
    paddingBottom: 6,
  },
  lockOverlay: {
    backgroundColor: D.screen,
    borderRadius: 14,
    padding: 20,
    marginHorizontal: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.cardBorder,
  },
  lockIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: D.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  lockSub: {
    fontSize: 12,
    color: D.muted2,
    marginBottom: 6,
  },
  bigNumAccent: {
    fontSize: 36,
    fontFamily: FontFamily.bold,
    letterSpacing: -1,
    color: D.mintBright,
  },
  lockHint: {
    fontSize: 12,
    color: D.meta,
    marginTop: 4,
  },
  stat3: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    alignSelf: 'stretch',
  },
  statCell: {
    flex: 1,
    backgroundColor: D.card,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 18,
    fontFamily: FontFamily.semibold,
    color: D.text,
  },
  statLbl: {
    fontSize: 10,
    color: D.meta,
    marginTop: 2,
  },
  upgradeBtn: {
    backgroundColor: D.lemon,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    width: '100%',
    marginTop: 14,
  },
  upgradeBtnTxt: {
    color: D.ctaText,
    fontSize: 14,
    fontFamily: FontFamily.semibold,
  },
  priceHint: {
    fontSize: 11,
    color: D.subtle,
    marginTop: 10,
  },
  cardD: {
    backgroundColor: D.card,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginHorizontal: H_PAD,
    marginBottom: 10,
  },
  rowD: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.rowBorder,
  },
  rowDLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 12,
    color: D.muted,
    fontFamily: FontFamily.regular,
  },
  rowVal: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    color: D.text,
  },
  outlineWithdraw: {
    backgroundColor: D.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.mintBorder,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineWithdrawTxt: {
    fontSize: 13,
    color: D.mintBright,
    fontFamily: FontFamily.medium,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 12,
    paddingBottom: 6,
  },
  estLbl: {
    fontSize: 12,
    color: D.muted2,
    paddingBottom: 8,
    fontFamily: FontFamily.regular,
  },
  subline: {
    fontSize: 12,
    color: D.meta,
    paddingBottom: 12,
    fontFamily: FontFamily.regular,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  metricCard: {
    backgroundColor: D.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    minHeight: 72,
    justifyContent: 'center',
  },
  metricLbl: {
    fontSize: 11,
    color: D.muted2,
    marginBottom: 4,
    fontFamily: FontFamily.regular,
  },
  metricVal: {
    fontSize: 18,
    fontFamily: FontFamily.semibold,
    color: D.text,
  },
  barWrap: {
    marginBottom: 10,
  },
  barLblRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  barLbl: {
    fontSize: 11,
    color: D.muted2,
    fontFamily: FontFamily.regular,
  },
  barBg: {
    height: 6,
    borderRadius: 99,
    backgroundColor: D.card,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 99,
    backgroundColor: D.mint,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: D.mintSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.mintBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  tipIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: D.tipIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTxt: {
    flex: 1,
    fontSize: 12,
    color: '#BBBBBB',
    lineHeight: 18,
    fontFamily: FontFamily.regular,
  },
  seg: {
    flexDirection: 'row',
    backgroundColor: D.segBg,
    borderRadius: 10,
    padding: 3,
    marginTop: 8,
    marginBottom: 14,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  segBtnOn: {
    backgroundColor: D.lemon,
  },
  segBtnTxt: {
    fontSize: 12,
    color: D.muted2,
    fontFamily: FontFamily.regular,
  },
  segBtnTxtOn: {
    color: D.ctaText,
    fontFamily: FontFamily.medium,
  },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.card,
  },
  postThumb: {
    width: 42,
    height: 52,
    borderRadius: 6,
  },
  postInfo: {
    flex: 1,
    minWidth: 0,
  },
  postTitle: {
    fontSize: 12,
    color: '#DDDDDD',
    marginBottom: 3,
    fontFamily: FontFamily.medium,
  },
  postMeta: {
    fontSize: 11,
    color: D.meta,
    fontFamily: FontFamily.regular,
  },
  postEarn: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    color: D.mintBright,
  },
  totalsRow: {
    backgroundColor: D.card,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalsLbl: {
    fontSize: 11,
    color: D.meta,
    fontFamily: FontFamily.regular,
  },
  totalsVal: {
    fontSize: 18,
    fontFamily: FontFamily.semibold,
    color: D.text,
    marginTop: 2,
  },
  withdrawGreen: {
    alignSelf: 'flex-start',
    backgroundColor: D.lemon,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  withdrawGreenTxt: {
    color: D.ctaText,
    fontSize: 13,
    fontFamily: FontFamily.semibold,
  },
  giftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.card,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    color: '#BBBBBB',
  },
  giftInfo: {
    flex: 1,
  },
  giftName: {
    fontSize: 12,
    color: '#DDDDDD',
    fontFamily: FontFamily.medium,
  },
  giftSub: {
    fontSize: 11,
    color: D.meta,
    fontFamily: FontFamily.regular,
  },
  giftAmt: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    color: D.mintBright,
  },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.card,
  },
  payoutMonth: {
    fontSize: 13,
    color: '#DDDDDD',
    fontFamily: FontFamily.medium,
  },
  payoutSub: {
    fontSize: 11,
    color: D.meta,
    marginTop: 2,
    fontFamily: FontFamily.regular,
  },
  payoutAmt: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: D.text,
  },
  paidPill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: D.greenBg,
    alignSelf: 'flex-end',
  },
  paidPillTxt: {
    fontSize: 11,
    fontFamily: FontFamily.medium,
    color: D.green,
  },
  pendingPill: {
    backgroundColor: D.amberBg,
  },
  pendingPillTxt: {
    color: D.amber,
  },
  bankFoot: {
    backgroundColor: D.card,
    borderRadius: 10,
    padding: 12,
  },
  bankFootTxt: {
    fontSize: 12,
    color: D.meta,
    textAlign: 'center',
    fontFamily: FontFamily.regular,
  },
  upgradeHero: {
    paddingHorizontal: H_PAD,
    paddingTop: 14,
    paddingBottom: 8,
    alignItems: 'center',
  },
  upgradeHeroTitle: {
    fontSize: 22,
    fontFamily: FontFamily.bold,
    color: D.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  upgradeHeroSub: {
    fontSize: 13,
    color: D.muted2,
    textAlign: 'center',
    fontFamily: FontFamily.regular,
  },
  cardHero: {
    backgroundColor: D.mintSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.mintBorder,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeroLbl: {
    fontSize: 13,
    color: D.muted,
    marginBottom: 4,
    fontFamily: FontFamily.regular,
  },
  cardHeroNum: {
    fontSize: 40,
    fontFamily: FontFamily.bold,
    letterSpacing: -1,
    color: D.mintBright,
  },
  cardHeroHint: {
    fontSize: 12,
    color: D.meta,
    marginTop: 4,
    fontFamily: FontFamily.regular,
  },
  proFeatureCard: {
    backgroundColor: D.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#333333',
  },
  proPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  proName: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: D.text,
  },
  proPrice: {
    fontSize: 24,
    fontFamily: FontFamily.bold,
    color: D.text,
  },
  proPriceSuffix: {
    fontSize: 13,
    color: D.meta,
    fontFamily: FontFamily.regular,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 9,
  },
  benefitTxt: {
    flex: 1,
    fontSize: 12,
    color: '#BBBBBB',
    fontFamily: FontFamily.regular,
  },
  benefitRowMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitTxtMuted: {
    flex: 1,
    fontSize: 12,
    color: D.muted2,
    fontFamily: FontFamily.regular,
  },
  upgradeOutline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.mint,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  upgradeOutlineTxt: {
    fontSize: 13,
    fontFamily: FontFamily.medium,
    color: D.mintBright,
  },
  payFoot: {
    fontSize: 11,
    color: D.subtle,
    textAlign: 'center',
    paddingHorizontal: H_PAD,
    fontFamily: FontFamily.regular,
  },
});

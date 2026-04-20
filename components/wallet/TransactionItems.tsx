import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Coins, Gift, Award, ArrowUpRight, History, ChevronDown, ChevronUp, Heart } from 'lucide-react-native';
import { WALLET_LEMON, WALLET_MINT, WALLET_MINT_BRIGHT } from '../../constants/walletAccent';
import { formatTimeAgo } from '../../utils/formatters';
import { WalletTransaction } from '../../utils/walletService';
import { DailyTokenClaim } from '../../utils/dailyTokenRewards';
import { tokensToUsd } from '../../utils/creatorMonetizationService';

/** In-app gifts: 1 token = $0.01 (see GiftModal / giftService). */
const WALLET_TOKEN_USD = 0.01;

function formatUsdTwoDecimals(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatFullDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** Mask sensitive IDs (e.g. purchase tokens) for display - show only last 4 chars. */
function maskReferenceId(id: string): string {
  if (!id || id.length <= 4) return '••••';
  return '••••' + id.slice(-4);
}

interface TransactionItemProps {
  transaction: WalletTransaction;
  colors: any;
  isDarkMode: boolean;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, colors, isDarkMode }) => {
  const [expanded, setExpanded] = useState(false);
  const isPositive = transaction.amount > 0;
  const isGiftLedger =
    transaction.transaction_type === 'gift_received' || transaction.transaction_type === 'gift_sent';
  const giftAbs = Math.abs(transaction.amount);
  const giftUsdEst = isGiftLedger ? tokensToUsd(giftAbs, WALLET_TOKEN_USD) : 0;

  const getTransactionIcon = () => {
    switch (transaction.transaction_type) {
      case 'purchase':
        return <Coins size={16} color={isPositive ? WALLET_MINT : colors.textSecondary} />;
      case 'discover_reveal':
        return <Heart size={16} color="#FF6B9D" fill="#FF6B9D" />;
      case 'discover_boost':
        return <ArrowUpRight size={16} color="#FF006E" />;
      case 'gift_sent':
      case 'gift_received':
        return <Gift size={16} color={isPositive ? WALLET_MINT_BRIGHT : colors.textSecondary} />;
      case 'user_credit':
      case 'user_credit_sent':
        return <Gift size={16} color={isPositive ? WALLET_MINT : colors.textSecondary} />;
      case 'bonus':
      case 'contributor_reward':
        return <Award size={16} color={isPositive ? WALLET_LEMON : colors.textSecondary} />;
      case 'redemption':
      case 'refund':
        return <ArrowUpRight size={16} color={colors.textSecondary} />;
      default:
        return <History size={16} color={colors.textSecondary} />;
    }
  };

  const getTransactionTypeLabel = () => {
    switch (transaction.transaction_type) {
      case 'purchase':
        return 'Purchase';
      case 'discover_reveal':
        return 'Reveal';
      case 'discover_boost':
        return 'Profile boost';
      case 'gift_sent':
        return 'Gift Sent';
      case 'gift_received':
        return 'Gift Received';
      case 'user_credit':
        return 'Credit Received';
      case 'user_credit_sent':
        return 'Credit Sent';
      case 'bonus':
      case 'contributor_reward':
        return 'Bonus';
      case 'redemption':
        return 'Redeemed';
      case 'refund':
        return 'Refund';
      default:
        return transaction.transaction_type || 'Transaction';
    }
  };

  return (
    <Pressable
      onPress={() => setExpanded((e) => !e)}
      style={[styles.transactionItem, {
        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
      }]}
      accessibilityLabel={getTransactionTypeLabel()}
      accessibilityHint="Double tap to expand or collapse details"
    >
      <View style={styles.transactionIcon}>
        {getTransactionIcon()}
      </View>
      <View style={styles.transactionContent}>
        <Text style={[styles.transactionType, { color: colors.text }]}>
          {getTransactionTypeLabel()}
        </Text>
        {transaction.description && (
          <Text
            style={[styles.transactionDescription, { color: colors.textSecondary }]}
            numberOfLines={expanded ? undefined : 1}
          >
            {transaction.description}
          </Text>
        )}
        <Text style={[styles.transactionTime, { color: colors.textTertiary }]}>
          {expanded ? formatFullDate(transaction.created_at) : formatTimeAgo(transaction.created_at)}
        </Text>
        {expanded && transaction.reference_id && (
          <Text style={[styles.transactionMeta, { color: colors.textTertiary }]}>
            ID: {maskReferenceId(transaction.reference_id)}
          </Text>
        )}
      </View>
      <View style={styles.transactionRight}>
        <View style={styles.transactionAmount}>
          <Text style={[styles.transactionAmountText, {
            color: isPositive ? WALLET_MINT : colors.text,
          }]}>
            {isGiftLedger
              ? `${isPositive ? '+' : '-'}${giftAbs.toLocaleString()} tokens`
              : `${isPositive ? '+' : ''}${transaction.amount.toLocaleString()}`}
          </Text>
          {isGiftLedger ? (
            <Text style={[styles.transactionGiftUsd, { color: colors.textTertiary }]}>
              ~{formatUsdTwoDecimals(giftUsdEst)} USD
            </Text>
          ) : null}
          <Text style={[styles.transactionBalance, { color: colors.textTertiary }]}>
            Balance: {transaction.balance_after.toLocaleString()}
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={16} color={colors.textTertiary} style={styles.chevron} />
        ) : (
          <ChevronDown size={16} color={colors.textTertiary} style={styles.chevron} />
        )}
      </View>
    </Pressable>
  );
};

interface CreditTransactionItemProps {
  transaction: WalletTransaction;
  colors: any;
  isDarkMode: boolean;
  userId: string;
}

export const CreditTransactionItem: React.FC<CreditTransactionItemProps> = ({ transaction, colors, isDarkMode, userId }) => {
  const [expanded, setExpanded] = useState(false);
  const isReceived = transaction.transaction_type === 'user_credit';

  return (
    <Pressable
      onPress={() => setExpanded((e) => !e)}
      style={[styles.transactionItem, {
        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
      }]}
      accessibilityLabel={isReceived ? 'Credit Received' : 'Credit Sent'}
      accessibilityHint="Double tap to expand or collapse details"
    >
      <View style={styles.transactionIcon}>
        <Gift size={16} color={isReceived ? WALLET_MINT : colors.textSecondary} />
      </View>
      <View style={styles.transactionContent}>
        <Text style={[styles.transactionType, { color: colors.text }]}>
          {isReceived ? 'Credit Received' : 'Credit Sent'}
        </Text>
        {transaction.description && (
          <Text
            style={[styles.transactionDescription, { color: colors.textSecondary }]}
            numberOfLines={expanded ? undefined : 1}
          >
            {transaction.description}
          </Text>
        )}
        <Text style={[styles.transactionTime, { color: colors.textTertiary }]}>
          {expanded ? formatFullDate(transaction.created_at) : formatTimeAgo(transaction.created_at)}
        </Text>
        {expanded && transaction.reference_id && (
          <Text style={[styles.transactionMeta, { color: colors.textTertiary }]}>
            ID: {maskReferenceId(transaction.reference_id)}
          </Text>
        )}
      </View>
      <View style={styles.transactionRight}>
        <View style={styles.transactionAmount}>
          <Text style={[styles.transactionAmountText, {
            color: isReceived ? WALLET_MINT : colors.text,
          }]}>
            {isReceived ? '+' : '-'}{Math.abs(transaction.amount).toLocaleString()}
          </Text>
          <Text style={[styles.transactionBalance, { color: colors.textTertiary }]}>
            Balance: {transaction.balance_after.toLocaleString()}
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={16} color={colors.textTertiary} style={styles.chevron} />
        ) : (
          <ChevronDown size={16} color={colors.textTertiary} style={styles.chevron} />
        )}
      </View>
    </Pressable>
  );
};

interface TokensEarnItemProps {
  claim: DailyTokenClaim;
  colors: any;
  isDarkMode: boolean;
}

export const TokensEarnItem: React.FC<TokensEarnItemProps> = ({ claim, colors, isDarkMode }) => {
  const [expanded, setExpanded] = useState(false);
  const isFlamingoEgg = claim.contribution_score === -1;

  const getRankLabel = () => {
    if (isFlamingoEgg) return '🥚 Flamingo Egg Bonus';
    if (!claim.rank) return 'No Rank';
    if (claim.rank === 1) return '🥇 Rank #1';
    if (claim.rank === 2) return '🥈 Rank #2';
    if (claim.rank === 3) return '🥉 Rank #3';
    return `Rank #${claim.rank}`;
  };

  return (
    <Pressable
      onPress={() => setExpanded((e) => !e)}
      style={[styles.transactionItem, {
        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
      }]}
      accessibilityLabel="Tokens Earned"
      accessibilityHint="Double tap to expand or collapse details"
    >
      <View style={styles.transactionIcon}>
        <Award size={16} color={WALLET_MINT_BRIGHT} />
      </View>
      <View style={styles.transactionContent}>
        <Text style={[styles.transactionType, { color: colors.text }]}>
          Tokens Earned
        </Text>
        <Text style={[styles.transactionDescription, { color: colors.textSecondary }]}>
          {getRankLabel()} • Score: {claim.contribution_score}
        </Text>
        <Text style={[styles.transactionTime, { color: colors.textTertiary }]}>
          {expanded ? formatFullDate(claim.claimed_at) : formatTimeAgo(claim.claimed_at)}
        </Text>
      </View>
      <View style={styles.transactionRight}>
        <View style={styles.transactionAmount}>
          <Text style={[styles.transactionAmountText, { color: WALLET_LEMON }]}>
            +{claim.total_tokens.toLocaleString()}
          </Text>
          <Text style={[styles.transactionBalance, { color: colors.textTertiary }]}>
            {claim.base_tokens > 0 && `Base: ${claim.base_tokens}`}
            {claim.bonus_tokens > 0 && ` + Bonus: ${claim.bonus_tokens}`}
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={16} color={colors.textTertiary} style={styles.chevron} />
        ) : (
          <ChevronDown size={16} color={colors.textTertiary} style={styles.chevron} />
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionContent: {
    flex: 1,
    gap: 2,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  transactionDescription: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  transactionTime: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.1,
    marginTop: 2,
  },
  transactionMeta: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.1,
    marginTop: 4,
  },
  transactionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  transactionAmount: {
    alignItems: 'flex-end',
    gap: 2,
  },
  chevron: {
    marginLeft: 2,
  },
  transactionAmountText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  transactionBalance: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  transactionGiftUsd: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});

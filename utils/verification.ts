type VerifiableLike = {
  is_verified?: boolean | number | string | null;
  verified?: boolean | number | string | null;
  verification_status?: string | null;
  username?: string | null;
  full_name?: string | null;
  vip_status?: string | null;
  verificationState?: string | null;
};

const VERIFIED_NAME_FALLBACK = ['zanga pay', 'zangapay', 'zanga_pay', 'zanga-pay', 'zanga'] as const;

export function isVerifiedEntity(profile: VerifiableLike | null | undefined): boolean {
  if (!profile) return false;
  const isTruthyVerified = (value: unknown) => {
    if (value === true || value === 1) return true;
    const normalized = String(value ?? '').toLowerCase().trim();
    return (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 't' ||
      normalized === 'yes' ||
      normalized === 'verified'
    );
  };

  if (isTruthyVerified(profile.is_verified)) return true;
  if (isTruthyVerified(profile.verified)) return true;
  if (String(profile.verification_status || '').toLowerCase().trim() === 'verified') return true;
  if (String(profile.verificationState || '').toLowerCase().trim() === 'verified') return true;
  if (String(profile.vip_status || '').toLowerCase().includes('verified')) return true;

  const username = String(profile.username || '').toLowerCase();
  const fullName = String(profile.full_name || '').toLowerCase();
  return VERIFIED_NAME_FALLBACK.some((name) => username.includes(name) || fullName.includes(name));
}


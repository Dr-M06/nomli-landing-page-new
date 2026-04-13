/**
 * Business account types and categories - lite, small UI (TikTok/Instagram style).
 */

export const ACCOUNT_TYPE_OPTIONS = [
  { value: 'regular', label: 'Personal' },
  { value: 'business', label: 'Business' },
] as const;

export type AccountType = 'regular' | 'business';

/** Predefined business categories for dropdown; "Other" allows manual entry. */
export const BUSINESS_TYPE_OPTIONS = [
  { value: 'restaurant', label: 'Restaurant / Cafe' },
  { value: 'retail', label: 'Retail / Shop' },
  { value: 'salon', label: 'Salon / Beauty' },
  { value: 'fitness', label: 'Fitness / Gym' },
  { value: 'health', label: 'Health / Clinic' },
  { value: 'education', label: 'Education / Tutoring' },
  { value: 'photography', label: 'Photography / Studio' },
  { value: 'automotive', label: 'Automotive / Repair' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'legal', label: 'Legal / Services' },
  { value: 'tech', label: 'Tech / IT' },
  { value: 'other', label: 'Other' },
] as const;

export type BusinessTypeValue = typeof BUSINESS_TYPE_OPTIONS[number]['value'];

export function getBusinessTypeLabel(value: string): string {
  const opt = BUSINESS_TYPE_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : value || 'Business';
}

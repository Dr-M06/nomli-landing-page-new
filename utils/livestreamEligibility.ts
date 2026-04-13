export interface EligibilityRequirement {
  id: string;
  label: string;
  description?: string;
  met: boolean;
  value?: string | number;
  required?: string | number;
}

export interface EligibilityResult {
  eligible: boolean;
  requirements: EligibilityRequirement[];
  missingCount: number;
}

/**
 * Check if a user is eligible to start a livestream
 * All eligibility rules have been removed - everyone can go live
 */
export async function checkLivestreamEligibility(
  userId: string,
  isAdmin: boolean = false
): Promise<EligibilityResult> {
  // All users are eligible - no restrictions
  return {
    eligible: true,
    requirements: [],
    missingCount: 0,
  };
}

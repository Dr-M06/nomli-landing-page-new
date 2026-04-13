export type AgeGateFlags = {
  age: number | null;
  isUnder13: boolean;
  isUnder16: boolean;
};

function parseDate(input: unknown): Date | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function computeAge(dateOfBirth: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const m = now.getMonth() - dateOfBirth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dateOfBirth.getDate())) age -= 1;
  return age;
}

export function extractDob(input: any): Date | null {
  if (!input) return null;
  return (
    parseDate(input.date_of_birth) ||
    parseDate(input.dob) ||
    parseDate(input.birthdate) ||
    parseDate(input.birthday) ||
    null
  );
}

export function getAgeGateFlags({
  profile,
  userMetadata,
  now = new Date(),
}: {
  profile?: any;
  userMetadata?: any;
  now?: Date;
}): AgeGateFlags {
  const dob = extractDob(profile) || extractDob(userMetadata);
  const age = dob ? computeAge(dob, now) : null;
  return {
    age,
    isUnder13: age !== null ? age < 13 : false,
    isUnder16: age !== null ? age < 16 : false,
  };
}


/**
 * UUID generation utilities
 */

/**
 * Generates a RFC4122 version 4 compliant UUID
 * @returns {string} A valid UUID string
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Validates if a string is a valid UUID
 * @param {string} uuid - The string to validate
 * @returns {boolean} True if the string is a valid UUID
 */
export function isValidUUID(uuid) {
  if (!uuid) return false;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Ensures a valid UUID is returned
 * If the input is a valid UUID, returns it
 * Otherwise generates and returns a new UUID
 * @param {string} uuid - The UUID to validate
 * @returns {string} A valid UUID
 */
export function ensureUUID(uuid) {
  return isValidUUID(uuid) ? uuid : generateUUID();
} 
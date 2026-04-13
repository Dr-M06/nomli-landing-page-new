// Web-compatible stub for PlatformColorValueTypes
// Platform colors are not supported on web, so processColorObject returns null
module.exports = {
  processColorObject: (color) => {
    // On web, platform colors can't be processed, return null
    // This matches the behavior in processColor.js when processColorObject returns null
    return null;
  }
};

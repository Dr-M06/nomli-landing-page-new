module.exports = {
  alertWithArgs(_args, callback) {
    (callback || function noop() {})();
  },
};

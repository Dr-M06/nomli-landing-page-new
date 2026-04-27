#!/usr/bin/env bash
# Gradle needs a real JDK. macOS /usr/bin/java is a stub and fails with
# "Unable to locate a Java Runtime" unless JAVA_HOME points at a JDK (e.g. Android Studio's JBR).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
  :
else
  for candidate in \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home"
  do
    if [[ -x "${candidate}/bin/java" ]]; then
      export JAVA_HOME="${candidate}"
      break
    fi
  done
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/java" ]]; then
  echo "No usable JDK found. Install Android Studio (JBR) or JDK 17+, then either:" >&2
  echo "  export JAVA_HOME=\"/path/to/jdk/Home\"" >&2
  echo "or add org.gradle.java.home=... to ~/.gradle/gradle.properties" >&2
  exit 1
fi

export PATH="${JAVA_HOME}/bin:${PATH}"

# Avoid variable name NODE_PATH — Node uses that env var for module resolution.
NODE_ABS="$(command -v node 2>/dev/null || true)"
if [[ -z "${NODE_ABS}" ]]; then
  echo "node not found in PATH. Install Node (or run: source ~/.nvm/nvm.sh) then retry." >&2
  exit 1
fi
export NODE_BINARY="${NODE_ABS}"

# Drop stale daemons so Gradle picks up NODE_BINARY / PATH from this shell.
(cd "${ROOT}/android" && ./gradlew --stop 2>/dev/null) || true

cd "${ROOT}"
exec env EXPO_NO_DOTENV=1 NODE_BINARY="${NODE_BINARY}" npx expo run:android "$@"

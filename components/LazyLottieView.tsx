/**
 * Re-exports Lottie for livestream loading screens.
 * Use **default import only** — `import * as Lottie` can confuse Metro’s graph (undefined module ids).
 * If default is double-wrapped by CJS interop, unwrap until we get a component function.
 */
import LottieDefault from 'lottie-react-native';
import type { ComponentType } from 'react';

function unwrapToComponent(mod: unknown): ComponentType<any> {
  let c: any = mod;
  for (let i = 0; i < 8 && c != null; i++) {
    if (typeof c === 'function') return c;
    if (typeof c === 'object' && c !== null && 'default' in c) {
      c = (c as { default: unknown }).default;
      continue;
    }
    break;
  }
  throw new Error('LazyLottieView: lottie-react-native did not resolve to a component');
}

const LottieView = unwrapToComponent(LottieDefault);

export default LottieView;

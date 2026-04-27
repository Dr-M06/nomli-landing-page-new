import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

/**
 * Web document shell (used for static export / SSR-style web builds).
 * Adds min-height so the RN tree under #root cannot collapse to 0px tall (blank screen).
 */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style
          id="expo-root-viewport-fix"
          dangerouslySetInnerHTML={{
            __html:
              'html,body,#root{min-height:100vh;min-height:100dvh}#root{flex:1}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

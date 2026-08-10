import { getSiteUrl } from "@/lib/site"

const PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en"
const APP_STORE = "https://apps.apple.com/us/app/nomli-mingle/id6754324967"

export function StructuredData() {
  const site = getSiteUrl()

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        url: site,
        name: "Nomli Mingle",
        description: "Social feed and chat in one app — free on iOS and Android.",
        publisher: { "@id": `${site}/#organization` },
        inLanguage: "en-US",
      },
      {
        "@type": "Organization",
        "@id": `${site}/#organization`,
        name: "Nomli Mingle",
        url: site,
        logo: {
          "@type": "ImageObject",
          url: `${site}/icon-512x512.png`,
          width: 512,
          height: 512,
        },
        sameAs: [
          "https://www.facebook.com/people/Nomli-Mingle/61578108320450/",
          "https://www.tiktok.com/@nomli_mingle",
          "https://x.com/nomlimingl20270?s=11",
          "https://www.instagram.com/nomli_minglehq/",
          PLAY_STORE,
          APP_STORE,
        ],
        contactPoint: {
          "@type": "ContactPoint",
          email: "hello@nomli.cc",
          contactType: "customer support",
          availableLanguage: ["English"],
        },
      },
      {
        "@type": "WebPage",
        "@id": `${site}/#webpage`,
        url: site,
        name: "Nomli Mingle — Social feed & chat in one app",
        description:
          "Join Nomli Mingle for a full-screen social feed and chat — available on Google Play and the App Store.",
        isPartOf: { "@id": `${site}/#website` },
        about: { "@id": `${site}/#organization` },
        inLanguage: "en-US",
      },
      {
        "@type": "MobileApplication",
        name: "Nomli Mingle",
        operatingSystem: "Android",
        applicationCategory: "SocialNetworkingApplication",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        description: "Social feed and chat in one app. Download on Android.",
        downloadUrl: PLAY_STORE,
        screenshot: `${site}/og-image.png`,
        featureList: ["Full-screen social feed", "Chat & inbox", "Communities & profiles"],
      },
      {
        "@type": "MobileApplication",
        name: "Nomli Mingle",
        operatingSystem: "iOS",
        applicationCategory: "SocialNetworkingApplication",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        description: "Social feed and chat in one app. Download on iPhone and iPad.",
        downloadUrl: APP_STORE,
        screenshot: `${site}/og-image.png`,
        featureList: ["Full-screen social feed", "Chat & inbox", "Communities & profiles"],
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  )
}

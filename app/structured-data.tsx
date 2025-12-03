export function StructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://nomli.cc/#website",
        url: "https://nomli.cc",
        name: "Nomli Mingle",
        description:
          "Join Nomli Mingle - A next-generation social networking app. Livestream, chat, make video calls, discover events, and build real communities.",
        publisher: {
          "@id": "https://nomli.cc/#organization",
        },
        inLanguage: "en-US",
      },
      {
        "@type": "Organization",
        "@id": "https://nomli.cc/#organization",
        name: "Nomli Mingle",
        url: "https://nomli.cc",
        logo: {
          "@type": "ImageObject",
          url: "https://nomli.cc/images/nomli-logo.jpeg",
          width: 512,
          height: 512,
        },
        sameAs: [
          "https://www.facebook.com/people/Nomli-Mingle/61578108320450/",
          "https://www.tiktok.com/@nomli_mingle",
          "https://x.com/nomlimingle",
          "https://www.instagram.com/nomli_minglehq/",
          "https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en",
        ],
        contactPoint: {
          "@type": "ContactPoint",
          email: "hello@nomli.cc",
          contactType: "Customer Support",
          availableLanguage: ["English"],
        },
      },
      {
        "@type": "WebPage",
        "@id": "https://nomli.cc/#webpage",
        url: "https://nomli.cc",
        name: "Nomli Mingle - Beyond Borders. Beyond Limits.",
        description:
          "Join Nomli Mingle - Livestream, chat, make video calls, discover events, and build real communities. Connect with people who share your interests.",
        isPartOf: {
          "@id": "https://nomli.cc/#website",
        },
        about: {
          "@id": "https://nomli.cc/#organization",
        },
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
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.5",
          ratingCount: "50",
        },
        description:
          "Nomli Mingle is a next-generation social networking app designed to help you meet new people, join live events, and build real connections.",
        downloadUrl: "https://play.google.com/store/apps/details?id=com.nomli.mingle2&hl=en",
        screenshot: "https://nomli.cc/og-image.png",
        featureList: [
          "Go Live & Earn",
          "Private Chat & Voice Notes",
          "Voice & Video Calls",
          "Short Videos (Reels)",
          "Event Creation & Discovery",
          "Follow & Be Followed",
        ],
      },
      {
        "@type": "SoftwareApplication",
        name: "Nomli Mingle",
        operatingSystem: "Android",
        applicationCategory: "SocialNetworkingApplication",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        description:
          "A new way to connect — livestream, chat, create, meet people with shared interests, and build real communities.",
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


"use client";

import { useState, useEffect } from "react";
import { Info } from "lucide-react";

const STORAGE_KEY = "nomli-web-wallet-popup-dismissed";
const SHOW_DELAY_MS = 2500;

export default function WebWalletPopup() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wasDismissed = sessionStorage.getItem(STORAGE_KEY);
    if (wasDismissed) {
      setDismissed(true);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  if (dismissed || !visible) return null;

  return (
    <div
      className="web-wallet-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
        fontFamily: "'DM Sans', sans-serif",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="web-wallet-popup-title"
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <div
        className="web-wallet-card"
        style={{
          background: "#fff",
          borderRadius: "20px",
          padding: "2.5rem 2rem",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "0 24px 60px rgba(0,0,0,0.15)",
          textAlign: "center",
          position: "relative",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            background: "linear-gradient(135deg, #6C63FF, #4ECDC4)",
            borderRadius: "16px",
            margin: "0 auto 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}
        >
          <Info size={28} strokeWidth={2.5} />
        </div>

        {/* Heading */}
        <h2
          id="web-wallet-popup-title"
          style={{
            fontSize: "1.2rem",
            fontWeight: 600,
            color: "#111",
            margin: "0 0 0.75rem",
          }}
        >
          Can&apos;t buy tokens in your region?
        </h2>

        {/* Body */}
        <p
          style={{
            fontSize: "0.95rem",
            color: "#555",
            lineHeight: 1.6,
            margin: "0 0 1.75rem",
          }}
        >
          Some regions don&apos;t support in-app purchases on the App Store or
          Google Play.
          <br />
          <br />
          No worries — you can still buy Mingle tokens directly from our{" "}
          <strong style={{ color: "#6C63FF" }}>Web Wallet</strong>, quickly and
          securely.
        </p>

        {/* CTA */}
        <a
          href="https://wallet.nomlimingle.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            background: "linear-gradient(135deg, #6C63FF, #4ECDC4)",
            color: "#fff",
            padding: "0.85rem",
            borderRadius: "12px",
            fontWeight: 600,
            fontSize: "0.95rem",
            textDecoration: "none",
            marginBottom: "0.85rem",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Go to Web Wallet →
        </a>

        {/* Dismiss */}
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: "none",
            border: "none",
            color: "#999",
            fontSize: "0.85rem",
            cursor: "pointer",
            padding: "0.25rem",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

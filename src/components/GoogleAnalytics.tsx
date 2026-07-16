import Script from 'next/script';

/**
 * Google Analytics 4 (gtag.js). Carga directa, sin banner de consentimiento.
 * El Measurement ID se toma de `NEXT_PUBLIC_GA_ID` (build-time); si está vacío,
 * el layout no monta este componente y GA queda desactivado.
 */
export function GoogleAnalytics({ gaId }: { gaId: string }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  );
}

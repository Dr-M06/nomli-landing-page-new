import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Payment Callback Handler
 * This handles the redirect from Flutterwave after payment
 * Shows a clean success message telling user to close the browser
 * NOTE: This function is PUBLIC (no auth required) since Flutterwave redirects here
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const txRef = url.searchParams.get('tx_ref');
  const status = url.searchParams.get('status');
  const transactionId = url.searchParams.get('transaction_id');

  console.log('📥 [FLUTTERWAVE] Payment callback received:', { txRef, status, transactionId });

  // Return minimal success page for native app
  // User will close browser and return to app - polling will detect payment
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Payment Complete</title>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  margin: 0;
  background: #FF0050;
  color: white;
  text-align: center;
  padding: 20px;
}
h1 { font-size: 24px; margin-bottom: 12px; }
p { font-size: 16px; opacity: 0.9; }
</style>
</head>
<body>
<div>
<h1>✅ Payment Successful!</h1>
<p>You can close this window and return to the app.</p>
</div>
</body>
</html>`;

  // Return HTML response with proper headers
  return new Response(html, {
    status: 200,
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...corsHeaders,
    },
  });
});

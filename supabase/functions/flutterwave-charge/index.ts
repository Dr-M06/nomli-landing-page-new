import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, getClientIP, rateLimitResponse, RateLimits } from '../_shared/rateLimit.ts'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight()
  }
  
  const corsHeaders = getCorsHeaders(req)

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Rate limiting for payment processing
    const ipAddress = getClientIP(req)
    const rateLimitResult = await checkRateLimit(
      supabaseClient,
      user.id,
      ipAddress,
      RateLimits.PAYMENT_PROCESS
    )
    
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult)
    }

    let body;
    try {
      body = await req.json()
    } catch (parseError) {
      console.error('❌ [CHARGE] Failed to parse request body:', parseError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request body',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { transactionId, card, customer, amount, currency } = body

    console.log('📥 Received request:', { 
      transactionId, 
      hasCard: !!card, 
      hasCustomer: !!customer, 
      amount, 
      currency,
      cardNumberLength: card?.cardNumber?.length,
      hasCvv: !!card?.cvv,
      hasExpiry: !!card?.expiryMonth && !!card?.expiryYear,
      customerEmail: customer?.email
    })

    // Validate inputs with detailed error messages
    if (!transactionId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing transaction ID',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    if (!card) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing card details',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    if (!card.cardNumber || card.cardNumber.length < 13) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid card number',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    if (!card.cvv || card.cvv.length < 3) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid CVV',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    if (!card.expiryMonth || !card.expiryYear) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid expiry date',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    if (!customer) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing customer details',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    if (!customer.email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing customer email',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid amount',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    if (!currency) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing currency',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const flutterwaveSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY')
    const flutterwavePublicKey = Deno.env.get('FLUTTERWAVE_PUBLIC_KEY') || ''
    
    if (!flutterwaveSecretKey) {
      throw new Error('Payment service not configured')
    }

    console.log('💳 Processing card charge:', {
      transactionId,
      amount,
      currency,
      customer: customer.email,
    })

    // Flutterwave requires 3DES-24 encryption for card details
    // Import crypto-js for 3DES encryption
    let CryptoJS: any
    try {
      // Import crypto-js - handle different module formats
      const cryptoModule = await import('https://esm.sh/crypto-js@4.1.1?target=deno')
      
      // Handle module exports - could be default export or named exports
      CryptoJS = cryptoModule.default || cryptoModule
      
      // If the module structure is different, try accessing properties directly
      if (!CryptoJS.enc && cryptoModule.enc) {
        CryptoJS = cryptoModule
      }
      
      // Verify CryptoJS has required properties
      if (!CryptoJS || !CryptoJS.enc || !CryptoJS.enc.Utf8 || !CryptoJS.TripleDES) {
        console.error('❌ CryptoJS structure:', Object.keys(CryptoJS || {}))
        console.error('❌ cryptoModule structure:', Object.keys(cryptoModule || {}))
        throw new Error('CryptoJS module structure is incorrect')
      }
      
      console.log('✅ CryptoJS imported successfully')
    } catch (importError: any) {
      console.error('❌ Failed to import crypto-js:', importError)
      // Try alternative CDN
      try {
        const cryptoModule = await import('https://cdn.skypack.dev/crypto-js@4.1.1')
        CryptoJS = cryptoModule.default || cryptoModule
        
        if (!CryptoJS.enc && cryptoModule.enc) {
          CryptoJS = cryptoModule
        }
        
        if (!CryptoJS || !CryptoJS.enc || !CryptoJS.enc.Utf8 || !CryptoJS.TripleDES) {
          throw new Error('CryptoJS module structure is incorrect')
        }
        
        console.log('✅ CryptoJS imported via Skypack')
      } catch (altImportError: any) {
        console.error('❌ Alternative import also failed:', altImportError)
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Encryption library not available. Please add FLUTTERWAVE_PUBLIC_KEY to environment variables.',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Get encryption key (Flutterwave public key is required for encryption)
    const encryptionKey = flutterwavePublicKey || Deno.env.get('FLUTTERWAVE_ENCRYPTION_KEY') || ''
    
    if (!encryptionKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Flutterwave public key (FLUTTERWAVE_PUBLIC_KEY) is required for card encryption. Please add it to Edge Function secrets.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Flutterwave 3DES-24 encryption function
    const encryptCardData = (data: string): string => {
      try {
        // Verify CryptoJS is properly loaded
        if (!CryptoJS || !CryptoJS.enc || !CryptoJS.enc.Utf8 || !CryptoJS.TripleDES) {
          throw new Error('CryptoJS is not properly loaded. Missing required modules.')
        }
        
        // Extract first 24 characters of public key for 3DES key (24 bytes = 192 bits for 3DES)
        // Remove any non-alphanumeric characters and take first 24 chars
        const keyString = encryptionKey.replace(/[^a-zA-Z0-9]/g, '').substring(0, 24)
        const paddedKey = keyString.length < 24 ? (keyString + keyString).substring(0, 24) : keyString
        
        console.log('🔐 Encrypting with key length:', paddedKey.length)
        
        // Parse the key using UTF8 encoding
        const key = CryptoJS.enc.Utf8.parse(paddedKey)
        
        // Encrypt using TripleDES in ECB mode with PKCS7 padding
        const encrypted = CryptoJS.TripleDES.encrypt(data, key, {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7
        })
        
        const encryptedString = encrypted.toString()
        console.log('✅ Encryption successful, length:', encryptedString.length)
        return encryptedString
      } catch (error: any) {
        console.error('❌ Encryption error:', error)
        console.error('❌ Error details:', {
          message: error?.message,
          stack: error?.stack,
          cryptoJSAvailable: !!CryptoJS,
          encAvailable: !!CryptoJS?.enc,
          utf8Available: !!CryptoJS?.enc?.Utf8,
          tripleDESAvailable: !!CryptoJS?.TripleDES
        })
        throw new Error('Failed to encrypt card data: ' + (error?.message || 'Unknown error'))
      }
    }

    // Encrypt card details
    let encryptedCardNumber: string
    let encryptedCvv: string
    let encryptedExpiryMonth: string
    let encryptedExpiryYear: string
    
    try {
      encryptedCardNumber = encryptCardData(card.cardNumber)
      encryptedCvv = encryptCardData(card.cvv)
      encryptedExpiryMonth = encryptCardData(card.expiryMonth)
      encryptedExpiryYear = encryptCardData(card.expiryYear)
      console.log('✅ Card details encrypted successfully')
    } catch (encryptError: any) {
      console.error('❌ Failed to encrypt card data:', encryptError)
      return new Response(
        JSON.stringify({
          success: false,
          error: encryptError.message || 'Failed to encrypt card details',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Call Flutterwave Charge API with encrypted card data
    const chargeResponse = await fetch('https://api.flutterwave.com/v3/charges?type=card', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flutterwaveSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card_number: encryptedCardNumber,
        cvv: encryptedCvv,
        expiry_month: encryptedExpiryMonth,
        expiry_year: encryptedExpiryYear,
        currency: currency,
        amount: amount,
        fullname: card.cardholderName,
        email: customer.email,
        tx_ref: transactionId,
        redirect_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/flutterwave-payment-callback`,
      }),
    })

    const chargeData = await chargeResponse.json()
    console.log('💳 Charge response status:', chargeData.status)

    if (chargeData.status === 'success') {
      const data = chargeData.data

      // Check if 3DS authentication is required
      if (data.authorization && data.authorization.mode === 'redirect') {
        return new Response(
          JSON.stringify({
            success: true,
            requiresAuth: true,
            authUrl: data.authorization.redirect,
            message: '3D Secure authentication required',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if payment is successful
      if (data.status === 'successful') {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Payment successful',
            transactionId: data.tx_ref,
            flutterwaveId: data.id,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Payment pending or failed
      return new Response(
        JSON.stringify({
          success: false,
          message: data.processor_response || 'Payment processing',
          status: data.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle error response
    console.error('❌ Charge failed:', chargeData.message)
    throw new Error(chargeData.message || 'Payment failed')
  } catch (error) {
    console.error('❌ Charge error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred processing your payment',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})


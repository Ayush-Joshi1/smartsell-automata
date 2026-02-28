import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const WEBHOOK_URLS: Record<string, string> = {
  order: "https://ayush24.app.n8n.cloud/webhook/tally-sales-order",
  invoice: "https://ayush24.app.n8n.cloud/webhook/generate-invoice",
  complaint: "https://ayush24.app.n8n.cloud/webhook/sales-complaint",
  review: "https://ayush24.app.n8n.cloud/webhook/submit-your-review",
};

const ORDER_REQUIRED_FIELDS = [
  "order_id", "product_id", "product_name", "quantity",
  "unit_price", "total_price", "customer_name", "customer_email",
  "shipping_address",
];

function validateOrderPayload(payload: Record<string, unknown>): string | null {
  for (const field of ORDER_REQUIRED_FIELDS) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function formatComplaintPayload(payload: Record<string, unknown>) {
  return {
    body: {
      body: {
        data: {
          fields: [
            { value: payload.customer_name || "" },
            { value: payload.customer_email || "" },
            { value: payload.description || "" },
          ],
        },
      },
    },
  };
}

function formatReviewPayload(payload: Record<string, unknown>) {
  return {
    customer_name: payload.customer_name || "",
    customer_email: payload.customer_email || "",
    product_id: payload.product_id || "",
    rating: payload.rating || 0,
    review_text: payload.review_text || "",
    timestamp: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { type, payload } = body;

    const webhookUrl = WEBHOOK_URLS[type];
    if (!webhookUrl) {
      return new Response(JSON.stringify({ error: 'Invalid webhook type' }), { status: 400, headers: corsHeaders });
    }

    // Validate order payload fields
    if (type === 'order') {
      const validationError = validateOrderPayload(payload);
      if (validationError) {
        return new Response(JSON.stringify({ error: validationError }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Format payload based on type for n8n compatibility
    let formattedPayload: unknown;
    if (type === 'complaint') {
      formattedPayload = formatComplaintPayload(payload);
    } else if (type === 'review') {
      formattedPayload = formatReviewPayload(payload);
    } else {
      formattedPayload = payload;
    }

    console.log(`[webhook-proxy] Forwarding ${type} request`);
    console.log(`[webhook-proxy] Payload keys:`, Object.keys(payload));

    // Forward to webhook with 10s timeout
    let webhookResponse: Response;
    try {
      webhookResponse = await fetchWithTimeout(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formattedPayload),
      });
      console.log(`[webhook-proxy] ${type} response status:`, webhookResponse.status);
    } catch (err) {
      console.error("Webhook request failed:", type, err instanceof Error ? err.message : err);
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      return new Response(JSON.stringify({ error: isTimeout ? 'Request timed out. Please try again.' : 'Failed to process request. Please try again later.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If order, also send invoice
    if (type === 'order') {
      try {
        console.log(`[webhook-proxy] Sending invoice webhook`);
        const invoiceRes = await fetchWithTimeout(WEBHOOK_URLS.invoice, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formattedPayload),
        });
        console.log(`[webhook-proxy] Invoice response status:`, invoiceRes.status);
      } catch (err) {
        console.error("Invoice webhook failed:", err instanceof Error ? err.message : err);
      }
    }

    const result = await webhookResponse.text();
    console.log(`[webhook-proxy] ${type} result:`, result.substring(0, 200));
    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error("Webhook proxy error:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { corsHeaders } from "../_shared/cors.ts";

const ipRateLimitWindowMs = 15 * 60 * 1000;
const ipRateLimitMaxRequests = 5;
const recipientRateLimitWindowMs = 60 * 60 * 1000;
const recipientRateLimitMaxRequests = 3;
const requestWindows = new Map<string, number[]>();

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR"
});

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...headers
    }
  });
}

function clientKey(req: Request) {
  return (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
}

function rateLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (requestWindows.get(key) || []).filter(hit => hit > cutoff);
  const resetAt = (hits[0] || now) + windowMs;
  const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const headers = {
    "RateLimit-Limit": String(maxRequests),
    "RateLimit-Remaining": String(Math.max(0, maxRequests - hits.length - 1)),
    "RateLimit-Reset": String(retryAfter)
  };
  if (hits.length >= maxRequests) return { limited: true, retryAfter, headers };
  hits.push(now);
  requestWindows.set(key, hits);
  if (requestWindows.size > 10_000) {
    for (const [storedKey, storedHits] of requestWindows) {
      if (!storedHits.some(hit => hit > cutoff) || requestWindows.size > 10_000) requestWindows.delete(storedKey);
      if (requestWindows.size <= 10_000) break;
    }
  }
  return { limited: false, retryAfter, headers };
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function orderRows(items: Array<Record<string, unknown>> = []) {
  if (!Array.isArray(items) || !items.length) return '<tr><td colspan="4">No items found.</td></tr>';
  return items.map((item) => {
    const qty = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    return `
      <tr>
        <td>${escapeHtml(String(item.name || "Product"))}</td>
        <td style="text-align:center;">${qty}</td>
        <td style="text-align:right;">${money.format(price)}</td>
        <td style="text-align:right;">${money.format(price * qty)}</td>
      </tr>
    `;
  }).join("");
}

function baseTemplate({ title, intro, body }: { title: string; intro: string; body: string }) {
  return `
    <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d9e0ea;border-radius:8px;overflow:hidden;">
        <div style="padding:22px 24px;background:#2457d6;color:#ffffff;">
          <h1 style="margin:0;font-size:24px;letter-spacing:0;">Trendora</h1>
          <p style="margin:8px 0 0;font-size:15px;">${escapeHtml(title)}</p>
        </div>
        <div style="padding:24px;">
          <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">${intro}</p>
          ${body}
          <p style="margin:24px 0 0;color:#667085;font-size:14px;">Thank you,<br>Trendora Team</p>
        </div>
      </div>
    </div>
  `;
}

function orderSummary(order: Record<string, unknown> = {}) {
  const orderId = order.id || order.orderId || "";
  return `
    <table style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #edf1f7;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="text-align:left;padding:10px;border-bottom:1px solid #edf1f7;">Item</th>
          <th style="padding:10px;border-bottom:1px solid #edf1f7;">Qty</th>
          <th style="text-align:right;padding:10px;border-bottom:1px solid #edf1f7;">Price</th>
          <th style="text-align:right;padding:10px;border-bottom:1px solid #edf1f7;">Total</th>
        </tr>
      </thead>
      <tbody>${orderRows(order.items as Array<Record<string, unknown>>)}</tbody>
    </table>
    <div style="background:#f8fafc;border:1px solid #edf1f7;border-radius:8px;padding:14px;">
      <p style="margin:0 0 8px;"><strong>Order ID:</strong> #${escapeHtml(String(orderId))}</p>
      <p style="margin:0 0 8px;"><strong>Order Date:</strong> ${escapeHtml(String(order.orderDateTime || "Just now"))}</p>
      <p style="margin:0 0 8px;"><strong>Payment:</strong> ${escapeHtml(String(order.paymentMethod || "N/A"))} - ${escapeHtml(String(order.paymentStatus || "Pending"))}</p>
      <p style="margin:0 0 8px;"><strong>Delivery Address:</strong> ${escapeHtml(String(order.address || "Not provided"))}</p>
      ${order.discountCode ? `<p style="margin:0 0 8px;"><strong>Discount:</strong> ${escapeHtml(String(order.discountCode))} (${money.format(Number(order.discountAmount || 0))})</p>` : ""}
      <p style="margin:0;font-size:18px;"><strong>Total:</strong> ${money.format(Number(order.totalAmount || 0))}</p>
    </div>
  `;
}

function buildMessage(type: string, payload: Record<string, unknown>) {
  if (type === "order-confirmation") {
    const order = (payload.order || payload) as Record<string, unknown>;
    return {
      subject: `Trendora Order Confirmed #${order.id || order.orderId || ""}`,
      htmlContent: baseTemplate({
        title: "Order confirmation",
        intro: `Hi ${escapeHtml(String(order.customerName || payload.name || "Customer"))}, your order has been confirmed.`,
        body: orderSummary(order)
      })
    };
  }

  if (type === "order-cancelled") {
    const order = (payload.order || payload) as Record<string, unknown>;
    const actor = payload.cancelledBy === "admin" ? "our team" : "you";
    return {
      subject: `Trendora Order Cancelled #${order.id || order.orderId || ""}`,
      htmlContent: baseTemplate({
        title: "Order cancellation",
        intro: `Hi ${escapeHtml(String(order.customerName || payload.name || "Customer"))}, order #${escapeHtml(String(order.id || order.orderId || ""))} was cancelled by ${actor}.`,
        body: orderSummary(order)
      })
    };
  }

  if (type === "discount-code") {
    const code = (payload.code || {}) as Record<string, unknown>;
    const value = code.type === "flat" ? money.format(Number(code.amount || 0)) : `${Number(code.amount || 0)}%`;
    return {
      subject: `Your Trendora discount code: ${code.code || ""}`,
      htmlContent: baseTemplate({
        title: "Private discount code",
        intro: `Hi ${escapeHtml(String(code.userName || payload.name || "Customer"))}, a private discount code has been created for your account.`,
        body: `
          <div style="border:1px solid #bfe8cf;background:#eef8f2;border-radius:8px;padding:18px;margin:18px 0;">
            <p style="margin:0 0 10px;font-size:15px;color:#135c3b;">Use this code at checkout:</p>
            <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:2px;color:#135c3b;">${escapeHtml(String(code.code || ""))}</p>
          </div>
          <p><strong>Discount:</strong> ${escapeHtml(value)} off</p>
          <p><strong>Minimum order:</strong> ${money.format(Number(code.minOrder || 0))}</p>
          <p><strong>Max uses:</strong> ${Number(code.maxUses || 1)}</p>
          ${code.expiresAt ? `<p><strong>Expires on:</strong> ${escapeHtml(String(code.expiresAt))}</p>` : ""}
        `
      })
    };
  }

  throw new Error("Unsupported email type");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Method not allowed" }, 405);
  try {
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("MAIL_FROM_EMAIL");
    const senderName = Deno.env.get("MAIL_FROM_NAME") || "Trendora";
    if (!brevoApiKey || !senderEmail) throw new Error("Missing Brevo secrets");

    const { to, type, payload = {} } = await req.json();
    if (!to || !type) throw new Error("Missing recipient or email type");
    if (!/^\S+@\S+\.\S+$/.test(String(to)) || String(to).length > 254) throw new Error("A valid recipient email is required");
    if (!["order-confirmation", "order-cancelled", "discount-code"].includes(type)) throw new Error("Unsupported email type");

    // These limits protect warm edge isolates. Configure a shared WAF/Redis
    // limiter at the edge as well before scaling this function horizontally.
    const ipLimit = rateLimit(`ip:${clientKey(req)}`, ipRateLimitMaxRequests, ipRateLimitWindowMs);
    if (ipLimit.limited) return jsonResponse({ success: false, message: "Too many email requests. Please try again later.", retryAfter: ipLimit.retryAfter }, 429, { ...ipLimit.headers, "Retry-After": String(ipLimit.retryAfter) });
    const recipientLimit = rateLimit(`recipient:${String(to).trim().toLowerCase()}`, recipientRateLimitMaxRequests, recipientRateLimitWindowMs);
    if (recipientLimit.limited) return jsonResponse({ success: false, message: "Too many messages have been sent to this email address. Please try again later.", retryAfter: recipientLimit.retryAfter }, 429, { ...recipientLimit.headers, "Retry-After": String(recipientLimit.retryAfter) });

    const message = buildMessage(type, payload);
    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject: message.subject,
        htmlContent: message.htmlContent
      })
    });

    const result = await brevoResponse.json().catch(() => ({}));
    if (!brevoResponse.ok) {
      return jsonResponse({
        success: false,
        message: result.message || "Brevo email send failed",
        brevo: result
      }, brevoResponse.status);
    }

    return jsonResponse({ success: true, message: "Email sent successfully", brevo: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed";
    return jsonResponse({ success: false, message }, /required|unsupported|valid/i.test(message) ? 400 : 500);
  }
});

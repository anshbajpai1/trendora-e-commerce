import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR"
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing in trendora-backend/.env`);
  return value;
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: String(process.env.BREVO_SMTP_SECURE || "false") === "true",
    auth: {
      user: requiredEnv("BREVO_SMTP_USER"),
      pass: requiredEnv("BREVO_SMTP_KEY")
    }
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function orderRows(items = []) {
  if (!Array.isArray(items) || !items.length) return "<tr><td colspan=\"4\">No items found.</td></tr>";
  return items.map(item => {
    const qty = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    return `
      <tr>
        <td>${escapeHtml(item.name || "Product")}</td>
        <td style="text-align:center;">${qty}</td>
        <td style="text-align:right;">${money.format(price)}</td>
        <td style="text-align:right;">${money.format(price * qty)}</td>
      </tr>
    `;
  }).join("");
}

function baseTemplate({ title, intro, body }) {
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

function orderSummary(order = {}) {
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
      <tbody>${orderRows(order.items)}</tbody>
    </table>
    <div style="background:#f8fafc;border:1px solid #edf1f7;border-radius:8px;padding:14px;">
      <p style="margin:0 0 8px;"><strong>Order ID:</strong> #${escapeHtml(order.id || order.orderId)}</p>
      <p style="margin:0 0 8px;"><strong>Order Date:</strong> ${escapeHtml(order.orderDateTime || "Just now")}</p>
      <p style="margin:0 0 8px;"><strong>Payment:</strong> ${escapeHtml(order.paymentMethod || "N/A")} - ${escapeHtml(order.paymentStatus || "Pending")}</p>
      <p style="margin:0 0 8px;"><strong>Delivery Address:</strong> ${escapeHtml(order.address || "Not provided")}</p>
      ${order.discountCode ? `<p style="margin:0 0 8px;"><strong>Discount:</strong> ${escapeHtml(order.discountCode)} (${money.format(Number(order.discountAmount || 0))})</p>` : ""}
      <p style="margin:0;font-size:18px;"><strong>Total:</strong> ${money.format(Number(order.totalAmount || 0))}</p>
    </div>
  `;
}

function buildMessage(type, payload) {
  if (type === "order-confirmation") {
    const order = payload.order || payload;
    return {
      subject: `Trendora Order Confirmed #${order.id || order.orderId}`,
      html: baseTemplate({
        title: "Order confirmation",
        intro: `Hi ${escapeHtml(order.customerName || payload.name || "Customer")}, your order has been confirmed.`,
        body: orderSummary(order)
      })
    };
  }

  if (type === "order-cancelled") {
    const order = payload.order || payload;
    const actor = payload.cancelledBy === "admin" ? "our team" : "you";
    return {
      subject: `Trendora Order Cancelled #${order.id || order.orderId}`,
      html: baseTemplate({
        title: "Order cancellation",
        intro: `Hi ${escapeHtml(order.customerName || payload.name || "Customer")}, order #${escapeHtml(order.id || order.orderId)} was cancelled by ${actor}.`,
        body: orderSummary(order)
      })
    };
  }

  if (type === "discount-code") {
    const code = payload.code || {};
    const value = code.type === "flat" ? money.format(Number(code.amount || 0)) : `${Number(code.amount || 0)}%`;
    return {
      subject: `Your Trendora discount code: ${code.code}`,
      html: baseTemplate({
        title: "Private discount code",
        intro: `Hi ${escapeHtml(code.userName || payload.name || "Customer")}, a private discount code has been created for your account.`,
        body: `
          <div style="border:1px solid #bfe8cf;background:#eef8f2;border-radius:8px;padding:18px;margin:18px 0;">
            <p style="margin:0 0 10px;font-size:15px;color:#135c3b;">Use this code at checkout:</p>
            <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:2px;color:#135c3b;">${escapeHtml(code.code)}</p>
          </div>
          <p><strong>Discount:</strong> ${escapeHtml(value)} off</p>
          <p><strong>Minimum order:</strong> ${money.format(Number(code.minOrder || 0))}</p>
          <p><strong>Max uses:</strong> ${Number(code.maxUses || 1)}</p>
          ${code.expiresAt ? `<p><strong>Expires on:</strong> ${escapeHtml(code.expiresAt)}</p>` : ""}
        `
      })
    };
  }

  throw new Error("Unsupported email type");
}

async function sendTrendoraEmail({ to, type, payload }) {
  if (!to || !type) throw new Error("Missing recipient or email type");
  const { subject, html } = buildMessage(type, payload || {});
  const transporter = createTransporter();

  return transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME || "Trendora"}" <${requiredEnv("MAIL_FROM_EMAIL")}>`,
    to,
    subject,
    html
  });
}

app.get("/health", (req, res) => {
  res.json({ success: true, message: "Trendora email backend is running" });
});

app.post("/send-notification", async (req, res) => {
  try {
    const info = await sendTrendoraEmail(req.body);
    res.json({ success: true, message: "Email sent successfully", id: info.messageId });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/send-email", async (req, res) => {
  try {
    const { email, orderId, name } = req.body;
    const payload = {
      to: email,
      type: "order-confirmation",
      payload: { order: { id: orderId, customerName: name } }
    };
    const info = await sendTrendoraEmail(payload);
    res.json({ success: true, message: "Email sent successfully", id: info.messageId });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Trendora email backend running on port ${port}`);
});

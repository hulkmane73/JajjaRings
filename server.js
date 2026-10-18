// Jajja Rings payment server (Flutterwave, Mobile Money Uganda)
// Flutterwave sends the PIN / one-time code prompt to the customer's phone.
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const KEY = process.env.FLW_SECRET_KEY;
const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
if (!KEY) { console.error("Set FLW_SECRET_KEY first."); process.exit(1); }

const app = express();
app.use(express.json());
app.use(cors({ origin: ORIGIN }));

const API = "https://api.flutterwave.com/v3";
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const pending = new Map(); // reference -> expected amount (use a database in production)

app.post("/charge", async (req, res) => {
  try {
    const { network, phone, amount, email } = req.body || {};
    const amt = Number(amount);
    if (!/^256[37]\d{8}$/.test(phone || "") || !(amt >= 1000))
      return res.status(400).json({ error: "Invalid phone or amount" });
    const net = /airtel/i.test(network) ? "AIRTEL" : "MTN";
    const tx_ref = "JR-" + crypto.randomBytes(8).toString("hex");
    const r = await fetch(`${API}/charges?type=mobile_money_uganda`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        tx_ref, amount: amt, currency: "UGX", network: net,
        phone_number: phone, email: email || "customer@jajjarings.com",
        fullname: "Jajja Rings Customer",
      }),
    });
    const d = await r.json();
    if (d.status !== "success") return res.status(400).json({ error: d.message || "Charge failed" });
    pending.set(tx_ref, amt);
    res.json({ reference: tx_ref });
  } catch (e) { res.status(500).json({ error: "Server error" }); }
});

app.get("/status", async (req, res) => {
  try {
    const ref = String(req.query.ref || "");
    if (!pending.has(ref)) return res.json({ status: "failed" });
    const r = await fetch(`${API}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(ref)}`, { headers: H });
    const d = await r.json();
    const t = d.data;
    if (t && t.status === "successful" && t.currency === "UGX" && Number(t.amount) >= pending.get(ref)) {
      console.log("PAID", ref, t.amount, t.customer && t.customer.phone_number);
      return res.json({ status: "successful" });
    }
    if (t && t.status === "failed") return res.json({ status: "failed" });
    res.json({ status: "pending" });
  } catch (e) { res.json({ status: "pending" }); }
});

app.get("/", (_, res) => res.send("Jajja Rings payment server is running."));
app.listen(process.env.PORT || 3000, () => console.log("Payment server running"));

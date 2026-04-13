require("dotenv").config();
const express = require("express");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;
const TREASURY_ADDRESS = "0x4D4F4135757fAef9eFbB3a959A58CD01c0beCa4D";

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "FlowPay server running" });
});

app.post("/create-onramp", async (req, res) => {
  try {
    const { amount, treasuryAddress = TREASURY_ADDRESS } = req.body;
    const params = new URLSearchParams({
      "transaction_details[destination_currency]": "usdc",
      "transaction_details[destination_network]": "arbitrum",
      "transaction_details[source_exchange_amount]": amount.toString(),
      "transaction_details[source_currency]": "usd",
      "transaction_details[lock_wallet_address]": "true",
      "transaction_details[wallet_address]": treasuryAddress,
    });
    const response = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const session = await response.json();
    console.log("Stripe response:", JSON.stringify(session, null, 2));
    if (session.error) return res.status(400).json({ error: session.error.message });
    res.json({ redirect_url: session.redirect_url, session_id: session.id, client_secret: session.client_secret });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  console.log("Event:", event.type);
  res.json({ received: true });
});

app.listen(PORT, () => console.log("FlowPay running on port", PORT));
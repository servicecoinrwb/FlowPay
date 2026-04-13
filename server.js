require("dotenv").config();
const express = require("express");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { ethers } = require("ethers");
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

    const session = await stripe.request({
      method: "POST",
      path: "/v1/crypto/onramp_sessions",
      params: {
        transaction_details: {
          destination_currency: "usdc",
          destination_network: "arbitrum",
          destination_amount: amount.toString(),
          lock_wallet_address: true,
          wallet_address: treasuryAddress,
        },
      },
    });

    console.log("Onramp session created:", session.id);
    res.json({
      redirect_url: session.redirect_url,
      session_id: session.id,
      client_secret: session.client_secret,
    });
  } catch (err) {
    console.error("Onramp session error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  console.log("Event received:", event.type);
  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log("FlowPay Server running on port", PORT);
});
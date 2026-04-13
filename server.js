require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { ethers } = require("ethers");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

const TREASURY_ADDRESS = "0x4D4F4135757fAef9eFbB3a959A58CD01c0beCa4D";
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const TREASURY_ABI = [
  "function receivePayment(uint256 usdcAmount) external",
  "function getStats() external view returns (uint256, uint256, uint256, uint128)"
];
const USDC_ABI = [
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)"
];

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "FlowPay server running" });
});

app.post("/create-payment", async (req, res) => {
  try {
    const { amount, currency = "usd", businessTreasury = TREASURY_ADDRESS } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: { businessTreasury, flowpay: "true" }
    });
    console.log("Payment intent created:", paymentIntent.id, "Amount:", amount);
    res.json({ clientSecret: paymentIntent.client_secret, id: paymentIntent.id });
  } catch (err) {
    console.error("Error creating payment:", err.message);
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
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const amountUSD = paymentIntent.amount / 100;
    const treasury = paymentIntent.metadata.businessTreasury || TREASURY_ADDRESS;
    console.log("Payment succeeded:", paymentIntent.id, "Amount:", amountUSD, "USD");
    depositToTreasury(amountUSD, treasury);
  }
  res.json({ received: true });
});

async function depositToTreasury(amountUSD, treasuryAddress) {
  try {
    console.log("Connecting to Arbitrum One...");
    const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
    const treasury = new ethers.Contract(treasuryAddress, TREASURY_ABI, wallet);
    const usdcAmount = ethers.parseUnits(amountUSD.toFixed(6), 6);
    console.log("Approving USDC:", amountUSD);
    const approveTx = await usdc.approve(treasuryAddress, usdcAmount);
    await approveTx.wait();
    console.log("Calling receivePayment...");
    const payTx = await treasury.receivePayment(usdcAmount);
    const receipt = await payTx.wait();
    console.log("On-chain deposit complete! Tx:", receipt.hash);
    console.log("View: https://arbiscan.io/tx/" + receipt.hash);
  } catch (err) {
    console.error("On-chain deposit failed:", err.message);
  }
}

app.listen(PORT, () => {
  console.log("FlowPay Server running on port", PORT);
});
// Placeholder authentication middleware
// Replace with wallet signature verification in production
const auth = (req, res, next) => {
  const walletAddress = req.headers["x-wallet-address"];

  if (!walletAddress) {
    return res.status(401).json({ error: "No wallet address provided" });
  }

  req.walletAddress = walletAddress;
  next();
};

module.exports = auth;

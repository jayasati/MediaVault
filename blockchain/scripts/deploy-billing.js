const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  console.log("\nDeploying BillingTransparency...");
  const BillingTransparency = await hre.ethers.getContractFactory("BillingTransparency");
  const billing = await BillingTransparency.deploy();
  await billing.waitForDeployment();
  const billingAddress = await billing.getAddress();
  console.log("BillingTransparency deployed to:", billingAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

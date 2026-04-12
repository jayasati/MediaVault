const fs = require("fs");
const path = require("path");

function loadDeployment(network) {
  const filePath = path.join(__dirname, `${network}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No deployment found for network: ${network}. Run deploy-phase1.js first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadABI(contractName) {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`No artifact found for ${contractName}. Run 'npx hardhat compile' first.`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;
}

function getContracts(network) {
  const deployment = loadDeployment(network);
  const contractNames = Object.keys(deployment.contracts);

  const contracts = {};
  for (const name of contractNames) {
    contracts[name] = {
      address: deployment.contracts[name],
      abi: loadABI(name),
    };
  }

  return {
    network: deployment.network,
    deployedAt: deployment.deployedAt,
    contracts,
  };
}

module.exports = { loadDeployment, loadABI, getContracts };

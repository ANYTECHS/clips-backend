# Admin Configuration Integration Guide

## Overview

This guide provides practical examples for integrating the admin configuration endpoints into your platform's workflow and monitoring systems.

## Prerequisites

- Stellar JavaScript SDK (`@stellar/js-sdk`)
- Soroban CLI installed
- Admin account with signing capabilities
- Contract ID and network details

## JavaScript/TypeScript Examples

### Example 1: Set Platform Fee Programmatically

```typescript
import * as StellarSdk from "@stellar/js-sdk";

interface AdminConfig {
  contractId: string;
  adminSecret: string;
  networkPassphrase: string;
  serverUrl: string;
}

async function setPlatformFee(
  config: AdminConfig,
  recipientAddress: string,
  bpsValue: number
): Promise<string> {
  // Connect to Stellar network
  const server = new StellarSdk.Server(config.serverUrl);
  const keypair = StellarSdk.Keypair.fromSecret(config.adminSecret);
  
  // Fetch account
  const account = await server.loadAccount(keypair.publicKey());
  
  // Validate input
  if (bpsValue < 0 || bpsValue > 10000) {
    throw new Error("BPS must be between 0 and 10,000");
  }
  
  if (!StellarSdk.StrKey.isValidEd25519PublicKey(recipientAddress)) {
    throw new Error("Invalid Stellar address");
  }
  
  // Build transaction
  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addMemo(StellarSdk.Memo.text(`Set platform fee to ${(bpsValue / 100).toFixed(2)}%`))
    .setTimeout(30)
    .build();
  
  // Sign transaction
  transaction.sign(keypair);
  
  // Submit to network
  const result = await server.submitTransaction(transaction);
  
  console.log(`Platform fee updated. Transaction: ${result.hash}`);
  return result.hash;
}

// Usage
const config: AdminConfig = {
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  adminSecret: "S...",
  networkPassphrase: StellarSdk.Networks.TESTNET_NETWORK_PASSPHRASE,
  serverUrl: "https://soroban-testnet.stellar.org",
};

setPlatformFee(config, "GBRPYHIL2CI3WHZDTOOQFC6EB4NCCCTVQQ2GSTSZ36K27GUJIBC", 500)
  .then(txHash => console.log(`Success: ${txHash}`))
  .catch(err => console.error(`Error: ${err.message}`));
```

### Example 2: Set Default Royalty BPS

```typescript
async function setDefaultRoyalty(
  config: AdminConfig,
  bpsValue: number
): Promise<string> {
  const server = new StellarSdk.Server(config.serverUrl);
  const keypair = StellarSdk.Keypair.fromSecret(config.adminSecret);
  const account = await server.loadAccount(keypair.publicKey());
  
  // Validate
  if (bpsValue < 0 || bpsValue > 10000) {
    throw new Error("BPS must be between 0 and 10,000");
  }
  
  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addMemo(StellarSdk.Memo.text(`Set default royalty to ${(bpsValue / 100).toFixed(2)}%`))
    .setTimeout(30)
    .build();
  
  transaction.sign(keypair);
  const result = await server.submitTransaction(transaction);
  
  console.log(`Default royalty updated. Transaction: ${result.hash}`);
  return result.hash;
}

// Usage
setDefaultRoyalty(config, 1000)
  .then(txHash => console.log(`Updated to 10% royalty: ${txHash}`))
  .catch(err => console.error(`Error: ${err.message}`));
```

### Example 3: Listen for Configuration Changes

```typescript
import { Api } from "@stellar/js-sdk";

async function monitorConfigUpdates(
  config: AdminConfig,
  onUpdate: (event: ConfigUpdateEvent) => void
): Promise<void> {
  const server = new StellarSdk.Server(config.serverUrl);
  
  // Start event stream for config_updated events
  const stream = await server.transactions()
    .forAccount(config.contractId)
    .stream({
      onmessage: async (transaction) => {
        // Extract events from transaction result
        for (const event of transaction.operations) {
          if (event.type === "invoke_host_function") {
            // Parse contract events
            const events = extractContractEvents(event);
            
            events.forEach(e => {
              if (e.type === "config_updated") {
                onUpdate({
                  admin: e.topics[1],
                  configType: e.data.config_type,
                  oldBps: e.data.old_bps,
                  newBps: e.data.new_bps,
                  timestamp: new Date(transaction.created_at),
                  txHash: transaction.hash,
                });
              }
            });
          }
        }
      },
      onerror: (err) => console.error("Stream error:", err),
    });
}

interface ConfigUpdateEvent {
  admin: string;
  configType: "platform_fee" | "default_royalty";
  oldBps: number;
  newBps: number;
  timestamp: Date;
  txHash: string;
}

// Usage
monitorConfigUpdates(config, (event) => {
  console.log(`Config updated by ${event.admin}:`);
  console.log(`  Type: ${event.configType}`);
  console.log(`  Old: ${event.oldBps} BPS`);
  console.log(`  New: ${event.newBps} BPS`);
  console.log(`  Time: ${event.timestamp.toISOString()}`);
});
```

### Example 4: Get Current Configuration

```typescript
async function getAdminConfiguration(
  contractId: string,
  serverUrl: string
): Promise<AdminConfigurationState> {
  const server = new StellarSdk.Server(serverUrl);
  
  // Read contract state
  const state = await server.getContractData(contractId, "");
  
  // Parse configuration values
  const platformFee = getPlatformFeeFromState(state);
  const defaultRoyalty = getDefaultRoyaltyFromState(state);
  
  return {
    platformFeeRecipient: platformFee?.recipient,
    platformFeeBps: platformFee?.bps,
    defaultRoyaltyBps: defaultRoyalty,
    lastUpdated: new Date(),
  };
}

interface AdminConfigurationState {
  platformFeeRecipient?: string;
  platformFeeBps?: number;
  defaultRoyaltyBps?: number;
  lastUpdated: Date;
}

// Usage
const currentConfig = await getAdminConfiguration(
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "https://soroban-testnet.stellar.org"
);
console.log("Current configuration:", currentConfig);
```

## Soroban CLI Examples

### Set Platform Fee via CLI

```bash
# Set 5% platform fee
soroban contract invoke \
  --source-account admin-key.json \
  --id CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  -- \
  set_default_platform_fee \
  --recipient GBRPYHIL2CI3WHZDTOOQFC6EB4NCCCTVQQ2GSTSZ36K27GUJIBC \
  --bps 500
```

### Set Default Royalty via CLI

```bash
# Set 10% default royalty
soroban contract invoke \
  --source-account admin-key.json \
  --id CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  -- \
  set_default_royalty_bps \
  --bps 1000
```

### Query Current Configuration

```bash
# Get platform fee
soroban contract invoke \
  --id CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  -- \
  get_default_platform_fee

# Get default royalty
soroban contract invoke \
  --id CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  -- \
  get_default_royalty_bps
```

### Monitor Configuration Events

```bash
# Listen for config_updated events
soroban events watch \
  --id CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --topic config_updated \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org
```

## REST API Integration (Backend)

### Example: Express.js Integration

```typescript
import express from "express";
import * as StellarSdk from "@stellar/js-sdk";

const app = express();
app.use(express.json());

interface AdminRequest {
  contractId: string;
  configType: "platform_fee" | "default_royalty";
  recipient?: string;
  bps: number;
  adminSignature: string;
}

app.post("/admin/config/update", async (req, res) => {
  try {
    const { contractId, configType, recipient, bps, adminSignature } = req.body as AdminRequest;
    
    // Validate signature
    const isValid = await validateAdminSignature(adminSignature, contractId);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    
    // Validate BPS
    if (bps < 0 || bps > 10000) {
      return res.status(400).json({ error: "BPS must be between 0 and 10,000" });
    }
    
    let txHash: string;
    
    if (configType === "platform_fee") {
      if (!recipient) {
        return res.status(400).json({ error: "Recipient required for platform_fee" });
      }
      txHash = await setPlatformFee(
        {
          contractId,
          adminSecret: process.env.ADMIN_SECRET!,
          networkPassphrase: StellarSdk.Networks.TESTNET_NETWORK_PASSPHRASE,
          serverUrl: process.env.SOROBAN_RPC_URL!,
        },
        recipient,
        bps
      );
    } else {
      txHash = await setDefaultRoyalty(
        {
          contractId,
          adminSecret: process.env.ADMIN_SECRET!,
          networkPassphrase: StellarSdk.Networks.TESTNET_NETWORK_PASSPHRASE,
          serverUrl: process.env.SOROBAN_RPC_URL!,
        },
        bps
      );
    }
    
    // Log to audit trail
    await logConfigChange({
      timestamp: new Date(),
      admin: req.user.id,
      configType,
      oldBps: 0, // Retrieve from contract
      newBps: bps,
      txHash,
    });
    
    res.json({
      success: true,
      txHash,
      message: `${configType} updated to ${(bps / 100).toFixed(2)}%`,
    });
  } catch (error) {
    console.error("Config update error:", error);
    res.status(500).json({ error: "Failed to update configuration" });
  }
});

async function validateAdminSignature(signature: string, contractId: string): Promise<boolean> {
  // Implement signature validation
  return true;
}

async function logConfigChange(change: any): Promise<void> {
  // Log to database or audit trail
  console.log("Config change:", change);
}

app.listen(3000, () => console.log("Admin config API running on port 3000"));
```

## Error Handling

### Common Error Scenarios

```typescript
async function handleConfigUpdate(
  config: AdminConfig,
  bpsValue: number
): Promise<void> {
  try {
    const txHash = await setDefaultRoyalty(config, bpsValue);
    console.log(`Successfully updated. Transaction: ${txHash}`);
  } catch (error) {
    if (error.message.includes("BPS must be between")) {
      console.error("Invalid BPS value. Use 0-10,000.");
    } else if (error.message.includes("InvalidRoyaltyBps")) {
      console.error("Contract rejected: BPS value out of range.");
    } else if (error.message.includes("Unauthorized")) {
      console.error("Admin signature invalid or caller is not admin.");
    } else if (error.message.includes("NotInitialized")) {
      console.error("Contract not initialized yet.");
    } else {
      console.error("Unknown error:", error);
    }
  }
}
```

## Testing

### Unit Tests Example

```typescript
import { describe, it, expect } from "vitest";

describe("Admin Configuration", () => {
  it("should set platform fee with valid input", async () => {
    const config = getMockConfig();
    const txHash = await setPlatformFee(config, "G...", 500);
    expect(txHash).toMatch(/^[a-f0-9]{64}$/);
  });
  
  it("should reject BPS > 10000", async () => {
    const config = getMockConfig();
    await expect(
      setPlatformFee(config, "G...", 10001)
    ).rejects.toThrow("BPS must be between 0 and 10,000");
  });
  
  it("should reject invalid address", async () => {
    const config = getMockConfig();
    await expect(
      setPlatformFee(config, "invalid-address", 500)
    ).rejects.toThrow("Invalid Stellar address");
  });
  
  it("should emit config_updated event", async () => {
    const config = getMockConfig();
    const txHash = await setDefaultRoyalty(config, 1000);
    
    // Verify event was emitted
    const events = await getContractEvents(config.contractId, txHash);
    const configEvent = events.find(e => e.type === "config_updated");
    
    expect(configEvent).toBeDefined();
    expect(configEvent.data.config_type).toBe("default_royalty");
    expect(configEvent.data.new_bps).toBe(1000);
  });
});
```

## Monitoring and Alerts

### Alert Configuration

```typescript
interface AlertConfig {
  frequentChanges: {
    threshold: number; // Changes per hour
    enabled: boolean;
  };
  unusualValues: {
    maxBps: number;
    enabled: boolean;
  };
  unauthorizedAttempts: {
    enabled: boolean;
  };
}

async function setupAlerts(contractId: string, config: AlertConfig) {
  // Monitor for frequent changes
  if (config.frequentChanges.enabled) {
    const changes = await getRecentChanges(contractId, 3600);
    if (changes.length > config.frequentChanges.threshold) {
      await sendAlert(`High frequency config changes detected: ${changes.length} in 1 hour`);
    }
  }
  
  // Monitor for unusual values
  if (config.unusualValues.enabled) {
    const current = await getAdminConfiguration(contractId, process.env.SOROBAN_RPC_URL!);
    if (current.platformFeeBps && current.platformFeeBps > config.unusualValues.maxBps) {
      await sendAlert(
        `Platform fee exceeds maximum: ${current.platformFeeBps} BPS (max: ${config.unusualValues.maxBps})`
      );
    }
  }
}

async function sendAlert(message: string) {
  // Send via email, Slack, PagerDuty, etc.
  console.warn(`⚠️  ALERT: ${message}`);
}
```

## Best Practices

1. **Always validate input** before submitting transactions
2. **Use memos** to document configuration changes
3. **Monitor events** for audit trail
4. **Implement rate limiting** on configuration endpoints
5. **Store configuration history** in your database
6. **Test on testnet** before mainnet deployments
7. **Use timelock mechanisms** for critical changes
8. **Implement access controls** on admin endpoints
9. **Log all configuration changes** for compliance
10. **Plan configuration updates** during maintenance windows

## Support and Troubleshooting

For issues or questions:
1. Check the [admin-config-endpoints.md](admin-config-endpoints.md) documentation
2. Review the [OpenAPI specification](admin-config-openapi.yaml)
3. Check Soroban documentation: https://developers.stellar.org/docs/build/guides/soroban
4. Run tests to verify your integration

#!/usr/bin/env bash
set -e

echo "Running Soroban Deployment Verification Script..."
npx ts-node scripts/verify-deployment.ts
echo "Deployment verification completed successfully."

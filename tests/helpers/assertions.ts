/**
 * Custom Assertions and Validators
 * Production-ready assertion utilities for Solana program testing
 */

import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";

/**
 * Assert that a PublicKey matches expected value
 */
export function assertPublicKeyEquals(
  actual: PublicKey,
  expected: PublicKey,
  message?: string
): void {
  expect(actual.toBase58()).to.equal(
    expected.toBase58(),
    message || `Expected PublicKey to be ${expected.toBase58()}, got ${actual.toBase58()}`
  );
}

/**
 * Assert that an array of bytes matches expected value
 */
export function assertBytesEqual(
  actual: number[] | Uint8Array,
  expected: number[] | Uint8Array,
  message?: string
): void {
  const actualArray = Array.from(actual);
  const expectedArray = Array.from(expected);
  
  expect(actualArray).to.deep.equal(
    expectedArray,
    message || "Byte arrays do not match"
  );
}

/**
 * Assert that a transaction succeeded
 */
export function assertTransactionSuccess(result: any, message?: string): void {
  expect(result).to.exist;
  expect(result.value).to.exist;
  expect(result.value.err).to.be.null;
  
  if (message) {
    console.log(`✅ ${message}`);
  }
}

/**
 * Assert that a transaction failed with specific error
 */
export function assertTransactionError(
  error: any,
  expectedError: string | RegExp,
  message?: string
): void {
  expect(error).to.exist;
  
  const errorString = error.toString();
  
  if (typeof expectedError === "string") {
    expect(errorString).to.include(expectedError, message);
  } else {
    expect(errorString).to.match(expectedError, message);
  }
}

/**
 * Assert that an account exists and has expected data
 */
export async function assertAccountExists(
  program: Program,
  accountAddress: PublicKey,
  message?: string
): Promise<any> {
  const account = await program.provider.connection.getAccountInfo(accountAddress);
  
  expect(account).to.exist;
  expect(account).to.not.be.null;
  
  if (message) {
    console.log(`✅ ${message}: ${accountAddress.toBase58()}`);
  }
  
  return account;
}

/**
 * Assert that an account does not exist
 */
export async function assertAccountDoesNotExist(
  program: Program,
  accountAddress: PublicKey,
  message?: string
): Promise<void> {
  const account = await program.provider.connection.getAccountInfo(accountAddress);
  
  expect(account).to.be.null;
  
  if (message) {
    console.log(`✅ ${message}: ${accountAddress.toBase58()}`);
  }
}

/**
 * Assert token balance
 */
export function assertTokenBalance(
  actual: number | bigint,
  expected: number | bigint,
  message?: string
): void {
  expect(actual.toString()).to.equal(
    expected.toString(),
    message || `Expected token balance ${expected}, got ${actual}`
  );
}

/**
 * Assert SOL balance (in lamports)
 */
export function assertSolBalance(
  actual: number,
  expected: number,
  tolerance: number = 1000000, // 0.001 SOL tolerance for fees
  message?: string
): void {
  const diff = Math.abs(actual - expected);
  expect(diff).to.be.lessThan(
    tolerance,
    message || `SOL balance difference ${diff} exceeds tolerance ${tolerance}`
  );
}

/**
 * Assert that percentages sum to 100
 */
export function assertPercentagesValid(
  percentages: number[],
  message?: string
): void {
  const sum = percentages.reduce((acc, p) => acc + p, 0);
  expect(sum).to.equal(100, message || `Percentages sum to ${sum}, expected 100`);
}

/**
 * Assert that a value is within range
 */
export function assertInRange(
  actual: number,
  min: number,
  max: number,
  message?: string
): void {
  expect(actual).to.be.at.least(min);
  expect(actual).to.be.at.most(max);
  
  if (message) {
    console.log(`✅ ${message}: ${actual} in range [${min}, ${max}]`);
  }
}

/**
 * Assert that a string matches length constraints
 */
export function assertStringLength(
  actual: string,
  maxLength: number,
  message?: string
): void {
  expect(actual.length).to.be.at.most(
    maxLength,
    message || `String length ${actual.length} exceeds max ${maxLength}`
  );
}

/**
 * Assert that a CID is valid format
 */
export function assertValidCID(cid: string, message?: string): void {
  // Basic IPFS CID validation (starts with Qm or b and has correct length)
  const isValid = 
    (cid.startsWith("Qm") && cid.length === 46) ||
    (cid.startsWith("b") && cid.length >= 59);
  
  expect(isValid).to.be.true;
  
  if (message) {
    console.log(`✅ ${message}: ${cid}`);
  }
}

/**
 * Assert that version is valid
 */
export function assertValidVersion(
  version: { major: number; minor: number; patch: number },
  message?: string
): void {
  expect(version.major).to.be.a("number");
  expect(version.minor).to.be.a("number");
  expect(version.patch).to.be.a("number");
  
  expect(version.major).to.be.at.least(0);
  expect(version.minor).to.be.at.least(0);
  expect(version.patch).to.be.at.least(0);
  
  if (message) {
    console.log(`✅ ${message}: ${version.major}.${version.minor}.${version.patch}`);
  }
}

/**
 * Assert that event was emitted
 */
export function assertEventEmitted(
  events: any[],
  eventName: string,
  message?: string
): any {
  const event = events.find((e) => e.name === eventName);
  
  expect(event).to.exist;
  
  if (message) {
    console.log(`✅ ${message}: ${eventName}`);
  }
  
  return event;
}

/**
 * Assert that event has specific data
 */
export function assertEventData(
  event: any,
  expectedData: Record<string, any>,
  message?: string
): void {
  expect(event).to.exist;
  expect(event.data).to.exist;
  
  for (const [key, value] of Object.entries(expectedData)) {
    if (value instanceof PublicKey) {
      assertPublicKeyEquals(event.data[key], value);
    } else if (Array.isArray(value)) {
      expect(event.data[key]).to.deep.equal(value);
    } else {
      expect(event.data[key]).to.equal(value);
    }
  }
  
  if (message) {
    console.log(`✅ ${message}`);
  }
}

/**
 * Assert compute units used within budget
 */
export function assertComputeUnitsWithinBudget(
  unitsUsed: number,
  budget: number,
  message?: string
): void {
  expect(unitsUsed).to.be.at.most(
    budget,
    message || `Compute units ${unitsUsed} exceeds budget ${budget}`
  );
  
  console.log(`✅ Compute units: ${unitsUsed}/${budget} (${((unitsUsed/budget)*100).toFixed(1)}%)`);
}

/**
 * Assert timestamp is recent (within last N seconds)
 */
export function assertRecentTimestamp(
  timestamp: number,
  maxAgeSeconds: number = 60,
  message?: string
): void {
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;
  
  expect(age).to.be.at.most(
    maxAgeSeconds,
    message || `Timestamp age ${age}s exceeds max ${maxAgeSeconds}s`
  );
}

/**
 * Assert batch size within limits
 */
export function assertBatchSize(
  actual: number,
  maxSize: number,
  message?: string
): void {
  expect(actual).to.be.at.most(
    maxSize,
    message || `Batch size ${actual} exceeds max ${maxSize}`
  );
  expect(actual).to.be.at.least(1, "Batch size must be at least 1");
}

/**
 * Test results logger
 */
export class TestResultsLogger {
  private results: Array<{
    test: string;
    status: "passed" | "failed" | "skipped";
    duration: number;
    error?: string;
  }> = [];

  startTest(name: string): () => void {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      this.results.push({
        test: name,
        status: "passed",
        duration
      });
    };
  }

  recordFailure(name: string, error: string, duration: number): void {
    this.results.push({
      test: name,
      status: "failed",
      duration,
      error
    });
  }

  recordSkip(name: string): void {
    this.results.push({
      test: name,
      status: "skipped",
      duration: 0
    });
  }

  printSummary(): void {
    console.log("\n" + "=".repeat(80));
    console.log("TEST RESULTS SUMMARY");
    console.log("=".repeat(80));
    
    const passed = this.results.filter(r => r.status === "passed").length;
    const failed = this.results.filter(r => r.status === "failed").length;
    const skipped = this.results.filter(r => r.status === "skipped").length;
    const total = this.results.length;
    
    console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
    
    if (failed > 0) {
      console.log("\nFailed Tests:");
      this.results
        .filter(r => r.status === "failed")
        .forEach(r => {
          console.log(`  ❌ ${r.test}`);
          if (r.error) {
            console.log(`     ${r.error}`);
          }
        });
    }
    
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`\nTotal Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log("=".repeat(80) + "\n");
  }
}

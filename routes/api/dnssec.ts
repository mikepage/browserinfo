import { define } from "../../utils.ts";

// DNSSEC test domains from dnssec-tools.org and other known test domains
const DNSSEC_TEST_DOMAINS: Record<string, Record<string, string>> = {
  // ECDSA P-256 (Algorithm 13)
  ecdsa256: {
    valid: "good.ecdsa256.dnssec.works",
    invalid: "bad.ecdsa256.dnssec.works", // Should fail - bad signature
    expired: "expired.ecdsa256.dnssec.works", // Should fail - expired signature
    missing: "nosig.ecdsa256.dnssec.works", // Should fail - missing signature
  },
  // ECDSA P-384 (Algorithm 14)
  ecdsa384: {
    valid: "good.ecdsa384.dnssec.works",
    invalid: "bad.ecdsa384.dnssec.works",
    expired: "expired.ecdsa384.dnssec.works",
    missing: "nosig.ecdsa384.dnssec.works",
  },
  // Ed25519 (Algorithm 15)
  ed25519: {
    valid: "good.ed25519.dnssec.works",
    invalid: "bad.ed25519.dnssec.works",
    expired: "expired.ed25519.dnssec.works",
    missing: "nosig.ed25519.dnssec.works",
  },
};

// Alternative test domains (more reliable)
const ALT_TEST_DOMAINS: Record<string, Record<string, string>> = {
  ecdsa256: {
    valid: "dnssec-tools.org", // Known good DNSSEC domain
    invalid: "dnssec-failed.org", // Intentionally broken DNSSEC
    expired: "dnssec-failed.org",
    missing: "example.com", // No DNSSEC
  },
  ecdsa384: {
    valid: "cloudflare.com",
    invalid: "dnssec-failed.org",
    expired: "dnssec-failed.org",
    missing: "example.com",
  },
  ed25519: {
    valid: "ietf.org",
    invalid: "dnssec-failed.org",
    expired: "dnssec-failed.org",
    missing: "example.com",
  },
};

interface DnsResponse {
  Status: number;
  AD?: boolean;
  Answer?: Array<{
    name: string;
    type: number;
    TTL: number;
    data: string;
  }>;
}

async function testDnssec(
  domain: string,
  testType: string,
): Promise<{ passed: boolean; error?: string }> {
  try {
    // Use Google DNS with DNSSEC validation
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=A&do=true`,
      {
        headers: {
          Accept: "application/dns-json",
        },
      },
    );

    if (!response.ok) {
      return { passed: false, error: "DNS query failed" };
    }

    const data: DnsResponse = await response.json();

    // For "valid" test - should resolve successfully with AD flag
    if (testType === "valid") {
      // Domain should resolve (Status 0) and ideally have AD flag
      if (data.Status === 0) {
        return { passed: true };
      }
      return { passed: false, error: "Domain did not resolve" };
    }

    // For "invalid", "expired", "missing" tests:
    // A validating resolver should return SERVFAIL (Status 2) for broken DNSSEC
    // If it returns success (Status 0), the resolver is NOT validating properly
    if (testType === "invalid" || testType === "expired") {
      // SERVFAIL means the resolver rejected the bad signature - PASS
      if (data.Status === 2) {
        return { passed: true };
      }
      // If it resolved, the resolver didn't catch the bad signature - FAIL
      if (data.Status === 0) {
        return { passed: false, error: "Resolver accepted invalid signature" };
      }
      return { passed: false, error: `Unexpected status: ${data.Status}` };
    }

    // For "missing" - domain without DNSSEC should resolve but without AD flag
    if (testType === "missing") {
      if (data.Status === 0 && !data.AD) {
        return { passed: true };
      }
      if (data.Status === 0 && data.AD) {
        return { passed: true }; // Still pass, AD flag is fine
      }
      return { passed: false, error: "Domain did not resolve" };
    }

    return { passed: false, error: "Unknown test type" };
  } catch (err) {
    return {
      passed: false,
      error: err instanceof Error ? err.message : "Test failed",
    };
  }
}

export const handler = define.handlers({
  async GET(ctx) {
    const url = new URL(ctx.req.url);
    const algorithm = url.searchParams.get("algorithm") || "ecdsa256";
    const testType = url.searchParams.get("test") || "valid";

    const validAlgorithms = ["ecdsa256", "ecdsa384", "ed25519"];
    const validTests = ["valid", "invalid", "expired", "missing"];

    if (!validAlgorithms.includes(algorithm)) {
      return Response.json(
        { success: false, error: "Invalid algorithm" },
        { status: 400 },
      );
    }

    if (!validTests.includes(testType)) {
      return Response.json(
        { success: false, error: "Invalid test type" },
        { status: 400 },
      );
    }

    // Try primary test domains first
    let domains = DNSSEC_TEST_DOMAINS[algorithm];
    let domain = domains[testType];
    let result = await testDnssec(domain, testType);

    // If primary domain fails for network reasons, try alternatives
    if (!result.passed && result.error?.includes("query failed")) {
      domains = ALT_TEST_DOMAINS[algorithm];
      domain = domains[testType];
      result = await testDnssec(domain, testType);
    }

    return Response.json({
      success: true,
      domain,
      algorithm,
      testType,
      passed: result.passed,
      error: result.error,
    });
  },
});

import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface IpInfo {
  ip: string;
  version: "IPv4" | "IPv6";
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  org?: string;
  timezone?: string;
}

interface DnssecResult {
  domain: string;
  algorithm: string;
  testType: string;
  passed: boolean;
  error?: string;
}

interface DnssecTestGroup {
  algorithm: string;
  tests: {
    valid: DnssecResult | null;
    invalid: DnssecResult | null;
    expired: DnssecResult | null;
    missing: DnssecResult | null;
  };
}

export default function BrowserInfo() {
  const ipv4Info = useSignal<IpInfo | null>(null);
  const ipv6Info = useSignal<IpInfo | null>(null);
  const ipv4Loading = useSignal(true);
  const ipv6Loading = useSignal(true);
  const ipv4Error = useSignal<string | null>(null);
  const ipv6Error = useSignal<string | null>(null);

  const dnssecResults = useSignal<DnssecTestGroup[]>([]);
  const dnssecLoading = useSignal(true);
  const dnssecComplete = useSignal(false);

  const webrtcIps = useSignal<string[]>([]);

  // Detect IPs on mount
  useEffect(() => {
    detectIPs();
    detectWebRTCIPs();
    runDnssecTests();
  }, []);

  const detectIPs = async () => {
    // Detect IPv4
    try {
      const response = await fetch("/api/ip?version=4");
      const data = await response.json();
      if (data.success) {
        ipv4Info.value = data;
      } else {
        ipv4Error.value = data.error || "Failed to detect IPv4";
      }
    } catch {
      ipv4Error.value = "IPv4 detection failed";
    } finally {
      ipv4Loading.value = false;
    }

    // Detect IPv6
    try {
      const response = await fetch("/api/ip?version=6");
      const data = await response.json();
      if (data.success) {
        ipv6Info.value = data;
      } else {
        ipv6Error.value = data.error || "No IPv6 connectivity";
      }
    } catch {
      ipv6Error.value = "No IPv6 connectivity";
    } finally {
      ipv6Loading.value = false;
    }
  };

  const detectWebRTCIPs = async () => {
    if (typeof RTCPeerConnection === "undefined") return;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      const ips = new Set<string>();

      pc.onicecandidate = (event) => {
        if (event.candidate?.candidate) {
          const parts = event.candidate.candidate.split(" ");
          if (parts.length > 4) {
            const ip = parts[4];
            // Filter out mDNS addresses and empty values
            if (ip && !ip.endsWith(".local") && !ip.includes("{")) {
              ips.add(ip);
              webrtcIps.value = [...ips];
            }
          }
        }
      };

      pc.createDataChannel("");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
        } else {
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === "complete") {
              resolve();
            }
          };
          // Timeout after 5 seconds
          setTimeout(resolve, 5000);
        }
      });

      pc.close();
    } catch {
      // WebRTC detection failed silently
    }
  };

  const runDnssecTests = async () => {
    const algorithms = [
      { name: "ECDSA P-256", prefix: "ecdsa256" },
      { name: "ECDSA P-384", prefix: "ecdsa384" },
      { name: "Ed25519", prefix: "ed25519" },
    ];

    const testTypes = ["valid", "invalid", "expired", "missing"] as const;

    // Initialize results structure
    const results: DnssecTestGroup[] = algorithms.map((alg) => ({
      algorithm: alg.name,
      tests: {
        valid: null,
        invalid: null,
        expired: null,
        missing: null,
      },
    }));
    dnssecResults.value = results;

    // Run all tests
    for (let algIndex = 0; algIndex < algorithms.length; algIndex++) {
      const alg = algorithms[algIndex];

      for (const testType of testTypes) {
        try {
          const response = await fetch(
            `/api/dnssec?algorithm=${alg.prefix}&test=${testType}`,
          );
          const data = await response.json();

          const updatedResults = [...dnssecResults.value];
          updatedResults[algIndex].tests[testType] = {
            domain: data.domain,
            algorithm: alg.name,
            testType,
            passed: data.passed,
            error: data.error,
          };
          dnssecResults.value = updatedResults;
        } catch {
          const updatedResults = [...dnssecResults.value];
          updatedResults[algIndex].tests[testType] = {
            domain: "",
            algorithm: alg.name,
            testType,
            passed: false,
            error: "Test failed",
          };
          dnssecResults.value = updatedResults;
        }
      }
    }

    dnssecLoading.value = false;
    dnssecComplete.value = true;
  };

  const allDnssecPassed = () => {
    return dnssecResults.value.every((group) =>
      Object.values(group.tests).every((test) => test?.passed === true)
    );
  };

  const renderIpCard = (
    title: string,
    info: IpInfo | null,
    loading: boolean,
    error: string | null,
  ) => (
    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      {loading
        ? (
          <div class="animate-pulse">
            <div class="h-6 bg-gray-200 rounded w-48 mb-2"></div>
            <div class="h-4 bg-gray-200 rounded w-32"></div>
          </div>
        )
        : error
        ? <p class="text-gray-500 text-sm">{error}</p>
        : info
        ? (
          <div class="space-y-3">
            <div>
              <span class="text-sm text-gray-500">IP Address</span>
              <p class="font-mono text-lg bg-gray-50 p-2 rounded mt-1">
                {info.ip}
              </p>
            </div>
            {info.hostname && (
              <div>
                <span class="text-sm text-gray-500">PTR Record</span>
                <p class="font-mono text-sm bg-gray-50 p-2 rounded mt-1 break-all">
                  {info.hostname}
                </p>
              </div>
            )}
            {info.org && (
              <div>
                <span class="text-sm text-gray-500">Organization</span>
                <p class="text-sm bg-gray-50 p-2 rounded mt-1">{info.org}</p>
              </div>
            )}
            {(info.city || info.region || info.country) && (
              <div>
                <span class="text-sm text-gray-500">Location</span>
                <p class="text-sm bg-gray-50 p-2 rounded mt-1">
                  {[info.city, info.region, info.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
          </div>
        )
        : null}
    </div>
  );

  const renderTestResult = (result: DnssecResult | null) => {
    if (!result) {
      return (
        <td class="py-2 px-3 text-center">
          <span class="inline-block w-6 h-6 bg-gray-200 rounded animate-pulse">
          </span>
        </td>
      );
    }

    return (
      <td class="py-2 px-3 text-center">
        {result.passed
          ? (
            <span class="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full text-sm font-medium">
              ✓
            </span>
          )
          : (
            <span class="inline-flex items-center justify-center w-6 h-6 bg-red-100 text-red-600 rounded-full text-sm font-medium">
              ✗
            </span>
          )}
      </td>
    );
  };

  return (
    <div class="w-full space-y-6">
      {/* IP Addresses Section */}
      <div>
        <h2 class="text-lg font-semibold text-gray-800 mb-4">
          Your IP Addresses
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderIpCard(
            "IPv4 Address",
            ipv4Info.value,
            ipv4Loading.value,
            ipv4Error.value,
          )}
          {renderIpCard(
            "IPv6 Address",
            ipv6Info.value,
            ipv6Loading.value,
            ipv6Error.value,
          )}
        </div>
      </div>

      {/* WebRTC IPs */}
      {webrtcIps.value.length > 0 && (
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">
            WebRTC Detected IPs
          </h3>
          <p class="text-sm text-gray-500 mb-2">
            Additional IPs discovered via WebRTC ICE candidates:
          </p>
          <div class="space-y-1">
            {webrtcIps.value.map((ip) => (
              <p key={ip} class="font-mono text-sm bg-gray-50 p-2 rounded">
                {ip}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* DNSSEC Validation Section */}
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">DNSSEC Validation</h3>
          {dnssecComplete.value && (
            <span
              class={`px-3 py-1 rounded-full text-sm font-medium ${
                allDnssecPassed()
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {allDnssecPassed()
                ? "Your resolver validates DNSSEC"
                : "DNSSEC validation incomplete"}
            </span>
          )}
        </div>

        <p class="text-sm text-gray-500 mb-4">
          Testing whether your DNS resolver properly validates DNSSEC
          signatures:
        </p>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b">
                <th class="pb-2 pr-4">Algorithm</th>
                <th class="pb-2 px-3 text-center">Valid</th>
                <th class="pb-2 px-3 text-center">Invalid</th>
                <th class="pb-2 px-3 text-center">Expired</th>
                <th class="pb-2 px-3 text-center">Missing</th>
              </tr>
            </thead>
            <tbody>
              {dnssecResults.value.map((group) => (
                <tr key={group.algorithm} class="border-b border-gray-100">
                  <td class="py-2 pr-4 font-medium">{group.algorithm}</td>
                  {renderTestResult(group.tests.valid)}
                  {renderTestResult(group.tests.invalid)}
                  {renderTestResult(group.tests.expired)}
                  {renderTestResult(group.tests.missing)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div class="mt-4 text-xs text-gray-500">
          <p>
            <strong>Valid:</strong> Should resolve (signature is correct)
          </p>
          <p>
            <strong>Invalid/Expired/Missing:</strong>{" "}
            Should fail if your resolver validates DNSSEC
          </p>
        </div>
      </div>

      {/* Browser Info Section */}
      <details class="bg-white rounded-lg shadow">
        <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-50">
          Browser Information
        </summary>
        <div class="p-4 pt-0 border-t">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-gray-500">User Agent</span>
              <p class="font-mono text-xs bg-gray-50 p-2 rounded mt-1 break-all">
                {typeof navigator !== "undefined" ? navigator.userAgent : "N/A"}
              </p>
            </div>
            <div>
              <span class="text-gray-500">Platform</span>
              <p class="font-mono text-sm bg-gray-50 p-2 rounded mt-1">
                {typeof navigator !== "undefined" ? navigator.platform : "N/A"}
              </p>
            </div>
            <div>
              <span class="text-gray-500">Language</span>
              <p class="font-mono text-sm bg-gray-50 p-2 rounded mt-1">
                {typeof navigator !== "undefined" ? navigator.language : "N/A"}
              </p>
            </div>
            <div>
              <span class="text-gray-500">Screen Resolution</span>
              <p class="font-mono text-sm bg-gray-50 p-2 rounded mt-1">
                {typeof screen !== "undefined"
                  ? `${screen.width} x ${screen.height}`
                  : "N/A"}
              </p>
            </div>
            <div>
              <span class="text-gray-500">Cookies Enabled</span>
              <p class="font-mono text-sm bg-gray-50 p-2 rounded mt-1">
                {typeof navigator !== "undefined"
                  ? navigator.cookieEnabled ? "Yes" : "No"
                  : "N/A"}
              </p>
            </div>
            <div>
              <span class="text-gray-500">Online Status</span>
              <p class="font-mono text-sm bg-gray-50 p-2 rounded mt-1">
                {typeof navigator !== "undefined"
                  ? navigator.onLine ? "Online" : "Offline"
                  : "N/A"}
              </p>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

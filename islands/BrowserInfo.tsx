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

export default function BrowserInfo() {
  const ipv4Info = useSignal<IpInfo | null>(null);
  const ipv6Info = useSignal<IpInfo | null>(null);
  const ipv4Loading = useSignal(true);
  const ipv6Loading = useSignal(true);
  const ipv4Error = useSignal<string | null>(null);
  const ipv6Error = useSignal<string | null>(null);

  const webrtcIps = useSignal<string[]>([]);
  const userAgentData = useSignal<{
    browser: string;
    platform: string;
    mobile: boolean;
  } | null>(null);

  // Detect IPs on mount
  useEffect(() => {
    detectIPs();
    detectWebRTCIPs();
    detectUserAgentData();
  }, []);

  const detectUserAgentData = async () => {
    if (typeof navigator !== "undefined" && "userAgentData" in navigator) {
      try {
        const uaData = navigator.userAgentData as {
          brands: { brand: string; version: string }[];
          mobile: boolean;
          platform: string;
          getHighEntropyValues: (hints: string[]) => Promise<{
            brands: { brand: string; version: string }[];
            mobile: boolean;
            platform: string;
            platformVersion: string;
            fullVersionList: { brand: string; version: string }[];
          }>;
        };
        const highEntropy = await uaData.getHighEntropyValues([
          "fullVersionList",
          "platformVersion",
        ]);
        const mainBrand = highEntropy.fullVersionList?.find(
          (b) => !b.brand.includes("Not") && !b.brand.includes("Chromium"),
        ) || highEntropy.fullVersionList?.[0];
        userAgentData.value = {
          browser: mainBrand ? `${mainBrand.brand} ${mainBrand.version}` : "Unknown",
          platform: `${highEntropy.platform} ${highEntropy.platformVersion}`,
          mobile: highEntropy.mobile,
        };
      } catch {
        // Fall back to low entropy data
        const uaData = navigator.userAgentData as {
          brands: { brand: string; version: string }[];
          mobile: boolean;
          platform: string;
        };
        const mainBrand = uaData.brands?.find(
          (b) => !b.brand.includes("Not") && !b.brand.includes("Chromium"),
        ) || uaData.brands?.[0];
        userAgentData.value = {
          browser: mainBrand ? `${mainBrand.brand} ${mainBrand.version}` : "Unknown",
          platform: uaData.platform || "Unknown",
          mobile: uaData.mobile,
        };
      }
    }
  };

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

      {/* Browser Info Section - only shown when userAgentData is available */}
      {userAgentData.value && (
        <details class="bg-white rounded-lg shadow">
          <summary class="p-4 cursor-pointer font-medium text-gray-800 hover:bg-gray-50">
            Browser Information
          </summary>
          <div class="p-4 pt-0 border-t">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-gray-500">Browser</span>
                <p class="font-mono text-sm bg-gray-50 p-2 rounded mt-1">
                  {userAgentData.value.browser}
                </p>
              </div>
              <div>
                <span class="text-gray-500">Platform</span>
                <p class="font-mono text-sm bg-gray-50 p-2 rounded mt-1">
                  {userAgentData.value.platform}
                </p>
              </div>
              <div>
                <span class="text-gray-500">Device Type</span>
                <p class="font-mono text-sm bg-gray-50 p-2 rounded mt-1">
                  {userAgentData.value.mobile ? "Mobile" : "Desktop"}
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
      )}
    </div>
  );
}

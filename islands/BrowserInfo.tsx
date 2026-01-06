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

  const userAgentData = useSignal<{
    browser: string;
    platform: string;
    mobile: boolean;
  } | null>(null);

  // Detect IPs on mount
  useEffect(() => {
    detectIPsViaWebRTC();
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

  const isPrivateIPv4 = (ip: string): boolean => {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return false;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 100.64.0.0/10 (CGNAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    return false;
  };

  const isPrivateIPv6 = (ip: string): boolean => {
    const lower = ip.toLowerCase();
    // fe80::/10 (link-local) - fe80:: through febf::
    if (/^fe[89ab]/.test(lower)) return true;
    // fc00::/7 (unique local addresses) - fc00:: and fd00::
    if (/^f[cd]/.test(lower)) return true;
    // ::1 (loopback)
    if (lower === "::1") return true;
    return false;
  };

  const detectIPsViaWebRTC = async () => {
    if (typeof RTCPeerConnection === "undefined") {
      ipv4Error.value = "WebRTC not supported";
      ipv6Error.value = "WebRTC not supported";
      ipv4Loading.value = false;
      ipv6Loading.value = false;
      return;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      });

      const detectedIps = { ipv4: null as string | null, ipv6: null as string | null };

      pc.onicecandidate = (event) => {
        if (event.candidate?.candidate) {
          const parts = event.candidate.candidate.split(" ");
          if (parts.length > 4) {
            const ip = parts[4];
            if (ip && !ip.endsWith(".local") && !ip.includes("{")) {
              if (ip.includes(":") && !isPrivateIPv6(ip) && !detectedIps.ipv6) {
                detectedIps.ipv6 = ip;
              } else if (!ip.includes(":") && !isPrivateIPv4(ip) && !detectedIps.ipv4) {
                detectedIps.ipv4 = ip;
              }
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
          setTimeout(resolve, 5000);
        }
      });

      pc.close();

      // Fetch additional info for detected IPs
      if (detectedIps.ipv4) {
        try {
          const response = await fetch(`/api/ip?ip=${detectedIps.ipv4}`);
          const data = await response.json();
          ipv4Info.value = data.success ? data : { ip: detectedIps.ipv4, version: "IPv4" };
        } catch {
          ipv4Info.value = { ip: detectedIps.ipv4, version: "IPv4" };
        }
      } else {
        ipv4Error.value = "No IPv4 detected";
      }
      ipv4Loading.value = false;

      if (detectedIps.ipv6) {
        try {
          const response = await fetch(`/api/ip?ip=${detectedIps.ipv6}`);
          const data = await response.json();
          ipv6Info.value = data.success ? data : { ip: detectedIps.ipv6, version: "IPv6" };
        } catch {
          ipv6Info.value = { ip: detectedIps.ipv6, version: "IPv6" };
        }
      } else {
        ipv6Error.value = "No IPv6 detected";
      }
      ipv6Loading.value = false;
    } catch {
      ipv4Error.value = "Detection failed";
      ipv6Error.value = "Detection failed";
      ipv4Loading.value = false;
      ipv6Loading.value = false;
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

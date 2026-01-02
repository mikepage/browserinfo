import { define } from "../../utils.ts";

interface IpInfoResponse {
  ip: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  postal?: string;
  timezone?: string;
}

async function getIpInfo(ip: string): Promise<IpInfoResponse | null> {
  try {
    // Try ipinfo.io first
    const response = await fetch(`https://ipinfo.io/${ip}/json`);
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Fallback silently
  }

  try {
    // Fallback to ip-api.com
    const response = await fetch(`http://ip-api.com/json/${ip}`);
    if (response.ok) {
      const data = await response.json();
      if (data.status === "success") {
        return {
          ip: data.query,
          city: data.city,
          region: data.regionName,
          country: data.country,
          org: data.isp,
          timezone: data.timezone,
        };
      }
    }
  } catch {
    // Return null on failure
  }

  return null;
}

async function getPtrRecord(ip: string): Promise<string | null> {
  try {
    // Use Cloudflare DoH for PTR lookup
    const isIPv6 = ip.includes(":");
    let ptrDomain: string;

    if (isIPv6) {
      // Convert IPv6 to PTR format
      // Expand the IPv6 address and reverse it
      const expanded = expandIPv6(ip);
      const nibbles = expanded.replace(/:/g, "").split("").reverse().join(".");
      ptrDomain = `${nibbles}.ip6.arpa`;
    } else {
      // Convert IPv4 to PTR format
      const octets = ip.split(".").reverse().join(".");
      ptrDomain = `${octets}.in-addr.arpa`;
    }

    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${ptrDomain}&type=PTR`,
      {
        headers: {
          Accept: "application/dns-json",
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      if (data.Answer && data.Answer.length > 0) {
        // Remove trailing dot from PTR record
        return data.Answer[0].data.replace(/\.$/, "");
      }
    }
  } catch {
    // PTR lookup failed
  }

  return null;
}

function expandIPv6(ip: string): string {
  // Handle :: expansion
  const parts = ip.split("::");
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts[1] ? parts[1].split(":") : [];

  // Calculate how many groups are missing
  const missing = 8 - left.length - right.length;
  const middle = Array(missing).fill("0000");

  // Combine and pad each group to 4 digits
  const full = [...left, ...middle, ...right];
  return full.map((g) => g.padStart(4, "0")).join(":");
}

export const handler = define.handlers({
  async GET(ctx) {
    const url = new URL(ctx.req.url);
    const ipParam = url.searchParams.get("ip");

    // Use provided IP or detect from connection
    let finalIp: string;
    if (ipParam) {
      // Validate IP format (basic check)
      const isValidIp = /^[\d.:a-fA-F]+$/.test(ipParam);
      if (!isValidIp) {
        return Response.json(
          { success: false, error: "Invalid IP address" },
          { status: 400 },
        );
      }
      finalIp = ipParam;
    } else {
      // Get client IP - prefer headers set by proxies, fallback to connection info
      const forwardedFor = ctx.req.headers.get("x-forwarded-for");
      const realIp = ctx.req.headers.get("x-real-ip");
      const cfConnectingIp = ctx.req.headers.get("cf-connecting-ip");

      const clientIp = cfConnectingIp ||
        forwardedFor?.split(",")[0].trim() ||
        realIp ||
        ctx.info.remoteAddr.hostname;

      if (!clientIp) {
        return Response.json(
          { success: false, error: "Could not detect IP address" },
          { status: 500 },
        );
      }
      finalIp = clientIp;
    }

    // Get IP info and PTR record in parallel
    const [ipInfo, ptrRecord] = await Promise.all([
      getIpInfo(finalIp),
      getPtrRecord(finalIp),
    ]);

    return Response.json({
      success: true,
      ip: finalIp,
      version: finalIp.includes(":") ? "IPv6" : "IPv4",
      hostname: ptrRecord || ipInfo?.hostname,
      city: ipInfo?.city,
      region: ipInfo?.region,
      country: ipInfo?.country,
      org: ipInfo?.org,
      timezone: ipInfo?.timezone,
    });
  },
});

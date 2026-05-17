const BASE_URL = (Netlify.env.get("TAR") || "").replace(/\/$/, "");

const BLOCKED = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function relay(req) {
  if (!BASE_URL) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", {
      status: 500,
    });
  }

  try {
    const incoming = new URL(req.url);
    const endpoint = `${BASE_URL}${incoming.pathname}${incoming.search}`;

    const outgoingHeaders = new Headers();

    let ipAddress = null;

    for (const entry of req.headers.entries()) {
      const [headerName, headerValue] = entry;

      const normalized = headerName.toLowerCase();

      if (BLOCKED.has(normalized)) continue;

      if (
        normalized.startsWith("x-nf-") ||
        normalized.startsWith("x-netlify-")
      ) {
        continue;
      }

      switch (normalized) {
        case "x-real-ip":
          ipAddress = headerValue;
          break;

        case "x-forwarded-for":
          if (!ipAddress) {
            ipAddress = headerValue;
          }
          break;

        default:
          outgoingHeaders.append(headerName, headerValue);
      }
    }

    if (ipAddress) {
      outgoingHeaders.set("x-forwarded-for", ipAddress);
    }

    const sendBody =
      req.method !== "GET" &&
      req.method !== "HEAD";

    const init = {
      method: req.method,
      headers: outgoingHeaders,
      redirect: "manual",
    };

    if (sendBody) {
      init.body = req.body;
    }

    const result = await fetch(endpoint, init);

    const finalHeaders = new Headers();

    for (const [k, v] of result.headers.entries()) {
      if (k.toLowerCase() !== "transfer-encoding") {
        finalHeaders.append(k, v);
      }
    }

    return new Response(result.body, {
      status: result.status,
      headers: finalHeaders,
    });
  } catch (_) {
    return new Response("Bad Gateway: Relay Failed", {
      status: 502,
    });
  }
}

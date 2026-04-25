/**
 * Parse a fetch Response as JSON, falling back gracefully on non-JSON bodies.
 */
export async function parseJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || "Unknown error" };
  }
}

/**
 * Fetch a JSON endpoint and return the parsed body.
 * Throws on network errors; callers handle non-2xx via response shape.
 */
export async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  return parseJsonResponse(response);
}
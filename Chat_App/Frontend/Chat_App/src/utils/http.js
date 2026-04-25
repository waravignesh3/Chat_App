/**
 * utils/http.js
 * Shared fetch helpers used by App.jsx, login.jsx, and chat.jsx
 */

/**
 * Parses a fetch Response safely.
 * Returns parsed JSON or { error: rawText } if JSON parsing fails.
 */
export const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

/**
 * Convenience wrapper: fetch → parse JSON → throw if not ok.
 * Returns the parsed data object on success.
 */
export const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }

  return data;
};
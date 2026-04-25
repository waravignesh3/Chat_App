export const parseJsonResponse = async (response) => {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

export const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
};

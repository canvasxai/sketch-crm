async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    const body = (await res.json().catch(() => ({
      error: { code: "UNKNOWN", message: res.statusText },
    }))) as { error: { code: string; message: string } };
    throw new Error(body.error.message);
  }

  return res.json() as Promise<T>;
}

export { request };

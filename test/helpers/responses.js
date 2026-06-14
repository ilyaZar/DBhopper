export function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export function xmlResponse(value) {
  return new Response(value.trim(), {
    status: 200,
    headers: { "content-type": "application/xml" },
  });
}

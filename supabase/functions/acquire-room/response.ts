const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export function jsonResponse(request: Request, body: unknown, status = 200): Response {
  const json = JSON.stringify(body);
  const headers = new Headers({ ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding' });
  const gzip = (request.headers.get('Accept-Encoding') ?? '').split(',').some((item) => {
    const [encoding, quality] = item.trim().split(';');
    return encoding === 'gzip' && (!quality || Number(quality.trim().replace(/^q=/, '')) > 0);
  });
  if (gzip && json.length >= 1024) {
    headers.set('Content-Encoding', 'gzip');
    return new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')), { status, headers });
  }
  return new Response(json, { status, headers });
}

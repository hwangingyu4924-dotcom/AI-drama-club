import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'rehearsal-images';
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PRODUCTION_ORIGIN = 'https://hwangingyu4924-dotcom.github.io';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (Deno.env.get('ALLOW_LOCALHOST_ORIGIN') === 'true'
    && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return origin;
  return null;
}

function responseHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'content-type';
  }
  return headers;
}

function notFound(origin: string | null): Response {
  return new Response('Not found', {
    status: 404,
    headers: { ...responseHeaders(origin), 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

Deno.serve(async request => {
  const requestOrigin = request.headers.get('origin');
  const origin = allowedOrigin(requestOrigin);
  if (requestOrigin && !origin) return notFound(null);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }
  if (request.method !== 'GET') return notFound(origin);

  const url = new URL(request.url);
  const publicSlug = url.searchParams.get('production') || '';
  const rehearsalPublicId = url.searchParams.get('rehearsal') || '';
  const imagePublicId = url.searchParams.get('image') || '';
  if (!SLUG_PATTERN.test(publicSlug) || !UUID_PATTERN.test(rehearsalPublicId) || !UUID_PATTERN.test(imagePublicId)) {
    return notFound(origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[public-rehearsal-image] missing server environment');
    return notFound(origin);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: production, error: productionError } = await supabase
      .from('productions')
      .select('id')
      .eq('public_slug', publicSlug)
      .eq('public_archive', true)
      .maybeSingle();
    if (productionError || !production) return notFound(origin);

    const { data: rehearsal, error: rehearsalError } = await supabase
      .from('rehearsal_logs')
      .select('id')
      .eq('production_id', production.id)
      .eq('public_id', rehearsalPublicId)
      .maybeSingle();
    if (rehearsalError || !rehearsal) return notFound(origin);

    const { data: image, error: imageError } = await supabase
      .from('rehearsal_log_images')
      .select('storage_path,mime_type')
      .eq('production_id', production.id)
      .eq('rehearsal_log_id', rehearsal.id)
      .eq('public_id', imagePublicId)
      .maybeSingle();
    if (imageError || !image || !ALLOWED_MIME_TYPES.has(image.mime_type)) return notFound(origin);

    const { data: binary, error: storageError } = await supabase.storage.from(BUCKET).download(image.storage_path);
    if (storageError || !binary) return notFound(origin);
    if (binary.type && binary.type !== image.mime_type) return notFound(origin);

    return new Response(binary, {
      status: 200,
      headers: {
        ...responseHeaders(origin),
        'Content-Type': image.mime_type,
        'Content-Length': String(binary.size),
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (_error) {
    console.error('[public-rehearsal-image] request failed');
    return notFound(origin);
  }
});

// Deletes the calling user's account. Their rows in public.* are removed by
// ON DELETE CASCADE, and deleting the auth user also removes their sessions
// and refresh tokens, so no other device can renew access. An access token that
// was already issued stays valid until it expires (JWT expiry), but it no longer
// maps to any data. The app signs out locally after a successful call.
//
// JWT verification is enabled for this function (supabase/config.toml), so the
// platform rejects requests without a valid token before this code runs; the
// token is still checked here to identify the user.
import { createClient } from 'npm:@supabase/supabase-js@2.93.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('delete-user: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
    return json(500, { error: 'Account deletion is temporarily unavailable' })
  }

  const match = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)
  if (!match) {
    return json(401, { error: 'Missing or malformed authorization header' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(match[1])
    if (userError || !user) {
      return json(401, { error: 'Invalid or expired session' })
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      // Details stay in the function logs; the client gets a stable message.
      console.error('delete-user: deleteUser failed', { userId: user.id, status: deleteError.status, message: deleteError.message })
      return json(500, { error: 'Could not delete the account. Please try again.' })
    }

    return json(200, { success: true })
  } catch (err) {
    console.error('delete-user: unexpected error', err instanceof Error ? err.message : err)
    return json(500, { error: 'Could not delete the account. Please try again.' })
  }
})

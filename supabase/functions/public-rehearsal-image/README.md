# Public rehearsal image function

This function is the only anonymous binary-read boundary for the private
`rehearsal-images` bucket. It accepts only a public production slug, rehearsal
public ID, and image public ID. It resolves the private Storage path only after
checking the complete production/rehearsal/image relationship and
`productions.public_archive = true`.

Deployment is intentionally not part of Phase 2D. When approved, link the
correct Supabase project and deploy this public endpoint with JWT verification
disabled because an anonymous `<img>` request cannot attach an Authorization
header:

```sh
supabase functions deploy public-rehearsal-image --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must come from the Edge Function
runtime environment. Never copy the service-role value into this repository or
the browser configuration.

Production CORS allows only `https://hwangingyu4924-dotcom.github.io`. For a
temporary local preview, set the function secret `ALLOW_LOCALHOST_ORIGIN=true`;
leave it unset in production.

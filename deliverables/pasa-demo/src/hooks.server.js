// Allow the portfolio's public GitHub Pages origin to embed the demo route.
const PORTFOLIO_ORIGINS = "'self' https://cjtb-art.github.io"

export async function handle({ event, resolve }) {
  const response = await resolve(event)
  const headers = new Headers(response.headers)
  const demoRoute = event.url.pathname.replace(/\/+$/, '') === '/demo'
  const existingPolicy = headers.get('Content-Security-Policy') ?? ''
  const policyDirectives = existingPolicy
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive && !/^frame-ancestors(?:\s|$)/i.test(directive))
    .filter((directive) => !demoRoute || !/^connect-src(?:\s|$)/i.test(directive))
  if (demoRoute) policyDirectives.push("connect-src 'none'")
  policyDirectives.push(
    `frame-ancestors ${demoRoute ? PORTFOLIO_ORIGINS : "'self'"}`,
  )

  headers.set('Content-Security-Policy', policyDirectives.join('; '))
  if (demoRoute) headers.delete('X-Frame-Options')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

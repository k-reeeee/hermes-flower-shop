// REST wrapper + React Query hooks. ctx is only valid inside register(), so it is stashed
// at module scope. Every query key starts with ['flower-shop'] so one invalidate refreshes all.
import { useMutation, useQuery, useQueryClient, queryClient } from '@hermes/plugin-sdk'

export const KEY = 'flower-shop'
let _ctx = null

export function setCtx(ctx) {
  _ctx = ctx
}
export function getCtx() {
  return _ctx
}

export class ApiError extends Error {
  constructor(code, message, extra, status) {
    super(message || code || 'Request failed')
    this.name = 'ApiError'
    this.code = code || 'error'
    this.extra = extra || {}
    this.status = status || 0
  }
}

function tryJson(text) {
  if (typeof text !== 'string') return null
  const i = text.indexOf('{')
  if (i < 0) return null
  try {
    return JSON.parse(text.slice(i))
  } catch (e) {
    return null
  }
}

// hermesApi errors vary by transport; accept {detail:{error,message}}, {error,message} or plain text.
export function normaliseError(err) {
  if (err instanceof ApiError) return err
  const e = err || {}
  let body = e.detail !== undefined ? { detail: e.detail } : e.body || e.data || e.response || null
  if (typeof body === 'string') body = tryJson(body)
  if (!body) body = tryJson(e.message)
  let detail = body && (body.detail !== undefined ? body.detail : body)
  const status = e.status || e.statusCode || (body && body.status) || (String(e.message || '').match(/\b(4\d\d|5\d\d)\b/) || [])[1] || 0
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const code = detail.error || detail.code || 'error'
    const { error, message, ...extra } = detail
    return new ApiError(code, message || humanCode(code), extra, Number(status))
  }
  if (Array.isArray(detail)) {
    return new ApiError('validation_error', detail.map(d => d.msg || String(d)).join('; '), {}, Number(status) || 422)
  }
  if (typeof detail === 'string' && detail) return new ApiError('error', detail, {}, Number(status))
  const msg = String(e.message || e || 'Request failed')
  if (/unavailable|ECONN|Failed to fetch|NetworkError|fetch failed|404|not found/i.test(msg) && !/\b409\b/.test(msg)) {
    return new ApiError('unreachable', 'The Flower Shop service is not reachable right now. Check that the plugin is enabled and the gateway is running.', {}, Number(status))
  }
  return new ApiError('error', msg, {}, Number(status))
}

function humanCode(code) {
  const map = {
    not_found: 'That record was not found.',
    validation_error: 'Some details are missing or invalid.',
    invalid_transition: 'That status change is not allowed right now.',
    insufficient_stock: 'Not enough stock to confirm this order.',
    approval_not_pending: 'This approval was already decided.',
    conflict: 'Someone else changed this already. Refresh and try again.'
  }
  return map[code] || 'Something went wrong.'
}

export async function rest(path, opts) {
  if (!_ctx) throw new ApiError('not_ready', 'Flower Shop is still starting. Try again in a moment.')
  try {
    return await _ctx.rest(path, opts)
  } catch (e) {
    throw normaliseError(e)
  }
}

export function qs(params) {
  const parts = []
  Object.keys(params || {}).forEach(k => {
    const v = params[k]
    if (v === undefined || v === null || v === '' || v === false) return
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v === true ? 'true' : v))
  })
  return parts.length ? '?' + parts.join('&') : ''
}

// Generic GET hook. keyParts extend ['flower-shop']; interval 15s by default.
export function useApi(keyParts, path, opts) {
  const o = opts || {}
  return useQuery({
    queryKey: [KEY, ...keyParts],
    queryFn: () => rest(path),
    refetchInterval: o.interval === undefined ? 15000 : o.interval,
    enabled: o.enabled !== false,
    staleTime: 2000,
    retry: 1,
    placeholderData: prev => prev
  })
}

export const useProfile = () => useApi(['profile'], '/profile', { interval: 60000 })
export const useOverview = () => useApi(['overview'], '/overview')
export const useApprovals = status => useApi(['approvals', status], '/approvals' + qs({ status }))
export const useOrder = (id, enabled = true) => useApi(['order', String(id)], '/orders/' + encodeURIComponent(id), { enabled: enabled && id !== null && id !== undefined })

// Write hook: POST/PUT/PATCH then refresh everything.
export function useAct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ path, method, body }) => rest(path, { method: method || 'POST', body: body === undefined ? {} : body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] })
  })
}

export function invalidateAll() {
  return queryClient.invalidateQueries({ queryKey: [KEY] })
}

// Display helpers that need the shop profile.
export function useShop() {
  const q = useProfile()
  const p = (q.data || {})
  return { profile: p, currency: p.currency || 'IDR', tz: p.timezone || 'Asia/Jakarta', ready: !!q.data }
}

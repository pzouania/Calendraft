import type { User } from '@supabase/supabase-js'

export function getAvatarUrl(user: User): string | undefined {
  const meta = user.user_metadata ?? {}
  return (
    (meta.custom_avatar_url as string | undefined) ??
    (meta.avatar_url as string | undefined) ??
    (meta.picture as string | undefined)
  )
}

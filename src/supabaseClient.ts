import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zxqzxlbhuepuflpatbuh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_SsYSfMyO6kymvpAIUcHPyQ_MvPYTzUP'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
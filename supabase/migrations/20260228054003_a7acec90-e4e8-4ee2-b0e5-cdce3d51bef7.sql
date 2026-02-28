
-- Add missing columns to reviews table
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- Add missing columns to complaints table
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS suggested_action TEXT;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS draft_response TEXT;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

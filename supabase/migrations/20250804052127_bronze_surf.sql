/*
  # Create E-Book Library System

  1. New Tables
    - `ebooks`
      - `id` (uuid, primary key)
      - `title` (text, not null)
      - `description` (text)
      - `category` (text, not null)
      - `file_path` (text, not null) - path in Supabase storage
      - `file_size` (bigint)
      - `thumbnail_url` (text)
      - `author` (text)
      - `published_date` (date)
      - `upload_date` (timestamp)
      - `uploaded_by` (uuid, references auth.users)
      - `download_count` (integer, default 0)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `ebook_categories`
      - `id` (uuid, primary key)
      - `name` (text, unique, not null)
      - `description` (text)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to read ebooks
    - Add policies for admin users to manage ebooks
    - Add policies for public to view categories

  3. Storage
    - Create ebooks bucket if not exists
    - Set up proper storage policies
*/

-- Create ebook_categories table
CREATE TABLE IF NOT EXISTS public.ebook_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ebooks table
CREATE TABLE IF NOT EXISTS public.ebooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL REFERENCES public.ebook_categories(name),
  file_path TEXT NOT NULL,
  file_size BIGINT,
  thumbnail_url TEXT,
  author TEXT,
  published_date DATE,
  upload_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id),
  download_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ebook_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebooks ENABLE ROW LEVEL SECURITY;

-- Create policies for ebook_categories
CREATE POLICY "Anyone can view active categories" ON public.ebook_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage categories" ON public.ebook_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create policies for ebooks
CREATE POLICY "Authenticated users can view active ebooks" ON public.ebooks
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "Admins can manage all ebooks" ON public.ebooks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create function to increment download count
CREATE OR REPLACE FUNCTION public.increment_ebook_downloads(ebook_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.ebooks 
  SET download_count = download_count + 1,
      updated_at = now()
  WHERE id = ebook_id;
END;
$$;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_ebooks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ebooks_updated_at
  BEFORE UPDATE ON public.ebooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ebooks_updated_at();

-- Insert default categories
INSERT INTO public.ebook_categories (name, description) VALUES
('Business', 'Business and entrepreneurship books'),
('Technology', 'Technology and programming books'),
('Self-Help', 'Personal development and self-improvement'),
('Education', 'Educational and academic resources'),
('Health', 'Health and wellness guides'),
('Finance', 'Financial literacy and investment'),
('Marketing', 'Marketing and sales strategies'),
('Leadership', 'Leadership and management'),
('Other', 'Miscellaneous books and resources')
ON CONFLICT (name) DO NOTHING;

-- Create ebooks storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ebooks',
  'ebooks',
  false, -- Private bucket, requires authentication
  52428800, -- 50MB limit per file
  ARRAY['application/pdf']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create storage policies for ebooks bucket
CREATE POLICY "Authenticated users can view ebooks" ON storage.objects
  FOR SELECT USING (bucket_id = 'ebooks' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can upload ebooks" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ebooks' AND 
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update ebooks" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'ebooks' AND 
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete ebooks" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'ebooks' AND 
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
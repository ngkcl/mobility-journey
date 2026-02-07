-- Add exercise reference videos + link form-check videos to exercises

alter table public.exercises
  add column if not exists reference_video_urls text[];

alter table public.videos
  add column if not exists exercise_id uuid references public.exercises(id) on delete set null;

create index if not exists idx_videos_exercise_id on public.videos (exercise_id);

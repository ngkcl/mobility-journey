-- Add indexes for common ordering/filtering patterns used by the app
create index if not exists photos_view_taken_at_idx
  on public.photos (view, taken_at desc);

create index if not exists todos_created_at_idx
  on public.todos (created_at desc);

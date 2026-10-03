-- 0009: repair worker-delivered video rows whose owner was never recorded.
--
-- The /api/public/hooks/video-jobs bridge inserted video_clips and
-- video_assets rows without user_id. Under the service role auth.uid() is
-- NULL, so those inserts either failed outright (NOT NULL) or produced rows
-- the owner's RLS policy (user_id = auth.uid()) could never return — which is
-- why delivered videos never appeared in the Videos history page. The code now
-- always passes the project owner's user_id; this backfills any survivors.

update public.video_clips
set user_id = (select p.user_id from public.projects p where p.id = video_clips.project_id)
where user_id is null and project_id is not null;

update public.video_assets
set user_id = (select p.user_id from public.projects p where p.id = video_assets.project_id)
where user_id is null and project_id is not null;

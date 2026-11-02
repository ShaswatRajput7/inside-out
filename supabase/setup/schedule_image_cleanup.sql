-- OPTIONAL MANUAL SETUP, after deploying cleanup-images. Do not commit real secrets.
-- Enable pg_cron and pg_net in Dashboard > Database > Extensions first.
-- Store BOTH values once via the Vault dashboard, with these exact names:
-- inside_out_project_url = https://YOUR_PROJECT.supabase.co
-- inside_out_image_cleanup_secret = same random value as the Edge IMAGE_CLEANUP_SECRET
-- Daily at 03:17 UTC. Re-running replaces only this app's named job.
do $$ declare job bigint; begin
  for job in select jobid from cron.job where jobname='inside-out-image-cleanup' loop
    perform cron.unschedule(job);
  end loop;
end $$;
select cron.schedule('inside-out-image-cleanup','17 3 * * *', $job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='inside_out_project_url') || '/functions/v1/cleanup-images',
   headers := jsonb_build_object('Content-Type','application/json','x-cleanup-secret',
     (select decrypted_secret from vault.decrypted_secrets where name='inside_out_image_cleanup_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 60000
 );
$job$);

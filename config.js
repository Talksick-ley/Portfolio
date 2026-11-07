/* ============================================================
   CONFIG.JS: public Supabase settings
   Only the project URL and the PUBLISHABLE (anon) key belong here.
   The publishable key is designed to be public. Your data is
   protected by the Row Level Security policies in supabase-setup.sql.

   NEVER put the service_role key, a database password, or any
   other secret in this file or anywhere else in the website.
   ============================================================ */
window.PORTFOLIO_CONFIG = {
  SUPABASE_URL: 'https://eaxfwvyxyhtiwbpxtfsh.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVheGZ3dnl4eWh0aXdicHh0ZnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MzIzODUsImV4cCI6MjEwOTMwODM4NX0.BbvycJhCL1_KQT4RyUnN-KOxgwyy1WmxcCPZe90lBi8',
  MEDIA_BUCKET: 'portfolio-media'
};

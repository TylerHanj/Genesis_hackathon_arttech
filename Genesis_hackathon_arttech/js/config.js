/* Публичная конфигурация клиента.
   Здесь только publishable-ключ: он предназначен для браузера, доступ к данным ограничивает RLS
   (supabase/migrations/0001_days_rls.sql). Секретный ключ (sb_secret_… / service_role) сюда класть НЕЛЬЗЯ. */
export const CONFIG = Object.freeze({
  SUPABASE_URL: 'https://kzzndodwngahyzguxxjc.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_vWSUoSBryvHQr4E1csncLQ_qy2DS9QI',
});

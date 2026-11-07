import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Phone } from "lucide-react";
import { LegalLinks } from "./Legal";
import { referralsAPI } from "../lib/api";
import { LightPage } from "../components/common/LightPage";
import { LangProvider, LangToggle } from "../i18n";
import { useLang } from "../i18n/lang";
import { REFERRAL } from "../i18n/portal";
import { refusalText } from "../i18n/share";

type Info = Awaited<ReturnType<typeof referralsAPI.get>>;

const card =
  "bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]";
const field =
  "w-full rounded-xl border border-gray-200 bg-[#F5F6F8] px-3.5 py-3 text-[15px] text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white";

/**
 * The page a friend opens from a past client's referral link: who sent them,
 * and a short form. What they send lands in the company's Leads, marked who
 * referred them.
 */
function ReferralContent() {
  const { code = "" } = useParams();
  const { lang } = useLang();
  const t = REFERRAL[lang];
  const [info, setInfo] = useState<Info | undefined>(undefined);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    referralsAPI
      .get(code)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [code]);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  const ready = form.name.trim() && (form.phone.trim() || form.email.trim());

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await referralsAPI.submit(code, {
        name: form.name,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        note: form.note.trim() || undefined,
        language: lang,
      });
      setDone(true);
    } catch (err) {
      setError(refusalText(err, lang, t.failed));
    } finally {
      setBusy(false);
    }
  };

  if (info === undefined)
    return (
      <LightPage className="bg-[#F5F6F8] flex items-center justify-center text-gray-500">
        {t.loading}
      </LightPage>
    );
  if (info === null)
    return (
      <LightPage className="bg-[#F5F6F8] flex flex-col items-center justify-center gap-6 px-6 text-center text-gray-700">
        <p>{t.invalid}</p>
        <LangToggle className="text-xs text-gray-400" />
      </LightPage>
    );

  const company = info.company;
  return (
    <LightPage className="bg-[#F5F6F8] text-gray-900">
      <div className="mx-auto max-w-md px-4 pb-8 pt-10 sm:pt-16">
        <div className="flex items-center gap-2.5">
          {company.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={company.name}
              className="h-9 max-w-[160px] object-contain"
            />
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-sm font-semibold text-white"
              aria-hidden
            >
              {company.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span className="text-sm font-medium text-gray-500">
            {company.name}
          </span>
        </div>

        {done ? (
          <div
            className={`${card} mt-8 p-6 text-center`}
            data-testid="referral-done"
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              {t.doneTitle}
            </h1>
            <p className="mt-1 text-[15px] text-gray-500">
              {t.doneBody(company.name)}
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-[28px] font-bold leading-tight tracking-tight">
              {t.heading(info.referrer, company.name)}
            </h1>
            <p className="mt-2 text-[17px] text-gray-500">{t.body}</p>
            <form
              onSubmit={send}
              className={`${card} mt-6 space-y-3 p-5`}
              data-testid="referral-form"
            >
              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">
                  {t.name}
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  maxLength={120}
                  onChange={set("name")}
                  className={field}
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-gray-700">
                    {t.phone}
                  </span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    maxLength={40}
                    onChange={set("phone")}
                    className={field}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-gray-700">
                    {t.email}
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    maxLength={200}
                    onChange={set("email")}
                    className={field}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">{t.orEmail}</p>
              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">
                  {t.address}
                </span>
                <input
                  type="text"
                  autoComplete="street-address"
                  value={form.address}
                  maxLength={300}
                  onChange={set("address")}
                  className={field}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">
                  {t.note}
                </span>
                <textarea
                  value={form.note}
                  rows={3}
                  maxLength={1000}
                  onChange={set("note")}
                  placeholder={t.notePlaceholder}
                  className={field}
                />
              </label>
              <button
                type="submit"
                disabled={busy || !ready}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? t.sending : t.send}
              </button>
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </form>
          </>
        )}

        {company.phone && (
          <a
            href={`tel:${company.phone}`}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-medium text-gray-600 hover:text-gray-900"
          >
            <Phone className="h-4 w-4" /> {t.call(company.name)}
          </a>
        )}

        <footer className="mt-8 flex flex-col items-center gap-3 pb-4">
          <LangToggle className="text-xs text-gray-400" />
          <LegalLinks className="text-xs text-gray-400" />
        </footer>
      </div>
    </LightPage>
  );
}

export function ReferralPage() {
  return (
    <LangProvider>
      <ReferralContent />
    </LangProvider>
  );
}

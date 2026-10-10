/** ISO time to the value a datetime-local input wants, in local time. */
export const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
export const formatAppointment = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** The local calendar date of an appointment, for the follow-up date. */
export const appointmentDay = (value: string) => value.slice(0, 10);

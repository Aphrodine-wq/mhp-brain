import { liveData } from "@/lib/queries";
import LiveBoard from "./LiveBoard";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const data = await liveData();

  return (
    <section className="view">
      <h2>Live</h2>
      <div className="sub">
        A forward look on active jobs — where each one&apos;s priced against your own history and what needs
        attention. The thing no off-the-shelf tool has: your estimate brain watching your live jobs.
      </div>

      <div className="banner">
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#0b3d91" strokeWidth={2}>
          <path d="M12 8v4l3 2" /><circle cx={12} cy={12} r={9} />
        </svg>
        <span>
          <b>Live margin forecast</b> — predicting each job&apos;s final margin before it&apos;s done — activates
          when actual-cost / invoice data connects. Today Live runs on bid pricing + activity.
        </span>
      </div>

      <LiveBoard data={data} />
    </section>
  );
}

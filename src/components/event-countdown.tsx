"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

const EVENT_DATE = new Date("2027-01-23T00:00:00+08:00").getTime();

type CountdownValues = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  started: boolean;
};

function getCountdownValues(): CountdownValues {
  const remaining = EVENT_DATE - Date.now();

  if (remaining <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, started: true };
  }

  return {
    days: Math.floor(remaining / 86_400_000),
    hours: Math.floor((remaining % 86_400_000) / 3_600_000),
    minutes: Math.floor((remaining % 3_600_000) / 60_000),
    seconds: Math.floor((remaining % 60_000) / 1_000),
    started: false
  };
}

export function EventCountdown() {
  const [countdown, setCountdown] = useState<CountdownValues | null>(null);

  useEffect(() => {
    const updateCountdown = () => setCountdown(getCountdownValues());
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1_000);

    return () => window.clearInterval(interval);
  }, []);

  const units = [
    ["Days", countdown?.days],
    ["Hours", countdown?.hours],
    ["Minutes", countdown?.minutes],
    ["Seconds", countdown?.seconds]
  ] as const;

  return (
    <section aria-label="Event countdown" className="max-w-7xl mx-auto px-6 -mt-8 relative z-10">
      <div className="panel p-7 md:p-10 grid md:grid-cols-[1fr_auto] items-center gap-8">
        <div>
          <p className="eyebrow">The countdown is on</p>
          <h2 className="display text-3xl md:text-4xl mt-3">See you in <span className="gold-text italic">Beijing.</span></h2>
          <p className="flex items-center gap-2 text-white/55 text-sm mt-4">
            <MapPin size={16} className="text-[#c9a56a]" aria-hidden="true" />
            Beijing · 23 January 2027
          </p>
        </div>
        {countdown?.started ? (
          <p className="display text-2xl md:text-3xl gold-text">The event is here.</p>
        ) : (
          <div className="grid grid-cols-4 gap-3 md:gap-5" aria-label="Time remaining">
            {units.map(([label, value]) => (
              <div key={label} className="text-center min-w-[54px]">
                <span className="display gold-text text-3xl md:text-4xl tabular-nums">
                  {value === undefined ? "--" : String(value).padStart(2, "0")}
                </span>
                <span className="block text-[9px] uppercase tracking-[.15em] text-white/40 mt-2">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

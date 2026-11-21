import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { body, display, ZONES } from "../theme";
import type { Brand, Message, Ratio } from "../types";

/** How long the three dots show before one of the brand's answers. */
const TYPING_SEC = 1.1;

/**
 * No photos and no voice. A homeowner asks what homeowners ask, and the
 * brand answers, as messages arriving one after another. The brand's answers
 * are preceded by three dots, the way a reply being typed looks.
 */
export const Chat: React.FC<{ messages: Message[]; brand: Brand; ratio: Ratio }> = ({ messages, brand, ratio }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tall = ratio === "9x16";
  const top = ZONES[ratio].chip;
  const size = tall ? 52 : 42;
  const markets = brand.markets.slice(0, 2).filter(Boolean).join(" and ");
  const typing = messages.find((m) => m.from === "us" && t >= m.at - TYPING_SEC && t < m.at);
  return (
    <>
      <div style={{ position: "absolute", left: 60, right: 60, top, display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: tall ? 104 : 88,
            height: tall ? 104 : 88,
            borderRadius: 60,
            backgroundColor: brand.primaryColor,
            border: "4px solid rgba(255,255,255,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: display,
            fontWeight: 800,
            fontSize: tall ? 52 : 44,
            color: "#fff",
          }}
        >
          {brand.name.slice(0, 1)}
        </div>
        <div>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: tall ? 50 : 44, color: "#fff" }}>{brand.name}</div>
          <div style={{ fontFamily: body, fontWeight: 500, fontSize: tall ? 32 : 28, color: "rgba(255,255,255,0.7)" }}>Painting quotes{markets ? ` · ${markets}` : ""}</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 60, right: 60, top: top + (tall ? 104 : 88) + 26, height: 2, backgroundColor: "rgba(255,255,255,0.16)" }} />
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: top + (tall ? 190 : 150),
          display: "flex",
          flexDirection: "column",
          gap: tall ? 30 : 18,
        }}
      >
        {messages.map((m, i) => {
          const at = frame - Math.round(m.at * fps);
          if (at < 0) return null;
          const ours = m.from === "us";
          const land = spring({ frame: at, fps, config: { damping: 13, mass: 0.55 } });
          return (
            <div
              key={i}
              style={{
                alignSelf: ours ? "flex-end" : "flex-start",
                maxWidth: tall ? 860 : 800,
                padding: tall ? "28px 40px" : "20px 30px",
                borderRadius: 44,
                borderBottomRightRadius: ours ? 10 : 44,
                borderBottomLeftRadius: ours ? 44 : 10,
                backgroundColor: ours ? brand.primaryColor : "#eef1f5",
                color: ours ? "#fff" : "#0b121c",
                fontFamily: body,
                fontWeight: 600,
                fontSize: size,
                lineHeight: 1.22,
                boxShadow: "0 14px 34px rgba(0,0,0,0.28)",
                opacity: interpolate(land, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
                transform: `scale(${interpolate(land, [0, 1], [0.6, 1])})`,
                transformOrigin: ours ? "100% 100%" : "0% 100%",
              }}
            >
              {m.text}
            </div>
          );
        })}
        {typing ? (
          <div
            style={{
              alignSelf: "flex-end",
              display: "flex",
              gap: 12,
              padding: tall ? "30px 36px" : "24px 30px",
              borderRadius: 44,
              borderBottomRightRadius: 10,
              backgroundColor: brand.primaryColor,
            }}
          >
            {[0, 1, 2].map((d) => (
              <div
                key={d}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "#fff",
                  opacity: 0.55 + 0.45 * Math.sin(frame / 3.2 - d * 1.1),
                  transform: `translateY(${Math.sin(frame / 3.2 - d * 1.1) * -7}px)`,
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
};

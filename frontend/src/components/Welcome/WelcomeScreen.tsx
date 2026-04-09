import { Button } from "../common/Button";
import { useAuthStore } from "../../store/authStore";

interface Props {
  onPlay: () => void;
  onReplay: () => void;
  onPractice: () => void;
  onHistory?: () => void;
  onAuth?: () => void;
}

interface ModeRow {
  num: string;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
  italic?: boolean;
}

export function WelcomeScreen({ onPlay, onReplay, onPractice, onHistory, onAuth }: Props) {
  const user = useAuthStore((s) => s.user);

  const modes: ModeRow[] = [
    {
      num: "01",
      title: "Play",
      body: "Set an opponent rating, search a real Lichess or Chess.com player, or fine-tune the style sliders. The model responds with moves that match their skill level and blind spots.",
      cta: "Start a game",
      onClick: onPlay,
    },
    {
      num: "02",
      title: "Replay",
      body: "Step through a famous game move-by-move. Fork at any point and let the model play either side from there.",
      cta: "Open replay",
      onClick: onReplay,
      italic: true,
    },
    {
      num: "03",
      title: "Practice",
      body: "Drill specific opening lines against opponents at any rating level. Thirty-plus major systems across all categories.",
      cta: "Pick an opening",
      onClick: onPractice,
    },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] ed-shell pt-block pb-section animate-fade-in">
      {/* HERO */}
      <section className="grid grid-cols-12 gap-8 pt-block pb-block border-b border-edge">
        <div className="col-span-12 lg:col-span-8">
          <div className="eyebrow mb-4">A human-aware chess engine</div>
          <h1 className="font-serif text-display text-paper">
            Play the<br />
            <span className="italic text-walnut-300">player,</span> not<br />
            the engine.
          </h1>
          <p className="mt-block max-w-xl text-walnut-300 text-[17px] leading-relaxed">
            Move Predictor trains on the games of a single human and learns to
            think the way they do — same blunders, same blind spots, same
            instincts. It is a study tool, not a tactics engine.
          </p>

          <div className="mt-block flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onPlay}>
              Start a game
            </Button>
            {!user && (
              <Button size="lg" variant="outline" onClick={onAuth}>
                Create account
              </Button>
            )}
            {user && onHistory && (
              <Button size="lg" variant="outline" onClick={onHistory}>
                My games →
              </Button>
            )}
          </div>
        </div>

        {/* Featured stat panel */}
        <aside className="col-span-12 lg:col-span-4">
          <div className="border border-edge rounded-xl bg-gradient-to-b from-paper/[0.04] to-transparent p-7 h-full flex flex-col">
            <div className="eyebrow mb-3">Today</div>
            <div className="font-serif text-[44px] leading-none text-paper editorial-num">
              1858
            </div>
            <div className="text-[13px] text-walnut-300 mt-2">
              moves in the model vocabulary
            </div>
            <div className="border-t border-edge my-6" />
            <div className="grid grid-cols-2 gap-4 text-[12px]">
              <Stat label="Encoder" value="ResNet-15" />
              <Stat label="Sequence" value="Transformer-4L" />
              <Stat label="Sources" value="Lichess · CC" />
              <Stat label="Players" value="∞" />
            </div>
            <div className="mt-auto pt-7">
              <div className="eyebrow mb-2">Open source</div>
              <a
                href="https://github.com/swarit-1/move-predictor"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-paper hover:text-gold transition-colors"
              >
                github.com/swarit-1/move-predictor →
              </a>
            </div>
          </div>
        </aside>
      </section>

      {/* MODES — editorial list */}
      <section className="py-block">
        <div className="eyebrow mb-block">What you can do</div>

        <div className="divide-y divide-edge border-y border-edge">
          {modes.map((m) => (
            <article key={m.num} className="grid grid-cols-12 gap-6 py-block group">
              <div className="col-span-2 lg:col-span-1">
                <div className="font-serif editorial-num text-[40px] lg:text-[56px] text-walnut-400 leading-none">
                  {m.num}
                </div>
              </div>
              <div className="col-span-10 lg:col-span-7">
                <h3
                  className={`font-serif text-h1 text-paper leading-tight ${
                    m.italic ? "italic" : ""
                  }`}
                >
                  {m.title}
                </h3>
                <p className="mt-4 text-walnut-300 text-[16px] max-w-xl leading-relaxed">
                  {m.body}
                </p>
              </div>
              <div className="col-span-12 lg:col-span-4 flex lg:items-end lg:justify-end">
                <Button variant="outline" onClick={m.onClick}>
                  {m.cta} →
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS — bento */}
      <section className="py-block border-t border-edge">
        <div className="eyebrow mb-3">Method</div>
        <h2 className="font-serif text-h1 text-paper max-w-2xl mb-block">
          How a single human becomes a model.
        </h2>

        <div className="grid grid-cols-12 gap-5">
          <Step
            num="i"
            title="Fetch real games"
            body="Up to thousands of rated games pulled directly from Lichess or Chess.com, filtered by time control."
            span="col-span-12 md:col-span-6 lg:col-span-4"
          />
          <Step
            num="ii"
            title="Extract style"
            body="Aggression, risk, opening repertoire, blunder rate, blind spots — distilled into a 25-dimensional player vector."
            span="col-span-12 md:col-span-6 lg:col-span-4"
          />
          <Step
            num="iii"
            title="Imitate at the board"
            body="Conditioned on rating + style, the model samples moves humans like that one would actually play, mistakes included."
            span="col-span-12 lg:col-span-4"
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-walnut-400 text-[10px] tracking-eyebrow uppercase">{label}</div>
      <div className="text-paper font-mono text-[12px] mt-1">{value}</div>
    </div>
  );
}

function Step({
  num,
  title,
  body,
  span,
}: {
  num: string;
  title: string;
  body: string;
  span: string;
}) {
  return (
    <div className={`${span} border border-edge rounded-xl p-7 hover:border-edgeStrong transition-colors`}>
      <div className="flex items-baseline gap-4 mb-3">
        <span className="font-serif italic text-walnut-300 text-[18px]">{num}.</span>
        <h3 className="font-serif text-[22px] text-paper">{title}</h3>
      </div>
      <p className="text-walnut-300 text-[14px] leading-relaxed">{body}</p>
    </div>
  );
}

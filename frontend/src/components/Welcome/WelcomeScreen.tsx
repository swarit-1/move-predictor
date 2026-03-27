interface Props {
  onPlay: () => void;
  onReplay: () => void;
  onPractice: () => void;
}

export function WelcomeScreen({ onPlay, onReplay, onPractice }: Props) {
  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-6">
      <div className="w-full max-w-xl animate-fade-in">
        {/* Logo + Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gold mb-5">
            <svg className="w-6 h-6 text-surface-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 2L15 8H9L12 2Z" />
              <path d="M8 8h8v3H8z" />
              <path d="M7 11h10l1 9H6l1-9z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gradient mb-3">
            Move Predictor
          </h1>
          <p className="text-zinc-500 font-light text-sm max-w-sm mx-auto leading-relaxed">
            Play against an AI that mimics how real humans think, not how engines calculate.
          </p>
        </div>

        {/* Mode cards */}
        <div className="space-y-3 mb-10">
          <button
            onClick={onPlay}
            className="w-full glass-card glass-card-hover p-5 text-left group"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-gold-dim flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">
                  Play a Game
                </h3>
                <p className="text-xs text-zinc-500 mt-1 font-light leading-relaxed">
                  Set an opponent rating, search for a real Lichess player, or fine-tune style sliders.
                  The AI responds with moves that match their skill level and blind spots.
                </p>
              </div>
              <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          <button
            onClick={onReplay}
            className="w-full glass-card glass-card-hover p-5 text-left group"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-human/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-human" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">
                  Replay a Famous Game
                </h3>
                <p className="text-xs text-zinc-500 mt-1 font-light leading-relaxed">
                  Step through iconic games move by move. Fork at any point and explore
                  "what if" scenarios where the AI plays as either side.
                </p>
              </div>
              <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          <button
            onClick={onPractice}
            className="w-full glass-card glass-card-hover p-5 text-left group"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">
                  Practice Openings
                </h3>
                <p className="text-xs text-zinc-500 mt-1 font-light leading-relaxed">
                  Drill specific opening lines against opponents at any rating level.
                  Choose from 30+ major systems across all categories.
                </p>
              </div>
              <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
        </div>

        {/* How it works */}
        <div className="glass-card p-5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-medium mb-3">
            How it works
          </p>
          <div className="flex gap-4">
            {[
              { step: "1", label: "Fetch real games", desc: "From Lichess or Chess.com" },
              { step: "2", label: "Analyze play style", desc: "Blind spots, openings, habits" },
              { step: "3", label: "AI mimics decisions", desc: "Human-like, not engine-like" },
            ].map((item) => (
              <div key={item.step} className="flex-1 text-center">
                <div className="w-6 h-6 rounded-full bg-gold-dim text-gold text-[10px] font-bold flex items-center justify-center mx-auto mb-2">
                  {item.step}
                </div>
                <p className="text-[11px] text-zinc-300 font-medium">{item.label}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5 font-light">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-zinc-700 mt-6">
          <a href="https://github.com/swarit-1/move-predictor" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-500 transition-colors">
            View on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}

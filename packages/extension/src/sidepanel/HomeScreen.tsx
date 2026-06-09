import type { Mode } from '../store/use-app-store';

interface Props {
  onSelectMode: (mode: Mode) => void;
}

interface ModeCard {
  mode: Mode;
  title: string;
  description: string;
}

const CARDS: ModeCard[] = [
  {
    mode: 'author',
    title: 'Author a walkthrough',
    description: 'Record steps on the current tab and save a guided walkthrough.',
  },
  {
    mode: 'preview',
    title: 'Preview walkthroughs',
    description: 'Open a saved walkthrough and step through it on the page.',
  },
];

/** Mode picker shown after sign-in. */
export function HomeScreen({ onSelectMode }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {CARDS.map((card) => (
        <button
          key={card.mode}
          type="button"
          onClick={() => onSelectMode(card.mode)}
          className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-400 hover:shadow"
        >
          <span className="text-sm font-semibold text-slate-900">{card.title}</span>
          <span className="text-xs text-slate-500">{card.description}</span>
        </button>
      ))}
    </div>
  );
}
